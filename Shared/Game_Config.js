// --------------------------------------------------------------------------------------------------------------------------------- //
// COMMON FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1: CONFIGURATION
// --------------------------------------------------------------------------------------------------------------------------------- //

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

const MOVEMENT_LEADER             = "Myras";

const POTION_TYPES = ["mpot1", "hpot1"];

const LOOT_THRESHOLD = 6;

const all_bosses = ["grinch", "icegolem", "dragold", "mrgreen", "mrpumpkin", "greenjr", "jr", "franky", "rgoo", "bgoo", "crabxx"];

const locations = {
	bat:        [{ map: "cave", x: 1200, y: -782 }],
	bigbird:    [{ map: "main", x: 1270, y: 245 }],
	booboo:     [{ map: "spookytown", x: 375, y: -739 }],
	bscorpion:  [{ map: "desertland", x: -408, y: -1141 }],
	boar:       [{ map: "winterland", x: 19, y: -1109 }],
	cgoo:       [{ x: -221, y: -274 }],
	crab:       [{ map: "main", x: -11840, y: -37 }],
	dryad:      [{ map: "mforest", x: 403, y: -347 }],
	ent:        [{ x: -420, y: -1960 }],
	fireroamer: [{ map: "desertland", x: 260, y: -800 }],
	// fireroamer: [{ map: "desertland", x: 113, y: -412 }],
	ghost:      [{ x: -405, y: -1642 }],
	gscorpion:  [{ x: 390, y: -1422 }],
	iceroamer:  [{ map: "winterland", x: 823, y: -45 }],
	mechagnome: [{ map: "cyberland", x: 0, y: 0 }],
	mole:       [{ map: "tunnel", x: 14, y: -1072 }],
	mummy:      [{ map: "spookytown", x: 256, y: -1417 }],
	odino:      [{ x: -52, y: 756 }],
	oneeye:     [{ map: "level2w", x: -255, y: 176 }],
	pinkgoblin: [{ x: 485, y: 157 }],
	poisio:     [{ map: "main", x: -121, y: 1360 }],
	prat:       [{ map: "level1", x: 11, y: 84 }],
	pppompom:   [{ x: 292, y: -189 }],
	plantoid:   [{ map: "desertland", x: -780, y: -387 }],
	rat:        [{ map: "mansion", x: 6, y: 430 }],
	scorpion:   [{ map: "main", x: -495, y: 685 }],
	stoneworm:  [{ x: 830, y: 7 }],
	spider:     [{ map: "main", x: 895, y: -145 }],
	giantspider: [{ }],
	squig:      [{ map: "main", x: -1175, y: 422 }],
	targetron:  [{ x: -544, y: -275 }],
	wolf:       [{ map: "winterland", x: 390, y: -2745 }],
	wolfie:     [{ map: "winterland", x: 113, y: -2014 }],
	xscorpion:  [{ x: -495, y: 685 }],
};

const HEALER_TARGET    = localStorage.getItem("AL_target_Myras") || "bscorpion";
const WARRIOR_TARGET   = localStorage.getItem("AL_target_Ulric") || "bscorpion";
const RANGER_TARGET    = localStorage.getItem("AL_target_Riva")  || "bscorpion";

const EVENT_LOCATIONS = [
	{ name: "mrpumpkin", map: "halloween", x: -217, y: 720 },
	{ name: "mrgreen", map: "spookytown", x: 605, y: 1000 },
	{ name: "dragold", map: "cave", x: 873, y: -727 },
	{ name: "franky", join: true, engage_below: 0.95 },
	{ name: "icegolem", join: true },
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 3: LOOP TOGGLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let STATE_CACHE_LOOP_ENABLED  = true;
let DUNGEON_LOOP_ENABLED      = false;
