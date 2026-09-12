// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Ranger files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = RANGER_TARGET;

var CONFIG = {
	combat: {
		enabled: true,
		target_priority: ["Ulric", "Myras"],
		always_attack: ["crabx", "bscorpion"],
		attack_if_targeted: [...all_bosses, "phoenix"],
		never_attack: ["nerfedmummy"],
		use_hunters_mark: true,
		use_supershot: true,
		skill_blacklist: ["dryad", "fireroamer", "plantoid", "mole", "mummy"],
		engage_aggroed_only: true,

		lambda_headroom_low: 0.6,
		lambda_headroom_high: 1.5,

		burn_enabled: true,
		party_dps_factor: 2.0,

		sample_bow_choice: false,
		sample_bow_ms: 10000,
		sample_hits: true,
		sample_targets: true,
		target_weights: { damage: 1, close: 0.05 },
		pouchbow_enabled: true,
		pouchbow_explosion: 51,
		pouchbow_min_neighbours: 3,
	},

	movement: {
		enabled: true,
		reposition: true,
		circle_radius: 75,
		move_threshold: 10,
		follow_distance: 15,
	},

	equipment: {
		boss_hp_thresholds: {
			mrpumpkin: 100000,
			mrgreen: 100000,
			crabxx: 100000,
			grinch: 100000,
			franky: 999999999,
			icegolem: 999999999,
		},
		swap_cooldown: 500,
		boss_set_swap_enabled: true,
		use_licence: false,
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
		loot_cooldown: 3000,
		delay_ms: 180000,
		loot_month: "lootItemsJan"
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
	dead: [

	],

	boom: [
		{ item_name: "pouchbow", slot: "mainhand", level: 10, l: "l" },
		{ item_name: "alloyquiver", slot: "offhand", level: 7, l: "l" },
	],

	burnboom: [
		{ item_name: "firebow", slot: "mainhand", level: 10, l: "l" },
		{ item_name: "alloyquiver", slot: "offhand", level: 5, l: "l" },
	],

	heal: [
		{ item_name: "cupid", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "t2quiver", slot: "offhand", level: 7, l: "l" },
	],

	dps: [
	],

	luck: [
	],

	xp: [
	],

	orb: [
		{ item_name: "orbofdex", slot: "orb", level: 4, l: "l" },
	],

	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
	],

	stealth: [
	],

	cape: [
	],

	mana: [
	],

	stat: [
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
	targets: { sorted_by_value: [], in_range: [], out_of_range: [], cluster_targets: [], cluster_target: null },
	heal_target: null,
});
