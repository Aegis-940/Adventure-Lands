// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function resolve_ranger_weapon() {
	if (cache.heal_target) return "heal";
	if (RANGER_TARGET === "giantspider") return "single";
	if (!CONFIG.combat.pouchbow_enabled) return "single";

	const { scored, in_range } = cache.targets;
	if (!in_range.length) return "single";

	const best = scored && scored[0];
	if (!best) return "single";

	const needed = CONFIG.combat.attack_if_targeted.includes(best.mob.mtype)
		? CONFIG.combat.pouchbow_min_neighbours_boss
		: CONFIG.combat.pouchbow_min_neighbours;

	return best.count >= needed ? "boom" : "single";
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
