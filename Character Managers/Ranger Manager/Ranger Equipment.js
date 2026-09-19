// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function shot_width() {
	let widest = 1;
	for (const profile of SHOT_PROFILES) {
		if (profile.count <= widest) continue;
		if (character.mp < shot_mana(profile) + panic_mp_reserve()) continue;
		widest = profile.count;
	}
	return widest;
}

function weapon_choice_context(pool, width) {
	return () => ({
		width,
		in_range: pool.length,
		mob: pool[0] ? pool[0].mtype : null
	});
}

function resolve_ranger_weapon() {
	const override = gear_override("weapon");
	if (override) return override;

	const pool = cache.targets.in_range;
	const width = shot_width();
	return resolve_weapon_set({
		forced: cache.heal_target ? "heal" : null,
		pool,
		width,
		context: weapon_choice_context(pool, width)
	});
}

function resolve_ranger_orb() {
	if (panicking) return "panic";
	return gear_override("orb") || preferred_orb(null);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHEST CHOICE — the coat pays in damage, the manasteal shirt pays in shots the damage could not otherwise afford
// --------------------------------------------------------------------------------------------------------------------------------- //

var CHEST_STATS_KEY = "AL_chest_stats_";
var CHEST_STATS_REPROBE_MS = 600000;
var CHEST_STATS_SETTLE_MS = 600;
var CHEST_STATS_EPSILON = 0.02;

var _chest_choice = { worn: null, since: 0, probe: {}, probing: null, proposed: null };
var _chest_pending = {};
var _chest_stats = null;

function chest_sets() {
	return CONFIG.equipment.chest_sets || [];
}

function load_chest_stats() {
	if (_chest_stats) return _chest_stats;
	try {
		_chest_stats = JSON.parse(localStorage.getItem(CHEST_STATS_KEY + character.name)) || {};
	} catch (e) {
		_chest_stats = {};
	}
	return _chest_stats;
}

function chest_stats_key(set_name) {
	return `${set_name}@${equipped_set_among(CONFIG.equipment.weapon_sets) || "none"}`;
}

function live_chest_stats() {
	return {
		at: Date.now(),
		attack: character.attack || 0,
		frequency: character.frequency || 1,
		apiercing: character.apiercing || 0,
		manasteal: character.manasteal || 0,
		mp_regen: character.mp_regen || 0,
		mp_cost: character.mp_cost || 0
	};
}

function chest_stats(set_name) {
	return load_chest_stats()[chest_stats_key(set_name)] || null;
}

function chest_stats_stale(set_name) {
	const stored = chest_stats(set_name);
	if (!stored) return true;
	return Date.now() - (stored.at || 0) > CHEST_STATS_REPROBE_MS;
}

function chest_stats_current(set_name) {
	const stored = chest_stats(set_name);
	if (!stored || chest_stats_stale(set_name)) return false;
	return Math.abs((character.attack || 0) - stored.attack) <= Math.max(stored.attack, 1) * CHEST_STATS_EPSILON;
}

function sample_chest_stats() {
	for (const name of chest_sets()) {
		if (!is_set_equipped(name) || !profile_conditions_ok() || chest_stats_current(name)) {
			delete _chest_pending[name];
			continue;
		}

		const key = chest_stats_key(name);
		const pending = _chest_pending[name];
		if (!pending || pending.key !== key) {
			_chest_pending[name] = { key, at: Date.now() };
			continue;
		}
		if (Date.now() - pending.at < CHEST_STATS_SETTLE_MS) continue;

		const store = load_chest_stats();
		store[key] = live_chest_stats();
		delete _chest_pending[name];
		try {
			localStorage.setItem(CHEST_STATS_KEY + character.name, JSON.stringify(store));
		} catch (e) { }
	}
}

function desired_shot(pool) {
	let best = SHOT_PROFILES[0];
	let best_damage = 0;
	for (const profile of SHOT_PROFILES) {
		if (!shot_usable(profile)) continue;
		const damage = Math.min(profile.count, pool.length) * profile.multiplier;
		if (damage <= best_damage) continue;
		best_damage = damage;
		best = profile;
	}
	return best;
}

function shot_output(stats, shot, pool) {
	const hits = Math.min(shot.count, pool.length);
	if (!hits) return { direct: 0, effective: 0 };

	const piercing = (stats.apiercing || 0) + (shot.pierces ? (G.skills[shot.name]?.apiercing || 0) : 0);
	const per_hit = (stats.attack || 0) * shot.multiplier * (stats.frequency || 1);

	let direct = 0;
	let effective = 0;
	for (let i = 0; i < hits; i++) {
		const armour = armour_factor(pool[i], piercing);
		direct += armour;
		effective += target_modifier(pool[i], shot.multiplier, piercing) * armour;
	}

	return { direct: per_hit * direct, effective: per_hit * effective };
}

function stats_shot_mana(stats, shot) {
	return shot.name === "attack" ? (stats.mp_cost || 0) : (G.skills[shot.name]?.mp || 0);
}

function chest_mana_income(stats, output) {
	const regen = stats.mp_regen || CONFIG.combat.mp_regen_default || 0;
	return regen / (CONFIG.combat.mp_regen_period_s || 1) + (stats.manasteal || 0) / 100 * output.direct;
}

function chest_value(set_name, pool, shot) {
	const stats = chest_stats(set_name);
	if (!stats || !stats.attack || !pool.length) return null;

	const output = shot_output(stats, shot, pool);
	const basic = shot_output(stats, SHOT_PROFILES[0], pool);

	const spend = stats_shot_mana(stats, shot) * (stats.frequency || 1);
	const basic_spend = stats_shot_mana(stats, SHOT_PROFILES[0]) * (stats.frequency || 1);
	if (spend <= basic_spend) return output.effective;

	const income = chest_mana_income(stats, output);
	const deficit = Math.min(Math.max(0, spend - income), spend - basic_spend);

	return output.effective - deficit * (output.effective - basic.effective) / (spend - basic_spend);
}

function chest_choice_context(pool, shot) {
	return () => ({ shot: shot.name, in_range: pool.length });
}

function resolve_ranger_chest() {
	if (CONFIG.equipment.chest_swap_enabled === false) return null;

	const override = gear_override("chest");
	if (override) return override;

	const sets = chest_sets();
	if (!sets.length) return null;

	const pool = cache.targets.in_range;
	const shot = desired_shot(pool);

	const chosen = resolve_weapon_by_value(name => chest_value(name, pool, shot), chest_choice_context(pool, shot), {
		sets,
		choice: _chest_choice,
		label: "chest_choice",
		stale: chest_stats_stale,
		hysteresis_ms: CONFIG.equipment.chest_hysteresis_ms,
		margin: CONFIG.equipment.chest_switch_margin
	});

	return chosen || first_available_set(sets);
}

function chest_report() {
	const pool = cache.targets.in_range || [];
	const shot = desired_shot(pool);
	const weapon = equipped_set_among(CONFIG.equipment.weapon_sets) || "none";

	game_log(`[CHEST] ${pool.length} in range with ${weapon}, want ${shot.name}, `
		+ `mp ${Math.round(character.mp)}/${character.max_mp} regen ${character.mp_regen ?? "undefined"}`, "#66ccff");

	for (const name of chest_sets()) {
		const stats = chest_stats(name);
		if (!stats) {
			game_log(`[CHEST] ${name}: unmeasured with ${weapon}`, "#999999");
			continue;
		}

		const output = shot_output(stats, shot, pool);
		const spend = stats_shot_mana(stats, shot) * (stats.frequency || 1);
		const income = chest_mana_income(stats, output);
		const value = chest_value(name, pool, shot);

		game_log(`[CHEST] ${name}: ${Math.round(output.effective)} dps, `
			+ `${income.toFixed(1)} mp/s in vs ${spend.toFixed(1)} out, steal ${stats.manasteal || 0}% `
			+ `→ sustained ${value === null ? "?" : Math.round(value)}${is_set_equipped(name) ? " (worn)" : ""}`, "#66ccff");
	}
}

var EQUIPMENT_RULES = {
	weapon: { kind: "set", resolve: resolve_ranger_weapon },
	chest:  { kind: "set", resolve: resolve_ranger_chest },
	orb:    { kind: "set", resolve: resolve_ranger_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { weapon: "single" },
};
