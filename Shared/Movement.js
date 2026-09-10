// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT — smarter_move(), move_to_character(), bscorpion/primling farm, combat orbit
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

const SMART_USE_TOWN = false;

function apply_smart_town_setting() {
	try {
		if (typeof smart === "object" && smart) {
			smart.use_town = SMART_USE_TOWN;
			return true;
		}
	} catch (e) { /* runner globals not up yet */ }
	return false;
}
if (!apply_smart_town_setting()) setTimeout(apply_smart_town_setting, 3000);

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function is_teleporting() {
	try {
		if (typeof is_transporting === "function") return !!is_transporting(character);
		return !!(character.c && (character.c.town || character.c.transport));
	} catch (e) {
		return false;
	}
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

function stop_movement(reason = "interrupted") {
	try {
		if (typeof smart._interrupt === "function") smart._interrupt(reason);
	} catch (e) { /* already settled */ }
	try { smart.moving = false; } catch (e) { /* runner not up */ }
}

function smarter_move(destination, on_done, options = {}) {
	if (smart.moving && typeof smart._interrupt === "function") {
		smart._interrupt("interrupted");
	}

	let interrupted = false;
	let interrupt_reason = null;
	let resolve_fn, reject_fn;
	let timeout_id = null;
	let settled = false;

	const MOVE_TIMEOUT = options.timeout || 120000;

	smart._interrupt = (reason = "interrupted") => {
		if (settled) return;
		settled = true;
		interrupted = true;
		interrupt_reason = reason;
		smart.moving = false;
		if (timeout_id) clearTimeout(timeout_id);
		if (typeof on_done === "function") on_done(false, reason);
		if (reject_fn) reject_fn({ success: false, reason });
	};

	function complete(success = true, reason = null) {
		if (settled) return;
		settled = true;
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
			const loc = locations[dest_name][0];
			smart.map = loc.map || character.map;
			smart.x = loc.x;
			smart.y = loc.y;
		} else if (G.maps[dest_name]) {
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

	const target_map = smart.map;
	const target_x = smart.x;
	const target_y = smart.y;
	const arrive_radius = options.radius || 10;

	function monitor_movement() {
		if (interrupted) return;

		if (
			character.map === target_map &&
			Math.hypot(character.x - target_x, character.y - target_y) < arrive_radius
		) {
			complete(true);
			return;
		}

		if (!smart.moving) {
			if (is_teleporting()) {
				setTimeout(monitor_movement, 200);
				return;
			}
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
// TRAVEL ARBITER — the single owner of long-range movement for this character.
// --------------------------------------------------------------------------------------------------------------------------------- //


const TRAVEL_REISSUE_MS = 3000;
const TRAVEL_REGOAL_MS = 500;
const TRAVEL_DRIFT = 80;
const TRAVEL_ARRIVE = 40;
const TRAVEL_STALL_MS = 8000;
const TRAVEL_STALL_EPS = 30;
const TRAVEL_SEARCH_MAX_MS = 20000;

let _travel = { label: null, at: 0, interrupt: null, anchor: null, anchor_at: 0, search_since: 0 };

function travel_release() {
	if (_travel.interrupt && smart.moving && smart._interrupt === _travel.interrupt) {
		stop_movement("arbiter: released");
	}
	_travel.interrupt = null;
	_travel.anchor = null;
	_travel.search_since = 0;
}

let _local_label = null;
let _local_label_at = 0;

function log_local_goal(label) {
	if (label === _local_label) return;
	_local_label = label;
	const now = Date.now();
	if (now - _local_label_at < 1500) return;
	_local_label_at = now;
	log(`🧭 ${label}`, "#8899aa", "Alerts");
}

function travel_arbiter(goal) {
	if (!goal || goal.local) {
		travel_release();
		log_local_goal(goal ? goal.label : "idle");
		return false;
	}

	if (goal.hold) {
		travel_release();
		if (smart.moving) stop_movement("arbiter: " + goal.label);
		if (_travel.label !== goal.label) log(`🧭 ${goal.label}`, "#8899aa", "Alerts");
		_travel.label = goal.label;
		return true;
	}

	const now = Date.now();
	const label_changed = _travel.label !== goal.label;

	if (goal.to) {
		if (!smart.moving && (label_changed || now - _travel.at > TRAVEL_REISSUE_MS)) {
			_travel.at = now;
			_travel.label = goal.label;
			_travel.interrupt = null;
			fire_and_forget_move({ to: goal.to }, goal.on_arrive);
		}
		return true;
	}

	const map = goal.map || character.map;
	const radius = goal.radius || TRAVEL_ARRIVE;

	if (character.map === map && Math.hypot(character.x - goal.x, character.y - goal.y) <= radius) {
		travel_release();
		return false;
	}

	const ours = smart.moving && _travel.interrupt && smart._interrupt === _travel.interrupt;
	const foreign = smart.moving && !ours;
	const drifted = !smart.moving
		|| smart.map !== map
		|| Math.hypot(smart.x - goal.x, smart.y - goal.y) > TRAVEL_DRIFT;

	const searching = !!smart.searching && !smart.found;
	if (searching && !_travel.search_since) _travel.search_since = now;
	if (!searching && _travel.search_since) {
		_travel.search_since = 0;
		_travel.anchor = null;
	}
	const search_overrun = _travel.search_since > 0 && now - _travel.search_since > TRAVEL_SEARCH_MAX_MS;

	const teleporting = is_teleporting();
	const moved = !_travel.anchor
		|| _travel.anchor.map !== character.map
		|| Math.hypot(character.x - _travel.anchor.x, character.y - _travel.anchor.y) > TRAVEL_STALL_EPS;

	if (moved || teleporting) {
		_travel.anchor = { map: character.map, x: character.x, y: character.y };
		_travel.anchor_at = now;
	}
	const stalled = !moved && !teleporting && !searching && now - _travel.anchor_at > TRAVEL_STALL_MS;

	if (searching && !search_overrun) return true;

	const floor = label_changed ? TRAVEL_REGOAL_MS : TRAVEL_REISSUE_MS;
	if (now - _travel.at > floor && (drifted || foreign || stalled || search_overrun)) {
		if (stalled) log(`🧭 Re-pathing "${goal.label}" — no ground covered in ${TRAVEL_STALL_MS / 1000}s.`, "#FFA500", "Alerts");
		if (search_overrun) log(`🧭 Re-pathing "${goal.label}" — pathfinder still searching after ${TRAVEL_SEARCH_MAX_MS / 1000}s.`, "#FFA500", "Alerts");
		if (smart.moving) stop_movement("arbiter: " + goal.label);
		_travel.at = now;
		if (_travel.label !== goal.label) log(`🧭 ${goal.label}`, "#8899aa", "Alerts");
		_travel.label = goal.label;
		_travel.anchor = null;
		Promise.resolve(smarter_move({ map, x: goal.x, y: goal.y }, null,
			{ timeout: 90000, radius })).catch(() => { });
		_travel.interrupt = smart._interrupt;
	}
	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE TO CHARACTER'S LOCATION
// --------------------------------------------------------------------------------------------------------------------------------- //

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
// STUCK ESCAPE — last resort when pathfinding cannot leave where we are
// --------------------------------------------------------------------------------------------------------------------------------- //

const STUCK_MOVE_EPSILON = 20;
const STUCK_REQUIRED_MS = 60000;
const STUCK_ESCAPE_COOLDOWN_MS = 300000;
const STUCK_ENEMY_RADIUS = 300;

let _stuck_anchor = null;
let _stuck_since = 0;
let _last_stuck_escape = 0;

function stuck_escape_check() {
	if (typeof destination === "undefined") return;
	if (character.rip) return;

	if (typeof follow_has_leader === "function" && follow_has_leader()) {
		const lead = get_player(MOVEMENT_LEADER);
		if (lead && !lead.rip) { _stuck_anchor = null; return; }
	}

	const home_map = destination.map || character.map;
	if (character.map === home_map) { _stuck_anchor = null; return; }

	if (G.maps[character.map]?.instance) return;
	if (home === "giantspider") return;

	const now = Date.now();
	const progressed = !_stuck_anchor
		|| _stuck_anchor.map !== character.map
		|| Math.hypot(character.x - _stuck_anchor.x, character.y - _stuck_anchor.y) > STUCK_MOVE_EPSILON;

	if (progressed) {
		_stuck_anchor = { map: character.map, x: character.x, y: character.y };
		_stuck_since = now;
		return;
	}

	const stuck_ms = now - _stuck_since;
	if (stuck_ms < STUCK_REQUIRED_MS) return;
	if (character.c?.town) return;
	if (now - _last_stuck_escape < STUCK_ESCAPE_COOLDOWN_MS) return;

	const enemy_near = Object.values(parent.entities).some(e =>
		e?.type === "monster" && !e.dead && distance(character, e) < STUCK_ENEMY_RADIUS
	);
	if (enemy_near) return;
	if (get_num_targets(character.name) > 0) return;

	_last_stuck_escape = now;
	_stuck_since = now;
	game_log(`🚨 Stuck on ${character.map} for ${Math.round(stuck_ms / 1000)}s — using town to escape.`, "#FF3333");
	use_skill("use_town");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION / PRIMLING FARM
// --------------------------------------------------------------------------------------------------------------------------------- //

const PRIM_FARM_LOC = { map: "desertland", x: -409, y: -1236 };
const PRIM_FARM_LOC_HEALER = { map: "desertland", x: -408, y: -1146 };
const PRIM_FARM_RADIUS = 105;
const SAFETY_DISTANCE = 100;

function is_at_bscorpion_farm() {
	return character.map === PRIM_FARM_LOC.map &&
		Math.hypot(character.x - PRIM_FARM_LOC.x, character.y - PRIM_FARM_LOC.y) < PRIM_FARM_RADIUS + 30;
}

function fire_and_forget_move(dest, on_done) {
	try {
		Promise.resolve(smart_move(dest, on_done)).catch(() => {});
	} catch (e) { /* smart_move threw synchronously */ }
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

async function maintain_distance_from_bscorpion() {
	const info = find_nearest_bscorpion();
	if (!info) return false;

	const prediction_time = 0.1;
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
	_orbit_angle += Math.PI / 16;
	if (_orbit_angle > 2 * Math.PI) _orbit_angle -= 2 * Math.PI;
	const new_x = PRIM_FARM_LOC.x + Math.cos(_orbit_angle) * PRIM_FARM_RADIUS;
	const new_y = PRIM_FARM_LOC.y + Math.sin(_orbit_angle) * PRIM_FARM_RADIUS;
	await move(new_x, new_y);
}

async function prim_farm_loop() {

	while (true) {
		if (PRIM_FARM_LOOT_ENABLED) {

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


	const RADIUS_TOL = 2;
	const ROTATE_STEP_DEG = 10;
	while (true) {
		if (PRIM_FARM_LOOT_ENABLED) {

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

			if (Math.abs(farm_dist - PRIM_FARM_RADIUS) > RADIUS_TOL) {
				const away_angle = Math.atan2(dy, dx);
				const target_x = PRIM_FARM_LOC.x + Math.cos(away_angle) * PRIM_FARM_RADIUS;
				const target_y = PRIM_FARM_LOC.y + Math.sin(away_angle) * PRIM_FARM_RADIUS;
				await move(target_x, target_y);
				await delay(80);
				continue;
			}

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

if (character.name === "Myras" && typeof HEALER_TARGET !== "undefined") {
	orbit_origin = HEALER_TARGET;
} else if (character.name === "Ulric" && typeof WARRIOR_TARGET !== "undefined") {
	orbit_origin = WARRIOR_TARGET;
} else if (character.name === "Riva" && typeof RANGER_TARGET !== "undefined") {
	orbit_origin = RANGER_TARGET;
}

let orbit_path_points = [];
let orbit_path_index = 0;
const MOVE_CHECK_INTERVAL = 120;
const MOVE_TOLERANCE = 5;

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

			await delay(delay_ms);
		}
	}

}
