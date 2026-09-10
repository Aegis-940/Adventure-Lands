// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT — smarter_move(), move_to_character(), bscorpion/primling farm, combat orbit
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

// The pathfinder's town-teleport edge. OFF — it cost more than it saved.
//
// What it does when on: the BFS adds an edge to the CURRENT map's spawns[0] and the executor calls
// use("town") on reaching that node, a 3s channel. See GAME_API_REFERENCE.md, which stays accurate
// whether or not we use it.
//
// Why it is off:
//   - The channel cannot survive being hit, and any action taken during it cancels it. Several
//     loops run independently of movement (potions, mluck, the stand), so cancellations are
//     routine rather than exceptional. That is what stopped the merchant reaching the bank.
//   - The flag is read INSIDE the BFS at every node expansion, not once at search start, so
//     anything that changes it mid-search yields a route computed half one way and half the other.
//   - Its value was always marginal: the destination is the current map's spawn, which is the town
//     centre on `main` but the entrance at (0,-16) on `tunnel`, nowhere near the mole spot.
//
// One switch, deliberately, rather than deletions scattered across two files: panic_check()
// (Shared/Party_And_Loot.js) reads this too, and its "turn the edge off while monsters are on us"
// logic is kept intact behind it. Set true to re-enable and nothing else needs changing.
//
// This does NOT affect stuck_escape_check() below, which casts use_town directly as a last resort
// when a character is genuinely stranded on the wrong map. That is a different mechanism with its
// own paranoid guards, and it is the only way off the winterland island after an ice golem fight.
const SMART_USE_TOWN = false;

// Retried once because the runner globals may not exist at script-eval time.
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

// Critical function. Must be declared early.
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// True while a town channel or a door transition is in flight. Prefers the runner's own
// is_transporting(), which is what the move executor itself gates on; the c.town/c.transport
// fallback is there because this is called from a poll and must never throw.
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

// Cancels whatever journey is in flight, from either engine. Callers used to poke
// smart._interrupt directly, which only cancels a move that happens to be one of OURS — against a
// move issued straight through the runner's smart_move() (fire_and_forget_move) the slot holds a
// stale closure, and the only reason it worked at all was the smart.moving = false side effect.
// Clearing the flag explicitly is what actually stops the runner's executor, so do that too.
function stop_movement(reason = "interrupted") {
	try {
		if (typeof smart._interrupt === "function") smart._interrupt(reason);
	} catch (e) { /* already settled */ }
	try { smart.moving = false; } catch (e) { /* runner not up */ }
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
	// smart._interrupt is a single shared slot that outlives the move it belongs to, so a caller
	// reaching for it later can invoke an already-finished move a second time. A settled promise
	// ignores the extra resolve, but on_done does not — handle_events() passes a callback that
	// emits a game interaction, and it was reachable twice. Settle once.
	let settled = false;

	const MOVE_TIMEOUT = options.timeout || 120000; // 120s default

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

	// Captured, NOT read live off `smart` each poll. smart.map/x/y is one shared slot that the
	// runner's own smart_move() also writes, so a fire_and_forget_move() issued while this one is
	// in flight silently repointed the monitor at the OTHER destination — and this promise then
	// resolved "arrived" when the character reached somewhere it was never sent.
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
			// Mid-teleport is not stopped. A town node is a 3s channel and a door is a transition;
			// through either, the runner's executor stands down and smart.moving can read false
			// while the character is still very much on its way. Failing here rejected the
			// caller's await — which is how the merchant's bank trip started aborting the moment
			// town edges were switched on. Bounded: the channel clears within ~3s and the next
			// poll fails for real, and MOVE_TIMEOUT still backstops.
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

// Before this existed there were three independent movers writing one shared `smart` object at
// three different rates: main_loop's if/else chain at 100ms, anniversary_loop on its own 2s timer,
// and party_cohesion_hold(). Every bug in this subsystem was two of them fighting — a cancel that
// reset a BFS before it could finish, a monitor watching a destination another caller had already
// overwritten, smart.moving left true with nothing behind it. Each fix added another interlock
// between movers rather than removing a mover.
//
// So: callers no longer move. They describe where they want to be, movement_goal() picks one
// winner, and this is the only code that issues, re-issues or cancels a journey.
//
// A goal is one of:
//   null                              nothing to travel to — the caller's local movement runs
//   { local: "<name>", label }        same, but the caller runs THAT local behaviour
//   { hold: true, label }             stand still; stop any journey we own
//   { label, map, x, y, radius }      travel there
//   { label, to, on_arrive }          travel to a named runner destination ("town")
//
// Returns true when the arbiter is in control this tick, i.e. the caller must not move.

const TRAVEL_REISSUE_MS = 3000;  // floor between journeys, so a BFS gets time to finish
const TRAVEL_REGOAL_MS = 500;    // shorter floor when the goal itself changed — that is news
const TRAVEL_DRIFT = 80;         // destination must move this far to be worth re-pathing
const TRAVEL_ARRIVE = 40;        // default arrival radius
const TRAVEL_STALL_MS = 8000;      // no ground covered for this long while travelling — re-path
const TRAVEL_STALL_EPS = 30;       // movement under this is not progress
const TRAVEL_SEARCH_MAX_MS = 20000; // a BFS that has not resolved by now is not going to

let _travel = { label: null, at: 0, interrupt: null, anchor: null, anchor_at: 0, search_since: 0 };

// Only ever cancels a journey THIS arbiter started. A merchant task, a looting hop or anything
// else that still moves on its own is not ours to end.
function travel_release() {
	if (_travel.interrupt && smart.moving && smart._interrupt === _travel.interrupt) {
		stop_movement("arbiter: released");
	}
	_travel.interrupt = null;
	_travel.anchor = null;   // standing still on purpose is not a stall
	_travel.search_since = 0;
	// _travel.label is deliberately KEPT. It answers "did the destination change", and clearing it
	// here made every flicker between a local goal and a travel goal — which is one can_move_to()
	// away at any obstacle edge — look like a brand new goal. That dropped the re-issue floor from
	// 3s to 500ms and cancelled the pathfind twice a second.
}

function travel_arbiter(goal) {
	if (!goal || goal.local) {
		travel_release();
		return false;
	}

	if (goal.hold) {
		travel_release(); // also clears the progress anchor — holding is not stalling
		if (smart.moving) stop_movement("arbiter: " + goal.label);
		if (_travel.label !== goal.label) log(`🧭 ${goal.label}`, "#8899aa", "Alerts");
		_travel.label = goal.label;
		return true;
	}

	const now = Date.now();
	const label_changed = _travel.label !== goal.label;

	// Named destinations go through the runner's own resolver, which knows strings like "town"
	// that smarter_move() cannot resolve from `locations` or G.maps.
	if (goal.to) {
		if (!smart.moving && (label_changed || now - _travel.at > TRAVEL_REISSUE_MS)) {
			_travel.at = now;
			_travel.label = goal.label;
			_travel.interrupt = null; // runner smart_move installs no interrupt of its own
			fire_and_forget_move({ to: goal.to }, goal.on_arrive);
		}
		return true;
	}

	const map = goal.map || character.map;
	const radius = goal.radius || TRAVEL_ARRIVE;

	if (character.map === map && Math.hypot(character.x - goal.x, character.y - goal.y) <= radius) {
		travel_release();
		return false; // arrived — the caller's local movement takes it from here
	}

	const ours = smart.moving && _travel.interrupt && smart._interrupt === _travel.interrupt;
	// Somebody else's journey while we want to be elsewhere. Taking it over is right: after this
	// refactor nothing else should be issuing one, and a stranded smart.moving with no mover behind
	// it looks exactly the same from here.
	const foreign = smart.moving && !ours;
	const drifted = !smart.moving
		|| smart.map !== map
		|| Math.hypot(smart.x - goal.x, smart.y - goal.y) > TRAVEL_DRIFT;

	// A BFS already in flight. Re-issuing resets queue/visited/start and throws away everything it
	// has computed, so any re-issue cadence shorter than the search itself means the search can
	// never finish — the character just stands there "searching" forever. Let it run.
	//
	// Guarded by a ceiling rather than trusted outright: a search that has not resolved in
	// TRAVEL_SEARCH_MAX_MS is not going to, and these are runner-internal fields, so refusing to
	// act on them indefinitely would trade one permanent stall for another.
	const searching = !!smart.searching && !smart.found;
	if (searching && !_travel.search_since) _travel.search_since = now;
	if (!searching && _travel.search_since) {
		_travel.search_since = 0;
		_travel.anchor = null; // the walk starts now — do not charge the search to the stall clock
	}
	const search_overrun = _travel.search_since > 0 && now - _travel.search_since > TRAVEL_SEARCH_MAX_MS;

	// PROGRESS WATCHDOG. Everything above is blind to the one failure that matters most.
	//
	// The moment a move is issued, smart.x/y IS the goal, so the drift term is 0 and smart.map
	// matches — which makes `drifted` false for as long as smart.moving stays true, and `foreign`
	// false because the move is ours. Nothing could re-issue. And smart.moving stays true for the
	// whole time the runner's BFS is grinding, including on a route it never resolves, so the
	// character stood still until MOVE_TIMEOUT 90s later. That is the "walked for ten seconds then
	// stalled without leaving the map" failure.
	//
	// Covering ground is the only honest evidence a journey is working, so track that directly —
	// but not while the pathfinder is legitimately still searching, which is what the ceiling above
	// is for instead.
	const teleporting = is_teleporting(); // a town channel or a door is progress, just invisible
	const moved = !_travel.anchor
		|| _travel.anchor.map !== character.map
		|| Math.hypot(character.x - _travel.anchor.x, character.y - _travel.anchor.y) > TRAVEL_STALL_EPS;

	if (moved || teleporting) {
		_travel.anchor = { map: character.map, x: character.x, y: character.y };
		_travel.anchor_at = now;
	}
	const stalled = !moved && !teleporting && !searching && now - _travel.anchor_at > TRAVEL_STALL_MS;

	// Nothing re-issues over a live search except the search having run too long.
	if (searching && !search_overrun) return true;

	const floor = label_changed ? TRAVEL_REGOAL_MS : TRAVEL_REISSUE_MS;
	if (now - _travel.at > floor && (drifted || foreign || stalled || search_overrun)) {
		if (stalled) log(`🧭 Re-pathing "${goal.label}" — no ground covered in ${TRAVEL_STALL_MS / 1000}s.`, "#FFA500", "Alerts");
		if (search_overrun) log(`🧭 Re-pathing "${goal.label}" — pathfinder still searching after ${TRAVEL_SEARCH_MAX_MS / 1000}s.`, "#FFA500", "Alerts");
		if (smart.moving) stop_movement("arbiter: " + goal.label);
		_travel.at = now;
		if (_travel.label !== goal.label) log(`🧭 ${goal.label}`, "#8899aa", "Alerts");
		_travel.label = goal.label;
		_travel.anchor = null; // fresh progress window for the new attempt
		Promise.resolve(smarter_move({ map, x: goal.x, y: goal.y }, null,
			{ timeout: 90000, radius })).catch(() => { });
		_travel.interrupt = smart._interrupt;
	}
	return true;
}

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
// STUCK ESCAPE — last resort when pathfinding cannot leave where we are
// --------------------------------------------------------------------------------------------------------------------------------- //

// Engaging the Ice Golem strands you on a winterland island with no walkable route off it;
// smart_move then retries forever. `use_town` ("Teleports you to the center of the map",
// 3s channel, no cooldown) is the only way out.
//
// Deliberately paranoid, because a false positive teleports a healthy character out of a
// fight: every cheaper explanation for "not moving" has to be ruled out first. Standing
// still is normal for this bot (reposition() often decides to stay put), so stillness alone
// proves nothing — it only counts when we're also on the wrong map entirely.
const STUCK_MOVE_EPSILON = 20;             // movement under this isn't progress
const STUCK_REQUIRED_MS = 60000;           // must look stuck this long before escaping
const STUCK_ESCAPE_COOLDOWN_MS = 300000;   // hard ceiling: at most once per 5 minutes
const STUCK_ENEMY_RADIUS = 300;            // a monster this close means we're fighting, not stuck

let _stuck_anchor = null;
let _stuck_since = 0;
let _last_stuck_escape = 0;

function stuck_escape_check() {
	// Fighters only — reads `destination`, which the merchant doesn't define.
	if (typeof destination === "undefined") return;
	if (character.rip) return;

	// Standing with the leader is not being stuck, whatever map we are on. `destination` is a
	// follower's FARM spot, and they now legitimately live wherever she is — so a follower waiting
	// beside her in town during an anniversary round reads as "wrong map, no progress, no monsters"
	// and, after sixty seconds, teleported itself away from the party.
	if (typeof follow_has_leader === "function" && follow_has_leader()) {
		const lead = get_player(MOVEMENT_LEADER);
		if (lead && !lead.rip) { _stuck_anchor = null; return; }
	}

	// Being on the map we're supposed to be on IS the definition of not stuck. Several `locations`
	// entries carry no map at all (cgoo, ent), and `character.map === undefined` is never true —
	// so those targets failed this test forever and could earn a use_town for standing still at
	// their own farm spot. Treat a mapless destination as "wherever we are".
	const home_map = destination.map || character.map;
	if (character.map === home_map) { _stuck_anchor = null; return; }

	// Never teleport out of an instance (spider dungeon) — that abandons the run, and
	// giantspider mode drives movement through follow_healer() rather than destination.
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
	if (character.c?.town) return;                                    // already channelling out
	if (now - _last_stuck_escape < STUCK_ESCAPE_COOLDOWN_MS) return;

	// Standing still next to monsters means we're fighting, not trapped. This also keeps us
	// from burning the escape on a channel that incoming damage would just cancel — the
	// stuck timer keeps running, so it fires as soon as we're genuinely clear.
	const enemy_near = Object.values(parent.entities).some(e =>
		e?.type === "monster" && !e.dead && distance(character, e) < STUCK_ENEMY_RADIUS
	);
	if (enemy_near) return;
	if (get_num_targets(character.name) > 0) return;

	_last_stuck_escape = now;
	_stuck_since = now; // don't re-fire on the next tick if the teleport fails
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

// smart.moving isn't a safe gate for the positioning loops below — smart_move can drop it false for a tick
// between BFS waypoint recalcs, letting a stray move() knock the character off path. Gate on actual arrival instead.
function is_at_bscorpion_farm() {
	return character.map === PRIM_FARM_LOC.map &&
		Math.hypot(character.x - PRIM_FARM_LOC.x, character.y - PRIM_FARM_LOC.y) < PRIM_FARM_RADIUS + 30;
}

// smart_move() returns a promise that rejects when the move is interrupted or cannot path at all.
// Several callers deliberately don't await it — follow_healer() interrupts moves on purpose — so
// without a catch every one of those rejections surfaces as "Uncaught (in promise)", which is what
// fills the console during normal farming. Swallowing is right here: each caller re-issues on its
// own next tick, and a destination that is genuinely unreachable is handled by stuck_escape_check().
function fire_and_forget_move(dest, on_done) {
	try {
		Promise.resolve(smart_move(dest, on_done)).catch(() => {});
	} catch (e) { /* smart_move threw synchronously */ }
}

// handle_bscorpion_farm_approach() lived here. movement_goal() emits a bscorpion goal instead and
// the arbiter walks it, so the approach shares the one re-issue throttle with every other journey.

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

