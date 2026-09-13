// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON RUNNER — the shared machinery every dungeon run is driven by
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_BOSS_TIMEOUT_MS = 10 * 60 * 1000;
const DUNGEON_PARTY_TIMEOUT_MS = 2 * 60 * 1000;
const DUNGEON_JOIN_MAX_ATTEMPTS = 30;
const DUNGEON_JOIN_INTERVAL_MS = 2000;
const DUNGEON_FOLLOWERS = ["Ulric", "Riva"];
const DUNGEON_LOG_COLOR = "#AA88FF";
const DUNGEON_WARN_COLOR = "#FF8844";

let _dungeon_running = false;
let _dungeon_join_interval = null;

function dungeon_log(dungeon, message, color = DUNGEON_LOG_COLOR) {
	log(`${dungeon.name}: ${message}`, color);
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
	let attempts = 0;
	_dungeon_join_interval = setInterval(() => {
		if (character.map === map) {
			clearInterval(_dungeon_join_interval);
			_dungeon_join_interval = null;
			send_cm("Myras", { type: "instance_ready" });
		} else if (++attempts > DUNGEON_JOIN_MAX_ATTEMPTS) {
			clearInterval(_dungeon_join_interval);
			_dungeon_join_interval = null;
			game_log(`❌ Gave up entering the instance after ${DUNGEON_JOIN_MAX_ATTEMPTS} attempts`, "#FF3333");
		} else {
			Promise.resolve(enter(map, instance_id)).catch(() => { });
		}
	}, DUNGEON_JOIN_INTERVAL_MS);
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
	set_suppress_reset(true);
	send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset" });
	try {
		dungeon_log(dungeon, "Moving to entrance...");
		await smarter_move(dungeon.entrance);
		dungeon_log(dungeon, "At entrance — entering instance...");
		await delay(10000);
		enter(dungeon.map);
		await delay(10000);

		dungeon_log(dungeon, "Signalling party to enter instance...");
		send_cm(DUNGEON_FOLLOWERS, { type: "enter_instance", in: character.in, map: dungeon.map });

		await wait_for_party_in_instance(dungeon);

		dungeon_log(dungeon, "Full party in instance — proceeding");

		for (const boss of dungeon.bosses) {
			dungeon_log(dungeon, `Moving to ${boss.mtype}...`);
			await smarter_move({ map: dungeon.map, x: boss.x, y: boss.y });
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
	} finally {
		_dungeon_running = false;
		set_suppress_reset(false);
		send_cm(DUNGEON_FOLLOWERS, { type: "suppress_reset", state: false });
	}
}

function start_dungeon_when_ready(dungeon) {
	if (home !== dungeon.home) return;
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
	}, 5000);
}
