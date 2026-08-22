
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIGURATION - Toggle features here instead of editing code
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: eval-loader scoping — Warrior_Skills.js (separate eval closure)
// reads `home` directly, and const/let here wouldn't be visible to Game_Config.js
// either.
var home = WARRIOR_TARGET;

var CONFIG = {
	combat: {
		enabled: true,
		target_priority: ["Myras"],
		all_bosses,
		cleave_min_mobs: 1,
		cleave_blacklist: ["fireroamer", "plantoid"],
		agitate_min_mobs: 2,
		agitate_blacklist: ["plantoid"],
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
		circle_walk: true,
		circle_speed: 1.8,
		circle_radius: 35,
		follow_distance: 30,
	},

	equipment: {
		auto_swap_sets: true,
		boss_luck_switch: true,
		boss_hp_thresholds: {
			mrpumpkin: 200000,
			mrgreen: 200000,
			// Sentinel, not a real HP value — always treated as "low," so gear swaps to
			// luck/single-target immediately on spawn instead of waiting for HP to drop.
			franky: 999999999,
			icegolem: 999999999,
		},
		single_target_maps: ["halloween", "spookyforest", "desertland"],
		aoe_maps: ["cave", "main", "goobrawl", "level2n", "level2w", "mforest", "tunnel", "uhills", "winterland"],
		cleave_maps: ["cave", "desertland", "goobrawl", "halloween", "level2n", "level2w", "main", "mforest", "spookytown", "uhills", "winterland", "level2e"],
		mp_thresholds: { upper: 2350, lower: 2250 },
		chest_threshold: 12,
		swap_cooldown: 500,
		booster_swap_enabled: true,
		cape_swap_enabled: true,
		coat_swap_enabled: true,
		boss_set_swap_enabled: true,
		weapon_swap_enabled: true
	},

	potions: {
		auto_buy: true,
		hp_threshold: 400,
		mp_threshold: 500,
		min_stock: 1000
	},

	party: {
		auto_manage: true,
		group_members: ["Myras", "Ulric", "Riva", "Riff"]
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

// var, not const: Game_Config.js's handle_return_home() reads this global.
var destination = {
	map: locations[home][0].map,
	x: locations[home][0].x,
	y: locations[home][0].y
};

// var, not const: send_to_merchant() (Shared/Game_Config.js) reads this global.
var ITEMS_TO_KEEP = ["hpot1", "mpot1", "luckbooster", "goldbooster", "xpbooster", "pumpkinspice", "xptome", "tracker", "jacko", "orbg", "talkingskull", "computer"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: Warrior_Skills.js (separate eval closure) also reads/writes these.
var state = {
	skin_ready: false,
	last_basher_swap: 0,
	last_cleave_swap: 0,
	angle: 0,
	// Set while status_swap_trick_check() is mid-sequence — resolve_equipment() (Shared/
	// Party_And_Loot.js) checks this and skips its own gear decisions rather than racing
	// the manual slot swap.
	gear_locked: false,
	// Per-group cooldown timestamps for resolve_equipment()'s EQUIPMENT_RULES groups below.
	equip_cooldowns: {},
	last_angle_update: performance.now()
};

var cache = {
	target: null,
	party_members: [],
	tank_entity: null,
	monsters_in_cleave_range: [],
	last_update: 0,

	is_valid() {
		return performance.now() - this.last_update < CACHE_TTL;
	},

	invalidate() {
		this.last_update = 0;
	}
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOCATION & EQUIPMENT DATA
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: shared is_set_equipped()/equip_set() (Game_Config.js) read this at call time.
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
		{ item_name: "cearring", slot: "earring1", level: 5, l: "l" },
		{ item_name: "cearring", slot: "earring2", level: 5, l: "u" },
		{ item_name: "coat", slot: "chest", level: 13, l: "l" },
		{ item_name: "orbofstr", slot: "orb", level: 5, l: "l" },
		{ item_name: "suckerpunch", slot: "ring1", level: 2, l: "l" },
		{ item_name: "suckerpunch", slot: "ring2", level: 2, l: "u" },
		{ item_name: "fireblade", slot: "mainhand", level: 13, l: "s" },
		{ item_name: "candycanesword", slot: "offhand", level: 13, l: "s" },
	],
	luck: [
		{ item_name: "mearring", slot: "earring1", level: 0, l: "l" },
		{ item_name: "mearring", slot: "earring2", level: 0, l: "u" },
		{ item_name: "rabbitsfoot", slot: "orb", level: 2, l: "l" },
		{ item_name: "ringofluck", slot: "ring2", level: 0, l: "u" },
		{ item_name: "ringofluck", slot: "ring1", level: 0, l: "l" },
		{ item_name: "mshield", slot: "offhand", level: 9, l: "l" },
		{ item_name: "tshirt88", slot: "chest", level: 0, l: "l" }
	],
	stealth: [
		{ item_name: "stealthcape", slot: "cape", level: 0, l: "l" },
	],
	cape: [
		{ item_name: "vcape", slot: "cape", level: 6, l: "l" },
	],
	mana: [
		{ item_name: "tshirt9", slot: "chest", level: 6, l: "l" }
	],
	stat: [
		{ item_name: "coat", slot: "chest", level: 13, l: "l" }
	],
	dps_accessories: [
		{ item_name: "cearring", slot: "earring1", level: 5, l: "l" },
		{ item_name: "cearring", slot: "earring2", level: 5, l: "u" },
		{ item_name: "orbofstr", slot: "orb", level: 5, l: "l" },
		{ item_name: "suckerpunch", slot: "ring1", level: 2, l: "l" },
		{ item_name: "suckerpunch", slot: "ring2", level: 2, l: "u" },
	],
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
	],
	orb: [
		{ item_name: "orbg", slot: "orb", level: 2, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	if (!cache.is_valid()) {
		cache.target = find_best_target();
		cache.party_members = get_party_members();
		cache.last_update = performance.now();
	}

	cache.tank_entity = get_entity("Myras")
	cache.monsters_in_cleave_range = find_monsters_in_cleave_range();
}

function find_best_target() {
	const max_dist = WARRIOR_TARGET === "giantspider" ? 50 : character.range;

	// Priority 1: Bosses
	for (const boss_type of CONFIG.combat.all_bosses) {
		const boss = get_nearest_monster_v2({ type: boss_type, max_distance: max_dist });
		if (boss) return boss;
	}

	// Priority 2: Any cursed monster in range (highest HP)
	const cursed = get_nearest_monster_v2({ status_effects: ["cursed"], max_distance: max_dist, check_max_hp: true });
	if (cursed) return cursed;

	// Priority 3: In follow mode prefer closest; otherwise highest HP
	if (WARRIOR_TARGET === "giantspider") {
		return get_nearest_monster_v2({ max_distance: max_dist }) || null;
	}
	return get_nearest_monster_v2({ max_distance: max_dist, check_max_hp: true }) || null;
}

function get_party_members() {
	return Object.keys(get_party() || {});
}

function find_monsters_in_cleave_range() {
	return Object.values(parent.entities).filter(e =>
		e?.type === "monster" &&
		!e.dead &&
		e.visible &&
		distance(character, e) <= G.skills.cleave.range
	);
}

function mob_count() {
	const tank_name = cache.tank_entity?.name;
	if (!tank_name) return 0;

	return Object.values(parent.entities).filter(e =>
		e?.type === "monster" &&
		e.target === tank_name &&
		!e.dead
	).length;
}

// Monsters where briefly slot-swapping to specific weapons (parked in reserved inventory
// slots, see item_order) can proc a status effect. Add more entries here rather than writing
// new near-duplicate check functions — base_set is the weapon set the swap assumes it's
// starting from and returning to.
const STATUS_SWAP_TRICKS = {
	bscorpion: {
		status: "sugarrush",
		base_set: "single",
		swap_slots: [{ num: 39, slot: "mainhand" }, { num: 40, slot: "offhand" }],
		swap_delay_ms: 75,
		settle_delay_ms: 225,
		label: "Sugar Rush",
		color: "#ff69b4",
	},
};

let swap_trick_attempts = 0;
const swap_trick_history = {};

async function status_swap_trick_check(target) {

	attack(target);

	const trick = STATUS_SWAP_TRICKS[target?.mtype];
	if (!trick || character.s[trick.status] !== undefined) return;

	// equip_batch(slots) is a slot-swap, not an item-set — the second identical call only
	// lands back on base_set if those slots held it to begin with. Bail if desynced instead
	// of compounding it; resolve_equipment()'s equip_set(base_set) will correct it before next try.
	if (!is_set_equipped(trick.base_set)) return;

	// Blocks resolve_equipment() (Shared/Party_And_Loot.js) from racing this multi-step swap
	// and yanking gear mid-sequence.
	state.gear_locked = true;
	try {
		swap_trick_attempts++;
		equip_batch(trick.swap_slots);
		await delay(trick.swap_delay_ms);
		equip_batch(trick.swap_slots);
		await delay(trick.settle_delay_ms);

		if (character.s[trick.status] !== undefined) {
			if (!swap_trick_history[target.mtype]) swap_trick_history[target.mtype] = [];
			const history = swap_trick_history[target.mtype];
			history.push(swap_trick_attempts);
			if (history.length > 30) history.shift();
			const avg = history.reduce((a, b) => a + b, 0) / history.length;
			log(`${trick.label} activated! Avg attempts: ${avg.toFixed(1)}`, trick.color, "Alerts");
			swap_trick_attempts = 0;
		}
	} finally {
		state.gear_locked = false;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// FOLLOW HEALER — used when WARRIOR_TARGET === "giantspider". Orbits Myras when
// close; smart_moves to her when far/different map; falls back to
// _healer_last_known when she's off-map and invisible.
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not let: shared follow_healer() (Game_Config.js) reads/writes these globals.
var _healer_last_known = null;
var _last_healer_ping = 0;

// follow_healer() moved to Shared/Game_Config.js; reads this file's
// CONFIG.movement.follow_distance at call time.

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN TICK LOOP
// ---------------------------------------------------------------------------------------------------------------------------------

async function main_loop() {
	try {
		if (is_disabled(character)) {
			return setTimeout(main_loop, 250);
		}

		update_cache();
		panic_check();

		if (should_handle_events()) {
			handle_events();
		}

		else if (CONFIG.movement.enabled) {
			if (home === "bscorpion") {
				handle_bscorpion_farm_approach(); // Shared/Movement.js
			} else if (WARRIOR_TARGET === "giantspider") {
				follow_healer();
			} else if (!get_nearest_monster({ type: home })) {
				handle_return_home();
			} else if (CONFIG.movement.circle_walk) {
				walk_in_circle();
			}
		}

	} catch (e) {
		console.error("main_loop error:", e);
	}

	setTimeout(main_loop, TICK_RATE.main);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Attack only
// ---------------------------------------------------------------------------------------------------------------------------------

async function action_loop() {
	if (should_pause_combat_loop()) return setTimeout(action_loop, 100);
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		// Keep cache fresh even while waiting on cooldowns
		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill("attack");

		if (ms === 0 && smart.moving === false && target) {
			await status_swap_trick_check(target);
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}

	} catch (e) {
		console.error("action_loop error:", e);
		delay = 1;
	}

	setTimeout(action_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAINTENANCE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function maintenance_loop() {
	try {
		if (CONFIG.potions.auto_buy) {
			auto_buy_potions();
		}

		if (CONFIG.party.auto_manage) {
			party_manager();
		}

		clear_inventory();
		inventory_sorter();
		elixir_usage();

		if (character.rip) {
			respawn();
		}

	} catch (e) {
		console.error("maintenance_loop error:", e);
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

// potion_loop → Game_Config.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// (Shared/Party_And_Loot.js). Each group's resolve() reproduces exactly what the old
// per-file equipment_loop() decided; only WHERE the decision runs changed, not WHAT it
// decides, to avoid behavior drift from this unification.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Special weapons: pause every group while wielding them, matching the original loop's
// single shared early-return (not just the loadout group).
function should_pause_equipment_resolve() {
	const mainhand = character.slots?.mainhand?.name;
	return mainhand === "basher" || mainhand === "bataxe";
}

function resolve_warrior_booster() {
	const active_boss = find_active_boss();
	if (active_boss && active_boss.data.hp < CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
		return "luckbooster";
	}
	return "xpbooster";
}

function resolve_warrior_cape() {
	const chest_count = get_num_chests();
	const num_targets = cache.tank_entity ? get_num_targets(cache.tank_entity.name) : 0;
	return (chest_count >= CONFIG.equipment.chest_threshold && num_targets < 6) ? "stealth" : "cape";
}

function resolve_warrior_coat() {
	const active_boss = find_active_boss();
	// Coat only swaps away from a boss fight, or once its HP is above threshold (early phase).
	const boss_blocks_coat = active_boss && active_boss.data.hp <= CONFIG.equipment.boss_hp_thresholds[active_boss.name];
	if (boss_blocks_coat) return null;

	if (character.mp > CONFIG.equipment.mp_thresholds.upper) return "stat";
	if (character.mp < CONFIG.equipment.mp_thresholds.lower) return "mana";
	return null;
}

// Combined weapon+accessories decision — boss-active and home-map branches were mutually
// exclusive in the original, including a boss-active-but-target-null case that intentionally
// applies nothing (e.g. a boss up while already at the home map); kept as one function so
// that case can't accidentally fall through into the home-map logic.
function resolve_warrior_loadout() {
	if (!CONFIG.equipment.boss_set_swap_enabled) return resolve_warrior_home_loadout();

	const active_boss = find_active_boss();
	if (active_boss) {
		const boss_hp = active_boss.data.hp;
		if (boss_hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
			return character.map !== destination.map ? "dps" : null;
		}
		return "luck";
	}

	return resolve_warrior_home_loadout();
}

function resolve_warrior_home_loadout() {
	if (character.map !== destination.map) return null;

	const sets = ["dps_accessories"];
	if (CONFIG.equipment.weapon_swap_enabled) {
		const home_count = WARRIOR_TARGET === "giantspider" ? 1 : mob_count();
		if (home_count === 1) sets.push("single");
		else if (home_count > 1) sets.push("aoe");
		else if (CONFIG.equipment.aoe_maps.includes(character.map)) sets.push("aoe");
		else if (CONFIG.equipment.single_target_maps.includes(character.map)) sets.push("single");
	}
	return sets;
}

// var, not const: resolve_equipment() (Shared/Party_And_Loot.js) reads these globals at
// call time, and const/let here wouldn't cross the indirect-eval boundary into global scope.
var EQUIPMENT_RULES = {
	booster: { kind: "booster", resolve: resolve_warrior_booster },
	cape:    { kind: "set", resolve: resolve_warrior_cape },
	coat:    { kind: "set", resolve: resolve_warrior_coat },
	loadout: { kind: "set", resolve: resolve_warrior_loadout },
};

// Each key short-circuits that one group's resolve() for that farm target.
var MONSTER_GEAR_OVERRIDES = {
	// resolve_warrior_home_loadout() picks "aoe" over "single" whenever mob_count() > 1 --
	// easy to hit on bscorpion's dense spawns before things thin out. bscorpion always wants
	// "single" (two fireblades), since status_swap_trick_check()'s sugar-rush trick requires
	// it as the base_set. Still includes dps_accessories so earrings/rings/orb keep swapping.
	bscorpion: { loadout: ["dps_accessories", "single"] },
};

// find_booster_slot, get_num_chests, get_num_targets → Game_Config.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// should_handle_events, handle_events, handle_specific_event, handle_return_home → Game_Config.js

async function walk_in_circle() {
	if (smart.moving) return;
	if (WARRIOR_TARGET === "bscorpion") return;

	let center;
	if (WARRIOR_TARGET === "giantspider") {
		const healer = get_player("Myras");
		if (!healer || healer.rip || healer.map !== character.map) return;
		center = { x: healer.x, y: healer.y };
	} else {
		center = locations[home][0];
	}
	const radius = CONFIG.movement.circle_radius;

	const current_time = performance.now();
	const delta_time = current_time - state.last_angle_update;
	state.last_angle_update = current_time;

	const delta_angle = CONFIG.movement.circle_speed * (delta_time / 1000);
	state.angle = (state.angle + delta_angle) % (2 * Math.PI);

	const offset_x = Math.cos(state.angle) * radius;
	const offset_y = Math.sin(state.angle) * radius;
	const target_x = center.x + offset_x;
	const target_y = center.y + offset_y;

	if (!character.moving) {
		await xmove(target_x, target_y);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// clear_inventory() moved to Shared/Game_Config.js; reads this file's ITEMS_TO_KEEP.

// var, not const: shared inventory_sorter() (Game_Config.js) reads this at call time.
var item_order = {
	tracktrix: 0,
	computer: 1,
	hpot1: 2,
	mpot1: 3,
	xptome: 4,
	pumpkinspice: 5,
	xpbooster: 6,
	jacko: 7,
	candycanesword: [38, 39], // dual-wielded: two copies get their own reserved slot
	fireblade: 40,
	bataxe: 41,
};

// inventory_sorter() moved to Shared/Game_Config.js; reads this file's item_order
// (supports both a plain slot number and an array of reserved slots for duplicates).

// auto_buy_potions → Game_Config.js

function elixir_usage() {
	const required = "pumpkinspice";
	const current_elixir = character.slots.elixir?.name;

	if (current_elixir !== required) {
		const slot = locate_item(required);
		if (slot !== -1) use(slot);
	}
}

// var, not let: shared panic_check() (Game_Config.js) reads/writes these globals.
var panicking = false;
var last_panic_time = 0;
var last_safe_time = 0;

// No PANIC_BROADCAST_TARGETS here — only Healer broadcasts panic state to the fighters.
var PANIC_THRESHOLDS = {
	low_hp: 0.2, low_mp: 0.01, high_hp: 0.35, high_mp: 0.02,
	aggro: 99, cooldown: 1000,
};

// panic_check() moved to Shared/Game_Config.js; reads this file's PANIC_THRESHOLDS.

// party_maker() — replaced by shared party_manager() from Game_Config.js
// function party_maker() {
// 	if (!CONFIG.party.auto_manage) return;
// 	const group = CONFIG.party.group_members;
// 	const party_lead = get_entity(group[0]);
// 	const current_party = character.party;
// 	const healer = get_entity("CrownPriest");
// 	if (character.name === group[0]) {
// 		for (let i = 1; i < group.length; i++) {
// 			send_party_invite(group[i]);
// 		}
// 	} else {
// 		if (current_party && current_party !== group[0] && healer) {
// 			leave_party();
// 		}
// 		if (!current_party && party_lead) {
// 			send_party_request(group[0]);
// 		}
// 	}
// }

// suicide, sleep, get_nearest_monster_v2, ms_to_next_skill, batch_equip → Game_Config.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

// is_set_equipped()/equip_set() moved to Shared/Game_Config.js; reads this file's
// own `equipment_sets` global at call time.

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKIN CHANGER
// --------------------------------------------------------------------------------------------------------------------------------- //

// const skinConfigs = {
// 	warrior: {
// 		skin: "tf_green",
// 		skinRing: { name: "tristone", level: 1, locked: "l" },
// 		normalRing: { name: "suckerpunch", level: 2, locked: "l" }
// 	},
// };

// function skinNeeded(ringName, ringLevel, slot = "ring1", locked = "l", ccThreshold = 135) {
// 	if (character.cc <= ccThreshold) {
// 		if (character.slots[slot]?.name !== ringName || character.slots[slot]?.level !== ringLevel) {
// 			equipIfNeeded(ringName, slot, ringLevel, locked);
// 		}
// 		parent.socket.emit("activate", { slot });
// 	}
// }

// async function equipIfNeeded(itemName, slotName, level, l) {
// 	let name = null;

// 	if (typeof itemName === "object") {
// 		name = itemName.name;
// 		level = itemName.level;
// 		l = itemName.l;
// 	} else {
// 		name = itemName;
// 	}

// 	if (character.slots[slotName] != null) {
// 		let slotItem = character.slots[slotName];
// 		if (slotItem.name === name && slotItem.level === level && slotItem.l === l) {
// 			return;
// 		}
// 	}

// 	for (let i = 0; i < character.items.length; i++) {
// 		const item = character.items[i];
// 		if (item != null && item.name === name && item.level === level && item.l === l) {
// 			return equip(i, slotName);
// 		}
// 	}
// }

// async function skinChanger() {
// 	const config = skinConfigs[character.ctype];
// 	if (!config) {
// 		console.warn(`No skin config for type: ${character.ctype}`);
// 		state.skinReady = true;
// 		return;
// 	}

// 	if (character.skin !== config.skin) {
// 		console.log(`Applying skinRing: ${config.skinRing.name} lvl ${config.skinRing.level}`);
// 		skinNeeded(config.skinRing.name, config.skinRing.level, "ring1", config.skinRing.locked);
// 		await delay(500);
// 		return skinChanger();
// 	}

// 	const slot = character.slots.ring1;
// 	if (slot?.name !== config.normalRing.name || slot?.level !== config.normalRing.level) {
// 		console.log(`Equipping normalRing: ${config.normalRing.name} lvl ${config.normalRing.level}`);
// 		equipIfNeeded(config.normalRing.name, "ring1", config.normalRing.level, config.normalRing.locked);
// 		await delay(500);
// 		return skinChanger();
// 	}

// 	state.skinReady = true;
// 	console.log(`Skin ready! ${character.ctype} has skin ${character.skin} and ring ${slot.name}`);
// }

// skinChanger();

// --------------------------------------------------------------------------------------------------------------------------------- //
// EVENT HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------- //

// panic/my_location/suppress_reset/enter_instance CM listener -> Shared/Messaging.js's
// CM_HANDLERS.

// on_party_request/on_party_invite -> Shared/Party_And_Loot.js

game.on("death", data => {
	const mob = parent.entities[data.id];
	if (!mob || !mob.cooperative) return;

	const mob_name = mob.mtype;
	const mob_target = mob.target;
	const party_members = Object.keys(get_party() || {});

	if (mob_target === character.name || party_members.includes(mob_target)) {
		const msg = `${mob_name} died with ${character.luckm} luck`;
		game_log(msg, "#96a4ff");
		console.log(msg);
	}
});

// send_updates() -> Shared/Messaging.js
setInterval(send_updates, 20000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
// skill_loop() is NOT started here: it's defined in Warrior_Skills.js, a separate
// eval closure loading after this file finishes evaluating — calling it here would
// throw ReferenceError. Warrior_Skills.js starts it itself.
equipment_manager_loop();
maintenance_loop();
potion_loop();
if (WARRIOR_TARGET === "bscorpion") prim_farm_loop();
setInterval(remote_sell_items, 5000);

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // CUSTOM FUNCTION TO AGGRO MOBS IF MYRAS HAS ENOUGH MP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let last_aggro_time = 0;
// let last_bigbird_seen = 0;

// async function aggro_mobs() {
//     if (!BOSS_LOOP_ENABLED && !smart.moving && ORBIT_LOOP_ENABLED) {
//         const now = Date.now();

//         // Check for bigbird within 50 units
//         const bigbird = Object.values(parent.entities).find(e =>
//             e.type === "monster" &&
//             e.mtype === "bigbird" &&
//             parent.distance(character, e) <= 50
//         );

//         // Track last time bigbird was seen
//         if (bigbird) {
//             last_bigbird_seen = now;
//         }

//         // Check if Myras has more than 75% mp
//         const myras_info = get("Myras_newparty_info");
//         const myras_has_mp = myras_info && myras_info.mp > 0.8 * myras_info.max_mp;

//         // Only aggro if no bigbird nearby, Myras has enough mp, and at least 10s since last bigbird seen
//         if (
//             !bigbird &&
//             myras_has_mp &&
//             (now - last_bigbird_seen > 10000) &&
//             (now - last_aggro_time > 30000)
//         ) {
//             last_aggro_time = now;
//             await smarter_move({ x: 1280, y: 69 });
//             await use_skill("agitate");
//             await delay(2000);
//             await smarter_move(WARRIOR_TARGET);
//         }
//     }
// }

// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION KILL LOGGER LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_bscorpion_ids = new Set();

async function bscorpion_kill_logger_loop() {
	while (true) {
		try {
			// Get all bscorpion entities
			const bscorps = Object.values(parent.entities).filter(e => e.type === "monster" && e.mtype === "bscorpion");
			const alive_ids = new Set(bscorps.filter(e => !e.dead).map(e => e.id));
			const dead_now = [...last_bscorpion_ids].filter(id => !alive_ids.has(id));
			if (dead_now.length > 0) {
				log_bscorpion_kill();
			}
			last_bscorpion_ids = alive_ids;
		} catch (e) {
			catcher(e, "bscorpion_kill_logger_loop");
		}
		await delay(250);
	}
}

bscorpion_kill_logger_loop()

// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION KILL TIMER LOGGER
// --------------------------------------------------------------------------------------------------------------------------------- //


let bscorpion_kill_count = 0;
let bscorpion_kill_times = [];

function log_bscorpion_kill() {
	const now = Date.now();
	bscorpion_kill_count++;
	bscorpion_kill_times.push(now);
	if (bscorpion_kill_times.length > 50) bscorpion_kill_times.shift();

	if (bscorpion_kill_times.length > 1) {
		// Calculate rolling average
		let total = 0;
		for (let i = 1; i < bscorpion_kill_times.length; i++) {
			total += bscorpion_kill_times[i] - bscorpion_kill_times[i - 1];
		}
		const avg = total / (bscorpion_kill_times.length - 1);
		log(`Seconds / Kill (Avg): ${(avg/1000).toFixed(1)}s`, "#ffb347", "Bscorpion");
	} else {
		log(`Bscorpion kill #${bscorpion_kill_count}: ${new Date(now).toLocaleTimeString()} (first recorded)`, "#ffb347", "Bscorpion");
	}
}

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // DUNGEON LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// // DUNGEON_LOOP_ENABLED = true;

// async function dungeon_loop() {

//     while (true) {

//         if (!DUNGEON_LOOP_ENABLED) {
//             await delay(1000);
//             continue;
//         }

//         // Set orbit_origin to Myras' location (map, x, y)
//         const myras = parent.entities["Myras"];
//         if (myras) {
//             orbit_origin = { map: myras.map, x: myras.x, y: myras.y };
//         } else {
//             orbit_origin = null;
//         }

//         await delay(200);

//     }

// }

// async function dungeon_orbit_loop() {

//     const delayMs = 50;
//     let orbit_path_index = 0;

//     while (true) {
//         // Wait until orbit loop is enabled
//         if (!DUNGEON_LOOP_ENABLED) {
//             await delay(100);
//             continue;
//         }

//         // Always update orbit origin to Myras' current position
//         const myras = parent.entities["Myras"];
//         if (!myras) {
//             game_log("⚠️ Myras not found for orbiting.", "#FF0000");
//             await delay(500);
//             continue;
//         }
//         orbit_origin = { map: myras.map, x: myras.x, y: myras.y };

//         // Recompute orbit path every step to follow Myras
//         set_orbit_radius(ORBIT_RADIUS);
//         const orbit_path_points = compute_orbit_path(orbit_origin, ORBIT_RADIUS, ORBIT_STEPS);
//         // Pick the closest point on the orbit to start
//         let minDist = Infinity, minIdx = 0;
//         for (let i = 0; i < orbit_path_points.length; i++) {
//             const pt = orbit_path_points[i];
//             const d = Math.hypot(character.real_x - pt.x, character.real_y - pt.y);
//             if (d < minDist) {
//                 minDist = d;
//                 minIdx = i;
//             }
//         }
//         orbit_path_index = minIdx;

//         while (DUNGEON_LOOP_ENABLED) {
//             // Update Myras' position and orbit path every step
//             const myras = parent.entities["Myras"];
//             if (!myras) {
//                 game_log("⚠️ Myras not found for orbiting.", "#FF0000");
//                 await delay(500);
//                 break;
//             }
//             orbit_origin = { map: myras.map, x: myras.x, y: myras.y };
//             set_orbit_radius(ORBIT_RADIUS);
//             const orbit_path_points = compute_orbit_path(orbit_origin, ORBIT_RADIUS, ORBIT_STEPS);

//             // Pick the next point in the orbit
//             orbit_path_index = (orbit_path_index + 1) % orbit_path_points.length;
//             const point = orbit_path_points[orbit_path_index];

//             // Only move if not already close to the next point
//             const dist = Math.hypot(character.real_x - point.x, character.real_y - point.y);
//             if (!character.moving && !smart.moving && dist > MOVE_TOLERANCE) {
//                 try {
//                     await move(point.x, point.y);
//                 } catch (e) {
//                     console.error("Orbit move error:", e);
//                 }
//             }

//             // Wait until movement is finished or interrupted
//             while (DUNGEON_LOOP_ENABLED && (character.moving || smart.moving)) {
//                 await new Promise(resolve => setTimeout(resolve, MOVE_CHECK_INTERVAL));
//             }

//             await delay(delayMs);
//         }
//     }

// }