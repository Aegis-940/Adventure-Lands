// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Healer files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = null;

var CONFIG = {
	combat: {
		all_bosses: ALL_BOSSES,
		target_priority: ["Ulric", "Myras"],
		target_weights: { damage: 1, close: 0.05 },
		protect_weights: { hp_low: 1, damage: 0.3, close: 0.05 },
		party_dps_factor: 2.0,

		aggro: true,
		aggro_cap: 5,
		curse_min_hp_pct: 0.03,
		zapper_min_mp_pct: 0.60,

		sample_targets: true,
	},

	movement: {
		circle_walk: true,
		circle_speed: 1.8,
		circle_radius: 30,
		follow_distance: 15,
	},

	healing: {
		party_heal_threshold: 0.40,
		party_heal_min_mp_pct: 0.25,
		party_heal_margin: 1.0,
		party_heal_critical_pct: 0.35,
		party_heal_critical_count: 2,
		party_heal_self_pct: 0.50,
		skill_min_mp_pct: 0.40,
		help_deficit: 500,
	},

	equipment: {
		...EQUIPMENT_DEFAULTS,
		luck_lead_ms: 600,
		luck_burst_hp: 15000,

		weapon_sets: ["luck"],
	},

	looting: { ...LOOTING_DEFAULTS, enabled: true, equip_gold_gear: true },

	potions: { ...POTION_DEFAULTS, prefer_mp: true, hp_threshold: Infinity },

	elixir: { name: "elixirluck", min_stock: 2 },

	party: {
		auto_manage: true,
	},
};

var destination = null;

var ITEMS_TO_KEEP = [...ITEMS_TO_KEEP_BASE, "mshield", "lmace", "elixirluck", "orboftemporal", "orboffire", "xgloves"];

var item_order = { ...ITEM_ORDER_BASE };

var PANIC_THRESHOLDS = {
	low_hp: 0.40, low_mp: 0.05, high_hp: 0.60, high_mp: 0.50,
	aggro: 99,
};

var PANIC_BROADCAST_TARGETS = ["Ulric", "Riva"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

var equipment_sets = {
	zap_on: [
		{ item_name: "zapper", slot: "ring2", level: 0, l: "u" }
	],
	luck: [
		{ item_name: "lmace", slot: "mainhand", level: 8, l: "" },
		{ item_name: "mshield", slot: "offhand", level: 8, l: "l" },
	],
	luck_lantern: [
		{ item_name: "lmace", slot: "mainhand", level: 8, l: "" },
		{ item_name: "lantern", slot: "offhand", level: 3, l: "l" },
	],
	uhills_orb: [
		{ item_name: "stillwaterlens", slot: "orb", level: 1, l: "l" },
	],
	uhills_chest: [
		{ item_name: "xarmor", slot: "chest", level: 5, l: "l" },
	],
	uhills_amulet: [
		{ item_name: "spookyamulet", slot: "amulet", level: 2, l: "l" },
	],
	gold: [
		{ item_name: "handofmidas", slot: "gloves", level: 4, l: "l" },
	],
	gloves: [
		{ item_name: "supermittens", slot: "gloves", level: 7, l: "l" },
	],
	single_target: [
		{ item_name: "firestaff", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "mshield", slot: "offhand", level: 8, l: "l" },
	],
	camp_fight: [
		{ item_name: "firestaff", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "exoarm", slot: "offhand", level: 1, l: "l" },
		{ item_name: "cave_loaded_die", slot: "orb", level: 1, l: "l" },
		{ item_name: "zapper", slot: "ring2", level: 0, l: "u" },
		{ item_name: "coat", slot: "chest", level: 10, l: "l" },
		{ item_name: "cearring", slot: "earring1", level: 3, l: "" },
		{ item_name: "cearring", slot: "earring2", level: 3, l: "" },
		{ item_name: "intamulet", slot: "amulet", level: 4, l: "" },
	],
	camp_luck: [
		{ item_name: "lmace", slot: "mainhand", level: 8, l: "" },
		{ item_name: "mshield", slot: "offhand", level: 8, l: "l" },
		{ item_name: "rabbitsfoot", slot: "orb", level: 1, l: "l" },
		{ item_name: "ringofluck", slot: "ring2", level: 2, l: "l" },
		{ item_name: "cdragon", slot: "chest", level: 0, l: "l" },
		{ item_name: "spookyamulet", slot: "amulet", level: 2, l: "l" },
		{ item_name: "cloverstud", slot: "earring1", level: 1, l: "" },
		{ item_name: "cloverstud", slot: "earring2", level: 1, l: "" },
	],
	panic: PANIC_ORB_SET,
	orb_luck: [
		{ item_name: "rabbitsfoot", slot: "orb", level: 1, l: "l" },
	],
	orb_fire: [
		{ item_name: "orboffire", slot: "orb", level: 3, l: "l" },
	],
	orb_exp: [
		{ item_name: "talkingskull", slot: "orb", level: 3, l: "l" },
	],
	orb_dps: [
		{ item_name: "cave_loaded_die", slot: "orb", level: 1, l: "l" },
	],
	dps_chest: [
		{ item_name: "coat", slot: "chest", level: 10, l: "l" },
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
	angle: 0,
	last_angle_update: performance.now()
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Healer Config", () => {
	home = farm_target_for(character.name);
	destination = home_destination(home);
	cache = make_cache({
		target: null,
		heal_target: null,
		party_members: [],
	});
});
