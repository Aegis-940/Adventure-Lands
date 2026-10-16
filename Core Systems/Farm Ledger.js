// --------------------------------------------------------------------------------------------------------------------------------- //
// FARM LEDGER — gold, XP and kills per 5 minutes, split into time at the farm spot and time away; every chest; the daily tracker snapshot
// --------------------------------------------------------------------------------------------------------------------------------- //

const LEDGER_WINDOW_MS = 5 * 60 * 1000;
const LEDGER_TICK_MS = 1000;
const FARM_AREA_MARGIN = 200;
const FARM_AREA_FALLBACK_RADIUS = 400;
const EVENT_GOAL_LABELS = ["event-", "boss-loot", "holiday-tree"];
const LEDGER_PARTY = [PARTY_LEADER].concat(PARTY_MEMBERS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// FARM AREA — the spawn boxes of the farm target, widened by a margin, on the destination map
// --------------------------------------------------------------------------------------------------------------------------------- //

const _farm_area_boxes = {};

function farm_area_boxes(type, map) {
	const key = type + "|" + map;
	if (_farm_area_boxes[key]) return _farm_area_boxes[key];

	const boxes = [];
	for (const spawn of G.maps[map].monsters || []) {
		if (spawn.type !== type) continue;
		if (spawn.boundary) boxes.push(spawn.boundary);
		for (const b of spawn.boundaries || []) {
			if (b[0] === map) boxes.push(b.slice(1));
		}
	}
	_farm_area_boxes[key] = boxes;
	return boxes;
}

function in_farm_area(map, x, y, margin = FARM_AREA_MARGIN) {
	if (!destination || !destination.map || map !== destination.map) return false;
	const boxes = farm_area_boxes(home, destination.map);
	if (!boxes.length) return Math.hypot(x - destination.x, y - destination.y) <= FARM_AREA_FALLBACK_RADIUS;
	return boxes.some(b => x >= b[0] - margin && x <= b[2] + margin && y >= b[1] - margin && y <= b[3] + margin);
}

function is_event_goal(label) {
	return !!label && EVENT_GOAL_LABELS.some(prefix => label.indexOf(prefix) === 0);
}

function party_on_event() {
	if (is_event_goal(current_goal_label())) return true;
	const leader = read_state_cache(MOVEMENT_LEADER);
	return !!leader && is_event_goal(leader.goal);
}

function at_farm_spot() {
	return !character.rip && in_farm_area(character.map, character.x, character.y) && !party_on_event();
}

function foreign_players_in_farm_area() {
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "character" || e.npc || LEDGER_PARTY.includes(e.name)) continue;
		if (in_farm_area(character.map, e.x, e.y, 0)) count++;
	}
	return count;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LEDGER WINDOW
// --------------------------------------------------------------------------------------------------------------------------------- //

let _ledger = null;
let _ledger_spot = false;
let _ledger_tick_at = 0;
let _ledger_xp = null;
let _ledger_rip = false;
let _ledger_recovering = false;
let _ledger_gear = "";

function ledger_window(now) {
	return {
		started: now,
		home,
		survey_spot: survey_spot_now() === home ? home : null,
		variant_start: experiment_variants(),
		at_spot_ms: 0,
		death_ms: 0,
		total: { gold: 0, chest_gold: 0, xp: 0, kills: {} },
		spot: { gold: 0, chest_gold: 0, xp: 0, kills: {} },
		deaths: 0,
		players_nearby: 0,
		potions: { hp: potions_drunk.hp, mp: potions_drunk.mp },
	};
}

function ledger_add(field, amount) {
	_ledger.total[field] += amount;
	if (_ledger_spot) _ledger.spot[field] += amount;
}

function ledger_add_kill(mtype) {
	_ledger.total.kills[mtype] = (_ledger.total.kills[mtype] || 0) + 1;
	if (_ledger_spot) _ledger.spot.kills[mtype] = (_ledger.spot.kills[mtype] || 0) + 1;
}

function ledger_on_loot(data) {
	if (!data.gold) return;
	ledger_add("gold", data.gold);
	ledger_add("chest_gold", chest_gold(data));
}

function xp_gained(before, after) {
	if (after.level === before.level) return after.xp - before.xp;
	let gained = G.levels[before.level] - before.xp;
	for (let level = before.level + 1; level < after.level; level++) gained += G.levels[level];
	return gained + after.xp;
}

function gear_signature() {
	const gear = {};
	for (const slot in character.slots) {
		const item = character.slots[slot];
		if (item && slot !== "elixir") gear[slot] = item.name + (item.level ? "+" + item.level : "");
	}
	return gear;
}

function fighters_here() {
	return COHESION_FOLLOWERS.concat([MOVEMENT_LEADER]).filter(name => {
		if (name === character.name) return true;
		const s = party_state(name);
		return !!s && !s.rip && s.map === character.map;
	});
}

function ledger_gear_change() {
	const gear = JSON.stringify(gear_signature());
	if (gear === _ledger_gear) return undefined;
	_ledger_gear = gear;
	return JSON.parse(gear);
}

function ledger_close(now) {
	const w = _ledger;
	errlog_archive("ledger", {
		window_s: Math.round((now - w.started) / 1000),
		at_spot_s: Math.round(w.at_spot_ms / 1000),
		death_s: Math.round(w.death_ms / 1000),
		map: character.map,
		home: w.home,
		survey_spot: w.survey_spot,
		variant_start: w.variant_start,
		level: character.level,
		gold: w.total.gold,
		chest_gold: w.total.chest_gold,
		xp: w.total.xp,
		kills: w.total.kills,
		spot: w.spot,
		deaths: w.deaths,
		potions: { hp: potions_drunk.hp - w.potions.hp, mp: potions_drunk.mp - w.potions.mp },
		players_nearby: w.players_nearby,
		party: fighters_here(),
		goldm: character.goldm,
		xpm: character.xpm,
		luckm: character.luckm,
		gear: ledger_gear_change(),
	});
	if (at_farm_spot()) errlog_snapshot("farm");
	_ledger = ledger_window(now);
	bus_emit("ledger_window", { now });
}

function ledger_tick() {
	const now = Date.now();
	const dt = _ledger_tick_at ? now - _ledger_tick_at : 0;
	_ledger_tick_at = now;

	if (home !== _ledger.home) {
		ledger_close(now);
		_ledger_recovering = false;
	}
	const was_spot = _ledger_spot;
	_ledger_spot = at_farm_spot();
	if (character.rip && was_spot) _ledger_recovering = true;
	if (_ledger_spot || party_on_event()) _ledger_recovering = false;
	if (_ledger_recovering) _ledger.death_ms += dt;
	if (_ledger_spot) {
		_ledger.at_spot_ms += dt;
		_ledger.players_nearby = Math.max(_ledger.players_nearby, foreign_players_in_farm_area());
	}

	const xp_now = { level: character.level, xp: character.xp };
	if (_ledger_xp) ledger_add("xp", xp_gained(_ledger_xp, xp_now));
	_ledger_xp = xp_now;

	if (character.rip && !_ledger_rip) _ledger.deaths++;
	_ledger_rip = !!character.rip;

	tracker_snapshot_due(now);
	if (now - _ledger.started >= LEDGER_WINDOW_MS) ledger_close(now);
}

function ledger_flush() {
	ledger_close(Date.now());
	errlog_send_archive();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT — one record per party chest: the monster, what was in it, and the luck it was rolled on
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOT_RECORDER = "Myras";
const LOOT_MATCH_MS = 500;
const LOOT_KEPT_MS = 60000;
const LOOT_KILLS_KEPT = 50;

const _loot_kills = [];
const _loot_drops = {};

function loot_on_kill(data) {
	_loot_kills.push({ t: Date.now(), mtype: data.mtype });
	if (_loot_kills.length > LOOT_KILLS_KEPT) _loot_kills.shift();
}

function loot_on_drop(data) {
	_loot_drops[data.id] = { t: Date.now(), map: data.map, chest: data.chest, items: data.items, luckm: character.luckm };
}

function loot_mtype(drop) {
	let best = null;
	for (const kill of _loot_kills) {
		const gap = Math.abs(kill.t - drop.t);
		if (gap <= LOOT_MATCH_MS && (!best || gap < best.gap)) best = { gap, mtype: kill.mtype };
	}
	return best ? best.mtype : null;
}

function loot_on_open(data) {
	if (data.gone) return;
	const drop = _loot_drops[data.id];
	delete _loot_drops[data.id];
	errlog_archive("loot", {
		mtype: drop ? loot_mtype(drop) : null,
		chest: drop ? drop.chest : null,
		map: drop ? drop.map : character.map,
		luckm: drop ? drop.luckm : null,
		opener: data.opener,
		goldm: data.goldm,
		gold: chest_gold(data),
		items: (data.items || []).map(i => ({ name: i.name, q: i.q || 1, level: i.level || 0, p: i.p, looter: i.looter })),
		dry: !!data.dry,
		stale: !!data.stale,
	});
}

function prune_loot_drops() {
	for (const id in _loot_drops) {
		if (Date.now() - _loot_drops[id].t > LOOT_KEPT_MS) delete _loot_drops[id];
	}
}

function loot_log_start() {
	on_socket("kill_credit", "loot_kill", loot_on_kill);
	on_socket("drop", "loot_drop", loot_on_drop);
	on_character("loot", "loot_log", loot_on_open);
	every("loot drops", { ms: LOOT_KEPT_MS, kind: "telemetry", fixed: true }, prune_loot_drops);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TRACKER SNAPSHOT — once a day, the server's per-monster kill counts and the account's max stats
// --------------------------------------------------------------------------------------------------------------------------------- //

const TRACKER_SNAPSHOT_MS = 24 * 60 * 60 * 1000;
const TRACKER_REPLY_MS = 10000;
const TRACKER_ITEMS = ["tracker", "supercomputer"];

let _tracker_asked_at = 0;

function tracker_key() {
	return "AL_tracker_at_" + character.name;
}

function tracker_snapshot_due(now) {
	if (now - _tracker_asked_at < TRACKER_SNAPSHOT_MS) return;
	const last = storage_read(tracker_key()) || 0;
	if (now - last < TRACKER_SNAPSHOT_MS) {
		_tracker_asked_at = last;
		return;
	}
	_tracker_asked_at = now;

	if (!character.items.some(item => item && TRACKER_ITEMS.includes(item.name))) {
		log_msg("warn", "Tracker snapshot skipped: no tracker in the bag");
		errlog_count("tracker snapshot no tracker");
		return;
	}
	parent.socket.emit("tracker");
}

function tracker_reply(data) {
	if (Date.now() - _tracker_asked_at > TRACKER_REPLY_MS) return;
	parent.hide_modal(true);
	storage_write(tracker_key(), Date.now());
	errlog_archive("tracker", { level: character.level, monsters: data.monsters, monsters_diff: data.monsters_diff, max: data.max });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// START
// --------------------------------------------------------------------------------------------------------------------------------- //

function farm_ledger_start() {
	_ledger = ledger_window(Date.now());
	_ledger_rip = !!character.rip;
	on_character("loot", "ledger_loot", ledger_on_loot);
	on_socket("kill_credit", "ledger_kill_handler", data => ledger_add_kill(data.mtype));
	on_socket("tracker", "ledger_tracker_handler", tracker_reply);
	every("ledger", { ms: LEDGER_TICK_MS, kind: "telemetry", fixed: true }, ledger_tick);
	on_dom(window, "pagehide", "ledger_flush", ledger_flush);
	if (character.name === LOOT_RECORDER) loot_log_start();
}
