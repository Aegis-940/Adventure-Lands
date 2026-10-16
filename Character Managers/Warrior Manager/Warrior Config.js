// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Warrior files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = null;

var CONFIG = {
	combat: {
		all_bosses: ALL_BOSSES,
		target_priority: ["Myras"],
		target_weights: { damage: 1, protects: 1, close: 0.05 },
		party_dps_factor: 2.0,

		cleave_min_mobs: 3,
		cleave_min_mobs_held: 1,
		agitate_min_mobs: 2,
		taunt_exempt: ["CrownTown", "CrownsAnal", "CrownPriest"],
		engage_radius: 150,
		swing_trick_cc_budget: 160,

		sample_targets: true,
	},

	movement: {
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
};

var destination = null;

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
	panic: PANIC_ORB_SET,
	orb_dps: [
		{ item_name: "cave_loaded_die", slot: "orb", level: 2, l: "l" },
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Warrior Config", () => {
	home = farm_target_for(character.name);
	destination = home_destination(home);
	cache = make_cache({
		target: null,
		party_members: [],
		tank_entity: null,
		monsters_in_cleave_range: [],
	});
});
