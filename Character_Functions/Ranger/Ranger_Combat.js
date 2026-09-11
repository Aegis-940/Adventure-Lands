// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER COMBAT — what is worth shooting, the target cache, and the action loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_attack_mob(mob) {
	if (!mob || mob.dead) return false;

	if (is_monster_claimed(mob.id)) return false;

	if (CONFIG.combat.never_attack.includes(mob.mtype)) return false;

	if (CONFIG.combat.attack_if_targeted.includes(mob.mtype)) {
		return true;
	}

	const aggroed = !CONFIG.combat.engage_aggroed_only || !!mob.target;

	if (CONFIG.combat.always_attack.includes(mob.mtype)) return aggroed;

	if (parent?.S?.[mob.mtype]?.live) return true;

	if (RANGER_TARGET === "giantspider") return aggroed;

	return CONFIG.combat.target_priority.includes(mob.target);
}

function update_cache() {
	if (cache.is_valid()) return;
	const now = performance.now();
	cache.targets = update_target_cache();
	cache.heal_target = find_heal_target();
	cache.last_update = now;
}

function update_target_cache() {
	const sorted_by_hp = [];

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && should_attack_mob(e)) {
			sorted_by_hp.push(e);
		}
	}

	sorted_by_hp.sort((a, b) => {
		const a_boss = CONFIG.combat.attack_if_targeted.includes(a.mtype);
		const b_boss = CONFIG.combat.attack_if_targeted.includes(b.mtype);
		if (a_boss !== b_boss) return b_boss - a_boss;

		const a_priority = CONFIG.combat.always_attack.includes(a.mtype);
		const b_priority = CONFIG.combat.always_attack.includes(b.mtype);
		if (a_priority !== b_priority) return b_priority - a_priority;

		return b.hp - a.hp;
	});

	const in_range = [], out_of_range = [];

	const within_range = RANGER_TARGET === "giantspider"
		? mob => is_in_range(mob) && parent.distance(character, mob) <= 50
		: mob => is_in_range(mob);

	for (const mob of sorted_by_hp) {
		if (within_range(mob)) in_range.push(mob);
		else out_of_range.push(mob);
	}

	if (RANGER_TARGET === "giantspider") {
		in_range.sort((a, b) => parent.distance(character, a) - parent.distance(character, b));
	}

	const scored = score_by_explosion_spread(in_range, true);
	const cluster_targets = scored.map(s => s.mob);
	const cluster_target = scored[0]?.count >= 3 ? scored[0].mob : null;

	return { sorted_by_hp, in_range, out_of_range, cluster_targets, cluster_target };
}

function find_heal_target() {
	const healer = get_entity("Myras");
	const threshold = (!healer || healer.rip) ? 0.9 : 0.66;
	const party = Object.keys(get_party() || {});

	let target = null, min_pct = 1;

	for (const name of party) {
		if (name === character.name) continue;
		const ally = get_player(name);
		if (ally?.hp && ally?.max_hp && !ally.rip) {
			const pct = ally.hp / ally.max_hp;
			if (pct < min_pct) { min_pct = pct; target = ally; }
		}
	}

	return min_pct < threshold ? target : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function action_loop() {
	if (should_pause_combat_loop()) return setTimeout(action_loop, 100);
	let delay = 5;
	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();
		const ms = ms_to_next_skill("attack");

		const cupid_on = character.slots?.mainhand?.name === "cupid";
		const healing = !!cache.heal_target && (cupid_on || set_available("heal"));

		if (ms === 0 && !is_travelling()) {
			if (healing && cupid_on) await attack(cache.heal_target);
			else if (!healing && !cupid_on) await handle_attack();
		} else {
			delay = next_action_delay(ms);
		}
	} catch (e) {
		catcher(e, "action_loop");
		delay = 10;
	}
	setTimeout(action_loop, delay);
}

async function handle_attack() {
	const { sorted_by_hp, in_range, out_of_range, cluster_targets, cluster_target } = cache.targets;
	if (!sorted_by_hp.length) return;

	const min5 = CONFIG.combat.min_targets_for_5shot;
	const min3 = CONFIG.combat.min_targets_for_3shot;
	const mp5 = (G.skills["5shot"]?.mp + 400);
	const mp3 = (G.skills["3shot"]?.mp + 200);
	const mp1 = Math.max(100, panic_mp_reserve());
	const can_5shot = character.mp >= mp5;
	const can_3shot = character.mp >= mp3;
	const can_1shot = character.mp >= mp1;

	const single_target_mode = RANGER_TARGET === "giantspider";
	let skill_call;
	let chosen = [];
	let skill_name = null;
	if (!single_target_mode && can_5shot && in_range.length >= min5)           { chosen = cluster_targets.slice(0, 5); skill_name = "5shot"; skill_call = () => use_skill("5shot", chosen.map(e => e.id)); }
	else if (!single_target_mode && can_5shot && out_of_range.length >= min5)  { chosen = out_of_range.slice(0, 5); skill_name = "5shot"; skill_call = () => use_skill("5shot", chosen.map(e => e.id)); }
	else if (!single_target_mode && can_3shot && in_range.length >= min3)      { chosen = cluster_targets.slice(0, 3); skill_name = "3shot"; skill_call = () => use_skill("3shot", chosen.map(e => e.id)); }
	else if (can_1shot && cluster_target)               { chosen = [cluster_target]; skill_call = () => attack(cluster_target); }
	else if (can_1shot && in_range.length >= 1)         { chosen = [single_target_mode ? in_range[0] : (cluster_targets[0] || in_range[0])]; skill_call = () => attack(chosen[0]); }
	else return;

	const killable = chosen.filter(e => can_kill_in_one_shot(e, skill_name));
	if (killable.length) claim_monsters(killable);

	if (!skill_name) fire_attack_burst(chosen[0]);

	note_attack_sent();
	await skill_call();
}

function fire_attack_burst(target) {
	const extra = CONFIG.combat.burst_attacks || 0;
	if (extra <= 0 || !target) return;
	if (character.cc >= (CONFIG.combat.burst_max_cc || 60)) return;

	let remaining = extra;
	const burst = setInterval(() => {
		if (remaining <= 0 || character.rip || target.dead) {
			clearInterval(burst);
			return;
		}
		remaining--;
		note_burst_sent();
		Promise.resolve(attack(target)).then(note_burst_landed, () => { });
	}, 1);
}
