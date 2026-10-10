// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Warrior files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = farm_target_for(character.name);

var CONFIG = {
	combat: {
		all_bosses: ALL_BOSSES,
		target_priority: ["Myras"],
		target_weights: { damage: 1, protects: 1, close: 0.05 },
		party_dps_factor: 2.0,

		cleave_min_mobs: 3,
		cleave_min_mobs_held: 1,
		cleave_blacklist: ["pppompom", "porcupine"],
		cleave_boss_blacklist: ["franky", "icegolem"],
		cleave_lone_bosses: ["mrpumpkin", "mrgreen"],
		agitate_min_mobs: 2,
		agitate_blacklist: ["pppompom"],
		agitate_blockers: ["porcupine", "redfairy"],
		agitate_fireroamer_conditions: {
			healer_hp_pct: 0.60,
			healer_mp_pct: 0.80,
			ranger_hp_pct: 0.95,
			warrior_hp_pct: 0.95,
			max_mobs_in_range: 6
		},
		taunt_ents: false,
		taunt_bosses: ["mrpumpkin", "mrgreen"],
		taunt_exempt: ["CrownTown", "CrownsAnal", "CrownPriest"],
		engage_radius: 150,
		swap_trick_enabled: true,
		swing_trick_cc_budget: 160,

		sample_hits: true,
		sample_targets: true,
	},

	movement: {
		enabled: true,
		reposition: true,
		circle_radius: 35,
		move_threshold: 10,
		follow_distance: 15,
		position_min_gain: 5,
		position_travel_weight: 0.08,
	},

	equipment: {
		...EQUIPMENT_DEFAULTS,

		weapon_sets: ["single", "aoe", "double_aoe"],
		weapon_hysteresis_ms: 0,
		weapon_switch_margin: 1.0,
		weapon_min_swap_attacks: 0.25,
		weapon_smoothing_ms: 300,

		cleave_maps: ["cave", "desertland", "goobrawl", "halloween", "level2n", "level2w", "main", "mforest", "spookytown", "tunnel", "uhills", "winterland", "level2e", "winter_cove"],
		cleave_swap_ms: 0,
		mana_income_per_sec: 244,
		skill_mana_reserve: 0.40,
	},

	looting: { ...LOOTING_DEFAULTS },

	potions: { ...POTION_DEFAULTS },

	elixir: { name: "pumpkinspice" },

	party: {
		auto_manage: true,
	},

	skills: {
		stomp_enabled: true,
		cleave_enabled: true,
		agitate_enabled: true,
		taunt_enabled: true,
		charge_enabled: true,
		hardshell_enabled: true,
		hardshell_hp_threshold: 12000,
		warcry_enabled: true,
	},
};

var destination = home_destination(home);

var ITEMS_TO_KEEP = [...ITEMS_TO_KEEP_BASE];

var item_order = {
	...ITEM_ORDER_BASE,
	candycanesword: [38, 39],
	fireblade: [40, 41],
	bataxe: 37,
};

var PANIC_THRESHOLDS = {
	low_hp: 0.35, low_mp: 0.01, high_hp: 0.60, high_mp: 0.02,
	aggro: 99,
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

var equipment_sets = {
	single: [
		{ item_name: "fireblade", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "fireblade", slot: "offhand", level: 9, l: "l" },
	],
	aoe: [
		{ item_name: "fireblade", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "ololipop", slot: "offhand", level: 9, l: "l" },
	],
	double_aoe: [
		{ item_name: "vhammer", slot: "mainhand", level: 8, l: "l" },
		{ item_name: "ololipop", slot: "offhand", level: 9, l: "l" },
	],
	basher: [
		{ item_name: "wbasher", slot: "mainhand", level: 0 }
	],
	bataxe: [
		{ item_name: "bataxe", slot: "mainhand", level: 9, l: "l" }
	],
	candycane: [
		{ item_name: "candycanesword", slot: "mainhand" },
		{ item_name: "candycanesword", slot: "offhand" },
	],
	dps: [
		// { item_name: "cearring", slot: "earring1", level: 5, l: "l" },
		// { item_name: "cearring", slot: "earring2", level: 5, l: "u" },
		// { item_name: "coat", slot: "chest", level: 13, l: "l" },
		// { item_name: "suckerpunch", slot: "ring1", level: 2, l: "l" },
		// { item_name: "suckerpunch", slot: "ring2", level: 2, l: "u" },
		// { item_name: "fireblade", slot: "mainhand", level: 13, l: "s" },
		// { item_name: "candycanesword", slot: "offhand", level: 13, l: "s" },
	],
	luck: [
		// { item_name: "mearring", slot: "earring1", level: 0, l: "l" },
		// { item_name: "mearring", slot: "earring2", level: 0, l: "u" },
		// { item_name: "ringofluck", slot: "ring2", level: 0, l: "u" },
		// { item_name: "ringofluck", slot: "ring1", level: 0, l: "l" },
		// { item_name: "mshield", slot: "offhand", level: 9, l: "l" },
		// { item_name: "tshirt88", slot: "chest", level: 0, l: "l" }
	],
	stealth: [
		// { item_name: "stealthcape", slot: "cape", level: 0, l: "l" },
	],
	cape: [
		// { item_name: "vcape", slot: "cape", level: 6, l: "l" },
	],
	mana: [
		// { item_name: "tshirt9", slot: "chest", level: 6, l: "l" }
	],
	stat: [
		// { item_name: "coat", slot: "chest", level: 13, l: "l" }
	],
	dps_accessories: [
		// { item_name: "cearring", slot: "earring1", level: 5, l: "l" },
		// { item_name: "cearring", slot: "earring2", level: 5, l: "u" },
		// { item_name: "suckerpunch", slot: "ring1", level: 2, l: "l" },
		// { item_name: "suckerpunch", slot: "ring2", level: 2, l: "u" },
	],
	panic: PANIC_ORB_SET,
	orb_dps: [
		{ item_name: "cave_loaded_die", slot: "orb", level: 1, l: "l" },
	],
	orb_luck: [
		{ item_name: "rabbitsfoot", slot: "orb", level: 2, l: "l" },
	],
	orb_exp: [
		{ item_name: "talkingskull", slot: "orb", level: 3, l: "l" },
	],
	orb: [
		{ item_name: "talkingskull", slot: "orb", level: 3, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

var state = {
	last_reposition: 0
};

var cache = make_cache({
	target: null,
	party_members: [],
	tank_entity: null,
	monsters_in_cleave_range: [],
});
