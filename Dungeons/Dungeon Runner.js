// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON RUNNER — the shared machinery every dungeon run is driven by
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_ABSENT_ROUNDS = 8;
const DUNGEON_PARTY_TIMEOUT_MS = 2 * 60 * 1000;
const DUNGEON_JOIN_TIMEOUT_MS = 90000;
const DUNGEON_JOIN_INTERVAL_MS = 400;
const DUNGEON_ENTRANCE_RANGE = 150;
const DUNGEON_FOLLOWERS = ["Ulric", "Riva"];
const DUNGEON_PARTY = ["Myras", "Ulric", "Riva"];
const DUNGEON_LOG_COLOR = "#AA88FF";
const DUNGEON_WARN_COLOR = "#FF8844";

let _dungeon_running = false;
let _dungeon_joining = false;

function dungeon_log(dungeon, message, color = DUNGEON_LOG_COLOR) {
	game_log(`${dungeon.name}: ${message}`, color);
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
				game_log(`Looting: ${count} chest(s) out of reach — moving on`, DUNGEON_WARN_COLOR);
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
	game_log(left ? `Looting: done, ${left} left behind` : "Looting: everything collected", DUNGEON_LOG_COLOR);
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

let _dungeon_travel_depth = 0;
let _dungeon_travel_active = null;

async function dungeon_travel(destination) {
	const previous = _dungeon_travel_active;

	_dungeon_travel_depth++;
	_dungeon_moving = true;
	try {
		if (previous) {
			stop_movement("dungeon travel: superseded");
			try { await previous; } catch (e) { }
		}

		const journey = smarter_move(destination);
		_dungeon_travel_active = journey;
		try {
			return await journey;
		} finally {
			if (_dungeon_travel_active === journey) _dungeon_travel_active = null;
		}
	} finally {
		_dungeon_travel_depth--;
		if (_dungeon_travel_depth === 0) _dungeon_moving = false;
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

	const on_party = !!(mob.target && DUNGEON_PARTY.includes(mob.target));

	if (d.follow_focus && character.name !== MOVEMENT_LEADER) {
		if (on_party) return false;
		const focus = dungeon_focus_target();
		return !focus || mob.id !== focus.id;
	}

	if (on_party) return false;

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
		if (character.rip) return game_log("Dungeon loop: dead on startup — not starting", DUNGEON_WARN_COLOR);
		run_dungeon_loop();
	}, DUNGEON_START_DELAY_MS);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS DEATH DETECTION
// --------------------------------------------------------------------------------------------------------------------------------- //

function wait_for_death(mob_type, spawn_x, spawn_y, spawn_radius = 250) {
	return new Promise((resolve, reject) => {
		const dungeon = active_dungeon();
		const map = dungeon ? dungeon.map : character.map;

		let consecutive_alive = 0;
		let confirmed_alive = false;
		let consecutive_dead = 0;
		let killed = false;

		function on_hit(data) {
			if (!data || !data.kill || !data.id) return;
			const e = parent.entities[data.id];
			if (e && e.mtype === mob_type) killed = true;
		}
		parent.socket.on("hit", on_hit);

		function settle(finish, value) {
			clearInterval(interval);
			parent.socket.off("hit", on_hit);
			finish(value);
		}

		const interval = setInterval(() => {
			if (character.rip) {
				return settle(reject, new Error(`died before ${mob_type} was confirmed dead`));
			}
			if (character.map !== map) {
				return settle(reject, new Error(`left ${map} before ${mob_type} was confirmed dead`));
			}

			const near_spawn = Math.hypot(character.x - spawn_x, character.y - spawn_y) < spawn_radius;

			const alive = Object.values(parent.entities).some(
				e => e.type === "monster" && e.mtype === mob_type && !e.dead
			);

			if (killed && !alive) {
				game_log(`[Dungeon] ${mob_type} kill confirmed`, DUNGEON_LOG_COLOR);
				return settle(resolve);
			}

			if (alive) {
				consecutive_alive++;
				consecutive_dead = 0;
				if (consecutive_alive >= 3) confirmed_alive = true;
			} else if (near_spawn) {
				consecutive_alive = 0;
				consecutive_dead++;
				if (consecutive_dead >= (confirmed_alive ? 3 : DUNGEON_ABSENT_ROUNDS)) {
					game_log(confirmed_alive
						? `[Dungeon] ${mob_type} confirmed dead`
						: `[Dungeon] ${mob_type} was not here — already dead`, DUNGEON_LOG_COLOR);
					return settle(resolve);
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

async function join_dungeon_instance(data) {
	if (_dungeon_joining) return;
	const instance_id = data.in;
	const map = data.map || "spider_instance";
	const entrance = data.entrance;

	_dungeon_joining = true;
	_dungeon_moving = true;
	stop_movement("joining the instance");

	try {
		if (entrance && character.map !== map) {
			const adrift = character.map !== entrance.map
				|| Math.hypot(character.x - entrance.x, character.y - entrance.y) > DUNGEON_ENTRANCE_RANGE;
			if (adrift) {
				game_log("🚪 Behind the party — walking to the entrance", "#AA88FF");
				try { await smarter_move(entrance); } catch (e) { }
			}
		}

		const until = Date.now() + DUNGEON_JOIN_TIMEOUT_MS;
		while (Date.now() < until) {
			if (character.map === map) {
				send_cm("Myras", { type: "instance_ready" });
				return;
			}
			try { await enter(map, instance_id); } catch (e) { }
			await delay(DUNGEON_JOIN_INTERVAL_MS);
		}

		game_log(`❌ Gave up entering the instance after ${DUNGEON_JOIN_TIMEOUT_MS / 1000}s`, "#FF3333");
	} finally {
		_dungeon_joining = false;
		_dungeon_moving = false;
	}
}

const DUNGEON_EXIT_WAIT_MS = 3 * 60 * 1000;
const DUNGEON_EXIT_POLL_MS = 1000;
const DUNGEON_ASSEMBLE_RANGE = 200;
const DUNGEON_ASSEMBLE_WAIT_MS = 3 * 60 * 1000;
const DUNGEON_ENTER_SETTLE_MS = 3000;
const DUNGEON_ENTER_TIMEOUT_MS = 20000;
const DUNGEON_ENTER_POLL_MS = 250;

async function wait_until_on_map(map) {
	const until = Date.now() + DUNGEON_ENTER_TIMEOUT_MS;
	while (Date.now() < until) {
		if (character.map === map) return true;
		await delay(DUNGEON_ENTER_POLL_MS);
	}
	return false;
}

function followers_still_inside(dungeon) {
	return DUNGEON_FOLLOWERS.filter(name => {
		const s = read_state_cache(name);
		return s && s.map === dungeon.map;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// REJOIN WATCH — a follower who died and was ejected has to get back in, not stand outside following a leader it cannot reach
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_REJOIN_WATCH_MS = 5000;

function dungeon_rejoin_watch() {
	try {
		if (character.name === MOVEMENT_LEADER) return;
		if (!DUNGEON_FOLLOWERS.includes(character.name)) return;
		if (_dungeon_joining || character.rip) return;
		if (typeof dungeon_mode_enabled !== "function" || !dungeon_mode_enabled()) return;
		if (typeof read_state_cache !== "function") return;
		if (typeof dungeon_bailing === "function" && dungeon_bailing()) return;

		const d = active_dungeon();
		if (!d || character.map === d.map) return;

		const lead = read_state_cache(MOVEMENT_LEADER);
		if (!lead || lead.rip || lead.map !== d.map || !lead.in) return;

		game_log("🚪 Left behind — rejoining the instance", "#AA88FF");
		join_dungeon_instance({ in: lead.in, map: d.map, entrance: d.entrance });
	} catch (e) {
		console.error("dungeon rejoin watch error", e);
	}
}

setInterval(dungeon_rejoin_watch, DUNGEON_REJOIN_WATCH_MS);

function followers_away_from_entrance(dungeon) {
	const e = dungeon.entrance;
	return DUNGEON_FOLLOWERS.filter(name => {
		const s = read_state_cache(name);
		if (!s || s.rip) return false;
		if (s.map !== e.map) return true;
		return Math.hypot(s.x - e.x, s.y - e.y) > DUNGEON_ASSEMBLE_RANGE;
	});
}

async function wait_for_party_at_entrance(dungeon) {
	if (!followers_away_from_entrance(dungeon).length) return true;

	dungeon_log(dungeon, "Waiting for the party to reach the entrance...");
	const until = Date.now() + DUNGEON_ASSEMBLE_WAIT_MS;
	while (Date.now() < until) {
		const adrift = followers_away_from_entrance(dungeon);
		if (!adrift.length) {
			dungeon_log(dungeon, "Party assembled at the entrance");
			return true;
		}
		await delay(DUNGEON_EXIT_POLL_MS);
	}

	dungeon_log(dungeon,
		`${followers_away_from_entrance(dungeon).join(", ")} never reached the entrance — entering anyway`,
		DUNGEON_WARN_COLOR);
	return false;
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
		await wait_for_party_at_entrance(dungeon);
		await delay(DUNGEON_ENTER_SETTLE_MS);
		enter(dungeon.map);
		if (!await wait_until_on_map(dungeon.map)) {
			dungeon_log(dungeon, "enter() never landed — aborting", DUNGEON_WARN_COLOR);
			return false;
		}

		dungeon_log(dungeon, "Signalling party to enter instance...");
		send_cm(DUNGEON_FOLLOWERS, {
			type: "enter_instance",
			in: character.in,
			map: dungeon.map,
			entrance: dungeon.entrance,
		});

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
			await dungeon_loot_everything();
		}

		dungeon_log(dungeon, "Bosses down — heading out");
		try {
			await dungeon_travel(dungeon.exit || dungeon.entrance);
		} catch (e) {
			dungeon_log(dungeon, "Could not walk out — reloading from inside", DUNGEON_WARN_COLOR);
		}

		record_dungeon_run();
		if (collection_due()) await run_dungeon_collection();

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
let _dungeon_stop_requested = false;

function dungeon_loop_running() {
	return _dungeon_loop_running;
}

function dungeon_stop_requested() {
	return _dungeon_stop_requested;
}

function request_dungeon_stop() {
	_dungeon_stop_requested = true;
}

function clear_dungeon_stop() {
	_dungeon_stop_requested = false;
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
		game_log(`Dungeon loop: ${d ? d.route || "no route" : "no dungeon"} is not a loaded function`, DUNGEON_WARN_COLOR);
		return;
	}

	_dungeon_loop_running = true;
	try {
		while (dungeon_mode_enabled() && !_dungeon_stop_requested) {
			const d = active_dungeon();
			if (!d) break;

			if (character.map !== d.map && !await dungeon_keys_ready(d)) break;

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

			if (!dungeon_mode_enabled() || _dungeon_stop_requested) {
				dungeon_log(d, "Mode was turned off — that was the last run");
				break;
			}

			await delay(DUNGEON_LOOP_SETTLE_MS);
		}
	} catch (e) {
		catcher(e, "run_dungeon_loop");
	} finally {
		_dungeon_loop_running = false;
		if (_dungeon_stop_requested) {
			_dungeon_stop_requested = false;
			set_dungeon_mode(null);
		}
		hold_reset_for_mode(false);
		game_log("⚰️ Dungeon loop stopped", "#FFCC00");
	}
}

function has_dungeon_key(key) {
	return character.items.some(it => it && it.name === key);
}

function count_dungeon_keys(key) {
	let held = 0;
	for (const item of character.items) {
		if (item && item.name === key) held += item.q || 1;
	}
	return held;
}

async function dungeon_keys_ready(dungeon) {
	if (!dungeon.key || !dungeon.min_keys) return true;

	let held = count_dungeon_keys(dungeon.key);
	if (held >= dungeon.min_keys) return true;

	dungeon_log(dungeon, `${held} ${dungeon.key}(s) in hand — topping up from the bank...`);
	await withdraw_item(dungeon.key, null, dungeon.key_count);

	held = count_dungeon_keys(dungeon.key);
	if (held >= dungeon.min_keys) return true;

	dungeon_log(dungeon, `Only ${held} ${dungeon.key}(s) available, need ${dungeon.min_keys} — stopping the loop`,
		DUNGEON_WARN_COLOR);
	return false;
}

function start_dungeon_when_ready(dungeon) {
	if (active_dungeon() !== dungeon) return;
	setTimeout(async () => {
		if (_dungeon_running) return;
		if (character.rip) {
			dungeon_log(dungeon, "Character is dead on startup — not auto-starting.", DUNGEON_WARN_COLOR);
			return;
		}
		if (character.map === dungeon.map) {
			dungeon_log(dungeon, "Detected startup inside instance — restarting from entrance.", "#FFAA44");
		}
		dungeon_log(dungeon, "Auto-starting...");

		const ok = await run_dungeon(dungeon);
		if (!ok && dungeon_mode_enabled()) {
			dungeon_log(dungeon, "Run could not start — turning the mode off", DUNGEON_WARN_COLOR);
			set_dungeon_mode(null);
		}
	}, DUNGEON_START_DELAY_MS);
}
