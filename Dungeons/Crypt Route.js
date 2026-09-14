// --------------------------------------------------------------------------------------------------------------------------------- //
// CRYPT ROUTE — the waypoint circuit, what each leg is hunting, and when to back out
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRYPT_ROUTE = [
	{ n: 1, x: 1777, y: -1509, hunt: ["a3"] },
	{ n: 2, x: 731, y: -1074, hunt: ["a7"] },
	{ n: 3, x: 738, y: -614, hunt: ["a7"] },
	{ n: 4, x: 952, y: -527, hunt: ["vbat", "a2"] },
	{ n: 5, x: 1186, y: -379, hunt: ["vbat", "a2"] },
];

const CRYPT_ROUTE_ALLOWED = ["a3", "a7", "a2"];
const CRYPT_ROUTE_POLL_MS = 500;
const CRYPT_ROUTE_SIGHT = 400;
const CRYPT_CHASE_SIGHT = 700;
const CRYPT_CHASE_STEP = 80;
const CRYPT_ENGAGE_RANGE = 60;
const CRYPT_FIGHT_TIMEOUT_MS = 4 * 60 * 1000;
const CRYPT_RETREAT_SETTLE_MS = 4000;

let _crypt_route_running = false;
let _crypt_route_abort = false;

function crypt_route_running() {
	return _crypt_route_running;
}

function stop_crypt_route() {
	if (!_crypt_route_running) return;
	_crypt_route_abort = true;
	log("Crypt route: stopping after this step", DUNGEON_WARN_COLOR, "Alerts");
}

function crypt_waypoint(n) {
	return CRYPT_ROUTE.find(w => w.n === n) || null;
}

function crypt_visible(mtypes, radius = CRYPT_ROUTE_SIGHT) {
	const out = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (!mtypes.includes(e.mtype)) continue;
		if (Math.hypot(character.x - e.x, character.y - e.y) > radius) continue;
		out.push(e);
	}
	return out;
}

function crypt_intruders() {
	return crypt_visible(CRYPT_BOSS_TYPES.filter(m => !CRYPT_ROUTE_ALLOWED.includes(m)));
}

function crypt_leg_done(wp) {
	return wp.hunt.every(m => dungeon_target_done(m));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LEGS
// --------------------------------------------------------------------------------------------------------------------------------- //

function crypt_opportunity() {
	const quota = dungeon_quota() || {};
	const wanted = Object.keys(quota).filter(m => !dungeon_target_done(m));
	if (!wanted.length) return null;

	const seen = crypt_visible(wanted);
	if (!seen.length) return null;

	seen.sort((a, b) =>
		Math.hypot(character.x - a.x, character.y - a.y) - Math.hypot(character.x - b.x, character.y - b.y));
	return seen[0];
}

function crypt_step_toward(target) {
	if (smart.moving) return;
	const dx = target.x - character.x;
	const dy = target.y - character.y;
	const d = Math.hypot(dx, dy) || 1;
	const step = Math.min(CRYPT_CHASE_STEP, d);
	const x = character.x + (dx / d) * step;
	const y = character.y + (dy / d) * step;
	if (can_move_to(x, y)) move(x, y);
	else dungeon_travel({ map: "crypt", x: target.x, y: target.y }).catch(() => { });
}

async function crypt_engage(wp, quarry) {
	const mtype = quarry.mtype;
	const name = (G.monsters[mtype] || {}).name || mtype;
	log(`Crypt route: engaging ${name}`, DUNGEON_LOG_COLOR, "Alerts");
	dungeon_telemetry_event("engage", { wp: wp.n, mtype });

	const until = Date.now() + CRYPT_FIGHT_TIMEOUT_MS;
	while (Date.now() < until) {
		if (_crypt_route_abort) return "abort";
		if (character.rip) return "dead";
		if (crypt_intruders().length) return "intruder";
		if (dungeon_target_done(mtype)) break;

		const live = crypt_visible([mtype], CRYPT_CHASE_SIGHT);
		if (!live.length) break;

		const target = live[0];
		if (Math.hypot(character.x - target.x, character.y - target.y) > CRYPT_ENGAGE_RANGE) {
			crypt_step_toward(target);
		} else if (smart.moving) {
			stop_movement("crypt route: in range");
		}

		await delay(CRYPT_ROUTE_POLL_MS);
	}

	const timed_out = Date.now() >= until;
	if (smart.moving) stop_movement("crypt route: engagement over");
	if (crypt_leg_done(wp)) return "done";
	if (timed_out) {
		log(`Crypt route: gave up on ${name} after ${CRYPT_FIGHT_TIMEOUT_MS / 60000} min`, DUNGEON_WARN_COLOR, "Alerts");
		return "timeout";
	}
	return "resume";
}

async function crypt_retreat(wp) {
	const who = crypt_intruders().map(e => (G.monsters[e.mtype] || {}).name || e.mtype).join(", ");
	await dungeon_bail_out(who ? `${who} blocking waypoint ${wp.n}` : `waypoint ${wp.n} unsafe`);
	await delay(CRYPT_RETREAT_SETTLE_MS);
}

async function crypt_advance(wp) {
	let settled = false;
	const travel = dungeon_travel({ map: "crypt", x: wp.x, y: wp.y })
		.then(() => { settled = true; }, () => { settled = true; });

	while (!settled) {
		if (_crypt_route_abort) { stop_movement("crypt route: aborted"); await travel; return "abort"; }
		if (character.rip) { stop_movement("crypt route: dead"); await travel; return "dead"; }

		if (crypt_intruders().length) {
			stop_movement("crypt route: intruder");
			await travel;
			return "intruder";
		}

		if (crypt_leg_done(wp)) {
			stop_movement("crypt route: leg already done");
			await travel;
			return "done";
		}

		if (crypt_opportunity()) {
			stop_movement("crypt route: quarry sighted");
			await travel;
			return "interrupted";
		}

		await delay(CRYPT_ROUTE_POLL_MS);
	}

	return "arrived";
}

async function crypt_leg(wp) {
	log(`Crypt route: heading for waypoint ${wp.n} (${wp.x}, ${wp.y})`, DUNGEON_LOG_COLOR, "Alerts");
	dungeon_telemetry_event("leg_start", { wp: wp.n, hunt: wp.hunt.join(",") });

	let arrived = false;

	while (true) {
		if (_crypt_route_abort) return "abort";
		if (character.rip) return "dead";
		if (crypt_intruders().length) return "intruder";
		if (crypt_leg_done(wp)) return "done";

		const quarry = crypt_opportunity();
		if (quarry) {
			const outcome = await crypt_engage(wp, quarry);
			if (outcome !== "resume") return outcome;
			continue;
		}

		if (arrived) return "arrived";

		const step = await crypt_advance(wp);
		if (step === "arrived") { arrived = true; continue; }
		if (step !== "interrupted") return step;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CIRCUIT
// --------------------------------------------------------------------------------------------------------------------------------- //

async function run_crypt_route() {
	if (_crypt_route_running) return log("Crypt route: already running", DUNGEON_WARN_COLOR);
	if (character.map !== "crypt") return log("Crypt route: not in the crypt", DUNGEON_WARN_COLOR);
	if (character.name !== MOVEMENT_LEADER) return log("Crypt route: only the leader drives the route", DUNGEON_WARN_COLOR);

	_crypt_route_running = true;
	_crypt_route_abort = false;
	reset_dungeon_progress();
	log("Crypt route: starting", DUNGEON_LOG_COLOR, "Alerts");

	try {
		for (const wp of CRYPT_ROUTE) {
			if (_crypt_route_abort) break;

			const outcome = await crypt_leg(wp);

			if (outcome === "dead") {
				log("Crypt route: died — stopping", DUNGEON_WARN_COLOR, "Alerts");
				break;
			}

			if (outcome === "intruder") {
				const who = crypt_intruders().map(e => (G.monsters[e.mtype] || {}).name || e.mtype).join(", ");
				log(`Crypt route: ${who || "a boss"} in the way — waypoint ${wp.n} abandoned`, DUNGEON_WARN_COLOR, "Alerts");
				await crypt_retreat(wp);
			}

			log(`Crypt route: waypoint ${wp.n} complete (${outcome})`, DUNGEON_LOG_COLOR, "Alerts");
			dungeon_telemetry_event("leg_end", { wp: wp.n, outcome, kills: Object.assign({}, _dungeon_kills) });
			await handle_looting();
		}

		dungeon_progress_report();
		log("Crypt route: circuit finished", DUNGEON_LOG_COLOR, "Alerts");

	} catch (e) {
		catcher(e, "run_crypt_route");
	} finally {
		_crypt_route_running = false;
		_crypt_route_abort = false;
	}
}
