// --------------------------------------------------------------------------------------------------------------------------------- //
// PORCUPINE GUARD — temporary, for the spawn next to the current camp
// Remove by deleting this file's line from the Bootstrapper; every call site is typeof-guarded and falls back to normal behaviour
// --------------------------------------------------------------------------------------------------------------------------------- //

const PORCUPINE_GUARD = {
	enabled: true,
	mtype: "porcupine",
	safe_weapon_set: "single",
	splash_margin: 40,
};

function porcupine_guard_on() {
	return PORCUPINE_GUARD.enabled;
}

function porcupine_guard_allows(mob) {
	return !porcupine_guard_on() || mob.mtype !== PORCUPINE_GUARD.mtype;
}

function porcupine_guard_rank(mob) {
	return porcupine_guard_on() && mob && mob.mtype === PORCUPINE_GUARD.mtype ? 1 : 0;
}

function porcupine_guard_weapon() {
	if (!porcupine_guard_on()) return null;

	const radius = (character.range || 0) + PORCUPINE_GUARD.splash_margin;
	const nearby = monsters_matching({
		type: PORCUPINE_GUARD.mtype,
		max_distance: radius,
		point_for_distance_check: [character.x, character.y]
	});

	return nearby.length ? PORCUPINE_GUARD.safe_weapon_set : null;
}
