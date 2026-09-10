// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function resolve_ranger_weapon() {
	const { in_range, out_of_range } = cache.targets;
	const min5 = CONFIG.combat.min_targets_for_5shot;
	const min3 = CONFIG.combat.min_targets_for_3shot;
	const can_5shot = character.mp >= (G.skills["5shot"]?.mp + 400);
	const can_3shot = character.mp >= (G.skills["3shot"]?.mp + 200);

	if (cache.heal_target) return "heal";
	if (RANGER_TARGET === "giantspider") return "single";
	if (can_5shot && (in_range.length >= min5 || out_of_range.length >= min5)) return "boom";
	if (can_3shot && in_range.length >= min3) return "boom";
	if (cache.targets.cluster_target) return "boom";
	return "single";
}

function resolve_ranger_loadout() {
	if (!CONFIG.equipment.boss_set_swap_enabled) return null;
	if (character.slots?.mainhand?.name === "cupid") return null;

	const active_boss = find_active_boss();
	if (active_boss) {
		return active_boss.data.hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name] ? "dps" : "luck";
	}
	return character.map === destination.map ? "dps" : null;
}

function resolve_ranger_orb() {
	return set_available("orb") ? "orb" : null;
}

var EQUIPMENT_RULES = {
	weapon:  { kind: "set", resolve: resolve_ranger_weapon },
	loadout: { kind: "set", resolve: resolve_ranger_loadout },
	orb:     { kind: "set", resolve: resolve_ranger_orb },
};

var MONSTER_GEAR_OVERRIDES = {};
