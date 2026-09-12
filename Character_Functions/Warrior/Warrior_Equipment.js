// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

var _weapon_choice = { name: null, at: 0 };

// --------------------------------------------------------------------------------------------------------------------------------- //
// WEAPON SET VALUE — damage per second each set would actually deliver right now
// --------------------------------------------------------------------------------------------------------------------------------- //

function set_dps(profile) {
	return (profile.attack || 0) * (profile.frequency || 1);
}

function cleave_period() {
	const cooldown = (G.skills.cleave.cooldown || 1200) / 1000;
	const spare = Math.max(0, CONFIG.equipment.mana_income_per_sec - character.mp_cost * (character.frequency || 1));
	const budget = spare * (1 - CONFIG.equipment.skill_mana_reserve);
	if (budget <= 0) return Infinity;
	return Math.max(cooldown, G.skills.cleave.mp / budget);
}

function cleave_contribution(set_name, targets) {
	const axe = get_set_profile("bataxe");
	if (!axe || !axe.attack || !targets) return { dps: 0, uptime: 1 };

	const period = cleave_period();
	if (!isFinite(period)) return { dps: 0, uptime: 1 };

	const dps = (0.5 * axe.attack * targets) / period;
	if (set_name === "bataxe") return { dps, uptime: 1 };

	const swap_s = (CONFIG.equipment.cleave_swap_ms || 480) / 1000;
	return { dps, uptime: Math.max(0, 1 - swap_s / period) };
}

var SPLASH_SMOOTHING = 0.08;
var SPLASH_STEP_MS = 250;
var _splash_ewma = {};

function attackable_monsters() {
	const reach = character.range;
	return (cache.monsters_in_cleave_range || []).filter(e =>
		e && !e.dead && distance(character, e) <= reach
	);
}

function expected_splash_bonus(explosion) {
	const pool = attackable_monsters();
	if (!pool.length) {
		const primary = cache.target;
		return primary ? splash_bonus(primary, explosion) : 0;
	}

	let total = 0;
	for (const mob of pool) total += splash_bonus(mob, explosion);
	return total / pool.length;
}

function smoothed_splash_bonus(explosion) {
	const sample = expected_splash_bonus(explosion);
	const now = Date.now();
	const state = _splash_ewma[explosion];

	if (!state) {
		_splash_ewma[explosion] = { value: sample, at: now };
		return sample;
	}
	if (now - state.at >= SPLASH_STEP_MS) {
		state.value += (sample - state.value) * SPLASH_SMOOTHING;
		state.at = now;
	}
	return state.value;
}

function warrior_set_base_value(set_name, primary) {
	const profile = get_set_profile(set_name);
	if (!profile || !profile.attack) return null;

	let value = set_dps(profile);

	const chance = set_ability_chance(set_name, "burn");
	if (chance) value *= burn_multiplier_at_dps(primary, chance, set_dps(profile), CONFIG.equipment.party_dps_factor, { frequency: profile.frequency });

	if (profile.explosion > 0) {
		value *= 1 + smoothed_splash_bonus(profile.explosion);
	}

	return value;
}

function warrior_set_value(set_name, primary, cleave_targets) {
	const base = warrior_set_base_value(set_name, primary);
	if (base === null) return null;

	const cleave = cleave_contribution(set_name, cleave_targets);
	return base * cleave.uptime + cleave.dps;
}

function sample_weapon_choice(from, to, primary, cleave_targets, now) {
	if (!CONFIG.combat.sample_hits || typeof errlog_sample !== "function") return;
	const values = {};
	for (const name of CONFIG.equipment.weapon_sets) {
		const value = set_available(name) ? warrior_set_value(name, primary, cleave_targets) : null;
		values[name] = value === null ? null : Math.round(value);
	}
	errlog_sample("weapon_choice", {
		from, to, values,
		held_ms: _weapon_choice.at ? now - _weapon_choice.at : 0,
		cleave_targets,
		cleave_period: +cleave_period().toFixed(2),
		mp_pct: +(character.mp / character.max_mp).toFixed(2),
		mob: primary ? primary.mtype : null
	});
}

var PROFILE_PROBE_MS = 20000;
var _profile_probe = {};

function unprofiled_weapon_set() {
	const now = Date.now();
	for (const name of CONFIG.equipment.weapon_sets) {
		if (!set_available(name) || get_set_profile(name)) {
			delete _profile_probe[name];
			continue;
		}
		if (!_profile_probe[name]) _profile_probe[name] = now;
		if (now - _profile_probe[name] <= PROFILE_PROBE_MS) return name;
	}
	return null;
}

function best_warrior_weapon_set() {
	const probe = unprofiled_weapon_set();
	if (probe) {
		if (_weapon_choice.name !== probe) _weapon_choice = { name: probe, at: Date.now() };
		return probe;
	}

	const primary = cache.target;
	const cleave_targets = (cache.monsters_in_cleave_range || []).length;

	let best = null;
	let best_value = -Infinity;
	for (const name of CONFIG.equipment.weapon_sets) {
		if (!set_available(name)) continue;
		const value = warrior_set_value(name, primary, cleave_targets);
		if (value === null || value <= best_value) continue;
		best_value = value;
		best = name;
	}
	if (!best) return null;

	const now = Date.now();
	if (_weapon_choice.name && _weapon_choice.name !== best) {
		if (now - _weapon_choice.at < CONFIG.equipment.weapon_hysteresis_ms) return _weapon_choice.name;
		const holding = warrior_set_value(_weapon_choice.name, primary, cleave_targets);
		if (holding !== null && best_value < holding * CONFIG.equipment.weapon_switch_margin) return _weapon_choice.name;
	}

	if (_weapon_choice.name !== best) {
		sample_weapon_choice(_weapon_choice.name, best, primary, cleave_targets, now);
		_weapon_choice = { name: best, at: now };
	}
	return best;
}

function resolve_warrior_booster() {
	const active_boss = find_active_boss();
	if (active_boss && active_boss.data.hp < CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
		return "luckbooster";
	}
	return "xpbooster";
}

function resolve_warrior_cape() {
	const chest_count = get_num_chests();
	const num_targets = cache.tank_entity ? get_num_targets(cache.tank_entity.name) : 0;
	return (chest_count >= CONFIG.equipment.chest_threshold && num_targets < 6) ? "stealth" : "cape";
}

function resolve_warrior_coat() {
	const active_boss = find_active_boss();
	const boss_blocks_coat = active_boss && active_boss.data.hp <= CONFIG.equipment.boss_hp_thresholds[active_boss.name];
	if (boss_blocks_coat) return null;

	if (character.mp > CONFIG.equipment.mp_thresholds.upper) return "stat";
	if (character.mp < CONFIG.equipment.mp_thresholds.lower) return "mana";
	return null;
}

function resolve_warrior_orb() {
	let preferred = "orb_dps";
	if (CONFIG.equipment.boss_set_swap_enabled) {
		const active_boss = find_active_boss();
		if (active_boss && active_boss.data.hp <= CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
			preferred = "orb_luck";
		}
	}
	if (set_available(preferred)) return preferred;
	if (set_available("orb")) return "orb";
	return null;
}

function resolve_warrior_loadout() {
	if (!CONFIG.equipment.boss_set_swap_enabled) return resolve_warrior_home_loadout();

	const active_boss = find_active_boss();
	const threshold = active_boss && CONFIG.equipment.boss_hp_thresholds[active_boss.name];

	if (active_boss && threshold !== undefined) {
		if (active_boss.data.hp > threshold) {
			return character.map !== destination.map ? "dps" : resolve_warrior_home_loadout();
		}
		if (set_available("luck")) return "luck";
	}

	return resolve_warrior_home_loadout();
}

function warrior_weapon_set() {
	if (CONFIG.equipment.weapon_selection === "value") {
		const chosen = best_warrior_weapon_set();
		if (chosen) return chosen;
	}

	const home_count = mob_count();
	if (home_count === 1) return "single";
	if (home_count > 1) return "aoe";
	if (CONFIG.equipment.aoe_maps.includes(character.map)) return "aoe";
	if (CONFIG.equipment.single_target_maps.includes(character.map)) return "single";
	return null;
}

function resolve_warrior_home_loadout() {
	if (character.map !== destination.map) return null;

	const sets = ["dps_accessories"];
	if (!CONFIG.equipment.weapon_swap_enabled) return sets;

	if (WARRIOR_TARGET === "giantspider") {
		sets.push("single");
		return sets;
	}

	const chosen = warrior_weapon_set();
	if (chosen) sets.push(chosen);
	return sets;
}

var EQUIPMENT_RULES = {
	booster: { kind: "booster", resolve: resolve_warrior_booster },
	cape:    { kind: "set", resolve: resolve_warrior_cape },
	coat:    { kind: "set", resolve: resolve_warrior_coat },
	loadout: { kind: "set", resolve: resolve_warrior_loadout },
	orb:     { kind: "set", resolve: resolve_warrior_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { loadout: ["dps_accessories", "single"] },
};
