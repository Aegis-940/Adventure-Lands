
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

home = HEALER_TARGET;

const CONFIG = {
	combat: {
		enabled: true,
		zapper_enabled: false,
		zapper_mobs: [home, ...all_bosses, 'sparkbot'],
		target_priority: ['Ulric', 'Myras'],
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
		party_heal_threshold: 0.50,
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
			pinkgoblin: 75000
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
		group_members: ['Myras', 'Ulric', 'Riva', 'Riff']
	},
};

const destination = {
	map: locations[home][0].map,
	x: locations[home][0].x,
	y: locations[home][0].y
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

const state = {
	current: 'idle', // idle, looting, moving
	skin_ready: false,
	last_equip_time: 0,
	last_loot_time: 0,
	last_gold_swap: 0,
	last_temporal_surge: 0,
	angle: 0,
	last_angle_update: performance.now()
};

const cache = {
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

const equipment_sets = {
	zap_on: [
		{ item_name: "zapper", slot: "ring2", level: 2, l: "u" }
	],
	zap_off: [
		{ item_name: "ringofluck", slot: "ring2", level: 2, l: "l" }
	],
	luck: [
		{ item_name: "supermittens", slot: "gloves", level: 7, l: "l" },
		{ item_name: "orboffire", slot: "orb", level: 3, l: "l" },
		{ item_name: "lmace", slot: "mainhand", level: 7, l: "" },
		// { item_name: "mshield", slot: "offhand", level: 8, l: "l" },
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
	mdef: [
		{ item_name: "wbookhs", slot: "offhand", level: 2, l: "l" },
	],
	temporal: [
		{ item_name: "orboftemporal", slot: "orb", level: 1, l: "l" },
	],
	fireres: [
		{ item_name: "orboffire", slot: "orb", level: 3, l: "l" },
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
	// Priority 1: Bosses
	for (const boss_type of CONFIG.combat.all_bosses) {
		const boss = get_nearest_monster_v2({
			type: boss_type,
			max_distance: character.range
		});
		if (boss) return boss;
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
		if (e.type === 'monster' && !e.dead && e.target === character.name) count++;
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
		e.type === 'monster' &&
		!e.target &&
		CONFIG.combat.zapper_mobs.includes(e.mtype) &&
		is_in_range(e, 'zapperzap') &&
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
		if (HEALER_TARGET !== 'fireroamer') panic_check();

		if (should_handle_events()) {
			handle_events();
		}
		else if (should_loot()) {
			await handle_looting();
		}
		else if (CONFIG.movement.enabled) {
			if (HEALER_TARGET === 'bscorpion') {
				// Scorpion visibility ≠ scorpion reachability (waterway between them).
				// Pathfind to the farm spot via smart_move only when actually lost;
				// once we're in the farm zone, prim_farm_loop handles positioning
				// without triggering smart.moving.
				const at_farm = character.map === PRIM_FARM_LOC.map &&
					Math.hypot(character.x - PRIM_FARM_LOC.x, character.y - PRIM_FARM_LOC.y) < PRIM_FARM_RADIUS + 30;
				if (!at_farm && !smart.moving) smart_move(PRIM_FARM_LOC);
			} else if (!get_nearest_monster({ type: home })) {
				handle_return_home();
			} else if (CONFIG.movement.circle_walk) {
				walk_in_circle();
			}
		}

		if (CONFIG.equipment.auto_swap_sets/* && state.skin_ready*/ && state.current !== 'looting') {
			handle_equipment_swap();
		}

	} catch (e) {
		console.error('main_loop error:', e);
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
	// 	e => e.type === 'monster' && !e.dead
	// );
	// if (nearby) return false;

	// Equip temporal set, cast, then re-equip previous set
	const prev_orb = character.slots.orb ? { name: character.slots.orb.name, level: character.slots.orb.level } : null;

	state.last_equip_time = performance.now();
	await equip_set('temporal');
	await use_skill('temporalsurge');
	log('Temporal Surge activated!', '#FFAA00');
	state.last_temporal_surge = Date.now();
	state.last_equip_time = performance.now();

	// Swap back to whatever set handle_equipment_swap would choose
	if (prev_orb) {
		const inv_idx = character.items.findIndex(
			i => i && i.name === prev_orb.name && i.level === prev_orb.level
		);
		if (inv_idx !== -1) await equip(inv_idx, 'orb');
	}

	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Combat and healing only
// --------------------------------------------------------------------------------------------------------------------------------- //

async function action_loop() {
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();

		// Temporal Surge — cast when idle (no monsters, 60s cooldown)
		if (await check_temporal_surge()) return setTimeout(action_loop, 100);

		const ms = ms_to_next_skill('attack');

		if (ms === 0) {
			const HEALED = await try_heal();
			
			if (panicking) return setTimeout(action_loop, 100);

			if (!HEALED) {
				const TARGET = cache.target;
				if (TARGET && is_in_range(TARGET) && smart.moving === false) {
					await attack(TARGET);
				}
			}
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}

	} catch (e) {
		console.error('priest action_loop error:', e);
		delay = 1;
	}

	setTimeout(action_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP - Independent skill management
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	// if (panicking) return setTimeout(skill_loop, 100);
	const delay = 40;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const PENALTY = character.s?.penalty_cd?.ms || 0;

		// Curse
		if (CONFIG.combat.enabled) {
			await handle_curse();
		}

		// Absorb 
		if (CONFIG.healing.absorb_enabled && PENALTY < 500) {
			await handle_absorb();
		}

		// Party Heal
		if (true) {
			await handle_party_heal();
		}

		// Dark Blessing
		if (CONFIG.healing.dark_blessing_enabled && !is_on_cooldown('darkblessing')) {
			if (HEALER_TARGET !== 'bscorpion' || bscorpion_worth_buffing()) {
				await use_skill('darkblessing');
			}
		}

		// Zapper
		// if (CONFIG.combat.zapper_enabled) {
		// 	await handle_zapper();
		// }

	} catch (e) {
		console.error('skill_loop error:', e);
	}

	setTimeout(skill_loop, delay);
}

async function try_heal() {
	const HEAL_TARGET = cache.heal_target;
	if (!HEAL_TARGET) return false;

	const HEAL_THRESHOLD = HEAL_TARGET.max_hp - character.heal / 1.33;

	if (HEAL_TARGET.hp < HEAL_THRESHOLD && is_in_range(HEAL_TARGET, "heal")) {
		log(`Healing → ${HEAL_TARGET.name} (${Math.round((HEAL_TARGET.hp / HEAL_TARGET.max_hp) * 100)}%)`, '#33AAFF');
		await heal(HEAL_TARGET);
		return true;
	}

	return false;
}

async function handle_curse() {
	if (is_on_cooldown('curse') || smart.moving) return;

	const X = locations[home][0].x;
	const Y = locations[home][0].y;

	// Only consider monsters that are already engaged (have a target)
	const has_target = e =>
		e?.type === 'monster' && !e.dead && e.visible && e.target && !e.immune &&
		e.hp >= e.max_hp * 0.01;

	let target = null;

	// Boss priority: nearest engaged boss
	const bosses_with_target = Object.values(parent.entities)
		.filter(e => has_target(e) && CONFIG.combat.all_bosses.includes(e.mtype))
		.sort((a, b) => distance(character, a) - distance(character, b));
	if (bosses_with_target.length) target = bosses_with_target[0];

	// Home-mob fallback: highest-HP engaged home mob near the spot
	if (!target) {
		const home_mobs = Object.values(parent.entities)
			.filter(e =>
				has_target(e) &&
				e.mtype === home &&
				Math.hypot(X - e.x, Y - e.y) <= 175
			)
			.sort((a, b) => b.hp - a.hp);
		if (home_mobs.length) target = home_mobs[0];
	}

	if (target && is_in_range(target, 'curse')) {
		await use_skill('curse', target);
	}
}

async function handle_absorb() {
	if (is_on_cooldown('absorb')) return;

	const maps_to_exclude = ['level2n', 'level2w'];
	if (maps_to_exclude.includes(character.map)) return;

	// Boss check - ALWAYS absorb boss targets (highest priority)
	// const boss = get_nearest_monster_v2({ type: CONFIG.combat.all_bosses });
	// if (boss?.target && boss.target !== character.name) {
	// 	const TARGET_PLAYER = get_player(boss.target);
	// 	if (TARGET_PLAYER) {
	// 		await use_skill('absorb', boss.target);
	// 		log(`Boss Absorb → ${boss.mtype} from ${boss.target}`, '#FF3333');
	// 		return;
	// 	}
	// }

	// Party absorb - check in real-time, not from cache
	if (!character.party) return;

	const PARTY_NAMES = Object.keys(get_party());
	const ALLIES = PARTY_NAMES.filter(n => n !== character.name);
	if (!ALLIES.length) return;

	for (let id in parent.entities) {
		const entity = parent.entities[id];
		if (!entity || entity.type !== 'monster' || entity.dead) continue;

		// If this monster is targeting an ally and not us
		if (entity.target && ALLIES.includes(entity.target) && entity.target !== character.name) {
			await use_skill('absorb', entity.target);
			return;
		}
	}
}


const PARTY_HEAL_COOLDOWN = 250;
let last_party_heal_time = 0;

async function handle_party_heal() {
	const now = performance.now();
	if (now - last_party_heal_time < PARTY_HEAL_COOLDOWN) return;

	let threshold = CONFIG.healing.party_heal_threshold;
	if (character.map !== destination.map) {
		threshold = 0.75;
	}

	if (character.mp <= CONFIG.healing.party_heal_min_mp) return;

	for (const name of cache.party_members) {
		const ally = get_player(name);
		if (!ally || ally.rip || ally.hp >= ally.max_hp * threshold) continue;
		log(`Party Heal → ${name} (${Math.round((ally.hp / ally.max_hp) * 100)}%)`, '#33FF77');
		await use_skill('partyheal');
		last_party_heal_time = now;
		break;
	}
}


async function handle_zapper() {
	const TARGETS = find_zap_targets();
	const NOW = performance.now();
	const HAS_ZAPPER = character.slots.ring2?.name === 'zapper';
	const CAN_SWAP = NOW - state.last_equip_time > COOLDOWNS.zapper_swap;
	const HAS_ENOUGH_MP = character.mp > (G?.skills?.zapperzap?.mp || 0) + 1250;

	if (smart.moving || character.cc > COOLDOWNS.cc) return;

	// Step 1: Equip zapper if untargeted mobs exist and we don't have it equipped
	if (TARGETS.length > 0 && !HAS_ZAPPER && CAN_SWAP && HAS_ENOUGH_MP && character.map === destination.map) {
		try {
			await equip_set('zap_on');
			state.last_equip_time = NOW;
		} catch (e) {
			console.error('Failed to equip zapper:', e);
		}
		return;
	}

	// Step 2: Zap all untargeted mobs if we have zapper equipped
	if (TARGETS.length > 0 && HAS_ZAPPER && HAS_ENOUGH_MP && !is_on_cooldown('zapperzap')) {
		for (const entity of TARGETS) {
			if (is_on_cooldown('zapperzap')) break;

			try {
				await use_skill('zapperzap', entity);
			} catch (e) {
				console.error('handleZapper error:', e);
			}
		}
	}

	// Step 3: Only unequip zapper when NO untargeted mobs remain
	// Don't unequip just because we zapped them all - they might respawn
	if (TARGETS.length === 0 && HAS_ZAPPER && CAN_SWAP && character.map === destination.map) {
		try {
			await equip_set('zap_off');
			state.last_equip_time = NOW;
		} catch (e) {
			console.error('Failed to unequip zapper:', e);
		}
	}
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

		if (character.rip/* && locate_item('xptome') !== -1*/) {
			respawn();
		}

	} catch (e) {
		console.error('maintenance_loop error:', e);
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

// potion_loop → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// should_handle_events, handle_events, handle_specific_event, handle_return_home → Common Functions.js

async function walk_in_circle() {
	if (smart.moving) return;
	if (HEALER_TARGET === 'bscorpion') return;

	const center = locations[home][0];
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
		state.current !== 'looting'
	);
}

async function handle_looting() {
	state.last_loot_time = performance.now();
	state.current = 'looting';

	try {
		if (CONFIG.looting.equip_gold_gear && !is_set_equipped('gold') && performance.now() - state.last_gold_swap > 1000) {
			await equip_set('gold');
			state.last_gold_swap = performance.now();
			swap_booster('luckbooster', 'goldbooster');
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
			await equip_set('luck');
			await swap_booster('goldbooster', 'luckbooster');
			await delay(200);
		}
	} catch (e) {
		console.error('Looting error:', e);
	} finally {
		state.current = 'idle';
	}
}

const CHEST_STORAGE_KEY = get_chests();
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
// EQUIPMENT MANAGEMENT
// --------------------------------------------------------------------------------------------------------------------------------- //

async function handle_equipment_swap() {
    if (!CONFIG.equipment.auto_swap_sets || character.cc > COOLDOWNS.cc) return;

    const now = performance.now();
    if (now - state.last_equip_time < COOLDOWNS.equip_swap) return;

    // Pick target set based on HEALER_TARGET
    let target_set = 'luck';
    if (typeof HEALER_TARGET !== 'undefined') {
        if (HEALER_TARGET === 'dryad') target_set = 'mdef';
        else if (HEALER_TARGET === 'fireroamer') target_set = 'fireres';
    }

    if (!is_set_equipped(target_set)) {
        state.last_equip_time = now;
        await equip_set(target_set);
    }
}

function is_set_equipped(set_name) {
	const set = equipment_sets[set_name];
	if (!set) return false;

	return set.every(item =>
		character.slots[item.slot]?.name === item.item_name &&
		character.slots[item.slot]?.level === item.level
	);
}

async function equip_set(set_name) {
	const set = equipment_sets[set_name];
	if (set) {
		await batch_equip(set);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

let panicking = false;
let last_panic_time = 0;
let last_safe_time = 0;

async function panic_check() {

	let LOW_HEALTH = 0;
	let LOW_MANA = 0;
	let HIGH_HEALTH = 0;
	let HIGH_MANA = 0;
	let MONSTERS_TARGETING_ME = 0;
	const PANIC_AGGRO_THRESHOLD = 99;
	const PANIC_COOLDOWN = 1000;

	// --- Panic/Safe Conditions ---
	LOW_HEALTH = character.hp < character.max_hp * 0.50;
	LOW_MANA = character.mp < character.max_mp * 0.15;
	HIGH_HEALTH = character.hp >= character.max_hp * 0.80;
	HIGH_MANA = character.mp >= character.max_mp * 0.50;

	const panic_slot = character.items.findIndex(i => i?.name === 'jacko');

	// Aggro check: monsters targeting me
	MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
		e => e.type === "monster" && e.target === character.name && !e.dead
	).length;

	// PANIC CONDITION
	if (LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= PANIC_AGGRO_THRESHOLD) {
		if (!panicking) {
			panicking = true;
			send_cm(['Ulric', 'Riva'], { type: 'panic', state: true });
			let reason = [];
			if (LOW_HEALTH) reason.push("low health");
			if (LOW_MANA) reason.push("low mana");
			if (MONSTERS_TARGETING_ME >= PANIC_AGGRO_THRESHOLD) reason.push("high aggro");
			log(`⚠️ Panic triggered: ${reason.join(", ")}!`, "#ffcc00", "Alerts");
		}
	}

	if (panicking && (Date.now() - last_panic_time > PANIC_COOLDOWN)) {
		last_panic_time = Date.now();
		// Equip panic orb if needed
		if (character.slots.orb?.name !== 'jacko' && panic_slot !== -1) {
			try {
				await equip(panic_slot);
				await delay(200);
				if (character.slots.orb?.name !== 'jacko') {
					log("[PANIC] Failed to equip panic orb!", "#ff4444", "Errors");
				}
			} catch (e) {
				log(`[PANIC] Error equipping panic orb: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
			}
		}

		// Try to cast scare if possible
		if (!is_on_cooldown("scare") && can_use("scare") && character.slots.orb?.name === 'jacko') {
			try {
				log("Using Scare!", "#ffcc00", "Alerts");
				await use_skill("scare");
				await delay(200);
			} catch (e) {
				log(`[PANIC] Error using scare: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
			}
		}
	}

	const safe_slot = character.items.findIndex(i => i?.name === 'orbg');

	// SAFE CONDITION
	if (HIGH_HEALTH && HIGH_MANA && MONSTERS_TARGETING_ME < PANIC_AGGRO_THRESHOLD) {
		if (panicking) {
			panicking = false;
			send_cm(['Ulric', 'Riva'], { type: 'panic', state: false });
			log("✅ Panic over.", "#00ff00", "Alerts");
		}
	}

	if (!panicking && (Date.now() - last_safe_time > PANIC_COOLDOWN)) {
		last_safe_time = Date.now();
		// Equip normal orb if needed
		if (character.slots.orb?.name === 'jacko' && safe_slot !== -1) {
			try {
				await equip(safe_slot);
				await delay(200);
				if (character.slots.orb?.name === 'jacko') {
					log("[PANIC] Failed to equip normal orb!", "#ff4444", "Errors");
				}
			} catch (e) {
				log(`[PANIC] Error equipping normal orb: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
			}
		}
	}
}

function clear_inventory() {
	const loot_mule = get_player('Riff');
	if (!loot_mule) return;

	const dist = distance(character, loot_mule);
	
	if (dist < 250 && character.gold > 5000000) {
			send_gold(loot_mule, character.gold - 5000000);
	}

	const items_to_exclude = ['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'pumpkinspice', 'xptome', 'tracker', 'jacko', 'orbg', 'talkingskull', "mshield", "lmace", 'elixirluck', 'computer', 'orboftemporal', 'orboffire'];

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !items_to_exclude.includes(item.name) && !item.l && !item.s) {
			if (dist < 250) {
				send_item(loot_mule.id, i, item.q ?? 1);
			}
		}
	}
}

const item_order = { 
	tracktrix: 0, 
	computer: 1, 
	hpot1: 2, 
	mpot1: 3, 
	xptome: 4, 
	pumpkinspice: 5, 
	xpbooster: 6,
	jacko: 7 
};

const inventory_sorter = () => {
	character.items.forEach((item, i) => {
		const target = item_order[item?.name];
		if (target !== undefined && i !== target) swap(i, target);
	});
};

// auto_buy_potions → Common Functions.js

function elixir_usage() {
	const required = 'elixirluck';
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
// 		skin: 'tm_white',
// 		skinRing: { name: 'tristone', level: 0, locked: 'l' },
// 		normalRing: { name: 'ringofluck', level: 2, locked: 'u' }
// 	},
// };

// function skinNeeded(ringName, ringLevel, slot = 'ring1', locked = 'l', ccThreshold = 135) {
// 	if (character.cc <= ccThreshold) {
// 		if (character.slots[slot]?.name !== ringName || character.slots[slot]?.level !== ringLevel) {
// 			equipIfNeeded(ringName, slot, ringLevel, locked);
// 		}
// 		parent.socket.emit('activate', { slot });
// 	}
// }

// async function equipIfNeeded(itemName, slotName, level, l) {
// 	let name = null;

// 	if (typeof itemName === 'object') {
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
// 		skinNeeded(config.skinRing.name, config.skinRing.level, 'ring1', config.skinRing.locked);
// 		await delay(500);
// 		return skinChanger();
// 	}

// 	// 2. Ensure correct normal ring
// 	const slot = character.slots.ring1;
// 	if (slot?.name !== config.normalRing.name || slot?.level !== config.normalRing.level) {
// 		console.log(`Equipping normalRing: ${config.normalRing.name} lvl ${config.normalRing.level}`);
// 		equipIfNeeded(config.normalRing.name, 'ring1', config.normalRing.level, config.normalRing.locked);
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

function on_party_request(name) {
	if (CONFIG.party.group_members.includes(name)) {
		console.log('Accepting party request from ' + name);
		accept_party_request(name);
	}
}

function on_party_invite(name) {
	if (CONFIG.party.group_members.includes(name)) {
		console.log('Accepting party invite from ' + name);
		accept_party_invite(name);
	}
}

// game.on('death', data => {
// 	const mob = parent.entities[data.id];
// 	if (!mob) return;

// 	const mob_name = mob.mtype;
// 	const mob_target = mob.target;

// 	const partyMembers = Object.keys(get_party() || {});

// 	if (mob_target === character.name || partyMembers.includes(mob_target)) {
// 		const luck_display = mob.cooperative ? character.luckm : data.luckm;
// 		const msg = `${mob_name} died with ${luck_display} luck`;
// 		game_log(msg, '#96a4ff');
// 		console.log(msg);
// 	}
// });

// character.on('loot', data => {
// 	if (data.id) {
// 		console.log(`${data.opener} looted chest goldm: ${data.goldm}`);
// 		game_log(`${data.opener} looted chest goldm: ${data.goldm}`, 'gold');

// 		// Remove chest ID after successful loot with delay to ensure it's gone
// 		setTimeout(() => {
// 			remove_chest_id(data.id);
// 		}, 2000);
// 	}
// });

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
skill_loop();
maintenance_loop();
potion_loop();
if (HEALER_TARGET === 'bscorpion') {
	prim_farm_loop();
	prim_orbit_loop();
}
