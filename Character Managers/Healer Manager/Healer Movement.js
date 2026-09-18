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
	return home === "fireroamer" || dungeon_flag("skip_panic");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// KITING
// --------------------------------------------------------------------------------------------------------------------------------- //

var KITE_ANGLE_SAMPLES = 24;
var KITE_CROWD_RADIUS = 100;
var KITE_CROWD_WEIGHT = 2;
var KITE_LEASH_WEIGHT = 4;
var KITE_LEASH_MARGIN = 30;
var KITE_REANCHOR_FACTOR = 1.5;

var _kite_anchor = null;

function kite_monster() {
	for (const mtype of (CONFIG.movement.kite_mobs || [])) {
		const mob = get_nearest_monster({ type: mtype });
		if (mob && !mob.dead) return mob;
	}
	return null;
}

function kite_anchor(mob) {
	const area = CONFIG.movement.kite_area_radius;
	if (!_kite_anchor || _kite_anchor.map !== character.map
		|| Math.hypot(_kite_anchor.x - mob.x, _kite_anchor.y - mob.y) > area * KITE_REANCHOR_FACTOR) {
		_kite_anchor = { map: character.map, x: mob.x, y: mob.y };
	}
	return _kite_anchor;
}

function kite_standoff(mob) {
	const buffer = CONFIG.movement.kite_buffer;
	const want = character.range - buffer;

	const curse_range = G.skills.curse?.range || 200;
	if (want <= curse_range) return want;
	if (mob.s?.cursed || is_on_cooldown("curse")) return want;

	return curse_range - buffer;
}

function kite_cost(x, y, mob, anchor) {
	let cost = Math.hypot(x - character.x, y - character.y);

	const drift = Math.hypot(x - anchor.x, y - anchor.y) - CONFIG.movement.kite_area_radius;
	if (drift > 0) cost += drift * KITE_LEASH_WEIGHT;

	const leader = get_player(MOVEMENT_LEADER);
	if (leader && !leader.rip) {
		const stretch = Math.hypot(x - leader.x, y - leader.y) - (cohesion_range() - KITE_LEASH_MARGIN);
		if (stretch > 0) cost += stretch * KITE_LEASH_WEIGHT;
	}

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!e || e.type !== "monster" || e.dead || e.id === mob.id) continue;
		const d = Math.hypot(e.x - x, e.y - y);
		if (d < KITE_CROWD_RADIUS) cost += (KITE_CROWD_RADIUS - d) * KITE_CROWD_WEIGHT;
	}

	return cost;
}

function kite_step(mob) {
	const standoff = kite_standoff(mob);
	const anchor = kite_anchor(mob);

	const d = distance(character, mob);
	if (d <= standoff && d >= standoff - CONFIG.movement.kite_slack) return;

	let best = null;
	let best_cost = Infinity;

	for (let i = 0; i < KITE_ANGLE_SAMPLES; i++) {
		const angle = (i / KITE_ANGLE_SAMPLES) * 2 * Math.PI;
		const x = mob.x + Math.cos(angle) * standoff;
		const y = mob.y + Math.sin(angle) * standoff;
		if (!can_move_to(x, y)) continue;

		const cost = kite_cost(x, y, mob, anchor);
		if (cost < best_cost) {
			best_cost = cost;
			best = { x, y };
		}
	}

	if (!best) {
		const away = Math.atan2(character.y - mob.y, character.x - mob.x);
		best = { x: mob.x + Math.cos(away) * standoff, y: mob.y + Math.sin(away) * standoff };
	}

	local_move(best.x, best.y);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CIRCLE WALK
// --------------------------------------------------------------------------------------------------------------------------------- //

function circle_centre() {
	if (dungeon_flag("circle_on_self")) return { x: character.x, y: character.y };
	return LOCATIONS[home][0];
}

async function healer_local(goal) {
	if (!smart.moving) {
		const mob = kite_monster();
		if (mob) return kite_step(mob);
	}

	movement_local(goal, () => {
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
