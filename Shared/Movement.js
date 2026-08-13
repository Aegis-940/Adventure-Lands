// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT — smarter_move(), move_to_character(), bscorpion/primling farm, combat orbit
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

// Critical function. Must be declared early.
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function with_timeout(
	promise,
	timeout_interval = Math.max(...parent.pings),
) {
	return Promise.race([
	promise,
	new Promise((resolve) => setTimeout(resolve, timeout_interval)),
	]);
}

function halt_movement() {
	parent.socket.emit("move", { to: { x: character.x, y: character.y } });
}

// Returns a Promise that always resolves/rejects; supports external interruption via halt_movement or a global flag.
function smarter_move(destination, on_done, options = {}) {
	if (smart.moving && typeof smart._interrupt === "function") {
		smart._interrupt("interrupted");
	}

	let interrupted = false;
	let interrupt_reason = null;
	let resolve_fn, reject_fn;
	let timeout_id = null;

	const MOVE_TIMEOUT = options.timeout || 120000; // 120s default

	smart._interrupt = (reason = "interrupted") => {
		interrupted = true;
		interrupt_reason = reason;
		smart.moving = false;
		if (timeout_id) clearTimeout(timeout_id);
		if (typeof on_done === "function") on_done(false, reason);
		if (reject_fn) reject_fn({ success: false, reason });
	};

	function complete(success = true, reason = null) {
		smart.moving = false;
		if (timeout_id) clearTimeout(timeout_id);
		if (typeof on_done === "function") on_done(success, reason);
		if (success && resolve_fn) resolve_fn({ success: true });
		else if (reject_fn) reject_fn({ success: false, reason });
	}

	let target = {};
	if (typeof destination === "string") target = { to: destination };
	else if (typeof destination === "number") target = { x: destination, y: on_done }, on_done = null;
	else if (typeof destination === "object") target = { ...destination };
	else return Promise.reject({ reason: "invalid destination" });

	if ("x" in target) {
		smart.map = target.map || character.map;
		smart.x = target.x;
		smart.y = target.y;
	} else if ("to" in target || "map" in target) {
		const dest_name = target.to || target.map;

		if (locations[dest_name]) {
			// Named monster/farm location from the shared locations table
			const loc = locations[dest_name][0];
			smart.map = loc.map || character.map;
			smart.x = loc.x;
			smart.y = loc.y;
		} else if (G.maps[dest_name]) {
			// Bare map name — head to its default spawn point
			smart.map = dest_name;
			smart.x = G.maps[smart.map].spawns[0][0];
			smart.y = G.maps[smart.map].spawns[0][1];
		} else {
			return Promise.reject({ reason: "invalid location" });
		}
	} else {
		return Promise.reject({ reason: "invalid destination" });
	}

	smart.moving = true;
	smart.plot = [];
	smart.flags = {};
	smart.searching = smart.found = false;

	function monitor_movement() {
		if (interrupted) return;

		if (
			character.map === smart.map &&
			Math.hypot(character.x - smart.x, character.y - smart.y) < (options.radius || 10)
		) {
			complete(true);
			return;
		}

		if (!smart.moving) {
			complete(false, "movement stopped");
			return;
		}

		setTimeout(monitor_movement, 200);
	}

	setTimeout(monitor_movement, 200);

	timeout_id = setTimeout(() => {
		smart._interrupt("timeout");
	}, MOVE_TIMEOUT);

	return new Promise((resolve, reject) => {
		resolve_fn = resolve;
		reject_fn = reject;
	});
}

// Usage example:
// let move_promise = smarter_move({ map: "main", x: 100, y: 100 }, null, { timeout: 30000, radius: 20 });
// To interrupt: smart._interrupt("manual stop");


// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE TO CHARACTER'S LOCATION
// --------------------------------------------------------------------------------------------------------------------------------- //

// Resolves once we've actually arrived (or rejects on invalid/missing response or timeout) — not just once the request was sent.
function move_to_character(name, timeout_ms = 10000) {
	return new Promise((resolve, reject) => {
		let responded = false;

		function handle_response(n, data) {
			if (n !== name || !data || data.type !== "my_location") return;

			responded = true;
			remove_cm_listener(handle_response);
			clearTimeout(timeout_id);

			const { map, x, y } = data;
			if (!map || x == null || y == null) {
				game_log(`❌ Invalid location data from ${name}`);
				reject({ reason: "invalid_location" });
				return;
			}

			smarter_move({ map, x, y }).then(resolve, reject);
		}

		add_cm_listener(handle_response);

		send_cm(name, { type: "where_are_you" });

		const timeout_id = setTimeout(() => {
			if (!responded) {
				remove_cm_listener(handle_response);
				game_log(`⚠️ No location response from ${name} within ${timeout_ms / 1000}s`);
				reject({ reason: "timeout" });
			}
		}, timeout_ms);
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION / PRIMLING FARM
// --------------------------------------------------------------------------------------------------------------------------------- //

const PRIM_FARM_LOC = { map: "desertland", x: -409, y: -1236 };
const PRIM_FARM_LOC_HEALER = { map: "desertland", x: -408, y: -1146 };
const PRIM_FARM_RADIUS = 105;
const SAFETY_DISTANCE = 100;

// smart.moving isn't a safe gate for the positioning loops below — smart_move can drop it false for a tick
// between BFS waypoint recalcs, letting a stray move() knock the character off path. Gate on actual arrival instead.
function is_at_bscorpion_farm() {
	return character.map === PRIM_FARM_LOC.map &&
		Math.hypot(character.x - PRIM_FARM_LOC.x, character.y - PRIM_FARM_LOC.y) < PRIM_FARM_RADIUS + 30;
}

// Shared by Warrior/Healer/Ranger — approaches the farm spot via smart_move only when actually lost;
// callers gate this on their own `home === "bscorpion"` check first.
function handle_bscorpion_farm_approach() {
	if (!is_at_bscorpion_farm() && !smart.moving) smart_move(PRIM_FARM_LOC);
}

let cached_bscorpion_id = null;

function find_nearest_bscorpion() {
	let nearest = null;
	let min_dist = Infinity;

	if (cached_bscorpion_id && parent.entities[cached_bscorpion_id]) {
		const ent = parent.entities[cached_bscorpion_id];
		if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
			nearest = ent;
			min_dist = Math.hypot(ent.x - character.x, ent.y - character.y);
		} else {
			cached_bscorpion_id = null;
		}
	}

	if (!nearest) {
		for (const id in parent.entities) {
			const ent = parent.entities[id];
			if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
				const dist = Math.hypot(ent.x - character.x, ent.y - character.y);
				if (dist < min_dist) {
					min_dist = dist;
					nearest = ent;
					cached_bscorpion_id = id;
				}
			}
		}
	}

	if (!nearest) return null;
	return { entity: nearest, distance: min_dist, x: nearest.x, y: nearest.y, id: nearest.id };
}

function is_bscorpion_targeting_myras() {
	for (const id in parent.entities) {
	const ent = parent.entities[id];
	if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
		if (ent.target === "Myras") return true;
	}
	}
	return false;
}

// True if a visible bscorpion has >= 5% HP — gates party buffs (warcry, dark blessing).
function bscorpion_worth_buffing() {
	const info = find_nearest_bscorpion();
	if (!info) return false;
	return info.entity.hp / info.entity.max_hp >= 0.05;
}

async function move_distance_from_bscorpion(desired = 40, tolerance = 0.75) {
	const info = find_nearest_bscorpion();
	if (!info) return false;

	if (Math.abs(info.distance - desired) > tolerance) {
		if (!character.moving || Math.hypot(character.x - info.x, character.y - info.y) > tolerance) {
			const angle = Math.atan2(character.y - info.y, character.x - info.x);
			const new_x = info.x + Math.cos(angle) * desired;
			const new_y = info.y + Math.sin(angle) * desired;
			move(new_x, new_y);
		}
		return true;
	}
	return false;
}

// Predicts bscorpion's position 100ms ahead and maintains exactly the right distance from it.
async function maintain_distance_from_bscorpion() {
	const info = find_nearest_bscorpion();
	if (!info) return false;

	const prediction_time = 0.1; // seconds
	const nearest = info.entity;
	let pred_x = nearest.x;
	let pred_y = nearest.y;
	if (typeof nearest.vx === "number" && typeof nearest.vy === "number") {
		pred_x += nearest.vx * prediction_time;
		pred_y += nearest.vy * prediction_time;
	} else if (typeof nearest.going_x === "number" && typeof nearest.going_y === "number") {
		pred_x = nearest.going_x;
		pred_y = nearest.going_y;
	}

	const desired = 38;
	const angle = Math.atan2(character.y - pred_y, character.x - pred_x);
	const new_x = pred_x + Math.cos(angle) * desired;
	const new_y = pred_y + Math.sin(angle) * desired;
	const dist_to_pred = Math.hypot(character.x - new_x, character.y - new_y);
	log(dist_to_pred);
	if (dist_to_pred > 2) {
		move(new_x, new_y);
		return true;
	}
	return false;
}

let _orbit_angle = 0;
async function move_safe_from_bscorpion() {
	// Orbits PRIM_FARM_LOC at PRIM_FARM_RADIUS clockwise
	_orbit_angle += Math.PI / 16;
	if (_orbit_angle > 2 * Math.PI) _orbit_angle -= 2 * Math.PI;
	const new_x = PRIM_FARM_LOC.x + Math.cos(_orbit_angle) * PRIM_FARM_RADIUS;
	const new_y = PRIM_FARM_LOC.y + Math.sin(_orbit_angle) * PRIM_FARM_RADIUS;
	await move(new_x, new_y);
}

async function prim_farm_loop() {

	while (true) {
		if (PRIM_FARM_LOOT_ENABLED) {

			// Not yet in the farm zone — stay inert (see is_at_bscorpion_farm() comment).
			if (!is_at_bscorpion_farm()) {
				await delay(100);
				continue;
			}

			if (character.name === "Ulric") {

				move_distance_from_bscorpion();

			}

			if (character.name === "Myras") {

				const bscorp_info = find_nearest_bscorpion();
				let too_close = false;
				if (bscorp_info) {
					const dist = Math.hypot(character.x - bscorp_info.x, character.y - bscorp_info.y);
					if (dist < SAFETY_DISTANCE) too_close = true;
				}

				if (!is_bscorpion_targeting_myras() && !too_close) {
					const bscorp = Object.values(parent.entities).find(ent =>
						ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead
					);
					if (bscorp && can_use("absorb")) {
						parent.socket.emit("ability", { name: "absorb", id: bscorp.id });
					}
				}

			}

			if (character.name === "Riva") {

				move_distance_from_bscorpion(50, 0);

			}

			await delay(100);

		} else {
			await delay(1000);
		}
	}
}

async function prim_orbit_loop() {

	// Algorithm: move directly away from the scorpion; once at the radius boundary, rotate
	// clockwise or anticlockwise, whichever creates the most separation.

	const RADIUS_TOL = 2; // how close to PRIM_FARM_RADIUS counts as "at boundary"
	const ROTATE_STEP_DEG = 10; // rotation step in degrees
	while (true) {
		if (PRIM_FARM_LOOT_ENABLED) {

			// Same as prim_farm_loop: stay inert until we've actually arrived at the farm.
			if (!is_at_bscorpion_farm()) {
				await delay(100);
				continue;
			}

			const bscorp = find_nearest_bscorpion();
			if (!bscorp) { await delay(500); continue; }

			const cx = character.x;
			const cy = character.y;
			const sx = bscorp.x;
			const sy = bscorp.y;

			const dx = cx - sx;
			const dy = cy - sy;
			const dist = Math.hypot(dx, dy);

			const fx = cx - PRIM_FARM_LOC.x;
			const fy = cy - PRIM_FARM_LOC.y;
			const farm_dist = Math.hypot(fx, fy);

			// If not at radius, move directly away from scorpion, clamped to farm radius
			if (Math.abs(farm_dist - PRIM_FARM_RADIUS) > RADIUS_TOL) {
				const away_angle = Math.atan2(dy, dx);
				const target_x = PRIM_FARM_LOC.x + Math.cos(away_angle) * PRIM_FARM_RADIUS;
				const target_y = PRIM_FARM_LOC.y + Math.sin(away_angle) * PRIM_FARM_RADIUS;
				await move(target_x, target_y);
				await delay(80);
				continue;
			}

			// At radius: try both rotation directions, pick whichever increases separation
			const my_angle = Math.atan2(fy, fx);
			const step_rad = ROTATE_STEP_DEG * Math.PI / 180;
			const cw_angle = my_angle - step_rad;
			const cw_x = PRIM_FARM_LOC.x + Math.cos(cw_angle) * PRIM_FARM_RADIUS;
			const cw_y = PRIM_FARM_LOC.y + Math.sin(cw_angle) * PRIM_FARM_RADIUS;
			const cw_dist = Math.hypot(cw_x - sx, cw_y - sy);
			const ccw_angle = my_angle + step_rad;
			const ccw_x = PRIM_FARM_LOC.x + Math.cos(ccw_angle) * PRIM_FARM_RADIUS;
			const ccw_y = PRIM_FARM_LOC.y + Math.sin(ccw_angle) * PRIM_FARM_RADIUS;
			const ccw_dist = Math.hypot(ccw_x - sx, ccw_y - sy);

			let target_x, target_y;
			if (cw_dist > ccw_dist) {
				target_x = cw_x;
				target_y = cw_y;
			} else {
				target_x = ccw_x;
				target_y = ccw_y;
			}
			await move(target_x, target_y);
			await delay(100);
		} else {
			await delay(1000);
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT ORBIT
// --------------------------------------------------------------------------------------------------------------------------------- //

let orbit_origin = null;

// typeof-guarded: Movement.js and Game_Config.js load in parallel with no ordering guarantee, so
// HEALER_TARGET/WARRIOR_TARGET/RANGER_TARGET may not exist yet here. Section is dead/unused anyway.
if (character.name === "Myras" && typeof HEALER_TARGET !== "undefined") {
	orbit_origin = HEALER_TARGET;
} else if (character.name === "Ulric" && typeof WARRIOR_TARGET !== "undefined") {
	orbit_origin = WARRIOR_TARGET;
} else if (character.name === "Riva" && typeof RANGER_TARGET !== "undefined") {
	orbit_origin = RANGER_TARGET;
}

let orbit_path_points = [];
let orbit_path_index = 0;
const MOVE_CHECK_INTERVAL = 120; // ms
const MOVE_TOLERANCE = 5; // pixels

function set_orbit_radius(r) {
	if (typeof r === "number" && r > 0) {
		orbit_radius = r;
		game_log(`Orbit radius set to ${orbit_radius}`);
	}
}

function compute_orbit_path(origin, ORBIT_RADIUS, steps) {
	const points = [];
	for (let i = 0; i < steps; i++) {
		const angle = (2 * Math.PI * i) / steps;
		points.push({
			x: origin.x + ORBIT_RADIUS * Math.cos(angle),
			y: origin.y + ORBIT_RADIUS * Math.sin(angle)
		});
	}
	return points;
}

async function orbit_loop() {

	let delay_ms = 50;

	while(true) {
		if (!ORBIT_LOOP_ENABLED) {
			await delay(100);
			continue;
		}

		// orbit_origin = { x: character.real_x, y: character.real_y };
		set_orbit_radius(ORBIT_RADIUS);
		orbit_path_points = compute_orbit_path(orbit_origin, ORBIT_RADIUS, ORBIT_STEPS);
		orbit_path_index = 0;

		while (true) {
			if (!ORBIT_LOOP_ENABLED) {
				await delay(100);
				continue;
			}
			// Stop if more than 100 units from the orbit origin
			const dist_from_origin = Math.hypot(character.real_x - orbit_origin.x, character.real_y - orbit_origin.y);
			if (dist_from_origin > 100) {
				game_log("⚠️ Exiting orbit: too far from origin.", "#FF0000");
				ORBIT_LOOP_ENABLED = false;
				break;
			}

			const point = orbit_path_points[orbit_path_index];
			orbit_path_index = (orbit_path_index + 1) % orbit_path_points.length;

			const dist = Math.hypot(character.real_x - point.x, character.real_y - point.y);
			if (!character.moving && !smart.moving && dist > MOVE_TOLERANCE) {
				try {
					await move(point.x, point.y);
				} catch (e) {
					console.error("Orbit move error:", e);
				}
			}

			while (ORBIT_LOOP_ENABLED && (character.moving || smart.moving)) {
				await new Promise(resolve => setTimeout(resolve, MOVE_CHECK_INTERVAL));
			}

			await delay(delay_ms); // reduce CPU usage
		}
	}

}

