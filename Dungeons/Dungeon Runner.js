// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON RUNNER — the shared machinery every dungeon run is driven by
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_BOSS_TIMEOUT_MS = 10 * 60 * 1000;
const DUNGEON_PARTY_TIMEOUT_MS = 2 * 60 * 1000;
const DUNGEON_JOIN_MAX_ATTEMPTS = 30;
const DUNGEON_JOIN_INTERVAL_MS = 400;
const DUNGEON_FOLLOWERS = ["Ulric", "Riva"];
const DUNGEON_PARTY = ["Myras", "Ulric", "Riva"];
const DUNGEON_LOG_COLOR = "#AA88FF";
const DUNGEON_WARN_COLOR = "#FF8844";

let _dungeon_running = false;
let _dungeon_join_interval = null;

function dungeon_log(dungeon, message, color = DUNGEON_LOG_COLOR) {
	log(`${dungeon.name}: ${message}`, color);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON MODE — which dungeon this character is configured for, and how it bends the shared systems
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_OVERRIDE_KEY = "AL_dungeon_mode";

let _dungeon_override = null;
let _active_dungeon_cache;

try {
	_dungeon_override = localStorage.getItem(DUNGEON_OVERRIDE_KEY) || null;
} catch (e) {
	_dungeon_override = null;
}

function dungeon_override() {
	return _dungeon_override;
}

function set_dungeon_override(key) {
	_dungeon_override = key || null;
	_active_dungeon_cache = undefined;
	try {
		if (_dungeon_override) localStorage.setItem(DUNGEON_OVERRIDE_KEY, _dungeon_override);
		else localStorage.removeItem(DUNGEON_OVERRIDE_KEY);
	} catch (e) { }
}

function active_dungeon() {
	if (_active_dungeon_cache !== undefined) return _active_dungeon_cache;

	if (_dungeon_override && DUNGEONS[_dungeon_override]) {
		_active_dungeon_cache = DUNGEONS[_dungeon_override];
		return _active_dungeon_cache;
	}

	if (typeof home === "undefined") return null;

	_active_dungeon_cache = null;
	for (const key in DUNGEONS) {
		if (DUNGEONS[key].home === home) _active_dungeon_cache = DUNGEONS[key];
	}
	return _active_dungeon_cache;
}

function in_dungeon() {
	return !!active_dungeon();
}

function dungeon_flag(name) {
	const d = active_dungeon();
	return !!(d && d.flags && d.flags[name]);
}

function dungeon_setting(name, fallback) {
	const d = active_dungeon();
	if (!d || !d.flags || d.flags[name] === undefined) return fallback;
	return d.flags[name];
}

function dungeon_engage_radius() {
	return dungeon_setting("engage_radius", character.range);
}

function dungeon_target_weights(fallback) {
	return dungeon_flag("target_lowest_hp") ? { hp_low: 1 } : fallback;
}

function dungeon_sort_targets(list) {
	if (dungeon_flag("target_lowest_hp")) list.sort((a, b) => (a.hp || 0) - (b.hp || 0));
	else if (dungeon_flag("nearest_first")) list.sort((a, b) => parent.distance(character, a) - parent.distance(character, b));
	return list;
}

const DUNGEON_LOOT_MAX_MS = 30000;
const DUNGEON_LOOT_IDLE_ROUNDS = 3;
const DUNGEON_LOOT_ROUND_MS = 400;

async function dungeon_loot_everything() {
	const until = Date.now() + DUNGEON_LOOT_MAX_MS;
	let idle = 0;
	let last = -1;

	while (Date.now() < until) {
		const count = Object.keys(get_chests()).length;
		if (!count) break;

		if (count === last) {
			if (++idle >= DUNGEON_LOOT_IDLE_ROUNDS) {
				log(`Looting: ${count} chest(s) out of reach — moving on`, DUNGEON_WARN_COLOR);
				break;
			}
		} else {
			idle = 0;
		}
		last = count;

		await handle_looting();
		await delay(DUNGEON_LOOT_ROUND_MS);
	}

	const left = Object.keys(get_chests()).length;
	log(left ? `Looting: done, ${left} left behind` : "Looting: everything collected", DUNGEON_LOG_COLOR);
}

function dungeon_telemetry_event(event, data) {
	if (typeof errlog_sample !== "function") return;
	errlog_sample("dungeon_event", Object.assign({
		event,
		map: character.map,
		x: Math.round(character.x),
		y: Math.round(character.y),
	}, data || {}));
}

function dungeon_protected_keys() {
	const keys = [];
	for (const name in DUNGEONS) {
		if (DUNGEONS[name].key) keys.push(DUNGEONS[name].key);
	}
	return keys;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SCRIPTED TRAVEL — the arbiter releases any movement it did not order, so it has to stand down for ours
// --------------------------------------------------------------------------------------------------------------------------------- //

let _dungeon_moving = false;

function dungeon_moving() {
	if (typeof dungeon_bailing === "function" && dungeon_bailing()) return true;
	return _dungeon_moving;
}

async function dungeon_travel(destination) {
	_dungeon_moving = true;
	try {
		return await smarter_move(destination);
	} finally {
		_dungeon_moving = false;
	}
}

function dungeon_target_whitelist() {
	const d = active_dungeon();
	return d && d.only ? d.only : null;
}

function dungeon_avoids(mtype) {
	const d = active_dungeon();
	return !!(d && d.avoid && d.avoid.includes(mtype));
}

let _dungeon_focus_target_id = null;

function set_dungeon_focus_target(id) {
	_dungeon_focus_target_id = id || null;
}

function dungeon_focus_target() {
	if (!_dungeon_focus_target_id) return null;
	const e = parent.entities[_dungeon_focus_target_id];
	if (!e || e.dead || e.type !== "monster") {
		_dungeon_focus_target_id = null;
		return null;
	}
	return e;
}

const DUNGEON_FOCUS_TTL_MS = 200;

let _dungeon_focus_cache = null;
let _dungeon_focus_at = 0;

function dungeon_type_alive(mtype) {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && !e.dead && e.mtype === mtype) return true;
	}
	return false;
}

function dungeon_suppressed_types() {
	const now = Date.now();
	if (now - _dungeon_focus_at < DUNGEON_FOCUS_TTL_MS) return _dungeon_focus_cache;

	_dungeon_focus_at = now;
	_dungeon_focus_cache = null;

	const d = active_dungeon();
	if (!d || !d.focus) return null;

	for (const rule of d.focus) {
		if (dungeon_target_done(rule.when)) continue;
		if (!dungeon_type_alive(rule.when)) continue;
		if (!_dungeon_focus_cache) _dungeon_focus_cache = [];
		for (const m of rule.suppress) {
			if (!_dungeon_focus_cache.includes(m)) _dungeon_focus_cache.push(m);
		}
	}
	return _dungeon_focus_cache;
}

function dungeon_skip_target(mob) {
	const d = active_dungeon();
	if (!d || !mob) return false;
	if (d.avoid && d.avoid.includes(mob.mtype)) return true;
	if (mob.target && DUNGEON_PARTY.includes(mob.target)) return false;

	const suppressed = dungeon_suppressed_types();
	if (suppressed && suppressed.includes(mob.mtype)) return true;

	if (d.only && !d.only.includes(mob.mtype)) return true;
	return false;
}

function dungeon_aggro_suppressed() {
	const d = active_dungeon();
	if (!d || !d.suppress_aggro_when) return false;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (!d.suppress_aggro_when.includes(e.mtype)) continue;
		if (e.target && DUNGEON_PARTY.includes(e.target)) return true;
	}
	return false;
}

function start_active_dungeon_when_ready() {
	const d = active_dungeon();
	if (!d) return;
	if (d.route) return start_dungeon_loop();
	start_dungeon_when_ready(d);
}

function start_dungeon_loop() {
	if (character.name !== MOVEMENT_LEADER) return;
	setTimeout(() => {
		if (!active_dungeon() || _dungeon_loop_running) return;
		if (character.rip) return log("Dungeon loop: dead on startup — not starting", DUNGEON_WARN_COLOR);
		run_dungeon_loop();
	}, DUNGEON_START_DELAY_MS);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS DEATH DETECTION
// --------------------------------------------------------------------------------------------------------------------------------- //

function wait_for_death(mob_type, spawn_x, spawn_y, spawn_radius = 250) {
	return new Promise((resolve, reject) => {
		let consecutive_alive = 0;
		let confirmed_alive = false;
		let consecutive_dead = 0;
		const started = Date.now();

		const interval = setInterval(() => {
			if (Date.now() - started > DUNGEON_BOSS_TIMEOUT_MS) {
				clearInterval(interval);
				return reject(new Error(`${mob_type} not confirmed dead within ${DUNGEON_BOSS_TIMEOUT_MS / 60000} min`));
			}
			const near_spawn = Math.hypot(character.x - spawn_x, character.y - spawn_y) < spawn_radius;

			const alive = Object.values(parent.entities).some(
				e => e.type === "monster" && e.mtype === mob_type && !e.dead
			);

			if (alive) {
				consecutive_alive++;
				consecutive_dead = 0;
				if (consecutive_alive >= 3) confirmed_alive = true;
			} else if (confirmed_alive && near_spawn) {
				consecutive_alive = 0;
				consecutive_dead++;
				if (consecutive_dead >= 3) {
					clearInterval(interval);
					log(`[Dungeon] ${mob_type} confirmed dead`, DUNGEON_LOG_COLOR);
					resolve();
				}
			} else {
				consecutive_alive = 0;
				consecutive_dead = 0;
			}
		}, 500);

	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY ENTRY
// --------------------------------------------------------------------------------------------------------------------------------- //

function join_dungeon_instance(data) {
	const instance_id = data.in;
	const map = data.map || "spider_instance";
	if (_dungeon_join_interval) clearInterval(_dungeon_join_interval);

	_dungeon_moving = true;
	stop_movement("joining the instance");

	let attempts = 0;

	function finish(ok, message) {
		clearInterval(_dungeon_join_interval);
		_dungeon_join_interval = null;
		_dungeon_moving = false;
		if (ok) send_cm("Myras", { type: "instance_ready" });
		else game_log(message, "#FF3333");
	}

	function attempt() {
		if (character.map === map) return finish(true);
		if (++attempts > DUNGEON_JOIN_MAX_ATTEMPTS) {
			return finish(false, `❌ Gave up entering the instance after ${DUNGEON_JOIN_MAX_ATTEMPTS} attempts`);
		}
		Promise.resolve(enter(map, instance_id)).catch(() => { });
	}

	attempt();
	_dungeon_join_interval = setInterval(attempt, DUNGEON_JOIN_INTERVAL_MS);
}

const DUNGEON_EXIT_WAIT_MS = 3 * 60 * 1000;
const DUNGEON_EXIT_POLL_MS = 1000;

function followers_still_inside(dungeon) {
	return DUNGEON_FOLLOWERS.filter(name => {
		const s = read_state_cache(name);
		return s && s.map === dungeon.map;
	});
}

async function wait_for_party_out(dungeon) {
	if (!followers_still_inside(dungeon).length) return true;

	dungeon_log(dungeon, "Waiting for the party to clear the old instance...");
	const until = Date.now() + DUNGEON_EXIT_WAIT_MS;
	while (Date.now() < until) {
		if (!followers_still_inside(dungeon).length) {
			dungeon_log(dungeon, "Party is clear");
			return true;
		}
		await delay(DUNGEON_EXIT_POLL_MS);
	}

	dungeon_log(dungeon,
		`${followers_still_inside(dungeon).join(", ")} never left — entering anyway`, DUNGEON_WARN_COLOR);
	return false;
}

function wait_for_party_in_instance(dungeon) {
	return new Promise((resolve, reject) => {
		const confirmed = new Set();
		const timer = setTimeout(() => {
			remove_cm_listener(listener);
			reject(new Error(`party did not enter the instance within ${DUNGEON_PARTY_TIMEOUT_MS / 60000} min (${confirmed.size}/${DUNGEON_FOLLOWERS.length})`));
		}, DUNGEON_PARTY_TIMEOUT_MS);
		const listener = (name, data) => {
			if (data.type === "instance_ready" && DUNGEON_FOLLOWERS.includes(name)) {
				confirmed.add(name);
				dungeon_log(dungeon, `${name} entered instance (${confirmed.size}/${DUNGEON_FOLLOWERS.length})`);
				if (confirmed.size >= DUNGEON_FOLLOWERS.length) {
					clearTimeout(timer);
					remove_cm_listener(listener);
					resolve();
				}
			}
		};
		add_cm_listener(listener);
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RUN DRIVER
// --------------------------------------------------------------------------------------------------------------------------------- //

async function run_dungeon(dungeon) {
	if (_dungeon_running) {
		dungeon_log(dungeon, "Already running — ignoring duplicate start.", DUNGEON_WARN_COLOR);
		return false;
	}
	_dungeon_running = true;
	_dungeon_moving = true;
	set_suppress_reset(true);
	send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset" });
	try {
		if (dungeon.key && !has_dungeon_key(dungeon.key)) {
			dungeon_log(dungeon, `No ${dungeon.key} in hand — withdrawing every one from the bank...`);
			await withdraw_item(dungeon.key, null, dungeon.key_count);
			if (!has_dungeon_key(dungeon.key)) {
				dungeon_log(dungeon, `No ${dungeon.key} in the bank either — aborting.`, DUNGEON_WARN_COLOR);
				return false;
			}
		}

		dungeon_log(dungeon, "Moving to entrance...");
		await smarter_move(dungeon.entrance);
		dungeon_log(dungeon, "At entrance — entering instance...");
		await wait_for_party_out(dungeon);
		await delay(10000);
		enter(dungeon.map);
		await delay(10000);

		dungeon_log(dungeon, "Signalling party to enter instance...");
		send_cm(DUNGEON_FOLLOWERS, { type: "enter_instance", in: character.in, map: dungeon.map });

		await wait_for_party_in_instance(dungeon);

		_dungeon_moving = false;
		reset_dungeon_progress();
		dungeon_log(dungeon, "Full party in instance — proceeding");

		if (!dungeon.bosses || !dungeon.bosses.length) {
			dungeon_log(dungeon, "Party assembled");
			return true;
		}

		for (const boss of dungeon.bosses) {
			dungeon_log(dungeon, `Moving to ${boss.mtype}...`);
			await dungeon_travel({ map: dungeon.map, x: boss.x, y: boss.y });
			await delay(2000);
			await wait_for_death(boss.mtype, boss.x, boss.y);
			dungeon_log(dungeon, `${boss.mtype} dead — looting`);
			await handle_looting();
			await delay(10000);
		}

		dungeon_log(dungeon, "Complete — reloading party...");
		send_cm(DUNGEON_FOLLOWERS, { type: "reload" });
		await delay(500);
		parent.window.location.reload();

		return true;

	} catch (e) {
		catcher(e, "run_dungeon");
		dungeon_log(dungeon, "Entry aborted", DUNGEON_WARN_COLOR);
		return false;
	} finally {
		_dungeon_moving = false;
		_dungeon_running = false;
		if (!_dungeon_reset_hold) {
			set_suppress_reset(false);
			send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset", state: false });
		}
	}
}

let _dungeon_reset_hold = false;

function hold_reset_for_mode(on) {
	_dungeon_reset_hold = !!on;
	set_suppress_reset(!!on);
	send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset", state: !!on });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOP — toggle on runs dungeons back to back; toggle off finishes the run in flight and stops
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_LOOP_SETTLE_MS = 3000;
const DUNGEON_START_DELAY_MS = 5000;

let _dungeon_loop_running = false;

function dungeon_loop_running() {
	return _dungeon_loop_running;
}

function dungeon_route_runner() {
	const d = active_dungeon();
	if (!d || !d.route) return null;
	const fn = window[d.route];
	return typeof fn === "function" ? fn : null;
}

function dungeon_leave_runner() {
	const d = active_dungeon();
	if (!d || !d.leave) return null;
	const fn = window[d.leave];
	return typeof fn === "function" ? fn : null;
}

async function run_dungeon_loop() {
	if (_dungeon_loop_running) return;
	if (character.name !== MOVEMENT_LEADER) return;

	const route = dungeon_route_runner();
	if (!route) {
		const d = active_dungeon();
		log(`Dungeon loop: ${d ? d.route || "no route" : "no dungeon"} is not a loaded function`, DUNGEON_WARN_COLOR, "Alerts");
		return;
	}

	_dungeon_loop_running = true;
	try {
		while (dungeon_mode_enabled()) {
			const d = active_dungeon();
			if (!d) break;

			if (character.map !== d.map) {
				if (!await run_dungeon(d)) {
					dungeon_log(d, "Could not get in — stopping the loop", DUNGEON_WARN_COLOR);
					break;
				}
			}

			await route();
			record_dungeon_run();

			const leave = dungeon_leave_runner();
			if (leave) await leave();

			if (collection_due()) await run_dungeon_collection();

			if (!dungeon_mode_enabled()) {
				dungeon_log(d, "Mode was turned off — that was the last run");
				break;
			}

			await delay(DUNGEON_LOOP_SETTLE_MS);
		}
	} catch (e) {
		catcher(e, "run_dungeon_loop");
	} finally {
		_dungeon_loop_running = false;
		hold_reset_for_mode(false);
		log("⚰️ Dungeon loop stopped", "#FFCC00", "Alerts");
	}
}

function has_dungeon_key(key) {
	return character.items.some(it => it && it.name === key);
}

function start_dungeon_when_ready(dungeon) {
	if (active_dungeon() !== dungeon) return;
	setTimeout(() => {
		if (_dungeon_running) return;
		if (character.rip) {
			dungeon_log(dungeon, "Character is dead on startup — not auto-starting.", DUNGEON_WARN_COLOR);
			return;
		}
		if (character.map === dungeon.map) {
			dungeon_log(dungeon, "Detected startup inside instance — restarting from entrance.", "#FFAA44");
		}
		dungeon_log(dungeon, "Auto-starting...");
		run_dungeon(dungeon);
	}, DUNGEON_START_DELAY_MS);
}
