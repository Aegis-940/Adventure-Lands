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
	return is_transporting(character);
}

function walk(x, y) {
	if (!can_walk(character)) return false;
	move(x, y);
	return true;
}

function local_move(x, y) {
	if (!can_move_to(x, y)) return false;
	return walk(x, y);
}

function standoff_point(target, reach) {
	const a = Math.atan2(character.y - target.y, character.x - target.x);
	return { x: target.x + Math.cos(a) * reach, y: target.y + Math.sin(a) * reach };
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
	walk(next.x, next.y);
}

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
	if (options.plot) {
		smart.plot = options.plot;
		smart.searching = smart.found = true;
	}
	smart.on_done = done => {
		if (!done && !smart.moving) complete(false, MOVE_NO_PATH);
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
			complete(false, "movement stopped");
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
// ROUTE RESPLICE — when the next node is out of reach, continue from the first later node in sight instead of searching again
// --------------------------------------------------------------------------------------------------------------------------------- //

const ROUTE_RESPLICE_LOOKAHEAD = 12;

function route_resplice() {
	if (!smart.moving || !smart.found || character.moving || !smart.plot.length) return;
	const first = smart.plot[0];
	if (first.map !== character.map || first.transport || first.town) return;
	if (can_move_to(first.x, first.y)) return;
	const limit = Math.min(smart.plot.length, ROUTE_RESPLICE_LOOKAHEAD);
	for (let i = 1; i < limit; i++) {
		const node = smart.plot[i];
		if (node.map !== character.map || node.transport || node.town) return;
		if (!can_move_to(node.x, node.y)) continue;
		errlog_count("route respliced");
		smart.plot.splice(0, i);
		return;
	}
}

const native_smart_move_logic = smart_move_logic;
smart_move_logic = function () {
	route_resplice();
	native_smart_move_logic();
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// TRAVEL ARBITER — the single owner of long-range movement for this character.
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
const TRAVEL_COUNTED_FAILURES = [MOVE_NO_PATH, MOVE_TIMEOUT_REASON];

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
	game_log(`🧭 ${label}`, "#8899aa");
}

function travel_arbiter(goal) {
	if (!goal || goal.local) {
		if (goal && goal.passive && travel_ours() && travel_searching()) return true;
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

	const foreign = smart.moving && !travel_ours();
	const remaining = map === character.map ? Math.hypot(character.x - goal.x, character.y - goal.y) : Infinity;
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
		if (_travel.label !== label) game_log(`🧭 ${label}`, "#8899aa");
		_travel.label = label;
		_travel.active = true;

		const town = travel_town_allowed();
		if (town && !_travel.town) game_log(`🚨 "${label}": no walking route — allowing the town teleport`, "#FFA500");
		_travel.town = town;

		const plot = travel_parked_plot(label, map, goal.x, goal.y);
		if (plot) errlog_count("travel resumed parked route");
		Promise.resolve(smarter_move({ map, x: goal.x, y: goal.y }, null, { timeout: TRAVEL_JOURNEY_TIMEOUT_MS, radius, town, plot }))
			.catch(e => {
				if (e && TRAVEL_COUNTED_FAILURES.includes(e.reason)) travel_failed(label, e.reason);
			});
		_travel.interrupt = smart._interrupt;
	}
	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TOWN SHORTCUT — channel the town teleport while still walking, and land further along the route
// --------------------------------------------------------------------------------------------------------------------------------- //

const TOWN_MIN_GAIN_MS = 3000;
const TOWN_RECHECK_MS = 1000;
const TOWN_OWN_MS = 2000;
const TOWN_SAMPLE_PX = 30;
const TOWN_JUMP_PX = 100;
const TOWN_SPAWN_NEAR = 150;
const TOWN_LANDED_PX = 30;
const TOWN_LANDING_GRACE_MS = 1000;
const TOWN_OWN_CHANGE_GRACE_MS = 500;
const TOWN_LEAD_GONE_GRACE_MS = 1000;
const TOWN_LEAD_SEEN_LANDED_MS = 2500;

let _town = { checked_at: 0, cast_at: 0, label: null, mode: null, lead_at: null, channel: null, logged: null };

function town_spawn() {
	const s = G.maps[character.map].spawns[0];
	return { x: s[0], y: s[1] };
}

function plot_route(head) {
	const route = head.slice();
	for (let i = 0; i < smart.plot.length; i++) {
		const node = smart.plot[i];
		if (node.map !== character.map || node.transport || node.town) break;
		route.push({ x: node.x, y: node.y, idx: i });
	}
	return route;
}

function best_join(route, origin) {
	let best = null;
	let along = 0;
	for (let i = 1; i < route.length; i++) {
		const a = route[i - 1];
		const b = route[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const n = Math.max(1, Math.ceil(len / TOWN_SAMPLE_PX));
		for (let s = 1; s <= n; s++) {
			const x = a.x + (b.x - a.x) * s / n;
			const y = a.y + (b.y - a.y) * s / n;
			const gain = along + len * s / n - Math.hypot(x - origin.x, y - origin.y);
			if (best && gain <= best.gain) continue;
			if (!can_move({ map: character.map, x: origin.x, y: origin.y, going_x: x, going_y: y, base: character.base })) continue;
			best = { x, y, gain, next: b.idx };
		}
		along += len;
	}
	return best;
}

const SPAWN_GRID = 20;
const SPAWN_STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const _spawn_walk = {};

function spawn_walk_field(map) {
	const g = G.geometry[map];
	const s = G.maps[map].spawns[0];
	const origin = [Math.round(s[0] / SPAWN_GRID), Math.round(s[1] / SPAWN_GRID)];
	const dist = { [origin[0] + "," + origin[1]]: 0 };
	const queue = [origin];
	for (let h = 0; h < queue.length; h++) {
		const [cx, cy] = queue[h];
		const d = dist[cx + "," + cy];
		for (const [dx, dy, w] of SPAWN_STEPS) {
			const x = cx + dx;
			const y = cy + dy;
			const key = x + "," + y;
			const nd = d + w * SPAWN_GRID;
			if (dist[key] !== undefined && dist[key] <= nd) continue;
			if (x * SPAWN_GRID < g.min_x || x * SPAWN_GRID > g.max_x || y * SPAWN_GRID < g.min_y || y * SPAWN_GRID > g.max_y) continue;
			if (!can_move({ map, x: cx * SPAWN_GRID, y: cy * SPAWN_GRID, going_x: x * SPAWN_GRID, going_y: y * SPAWN_GRID, base: character.base })) continue;
			if (dist[key] === undefined) queue.push([x, y]);
			dist[key] = nd;
		}
	}
	return dist;
}

function walk_from_spawn(x, y) {
	const field = _spawn_walk[character.map] || (_spawn_walk[character.map] = spawn_walk_field(character.map));
	const d = field[Math.round(x / SPAWN_GRID) + "," + Math.round(y / SPAWN_GRID)];
	return d === undefined ? Infinity : d;
}

function best_spawn_join(route) {
	let best = null;
	let along = 0;
	for (let i = 1; i < route.length; i++) {
		const a = route[i - 1];
		const b = route[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const n = Math.max(1, Math.ceil(len / TOWN_SAMPLE_PX));
		for (let s = 1; s <= n; s++) {
			const gain = along + len * s / n - walk_from_spawn(a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n);
			if (!best || gain > best.gain) best = { gain };
		}
		along += len;
	}
	return best;
}

function party_untargeted() {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (e.target === character.name || COHESION_FOLLOWERS.includes(e.target)) return false;
	}
	return true;
}

function town_near_spawn() {
	const s = town_spawn();
	return Math.hypot(character.real_x - s.x, character.real_y - s.y) <= TOWN_SPAWN_NEAR;
}

function town_shortcut_eligible() {
	if (character.rip || G.maps[character.map].instance || in_dungeon()) return false;
	if (town_near_spawn()) return false;
	return monsters_targeting_me() === 0;
}

function town_note(event, ch) {
	errlog_count("town shortcut " + event);
	errlog_timeline("town", `${event} ${ch.mode}${ch.label ? " " + ch.label : ""} @${Math.round(character.x)},${Math.round(character.y)} ${character.map}`);
}

function town_cast(label, mode, lead_at) {
	_town.cast_at = Date.now();
	_town.label = label;
	_town.mode = mode;
	_town.lead_at = lead_at;
	Promise.resolve(use_skill("use_town")).catch(() => { });
}

function town_cancel(ch, reason) {
	ch.mine = false;
	cancel_town_channel();
	town_note("cancelled", ch);
	game_log(`🌀 Town teleport cancelled — ${reason}`, "#8899aa");
}

function town_channel_watch(ch) {
	if (!ch.mine || ch.landed || ch.mode === "join" || ch.lead_landed) return;
	if (ch.mode === "own") {
		const g = current_goal();
		if ((g && g.hold) || (travel_is_active() && current_goal_label() === ch.label)) {
			ch.changed_at = 0;
			return;
		}
		if (!ch.changed_at) {
			ch.changed_at = Date.now();
			return;
		}
		if (Date.now() - ch.changed_at < TOWN_OWN_CHANGE_GRACE_MS) return;
		town_cancel(ch, "the journey changed");
		return;
	}
	const lead = get_player(MOVEMENT_LEADER);
	const now = Date.now();
	if (lead && lead.c.town) {
		ch.lead_at = { x: lead.x, y: lead.y };
		if (!ch.lead_seen_at || ch.lead_gone_at) ch.lead_seen_at = now;
		ch.lead_gone_at = 0;
		return;
	}
	const s = town_spawn();
	if (!lead
		|| Math.hypot(lead.x - ch.lead_at.x, lead.y - ch.lead_at.y) > TOWN_JUMP_PX
		|| Math.hypot(lead.x - s.x, lead.y - s.y) <= TOWN_LANDED_PX
		|| (ch.lead_seen_at && now - ch.lead_seen_at >= TOWN_LEAD_SEEN_LANDED_MS)) {
		ch.lead_landed = true;
		return;
	}
	if (!ch.lead_gone_at) {
		ch.lead_gone_at = now;
		return;
	}
	if (now - ch.lead_gone_at < TOWN_LEAD_GONE_GRACE_MS) return;
	town_cancel(ch, `${MOVEMENT_LEADER} stopped hers`);
}

function leader_waiting_at_spawn() {
	const pos = leader_position();
	const s = town_spawn();
	return pos.map === character.map
		&& Math.hypot(pos.x - s.x, pos.y - s.y) <= TOWN_SPAWN_NEAR
		&& Math.hypot(character.x - pos.x, character.y - pos.y) > cohesion_range();
}

function town_copy_leader() {
	if (!follow_has_leader() || !town_shortcut_eligible()) return false;
	const lead = get_player(MOVEMENT_LEADER);
	const mode = lead && lead.c.town ? "copy" : leader_waiting_at_spawn() ? "join" : null;
	if (!mode) return false;
	if (Date.now() - _town.cast_at < TOWN_RECHECK_MS) return true;
	if (_town.logged !== mode) {
		_town.logged = mode;
		game_log(mode === "copy" ? `🌀 Following ${MOVEMENT_LEADER}'s town teleport` : `🌀 Teleporting to ${MOVEMENT_LEADER} at the spawn`, "#8899aa");
	}
	town_cast(null, mode, mode === "copy" ? { x: lead.x, y: lead.y } : null);
	return true;
}

function town_shortcut_plan() {
	if (follow_has_leader() || !town_shortcut_eligible()) return;
	if (!smart.moving || !smart.found || smart.use_town) return;
	const goal = current_goal();
	if (!goal || goal.local || goal.hold) return;
	if (!party_untargeted()) return;
	const first = smart.plot[0];
	if (first && !first.transport && !first.town && (first.map !== character.map || !can_move_to(first.x, first.y))) return;

	const now = Date.now();
	if (now - _town.checked_at < TOWN_RECHECK_MS) return;
	_town.checked_at = now;

	const head = [{ x: character.real_x, y: character.real_y, idx: -1 }];
	if (character.moving) head.push({ x: character.going_x, y: character.going_y, idx: -1 });
	const join = best_spawn_join(plot_route(head));
	if (!join) return;

	const saved_ms = join.gain / character.speed * 1000 - G.conditions.town.duration - min_ping();
	if (saved_ms < TOWN_MIN_GAIN_MS) return;

	errlog_count("town shortcut cast");
	if (_town.logged !== goal.label) {
		_town.logged = goal.label;
		game_log(`🌀 Town shortcut on "${goal.label}" — saves ~${Math.round(saved_ms / 1000)}s`, "#8899aa");
	}
	town_cast(goal.label, "own", null);
}

function town_shortcut_check() {
	const ch = _town.channel;
	if (ch && !ch.landed) town_landed();
	if (town_channelling()) {
		if (!_town.channel) {
			const mine = Date.now() - _town.cast_at < TOWN_OWN_MS;
			_town.channel = { mine, mode: _town.mode, label: _town.label, lead_at: _town.lead_at, landed: false, gone_at: 0 };
			if (mine) town_note("channelling", _town.channel);
		}
		_town.channel.gone_at = 0;
		return town_channel_watch(_town.channel);
	}
	if (ch) {
		if (!ch.landed) {
			if (!ch.gone_at) ch.gone_at = Date.now();
			if (Date.now() - ch.gone_at < TOWN_LANDING_GRACE_MS) return;
			if (ch.mine) town_note("interrupted", ch);
		}
		_town.channel = null;
	}
	if (town_copy_leader()) return;
	town_shortcut_plan();
}

let _map_seen = null;

function map_changed() {
	if (character.map === _map_seen) return;
	const from = _map_seen;
	_map_seen = character.map;
	if (!from) return;
	errlog_timeline("map", `${from} -> ${character.map} @${Math.round(character.real_x)},${Math.round(character.real_y)} ${current_goal_label() || "-"}`);
}

function town_landed() {
	const ch = _town.channel;
	if (!ch || ch.landed) return;
	const s = town_spawn();
	if (Math.hypot(character.real_x - s.x, character.real_y - s.y) > TOWN_LANDED_PX) return;
	ch.landed = true;
	_town.logged = null;
	town_note("landed", ch);
	if (!smart.moving || !smart.found) return;
	const route = plot_route([{ x: character.going_x, y: character.going_y, idx: -1 }]);
	const join = best_join(route, { x: character.real_x, y: character.real_y });
	if (join) {
		smart.plot = [{ map: character.map, x: join.x, y: join.y }].concat(smart.plot.slice(join.next));
		return;
	}
	smart.plot = [];
	smart.found = smart.searching = false;
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
	if (d <= o.arrive && !o.aim) return o.arrived;

	let step = standoff_point(o.aim || pos, o.ring);
	if (o.aim && !can_move_to(step.x, step.y)) step = standoff_point(pos, o.ring);
	if (can_move_to(step.x, step.y)) {
		return { local: "step", label: o.label + "-close", step, chasing: o.chasing, disengage: o.disengage };
	}
	if (d <= o.arrive) return o.arrived;
	return travel;
}

const LOCAL_MOVE_SLOP = 15;

function local_step(goal) {
	if (!goal || !goal.step) return;
	if (character.moving && Math.hypot(character.going_x - goal.step.x, character.going_y - goal.step.y) < LOCAL_MOVE_SLOP) return;
	walk(goal.step.x, goal.step.y);
}

function local_wait() {
	if (character.moving) walk(character.real_x, character.real_y);
}

const EVADE_STEP = 150;
const EVADE_TURNS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];
const EVADE_HEADING_TOLERANCE = 0.6;

function angle_apart(a, b) {
	return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function evade_point(threat) {
	const away = Math.atan2(character.y - threat.y, character.x - threat.x);
	for (const turn of EVADE_TURNS) {
		const angle = away + turn;
		const point = { x: character.x + Math.cos(angle) * EVADE_STEP, y: character.y + Math.sin(angle) * EVADE_STEP };
		if (can_move_to(point.x, point.y)) return point;
	}
	return null;
}

function evade_step(threat) {
	scare_off();
	if (character.moving) {
		const heading = Math.atan2(character.going_y - character.y, character.going_x - character.x);
		const away = Math.atan2(character.y - threat.y, character.x - threat.x);
		if (angle_apart(heading, away) < EVADE_HEADING_TOLERANCE) return;
	}
	const point = evade_point(threat);
	if (point) walk(point.x, point.y);
}

function movement_goal() {
	if (!CONFIG.movement.enabled) return null;

	const threat = lethal_pursuer();
	if (threat) return { local: "evade", label: "evade-" + threat.mtype, threat };

	const dreams = dreams_goal();
	if (dreams) return dreams;

	if (dungeon_flag("leader_manual") && character.name === MOVEMENT_LEADER) return null;

	const ignoring_events = dungeon_ignores_events();

	const event = ignoring_events ? null : event_goal();
	if (event && event.local === "kite") return event;
	const scripted_camp = party_camped(event);
	const cohesion_hold = !scripted_camp && party_cohesion_hold(event);

	if (event && event.pursuit) {
		if (cohesion_hold) return { hold: true, label: "cohesion", disengage: false };
		if (!follower_holds_back(event)) return event;
	}

	if (cohesion_hold) {
		return { hold: true, label: "cohesion", disengage: !!(event && event.disengage) };
	}

	const follow = scripted_camp ? null : follow_goal();
	if (follow) return follow;
	if (event) return event;

	if (ignoring_events) return null;

	if (home === "bscorpion") {
		const loc = prim_farm_loc();
		return is_at_bscorpion_farm()
			? { local: "camp", label: "bscorpion-camp" }
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

function movement_local(goal, farm_step, engage_step) {
	if (smart.moving) {
		if (!goal || !goal.passive) game_log("🧭 local movement skipped — a journey is still in flight", "#FFA500");
		return;
	}
	if (goal && goal.local === "step") return local_step(goal);
	if (goal && goal.local === "trail") return trail_step(goal);
	if (goal && goal.local === "passage") return passage_step(goal);
	if (goal && goal.local === "wait") return local_wait();
	if (goal && goal.local === "evade") return evade_step(goal.threat);
	if (goal && goal.local === "kite") return kite_step(goal.event);
	if (goal && goal.local === "event") return event_step(goal.event, engage_step);
	if (goal && goal.local === "loot") return loot_step();
	if (goal && goal.local === "camp") return camp_step();
	if (goal && goal.local === "keep") return;
	if (goal && goal.disengage) return;
	if (typeof farm_step === "function") farm_step();
}
