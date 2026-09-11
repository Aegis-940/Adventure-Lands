// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function pouchbow_explosion() {
	const boom = get_set_profile("boom");
	return (boom && boom.explosion) || CONFIG.combat.pouchbow_explosion;
}

function bow_values(mob) {
	const single = get_set_profile("single");
	const boom = get_set_profile("boom");
	if (!single || !boom || !boom.attack || !boom.explosion) return null;

	const single_dps = (single.attack || 0) * (single.frequency || 1);
	const burn_mult = burn_multiplier_at_dps(
		mob, set_ability_chance("single", "burn"), single_dps, CONFIG.combat.party_dps_factor
	);

	return {
		single: single_dps * burn_mult,
		boom: (boom.attack || 0) * (boom.frequency || 1) * (1 + splash_bonus(mob, boom.explosion)),
	};
}

function resolve_ranger_weapon() {
	if (cache.heal_target) return "heal";
	if (RANGER_TARGET === "giantspider") return "single";
	if (!CONFIG.combat.pouchbow_enabled) return "single";

	const { scored, in_range } = cache.targets;
	if (!in_range.length) return "single";

	const best = scored && scored[0];
	if (!best) return "single";

	const values = bow_values(best.mob);
	if (!values) return best.count >= CONFIG.combat.pouchbow_min_neighbours ? "boom" : "single";

	const choice = values.boom > values.single ? "boom" : "single";
	if (CONFIG.combat.log_bow_choice) log_bow_choice(choice, best, values);
	return choice;
}

var _logged_bow = null;

function log_bow_choice(choice, best, values) {
	if (choice === _logged_bow) return;
	_logged_bow = choice;

	const boom = get_set_profile("boom");
	const single = get_set_profile("single");
	const dps = (single.attack || 0) * (single.frequency || 1);
	const ttk = time_to_kill_ms(best.mob, best.mob.max_hp, dps, CONFIG.combat.party_dps_factor);

	log(`[BOW] ${choice} ${best.mob.mtype} k=${best.count} `
		+ `splash=${splash_bonus(best.mob, boom.explosion).toFixed(2)} `
		+ `burn=${(values.single / dps).toFixed(3)} ttk=${(ttk / 1000).toFixed(1)}s `
		+ `boom=${values.boom.toFixed(0)} single=${values.single.toFixed(0)}`, "#66ccff");
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
