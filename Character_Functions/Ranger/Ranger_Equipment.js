// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function pouchbow_explosion() {
	const boom = get_set_profile("boom");
	return (boom && boom.explosion) || CONFIG.combat.pouchbow_explosion;
}

function neighbours_to_beat_firebow(burn_mult) {
	const single = get_set_profile("single");
	const boom = get_set_profile("boom");
	if (!single || !boom || !boom.attack || !boom.explosion) return null;

	const ratio = (single.attack * burn_mult) / boom.attack;
	return Math.max(0, Math.ceil((ratio - 1) / (boom.explosion / 100)));
}

function resolve_ranger_weapon() {
	if (cache.heal_target) return "heal";
	if (RANGER_TARGET === "giantspider") return "single";
	if (!CONFIG.combat.pouchbow_enabled) return "single";

	const { scored, in_range } = cache.targets;
	if (!in_range.length) return "single";

	const best = scored && scored[0];
	if (!best) return "single";

	const single = get_set_profile("single");
	const single_dps = single ? (single.attack || 0) * (single.frequency || 1) : 0;
	const burn_mult = burn_multiplier_at_dps(
		best.mob, set_ability_chance("single", "burn"), single_dps, CONFIG.combat.party_dps_factor
	);

	const derived = neighbours_to_beat_firebow(burn_mult);
	const needed = derived === null
		? CONFIG.combat.pouchbow_min_neighbours
		: derived;

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
