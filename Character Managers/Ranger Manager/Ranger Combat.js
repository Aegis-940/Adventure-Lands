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

	if (dungeon_flag("aggroed_only")) return aggroed;

	if (dungeon_target_whitelist()) return true;

	return CONFIG.combat.target_priority.includes(mob.target);
}

function update_cache() {
	if (cache.is_valid()) return;
	const now = performance.now();
	sample_set_profiles(CONFIG.equipment.weapon_sets);
	cache.targets = update_target_cache();
	cache.heal_target = find_cupid_target();
	cache.last_update = now;
}

function update_target_cache() {
	const pool = monsters_matching({ where: should_attack_mob });

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

	const engage_radius = dungeon_setting("engage_radius", null);
	const within_range = engage_radius
		? mob => is_in_range(mob) && parent.distance(character, mob) <= engage_radius
		: mob => is_in_range(mob);

	const in_range = dungeon_sort_targets(sorted_by_value.filter(within_range));

	return { sorted_by_value, in_range };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MANA / DAMAGE EFFICIENCY
// --------------------------------------------------------------------------------------------------------------------------------- //

var SHOT_PROFILES = [
	{ name: "attack", count: 1, multiplier: 1.0 },
	{ name: "3shot", count: 3, multiplier: 0.7 },
	{ name: "5shot", count: 5, multiplier: 0.5 },
	{ name: "piercingshot", count: 1, multiplier: 0.75, single: true, pierces: true },
];

function shot_mana(profile) {
	return profile.name === "attack" ? character.mp_cost : (G.skills[profile.name]?.mp || 0);
}

function shot_usable(profile) {
	return character.level >= (G.skills[profile.name]?.level || 0);
}

function shot_apiercing(profile) {
	const base = character.apiercing || 0;
	if (!profile.pierces) return base;
	return base + (G.skills[profile.name]?.apiercing || 0);
}

function armour_factor(mob, apiercing) {
	return defense_reduction((mob.armor || 0) - apiercing);
}

function burn_multiplier(mob, skill_multiplier) {
	if (!CONFIG.combat.burn_enabled) return 1;
	if (would_kill(mob, skill_multiplier)) return 1;

	const dps = (character.attack || 0) * (character.frequency || 1);
	return burn_multiplier_at_dps(mob, worn_ability_chance("burn"), dps, CONFIG.combat.party_dps_factor, { hp: mob.hp });
}

function target_modifier(mob, skill_multiplier, apiercing) {
	const pierce = apiercing === undefined ? (character.apiercing || 0) : apiercing;
	const explosion = character.explosion || 0;
	if (explosion > 0) {
		const hit = (character.attack || 0) * skill_multiplier * armour_factor(mob, pierce);
		return 1 + splash_bonus(mob, explosion, hit);
	}
	return burn_multiplier(mob, skill_multiplier);
}

function model_prediction() {
	const target = cache.targets && cache.targets.in_range && cache.targets.in_range[0];
	if (!target) return null;

	const explosion = character.explosion || 0;

	return {
		splash: explosion > 0 ? splash_bonus(target, explosion, 0) : 0,
		burn: burn_multiplier(target, 1)
	};
}

function lambda_bounds() {
	const ladder = SHOT_PROFILES.filter(p => !p.pierces).sort((a, b) => shot_mana(a) - shot_mana(b));

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

function score_option(mobs, profile, mana, lambda, reference) {
	const hits = Math.min(profile.count, mobs.length);
	if (!hits) return null;

	const apiercing = shot_apiercing(profile);
	let damage = 0;
	for (let i = 0; i < hits; i++) {
		damage += target_modifier(mobs[i], profile.multiplier, apiercing) * armour_factor(mobs[i], apiercing);
	}
	damage *= profile.multiplier / reference;

	return { damage, mana, hits, score: damage - lambda * mana };
}

function choose_attack_option(primary) {
	const lambda = mana_price();
	if (!primary.length) return null;

	const base_apiercing = character.apiercing || 0;
	const reference = (target_modifier(primary[0], 1, base_apiercing) * armour_factor(primary[0], base_apiercing)) || 1;
	const options = [];

	for (const profile of SHOT_PROFILES) {
		if (!shot_usable(profile)) continue;
		const scored = score_option(primary, profile, shot_mana(profile), lambda, reference);
		if (scored) options.push({ name: profile.name, single: !!profile.single, targets: primary.slice(0, scored.hits), ...scored });
	}

	const affordable = options.filter(o => character.mp >= o.mana + panic_mp_reserve());
	if (affordable.length) return affordable.reduce((best, o) => (o.score > best.score ? o : best));

	if (character.mp >= Math.max(100, panic_mp_reserve())) {
		return options.find(o => o.name === "attack") || null;
	}
	return null;
}

var _cupid_engaged = false;
var _cupid_dip_since = 0;

function cupid_blocked() {
	if (!set_available("heal")) return true;
	const at_home = typeof destination !== "undefined" && destination && character.map === destination.map;
	const overrides = (at_home && typeof MONSTER_GEAR_OVERRIDES !== "undefined" && MONSTER_GEAR_OVERRIDES[home]) || {};
	return "weapon" in overrides;
}

function find_cupid_target() {
	if (cupid_blocked()) {
		_cupid_engaged = false;
		_cupid_dip_since = 0;
		return null;
	}

	const healer = get_entity("Myras");
	const engage = (!healer || healer.rip)
		? CONFIG.combat.cupid_engage_pct_no_healer
		: CONFIG.combat.cupid_engage_pct;
	const release = Math.min(1, engage + CONFIG.combat.cupid_release_margin);
	const party = Object.keys(get_party() || {});

	let target = null, min_pct = 1;

	for (const name of party) {
		if (name === character.name) continue;
		const ally = get_player(name);
		if (ally?.hp && ally?.max_hp && !ally.rip && is_in_range(ally)) {
			const pct = ally.hp / ally.max_hp;
			if (pct < min_pct) { min_pct = pct; target = ally; }
		}
	}

	if (_cupid_engaged) {
		_cupid_engaged = min_pct < release;
		if (!_cupid_engaged) _cupid_dip_since = 0;
		return _cupid_engaged ? target : null;
	}

	const now = Date.now();
	if (min_pct >= engage) {
		_cupid_dip_since = 0;
		return null;
	}

	if (!_cupid_dip_since) _cupid_dip_since = now;
	if (now - _cupid_dip_since < CONFIG.combat.cupid_arm_ms) return null;

	_cupid_engaged = true;
	return target;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function cupid_heal(target) {
	try {
		await attack(target);
	} catch (e) {
		if (e && e.reason === "no_pvp") {
			if (typeof errlog_count === "function") errlog_count("cupid heal raced the bow swap");
			return;
		}
		throw e;
	}
}

async function action_loop() {
	loop_tick("action_loop");
	if (should_pause_combat_loop()) return setTimeout(action_loop, loop_next("action_loop", 100));
	let next_delay = 5;
	try {
		if (is_disabled(character)) return setTimeout(action_loop, loop_next("action_loop", 50));

		update_cache();
		const ms = ms_to_next_skill("attack");

		const cupid_live = mainhand_intent() === "cupid";
		const cupid_worn = character.slots.mainhand?.name === "cupid";
		const want_heal = !!cache.heal_target;

		if (ms === 0 && !travel_blocks_combat() && !basic_action_busy()) {
			if (want_heal && cupid_worn) run_basic_action(cupid_heal(cache.heal_target), "cupid");
			else if (!want_heal && !cupid_live) handle_attack();
			else next_delay = next_action_delay(ms);
		} else {
			next_delay = next_action_delay(ms);
		}
	} catch (e) {
		catcher(e, "action_loop");
		next_delay = TICK_RATE.retry;
	}
	setTimeout(action_loop, loop_next("action_loop", next_delay));
}

function handle_attack() {
	const { sorted_by_value, in_range } = cache.targets;
	if (!sorted_by_value.length) return;

	const single_target_mode = dungeon_flag("single_target");

	if (single_target_mode) {
		if (character.mp < Math.max(100, panic_mp_reserve())) return;
		const forced = dungeon_focus_target();
		if (forced) {
			if (!is_in_range(forced)) return;
			return run_basic_action(attack(forced), "attack");
		}
		if (!in_range.length) return;
		return run_basic_action(attack(in_range[0]), "attack");
	}

	const choice = choose_attack_option(in_range);
	if (!choice) return;

	if (choice.name === "attack") return run_basic_action(attack(choice.targets[0]), "attack");
	if (choice.single) return run_basic_action(use_skill(choice.name, choice.targets[0]), choice.name);
	return run_basic_action(use_skill(choice.name, choice.targets.map(e => e.id)), choice.name);
}

