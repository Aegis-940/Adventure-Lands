// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER MOVEMENT — the runner hooks and the circle walk
// --------------------------------------------------------------------------------------------------------------------------------- //

function healer_on_disabled() {
	if (!panicking) return;

	if (!character.rip) {
		if (character.hp < character.max_hp * PANIC_THRESHOLDS.high_hp) return;
		const on_me = Object.values(parent.entities).filter(
			e => e.type === "monster" && e.target === character.name && !e.dead
		).length;
		if (on_me > 0) return;
	}

	set_panic(false, "healer disabled — releasing the party", false);
	send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
}

function healer_skip_panic_check() {
	if (typeof is_travelling === "function" && is_travelling()) return false;
	if (panicking) return false;
	if (character.hp < character.max_hp * PANIC_THRESHOLDS.low_hp) return false;
	if (character.mp < character.max_mp * PANIC_THRESHOLDS.low_mp) return false;
	return home === "fireroamer" || dungeon_flag("skip_panic");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CIRCLE WALK
// --------------------------------------------------------------------------------------------------------------------------------- //

function circle_centre() {
	if (dungeon_flag("circle_on_self")) return { x: character.x, y: character.y };
	return LOCATIONS[home][0];
}

var PANIC_FLEE_RADIUS = 160;
var PANIC_FLEE_MIN_STEP = 12;

function panic_retreat() {
	if (smart.moving || character.moving) return;
	if (home === "bscorpion") return;

	const score = make_distance_from_monsters_scorer();
	if (!score) return;

	const spot = best_orbit_spot(
		{ x: character.x, y: character.y }, PANIC_FLEE_RADIUS, score,
		{ min_gain: 0, travel_weight: 0 }
	);
	if (!spot) return;
	if (Math.hypot(character.x - spot.x, character.y - spot.y) <= PANIC_FLEE_MIN_STEP) return;

	local_move(spot.x, spot.y);
}

async function healer_local(goal) {
	movement_local(goal, () => {
		if (panicking) return panic_retreat();
		if (CONFIG.movement.circle_walk && get_nearest_monster({ type: home })) walk_in_circle();
	});
}

async function walk_in_circle() {
	if (smart.moving) return;
	if (home === "bscorpion") return;

	const center = circle_centre();
	const radius = CONFIG.movement.circle_radius;

	const current_time = performance.now();
	const delta_time = current_time - state.last_angle_update;
	state.last_angle_update = current_time;

	const delta_angle = CONFIG.movement.circle_speed * (delta_time / 1000);
	state.angle = (state.angle + delta_angle) % (2 * Math.PI);

	const offset_x = Math.cos(state.angle) * radius;
	const offset_y = Math.sin(state.angle) * radius;
	const target_x = center.x + offset_x;
	const target_y = center.y + offset_y;

	if (!character.moving) local_move(target_x, target_y);
}
