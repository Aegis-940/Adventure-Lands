// --------------------------------------------------------------------------------------------------------------------------------- //
// COMMON FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1: CONFIGURATION
// --------------------------------------------------------------------------------------------------------------------------------- //

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const MOVEMENT_LEADER             = "Myras";

const DUNGEON_PARTY               = ["Myras", "Ulric", "Riva"];
const DUNGEON_FOLLOWERS           = ["Ulric", "Riva"];

const LOOT_THRESHOLD = 6;

const ALL_BOSSES = ["grinch", "icegolem", "dragold", "mrgreen", "mrpumpkin", "greenjr", "jr", "franky", "rgoo", "bgoo", "crabxx"];

const LOCATIONS = {
	bat:        [{ map: "cave", x: 1200, y: -782 }],
	bbpompom:   [{ map: "winter_cave", x: -83, y: -949 }],
	bigbird:    [{ map: "main", x: 1270, y: 245 }],
	booboo:     [{ map: "spookytown", x: 375, y: -739 }],
	bscorpion:  [{ map: "desertland", x: -408, y: -1141 }],
	boar:       [{ map: "winterland", x: 19, y: -1109 }],
	cgoo:       [{ map: "level4", x: -221, y: -274 }],
	crab:       [{ map: "main", x: -1184, y: -37 }],
	croc:       [{ map: "main", x: 801, y: 1710 }],
	crypt:      [{ }],
	dryad:      [{ map: "mforest", x: 403, y: -347 }],
	ent:        [{ map: "desertland", x: -420, y: -1960 }],
	fireroamer: [{ map: "desertland", x: 260, y: -800 }],
	// fireroamer: [{ map: "desertland", x: 113, y: -412 }],
	frog:       [{ map: "main", x: -1125, y: 1118 }],
	ghost:      [{ map: "halloween", x: -405, y: -1642 }],
	gscorpion:  [{ map: "desertland", x: 390, y: -1422 }],
	iceroamer:  [{ map: "winterland", x: 823, y: -45 }],
	mechagnome: [{ map: "cyberland", x: 0, y: 0 }],
	mole:       [{ map: "tunnel", x: 14, y: -1072 }],
	mummy:      [{ map: "spookytown", x: 256, y: -1417 }],
	odino:      [{ map: "mforest", x: -52, y: 756 }],
	oneeye:     [{ map: "level2w", x: -255, y: 176 }],
	pinkgoblin: [{ map: "level2e", x: 485, y: 157 }],
	poisio:     [{ map: "main", x: -121, y: 1360 }],
	porcupine:  [{ map: "desertland", x: -829, y: 135 }],
	prat:       [{ map: "level1", x: 11, y: 84 }],
	pppompom:   [{ map: "level2n", x: 292, y: -189 }],
	plantoid:   [{ map: "desertland", x: -780, y: -387 }],
	rat:        [{ map: "mansion", x: 6, y: -430 }],
	scorpion:   [{ map: "main", x: 1520, y: -58 }],
	stoneworm:  [{ map: "spookytown", x: 830, y: 7 }],
	spider:     [{ map: "main", x: 895, y: -145 }],
	giantspider: [{ }],
	squig:      [{ map: "main", x: -1175, y: 422 }],
	targetron:  [{ map: "uhills", x: -544, y: -275 }],
	wolf:       [{ map: "winterland", x: 390, y: -2745 }],
	wolfie:     [{ map: "winterland", x: 113, y: -2014 }],
	xscorpion:  [{ map: "halloween", x: -495, y: 685 }],
};

const DUNGEONS = {};

const DEFAULT_FARM_TARGET = "bscorpion";

function farm_target_key(name) {
	return "AL_target_" + name;
}

function farm_target_for(name) {
	try {
		return localStorage.getItem(farm_target_key(name)) || DEFAULT_FARM_TARGET;
	} catch (e) {
		return DEFAULT_FARM_TARGET;
	}
}

function location_map_for(type, loc) {
	let only = null;
	let seen = 0;
	try {
		for (const m in G.maps) {
			for (const spawn of G.maps[m].monsters || []) {
				if (spawn.type !== type) continue;
				seen++;
				if (!only) only = m;
				const b = spawn.boundary;
				if (b && loc.x >= b[0] && loc.y >= b[1] && loc.x <= b[2] && loc.y <= b[3]) return m;
			}
		}
	} catch (e) { return null; }
	return seen === 1 ? only : null;
}

function home_destination(type) {
	const loc = (LOCATIONS[type] || [])[0] || {};
	const map = loc.map || location_map_for(type, loc);
	if (!map) {
		game_log(`⚠️ LOCATIONS.${type} has no map and none could be derived — `
			+ `travelling home is disabled for this target.`, "#FF3333");
	}
	return { map, x: loc.x, y: loc.y };
}

const EVENT_LOCATIONS = [
	{ name: "mrpumpkin", map: "halloween", x: -217, y: 720 },
	{ name: "mrgreen", map: "spookytown", x: 605, y: 1000 },
	{ name: "dragold", map: "cave", x: 873, y: -727 },
	{ name: "franky", join: true, engage_below: 0.95, exclusive: true, leash: false },
	{ name: "icegolem", join: true, engage_below: 0.95 },
	{ name: "crabxx", join: true, engage_below: 0.95 },
	// { name: "wabbit", dynamic: true },
];

const BOSS_NEARLY_DEAD_HP = 0.05;

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1b: SHARED CONFIG DEFAULTS — each fighter spreads these and overrides only what it tunes
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOTING_DEFAULTS = {
	enabled: false,
	chest_threshold: 3,
	target_count: 99,
	equip_gold_gear: false,
	loot_cooldown: 3000,
};

const POTION_DEFAULTS = {
	auto_buy: true,
	hp_threshold: 400,
	mp_threshold: 500,
	min_stock: 1000,
	prefer_mp: false,
};

const EQUIPMENT_DEFAULTS = {
	auto_swap_sets: true,
	weapon_swap_enabled: true,
};

const PANIC_ORB_SET = [
	{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
];

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1c: CROSS-CHARACTER SYMBOLS — declared here so every reader can assume they exist
//
// Core Systems is shared by all four characters, but several of these are only filled in by the
// fighters; the merchant leaves them at the defaults below. Declaring them once here is what lets
// every call site read them directly instead of guarding on typeof.
//
// `var`, not const/let: the character files re-declare the same names through indirect eval, and a
// lexical declaration here would collide with that. Ownership is unchanged — `Party Management.js`
// is still the only writer of the panic state, each `[Role] Config.js` of its own config.
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = null;
var destination = null;
var CONFIG = {};
var cache = null;

var equipment_sets = {};
var ITEMS_TO_KEEP = [];
var MONSTER_GEAR_OVERRIDES = {};
var EQUIPMENT_RULES = null;

var PANIC_BROADCAST_TARGETS = [];
var panicking = false;
var panic_external = false;
var panic_since = 0;

function request_delivery() { }
function model_prediction() { return null; }
function get_character_state() { return null; }

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 2: CONSTANTS
// --------------------------------------------------------------------------------------------------------------------------------- //

const TICK_RATE = {
	main: 100,
	skill: 40,
	equipment: 25,
	maintenance: 2000,
	retry: 10
};

const COOLDOWNS = {
	zapper_swap: 200,
	cc: 160
};

const CACHE_TTL = 50;

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 2a: RELOADS — a party-wide reload restarts one character at a time, never all four in the same second
// --------------------------------------------------------------------------------------------------------------------------------- //

const RELOAD_ORDER = ["Myras", "Ulric", "Riva", "Riff"];
const RELOAD_BASE_MS = 500;
const RELOAD_STAGGER_MS = 1500;

function staggered_reload() {
	const wait = RELOAD_BASE_MS + RELOAD_ORDER.indexOf(character.name) * RELOAD_STAGGER_MS;
	game_log(`[reload] Restarting in ${Math.round(wait / 1000)}s`, "#FFAA00");
	setTimeout(() => parent.window.location.reload(), wait);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 2b: JSON-BACKED STORAGE — the one read/write pair for structured localStorage values
// --------------------------------------------------------------------------------------------------------------------------------- //

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
		return true;
	} catch (e) {
		return false;
	}
}

const STATE_CACHE_KEY_PREFIX = "AL_char_state_";
const STATE_CACHE_STALE_MS = 15000;

function read_state_cache(name) {
	const state = storage_read(STATE_CACHE_KEY_PREFIX + name);
	if (!state) return null;
	if (Date.now() - state.last_seen > STATE_CACHE_STALE_MS) return null;
	return state;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 2c: FLIGHT RECORDER STUBS — Error Log.js replaces these when it loads; absent, every call is a no-op
// --------------------------------------------------------------------------------------------------------------------------------- //

var main_beat_at = 0;

function main_beat() {
	main_beat_at = Date.now();
}

function errlog_record() { }
function errlog_sample() { }
function errlog_count() { }
function errlog_beat() { }
function errlog_size() { }
function errlog_time() { }
function errlog_timeline() { }

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 3: MANUAL CONTROL
// --------------------------------------------------------------------------------------------------------------------------------- //

const AUTOMATION_KEY_PREFIX = "AL_automation_paused_";
const AUTOMATION_POLL_MS = 250;

let _automation = { at: 0, on: true };

function automation_key() {
	return AUTOMATION_KEY_PREFIX + ((character && character.name) || "unknown");
}

function automation_enabled() {
	const now = Date.now();
	if (now - _automation.at < AUTOMATION_POLL_MS) return _automation.on;
	_automation.at = now;
	try { _automation.on = localStorage.getItem(automation_key()) !== "1"; }
	catch (e) { _automation.on = true; }
	return _automation.on;
}

function set_automation(on) {
	try { localStorage.setItem(automation_key(), on ? "0" : "1"); } catch (e) { }
	_automation.at = 0;
	return automation_enabled();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 4: LOOP TOGGLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let STATE_CACHE_LOOP_ENABLED  = true;
