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
	sample_set_profiles(["single", "boom"]);
	cache.targets = update_target_cache();
	cache.heal_target = find_heal_target();
	cache.last_update = now;
}

function update_target_cache() {
	const pool = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && should_attack_mob(e)) pool.push(e);
	}

	const context = {
		explosion: character.explosion || 0,
		party_factor: CONFIG.combat.party_dps_factor
	};

	const value = new Map();
	for (const mob of pool) value.set(mob, target_damage_value(mob, context));

	const sorted_by_value = pool.sort((a, b) => {
		const a_boss = CONFIG.combat.attack_if_targeted.includes(a.mtype);
		const b_boss = CONFIG.combat.attack_if_targeted.includes(b.mtype);
		if (a_boss !== b_boss) return b_boss - a_boss;

		const a_priority = CONFIG.combat.always_attack.includes(a.mtype);
		const b_priority = CONFIG.combat.always_attack.includes(b.mtype);
		if (a_priority !== b_priority) return b_priority - a_priority;

		return value.get(b) - value.get(a);
	});

	const within_range = RANGER_TARGET === "giantspider"
		? mob => is_in_range(mob) && parent.distance(character, mob) <= 50
		: mob => is_in_range(mob);

	const in_range = [], out_of_range = [];
	for (const mob of sorted_by_value) {
		if (within_range(mob)) in_range.push(mob);
		else out_of_range.push(mob);
	}

	if (RANGER_TARGET === "giantspider") {
		in_range.sort((a, b) => parent.distance(character, a) - parent.distance(character, b));
	}

	const radius = explosion_radius(pouchbow_explosion());
	const scored = in_range.map(mob => ({
		mob,
		count: count_neighbours(mob, radius, true),
		value: value.get(mob) || 0
	}));

	return {
		sorted_by_value,
		in_range,
		out_of_range,
		cluster_targets: in_range,
		cluster_target: in_range[0] || null,
		scored,
		best_neighbours: scored[0]?.count || 0
	};
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MANA / DAMAGE EFFICIENCY — see the derivation in the ranger notes
// --------------------------------------------------------------------------------------------------------------------------------- //

var SHOT_PROFILES = [
	{ name: "attack", count: 1, multiplier: 1.0 },
	{ name: "3shot", count: 3, multiplier: 0.7 },
	{ name: "5shot", count: 5, multiplier: 0.5, extend: true },
];

function shot_mana(profile) {
	return profile.name === "attack" ? character.mp_cost : (G.skills[profile.name]?.mp || 0);
}

function burn_multiplier(mob, skill_multiplier) {
	if (!CONFIG.combat.burn_enabled) return 1;
	if (would_kill(mob, skill_multiplier)) return 1;

	const dps = (character.attack || 0) * (character.frequency || 1);
	return burn_multiplier_at_dps(mob, worn_ability_chance("burn"), dps, CONFIG.combat.party_dps_factor);
}

function target_modifier(mob, skill_multiplier) {
	const explosion = character.explosion || 0;
	if (explosion > 0) return 1 + splash_bonus(mob, explosion);
	return burn_multiplier(mob, skill_multiplier);
}

function lambda_bounds() {
	const ladder = SHOT_PROFILES.slice().sort((a, b) => shot_mana(a) - shot_mana(b));

	let cheapest = Infinity;
	let dearest = 0;
	for (let i = 1; i < ladder.length; i++) {
		const extra_damage = ladder[i].count * ladder[i].multiplier - ladder[i - 1].count * ladder[i - 1].multiplier;
		const extra_mana = shot_mana(ladder[i]) - shot_mana(ladder[i - 1]);
		if (extra_mana <= 0 || extra_damage <= 0) continue;
		const rate = extra_damage / extra_mana;
		if (rate < cheapest) cheapest = rate;
		if (rate > dearest) dearest = rate;
	}

	if (!isFinite(cheapest) || dearest <= 0) return { lo: 0.002, hi: 0.012 };
	return {
		lo: cheapest * CONFIG.combat.lambda_headroom_low,
		hi: dearest * CONFIG.combat.lambda_headroom_high,
	};
}

function mana_price() {
	const reserve = panic_mp_reserve();
	const usable = Math.max(0, Math.min(1, (character.mp - reserve) / Math.max(1, character.max_mp - reserve)));
	const { lo, hi } = lambda_bounds();
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

	for (const profile of SHOT_PROFILES) {
		const pool = (profile.extend && primary.length < profile.count)
			? primary.concat(out_of_range)
			: primary;
		const scored = score_option(pool, profile.count, profile.multiplier, shot_mana(profile), lambda, reference);
		if (scored) options.push({ name: profile.name, targets: pool.slice(0, profile.count), ...scored });
	}

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
	const { sorted_by_value, in_range, out_of_range, cluster_targets, cluster_target } = cache.targets;
	if (!sorted_by_value.length) return;

	const single_target_mode = RANGER_TARGET === "giantspider";

	if (single_target_mode) {
		if (character.mp < Math.max(100, panic_mp_reserve())) return;
		if (!in_range.length) return;
		return attack(in_range[0]);
	}

	const choice = choose_attack_option(in_range, cluster_targets, out_of_range);
	if (!choice) return;

	if (choice.name === "attack") return attack(choice.targets[0]);
	return use_skill(choice.name, choice.targets.map(e => e.id));
}

