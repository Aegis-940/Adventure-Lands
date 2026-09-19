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
// CHEST CHOICE — the coat by default, dipping into the manasteal shirt for as long as it takes to refill the pool
// --------------------------------------------------------------------------------------------------------------------------------- //

var _mana_chest_engaged = false;

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

function widest_shot_crossover_mp() {
	const { lo, hi } = lambda_bounds();
	if (hi <= lo) return 0;

	const cheapest = lo / (CONFIG.combat.lambda_headroom_low || 1);
	const usable = Math.min(1, Math.max(0, (hi - cheapest) / (hi - lo)));
	const reserve = panic_mp_reserve();

	return reserve + usable * (character.max_mp - reserve);
}

function mana_chest_band() {
	const crossover = widest_shot_crossover_mp();
	const chasing = crossover <= character.max_mp * (CONFIG.equipment.chest_mana_max_engage_pct || 1);
	const engage = chasing ? crossover : character.max_mp * (CONFIG.equipment.chest_mana_floor_pct || 0);
	const slack = character.max_mp * (CONFIG.equipment.chest_mana_slack_pct || 0);

	return { crossover, chasing, engage, release: Math.min(character.max_mp, engage + slack) };
}

function mana_chest_shot() {
	const pool = cache.targets.in_range;
	if (!pool.length) return null;

	const shot = desired_shot(pool);
	return shot_mana(shot) > character.mp_cost ? shot : null;
}

function mana_chest_wanted() {
	if (panicking || !mana_chest_shot()) {
		_mana_chest_engaged = false;
		return false;
	}

	const band = mana_chest_band();
	if (_mana_chest_engaged) {
		if (character.mp >= band.release) _mana_chest_engaged = false;
	} else if (character.mp < band.engage) {
		_mana_chest_engaged = true;
	}

	return _mana_chest_engaged;
}

function resolve_ranger_chest() {
	if (CONFIG.equipment.chest_swap_enabled === false) return null;

	const override = gear_override("chest");
	if (override) return override;

	const sets = CONFIG.equipment.chest_sets || {};
	if (sets.mana && mana_chest_wanted() && set_available(sets.mana)) return sets.mana;
	return sets.dps && set_available(sets.dps) ? sets.dps : null;
}

function chest_report() {
	const sets = CONFIG.equipment.chest_sets || {};
	const pool = cache.targets.in_range || [];
	const shot = mana_chest_shot();
	const band = mana_chest_band();

	game_log(`[CHEST] ${pool.length} in range, want ${pool.length ? desired_shot(pool).name : "nothing"}`
		+ `${shot ? "" : " (no mana pressure)"}, mp ${Math.round(character.mp)}/${character.max_mp}`, "#66ccff");
	game_log(`[CHEST] widest-shot crossover ${Math.round(band.crossover)} `
		+ `(${Math.round(100 * band.crossover / character.max_mp)}% of pool) — `
		+ `${band.chasing ? "chasing it" : "out of reach, holding the starvation floor"}`, "#66ccff");
	game_log(`[CHEST] engage below ${Math.round(band.engage)}, release above ${Math.round(band.release)} `
		+ `— ${_mana_chest_engaged ? "engaged" : "idle"}`, "#66ccff");
	game_log(`[CHEST] wearing ${is_set_equipped(sets.mana) ? sets.mana : is_set_equipped(sets.dps) ? sets.dps : "neither"}, `
		+ `steal ${character.manasteal || 0}%`, "#66ccff");
}

var EQUIPMENT_RULES = {
	weapon: { kind: "set", resolve: resolve_ranger_weapon },
	chest:  { kind: "set", resolve: resolve_ranger_chest },
	orb:    { kind: "set", resolve: resolve_ranger_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { weapon: "single" },
};
