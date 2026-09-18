// --------------------------------------------------------------------------------------------------------------------------------- //
// SERVER WATCH — observer sockets on the other realms, and the hop that goes and joins their bosses
// --------------------------------------------------------------------------------------------------------------------------------- //

const SERVER_WATCH = {
	enabled: true,
	skip_servers: ["TEST", "PVP"],
	watcher_order: ["Riff", "Ulric", "Myras", "Riva"],
	tick_ms: 5000,
	lease_ms: 20000,
	rank_delay_ms: 4000,
	entry_stale_ms: 10 * 60 * 1000,
	server_list_ms: 30 * 60 * 1000,
	list_retry_ms: 60000,
	history_length: 6,
};

const SERVER_HOP = {
	enabled: true,
	join_below: 0.95,
	min_window_ms: 3 * 60 * 1000,
	cooldown_ms: 5 * 60 * 1000,
	max_stay_ms: 15 * 60 * 1000,
	settle_ms: 45000,
	linger_ms: 60000,
	state_stale_ms: 3 * 60 * 1000,
	call_guard_ms: 20000,
	max_attempts: 3,
};

const SERVER_WATCH_KEY = "AL_server_watch";
const SERVER_WATCH_LEASE_KEY = "AL_server_watch_owner";
const SERVER_HOP_KEY = "AL_server_hop";
const SERVER_HOP_LAST_KEY = "AL_server_hop_last";

var _watch_since = Date.now();
var _watch_sockets = {};
var _watch_table = {};
var _watch_servers = null;
var _watch_servers_at = 0;
var _watch_owner = false;
var _hop_attempts = 0;
var _hop_called_at = 0;
var _hop_no_target_since = 0;

// --------------------------------------------------------------------------------------------------------------------------------- //
// REALMS AND STORAGE
// --------------------------------------------------------------------------------------------------------------------------------- //

function realm_key(region, identifier) {
	return region + " " + identifier;
}

function my_realm() {
	return realm_key(parent.server_region, parent.server_identifier);
}

function to_ms(value) {
	if (value === undefined || value === null) return null;
	const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return isFinite(ms) ? ms : null;
}

function fmt_eta(ms) {
	if (!isFinite(ms)) return "?";
	const left = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(left / 3600);
	const m = Math.floor((left % 3600) / 60);
	const s = left % 60;
	if (h) return `${h}h${String(m).padStart(2, "0")}m`;
	if (m) return `${m}m${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}

function storage_read(key) {
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}
}

function storage_write(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (e) {
		catcher(e, "storage_write:" + key);
	}
}

function storage_clear(key) {
	try {
		localStorage.removeItem(key);
	} catch (e) { }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WATCHER LEASE — exactly one character holds the observer sockets
// --------------------------------------------------------------------------------------------------------------------------------- //

function watch_rank_delay() {
	const rank = SERVER_WATCH.watcher_order.indexOf(character.name);
	return (rank < 0 ? SERVER_WATCH.watcher_order.length : rank) * SERVER_WATCH.rank_delay_ms;
}

function claim_watch_lease() {
	const lease = storage_read(SERVER_WATCH_LEASE_KEY);

	if (lease && lease.name === character.name) {
		storage_write(SERVER_WATCH_LEASE_KEY, { name: character.name, at: Date.now() });
		return true;
	}

	if (lease && Date.now() - (lease.at || 0) < SERVER_WATCH.lease_ms + watch_rank_delay()) return false;
	if (!lease && Date.now() - _watch_since < watch_rank_delay()) return false;

	storage_write(SERVER_WATCH_LEASE_KEY, { name: character.name, at: Date.now() });
	const now = storage_read(SERVER_WATCH_LEASE_KEY);
	return !!now && now.name === character.name;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// OBSERVERS — an unauthenticated socket per realm, listening for server_info
// --------------------------------------------------------------------------------------------------------------------------------- //

function fetch_server_list() {
	if (typeof parent.api_call !== "function") return;
	if (_watch_servers && Date.now() - _watch_servers_at < SERVER_WATCH.server_list_ms) return;

	_watch_servers_at = Date.now();
	parent.api_call("get_servers", {}, {
		callback: response => {
			const message = response && response[0] && response[0].message;
			if (!message) {
				_watch_servers_at = Date.now() - SERVER_WATCH.server_list_ms + SERVER_WATCH.list_retry_ms;
				return;
			}

			const servers = [];
			for (const id in message) {
				const server = message[id];
				if (!server || !server.ip || !server.port) continue;
				if (SERVER_WATCH.skip_servers.includes(server.name)) continue;
				if (server.pvp) continue;
				servers.push({
					realm: realm_key(server.region, server.name),
					ip: server.ip,
					port: server.port,
				});
			}

			_watch_servers = servers;
			game_log(`🛰️ Server watch: ${servers.length} realms listed`, "#7FD1FF");
			open_observers();
		},
	});
}

function open_observers() {
	if (!_watch_owner || !_watch_servers) return;
	if (typeof parent.io === "undefined") {
		return void game_log("❌ Server watch: parent.io is missing — observers cannot connect", "#FF3333");
	}

	const mine = my_realm();
	for (const server of _watch_servers) {
		if (server.realm === mine) continue;
		if (_watch_sockets[server.realm]) continue;
		_watch_sockets[server.realm] = open_observer(server);
	}

	for (const realm in _watch_sockets) {
		if (realm === mine) close_observer(realm);
	}
}

function open_observer(server) {
	const socket = parent.io.connect("wss://" + server.ip + ":" + server.port, { transports: ["websocket"] });

	socket.on("welcome", () => {
		socket.emit("loaded", {
			success: 1,
			width: parent.screen.width,
			height: parent.screen.height,
			scale: parent.scale,
		});
	});

	socket.on("server_info", data => absorb_server_info(server.realm, data));

	return socket;
}

function close_observer(realm) {
	const socket = _watch_sockets[realm];
	if (!socket) return;
	try { socket.disconnect(); } catch (e) { }
	delete _watch_sockets[realm];
}

function close_observers() {
	for (const realm in _watch_sockets) close_observer(realm);
}

function absorb_server_info(realm, data) {
	if (!data) return;

	const known = _watch_table[realm] || { at: 0, bosses: {}, spawns: {}, windows: {} };
	if (!known.spawns) known.spawns = {};
	if (!known.windows) known.windows = {};
	if (!known.history) known.history = [];

	const watched = EVENT_LOCATIONS.map(e => e.name);
	const before = Object.keys(known.bosses).concat(Object.keys(known.windows));

	for (const name in data) {
		const entry = data[name];

		if (name === "schedule") {
			known.schedule = entry;
			continue;
		}

		if (entry && entry.end && !watched.includes(name)) {
			known.windows[name] = to_ms(entry.end);
			continue;
		}

		if (!watched.includes(name)) continue;

		if (!entry || entry.live === false) {
			delete known.bosses[name];
			if (entry && entry.spawn) known.spawns[name] = to_ms(entry.spawn);
			continue;
		}

		delete known.spawns[name];
		known.bosses[name] = {
			live: true,
			hp: entry.hp,
			max_hp: entry.max_hp,
			map: entry.map,
			x: entry.x,
			y: entry.y,
			end: to_ms(entry.end),
		};
	}

	for (const name in known.spawns) {
		if (!(name in data)) delete known.spawns[name];
	}
	for (const name in known.windows) {
		if (!(name in data)) delete known.windows[name];
	}

	for (const name of Object.keys(known.bosses).concat(Object.keys(known.windows))) {
		if (before.includes(name)) continue;
		const boss = known.bosses[name];
		const max = boss ? boss_max_hp(name, boss) : 0;
		known.history.unshift({
			name,
			at: Date.now(),
			pct: max && isFinite(boss.hp) ? Math.round((boss.hp / max) * 100) : null,
		});
	}
	known.history = known.history.slice(0, SERVER_WATCH.history_length);

	known.at = Date.now();
	_watch_table[realm] = known;

	storage_write(SERVER_WATCH_KEY, { owner: character.name, at: Date.now(), realms: _watch_table });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WHAT IS LIVE ELSEWHERE
// --------------------------------------------------------------------------------------------------------------------------------- //

function watch_realms() {
	const stored = storage_read(SERVER_WATCH_KEY);
	if (!stored || !stored.realms) return {};
	if (Date.now() - (stored.at || 0) > SERVER_WATCH.entry_stale_ms) return {};
	return stored.realms;
}

function bosses_elsewhere() {
	const mine = my_realm();
	const realms = watch_realms();
	const found = [];

	for (const realm in realms) {
		if (realm === mine) continue;
		const seen = realms[realm];
		if (!seen || Date.now() - (seen.at || 0) > SERVER_WATCH.entry_stale_ms) continue;

		for (const name in seen.bosses) {
			const data = seen.bosses[name];
			if (!data || !data.live) continue;

			const max = boss_max_hp(name, data);
			if (!max || !isFinite(data.hp)) continue;
			if (!boss_engageable(name, data)) continue;

			const ratio = data.hp / max;
			if (ratio > SERVER_HOP.join_below) continue;
			if (data.end && data.end - Date.now() < SERVER_HOP.min_window_ms) continue;

			found.push({ realm, name, data, ratio });
		}
	}

	return found.sort((a, b) => a.ratio - b.ratio);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TIMERS — event windows, seasonal respawns, and the daily/nightly schedule
// --------------------------------------------------------------------------------------------------------------------------------- //

function next_utc_hour(hour) {
	const now = new Date();
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0));
	if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
	return next.getTime();
}

function next_event_windows(schedule) {
	if (!schedule) return [];
	const offset = schedule.time_offset || 0;
	const windows = [];

	(schedule.dailies || []).forEach(h => windows.push({ kind: "daily", at: next_utc_hour(((h - offset) % 24 + 24) % 24) }));
	(schedule.nightlies || []).forEach(h => windows.push({ kind: "nightly", at: next_utc_hour(((h - offset) % 24 + 24) % 24) }));

	return windows.sort((a, b) => a.at - b.at);
}

function realm_timers(realm) {
	if (realm === my_realm()) return local_timers();
	const seen = watch_realms()[realm];
	return seen || null;
}

function local_timers() {
	const seen = { at: Date.now(), bosses: {}, spawns: {}, windows: {}, schedule: parent.S && parent.S.schedule };
	const watched = EVENT_LOCATIONS.map(e => e.name);

	for (const name in (parent.S || {})) {
		const entry = parent.S[name];
		if (!entry || typeof entry !== "object") continue;

		if (entry.live === false && entry.spawn) {
			seen.spawns[name] = to_ms(entry.spawn);
		} else if (entry.live) {
			seen.bosses[name] = { ...entry, end: to_ms(entry.end) };
		} else if (entry.end && !watched.includes(name)) {
			seen.windows[name] = to_ms(entry.end);
		}
	}

	return seen;
}

function timer_lines(realm) {
	const seen = realm_timers(realm);
	if (!seen) return [`${realm}: not watched`];

	const lines = [];
	const now = Date.now();

	for (const name in seen.bosses) {
		const boss = seen.bosses[name];
		const max = boss_max_hp(name, boss);
		const pct = max && isFinite(boss.hp) ? ` ${Math.round((boss.hp / max) * 100)}%` : "";
		const ends = boss.end ? `, ${fmt_eta(boss.end - now)} left` : "";
		lines.push(`live: ${name}${pct} on ${boss.map || "?"}${ends}`);
	}

	for (const name in seen.windows) {
		lines.push(`live: ${name}, ${fmt_eta(seen.windows[name] - now)} left`);
	}

	for (const name in seen.spawns) {
		lines.push(`${name} respawns in ${fmt_eta(seen.spawns[name] - now)}`);
	}

	const next = next_event_windows(seen.schedule)[0];
	if (next) lines.push(`next ${next.kind} event in ${fmt_eta(next.at - now)}`);

	if (!lines.length) lines.push("quiet");

	const age = Math.round((now - (seen.at || 0)) / 1000);
	return lines.map((line, i) => i === lines.length - 1 ? `${line} (${age}s ago)` : line);
}

function server_watch_report() {
	const mine = my_realm();
	const lease = storage_read(SERVER_WATCH_LEASE_KEY);
	const realms = Object.keys(watch_realms());

	game_log(`🛰️ Realm ${mine} — watcher ${lease ? lease.name : "none"}`, "#7FD1FF");

	for (const realm of [mine].concat(realms.filter(r => r !== mine))) {
		game_log(`   ${realm}`, "#7FD1FF");
		for (const line of timer_lines(realm)) game_log(`      ${line}`, "#7FD1FF");
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE HOP — leave for a boss, come back to where we were farming
// --------------------------------------------------------------------------------------------------------------------------------- //

function hop_state() {
	const state = storage_read(SERVER_HOP_KEY);
	if (!state || !state.away || !state.home) return null;
	if (Date.now() - (state.at || 0) > SERVER_HOP.state_stale_ms) {
		storage_clear(SERVER_HOP_KEY);
		return null;
	}
	return state;
}

function touch_hop_state(state) {
	storage_write(SERVER_HOP_KEY, { ...state, at: Date.now() });
}

function hop_blocked() {
	if (!SERVER_HOP.enabled || !SERVER_WATCH.enabled) return "disabled";
	if (typeof automation_enabled === "function" && !automation_enabled()) return "paused";
	if (character.rip) return "dead";
	if (panicking) return "panicking";
	if (typeof dungeon_flag === "function" && dungeon_flag("ignore_events")) return "in a dungeon";
	return null;
}

function hop_to_realm(realm, why) {
	if (Date.now() - _hop_called_at < SERVER_HOP.call_guard_ms) return;

	_hop_called_at = Date.now();
	_hop_attempts += 1;

	if (_hop_attempts > SERVER_HOP.max_attempts) {
		game_log(`🛰️ Giving up on the hop to ${realm} after ${SERVER_HOP.max_attempts} attempts`, "#FFA500");
		storage_clear(SERVER_HOP_KEY);
		return;
	}

	if (typeof parent.change_server !== "function") {
		game_log("❌ parent.change_server is missing — cannot server hop", "#FF3333");
		storage_clear(SERVER_HOP_KEY);
		return;
	}

	const parts = realm.split(" ");
	game_log(`🛰️ Hopping to ${realm} — ${why}`, "#7FD1FF");
	parent.change_server(parts[0], parts[1]);
}

function begin_return(state) {
	game_log(`🛰️ Nothing left on ${state.away} — heading back to ${state.home}`, "#7FD1FF");
	storage_write(SERVER_HOP_KEY, {
		home: state.home,
		away: state.home,
		boss: state.boss,
		left_at: state.left_at,
		returning: true,
		at: Date.now(),
	});
}

function hop_arrived(state) {
	if (state.returning) {
		storage_clear(SERVER_HOP_KEY);
		storage_write(SERVER_HOP_LAST_KEY, { at: Date.now() });
		_hop_attempts = 0;
		_hop_no_target_since = 0;
		return;
	}

	touch_hop_state(state);
	_hop_attempts = 0;

	const fighting = typeof best_event_target === "function" && !!best_event_target();
	if (fighting) {
		_hop_no_target_since = 0;
		return;
	}

	if (Date.now() - (state.left_at || 0) < SERVER_HOP.settle_ms) return;

	if (!_hop_no_target_since) _hop_no_target_since = Date.now();

	const overstayed = Date.now() - (state.left_at || 0) > SERVER_HOP.max_stay_ms;
	if (!overstayed && Date.now() - _hop_no_target_since < SERVER_HOP.linger_ms) return;

	begin_return(state);
}

function server_hop_tick() {
	const mine = my_realm();
	const state = hop_state();

	if (state && state.away === mine) return hop_arrived(state);
	if (state) return hop_to_realm(state.away, state.returning ? "returning home" : `${state.boss} is up there`);

	if (character.ctype === "merchant") return;
	if (hop_blocked()) return;

	const last = storage_read(SERVER_HOP_LAST_KEY);
	if (last && Date.now() - (last.at || 0) < SERVER_HOP.cooldown_ms) return;

	if (typeof best_event_target === "function" && best_event_target()) return;

	const target = bosses_elsewhere()[0];
	if (!target) return;

	_hop_attempts = 0;
	_hop_no_target_since = 0;
	storage_write(SERVER_HOP_KEY, {
		home: mine,
		away: target.realm,
		boss: target.name,
		left_at: Date.now(),
		at: Date.now(),
	});
	storage_write(SERVER_HOP_LAST_KEY, { at: Date.now() });
	hop_to_realm(target.realm, `${target.name} at ${Math.round(target.ratio * 100)}%`);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function server_watch_loop() {
	while (true) {
		try {
			if (SERVER_WATCH.enabled) {
				const owned = claim_watch_lease();
				if (owned !== _watch_owner) {
					_watch_owner = owned;
					if (!owned) close_observers();
				}
				if (_watch_owner) {
					fetch_server_list();
					open_observers();
				}
				server_hop_tick();
			}
		} catch (e) {
			try { catcher(e, "server_watch_loop"); } catch (x) { }
		}
		await delay(SERVER_WATCH.tick_ms);
	}
}
