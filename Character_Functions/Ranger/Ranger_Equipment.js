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

function bow_values(pool) {
	const single = get_set_profile("single");
	const boom = get_set_profile("boom");
	if (!single || !boom || !boom.attack || !boom.explosion) return null;
	if (!pool || !pool.length) return null;

	const single_dps = set_dps(single);
	const boom_dps = set_dps(boom);
	const width = shot_width();

	const single_each = [];
	const boom_each = [];

	for (const mob of pool) {
		single_each.push(burn_multiplier_at_dps(
			mob, set_ability_chance("single", "burn"), single_dps,
			CONFIG.combat.party_dps_factor, { frequency: single.frequency, hp: mob.hp }
		));

		const hit = hit_against(mob, boom.attack);
		boom_each.push(1 + splash_bonus(mob, boom.explosion, hit));
	}

	return {
		single: single_dps * mean_of_best(single_each, width),
		boom: boom_dps * mean_of_best(boom_each, width),
		width
	};
}

function resolve_ranger_weapon() {
	if (cache.heal_target) return "heal";
	if (RANGER_TARGET === "giantspider") return "single";
	if (!CONFIG.combat.pouchbow_enabled) return "single";

	const { scored, in_range } = cache.targets;
	if (!in_range.length) return "single";

	const values = bow_values(in_range);
	if (!values) {
		const best = scored && scored[0];
		return best && best.count >= CONFIG.combat.pouchbow_min_neighbours ? "boom" : "single";
	}

	const choice = values.boom > values.single ? "boom" : "single";
	if (CONFIG.combat.sample_bow_choice) sample_bow_choice(choice, scored && scored[0], values);
	return choice;
}

var _last_bow_sample = 0;

function sample_bow_choice(choice, best, values) {
	if (typeof errlog_sample !== "function" || !best) return;
	if (Date.now() - _last_bow_sample < CONFIG.combat.sample_bow_ms) return;
	_last_bow_sample = Date.now();

	const boom = get_set_profile("boom");
	const single = get_set_profile("single");
	const dps = (single.attack || 0) * (single.frequency || 1);

	errlog_sample("bow", {
		pick: choice,
		width: values.width,
		mtype: best.mob.mtype,
		k: best.count,
		splash: +splash_bonus(best.mob, boom.explosion, (boom.attack || 0) * defense_reduction((best.mob.armor || 0) - (character.apiercing || 0))).toFixed(3),
		burn: +(values.single / dps).toFixed(3),
		ttk: Math.round(time_to_kill_ms(best.mob, best.mob.max_hp, dps, CONFIG.combat.party_dps_factor)),
		hp: best.mob.hp,
		max_hp: best.mob.max_hp,
		armor: best.mob.armor,
		boom: Math.round(values.boom),
		single: Math.round(values.single),
		mp: Math.round(character.mp)
	});
}

function resolve_ranger_loadout() {
	if (!CONFIG.equipment.boss_set_swap_enabled) return null;
	if (character.slots?.mainhand?.name === "cupid") return null;

	const phase = boss_gear_phase();
	if (phase) return phase === "fight" ? "dps" : "luck";

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
