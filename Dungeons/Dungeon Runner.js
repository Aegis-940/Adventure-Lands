// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON RUNNER — the shared machinery every dungeon run is driven by: the active dungeon, scripted travel, the run, the loop
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_ABSENT_ROUNDS = 8;

let _dungeon_running = false;

function dungeon_log(dungeon, message, level = "event") {
	log_msg(level, `[${dungeon.name}] ${message}`);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTIVE DUNGEON — which dungeon this character is configured for, and how it bends the shared systems
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_OVERRIDE_KEY = "AL_dungeon_mode";

let _dungeon_override;
let _active_dungeon_cache;

function dungeon_override() {
	if (_dungeon_override === undefined) _dungeon_override = storage_raw_read(DUNGEON_OVERRIDE_KEY) || null;
	return _dungeon_override;
}

function set_dungeon_override(key) {
	_dungeon_override = key || null;
	_active_dungeon_cache = undefined;
	if (_dungeon_override) storage_raw_write(DUNGEON_OVERRIDE_KEY, _dungeon_override);
	else storage_remove(DUNGEON_OVERRIDE_KEY);
}

const DUNGEON_RESUME_KEY = "AL_dungeon_resume";

function dungeon_resume() {
	return storage_raw_read(DUNGEON_RESUME_KEY) || null;
}

function set_dungeon_resume(key) {
	if (key) storage_raw_write(DUNGEON_RESUME_KEY, key);
	else storage_remove(DUNGEON_RESUME_KEY);
}

function take_dungeon_resume() {
	const key = dungeon_resume();
	set_dungeon_resume(null);
	return key;
}

function dungeon_choice() {
	const current = dungeon_override();
	return current === "dreams" ? dungeon_resume() : current;
}

function active_dungeon() {
	if (_active_dungeon_cache !== undefined) return _active_dungeon_cache;

	if (dungeon_override() && DUNGEONS[dungeon_override()]) {
		_active_dungeon_cache = DUNGEONS[dungeon_override()];
		return _active_dungeon_cache;
	}

	if (!home) return null;

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

function dungeon_engage_radius(fallback) {
	return dungeon_setting("engage_radius", fallback === undefined ? character.range : fallback);
}

function dungeon_ignores_events() {
	return dungeon_flag("ignore_events");
}

function dungeon_target_weights() {
	return dungeon_flag("target_lowest_hp") ? { hp_low: 1 } : CONFIG.combat.target_weights;
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
		const count = get_num_chests();
		if (!count) break;

		if (count === last) {
			if (++idle >= DUNGEON_LOOT_IDLE_ROUNDS) {
				log_msg("warn", `Looting: ${count} chest(s) out of reach — moving on`);
				break;
			}
		} else {
			idle = 0;
		}
		last = count;

		await handle_looting();
		await sleep(DUNGEON_LOOT_ROUND_MS);
	}

	const left = get_num_chests();
	log_msg("info", left ? `Looting: done, ${left} left behind` : "Looting: everything collected");
}

function dungeon_telemetry_event(event, data) {
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
	if (dungeon_bailing()) return true;
	return _dungeon_moving;
}

let _dungeon_travel_depth = 0;
let _dungeon_travel_active = null;

async function dungeon_travel(destination, options) {
	const previous = _dungeon_travel_active;

	_dungeon_travel_depth++;
	_dungeon_moving = true;
	try {
		if (previous) {
			stop_movement("dungeon travel: superseded");
			try { await previous; } catch (e) { }
		}

		const journey = smarter_move(destination, null, options);
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
		on_socket("hit", "wait_for_death_hit", on_hit);

		function settle(finish, value) {
			stop_loop(poll);
			off_socket("hit", "wait_for_death_hit");
			finish(value);
		}

		const poll = every("wait for death " + mob_type, { ms: 500, kind: "automation", fixed: true }, () => {
			if (character.rip) {
				return settle(reject, new Error(`died before ${mob_type} was confirmed dead`));
			}
			if (character.map !== map) {
				return settle(reject, new Error(`left ${map} before ${mob_type} was confirmed dead`));
			}

			const near_spawn = Math.hypot(character.x - spawn_x, character.y - spawn_y) < spawn_radius;

			const alive = !!get_nearest_monster({ type: mob_type });

			if (killed && !alive) {
				log_msg("event", `[Dungeon] ${mob_type} kill confirmed`);
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
					log_msg("event", confirmed_alive
						? `[Dungeon] ${mob_type} confirmed dead`
						: `[Dungeon] ${mob_type} was not here — already dead`);
					return settle(resolve);
				}
			} else {
				consecutive_alive = 0;
				consecutive_dead = 0;
			}
		});

	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RUN DRIVER
// --------------------------------------------------------------------------------------------------------------------------------- //

async function run_dungeon(dungeon) {
	if (_dungeon_running) {
		dungeon_log(dungeon, "Already running — ignoring duplicate start.", "warn");
		return false;
	}
	_dungeon_running = true;
	_dungeon_moving = true;
	set_suppress_reset(true);
	send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset" });
	try {
		if (dungeon.key && locate_item(dungeon.key) === -1) {
			dungeon_log(dungeon, `No ${dungeon.key} in hand — withdrawing every one from the bank...`);
			await withdraw_item(dungeon.key, null, dungeon.key_count);
			if (locate_item(dungeon.key) === -1) {
				dungeon_log(dungeon, `No ${dungeon.key} in the bank either — aborting.`, "warn");
				return false;
			}
		}

		dungeon_log(dungeon, "Moving to entrance...");
		await smarter_move(dungeon.entrance);
		dungeon_log(dungeon, "At entrance — entering instance...");
		await wait_for_party_out(dungeon);
		await wait_for_party_at_entrance(dungeon);
		await sleep(DUNGEON_ENTER_SETTLE_MS);
		enter(dungeon.map);
		if (!await wait_until_on_map(dungeon.map)) {
			dungeon_log(dungeon, "enter() never landed — aborting", "warn");
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
			await sleep(2000);
			await wait_for_death(boss.mtype, boss.x, boss.y);
			dungeon_log(dungeon, `${boss.mtype} dead — looting`);
			await dungeon_loot_everything();
		}

		dungeon_log(dungeon, "Bosses down — heading out");
		try {
			await dungeon_travel(dungeon.exit || dungeon.entrance);
		} catch (e) {
			dungeon_log(dungeon, "Could not walk out — reloading from inside", "warn");
		}

		record_dungeon_run();
		if (collection_due()) await run_dungeon_collection();

		dungeon_log(dungeon, "Complete — reloading party...");
		send_cm(DUNGEON_FOLLOWERS, { type: "reload" });
		staggered_reload();
		await sleep(RELOAD_BASE_MS + RELOAD_STAGGER_MS);

		return true;

	} catch (e) {
		catcher(e, "run_dungeon");
		dungeon_log(dungeon, "Entry aborted", "warn");
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
	return (d && d.route) || null;
}

function dungeon_leave_runner() {
	const d = active_dungeon();
	return (d && d.leave) || null;
}

async function run_dungeon_loop() {
	if (_dungeon_loop_running) return;
	if (character.name !== MOVEMENT_LEADER) return;

	const route = dungeon_route_runner();
	if (!route) {
		const d = active_dungeon();
		log_msg("warn", `Dungeon loop: ${d ? d.name + " has no route loaded" : "no dungeon"}`);
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
					dungeon_log(d, "Could not get in — stopping the loop", "warn");
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

			if (await dreams_handover()) break;

			await sleep(DUNGEON_LOOP_SETTLE_MS);
		}
	} catch (e) {
		catcher(e, "run_dungeon_loop");
	} finally {
		_dungeon_loop_running = false;
		if (_dungeon_stop_requested) {
			_dungeon_stop_requested = false;
			set_dungeon_mode(null);
		}
		if (!dreams_mode_on()) hold_reset_for_mode(false);
		log_msg("event", "⚰️ Dungeon loop stopped");
	}
}

async function dungeon_keys_ready(dungeon) {
	if (!dungeon.key || !dungeon.min_keys) return true;

	let held = quantity(dungeon.key);
	if (held >= dungeon.min_keys) return true;

	dungeon_log(dungeon, `${held} ${dungeon.key}(s) in hand — topping up from the bank...`);
	await withdraw_item(dungeon.key, null, dungeon.key_count);

	held = quantity(dungeon.key);
	if (held >= dungeon.min_keys) return true;

	dungeon_log(dungeon, `Only ${held} ${dungeon.key}(s) available, need ${dungeon.min_keys} — stopping the loop`,
		"warn");
	return false;
}

function start_dungeon_when_ready(dungeon) {
	if (active_dungeon() !== dungeon) return;
	setTimeout(async () => {
		if (_dungeon_running) return;
		if (character.rip) {
			dungeon_log(dungeon, "Character is dead on startup — not auto-starting.", "warn");
			return;
		}
		if (character.map === dungeon.map) {
			dungeon_log(dungeon, "Detected startup inside instance — restarting from entrance.");
		}
		dungeon_log(dungeon, "Auto-starting...");

		const ok = await run_dungeon(dungeon);
		if (!ok && dungeon_mode_enabled()) {
			dungeon_log(dungeon, "Run could not start — turning the mode off", "warn");
			set_dungeon_mode(null);
		}
	}, DUNGEON_START_DELAY_MS);
}

function start_dungeon_watchers() {
	track_dungeon_kills();
	every("dungeon rejoin watch", { ms: DUNGEON_REJOIN_WATCH_MS, kind: "automation", fixed: true }, dungeon_rejoin_watch);
	every("dungeon entities", { ms: PROGRESS_SEEN_MS, kind: "automation", fixed: true }, remember_dungeon_entities);
	every("dungeon telemetry", { ms: TELEMETRY_TICK_MS, kind: "telemetry", fixed: true }, dungeon_telemetry_tick);
	every("dreams watch", { ms: DREAMS_WATCH_MS, kind: "automation", fixed: true }, dreams_watch);
}

async function start_active_dungeon_when_ready() {
	const d = active_dungeon();
	if (!d) return;
	if (d.start) return d.start();
	if (await dreams_handover()) return;
	if (d.route) return start_dungeon_loop();
	start_dungeon_when_ready(d);
}

async function dreams_handover() {
	const current = dungeon_override();
	if (!current || current === "dreams" || character.name !== MOVEMENT_LEADER) return false;

	const visit = await dreams_due_visit();
	if (!visit || dungeon_override() !== current) return false;

	dreams_log(`${visit.resume ? "An unfinished visit is waiting" : "Today's visit is unused"} — ${dungeon_name_for(current)} resumes after it`);
	set_dungeon_resume(current);
	set_dungeon_mode("dreams");
	return true;
}

function start_dungeon_loop() {
	if (character.name !== MOVEMENT_LEADER) return;
	setTimeout(() => {
		if (!active_dungeon() || _dungeon_loop_running) return;
		if (character.rip) return log_msg("warn", "Dungeon loop: dead on startup — not starting");
		run_dungeon_loop();
	}, DUNGEON_START_DELAY_MS);
}
