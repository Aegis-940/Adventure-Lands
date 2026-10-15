// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT MANAGER — smarter_move(), walk() and the small movement helpers, the town cast, and the route resplice
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

function town_teleport() {
	Promise.resolve(use_skill("use_town")).catch(() => { });
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
		if (interrupted) return false;

		if (
			character.map === target_map &&
			Math.hypot(character.x - target_x, character.y - target_y) < arrive_radius
		) {
			complete(true);
			return false;
		}

		if (!smart.moving) {
			if (is_teleporting()) return 200;
			complete(false, "movement stopped");
			return false;
		}

		return 200;
	}

	every("move monitor", { ms: 200, kind: "automation", after: 200 }, monitor_movement);

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

function routed_smart_move_logic() {
	route_resplice();
	native_smart_move_logic();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Movement Manager", () => {
	smart_move_logic = routed_smart_move_logic;
});
