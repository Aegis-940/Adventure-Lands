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

function dungeon_protected_key() {
	const d = active_dungeon();
	return d && d.key ? d.key : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SCRIPTED TRAVEL — the arbiter releases any movement it did not order, so it has to stand down for ours
// --------------------------------------------------------------------------------------------------------------------------------- //

let _dungeon_moving = false;

function dungeon_moving() {
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

function dungeon_avoids(mtype) {
	const d = active_dungeon();
	return !!(d && d.avoid && d.avoid.includes(mtype));
}

function dungeon_skip_target(mob) {
	const d = active_dungeon();
	if (!d || !mob) return false;
	if (d.avoid && d.avoid.includes(mob.mtype)) return true;
	if (mob.target && DUNGEON_PARTY.includes(mob.target)) return false;
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
	if (d) start_dungeon_when_ready(d);
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
		return;
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
				return;
			}
		}

		dungeon_log(dungeon, "Moving to entrance...");
		await smarter_move(dungeon.entrance);
		dungeon_log(dungeon, "At entrance — entering instance...");
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
			dungeon_log(dungeon, "Party assembled — movement is yours from here", "#FFAA44");
			hold_reset_until_out(dungeon);
			return;
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

	} catch (e) {
		catcher(e, "run_dungeon");
		dungeon_log(dungeon, "Run aborted — toggle off and on to retry", DUNGEON_WARN_COLOR);
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

function hold_reset_until_out(dungeon) {
	if (_dungeon_reset_hold) return;
	_dungeon_reset_hold = true;
	const watch = setInterval(() => {
		if (character.map === dungeon.map) return;
		clearInterval(watch);
		_dungeon_reset_hold = false;
		set_suppress_reset(false);
		send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset", state: false });
		dungeon_log(dungeon, "Left the instance — periodic reload re-enabled");
	}, 5000);
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
			if (!dungeon.bosses || !dungeon.bosses.length) {
				dungeon_log(dungeon, "Already inside — movement is yours", "#FFAA44");
				set_suppress_reset(true);
				send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset" });
				hold_reset_until_out(dungeon);
				return;
			}
			dungeon_log(dungeon, "Detected startup inside instance — restarting from entrance.", "#FFAA44");
		}
		dungeon_log(dungeon, "Auto-starting...");
		run_dungeon(dungeon);
	}, 5000);
}
