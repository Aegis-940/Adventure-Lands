// --------------------------------------------------------------------------------------------------------------------------------- //
// COMMON FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1: CONFIGURATION
// --------------------------------------------------------------------------------------------------------------------------------- //

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const MOVEMENT_LEADER             = "Myras";

const LOOT_THRESHOLD = 6;

const all_bosses = ["grinch", "icegolem", "dragold", "mrgreen", "mrpumpkin", "greenjr", "jr", "franky", "rgoo", "bgoo", "crabxx"];

const locations = {
	bat:        [{ map: "cave", x: 1200, y: -782 }],
	bigbird:    [{ map: "main", x: 1270, y: 245 }],
	booboo:     [{ map: "spookytown", x: 375, y: -739 }],
	bscorpion:  [{ map: "desertland", x: -408, y: -1141 }],
	boar:       [{ map: "winterland", x: 19, y: -1109 }],
	cgoo:       [{ map: "level4", x: -221, y: -274 }],
	crab:       [{ map: "main", x: -11840, y: -37 }],
	dryad:      [{ map: "mforest", x: 403, y: -347 }],
	ent:        [{ map: "desertland", x: -420, y: -1960 }],
	fireroamer: [{ map: "desertland", x: 260, y: -800 }],
	// fireroamer: [{ map: "desertland", x: 113, y: -412 }],
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
	prat:       [{ map: "level1", x: 11, y: 84 }],
	pppompom:   [{ map: "level2n", x: 292, y: -189 }],
	plantoid:   [{ map: "desertland", x: -780, y: -387 }],
	rat:        [{ map: "mansion", x: 6, y: 430 }],
	scorpion:   [{ map: "main", x: -495, y: 685 }],
	stoneworm:  [{ map: "spookytown", x: 830, y: 7 }],
	spider:     [{ map: "main", x: 895, y: -145 }],
	giantspider: [{ }],
	squig:      [{ map: "main", x: -1175, y: 422 }],
	targetron:  [{ map: "uhills", x: -544, y: -275 }],
	wolf:       [{ map: "winterland", x: 390, y: -2745 }],
	wolfie:     [{ map: "winterland", x: 113, y: -2014 }],
	xscorpion:  [{ map: "halloween", x: -495, y: 685 }],
};

const HEALER_TARGET    = localStorage.getItem("AL_target_Myras") || "bscorpion";
const WARRIOR_TARGET   = localStorage.getItem("AL_target_Ulric") || "bscorpion";
const RANGER_TARGET    = localStorage.getItem("AL_target_Riva")  || "bscorpion";

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
	const loc = (locations[type] || [])[0] || {};
	const map = loc.map || location_map_for(type, loc);
	if (!map) {
		game_log(`⚠️ locations.${type} has no map and none could be derived — `
			+ `travelling home is disabled for this target.`, "#FF3333");
	}
	return { map, x: loc.x, y: loc.y };
}

const EVENT_LOCATIONS = [
	{ name: "mrpumpkin", map: "halloween", x: -217, y: 720 },
	{ name: "mrgreen", map: "spookytown", x: 605, y: 1000 },
	{ name: "dragold", map: "cave", x: 873, y: -727 },
	{ name: "franky", join: true, engage_below: 0.95 },
	{ name: "icegolem", join: true },
	{ name: "crabxx", join: true, dynamic: true },
	// { name: "wabbit", dynamic: true },
];

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 2: CONSTANTS
// --------------------------------------------------------------------------------------------------------------------------------- //

const TICK_RATE = {
	main: 100,
	action: 1,
	skill: 40,
	equipment: 25,
	maintenance: 2000
};

const COOLDOWNS = {
	equip_swap: 300,
	weapon_swap: 1000,
	zapper_swap: 200,
	cc: 125
};

const CACHE_TTL = 50;

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

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
let DUNGEON_LOOP_ENABLED      = false;
