// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER COMBAT — what is worth shooting, the target cache, and the action loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_attack_mob(mob) {
	if (!mob || mob.dead) return false;

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

	const radius = explosion_radius(CONFIG.combat.pouchbow_explosion);
	const scored = score_by_explosion_spread(in_range, true, radius);
	const cluster_targets = scored.map(s => s.mob);
	const cluster_target = scored[0]?.count >= 3 ? scored[0].mob : null;
	const best_neighbours = scored[0]?.count || 0;

	return { sorted_by_hp, in_range, out_of_range, cluster_targets, cluster_target, scored, best_neighbours };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MANA / DAMAGE EFFICIENCY — see the derivation in the ranger notes
// --------------------------------------------------------------------------------------------------------------------------------- //

function burn_multiplier(mob, skill_multiplier) {
	if (!CONFIG.combat.burn_enabled) return 1;
	if (would_kill(mob, skill_multiplier)) return 1;
	if (CONFIG.combat.attack_if_targeted.includes(mob.mtype)) return CONFIG.combat.burn_mult_boss;
	return CONFIG.combat.burn_mult_default;
}

function target_modifier(mob, skill_multiplier) {
	const explosion = character.explosion || 0;
	if (explosion > 0) return 1 + (explosion / 100) * count_neighbours(mob, explosion_radius(explosion), false);
	return burn_multiplier(mob, skill_multiplier);
}

function mana_price() {
	const reserve = panic_mp_reserve();
	const usable = Math.max(0, Math.min(1, (character.mp - reserve) / Math.max(1, character.max_mp - reserve)));
	const lo = CONFIG.combat.lambda_min;
	const hi = CONFIG.combat.lambda_max;
	return hi - (hi - lo) * usable;
}

function score_option(mobs, count, skill_multiplier, mana, lambda, reference) {
	if (mobs.length < count) return null;

	let damage = 0;
	for (let i = 0; i < count; i++) damage += target_modifier(mobs[i], skill_multiplier);
	damage *= skill_multiplier / reference;

	return { damage, mana, score: damage - lambda * mana };
}

function choose_attack_option(in_range, cluster_targets, out_of_range) {
	const lambda = mana_price();
	const primary = cluster_targets.length ? cluster_targets : in_range;
	if (!primary.length) return null;

	const reference = target_modifier(primary[0], 1) || 1;
	const options = [];

	const one = score_option(primary, 1, 1, character.mp_cost, lambda, reference);
	if (one) options.push({ name: "attack", targets: primary.slice(0, 1), ...one });

	const three = score_option(primary, 3, 0.7, G.skills["3shot"].mp, lambda, reference);
	if (three) options.push({ name: "3shot", targets: primary.slice(0, 3), ...three });

	const five_pool = primary.length >= 5 ? primary : primary.concat(out_of_range);
	const five = score_option(five_pool, 5, 0.5, G.skills["5shot"].mp, lambda, reference);
	if (five) options.push({ name: "5shot", targets: five_pool.slice(0, 5), ...five });

	const affordable = options.filter(o => character.mp >= o.mana + panic_mp_reserve());
	if (affordable.length) return affordable.reduce((best, o) => (o.score > best.score ? o : best));

	if (character.mp >= Math.max(100, panic_mp_reserve())) {
		return options.find(o => o.name === "attack") || null;
	}
	return null;
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

	const single_target_mode = RANGER_TARGET === "giantspider";

	if (single_target_mode) {
		if (character.mp < Math.max(100, panic_mp_reserve())) return;
		if (!in_range.length) return;
		return attack(in_range[0]);
	}

	const choice = choose_attack_option(in_range, cluster_targets, out_of_range);
	if (!choice) return;

	if (CONFIG.combat.log_efficiency) log_attack_choice(choice);

	if (choice.name === "attack") return attack(choice.targets[0]);
	return use_skill(choice.name, choice.targets.map(e => e.id));
}

var _last_efficiency_log = 0;

function log_attack_choice(choice) {
	const now = Date.now();
	if (now - _last_efficiency_log < CONFIG.combat.log_efficiency_ms) return;
	_last_efficiency_log = now;

	const k = choice.targets.map(t => count_neighbours(t, explosion_radius(CONFIG.combat.pouchbow_explosion), false));
	log(`[RANGER] ${choice.name} x${choice.targets.length} k=[${k}] `
		+ `dmg=${choice.damage.toFixed(2)} mana=${choice.mana} `
		+ `mp=${Math.round(character.mp)} lam=${mana_price().toFixed(4)} `
		+ `wep=${character.slots?.mainhand?.name}`, "#66ccff");
}
