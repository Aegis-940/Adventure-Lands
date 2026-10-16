// --------------------------------------------------------------------------------------------------------------------------------- //
// TRAVEL ARBITER — the single owner of long-range movement for this character: journeys, failures, escalation to town, parked routes
// --------------------------------------------------------------------------------------------------------------------------------- //

const TRAVEL_REISSUE_MS = 3000;
const TRAVEL_REGOAL_MS = 500;
const TRAVEL_DRIFT = 80;
const TRAVEL_DRIFT_FRACTION = 0.3;
const TRAVEL_ARRIVE = 40;
const TRAVEL_STALL_MS = 8000;
const TRAVEL_STALL_EPS = 30;
const TRAVEL_SEARCH_MAX_MS = 60000;
const TRAVEL_TOWN_AFTER_FAILURES = 2;
const TRAVEL_PROGRESS_RESET = 200;
const TRAVEL_FAILURE_LOG_EVERY = 10;
const TRAVEL_JOURNEY_TIMEOUT_MS = 300000;

let _travel = {
	label: null, active: false, at: 0, interrupt: null, anchor: null, anchor_at: 0, search_since: 0,
	failures: 0, fail_from: null, town: false, released: false,
};
let _parked = null;

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
		log_msg("warn", `"${label}" failed (${reason}) — ${_travel.failures} in a row`);
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

function travel_ours() {
	return !!(smart.moving && _travel.interrupt && smart._interrupt === _travel.interrupt);
}

function travel_park() {
	if (!travel_ours() || !smart.found) return;
	const plot = character.moving
		? [{ map: character.map, x: character.going_x, y: character.going_y }].concat(smart.plot)
		: smart.plot.slice();
	_parked = { label: _travel.label, map: smart.map, x: smart.x, y: smart.y, plot };
	if (character.moving) walk(character.real_x, character.real_y);
}

function travel_parked_plot(label, map, x, y) {
	const p = _parked;
	_parked = null;
	if (!p || p.label !== label || p.map !== map || p.x !== x || p.y !== y) return null;
	const first = p.plot[0];
	if (!first || first.town) return null;
	if (first.transport) {
		const at_door = G.maps[character.map].doors.some(door =>
			door[4] === first.map && is_door_close(character.map, door, character.real_x, character.real_y));
		return at_door ? p.plot : null;
	}
	if (first.map !== character.map || !can_move_to(first.x, first.y)) return null;
	return p.plot;
}

function travel_release() {
	_travel.active = false;
	if (smart.moving) {
		travel_park();
		stop_movement("arbiter: released");
		_travel.released = true;
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
	log_msg("event", `🧭 ${label}`);
}

function travel_arbiter(goal) {
	if (!goal || goal.local) {
		if (goal && goal.passive && travel_ours() && travel_searching()) return true;
		travel_release();
		log_local_goal(goal ? goal.label : "idle");
		return false;
	}

	if (goal.hold) {
		travel_release();
		if (_travel.label !== goal.label) log_msg("event", `🧭 ${goal.label}`);
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

	const remaining = map === character.map ? Math.hypot(character.x - goal.x, character.y - goal.y) : Infinity;
	if (remaining <= radius) {
		travel_reset_failures();
		travel_release();
		return false;
	}

	const foreign = smart.moving && !travel_ours();
	const drifted = !smart.moving
		|| smart.map !== map
		|| Math.hypot(smart.x - goal.x, smart.y - goal.y) > Math.max(TRAVEL_DRIFT, remaining * TRAVEL_DRIFT_FRACTION);

	const searching = travel_searching();
	if (searching && !_travel.search_since) _travel.search_since = now;
	if (!searching && _travel.search_since) {
		_travel.search_since = 0;
		_travel.anchor = null;
	}
	const search_overrun = _travel.search_since > 0 && now - _travel.search_since > TRAVEL_SEARCH_MAX_MS;

	const teleporting = is_transporting(character);
	const moved = !_travel.anchor
		|| _travel.anchor.map !== character.map
		|| Math.hypot(character.x - _travel.anchor.x, character.y - _travel.anchor.y) > TRAVEL_STALL_EPS;

	if (moved || teleporting) {
		_travel.anchor = { map: character.map, x: character.x, y: character.y };
		_travel.anchor_at = now;
	}
	const stalled = !moved && !teleporting && !searching && now - _travel.anchor_at > TRAVEL_STALL_MS;

	if (searching && !search_overrun) return true;

	const floor = _travel.released && !smart.moving ? 0 : label_changed ? TRAVEL_REGOAL_MS : TRAVEL_REISSUE_MS;
	if (now - _travel.at > floor && (drifted || foreign || stalled || search_overrun)) {
		const label = goal.label;
		if (stalled) {
			travel_failed(label, `no ground covered in ${TRAVEL_STALL_MS / 1000}s`);
			_travel.anchor_at = now;
		}
		if (search_overrun) travel_failed(label, `pathfinder still searching after ${TRAVEL_SEARCH_MAX_MS / 1000}s`);
		if (smart.moving) stop_movement("arbiter: " + label);
		_travel.at = now;
		_travel.released = false;
		if (_travel.label !== label) log_msg("event", `🧭 ${label}`);
		_travel.label = label;
		_travel.active = true;

		const town = travel_town_allowed();
		if (town && !_travel.town) log_msg("warn", `"${label}": no walking route — allowing the town teleport`);
		_travel.town = town;

		const plot = travel_parked_plot(label, map, goal.x, goal.y);
		if (plot) errlog_count("travel resumed parked route");
		Promise.resolve(smarter_move({ map, x: goal.x, y: goal.y }, null, { timeout: TRAVEL_JOURNEY_TIMEOUT_MS, radius, town, plot }))
			.catch(e => {
				if (e && (e.reason === MOVE_NO_PATH || e.reason === MOVE_TIMEOUT_REASON)) travel_failed(label, e.reason);
			});
		_travel.interrupt = smart._interrupt;
	}
	return true;
}
