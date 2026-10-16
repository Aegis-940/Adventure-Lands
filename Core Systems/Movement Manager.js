// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT MANAGER — smarter_move(), walk() and the small movement helpers, the town cast, and the route resplice
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function fire_and_forget_move(dest, on_done) {
	Promise.resolve(smart_move(dest, on_done)).catch(() => { });
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
	smart._interrupt(reason);
	smart.moving = false;
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
	if (smart.moving) smart._interrupt("interrupted");

	let resolve_fn, reject_fn;
	let timeout_id = null;
	let settled = false;
	const town_allowed = !!options.town;

	function complete(success, reason = null) {
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

	smart._interrupt = (reason = "interrupted") => complete(false, reason);
	smart.map = destination.map || character.map;
	smart.x = destination.x;
	smart.y = destination.y;

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
		if (settled) return false;

		if (
			character.map === target_map &&
			Math.hypot(character.x - target_x, character.y - target_y) < arrive_radius
		) {
			complete(true);
			return false;
		}

		if (!smart.moving) {
			if (is_transporting(character)) return 200;
			complete(false, "movement stopped");
			return false;
		}

		return 200;
	}

	every("move monitor", { ms: 200, kind: "automation", after: 200 }, monitor_movement);

	timeout_id = setTimeout(() => complete(false, MOVE_TIMEOUT_REASON), options.timeout || 120000);

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
	smart._interrupt = () => { };
	smart_move_logic = routed_smart_move_logic;
});
