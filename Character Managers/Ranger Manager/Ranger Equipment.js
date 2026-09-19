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
var _mana_chest_worn_since = 0;

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

function shot_rung_crossover_mp(rate) {
	const { lo, hi } = lambda_bounds();
	if (hi <= lo) return 0;

	const usable = Math.min(1, Math.max(0, (hi - rate) / (hi - lo)));
	const reserve = panic_mp_reserve();

	return reserve + usable * (character.max_mp - reserve);
}

function mana_chest_band() {
	if (CONFIG.combat.mana_is_free) {
		const pool = cache.targets.in_range || [];
		const option = pool.length ? choose_attack_option(pool) : null;
		const engage = combat_mana_reserve() + (option ? option.mana : 0);
		const wanted = character.max_mp * (CONFIG.equipment.chest_release_pct ?? 0.90);

		return {
			free: true, chasing: false, crossover: 0, floor: engage,
			engage, release: Math.min(character.max_mp, Math.max(wanted, engage + 1))
		};
	}

	const { lo, hi } = lambda_bounds();
	const crossover = shot_rung_crossover_mp(lo / (CONFIG.combat.lambda_headroom_low || 1));
	const floor = shot_rung_crossover_mp(hi / (CONFIG.combat.lambda_headroom_high || 1));

	const chasing = crossover <= character.max_mp * (CONFIG.equipment.chest_mana_max_engage_pct ?? 0.75);
	const engage = chasing ? crossover : floor;

	const pool = cache.targets.in_range || [];
	const picked = pool.length ? choose_attack_option(pool) : null;
	const buffer = picked ? picked.mana * (CONFIG.equipment.chest_refill_shots ?? 3) : 0;
	const target = buffer ? Math.min(crossover, engage + buffer) : crossover;
	const release = Math.min(character.max_mp, chasing ? character.max_mp : target);

	return { crossover, floor, chasing, engage, release };
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

	const sets = CONFIG.equipment.chest_sets || {};
	const band = mana_chest_band();

	if (_mana_chest_engaged) {
		if (!_mana_chest_worn_since && sets.mana && is_set_equipped(sets.mana)) _mana_chest_worn_since = Date.now();
		const worn_ms = _mana_chest_worn_since ? Date.now() - _mana_chest_worn_since : 0;
		if (character.mp >= band.release && worn_ms >= (CONFIG.equipment.chest_min_hold_ms ?? 2000)) {
			_mana_chest_engaged = false;
		}
	} else if (character.mp < band.engage) {
		_mana_chest_engaged = true;
		_mana_chest_worn_since = 0;
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

	const widest = pool.length ? desired_shot(pool) : null;
	const picked = pool.length ? choose_attack_option(pool) : null;
	const { lo, hi } = lambda_bounds();

	game_log(`[CHEST] ${pool.length} in range, mp ${Math.round(character.mp)}/${character.max_mp}`
		+ `${shot ? "" : " (no mana pressure)"}`, "#66ccff");
	game_log(`[CHEST] scorer fires ${picked ? picked.name : "nothing"}, widest would be ${widest ? widest.name : "nothing"}`
		+ `${picked && widest && picked.name === widest.name ? " — agree" : " — priced down"}, `
		+ `lambda ${mana_price().toFixed(4)} in ${lo.toFixed(4)}-${hi.toFixed(4)}`, "#66ccff");

	if (widest) {
		const hits = Math.min(widest.count, pool.length);
		const apiercing = shot_apiercing(widest);
		const gross = shot_mana(widest);
		const per_point = shot_stealable_damage(pool, widest, hits, apiercing) / 100;
		const rebate = manasteal_rebate(pool, widest, hits, apiercing);
		game_log(`[CHEST] ${widest.name} costs ${Math.round(gross)} mp over ${hits} hits — `
			+ `each 1% manasteal returns ${Math.round(per_point)} mp, worn now ${Math.round(rebate)}`, "#66ccff");
	}
	if (band.free) {
		game_log(`[CHEST] free-mana mode — floor ${Math.round(band.engage)} `
			+ `(reserve ${combat_mana_reserve()} plus one shot), biggest affordable shot wins`, "#66ccff");
	} else {
		game_log(`[CHEST] widest-shot crossover ${Math.round(band.crossover)} `
			+ `(${Math.round(100 * band.crossover / character.max_mp)}%), next rung ${Math.round(band.floor)} `
			+ `(${Math.round(100 * band.floor / character.max_mp)}%) — `
			+ `${band.chasing ? "chasing the widest" : "widest out of reach, defending the next rung"}`, "#66ccff");
	}
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
