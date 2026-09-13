// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Warrior files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = WARRIOR_TARGET;

var CONFIG = {
	combat: {
		enabled: true,
		target_priority: ["Myras"],
		all_bosses,
		cleave_min_mobs: 3,
		cleave_min_mobs_held: 1,
		sample_hits: true,
		sample_positions: false,
		sample_targets: true,
		target_weights: { damage: 1, close: 0.05 },
		cleave_blacklist: ["plantoid", "pppompom"],
		agitate_min_mobs: 2,
		cluster_min_mobs: 2,
		cluster_radius: 40,
		agitate_blacklist: ["plantoid", "pppompom"],
		agitate_fireroamer_conditions: {
			healer_hp_pct: 0.60,
			healer_mp_pct: 0.80,
			ranger_hp_pct: 0.95,
			warrior_hp_pct: 0.95,
			max_mobs_in_range: 6
		},
		taunt_ents: false
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
		auto_swap_sets: true,
		boss_hp_thresholds: {
			mrpumpkin: 200000,
			mrgreen: 200000,
			franky: 999999999,
			icegolem: 999999999,
		},
		single_target_maps: ["halloween", "spookyforest", "desertland"],
		aoe_maps: ["cave", "main", "goobrawl", "level2n", "level2w", "mforest", "tunnel", "uhills", "winterland"],
		cleave_maps: ["cave", "desertland", "goobrawl", "halloween", "level2n", "level2w", "main", "mforest", "spookytown", "tunnel", "uhills", "winterland", "level2e"],
		mp_thresholds: { upper: 2350, lower: 2250 },
		chest_threshold: 12,
		swap_cooldown: 500,
		boss_set_swap_enabled: true,
		weapon_swap_enabled: true,

		weapon_selection: "value",
		weapon_sets: ["single", "aoe"],
		weapon_hysteresis_ms: 6000,
		weapon_switch_margin: 1.20,
		cleave_swap_ms: 617,

		mana_income_per_sec: 244,
		skill_mana_reserve: 0.40,
		party_dps_factor: 2.0
	},

	potions: {
		auto_buy: true,
		hp_threshold: 400,
		mp_threshold: 500,
		min_stock: 1000
	},

	elixir: { name: "pumpkinspice" },

	party: {
		auto_manage: true,
		group_members: ["Myras", "Ulric", "Riva", "Riff"]
	},

	looting: {
		enabled: false,
		chest_threshold: 3,
		target_count: 99,
		equip_gold_gear: false,
		loot_cooldown: 3000
	},

	skills: {
		stomp_enabled: true,
		cleave_enabled: true,
		agitate_enabled: true,
		taunt_enabled: true,
		charge_enabled: true,
		hardshell_enabled: true,
		hardshell_hp_threshold: 12000,
		warcry_enabled: true
	}
};

var destination = home_destination(home);

var ITEMS_TO_KEEP = [...ITEMS_TO_KEEP_BASE, "orbg"];

var item_order = {
	...ITEM_ORDER_BASE,
	candycanesword: [38, 39],
	fireblade: [40, 41],
	bataxe: 37,
};

var PANIC_THRESHOLDS = {
	low_hp: 0.35, low_mp: 0.01, high_hp: 0.60, high_mp: 0.02,
	aggro: 99, cooldown: 1000,
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

var equipment_sets = {
	single: [
		{ item_name: "fireblade", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "fireblade", slot: "offhand", level: 9, l: "l" },
	],
	sugarrush: [
		{ item_name: "candycanesword", slot: "mainhand", level: 7, l: "l" },
		{ item_name: "candycanesword", slot: "offhand", level: 7, l: "l" },
	],
	aoe: [
		{ item_name: "fireblade", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "ololipop", slot: "offhand", level: 9, l: "l" },
	],
	basher: [
		{ item_name: "basher", slot: "mainhand", level: 8, l: "l" }
	],
	bataxe: [
		{ item_name: "bataxe", slot: "mainhand", level: 9, l: "l" }
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
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
	],
	orb_dps: [
		{ item_name: "orbofstr", slot: "orb", level: 3, l: "l" },
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
	last_basher_swap: 0,
	last_cleave_swap: 0,
	equip_cooldowns: {},
	last_reposition: 0
};

var cache = make_cache({
	target: null,
	party_members: [],
	tank_entity: null,
	monsters_in_cleave_range: [],
});
