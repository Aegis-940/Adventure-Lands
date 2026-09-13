// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function pouchbow_explosion() {
	const boom = get_set_profile("boom");
	return (boom && boom.explosion) || CONFIG.combat.pouchbow_explosion;
}

function shot_width() {
	let widest = 1;
	for (const profile of SHOT_PROFILES) {
		if (profile.count <= widest) continue;
		if (character.mp < shot_mana(profile) + panic_mp_reserve()) continue;
		widest = profile.count;
	}
	return widest;
}

function mean_of_best(values, count) {
	if (!values.length) return 0;
	const take = Math.min(count, values.length);
	values.sort((a, b) => b - a);

	let total = 0;
	for (let i = 0; i < take; i++) total += values[i];
	return total / take;
}

var _bow_choice = make_weapon_choice();

function ranger_set_value(set_name, pool) {
	const profile = get_set_profile(set_name);
	if (!profile || !profile.attack) return null;
	if (!pool || !pool.length) return null;

	const dps = set_dps(profile);
	const chance = set_ability_chance(set_name, "burn");

	const each = pool.map(mob => profile.explosion > 0
		? 1 + splash_bonus(mob, profile.explosion, hit_against(mob, profile.attack))
		: burn_multiplier_at_dps(mob, chance, dps, CONFIG.combat.party_dps_factor,
			{ frequency: profile.frequency, hp: mob.hp }));

	return dps * mean_of_best(each, shot_width());
}

function resolve_ranger_weapon() {
	if (cache.heal_target) return "heal";
	if (RANGER_TARGET === "giantspider") return "single";
	if (!CONFIG.combat.pouchbow_enabled) return "single";

	const { scored, in_range } = cache.targets;
	if (!in_range.length) return "single";

	const chosen = best_weapon_set(_bow_choice, CONFIG.equipment.weapon_sets,
		name => ranger_set_value(name, in_range),
		{
			hysteresis_ms: CONFIG.equipment.weapon_hysteresis_ms,
			margin: CONFIG.equipment.weapon_switch_margin
		});
	if (chosen) return chosen;

	const best = scored && scored[0];
	return best && best.count >= CONFIG.combat.pouchbow_min_neighbours ? "boom" : "single";
}

function resolve_ranger_loadout() {
	if (character.slots?.mainhand?.name === "cupid") return null;
	if (boss_engaged()) return "dps";

	return character.map === destination.map ? "dps" : null;
}

function resolve_ranger_orb() {
	return preferred_orb(null);
}

var EQUIPMENT_RULES = {
	weapon:  { kind: "set", resolve: resolve_ranger_weapon },
	loadout: { kind: "set", resolve: resolve_ranger_loadout },
	orb:     { kind: "set", resolve: resolve_ranger_orb },
};

var MONSTER_GEAR_OVERRIDES = {};
