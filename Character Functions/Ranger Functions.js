
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const home = RANGER_TARGET;

const CONFIG = {
	combat: {
		enabled: true,
		target_priority: ['Ulric', 'Myras'],
		always_attack: ['crabx'], // Attack regardless of target
		attack_if_targeted: [...all_bosses, 'phoenix'], // Only attack if has target
		never_attack: ['nerfedmummy'], // Never attack
		use_hunters_mark: true,
		use_supershot: true,
		min_targets_for_5shot: 4,
		min_targets_for_3shot: 2,
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 0.95,
		circle_radius: 75,
		move_threshold: 10,
		clump_radius: 30
	},

	equipment: {
		boss_hp_thresholds: {
			mrpumpkin: 100000,
			mrgreen: 100000,
			crabxx: 100000,
			grinch: 100000,
		},
		mp_thresholds: { upper: 1700, lower: 2100 },
		chest_threshold: 12,
		swap_cooldown: 500,
		cape_swap_enabled: false,
		coat_swap_enabled: false,
		boss_set_swap_enabled: true,
		xp_set_swap_enabled: false,
		xp_monsters: [home, 'sparkbot'],
		xp_mob_hp_threshold: 12000,
		use_licence: false,
	},

	potions: {
		auto_buy: false,
		hp_threshold: 400,
		mp_threshold: 500,
		min_stock: 1000
	},

	party: {
		auto_manage: true,
		group_members: ['Myras', 'Ulric', 'Riva', 'Riff']
	},

	looting: {
		enabled: false,
		delay_ms: 180000,
		loot_month: 'lootItemsJan'
	},

	selling: {
		enabled: false,
		whitelist: ['vitearring', 'iceskates', 'cclaw', 'hpbelt', 'ringsj', 'hpamulet',
			'warmscarf', 'quiver', 'snowball', 'vitring', 'wbreeches', 'wgloves',
			'strring', 'dexring', 'intring']
	},

	upgrading: {
		enabled: false,
		whitelist: {}
	},

	combining: {
		enabled: false,
		whitelist: {
			dexamulet: { targetLevel: 3, primling: 3, prim: 4 },
			intamulet: { targetLevel: 3, primling: 3, prim: 4 },
			stramulet: { targetLevel: 3, primling: 3, prim: 4 }
		}
	},

	character_starter: {
		enabled: false,
		characters: {
			MERCHANT: { name: 'Riff', codeSlot: 95 },
			PRIEST: { name: 'Myras', codeSlot: 3 },
			WARRIOR: { name: 'Ulric', codeSlot: 2 }
		}
	},

	location_broadcast: {
		enabled: true,
		target_player: 'Riff',
		check_interval: 1000,
		low_inventory_slots: 7
	}
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
	skin_ready: false,
	last_equip_time: 0,
	last_booster_swap: 0,
	last_cape_swap: 0,
	last_coat_swap: 0,
	last_boss_set_swap: 0,
	last_xp_swap: 0,
	angle: 0,
	last_angle_update: performance.now(),
};

const cache = {
	targets: { sorted_by_hp: [], in_range: [], out_of_range: [], clumped: [], last_update: 0 },
	heal_target: null,
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
	single: [
		{ item_name: "firebow", slot: "mainhand", level: 8, l: "l" },
		{ item_name: "t2quiver", slot: "offhand", level: 7, l: "l" },
	],
	dead: [

	],

	boom: [
		{ item_name: "pouchbow", slot: "mainhand", level: 10, l: "l" },
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
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

const should_attack_mob = (mob) => {
	if (!mob || mob.dead) return false;

	// 1. Never attack blacklist
	if (CONFIG.combat.never_attack.includes(mob.mtype)) return false;

	// 2. Bosses: always attack
	if (CONFIG.combat.attack_if_targeted.includes(mob.mtype)) {
		return true;
	}

	// 3. Always attack whitelist (e.g., crabx)
	if (CONFIG.combat.always_attack.includes(mob.mtype)) return true;

	// 4. Active event bosses: always attack
	if (parent?.S?.[mob.mtype]?.live) return true;

	// 5. Default: attack if targeting party members
	return CONFIG.combat.target_priority.includes(mob.target);
};

const update_cache = () => {
	const now = performance.now();
	cache.targets = update_target_cache();
	cache.heal_target = find_heal_target();
	cache.last_update = now;
};

const update_target_cache = () => {
	const { x: homeX, y: homeY } = locations[home][0];
	const clump_radius = CONFIG.movement.clump_radius;
	const sorted_by_hp = [];

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === 'monster' && should_attack_mob(e)) {
			sorted_by_hp.push(e);
		}
	}

	// Sort: Bosses FIRST, then always_attack, then by HP
	sorted_by_hp.sort((a, b) => {
		const a_boss = CONFIG.combat.attack_if_targeted.includes(a.mtype);
		const b_boss = CONFIG.combat.attack_if_targeted.includes(b.mtype);
		if (a_boss !== b_boss) return b_boss - a_boss;

		const a_priority = CONFIG.combat.always_attack.includes(a.mtype);
		const b_priority = CONFIG.combat.always_attack.includes(b.mtype);
		if (a_priority !== b_priority) return b_priority - a_priority;

		return b.hp - a.hp;
	});

	const in_range = [], out_of_range = [], clumped = [];

	for (const mob of sorted_by_hp) {
		if (is_in_range(mob)) {
			in_range.push(mob);

			if (Math.hypot(mob.x - homeX, mob.y - homeY) <= clump_radius) {
				clumped.push(mob);
			}
		} else {
			out_of_range.push(mob);
		}
	}

	return { sorted_by_hp, in_range, out_of_range, clumped };
};

const find_heal_target = () => {
	const healer = get_entity('Myras');
	const threshold = (!healer || healer.rip) ? 0.9 : 0.66;
	const party = Object.keys(get_party() || {});

	let target = null, min_pct = 1;

	for (const name of party) {
		if (name === character.name) continue;
		const ally = get_player(name);
		if (ally?.hp && ally?.max_hp && !ally.rip) {
			const pct = ally.hp / ally.max_hp;
			if (pct < min_pct) { min_pct = pct; target = ally; }
		}
	}

	return min_pct < threshold ? target : null;
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN TICK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

const main_loop = async () => {
	try {
		if (is_disabled(character)) return setTimeout(main_loop, 250);

		update_cache();
		panic_check();

		if (CONFIG.equipment.use_licence) {
			let slot = locate_item("licence");
			if (slot === -1 && (character?.s?.licenced?.ms ?? 0) < 5000) {
				await buy("licence");
				slot = locate_item("licence");
			}
			if ((character?.s?.licenced?.ms ?? 0) < 250 && slot !== -1) {
				await consume(slot);
			}
		}

		should_handle_events() ? handle_events() :
			CONFIG.movement.enabled && (!get_nearest_monster({ type: home }) ?
				handle_return_home() :
				CONFIG.movement.circle_walk && walk_in_circle());
	} catch (e) {
		console.error('main_loop error:', e);
	}
	setTimeout(main_loop, TICK_RATE.main);
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Attack and heal
// --------------------------------------------------------------------------------------------------------------------------------- //

const action_loop = async () => {
	if (panicking) return setTimeout(action_loop, 100);
	const myras = get_player("Myras");
	if (!myras || distance(character, myras) > 200) {
		return setTimeout(action_loop, 100);
	}
	let delay = 5;
	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();
		const ms = ms_to_next_skill('attack');

		if (ms === 0 && smart.moving === false) {
			if (cache.heal_target) {
				await equip_set('heal');
				await attack(cache.heal_target);
				log(`[heal] Healing ${cache.heal_target.name} (${Math.round((cache.heal_target.hp / cache.heal_target.max_hp) * 100)}%)`, "#00ff00", "HealDebug");
			} else await handle_attack();
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}
	} catch { delay = 10; }
	setTimeout(action_loop, delay);
};

const handle_attack = async () => {
	const { sorted_by_hp, clumped, in_range, out_of_range } = cache.targets;
	if (!sorted_by_hp.length) return;

	const min5 = CONFIG.combat.min_targets_for_5shot;
	const min3 = CONFIG.combat.min_targets_for_3shot;
	const mp5 = (G.skills['5shot']?.mp + 400);
	const mp3 = (G.skills['3shot']?.mp + 200);
	const mp1 = 100;
	const can_5shot = character.mp >= mp5;
	const can_3shot = character.mp >= mp3;
	const can_1shot = character.mp >= mp1;

	if (can_5shot && clumped.length >= min5) {
		await equip_set('boom');
		await use_skill('5shot', clumped.slice(0, 5).map(e => e.id));
	} else if (can_5shot && in_range.length >= min5) {
		await equip_set('boom');
		await use_skill('5shot', in_range.slice(0, 5).map(e => e.id));
	} else if (can_5shot && out_of_range.length >= min5) {
		await equip_set('boom');
		await use_skill('5shot', out_of_range.slice(0, 5).map(e => e.id));
	} else if (can_3shot && in_range.length >= min3) {
		await equip_set('boom');
		await use_skill('3shot', in_range.slice(0, 3).map(e => e.id));
	} else if (can_1shot && in_range.length >= 1) {
		equip_set('single');
		await attack(in_range[0]);
	}
	
	if (character.slots?.mainhand?.name === 'cupid') {
		log(`[atk] Attacking monster while cupid is equipped`, "#ff0000", "AtkDebug");
	}
	
	return false;
};

const skill_loop = async () => {
	if (panicking) return setTimeout(skill_loop, 100);
	const myras = get_player("Myras");
	if (!myras || distance(character, myras) > 200) {
		return setTimeout(skill_loop, 100);
	}
	let delay = 5;
	try {
		if (!CONFIG.combat.use_hunters_mark && !CONFIG.combat.use_supershot) return;
		if (is_disabled(character)) return setTimeout(skill_loop, 250);

		update_cache();

		const { sorted_by_hp } = cache.targets;
		if (!sorted_by_hp.length) return;

		const target = sorted_by_hp[0];
		if (!target || !is_in_range(target)) return;

		const msHunter = ms_to_next_skill('huntersmark');
		const msSuper = ms_to_next_skill('supershot');
		const minMs = Math.min(msHunter, msSuper);

		if (minMs < character.ping / 10) {
			change_target(target);

			if (CONFIG.combat.use_hunters_mark && msHunter === 0 && !target.s?.marked) {
				await use_skill('huntersmark', target);
			}

			if (CONFIG.combat.use_supershot && msSuper === 0) {
				await use_skill('supershot', target);
			}
		} else {
			delay = minMs > 200 ? 100 : minMs > 50 ? 20 : 5;
		}
	} catch { delay = 1; }
	setTimeout(skill_loop, delay);
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAINTENANCE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

const maintenance_loop = async () => {
	try {
		if (CONFIG.potions.auto_buy) auto_buy_potions();
		if (CONFIG.party.auto_manage) party_manager();
		if (CONFIG.selling.enabled) sell_items();
		if (CONFIG.upgrading.enabled) upgrade_items();
		if (CONFIG.combining.enabled) combine_items();

		clear_inventory();
		inventory_sorter();
		elixir_usage();

		if (character.rip) respawn();
	} catch (e) {
		console.error('maintenance_loop error:', e);
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

// potion_loop → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT MANAGEMENT LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function equipment_loop() {
	const delay = TICK_RATE.equipment;

	try {
		if (character.cc > COOLDOWNS.cc) {
			return setTimeout(equipment_loop, delay);
		}

		const now = performance.now();
		const swap_cooldown = CONFIG.equipment.swap_cooldown;

		const mainhand = character.slots?.mainhand?.name;
		if (mainhand === 'cupid') return setTimeout(equipment_loop, delay);

		const active_boss = EVENT_LOCATIONS
			.map(e => ({ name: e.name, data: parent.S[e.name] }))
			.find(e => e.data?.live);

		// // Booster Swap
		// if (now - state.last_booster_swap > swap_cooldown) {
		// 	let desired_booster = active_boss && active_boss.data.hp < CONFIG.equipment.boss_hp_thresholds[active_boss.name]
		// 		? 'luckbooster'
		// 		: 'xpbooster';

		// 	const current_booster_slot = locate_item(desired_booster);
		// 	if (current_booster_slot === -1) {
		// 		const other_booster_slot = find_booster_slot();
		// 		if (other_booster_slot !== null) {
		// 			shift(other_booster_slot, desired_booster);
		// 			state.last_booster_swap = now;
		// 		}
		// 	}
		// }

		// // Cape Swap
		// if (CONFIG.equipment.cape_swap_enabled && now - state.last_cape_swap > swap_cooldown) {
		// 	const chest_count = get_num_chests();
		// 	const num_targets = get_num_targets('Myras');
		// 	const target_cape_set = chest_count >= CONFIG.equipment.chestThreshold && num_targets < 6
		// 		? 'stealth'
		// 		: 'cape';

		// 	if (target_cape_set && !is_set_equipped(target_cape_set)) {
		// 		equip_set(target_cape_set);
		// 		state.last_cape_swap = now;
		// 	}
		// }

		// // Coat Swap
		// if (CONFIG.equipment.coat_swap_enabled && now - state.last_coat_swap > swap_cooldown) {
		// 	const target_coat_set = character.mp > CONFIG.equipment.mp_thresholds.upper
		// 		? 'stat'
		// 		: character.mp < CONFIG.equipment.mp_thresholds.lower && 'mana';

		// 	if (target_coat_set && !is_set_equipped(target_coat_set)) {
		// 		equip_set(target_coat_set);
		// 		state.last_coat_swap = now;
		// 	}
		// }

		// // XP Set Swap
		// if (CONFIG.equipment.xp_set_swap_enabled && now - state.last_xp_swap > swap_cooldown && character.map === mob_map) {
		// 	const has_low_hp_xp_mob = Object.values(parent.entities).some(e =>
		// 		e?.type === 'monster' && !e.dead &&
		// 		CONFIG.equipment.xp_monsters.includes(e.mtype) &&
		// 		e.hp < CONFIG.equipment.xp_mob_hp_threshold
		// 	);
		// 	const target_xp_set = has_low_hp_xp_mob ? 'xp' : 'orb';

		// 	if (target_xp_set && !is_set_equipped(target_xp_set)) {
		// 		equip_set(target_xp_set);
		// 		state.last_xp_swap = now;
		// 	}
		// }

		// Boss Set Swap
		if (CONFIG.equipment.boss_set_swap_enabled && now - state.last_boss_set_swap > swap_cooldown) {
			const target_set = active_boss
				? active_boss.data.hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name] ? 'dps' : 'luck'
				: (character.map === mob_map && 'dps');

			if (target_set && !is_set_equipped(target_set)) {
				equip_set(target_set);
				state.last_boss_set_swap = now;
			}
		}

	} catch (e) {
		console.error('equipment_loop error:', e);
	}

	setTimeout(equipment_loop, delay);
}

// find_booster_slot, get_num_chests, get_num_targets → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// should_handle_events, handle_events, handle_specific_event, handle_return_home → Common Functions.js

async function walk_in_circle() {
	if (smart.moving || character.moving) return;
	if (RANGER_TARGET === 'bscorpion') return;

	const { x: center_x, y: center_y } = locations[home][0];
	const now = performance.now();
	const delta = (now - state.last_angle_update) / 1000;

	state.angle = (state.angle + CONFIG.movement.circle_speed * delta) % (2 * Math.PI);
	state.last_angle_update = now;

	const target_x = center_x + Math.cos(state.angle) * CONFIG.movement.circle_radius;
	const target_y = center_y + Math.sin(state.angle) * CONFIG.movement.circle_radius;

	const dist_to_target = Math.hypot(character.x - target_x, character.y - target_y);
	if (dist_to_target > CONFIG.movement.move_threshold) {
		// Use raw move() — xmove falls back to smart_move on obstacle, which would gate attacks
		move(target_x, target_y);
	}
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOTING
// --------------------------------------------------------------------------------------------------------------------------------- //

// const CHEST_STORAGE_KEY = 'loot_chest_ids';

// function loadChestMap() {
// 	const data = get(CHEST_STORAGE_KEY);
// 	return typeof data === 'object' && data !== null ? data : {};
// }

// function saveChestMap(map) {
// 	set(CHEST_STORAGE_KEY, map);
// }

// function removeChestId(id) {
// 	const stored = loadChestMap();
// 	if (stored[id]) {
// 		delete stored[id];
// 		saveChestMap(stored);
// 	}
// }

// function updateChestsInStorage() {
// 	const stored = loadChestMap();
// 	const now = performance.now();
// 	for (const id of Object.keys(get_chests())) {
// 		if (!stored[id]) {
// 			stored[id] = now;
// 		}
// 	}
// 	saveChestMap(stored);
// }

// async function handleLooting() {
// 	if (!CONFIG.looting.enabled) return;

// 	try {
// 		const chestMap = loadChestMap();
// 		const now = performance.now();
// 		let looted = 0;

// 		for (const id of Object.keys(chestMap)) {
// 			const storedAt = chestMap[id];
// 			if (!storedAt) continue;
// 			if (now - storedAt < CONFIG.looting.delayMs) continue;
// 			await loot(id);
// 			removeChestId(id);
// 			looted++;
// 		}

// 		if (looted > 0) {
// 			console.log(`Looted ${looted} chest(s)`);
// 		}
// 	} catch (err) {
// 		console.error('Looting error:', err);
// 	}
// }

// function lootInterval() {
// 	updateChestsInStorage();
// 	handleLooting();
// }
// setInterval(lootInterval, 250);

// --------------------------------------------------------------------------------------------------------------------------------- //
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function clear_inventory() {
	const loot_mule = get_player('Riff');
	if (!loot_mule) return;

	const dist = distance(character, loot_mule);
	
	if (dist < 250 && character.gold > 5000000) {
			send_gold(loot_mule, character.gold - 5000000);
	}

	const items_to_exclude = ['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'pumpkinspice', 'xptome', 'tracker', 'jacko', 'orbg', 'talkingskull', 'cupid', 'computer'];

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
	const required = 'pumpkinspice';
	const current_elixir = character.slots.elixir?.name;

	if (current_elixir !== required) {
		const slot = locate_item(required);
		if (slot !== -1) use(slot);
	}
}

let panicking = false;
let last_panic_time = 0;
let last_safe_time = 0;

async function panic_check() {

	let LOW_HEALTH = 0;
	let LOW_MANA = 0;
	let HIGH_HEALTH = 0;
	let HIGH_MANA = 0;
	let MONSTERS_TARGETING_ME = 0;
	const PANIC_AGGRO_THRESHOLD = 1;
	const PANIC_COOLDOWN = 1000;

	// --- Panic/Safe Conditions ---
	LOW_HEALTH = character.hp < character.max_hp * 0.50;
	LOW_MANA = character.mp < character.max_mp * 0.01;
	HIGH_HEALTH = character.hp >= character.max_hp * 0.80;
	HIGH_MANA = character.mp >= character.max_mp * 0.33;

	const panic_slot = character.items.findIndex(i => i?.name === 'jacko');

	// Aggro check: monsters targeting me
	MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
		e => e.type === "monster" && e.target === character.name && !e.dead
	).length;

	// PANIC CONDITION
	if (LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= PANIC_AGGRO_THRESHOLD) {
		if (!panicking) {
			panicking = true;
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

// party_maker() — replaced by shared party_manager() from Common Functions.js
// function party_maker() {
// 	if (!CONFIG.party.auto_manage) return;
// 	const group = CONFIG.party.group_members;
// 	const leader_name = group[0];
// 	const party = get_party() || {};
// 	const party_lead = get_entity(leader_name);
// 	if (character.name === leader_name) {
// 		for (let i = 1; i < group.length; i++) {
// 			const name = group[i];
// 			if (name === character.name) continue;
// 			if (party[name]) continue;
// 			send_party_invite(name);
// 		}
// 	} else {
// 		if (!party[character.name] && party_lead) {
// 			send_party_request(leader_name);
// 		}
// 	}
// }

// suicide, setInterval(suicide, 50), sleep → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER STARTER
// --------------------------------------------------------------------------------------------------------------------------------- //

// function team_starter() {
// 	if (!CONFIG.character_starter.enabled) return;

// 	const active_characters = get_active_characters();

// 	for (const [key, char] of Object.entries(CONFIG.character_starter.characters)) {
// 		if (!active_characters[char.name]) {
// 			start_character(char.name, char.code_slot);
// 		}
// 	}
// }
// setInterval(team_starter, 5000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOCATION BROADCASTER
// --------------------------------------------------------------------------------------------------------------------------------- //

async function send_location_update() {
	if (!CONFIG.location_broadcast.enabled) return;

	try {
		const needs_update = !character.s.mluck || character.s.mluck.f !== CONFIG.location_broadcast.target_player;
		const null_count = character.items.filter(item => item === null).length;

		if (needs_update || null_count <= CONFIG.location_broadcast.low_inventory_slots) {
			send_cm(CONFIG.location_broadcast.target_player, {
				message: 'location',
				x: character.x,
				y: character.y,
				map: character.map
			});
		}
	} catch (error) {
		console.error('Failed to send location update:', error);
	}
}
setInterval(send_location_update, CONFIG.location_broadcast.check_interval);

// --------------------------------------------------------------------------------------------------------------------------------- //
// SELLING
// --------------------------------------------------------------------------------------------------------------------------------- //

function sell_items() {
	if (!CONFIG.selling.enabled) return;

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;

		if (CONFIG.selling.whitelist.includes(item.name)) {
			if (item.p === undefined && item.l !== 'l') {
				sell(i);
			}
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADING
// --------------------------------------------------------------------------------------------------------------------------------- //

async function upgrade_items() {
	if (!CONFIG.upgrading.enabled) return;

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.p || !CONFIG.upgrading.whitelist[item.name]) continue;

		const config = CONFIG.upgrading.whitelist[item.name];
		if (item.level >= config.targetLevel) continue;

		const grades = G.items[item.name].grades;
		let scrollname;

		if (item.level < grades[0]) scrollname = 'scroll0';
		else if (item.level < grades[1]) scrollname = 'scroll1';
		else scrollname = 'scroll2';

		const scrollSlot = locate_item(scrollname);
		if (scrollSlot === -1) {
			buy(scrollname);
			return;
		}

		let offeringSlot = null;
		if (item.level >= config.prim) {
			offeringSlot = locate_item('offering');
		} else if (item.level >= config.primling) {
			offeringSlot = locate_item('offeringp');
		}

		if (character.q.upgrade === undefined) {
			try {
				await upgrade(i, scrollSlot, offeringSlot);
			} catch (e) {
				console.error('Upgrade failed:', e);
			}
		}
		return;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBINING
// --------------------------------------------------------------------------------------------------------------------------------- //

async function combine_items() {
	if (!CONFIG.combining.enabled) return;

	const toCompound = new Map();

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || !CONFIG.combining.whitelist[item.name]) continue;

		const config = CONFIG.combining.whitelist[item.name];
		if (item.level >= config.targetLevel) continue;

		const key = item.name + item.level;
		const grade = item_grade(item);

		if (!toCompound.has(key)) {
			toCompound.set(key, [item.level, grade, i]);
		} else {
			toCompound.get(key).push(i);
		}
	}

	for (const group of toCompound.values()) {
		const itemLevel = group[0];
		const grade = group[1];
		const scrollName = 'cscroll' + grade;

		for (let i = 2; i + 2 < group.length; i += 3) {
			const scrollSlot = locate_item(scrollName);
			if (scrollSlot === -1) {
				buy(scrollName);
				return;
			}

			const item = character.items[group[i]];
			const config = CONFIG.combining.whitelist[item.name];

			let offeringSlot = null;
			if (itemLevel >= config.prim) {
				offeringSlot = locate_item('offering');
			} else if (itemLevel >= config.primling) {
				offeringSlot = locate_item('offeringp');
			}

			if (character.q.compound === undefined) {
				try {
					await compound(group[i], group[i + 1], group[i + 2], scrollSlot, offeringSlot);
				} catch (e) {
					console.error('Compound failed:', e);
				}
			}
			return;
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UI FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// function pingButton() {
// 	add_top_button('Ping', character.ping.toFixed(0));
// }
// setInterval(pingButton, 1000);

// function topButtons() {
// 	add_top_button('Return', 'R&M', () => {
// 		send_cm(['CrownPriest', 'CrownMage', 'CrownTown'], {
// 			message: 'location',
// 			x: character.x,
// 			y: character.y,
// 			map: character.map
// 		});
// 	});

// 	add_top_button('showLoot', '💼', displayLoot);

// 	add_top_button('Pause2', '⏸️', () => {
// 		pause();
// 		CONFIG.characterStarter.enabled = true
// 	});

// 	add_top_button('Stop', '🔄', () => {
// 		stop_character('CrownMerch');
// 		CONFIG.characterStarter.enabled = false
// 	});
// }
// topButtons();

// function displayLoot() {
// 	const savedLoot = JSON.parse(localStorage.getItem(CONFIG.looting.lootMonth) || '{}');

// 	const sortedLoot = {};
// 	Object.keys(savedLoot)
// 		.sort()
// 		.forEach((key) => {
// 			sortedLoot[key] = savedLoot[key];
// 		});

// 	console.log('Saved Loot (Sorted):', sortedLoot);
// 	show_json(sortedLoot);
// }

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

// get_nearest_monster_v2, ms_to_next_skill, batch_equip → Common Functions.js

const is_set_equipped = name =>
	equipment_sets[name]?.every(({ item_name, slot, level }) =>
		character.slots[slot]?.name === item_name && character.slots[slot]?.level === level
	) ?? false;

// const equip_set = name => equipment_sets[name] && batch_equip(equipment_sets[name]);

async function equip_set(set_name) {
	const set = equipment_sets[set_name];
	if (set) {
		batch_equip(set);
	}
}

// ============================================================================
// SKIN CHANGER
// ============================================================================

// const skinConfigs = {
// 	ranger: {
// 		skin: 'tm_yellow',
// 		skinRing: { name: 'tristone', level: 2, locked: 'l' },
// 		normalRing: { name: 'suckerpunch', level: 2, locked: 'l' }
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
// 		state.skinReady = true;
// 		return;
// 	}

// 	if (character.skin !== config.skin) {
// 		console.log(`Applying skinRing: ${config.skinRing.name} lvl ${config.skinRing.level}`);
// 		skinNeeded(config.skinRing.name, config.skinRing.level, 'ring1', config.skinRing.locked);
// 		await delay(500);
// 		return skinChanger();
// 	}

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

function sendUpdates() {
	parent.socket.emit('send_updates', {});
}
setInterval(sendUpdates, 20000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
skill_loop();
equipment_loop();
maintenance_loop();
potion_loop();
if (RANGER_TARGET === 'bscorpion') prim_farm_loop();
