// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

var _weapon_choice = make_weapon_choice();

// --------------------------------------------------------------------------------------------------------------------------------- //
// WEAPON SET VALUE — damage per second each set would actually deliver right now
// --------------------------------------------------------------------------------------------------------------------------------- //

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

function expected_splash_bonus(explosion, attack) {
	const pool = attackable_monsters();
	const mobs = pool.length ? pool : (cache.monsters_in_cleave_range || []);

	let best = 0;
	for (const mob of mobs) {
		const bonus = splash_bonus(mob, explosion, hit_against(mob, attack));
		if (bonus > best) best = bonus;
	}
	return best;
}

function smoothed_splash_bonus(explosion, attack) {
	const sample = expected_splash_bonus(explosion, attack);
	const now = Date.now();
	const ewma = _splash_ewma[explosion];

	if (!ewma) {
		_splash_ewma[explosion] = { value: sample, at: now };
		return sample;
	}
	if (now - ewma.at >= SPLASH_STEP_MS) {
		ewma.value += (sample - ewma.value) * SPLASH_SMOOTHING;
		ewma.at = now;
	}
	return ewma.value;
}

function model_prediction() {
	const target = cache.target;
	if (!target) return null;

	const explosion = character.explosion || 0;
	const raw_dps = (character.attack || 0) * (character.frequency || 1);

	return {
		splash: explosion > 0 ? expected_splash_bonus(explosion, 0) : 0,
		burn: burn_multiplier_at_dps(
			target, worn_ability_chance("burn"), raw_dps,
			CONFIG.combat.party_dps_factor, { hp: target.hp }
		)
	};
}

function warrior_set_base_value(set_name, primary) {
	const profile = get_set_profile(set_name);
	if (!profile || !profile.attack) return null;

	const dps = set_dps(profile);

	const chance = set_ability_chance(set_name, "burn");
	const burn = chance
		? burn_multiplier_at_dps(primary, chance, dps, CONFIG.combat.party_dps_factor, { frequency: profile.frequency })
		: 1;

	const splash = profile.explosion > 0
		? smoothed_splash_bonus(profile.explosion, profile.attack)
		: 0;

	return dps * (burn + splash);
}

function warrior_set_value(set_name, primary, cleave_targets) {
	const base = warrior_set_base_value(set_name, primary);
	if (base === null) return null;

	return base * cleave_contribution(set_name, cleave_targets).uptime;
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

function warrior_weapon_set() {
	const primary = cache.target;
	const cleave_targets = (cache.monsters_in_cleave_range || []).length;

	const chosen = CONFIG.equipment.weapon_selection === "value"
		? resolve_weapon_by_value(_weapon_choice, name => warrior_set_value(name, primary, cleave_targets), {
			on_change: (from, to, now) => sample_weapon_choice(from, to, primary, cleave_targets, now)
		})
		: null;
	if (chosen) return chosen;

	const home_count = mob_count();
	if (home_count === 1) return "single";
	if (home_count > 1) return "aoe";
	if (CONFIG.equipment.aoe_maps.includes(character.map)) return "aoe";
	if (CONFIG.equipment.single_target_maps.includes(character.map)) return "single";
	return null;
}

function resolve_warrior_orb() {
	return preferred_orb("orb_dps");
}

function resolve_warrior_weapon() {
	if (character.map !== destination.map) return null;
	if (!CONFIG.equipment.weapon_swap_enabled) return null;
	if (dungeon_flag("warrior_single_weapon")) return "single";
	return warrior_weapon_set();
}

var EQUIPMENT_RULES = {
	weapon: { kind: "set", resolve: resolve_warrior_weapon },
	orb:    { kind: "set", resolve: resolve_warrior_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { weapon: "single" },
};
