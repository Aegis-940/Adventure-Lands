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
	return preferred_orb(null);
}

var EQUIPMENT_RULES = {
	weapon: { kind: "set", resolve: resolve_ranger_weapon },
	orb:    { kind: "set", resolve: resolve_ranger_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { weapon: "single" },
};
