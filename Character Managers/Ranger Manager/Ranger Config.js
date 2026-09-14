// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Ranger files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = RANGER_TARGET;

var CONFIG = {
	combat: {
		target_priority: ["Ulric", "Myras"],
		party_dps_factor: 2.0,

		always_attack: ["crabx", "bscorpion"],
		attack_if_targeted: [...ALL_BOSSES, "phoenix"],
		never_attack: ["nerfedmummy"],
		engage_aggroed_only: true,
		skill_blacklist: ["dryad", "fireroamer", "plantoid", "mole", "mummy"],
		use_hunters_mark: true,
		use_supershot: true,
		burn_enabled: true,
		lambda_headroom_low: 0.6,
		lambda_headroom_high: 1.5,
		cupid_engage_pct: 0.66,
		cupid_engage_pct_no_healer: 0.9,
		cupid_release_margin: 0.14,

		sample_hits: true,
	},

	movement: {
		enabled: true,
		reposition: true,
		circle_radius: 75,
		move_threshold: 10,
		follow_distance: 15,
	},

	equipment: {
		auto_swap_sets: true,
		swap_cooldown: 500,
		use_licence: false,

		weapon_swap_enabled: true,
		weapon_sets: ["single", "boom"],
	},

	looting: {
		enabled: false,
		chest_threshold: 3,
		target_count: 99,
		equip_gold_gear: false,
		loot_cooldown: 3000,
	},

	potions: {
		auto_buy: true,
		hp_threshold: 400,
		mp_threshold: 500,
		min_stock: 1000,
		prefer_mp: false,
	},

	elixir: { name: "pumpkinspice" },

	party: {
		auto_manage: true,
	},
};

var destination = home_destination(home);

var ITEMS_TO_KEEP = [...ITEMS_TO_KEEP_BASE, "cupid"];

var item_order = { ...ITEM_ORDER_BASE };

var PANIC_THRESHOLDS = {
	low_hp: 0.50, low_mp: 0.01, high_hp: 0.80, high_mp: 0.33,
	aggro: 1, cooldown: 1000,
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

var equipment_sets = {
	single: [
		{ item_name: "firebow", slot: "mainhand", level: 10, l: "l" },
		{ item_name: "t2quiver", slot: "offhand", level: 7, l: "l" },
	],
	boom: [
		{ item_name: "pouchbow", slot: "mainhand", level: 10, l: "l" },
		{ item_name: "alloyquiver", slot: "offhand", level: 7, l: "l" },
	],
	heal: [
		{ item_name: "cupid", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "t2quiver", slot: "offhand", level: 7, l: "l" },
	],
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
	],
	orb: [
		{ item_name: "orbofdex", slot: "orb", level: 4, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

var state = {
	equip_cooldowns: {},
	last_reposition: 0,
};

var cache = make_cache({
	targets: { sorted_by_value: [], in_range: [] },
	heal_target: null,
});
