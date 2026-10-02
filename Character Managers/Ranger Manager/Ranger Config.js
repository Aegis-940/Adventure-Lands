// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER CONFIG — tunables, gear sets, panic thresholds, and the mutable state the other Ranger files share
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = farm_target_for(character.name);

var CONFIG = {
	combat: {
		target_priority: ["Ulric", "Myras"],
		party_dps_factor: 2.0,

		always_attack: [...ALL_BOSSES, "phoenix", "bscorpion"],
		attack_if_targeted: ["crabx"],
		never_attack: ["nerfedmummy"],
		engage_aggroed_only: true,
		skill_blacklist: ["dryad", "fireroamer", "plantoid", "mole", "mummy"],
		use_hunters_mark: true,
		use_supershot: true,
		mark_min_hp_pct: 0.03,
		supershot_min_hp_pct: 0.85,
		burn_enabled: true,
		lambda_headroom_low: 0.6,
		lambda_headroom_high: 1.5,
		cupid_engage_pct: 0.66,
		cupid_engage_pct_no_healer: 0.9,
		cupid_healer_mp_pct: 0.5,
		cupid_release_margin: 0.14,
		mana_is_free: true,

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
		...EQUIPMENT_DEFAULTS,
		use_licence: false,

		weapon_sets: ["single", "boom"],
		weapon_hysteresis_ms: 0,
		weapon_switch_margin: 1.0,
		weapon_min_swap_attacks: 1,

		chest_swap_enabled: true,
		chest_sets: { dps: "dps_chest", mana: "mana_chest" },
		chest_release_pct: 0.90,
		chest_mana_max_engage_pct: 0.75,
		chest_refill_shots: 3,
	},

	looting: { ...LOOTING_DEFAULTS },

	potions: { ...POTION_DEFAULTS, mp_threshold: 300 },

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
	aggro: 1,
	aggro_by_home: { bscorpion: 99 },
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
	dps_chest: [
		{ item_name: "coat", slot: "chest", level: 9, l: "l" },
	],
	mana_chest: [
		{ item_name: "tshirt9", slot: "chest", level: 5, l: "l" },
	],
	panic: PANIC_ORB_SET,
	orb: [
		{ item_name: "orbofdex", slot: "orb", level: 4, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

var state = {
	last_reposition: 0,
};

var cache = make_cache({
	targets: { sorted_by_value: [], in_range: [] },
	heal_target: null,
});
