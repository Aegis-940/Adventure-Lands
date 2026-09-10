// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_pause_equipment_resolve() {
	const mainhand = character.slots?.mainhand?.name;
	return mainhand === "basher" || mainhand === "bataxe";
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

function resolve_warrior_home_loadout() {
	if (character.map !== destination.map) return null;

	const sets = ["dps_accessories"];
	if (CONFIG.equipment.weapon_swap_enabled) {
		const home_count = WARRIOR_TARGET === "giantspider" ? 1 : mob_count();
		if (home_count === 1) sets.push("single");
		else if (home_count > 1) sets.push("aoe");
		else if (CONFIG.equipment.aoe_maps.includes(character.map)) sets.push("aoe");
		else if (CONFIG.equipment.single_target_maps.includes(character.map)) sets.push("single");
	}
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
