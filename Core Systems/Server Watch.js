// --------------------------------------------------------------------------------------------------------------------------------- //
// SERVER WATCH — observer sockets on the other realms, and the hop that goes and joins their bosses
// --------------------------------------------------------------------------------------------------------------------------------- //

const SERVER_WATCH = {
	enabled: true,
	skip_servers: ["TEST", "PVP", "HARDCORE", "DUNGEON"],
	watcher_order: ["Riff", "Ulric", "Myras", "Riva"],
	tick_ms: 5000,
	lease_ms: 20000,
	rank_delay_ms: 4000,
	entry_stale_ms: 10 * 60 * 1000,
	server_list_ms: 30 * 60 * 1000,
	list_retry_ms: 60000,
	list_pending_ms: 30000,
	history_length: 6,
	notice_grace_ms: 15000,
	snapshot_ms: 5 * 60 * 1000,
	snapshot_hold_ms: 4000,
	snapshot_max_ms: 20000,
	stagger_ms: 1500,
	window_lead_min: 2,
	window_tail_min: 45,
	region_cache_ms: 5000,
	dps_decay_ms: 15000,
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

const REALM_TIME_OFFSETS = { EU: 1, US: -5, ASIA: 7 };
const EVENT_SLOT_HOURS = { dailies: [13, 20], nightlies: [23] };

const SERVER_WATCH_KEY = "AL_server_watch";
const SERVER_LIST_KEY = "AL_server_list";
const SERVER_WATCH_LEASE_KEY = "AL_server_watch_owner";
const SERVER_HOP_KEY = "AL_server_hop";
const SERVER_HOP_LAST_KEY = "AL_server_hop_last";

var _watch_since = Date.now();
var _watch_sockets = {};
var _watch_state = {};
var _watch_holding = {};
var _watch_opened_at = {};
var _snapshot_due = {};
var _regions_cache = null;
var _regions_cache_at = 0;
var _watch_table = {};
var _watch_servers = null;
var _watch_servers_at = 0;
var _watch_list_pending_at = 0;
var _watch_complained = null;
var _local_live = null;
var _local_notices = false;
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

function game_frames() {
	const frames = [];

	const add = frame => {
		try {
			if (frame && !frames.includes(frame)) frames.push(frame);
		} catch (e) { }
	};

	try { add(window.parent); } catch (e) { }
	try { add(window.top); } catch (e) { }
	try { add(window.parent && window.parent.parent); } catch (e) { }
	add(window);

	return frames;
}

function frame_servers() {
	for (const frame of game_frames()) {
		try {
			const list = frame.X && frame.X.servers;
			if (list && collect_servers(list).length) return list;
		} catch (e) { }
	}
	return null;
}

function api_frame() {
	for (const frame of game_frames()) {
		try {
			if (typeof frame.api_call === "function") return frame;
		} catch (e) { }
	}
	return null;
}

function server_endpoint(server) {
	let host = String(server.address || server.addr || server.ip || server.actual_ip || server.host || "");
	let port = server.port;

	host = host.replace(/^wss?:\/\//, "").replace(/\/+$/, "");
	if (host.indexOf(":") >= 0) {
		const parts = host.split(":");
		host = parts[0];
		if (!port) port = parts[1];
	}

	return { host, port, path: server.path };
}

function server_realm(server) {
	if (server.region && server.name) return realm_key(server.region, server.name);

	const key = String(server.key || server.server || "");
	const parts = key.match(/^(EU|US|ASIA)[ _-]?(.*)$/i);
	return parts ? realm_key(parts[1].toUpperCase(), parts[2]) : key;
}

function collect_servers(list) {
	const servers = [];

	for (const id in (list || {})) {
		const server = list[id];
		if (!server || typeof server !== "object") continue;

		const endpoint = server_endpoint(server);
		if (!endpoint.host || !(endpoint.port || endpoint.path)) continue;

		const realm = server_realm(server);
		if (!realm) continue;

		const name = server.name || realm.split(" ").slice(1).join(" ");
		if (SERVER_WATCH.skip_servers.includes(String(name).toUpperCase())) continue;
		if (server.pvp || server.gameplay === "hardcore" || server.gameplay === "dungeon") continue;

		servers.push({ realm, host: endpoint.host, port: endpoint.port, path: endpoint.path });
	}

	return servers;
}

function publish_server_list(servers) {
	const stored = storage_read(SERVER_LIST_KEY);
	if (stored && (stored.realms || []).length >= servers.length
		&& Date.now() - (stored.at || 0) < SERVER_WATCH.server_list_ms) return;

	storage_write(SERVER_LIST_KEY, { at: Date.now(), by: character.name, realms: servers.map(s => s.realm) });
}

function adopt_servers(servers, source) {
	if (!servers.length) return false;

	const before = _watch_servers ? _watch_servers.length : 0;
	_watch_servers = servers;
	_watch_servers_at = Date.now();

	if (before !== servers.length) {
		game_log(`🛰️ Server watch: ${servers.length} realms from ${source} — `
			+ servers.map(s => s.realm).join(", "), "#7FD1FF");
	}

	servers.forEach((server, i) => {
		if (!(server.realm in _snapshot_due)) _snapshot_due[server.realm] = Date.now() + i * SERVER_WATCH.stagger_ms;
	});

	publish_server_list(servers);
	if (_watch_owner) {
		publish_watch();
		observers_tick();
	}
	return true;
}

function complain_once(message, color) {
	if (_watch_complained === message) return;
	_watch_complained = message;
	game_log(message, color);
}

function fetch_server_list() {
	if (_watch_servers && Date.now() - _watch_servers_at < SERVER_WATCH.server_list_ms) return;
	if (Date.now() - _watch_list_pending_at < SERVER_WATCH.list_pending_ms) return;

	if (adopt_servers(collect_servers(frame_servers()), "X.servers")) return;

	const frame = api_frame();
	if (!frame) {
		return complain_once("❌ Server watch: no X.servers in any frame and no api_call — cannot list realms", "#FF3333");
	}

	_watch_list_pending_at = Date.now();
	_watch_servers_at = Date.now();
	frame.api_call("get_servers", {}, {
		callback: response => {
			_watch_list_pending_at = 0;
			const message = response && response[0] && (response[0].message || response[0]);
			if (!adopt_servers(collect_servers(message), "get_servers")) {
				_watch_servers_at = Date.now() - SERVER_WATCH.server_list_ms + SERVER_WATCH.list_retry_ms;
				complain_once("⚠️ Server watch: get_servers returned nothing usable", "#FFA500");
			}
		},
	});
}

function cached_regions() {
	if (_regions_cache && Date.now() - _regions_cache_at < SERVER_WATCH.region_cache_ms) return _regions_cache;
	_regions_cache = region_schedules();
	_regions_cache_at = Date.now();
	return _regions_cache;
}

function region_in_window(region) {
	const group = cached_regions()[region];
	if (!group) return false;

	const now = new Date();
	const minutes = ((now.getUTCHours() + 24 + group.offset) % 24) * 60 + now.getUTCMinutes();

	for (const hour of (group.dailies || []).concat(group.nightlies || [])) {
		let since = minutes - hour * 60;
		if (since < -720) since += 1440;
		if (since > 720) since -= 1440;
		if (since >= -SERVER_WATCH.window_lead_min && since <= SERVER_WATCH.window_tail_min) return true;
	}

	return false;
}

function realm_should_hold(realm) {
	const known = _watch_table[realm];
	if (known && Object.keys(known.bosses || {}).length) return true;
	if (known && Object.keys(known.windows || {}).length) return true;
	return region_in_window(realm.split(" ")[0]);
}

function start_observer(server, snapshot) {
	_watch_holding[server.realm] = !snapshot;
	_watch_opened_at[server.realm] = Date.now();
	_snapshot_due[server.realm] = Date.now() + SERVER_WATCH.snapshot_ms;
	_watch_sockets[server.realm] = open_observer(server, snapshot);
}

function park_observer(realm) {
	close_observer(realm);
	_watch_state[realm] = "idle";
}

function observers_tick() {
	if (!_watch_owner || !_watch_servers) return;
	if (!observer_io()) {
		return void complain_once("❌ Server watch: no io in any frame — observers cannot connect", "#FF3333");
	}

	const mine = my_realm();
	const now = Date.now();

	for (const server of _watch_servers) {
		const realm = server.realm;

		if (realm === mine) {
			if (_watch_sockets[realm]) park_observer(realm);
			continue;
		}

		const open = !!_watch_sockets[realm];

		if (realm_should_hold(realm)) {
			if (!open) start_observer(server, false);
			continue;
		}

		if (open && _watch_holding[realm]) {
			park_observer(realm);
			continue;
		}

		if (open && now - (_watch_opened_at[realm] || 0) > SERVER_WATCH.snapshot_max_ms) {
			park_observer(realm);
			continue;
		}

		if (!open && now >= (_snapshot_due[realm] || 0)) start_observer(server, true);
	}
}

function observer_socket(server, snapshot) {
	const io = observer_io();
	const secure = String(location.protocol).indexOf("https") === 0;
	const address = server.port ? server.host + ":" + server.port : server.host;
	const options = {
		transports: ["websocket"],
		secure,
		query: "map_protocol=1&no_graphics=1",
		rejectUnauthorized: false,
		reconnection: !snapshot,
	};

	if (server.path) options.path = server.path;

	return typeof io === "function" ? io(address, options) : io.connect(address, options);
}

function observer_io() {
	for (const frame of game_frames()) {
		try {
			if (frame.io) return frame.io;
		} catch (e) { }
	}
	return null;
}

function open_observer(server, snapshot) {
	const socket = observer_socket(server, snapshot);

	socket.on("connect", () => {
		_watch_state[server.realm] = snapshot ? "sampling" : "connected";
	});
	socket.on("connect_error", e => {
		if (_watch_state[server.realm] === "failed") return;
		_watch_state[server.realm] = "failed";
		game_log(`⚠️ Server watch: ${server.realm} would not connect (${(e && e.message) || "error"})`, "#FFA500");
	});
	socket.on("disconnect", () => {
		_watch_state[server.realm] = "disconnected";
	});

	socket.on("welcome", data => {
		_watch_state[server.realm] = snapshot ? "sampled" : "welcomed";
		if (data && data.S) absorb_server_info(server.realm, data.S);
		if (snapshot) setTimeout(() => park_observer(server.realm), SERVER_WATCH.snapshot_hold_ms);
	});

	socket.on("notice", data => absorb_notice(server.realm, data && data.message));

	socket.on("server_info", data => {
		if (_watch_state[server.realm] !== "reporting") {
			_watch_state[server.realm] = "reporting";
			game_log(`🛰️ ${server.realm} is reporting`, "#7FD1FF");
		}
		absorb_server_info(server.realm, data);
	});

	return socket;
}

function close_observer(realm) {
	const socket = _watch_sockets[realm];
	if (!socket) return;
	try { socket.disconnect(); } catch (e) { }
	delete _watch_sockets[realm];
	delete _watch_state[realm];
	delete _watch_opened_at[realm];
}

function server_watch_probe() {
	const names = ["parent", "top", "grandparent", "self"];

	return game_frames().map((frame, i) => {
		const row = { frame: names[i] || String(i), servers: "blocked", api: "blocked", sample: "" };
		try {
			const list = frame.X && frame.X.servers;
			const keys = list ? Object.keys(list) : [];
			row.servers = keys.length;
			row.usable = list ? collect_servers(list).length : 0;
			row.api = typeof frame.api_call === "function";
			if (keys.length && !row.usable) row.sample = JSON.stringify(list[keys[0]]).slice(0, 200);
		} catch (e) { }
		return row;
	});
}

function server_watch_debug() {
	const lease = storage_read(SERVER_WATCH_LEASE_KEY);
	const stored = storage_read(SERVER_WATCH_KEY) || {};

	game_log(`🛰️ lease: ${lease ? lease.name : "none"} · me: ${character.name} · owner: ${_watch_owner}`, "#7FD1FF");
	const listed = storage_read(SERVER_LIST_KEY) || {};
	game_log(`🛰️ X.servers: ${((parent.X && parent.X.servers) || []).length} · mine: ${(_watch_servers || []).length}`
		+ ` · shared: ${(listed.realms || []).length} by ${listed.by || "nobody"}`, "#7FD1FF");
	game_log(`🛰️ realm: ${my_realm()} · table: ${Object.keys(stored.realms || {}).join(", ") || "empty"}`, "#7FD1FF");

	for (const row of server_watch_probe()) {
		game_log(`      frame ${row.frame}: X.servers=${row.servers} usable=${row.usable} api_call=${row.api}`, "#7FD1FF");
		if (row.sample) game_log(`         sample: ${row.sample}`, "#888");
	}
	if (_watch_complained) game_log(`      last error: ${_watch_complained}`, "#FFA500");

	for (const realm in _watch_sockets) {
		game_log(`      ${realm}: ${_watch_state[realm] || "opening"}`, "#7FD1FF");
	}
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

		const prior = known.bosses[name];
		const boss = {
			live: true,
			hp: entry.hp,
			max_hp: entry.max_hp,
			map: entry.map,
			x: entry.x,
			y: entry.y,
			target: entry.target || null,
			end: to_ms(entry.end),
			at: Date.now(),
			dps: prior ? prior.dps || 0 : 0,
			damaged_at: prior ? prior.damaged_at || 0 : 0,
		};

		if (prior && isFinite(prior.hp) && isFinite(boss.hp)) {
			const seconds = (boss.at - (prior.at || boss.at)) / 1000;
			if (boss.hp < prior.hp && seconds >= 0.5) {
				boss.dps = Math.round((prior.hp - boss.hp) / seconds);
				boss.damaged_at = boss.at;
			} else if (boss.at - boss.damaged_at > SERVER_WATCH.dps_decay_ms) {
				boss.dps = 0;
			}
		}

		known.bosses[name] = boss;
	}

	for (const name in known.spawns) {
		if (!(name in data)) delete known.spawns[name];
	}
	for (const name in known.windows) {
		if (!(name in data)) delete known.windows[name];
	}

	known.at = Date.now();
	_watch_table[realm] = known;

	const after = Object.keys(known.bosses).concat(Object.keys(known.windows));

	for (const name of after) {
		if (before.includes(name)) continue;
		const boss = known.bosses[name];
		const max = boss ? boss_max_hp(name, boss) : 0;
		record_event(realm, name, "started", max && isFinite(boss.hp) ? Math.round((boss.hp / max) * 100) : null);
	}

	for (const name of before) {
		if (after.includes(name)) continue;
		if (recent_event(realm, name, SERVER_WATCH.notice_grace_ms)) continue;
		record_event(realm, name, known.spawns[name] ? "killed" : "gone");
	}

	publish_watch();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WHAT HAPPENED — starts, kills and whether the party was on that realm at the time
// --------------------------------------------------------------------------------------------------------------------------------- //

var _monster_names = null;

function monster_type_for(display) {
	if (!_monster_names) {
		_monster_names = {};
		for (const type in (G.monsters || {})) {
			_monster_names[G.monsters[type].name] = type;
		}
	}
	return _monster_names[display] || null;
}

function realm_record(realm) {
	if (!_watch_table[realm]) _watch_table[realm] = { at: Date.now(), bosses: {}, spawns: {}, windows: {}, history: [] };
	if (!_watch_table[realm].history) _watch_table[realm].history = [];
	return _watch_table[realm];
}

function recent_event(realm, name, within_ms) {
	const known = _watch_table[realm];
	if (!known || !known.history) return false;
	return known.history.some(e => e.name === name && Date.now() - e.at < within_ms);
}

function record_event(realm, name, outcome, pct) {
	const known = realm_record(realm);

	known.history.unshift({
		name,
		outcome,
		at: Date.now(),
		pct: pct === undefined ? null : pct,
		present: realm === my_realm(),
	});
	known.history = known.history.slice(0, SERVER_WATCH.history_length);

	if (outcome !== "started") {
		game_log(`🛰️ ${name} ${outcome} on ${realm}${realm === my_realm() ? " — we were there" : ""}`, "#7FD1FF");
	}
}

function absorb_notice(realm, message) {
	if (!message) return;

	let outcome = null;
	if (message.indexOf(" has been defeated!") >= 0) outcome = "killed";
	else if (message.indexOf(" Event is over") >= 0) outcome = "expired";
	if (!outcome) return;

	const display = message.split(outcome === "killed" ? " has been defeated!" : " Event is over")[0].trim();
	const type = monster_type_for(display);
	if (!type) return;
	if (recent_event(realm, type, SERVER_WATCH.notice_grace_ms)) return;

	record_event(realm, type, outcome);
	publish_watch();
}

function track_local_realm() {
	const mine = my_realm();
	const watched = EVENT_LOCATIONS.map(e => e.name);
	const live = watched.filter(name => parent.S && parent.S[name] && parent.S[name].live);

	if (_local_live === null) {
		_local_live = live;
		return;
	}

	for (const name of live) {
		if (!_local_live.includes(name)) record_event(mine, name, "started");
	}

	for (const name of _local_live) {
		if (live.includes(name)) continue;
		if (recent_event(mine, name, SERVER_WATCH.notice_grace_ms)) continue;
		const entry = parent.S && parent.S[name];
		record_event(mine, name, entry && entry.spawn ? "killed" : "gone");
	}

	if (_local_live.length !== live.length) publish_watch();
	_local_live = live;
}

function watch_local_notices() {
	if (_local_notices) return;
	try {
		if (!parent.socket) return;
		parent.socket.on("notice", data => absorb_notice(my_realm(), data && data.message));
		_local_notices = true;
	} catch (e) { }
}

function publish_watch() {
	storage_write(SERVER_WATCH_KEY, {
		owner: character.name,
		at: Date.now(),
		realms: _watch_table,
		list: _watch_servers ? _watch_servers.map(s => s.realm) : [],
		states: _watch_state,
	});
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

function remote_boss_candidates() {
	const mine = my_realm();
	const realms = watch_realms();
	const now = Date.now();
	const found = [];

	for (const realm in realms) {
		if (realm === mine) continue;
		const seen = realms[realm];
		if (!seen) continue;

		const stale = now - (seen.at || 0) > SERVER_WATCH.entry_stale_ms;

		for (const name in seen.bosses) {
			const data = seen.bosses[name];
			if (!data || !data.live) continue;

			const max = boss_max_hp(name, data);
			const ratio = max && isFinite(data.hp) ? data.hp / max : 1;
			const busy = !!data.target
				|| (data.dps > 0 && now - (data.damaged_at || 0) < SERVER_WATCH.dps_decay_ms);

			const candidate = { realm, name, data, ratio, busy, dps: data.dps || 0, skip: null };

			if (stale) candidate.skip = "stale";
			else if (!busy && ratio > SERVER_HOP.join_below) candidate.skip = "nobody fighting it";
			else if (data.end && data.end - now < SERVER_HOP.min_window_ms) candidate.skip = "window closing";

			found.push(candidate);
		}
	}

	return found.sort((a, b) => {
		if (!a.skip !== !b.skip) return a.skip ? 1 : -1;
		if (a.busy !== b.busy) return a.busy ? -1 : 1;
		if (b.dps !== a.dps) return b.dps - a.dps;
		return a.ratio - b.ratio;
	});
}

function bosses_elsewhere() {
	return remote_boss_candidates().filter(candidate => !candidate.skip);
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

function known_realms() {
	const stored = storage_read(SERVER_WATCH_KEY) || {};
	const listed = storage_read(SERVER_LIST_KEY) || {};
	const realms = [];

	for (const realm of (listed.realms || []).concat(stored.list || [])) {
		if (!realms.includes(realm)) realms.push(realm);
	}
	for (const realm in (stored.realms || {})) {
		if (!realms.includes(realm)) realms.push(realm);
	}

	const mine = my_realm();
	if (mine && !realms.includes(mine)) realms.push(mine);

	return realms;
}

function region_schedules() {
	const seen = watch_realms();
	const mine = my_realm();
	const regions = {};

	for (const realm of known_realms()) {
		const region = realm.split(" ")[0];
		if (!regions[region]) regions[region] = { realms: [], offset: null, dailies: null, nightlies: null, observed: false };
		const group = regions[region];
		if (!group.realms.includes(realm)) group.realms.push(realm);

		const schedule = realm === mine
			? (parent.S && parent.S.schedule)
			: (seen[realm] && seen[realm].schedule);
		if (!schedule) continue;

		group.observed = true;
		if (group.offset === null && isFinite(schedule.time_offset)) group.offset = schedule.time_offset;
		if (!group.dailies && schedule.dailies) group.dailies = schedule.dailies;
		if (!group.nightlies && schedule.nightlies) group.nightlies = schedule.nightlies;
	}

	for (const region in regions) {
		const group = regions[region];
		if (group.offset === null) group.offset = REALM_TIME_OFFSETS[region] === undefined ? 0 : REALM_TIME_OFFSETS[region];
		if (!group.dailies) group.dailies = EVENT_SLOT_HOURS.dailies;
		if (!group.nightlies) group.nightlies = EVENT_SLOT_HOURS.nightlies;
		group.realms.sort();
	}

	return regions;
}

function upcoming_event_slots(horizon_hours) {
	const regions = region_schedules();
	const horizon = Date.now() + (horizon_hours || 26) * 60 * 60 * 1000;
	const slots = [];

	for (const region in regions) {
		const group = regions[region];
		const kinds = [["daily", group.dailies], ["nightly", group.nightlies]];

		for (const kind of kinds) {
			for (const hour of kind[1]) {
				const utc_hour = ((hour - group.offset) % 24 + 24) % 24;
				let at = next_utc_hour(utc_hour);
				while (at < horizon) {
					slots.push({ at, kind: kind[0], region, hour, realms: group.realms });
					at += 24 * 60 * 60 * 1000;
				}
			}
		}
	}

	return slots.sort((a, b) => a.at - b.at);
}

function next_slot_per_region() {
	const seen = {};
	const next = [];

	for (const slot of upcoming_event_slots(26)) {
		const key = `${slot.region}|${slot.kind}|${slot.hour}`;
		if (seen[key]) continue;
		seen[key] = true;
		next.push(slot);
	}

	return next;
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
			continue;
		}

		if (entry.live && watched.includes(name)) {
			seen.bosses[name] = { ...entry, end: to_ms(entry.end) };
			continue;
		}

		const ends = to_ms(entry.end || entry.expires);
		if (ends) seen.windows[name] = ends;
	}

	const stored = watch_realms()[my_realm()];
	if (stored && stored.history) seen.history = stored.history;

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

function hop_reason() {
	if (character.ctype === "merchant") return "merchant follows, never leads";

	const blocked = hop_blocked();
	if (blocked) return blocked;

	const last = storage_read(SERVER_HOP_LAST_KEY);
	if (last && Date.now() - (last.at || 0) < SERVER_HOP.cooldown_ms) {
		return `cooling down ${fmt_eta(last.at + SERVER_HOP.cooldown_ms - Date.now())}`;
	}

	if (typeof best_event_target === "function" && best_event_target()) return "a boss is up on our realm";
	if (!bosses_elsewhere().length) return "nothing joinable elsewhere";

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

	const parts = realm.split(" ");
	game_log(`🛰️ Hopping to ${realm} — ${why}`, "#7FD1FF");

	if (!change_realm(parts[0], parts[1])) {
		game_log("❌ No way to change realm — server hop disabled", "#FF3333");
		storage_clear(SERVER_HOP_KEY);
	}
}

function change_realm(region, identifier) {
	if (typeof change_server === "function") {
		change_server(region, identifier);
		return true;
	}

	for (const frame of game_frames()) {
		try {
			if (typeof frame.change_server === "function") {
				frame.change_server(region, identifier);
				return true;
			}
		} catch (e) { }
	}

	try {
		parent.window.location.href = "/character/" + encodeURIComponent(character.name)
			+ "/in/" + encodeURIComponent(region) + "/" + encodeURIComponent(identifier) + "/";
		return true;
	} catch (e) { }

	return false;
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

	if (hop_reason()) return;

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
				fetch_server_list();
				if (_watch_owner) {
					observers_tick();
					watch_local_notices();
					track_local_realm();
					publish_watch();
				}
				server_hop_tick();
			}
		} catch (e) {
			try { catcher(e, "server_watch_loop"); } catch (x) { }
		}
		await delay(SERVER_WATCH.tick_ms);
	}
}
