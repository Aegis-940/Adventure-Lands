
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: Healer_Skills.js (separate eval closure) also reads this global.
var home = HEALER_TARGET;

// var, not const: eval-loader scoping — const/let here wouldn't be visible to
// Game_Config.js's shared CONFIG-reading functions.
var CONFIG = {
	combat: {
		enabled: true,
		zapper_enabled: false,
		zapper_mobs: [home, ...all_bosses, "sparkbot"],
		target_priority: ["Ulric", "Myras"],
		all_bosses,
		aggro: true,
		aggro_cap: 5,
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 1.8,
		circle_radius: 30,
		avoid_mobs: true
	},

	healing: {
		party_heal_threshold: 0.40,
		party_heal_min_mp: 500,
		absorb_enabled: true,
		dark_blessing_enabled: true
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
		boss_luck_switch: true,
		boss_hp_thresholds: {
			mrpumpkin: 300000,
			mrgreen: 300000,
			bscorpion: 75000,
			pinkgoblin: 75000,
			// Sentinel, not a real HP value — always treated as "low," so gear swaps to
			// luck immediately on spawn instead of waiting for HP to drop.
			franky: 999999999,
			icegolem: 999999999,
		}
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
};

// var, not const: Game_Config.js's handle_return_home() reads this global.
var destination = {
	map: locations[home][0].map,
	x: locations[home][0].x,
	y: locations[home][0].y
};

// var, not const: send_to_merchant() (Shared/Game_Config.js) reads this global.
var ITEMS_TO_KEEP = ["hpot1", "mpot1", "luckbooster", "goldbooster", "xpbooster", "pumpkinspice", "xptome", "tracker", "jacko", "orbg", "talkingskull", "mshield", "lmace", "elixirluck", "computer", "orboftemporal", "orboffire"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: Healer_Skills.js (separate eval closure) also reads/writes these.
var state = {
	current: "idle", // idle, looting, moving
	skin_ready: false,
	last_equip_time: 0,
	last_loot_time: 0,
	last_gold_swap: 0,
	last_temporal_surge: 0,
	angle: 0,
	// Set while a manual swap sequence (gold-gear looting swap, temporal surge) is mid-flight —
	// resolve_equipment() (Shared/Party_And_Loot.js) checks this and skips its own gear
	// decisions to avoid racing it.
	gear_locked: false,
	// Per-group cooldown timestamps for resolve_equipment()'s EQUIPMENT_RULES groups.
	equip_cooldowns: {},
	last_angle_update: performance.now()
};

var cache = {
	target: null,
	heal_target: null,
	zap_targets: [],
	party_members: [],
	nearest_boss: null,
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
		{ item_name: "rabbitsfoot", slot: "orb", level: 1, l: "l" },

	],
	gold: [
		{ item_name: "handofmidas", slot: "gloves", level: 4, l: "l" },
	],
	single_target: [
		{ item_name: "firestaff", slot: "mainhand", level: 8, l: "l" },
	],
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
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
		{ item_name: "orboffire", slot: "orb", level: 3, l: "l" },
		{ item_name: "wbookhs", slot: "offhand", level: 2, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	if (!cache.is_valid()) {
		cache.target = find_best_target();
		cache.zap_targets = find_zap_targets();
		cache.nearest_boss = find_nearest_boss();
		cache.party_members = get_party_members();
		cache.last_update = performance.now();
	}

	cache.heal_target = find_heal_target();
}

function find_best_target() {
	const max_dist = HEALER_TARGET === "giantspider" ? 50 : character.range;

	// Priority 1: Bosses
	for (const boss_type of CONFIG.combat.all_bosses) {
		const boss = get_nearest_monster_v2({ type: boss_type, max_distance: max_dist });
		if (boss) return boss;
	}

	// Follow mode: only attack monsters already targeting the healer, never seek new aggro
	if (HEALER_TARGET === "giantspider") {
		return get_nearest_monster_v2({ target: character.name, max_distance: max_dist }) || null;
	}

	// Priority 2: Aggro untargeted monsters up to effective_aggro_cap (scaled by mana %)
	if (CONFIG.combat.aggro && count_my_aggro() < effective_aggro_cap()) {
		const untargeted = get_nearest_monster_v2({
			no_target: true,
			max_distance: character.range
		});
		if (untargeted) return untargeted;
	}

	// Priority 3: Named targets
	for (const name of CONFIG.combat.target_priority) {
		const target = get_nearest_monster_v2({
			target: name,
			check_min_hp: true,
			max_distance: character.range
		});
		if (target) return target;
	}

	// Priority 4: Highest HP monster in range (catches bosses not targeting party)
	const highest_hp = get_nearest_monster_v2({
		max_distance: character.range,
		check_max_hp: true
	});
	if (highest_hp) return highest_hp;

	return null;
}

function count_my_aggro() {
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && !e.dead && e.target === character.name) count++;
	}
	return count;
}

function effective_aggro_cap() {
	const mp_pct = character.max_mp > 0 ? character.mp / character.max_mp : 0;
	// Scale linearly between 20% (→0) and 80% (→full cap), clamp outside
	const scaled = Math.max(0, Math.min(1, (mp_pct - 0.2) / 0.6));
	return Math.floor(CONFIG.combat.aggro_cap * scaled);
}

function find_heal_target() {
	const party_names = Object.keys(get_party() || {});
	let lowest = character;
	let lowest_pct = character.hp / character.max_hp;

	for (const name of party_names) {
		const ally = get_player(name);
		if (!ally || ally.rip) continue;

		const pct = ally.hp / ally.max_hp;
		if (pct < lowest_pct) {
			lowest_pct = pct;
			lowest = ally;
		}
	}

	return lowest;
}

function find_zap_targets() {
	if (!CONFIG.combat.zapper_enabled) return [];

	return Object.values(parent.entities).filter(e =>
		e &&
		e.type === "monster" &&
		!e.target &&
		CONFIG.combat.zapper_mobs.includes(e.mtype) &&
		is_in_range(e, "zapperzap") &&
		e.visible &&
		!e.dead
	);
}

function get_party_members() {
	return Object.keys(get_party() || {});
}

function find_nearest_boss() {
	for (const boss_type of CONFIG.combat.all_bosses) {
		const boss = get_nearest_monster_v2({ type: boss_type });
		if (boss) return { mob: boss, type: boss_type };
	}
	return null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN TICK LOOP - Handles state updates, caching, movement
// --------------------------------------------------------------------------------------------------------------------------------- //

async function main_loop() {
	try {
		if (is_disabled(character)) {
			return setTimeout(main_loop, 250);
		}

		update_cache();
		if (HEALER_TARGET !== "fireroamer" && HEALER_TARGET !== "giantspider") panic_check();

		if (should_handle_events()) {
			handle_events();
		}
		else if (should_loot()) {
			await handle_looting();
		}
		else if (CONFIG.movement.enabled) {
			if (home === "bscorpion") {
				handle_bscorpion_farm_approach(); // Shared/Movement.js
			} else if (HEALER_TARGET === "giantspider") {
				// No movement — remain stationary and let the user guide manually
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
// TEMPORAL SURGE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function check_temporal_surge() {
	if (!CONFIG.equipment.temporal_surge_enabled) return false;

	const now = Date.now();
	if (now - state.last_temporal_surge < 60000) return false;

	// Check for any nearby monsters
	// const nearby = Object.values(parent.entities).some(
	// 	e => e.type === "monster" && !e.dead
	// );
	// if (nearby) return false;

	const prev_orb = character.slots.orb ? { name: character.slots.orb.name, level: character.slots.orb.level } : null;

	// Blocks resolve_equipment() (Shared/Party_And_Loot.js) from racing this multi-step swap.
	state.gear_locked = true;
	try {
		state.last_equip_time = performance.now();
		await equip_set("temporal");
		await use_skill("temporalsurge");
		log("Temporal Surge activated!", "#FFAA00");
		state.last_temporal_surge = Date.now();
		state.last_equip_time = performance.now();

		// Swap back to whatever set resolve_equipment() would choose
		if (prev_orb) {
			const inv_idx = character.items.findIndex(
				i => i && i.name === prev_orb.name && i.level === prev_orb.level
			);
			if (inv_idx !== -1) await equip(inv_idx, "orb");
		}
	} finally {
		state.gear_locked = false;
	}

	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Combat and healing only
// --------------------------------------------------------------------------------------------------------------------------------- //

// Lives here, not Healer_Skills.js: action_loop() calls it and starts running before
// Healer_Skills.js (separate eval closure) has loaded.
async function try_heal() {
	const HEAL_TARGET = cache.heal_target;
	if (!HEAL_TARGET) return false;

	const HEAL_THRESHOLD = HEAL_TARGET.max_hp - character.heal / 1.33;

	if (HEAL_TARGET.hp < HEAL_THRESHOLD && is_in_range(HEAL_TARGET, "heal")) {
		// log(`Healing → ${HEAL_TARGET.name} (${Math.round((HEAL_TARGET.hp / HEAL_TARGET.max_hp) * 100)}%)`, "#33AAFF");
		await heal(HEAL_TARGET);
		return true;
	}

	return false;
}

async function action_loop() {
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();

		if (await check_temporal_surge()) return setTimeout(action_loop, 100);

		const ms = ms_to_next_skill("attack");

		if (ms === 0) {
			const HEALED = await try_heal();
			
			if (panicking) return setTimeout(action_loop, 100);

			if (!HEALED && HEALER_TARGET !== "giantspider") {
				const TARGET = cache.target;
				if (TARGET && is_in_range(TARGET) && smart.moving === false) {
					await attack(TARGET);
				}
			}
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}

	} catch (e) {
		catcher(e, "action_loop");
		delay = 1;
	}

	setTimeout(action_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAINTENANCE LOOP - Inventory, potions, party management
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

		if (character.rip/* && locate_item("xptome") !== -1*/) {
			respawn();
		}

	} catch (e) {
		console.error("maintenance_loop error:", e);
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

// potion_loop → Game_Config.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// should_handle_events, handle_events, handle_specific_event, handle_return_home → Game_Config.js

async function walk_in_circle() {
	if (smart.moving) return;
	if (HEALER_TARGET === "bscorpion") return;

	const center = HEALER_TARGET === "giantspider"
		? { x: character.x, y: character.y }
		: locations[home][0];
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
// LOOTING
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_loot() {
	if (!CONFIG.looting.enabled /*|| !state.skinReady*/ || character.cc > COOLDOWNS.cc) return false;

	const now = performance.now();
	const stored_chest_count = Object.keys(get_chests()).length;
	const penalty = character.s?.penalty_cd?.ms || 0;
	const cooldown_pass = now - state.last_loot_time > CONFIG.looting.loot_cooldown;

	return (
		stored_chest_count >= CONFIG.looting.chest_threshold &&
		character.targets < CONFIG.looting.target_count &&
		cooldown_pass &&
		penalty === 0 &&
		state.current !== "looting"
	);
}

async function handle_looting() {
	state.last_loot_time = performance.now();
	state.current = "looting";
	// Blocks resolve_equipment() (Shared/Party_And_Loot.js) from racing the gold-gear swap
	// below with its own loadout decision.
	state.gear_locked = true;

	try {
		if (CONFIG.looting.equip_gold_gear && !is_set_equipped("gold") && performance.now() - state.last_gold_swap > 1000) {
			await equip_set("gold");
			state.last_gold_swap = performance.now();
			swap_booster("luckbooster", "goldbooster");
			await delay(200);
		}

		let looted = 0;
		const max_loots = CONFIG.looting.chest_threshold * 5;

		const stored_chests = get_chests();
		for (const chest_id in stored_chests) {
			if (looted >= max_loots) break;
			parent.open_chest(chest_id);
			looted++;
		}

		await delay(150);

		if (CONFIG.looting.equip_gold_gear) {
			await equip_set("luck");
			await swap_booster("goldbooster", "luckbooster");
			await delay(200);
		}
	} catch (e) {
		console.error("Looting error:", e);
	} finally {
		state.current = "idle";
		state.gear_locked = false;
	}
}

const CHEST_STORAGE_KEY = "loot_chest_ids";
function load_chest_map() {
	const data = get(CHEST_STORAGE_KEY);
	return typeof data === "object" && data !== null ? data : {};
}

function remove_chest_id(id) {
	const stored = load_chest_map();
	if (stored[id]) {
		delete stored[id];
		save_chest_map(stored);
	}
}

function save_chest_map(map) {
	set(CHEST_STORAGE_KEY, map);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// (Shared/Party_And_Loot.js). Not run while looting: handle_looting() sets state.gear_locked.
// --------------------------------------------------------------------------------------------------------------------------------- //

function resolve_healer_loadout() {
	return "luck";
}

// var, not const: resolve_equipment() (Shared/Party_And_Loot.js) reads these globals at
// call time, and const/let here wouldn't cross the indirect-eval boundary into global scope.
var EQUIPMENT_RULES = {
	loadout: { kind: "set", resolve: resolve_healer_loadout },
};

// dryad/fireroamer used to be a one-off HEALER_TARGET check inside handle_equipment_swap();
// generalized here so any farm target can override any group.
var MONSTER_GEAR_OVERRIDES = {
	dryad:      { loadout: "mdef" },
	fireroamer: { loadout: "fireres" },
};

// is_set_equipped()/equip_set() moved to Shared/Game_Config.js; reads this file's
// own `equipment_sets` global at call time.

// --------------------------------------------------------------------------------------------------------------------------------- //
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not let: shared panic_check() (Game_Config.js) reads/writes these globals.
var panicking = false;
var last_panic_time = 0;
var last_safe_time = 0;

// Healer is the only one who broadcasts panic state to the fighters.
var PANIC_THRESHOLDS = {
	low_hp: 0.30, low_mp: 0.05, high_hp: 0.60, high_mp: 0.50,
	aggro: 99, cooldown: 1000,
};
var PANIC_BROADCAST_TARGETS = ["Ulric", "Riva"];

// panic_check() moved to Shared/Game_Config.js; reads this file's PANIC_THRESHOLDS.

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
	jacko: 7
};

// inventory_sorter() moved to Shared/Game_Config.js; reads this file's item_order.

// auto_buy_potions → Game_Config.js

function elixir_usage() {
	const required = "elixirluck";
	const current_elixir = character.slots.elixir?.name;
	const current_qty = quantity(required);

	if (current_elixir !== required) {
		const slot = locate_item(required);
		if (slot !== -1) use(slot);
	}

	if (current_qty < 2) {
		buy(required, 2 - current_qty);
	}
}

async function swap_booster(current, target) {
	const slot = locate_item(current);
	if (slot !== -1) shift(slot, target);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKIN CHANGER
// --------------------------------------------------------------------------------------------------------------------------------- //

// const skinConfigs = {
// 	priest: {
// 		skin: "tm_white",
// 		skinRing: { name: "tristone", level: 0, locked: "l" },
// 		normalRing: { name: "ringofluck", level: 2, locked: "u" }
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
// 		state.skinReady = true; // Allow code to continue even if no config
// 		return;
// 	}

// 	// 1. Ensure correct skin
// 	if (character.skin !== config.skin) {
// 		console.log(`Applying skinRing: ${config.skinRing.name} lvl ${config.skinRing.level}`);
// 		skinNeeded(config.skinRing.name, config.skinRing.level, "ring1", config.skinRing.locked);
// 		await delay(500);
// 		return skinChanger();
// 	}

// 	// 2. Ensure correct normal ring
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

// function on_cm(name, data) {
// 	if (name == "CrownsAnal") {
// 		if (data.message == "location") {
// 			respawn();
// 			smart_move({ x: data.x, y: data.y, map: data.map });
// 			game_log("Repsawning & Moving");
// 		}
// 	}
// 	if (name == "Riff") {
// 		if (data.message == "Heal Merch") {
// 			use_skill("partyheal");
// 			game_log("Party Healing Riff");
// 		}
// 	}
// }

// on_party_request/on_party_invite -> Shared/Party_And_Loot.js (was duplicated identically
// across Warrior/Healer/Ranger)

// game.on("death", data => {
// 	const mob = parent.entities[data.id];
// 	if (!mob) return;

// 	const mob_name = mob.mtype;
// 	const mob_target = mob.target;

// 	const partyMembers = Object.keys(get_party() || {});

// 	if (mob_target === character.name || partyMembers.includes(mob_target)) {
// 		const luck_display = mob.cooperative ? character.luckm : data.luckm;
// 		const msg = `${mob_name} died with ${luck_display} luck`;
// 		game_log(msg, "#96a4ff");
// 		console.log(msg);
// 	}
// });

// character.on("loot", data => {
// 	if (data.id) {
// 		console.log(`${data.opener} looted chest goldm: ${data.goldm}`);
// 		game_log(`${data.opener} looted chest goldm: ${data.goldm}`, "gold");

// 		// Remove chest ID after successful loot with delay to ensure it's gone
// 		setTimeout(() => {
// 			remove_chest_id(data.id);
// 		}, 2000);
// 	}
// });

// --------------------------------------------------------------------------------------------------------------------------------- //
// SPIDER DUNGEON
// --------------------------------------------------------------------------------------------------------------------------------- //

// Resolves once mob_type is confirmed alive 3 checks then absent 3 checks while
// healer stays within spawn_radius; drifting out of range resets the absence count.
function wait_for_death(mob_type, spawn_x, spawn_y, spawn_radius = 250) {
	return new Promise(resolve => {
		let consecutive_alive = 0;
		let confirmed_alive = false;
		let consecutive_dead = 0;

		const interval = setInterval(() => {
			const near_spawn = Math.hypot(character.x - spawn_x, character.y - spawn_y) < spawn_radius;

			const alive = Object.values(parent.entities).some(
				e => e.type === "monster" && e.mtype === mob_type && !e.dead
			);

			if (alive) {
				consecutive_alive++;
				consecutive_dead = 0;
				if (consecutive_alive >= 3) confirmed_alive = true;
			} else if (confirmed_alive && near_spawn) {
				consecutive_alive = 0;
				consecutive_dead++;
				if (consecutive_dead >= 3) {
					clearInterval(interval);
					log(`[Dungeon] ${mob_type} confirmed dead`, "#AA88FF");
					resolve();
				}
			} else {
				// not yet confirmed alive, or healer drifted out of range
				consecutive_alive = 0;
				consecutive_dead = 0;
			}
		}, 500);

	});
}

let _dungeon_running = false;

// Navigate all three spider bosses in order, loot after each, reload the party.
async function run_spider_dungeon() {
	if (_dungeon_running) {
		log("Spider Dungeon: Already running — ignoring duplicate start.", "#FF8844");
		return;
	}
	_dungeon_running = true;
	set_suppress_reset(true);
	send_cm(["Ulric", "Riva"], { type: "suppress_reset" });
	try {
		log("Spider Dungeon: Moving to gateway entrance...", "#AA88FF");
		await smarter_move({ map: "gateway", x: -322, y: -203 });
		log("Spider Dungeon: At entrance — entering instance...", "#AA88FF");
		await delay(10000);
		enter("spider_instance");
		await delay(10000);

		// Signal party to enter and wait until both are confirmed in the instance
		log("Spider Dungeon: Signalling party to enter instance...", "#AA88FF");
		send_cm(["Ulric", "Riva"], { type: "enter_instance", in: character.in });

		await new Promise(resolve => {
			const confirmed = new Set();
			const listener = (name, data) => {
				if (data.type === "instance_ready" && ["Ulric", "Riva"].includes(name)) {
					confirmed.add(name);
					log(`Spider Dungeon: ${name} entered instance (${confirmed.size}/2)`, "#AA88FF");
					if (confirmed.size >= 2) {
						remove_cm_listener(listener);
						resolve();
					}
				}
			};
			add_cm_listener(listener);
		});

		log("Spider Dungeon: Full party in instance — proceeding", "#AA88FF");

		// Boss 1: spiderbr
		log("Spider Dungeon: Moving to spiderbr...", "#AA88FF");
		await smarter_move({ map: "spider_instance", x: 192, y: -1533 });
		await delay(2000);
		await wait_for_death("spiderbr", 192, -1533);
		log("Spider Dungeon: spiderbr dead — looting", "#AA88FF");
		await handle_looting();
		await delay(10000);

		// Boss 2: spiderr
		log("Spider Dungeon: Moving to spiderr...", "#AA88FF");
		await smarter_move({ map: "spider_instance", x: 0, y: -1515 });
		await delay(2000);
		await wait_for_death("spiderr", 0, -1515);
		log("Spider Dungeon: spiderr dead — looting", "#AA88FF");
		await handle_looting();
		await delay(10000);

		// Boss 3: spiderbl
		log("Spider Dungeon: Moving to spiderbl...", "#AA88FF");
		await smarter_move({ map: "spider_instance", x: -188, y: -1515 });
		await delay(2000);
		await wait_for_death("spiderbl", -188, -1515);
		log("Spider Dungeon: spiderbl dead — looting", "#AA88FF");
		await handle_looting();
		await delay(10000);

		// Reload all characters
		log("Spider Dungeon: Complete — reloading party...", "#AA88FF");
		send_cm(["Ulric", "Riva"], { type: "reload" });
		await delay(500);
		parent.window.location.reload();

	} catch (e) {
		console.error("run_spider_dungeon error:", e);
	} finally {
		_dungeon_running = false;
		set_suppress_reset(false);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
// skill_loop() is NOT started here: it's defined in Healer_Skills.js, a separate
// eval closure loading after this one — calling it here would throw ReferenceError.
// Healer_Skills.js starts itself once loaded.
maintenance_loop();
equipment_manager_loop();
potion_loop();
setInterval(remote_sell_items, 5000);
if (HEALER_TARGET === "bscorpion") {
	prim_farm_loop();
	prim_orbit_loop();
}

if (HEALER_TARGET === "giantspider") {
	// Wait for loops/game state to settle before auto-starting the dungeon run.
	setTimeout(() => {
		if (_dungeon_running) return;
		if (character.rip) {
			log("Spider Dungeon: Character is dead on startup — not auto-starting.", "#FF8844");
			return;
		}
		if (character.map === "spider_instance") {
			log("Spider Dungeon: Detected startup inside instance — restarting from gateway.", "#FFAA44");
		}
		log("Spider Dungeon: Auto-starting...", "#AA88FF");
		run_spider_dungeon();
	}, 5000);
}
