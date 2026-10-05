// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT MANAGER — where to go and where to stand, smarter_move(), the travel arbiter, stuck escape
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function fire_and_forget_move(dest, on_done) {
	try {
		Promise.resolve(smart_move(dest, on_done)).catch(() => { });
	} catch (e) { }
}

function is_teleporting() {
	try {
		return !!is_transporting(character);
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

function town_channelling() {
	return !!(character.c && character.c.town);
}

function cancel_town_channel() {
	if (town_channelling()) Promise.resolve(stop("town")).catch(() => { });
}

function channel_walk() {
	if (!town_channelling() || !smart.moving || !smart.found || character.moving) return;
	const next = smart.plot && smart.plot[0];
	if (!next || next.town || next.transport || next.map !== character.map) return;
	if (!can_move_to(next.x, next.y)) return;
	smart.plot.splice(0, 1);
	move(next.x, next.y);
}

const NATIVE_SEARCH_FAILED = "failed";
const MOVE_NO_PATH = "no path";
const MOVE_TIMEOUT_REASON = "timeout";

function smarter_move(destination, on_done, options = {}) {
	if (smart.moving && typeof smart._interrupt === "function") {
		smart._interrupt("interrupted");
	}

	let interrupted = false;
	let interrupt_reason = null;
	let resolve_fn, reject_fn;
	let timeout_id = null;
	let settled = false;
	let native_failure = null;
	const town_allowed = !!options.town;

	const MOVE_TIMEOUT = options.timeout || 120000;

	smart._interrupt = (reason = "interrupted") => {
		if (settled) return;
		settled = true;
		interrupted = true;
		interrupt_reason = reason;
		smart.moving = false;
		smart.use_town = false;
		if (town_allowed) cancel_town_channel();
		if (timeout_id) clearTimeout(timeout_id);
		if (typeof on_done === "function") on_done(false, reason);
		if (reject_fn) reject_fn({ success: false, reason });
	};

	function complete(success = true, reason = null) {
		if (settled) return;
		settled = true;
		smart.moving = false;
		smart.use_town = false;
		if (town_allowed) cancel_town_channel();
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

		if (LOCATIONS[dest_name]) {
			const loc = LOCATIONS[dest_name][0];
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

	smart.use_town = !!options.town;
	smart.moving = true;
	smart.plot = [];
	smart.flags = {};
	smart.searching = smart.found = false;
	smart.on_done = (done, reason) => {
		if (!done) native_failure = reason || NATIVE_SEARCH_FAILED;
	};

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
			complete(false, native_failure === NATIVE_SEARCH_FAILED ? MOVE_NO_PATH : "movement stopped");
			return;
		}

		setTimeout(monitor_movement, 200);
	}

	setTimeout(monitor_movement, 200);

	timeout_id = setTimeout(() => {
		smart._interrupt(MOVE_TIMEOUT_REASON);
	}, MOVE_TIMEOUT);

	return new Promise((resolve, reject) => {
		resolve_fn = resolve;
		reject_fn = reject;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TRAVEL ARBITER — the single owner of long-range movement for this character.
// --------------------------------------------------------------------------------------------------------------------------------- //


const TRAVEL_REISSUE_MS = 3000;
const TRAVEL_REGOAL_MS = 500;
const TRAVEL_DRIFT = 80;
const TRAVEL_ARRIVE = 40;
const TRAVEL_STALL_MS = 8000;
const TRAVEL_STALL_EPS = 30;
const TRAVEL_SEARCH_MAX_MS = 60000;
const TRAVEL_TOWN_AFTER_FAILURES = 2;
const TRAVEL_PROGRESS_RESET = 200;
const TRAVEL_FAILURE_LOG_EVERY = 10;
const TRAVEL_COUNTED_FAILURES = [MOVE_NO_PATH, MOVE_TIMEOUT_REASON];

let _travel = {
	label: null, active: false, at: 0, interrupt: null, anchor: null, anchor_at: 0, search_since: 0,
	failures: 0, fail_from: null, town: false,
};

function travel_is_active() {
	return _travel.active;
}

function is_travelling() {
	return travel_is_active() || !!smart.moving;
}

function travel_searching() {
	return !!smart.moving && !!smart.searching && !smart.found;
}

function travel_failures() {
	return _travel.failures;
}

function travel_reset_failures() {
	_travel.failures = 0;
	_travel.fail_from = null;
}

function travel_failed(label, reason) {
	if (_travel.label !== label) return;
	if (!_travel.fail_from) _travel.fail_from = { map: character.map, x: character.x, y: character.y };
	_travel.failures++;
	if (_travel.failures <= TRAVEL_TOWN_AFTER_FAILURES + 1 || _travel.failures % TRAVEL_FAILURE_LOG_EVERY === 0) {
		game_log(`🚨 "${label}" failed (${reason}) — ${_travel.failures} in a row`, "#FFA500");
	}
}

function travel_progress_check() {
	const from = _travel.fail_from;
	if (!from) return;
	if (from.map !== character.map
		|| Math.hypot(character.x - from.x, character.y - from.y) > TRAVEL_PROGRESS_RESET) {
		travel_reset_failures();
	}
}

function travel_town_allowed() {
	return _travel.failures >= TRAVEL_TOWN_AFTER_FAILURES && monsters_targeting_me() === 0;
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
	game_log(`🧭 ${label}`, "#8899aa");
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
		if (_travel.label !== goal.label) game_log(`🧭 ${goal.label}`, "#8899aa");
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

	if (label_changed) travel_reset_failures();
	else travel_progress_check();

	if (character.map === map && Math.hypot(character.x - goal.x, character.y - goal.y) <= radius) {
		_travel.active = false;
		travel_reset_failures();
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
		const label = goal.label;
		if (stalled) {
			travel_failed(label, `no ground covered in ${TRAVEL_STALL_MS / 1000}s`);
			_travel.anchor_at = now;
		}
		if (search_overrun) travel_failed(label, `pathfinder still searching after ${TRAVEL_SEARCH_MAX_MS / 1000}s`);
		if (smart.moving) stop_movement("arbiter: " + label);
		_travel.at = now;
		if (_travel.label !== label) game_log(`🧭 ${label}`, "#8899aa");
		_travel.label = label;
		_travel.active = true;

		const town = travel_town_allowed();
		if (town && !_travel.town) game_log(`🚨 "${label}": no walking route — allowing the town teleport`, "#FFA500");
		_travel.town = town;

		Promise.resolve(smarter_move({ map, x: goal.x, y: goal.y }, null, { timeout: 90000, radius, town }))
			.catch(e => {
				if (e && TRAVEL_COUNTED_FAILURES.includes(e.reason)) travel_failed(label, e.reason);
			});
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
const STUCK_TOWN_WAIT_MS = 12000;
const STUCK_RETRY_MS = 15000;
const STUCK_LANDED_RANGE = 150;

let _stuck_anchor = null;
let _stuck_since = 0;
let _last_stuck_escape = 0;
let _stuck_escape = null;

function stuck_escape_landed() {
	const from = _stuck_escape;
	if (character.map !== from.map) return true;
	const spawn = G.maps[character.map].spawns[0];
	return Math.hypot(character.x - spawn[0], character.y - spawn[1]) <= STUCK_LANDED_RANGE;
}

function stuck_escape_settle(now) {
	if (stuck_escape_landed()) {
		_last_stuck_escape = now;
		_stuck_escape = null;
		game_log("🚨 Stuck escape landed", "#00FF00");
		return;
	}
	if (now - _stuck_escape.at < STUCK_TOWN_WAIT_MS) return;
	_stuck_escape = null;
	_last_stuck_escape = now - STUCK_ESCAPE_COOLDOWN_MS + STUCK_RETRY_MS;
	game_log(`🚨 Stuck escape did not land — retrying in ${STUCK_RETRY_MS / 1000}s`, "#FFA500");
}

function stuck_escape_check() {
	if (!destination) return;
	if (character.rip) return;

	const now = Date.now();
	if (_stuck_escape) return stuck_escape_settle(now);

	if (!is_travelling()) { _stuck_anchor = null; return; }

	if (follow_has_leader()) {
		const lead = get_player(MOVEMENT_LEADER);
		if (lead && !lead.rip) { _stuck_anchor = null; return; }
	}

	if (destination.map && character.map === destination.map) { _stuck_anchor = null; return; }

	if (G.maps[character.map].instance || character.cave) return;

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

	if (monsters_targeting_me() > 0) return;

	_stuck_since = now;
	_stuck_escape = { at: now, map: character.map };
	game_log(`🚨 Stuck on ${character.map} for ${Math.round(stuck_ms / 1000)}s — using town to escape.`, "#FF3333");
	Promise.resolve(use_skill("use_town")).catch(() => { });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT GOAL — the one priority list for the three combat characters.
// --------------------------------------------------------------------------------------------------------------------------------- //

function approach(pos, o) {
	const map = pos.map || character.map;
	const travel = { label: o.label, map, x: pos.x, y: pos.y, radius: o.radius || o.arrive, chasing: o.chasing, disengage: o.disengage };
	if (map !== character.map) return travel;

	const d = Math.hypot(character.x - pos.x, character.y - pos.y);
	if (d <= o.arrive) return o.arrived;

	const a = Math.atan2(character.y - pos.y, character.x - pos.x);
	const step = { x: pos.x + Math.cos(a) * o.ring, y: pos.y + Math.sin(a) * o.ring };
	if (!smart.moving && can_move_to(step.x, step.y)) {
		return { local: "step", label: o.label + "-close", step, chasing: o.chasing, disengage: o.disengage };
	}
	return travel;
}

function local_step(goal) {
	if (goal && goal.step) move(goal.step.x, goal.step.y);
}

function local_wait() {
	if (character.moving) move(character.real_x, character.real_y);
}

function movement_goal() {
	if (!CONFIG.movement.enabled) return null;

	const dreams = dreams_goal();
	if (dreams) return dreams;

	if (dungeon_flag("leader_manual") && character.name === MOVEMENT_LEADER) return null;

	const ignoring_events = dungeon_ignores_events();

	const event = ignoring_events ? null : event_goal();
	if (event && event.pursuit) return event;

	const scripted_camp = party_camped(event);

	if (!scripted_camp && party_cohesion_hold()) {
		const ahead = event || anniversary_destination();
		return { hold: true, label: "cohesion", disengage: !!(ahead && ahead.disengage) };
	}

	const follow = scripted_camp ? null : follow_goal();
	if (follow && !follow.local) return follow;

	if (!follow_has_leader() && !ignoring_events) {
		const anniv = anniversary_destination();
		if (anniv) return anniv;
	}

	if (follow) return follow;
	if (event) return event;

	if (ignoring_events) return null;

	if (home === "bscorpion") {
		const loc = prim_farm_loc();
		return is_at_bscorpion_farm()
			? null
			: { label: "bscorpion", map: loc.map, x: loc.x, y: loc.y, radius: PRIM_FARM_RADIUS };
	}

	if (is_away_from_home()) {
		return {
			label: "home",
			map: destination.map,
			x: destination.x,
			y: destination.y,
			radius: home_radius(),
		};
	}

	return null;
}

function movement_local(goal, farm_step) {
	if (smart.moving) {
		game_log("🧭 local movement skipped — a journey is still in flight", "#FFA500");
		return;
	}
	if (goal && goal.local === "step") return local_step(goal);
	if (goal && goal.local === "wait") return local_wait();
	if (goal && goal.local === "event") return event_step(goal.event);
	if (goal && goal.local === "loot") return loot_step();
	if (goal && goal.disengage) return;
	if (typeof farm_step === "function") farm_step();
}
