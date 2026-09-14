// --------------------------------------------------------------------------------------------------------------------------------- //
// CRYPT ROUTE — the waypoint circuit, what each leg is hunting, and when to back out
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRYPT_ROUTE = [
	{ n: 1, x: 1777, y: -1509, hunt: ["a3"] },
	{ n: 2, x: 731, y: -1074, hunt: ["a7"] },
	{ n: 3, x: 738, y: -614, hunt: ["a7"], mp_after: 0.8 },
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
const CRYPT_PANIC_RETRIES = 2;
const CRYPT_CALM_TIMEOUT_MS = 90000;
const CRYPT_MANA_TIMEOUT_MS = 3 * 60 * 1000;
const CRYPT_DEFAULT_RANK = 5;
const CRYPT_PATH_THRESHOLD = 250;
const CRYPT_REPATH_EPS = 150;
const CRYPT_LOST_GRACE_MS = 5000;
const CRYPT_MAX_STUMBLES = 5;

const CRYPT_TARGET_RULES = {
	a7: { sight: Infinity, rank: 0 },
	a3: { sight: 600, rank: 1 },
	a2: { sight: 500, rank: 2 },
};

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

function crypt_ejected() {
	return character.map !== DUNGEONS.crypt.map;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LEGS
// --------------------------------------------------------------------------------------------------------------------------------- //

function crypt_sight(mtype) {
	const rule = CRYPT_TARGET_RULES[mtype];
	return rule && rule.sight !== undefined ? rule.sight : CRYPT_ROUTE_SIGHT;
}

function crypt_rank(mtype) {
	const rule = CRYPT_TARGET_RULES[mtype];
	return rule && rule.rank !== undefined ? rule.rank : CRYPT_DEFAULT_RANK;
}

function crypt_opportunity() {
	const quota = dungeon_quota() || {};
	const suppressed = dungeon_suppressed_types() || [];
	const wanted = Object.keys(quota)
		.filter(m => !dungeon_target_done(m))
		.filter(m => !suppressed.includes(m));
	if (!wanted.length) return null;

	const seen = [];
	for (const mtype of wanted) {
		for (const e of crypt_visible([mtype], crypt_sight(mtype))) seen.push(e);
	}
	if (!seen.length) return null;

	seen.sort((a, b) => {
		const rank = crypt_rank(a.mtype) - crypt_rank(b.mtype);
		if (rank) return rank;
		return Math.hypot(character.x - a.x, character.y - a.y) - Math.hypot(character.x - b.x, character.y - b.y);
	});
	return seen[0];
}

let _crypt_quarry_id = null;

function crypt_pick_quarry(mtype) {
	const live = crypt_visible([mtype], Math.max(CRYPT_CHASE_SIGHT, crypt_sight(mtype)));
	if (!live.length) return null;

	if (_crypt_quarry_id) {
		const held = live.find(e => e.id === _crypt_quarry_id);
		if (held) return held;
	}

	live.sort((a, b) => (a.hp || 0) - (b.hp || 0));
	return live[0];
}

function crypt_hold_quarry(id) {
	if (_crypt_quarry_id === id) return;
	_crypt_quarry_id = id;
	set_dungeon_focus_target(id);
	send_cm(DUNGEON_FOLLOWERS, { type: "dungeon_focus", id });
}

function crypt_release_quarry() {
	if (_crypt_quarry_id === null) return;
	_crypt_quarry_id = null;
	_crypt_path_to = null;
	set_dungeon_focus_target(null);
	send_cm(DUNGEON_FOLLOWERS, { type: "dungeon_focus", id: null });
}

let _crypt_path_to = null;

function crypt_step_toward(target) {
	if (smart.moving) return;
	const dx = target.x - character.x;
	const dy = target.y - character.y;
	const d = Math.hypot(dx, dy) || 1;

	if (d > CRYPT_PATH_THRESHOLD) {
		if (_crypt_path_to
			&& Math.hypot(_crypt_path_to.x - target.x, _crypt_path_to.y - target.y) < CRYPT_REPATH_EPS) return;
		_crypt_path_to = { x: target.x, y: target.y };
		dungeon_travel({ map: "crypt", x: target.x, y: target.y }).catch(() => { });
		return;
	}

	_crypt_path_to = null;

	const step = Math.min(CRYPT_CHASE_STEP, d);
	const x = character.x + (dx / d) * step;
	const y = character.y + (dy / d) * step;
	if (can_move_to(x, y)) move(x, y);
	else dungeon_travel({ map: "crypt", x: target.x, y: target.y }).catch(() => { });
}

async function crypt_engage(wp, quarry) {
	const mtype = quarry.mtype;
	const name = (G.monsters[mtype] || {}).name || mtype;
	const opened_at = Math.round(Math.hypot(character.x - quarry.x, character.y - quarry.y));
	log(`Crypt route: engaging ${name} at ${opened_at}`, DUNGEON_LOG_COLOR, "Alerts");
	dungeon_telemetry_event("engage", { wp: wp.n, mtype, distance: opened_at });

	const until = Date.now() + CRYPT_FIGHT_TIMEOUT_MS;
	let lost_since = 0;
	try {
		while (Date.now() < until) {
			if (_crypt_route_abort) return "abort";
			if (character.rip) return "dead";
			if (crypt_ejected()) return "ejected";
			if (panicking) return "panic";
			if (crypt_intruders().length) return "intruder";
			if (dungeon_target_done(mtype)) break;

			const target = crypt_pick_quarry(mtype);
			if (!target) {
				if (!lost_since) lost_since = Date.now();
				if (Date.now() - lost_since >= CRYPT_LOST_GRACE_MS) break;
				await delay(CRYPT_ROUTE_POLL_MS);
				continue;
			}
			lost_since = 0;

			crypt_hold_quarry(target.id);

			if (Math.hypot(character.x - target.x, character.y - target.y) > CRYPT_ENGAGE_RANGE) {
				crypt_step_toward(target);
			} else if (smart.moving) {
				stop_movement("crypt route: in range");
			}

			await delay(CRYPT_ROUTE_POLL_MS);
		}
	} finally {
		crypt_release_quarry();
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

async function crypt_retreat(wp, reason) {
	const who = crypt_intruders().map(e => (G.monsters[e.mtype] || {}).name || e.mtype).join(", ");
	await dungeon_bail_out(reason || (who ? `${who} blocking waypoint ${wp.n}` : `waypoint ${wp.n} unsafe`));
	await delay(CRYPT_RETREAT_SETTLE_MS);
}

async function crypt_wait_for_mana(pct) {
	const want = () => character.max_mp * pct;
	if (character.mp >= want()) return true;

	log(`Crypt route: holding for mana — ${Math.round(100 * character.mp / character.max_mp)}% of ${Math.round(pct * 100)}%`,
		DUNGEON_LOG_COLOR, "Alerts");
	dungeon_telemetry_event("mana_hold", { mp_pct: +(character.mp / character.max_mp).toFixed(2), want: pct });

	const until = Date.now() + CRYPT_MANA_TIMEOUT_MS;
	while (Date.now() < until) {
		if (_crypt_route_abort || character.rip || crypt_ejected()) return false;
		if (crypt_intruders().length) {
			log("Crypt route: mana hold broken — boss in view", DUNGEON_WARN_COLOR, "Alerts");
			return false;
		}
		if (character.mp >= want()) {
			log(`Crypt route: mana ready (${Math.round(100 * character.mp / character.max_mp)}%)`, DUNGEON_LOG_COLOR, "Alerts");
			return true;
		}
		await delay(CRYPT_ROUTE_POLL_MS);
	}

	log("Crypt route: mana never reached target — carrying on", DUNGEON_WARN_COLOR, "Alerts");
	return false;
}

async function crypt_wait_for_calm() {
	const until = Date.now() + CRYPT_CALM_TIMEOUT_MS;
	while (Date.now() < until) {
		if (!panicking && !character.rip) return true;
		await delay(CRYPT_ROUTE_POLL_MS);
	}
	log("Crypt route: panic never cleared", DUNGEON_WARN_COLOR, "Alerts");
	return false;
}

async function crypt_advance(wp) {
	let settled = false;
	let reached = false;
	const travel = dungeon_travel({ map: "crypt", x: wp.x, y: wp.y })
		.then(() => { reached = true; settled = true; }, () => { settled = true; });

	while (!settled) {
		if (_crypt_route_abort) { stop_movement("crypt route: aborted"); await travel; return "abort"; }
		if (character.rip) { stop_movement("crypt route: dead"); await travel; return "dead"; }
		if (crypt_ejected()) { stop_movement("crypt route: ejected"); await travel; return "ejected"; }
		if (panicking) { stop_movement("crypt route: panic"); await travel; return "panic"; }

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

	return reached ? "arrived" : "interrupted";
}

async function crypt_leg(wp) {
	log(`Crypt route: heading for waypoint ${wp.n} (${wp.x}, ${wp.y})`, DUNGEON_LOG_COLOR, "Alerts");
	dungeon_telemetry_event("leg_start", { wp: wp.n, hunt: wp.hunt.join(",") });

	let arrived = false;
	let stumbles = 0;

	while (true) {
		if (_crypt_route_abort) return "abort";
		if (character.rip) return "dead";
		if (crypt_ejected()) return "ejected";
		if (panicking) return "panic";
		if (crypt_intruders().length) return "intruder";
		if (crypt_leg_done(wp)) return "done";

		const quarry = crypt_opportunity();
		if (quarry) {
			stumbles = 0;
			const outcome = await crypt_engage(wp, quarry);
			if (outcome !== "resume") return outcome;
			continue;
		}

		if (arrived) return "arrived";

		const step = await crypt_advance(wp);
		if (step === "arrived") { arrived = true; stumbles = 0; continue; }
		if (step !== "interrupted") return step;

		if (++stumbles >= CRYPT_MAX_STUMBLES) {
			log(`Crypt route: cannot reach waypoint ${wp.n} — moving on`, DUNGEON_WARN_COLOR, "Alerts");
			return "unreachable";
		}
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

			let outcome = await crypt_leg(wp);
			let panics = 0;

			while (outcome === "panic" && !_crypt_route_abort) {
				panics++;
				log(`Crypt route: panic at waypoint ${wp.n} — falling back to the entrance (${panics}/${CRYPT_PANIC_RETRIES})`,
					DUNGEON_WARN_COLOR, "Alerts");
				dungeon_telemetry_event("panic_retreat", { wp: wp.n, attempt: panics });

				await crypt_retreat(wp, `panic at waypoint ${wp.n}`);
				await crypt_wait_for_calm();

				if (panics >= CRYPT_PANIC_RETRIES) {
					log(`Crypt route: waypoint ${wp.n} abandoned after ${panics} panics`, DUNGEON_WARN_COLOR, "Alerts");
					outcome = "panic-abandoned";
					break;
				}
				if (character.rip) { outcome = "dead"; break; }
				outcome = await crypt_leg(wp);
			}

			if (outcome === "dead" || outcome === "ejected") {
				log(outcome === "dead"
					? "Crypt route: died — this instance is over, starting a fresh one"
					: "Crypt route: no longer in the crypt — this instance is over, starting a fresh one",
					DUNGEON_WARN_COLOR, "Alerts");
				dungeon_telemetry_event("run_abandoned", { wp: wp.n, outcome });
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

			if (wp.mp_after && !_crypt_route_abort) await crypt_wait_for_mana(wp.mp_after);
		}

		dungeon_progress_report();
		log("Crypt route: circuit finished", DUNGEON_LOG_COLOR, "Alerts");

	} catch (e) {
		catcher(e, "run_crypt_route");
	} finally {
		_crypt_route_running = false;
		_crypt_route_abort = false;
		crypt_release_quarry();
	}
}
