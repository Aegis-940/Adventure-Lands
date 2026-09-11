// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

var _weapon_choice = { name: null, at: 0 };

function should_pause_equipment_resolve() {
	const mainhand = character.slots?.mainhand?.name;
	if (mainhand === "basher") return true;
	if (mainhand === "bataxe") return _weapon_choice.name !== "bataxe";
	return false;
}

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

function warrior_set_value(set_name, primary, cleave_targets) {
	const profile = get_set_profile(set_name);
	if (!profile || !profile.attack) return null;

	let value = set_dps(profile);

	const chance = set_ability_chance(set_name, "burn");
	if (chance) value *= burn_multiplier_at_dps(primary, chance, set_dps(profile), CONFIG.equipment.party_dps_factor);

	if (profile.explosion > 0 && primary) {
		value *= 1 + splash_bonus(primary, profile.explosion);
	}

	const cleave = cleave_contribution(set_name, cleave_targets);
	return value * cleave.uptime + cleave.dps;
}

function best_warrior_weapon_set() {
	const primary = cache.target || cache.cluster_target;
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

	if (_weapon_choice.name !== best) _weapon_choice = { name: best, at: now };
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
	if (active_boss) {
		const boss_hp = active_boss.data.hp;
		if (boss_hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
			return character.map !== destination.map ? "dps" : null;
		}
		return "luck";
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
