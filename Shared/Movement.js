// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT — smarter_move(), the travel arbiter, stuck escape
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
	} catch (e) { }
	return false;
}
if (!apply_smart_town_setting()) setTimeout(apply_smart_town_setting, 3000);

function update_town_escape(aggro_count) {
	if (!SMART_USE_TOWN) return;
	try {
		const want = aggro_count === 0;
		if (smart.use_town !== want && !smart.searching) smart.use_town = want;
	} catch (e) { }
}

function fire_and_forget_move(dest, on_done) {
	try {
		Promise.resolve(smart_move(dest, on_done)).catch(() => { });
	} catch (e) { }
}

function is_teleporting() {
	try {
		if (typeof is_transporting === "function") return !!is_transporting(character);
		return !!(character.c && (character.c.town || character.c.transport));
	} catch (e) {
		return false;
	}
}

function local_move(x, y) {
	if (!can_move_to(x, y)) return false;
	move(x, y);
	return true;
}

function stop_movement(reason = "interrupted") {
	try {
		if (typeof smart._interrupt === "function") smart._interrupt(reason);
	} catch (e) { }
	try { smart.moving = false; } catch (e) { }
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

let _travel = { label: null, active: false, at: 0, interrupt: null, anchor: null, anchor_at: 0, search_since: 0 };

function travel_is_active() {
	return _travel.active;
}

function is_travelling() {
	return travel_is_active() || !!smart.moving;
}

function travel_searching() {
	return !!smart.moving && !(smart.plot && smart.plot.length);
}

function travel_release() {
	if (smart.moving) stop_movement("arbiter: released");
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
		_travel.active = false;
		travel_release();
		log_local_goal(goal ? goal.label : "idle");
		return false;
	}

	if (goal.hold) {
		_travel.active = false;
		travel_release();
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
		_travel.active = false;
		travel_release();
		return false;
	}

	const ours = smart.moving && _travel.interrupt && smart._interrupt === _travel.interrupt;
	const foreign = smart.moving && !ours;
	const drifted = !smart.moving
		|| smart.map !== map
		|| Math.hypot(smart.x - goal.x, smart.y - goal.y) > TRAVEL_DRIFT;

	const searching = travel_searching();
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
		_travel.active = true;
		_travel.anchor = null;
		Promise.resolve(smarter_move({ map, x: goal.x, y: goal.y }, null,
			{ timeout: 90000, radius })).catch(() => { });
		_travel.interrupt = smart._interrupt;
	}
	return true;
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
