// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER MOVEMENT — the runner hooks and the circle walk
// --------------------------------------------------------------------------------------------------------------------------------- //

function healer_on_disabled() {
	if (!panicking) return;
	set_panic(false, "healer disabled — releasing the party", false);
	send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
}

function healer_skip_panic_check() {
	if (typeof is_travelling === "function" && is_travelling()) return false;
	if (panicking) return false;
	if (character.hp < character.max_hp * PANIC_THRESHOLDS.low_hp) return false;
	if (character.mp < character.max_mp * PANIC_THRESHOLDS.low_mp) return false;
	return HEALER_TARGET === "fireroamer" || HEALER_TARGET === "giantspider";
}

async function healer_local(goal) {
	movement_local(goal, () => {
		if (CONFIG.movement.circle_walk && get_nearest_monster({ type: home })) walk_in_circle();
	});
}

async function walk_in_circle() {
	if (smart.moving) return;
	if (HEALER_TARGET === "bscorpion") return;

	const center = HEALER_TARGET === "giantspider"
		? { x: character.x, y: character.y }
		: locations[home][0];
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
