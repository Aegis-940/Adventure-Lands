// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Healer files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = HEALER_TARGET;

var CONFIG = {
	combat: {
		enabled: true,
		zapper_enabled: false,
		zapper_mobs: [home, ...all_bosses, "sparkbot"],
		target_priority: ["Ulric", "Myras"],
		all_bosses,
		aggro: true,
		aggro_cap: 5,
		sample_hits: false,
		sample_cluster: true,
		curse_min_hp_pct: 0.25,
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 1.8,
		circle_experiment: false,
		circle_experiment_radii: [30, 20, 12],
		circle_experiment_rate: 3.0,
		circle_experiment_ms: 120000,
		circle_radius: 10,
		centre_on_monsters: false,
		centre_max_drift: 60,
		centre_experiment: false,
		centre_experiment_ms: 120000,
	},

	healing: {
		party_heal_threshold: 0.40,
		party_heal_min_mp: 500,
		party_heal_margin: 1.0,
		party_heal_critical_pct: 0.35,
		party_heal_critical_count: 2,
		party_heal_self_pct: 0.50,
		absorb_enabled: true,
		dark_blessing_enabled: true,
		skill_min_mp_pct: 0.40
	},

	looting: {
		enabled: true,
		chest_threshold: 3,
		target_count: 99,
		equip_gold_gear: true,
		loot_cooldown: 3000
	},

	equipment: {
		auto_swap_sets: true,
		temporal_surge_enabled: false,
		boss_hp_thresholds: {
			mrpumpkin: 300000,
			mrgreen: 300000,
			bscorpion: 75000,
			pinkgoblin: 75000,
			franky: 999999999,
			icegolem: 999999999,
		}
	},

	potions: {
		auto_buy: true,
		hp_threshold: 400,
		mp_threshold: 500,
		min_stock: 1000,
		prefer_mp: true
	},

	elixir: { name: "elixirluck", min_stock: 2 },

	party: {
		auto_manage: true,
		group_members: ["Myras", "Ulric", "Riva", "Riff"]
	},
};

var destination = home_destination(home);

var ITEMS_TO_KEEP = [...ITEMS_TO_KEEP_BASE, "orbg", "mshield", "lmace", "elixirluck", "orboftemporal", "orboffire"];

var item_order = { ...ITEM_ORDER_BASE };

var PANIC_THRESHOLDS = {
	low_hp: 0.40, low_mp: 0.05, high_hp: 0.60, high_mp: 0.50,
	aggro: 99, cooldown: 1000,
};

var PANIC_BROADCAST_TARGETS = ["Ulric", "Riva"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

var equipment_sets = {
	zap_on: [
		{ item_name: "zapper", slot: "ring2", level: 2, l: "u" }
	],
	zap_off: [
		{ item_name: "ringofluck", slot: "ring2", level: 2, l: "l" }
	],
	luck: [
		{ item_name: "supermittens", slot: "gloves", level: 7, l: "l" },
		{ item_name: "lmace", slot: "mainhand", level: 8, l: "" },
		{ item_name: "mshield", slot: "offhand", level: 8, l: "l" },

	],
	gold: [
		{ item_name: "handofmidas", slot: "gloves", level: 4, l: "l" },
	],
	gloves: [
		{ item_name: "supermittens", slot: "gloves", level: 7, l: "l" },
	],
	single_target: [
		{ item_name: "firestaff", slot: "mainhand", level: 8, l: "l" },
	],
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
	],
	orb_luck: [
		{ item_name: "rabbitsfoot", slot: "orb", level: 1, l: "l" },
	],
	orb_fire: [
		{ item_name: "orboffire", slot: "orb", level: 3, l: "l" },
	],
	orb: [
		{ item_name: "talkingskull", slot: "orb", level: 3, l: "l" },
	],
	mdef: [
		{ item_name: "wbookhs", slot: "offhand", level: 2, l: "l" },
	],
	temporal: [
		{ item_name: "orboftemporal", slot: "orb", level: 1, l: "l" },
	],
	fireres: [
		{ item_name: "wbookhs", slot: "offhand", level: 2, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

var state = {
	last_equip_time: 0,
	last_temporal_surge: 0,
	angle: 0,
	equip_cooldowns: {},
	last_angle_update: performance.now()
};

var cache = make_cache({
	target: null,
	heal_target: null,
	party_members: [],
});
