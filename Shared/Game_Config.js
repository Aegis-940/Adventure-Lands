// --------------------------------------------------------------------------------------------------------------------------------- //
// COMMON FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1: CONFIGURATION
// --------------------------------------------------------------------------------------------------------------------------------- //

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

// For potion deliveries from merchant
const POTION_TYPES = ["mpot1", "hpot1"];

// Merchant collects nth item and above when collecting loot.
const LOOT_THRESHOLD = 6;

const all_bosses = ["grinch", "icegolem", "dragold", "mrgreen", "mrpumpkin", "greenjr", "jr", "franky", "rgoo", "bgoo", "crabxx"];

const locations = {
	bat:        [{ x: 1200, y: -782 }],
	bigbird:    [{ map: "main", x: 1270, y: 245 }],
	booboo:     [{ map: "spookytown", x: 375, y: -739 }],
	bscorpion:  [{ map: "desertland", x: -408, y: -1141 }],
	boar:       [{ x: 19, y: -1109 }],
	cgoo:       [{ x: -221, y: -274 }],
	crab:       [{ x: -11840, y: -37 }],
	dryad:      [{ map: "mforest", x: 403, y: -347 }],
	ent:        [{ x: -420, y: -1960 }],
	fireroamer: [{ map: "desertland", x: 150, y: -650 }],
	// fireroamer: [{ map: "desertland", x: 113, y: -412 }],
	ghost:      [{ x: -405, y: -1642 }],
	gscorpion:  [{ x: 390, y: -1422 }],
	iceroamer:  [{ x: 823, y: -45 }],
	mechagnome: [{ map: "cyberland", x: 0, y: 0 }],
	mole:       [{ x: 14, y: -1072 }],
	mummy:      [{ map: "spookytown", x: 256, y: -1417 }],
	odino:      [{ x: -52, y: 756 }],
	oneeye:     [{ x: -255, y: 176 }],
	pinkgoblin: [{ x: 485, y: 157 }],
	poisio:     [{ x: -121, y: 1360 }],
	prat:       [{ x: 11, y: 84 }],
	pppompom:   [{ x: 292, y: -189 }],
	plantoid:   [{ map: "desertland", x: -780, y: -387 }],
	rat:        [{ x: 6, y: 430 }],
	scorpion:   [{ x: -495, y: 685 }],
	stoneworm:  [{ x: 830, y: 7 }],
	spider:     [{ x: 895, y: -145 }],
	giantspider: [{ }],
	squig:      [{ x: -1175, y: 422 }],
	targetron:  [{ x: -544, y: -275 }],
	wolf:       [{ map: "winterland", x: 390, y: -2745 }],
	wolfie:     [{ x: 113, y: -2014 }],
	xscorpion:  [{ x: -495, y: 685 }],
};

// Overridable live via UI/Settings_Window.js — localStorage is shared across all 4 characters' tabs,
// so a save from any tab applies on every character's next reload. Falls back to default otherwise.
const HEALER_TARGET    = localStorage.getItem("AL_target_Myras") || "bscorpion";
const WARRIOR_TARGET   = localStorage.getItem("AL_target_Ulric") || "bscorpion";
const RANGER_TARGET    = localStorage.getItem("AL_target_Riva")  || "bscorpion";

const MERCHANT_TARGET  = { map: "main", x: -87, y: -96 };

const EVENT_LOCATIONS = [
	{ name: "mrpumpkin", map: "halloween", x: -217, y: 720 },
	{ name: "mrgreen", map: "spookytown", x: 605, y: 1000 },
	{ name: "dragold", map: "cave", x: 873, y: -727 },
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

const SOFT_RESTART_TIMER = 60000;    // 1 minute
const HARD_RESET_TIMER   = 90000;    // 1.5 minutes

const PANIC_ORB   = "jacko";

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 3: LOOP TOGGLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let HEAL_LOOP_ENABLED         = true;
let MOVE_LOOP_ENABLED         = false;
let SKILL_LOOP_ENABLED        = true;
let PANIC_LOOP_ENABLED        = true;
let BOSS_LOOP_ENABLED         = false;
let ORBIT_LOOP_ENABLED        = false;
let POTION_LOOP_ENABLED       = true;
let LOOT_LOOP_ENABLED         = true;
let STATE_CACHE_LOOP_ENABLED  = true;
let PRIM_FARM_LOOT_ENABLED    = true;
let DUNGEON_LOOP_ENABLED      = false;

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 4: STATE VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let attack_mode                   = true;
let handling_death = false;
let timeout_interval = 30000; // Default timeout of 30 seconds


// --------------------------------------------------------------------------------------------------------------------------------- //
// Rest of this file split into Shared/Movement.js, Combat_Utilities.js, Messaging.js, Party_And_Loot.js,
// and Error_Handling.js — all still load as real <script> tags (Bootstrapper.js scripts[]), same global scope.
// --------------------------------------------------------------------------------------------------------------------------------- //
