
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const home = 'dryad';
const mob_map = 'mforest';
const all_bosses = ['grinch', 'icegolem', 'dragold', 'mrgreen', 'mrpumpkin', 'greenjr', 'jr', 'franky', 'rgoo', 'bgoo', 'crabxx'];

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
		clump_radius: 20
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONSTANTS
// --------------------------------------------------------------------------------------------------------------------------------- //

const TICK_RATE = {
	main: 100,
	action: 1,
	equipment: 25,
	maintenance: 2000
};

const COOLDOWNS = { cc: 135 };

const EVENT_LOCATIONS = [
	{ name: 'mrpumpkin', map: 'halloween', x: -217, y: 720 },
	{ name: 'mrgreen', map: 'spookytown', x: 605, y: 1000 },
	{ name: 'dragold', map: 'cave', x: 873, y: -727 },
];

const CACHE_TTL = 50;

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

const locations = {
	bat: [{ x: 1200, y: -782 }],
	bigbird: [{ x: 1304, y: -69 }],
	bscorpion: [{ x: -408, y: -1141 }],
	boar: [{ x: 19, y: -1109 }],
	cgoo: [{ x: -221, y: -274 }],
	crab: [{ x: -11840, y: -37 }],
	dryad: [{ x: 403, y: -347 }],
	ent: [{ x: -420, y: -1960 }],
	fireroamer: [{ x: 222, y: -827 }],
	ghost: [{ x: -405, y: -1642 }],
	gscorpion: [{ x: 390, y: -1422 }],
	iceroamer: [{ x: 823, y: -45 }],
	mechagnome: [{ x: 0, y: 0 }],
	mole: [{ x: 14, y: -1072 }],
	mummy: [{ x: 256, y: -1417 }],
	odino: [{ x: -52, y: 756 }],
	oneeye: [{ x: -255, y: 176 }],
	pinkgoblin: [{ x: 485, y: 157 }],
	poisio: [{ x: -121, y: 1360 }],
	prat: [{ x: 11, y: 84 }],
	pppompom: [{ x: 292, y: -189 }],
	plantoid: [{ x: -780, y: -387 }],
	rat: [{ x: 6, y: 430 }],
	scorpion: [{ x: -495, y: 685 }],
	stoneworm: [{ x: 830, y: 7 }],
	spider: [{ x: 895, y: -145 }],
	squig: [{ x: -1175, y: 422 }],
	targetron: [{ x: -544, y: -275 }],
	wolf: [{ x: 433, y: -2745 }],
	wolfie: [{ x: 113, y: -2014 }],
	xscorpion: [{ x: -495, y: 685 }]
};

const destination = {
	map: mob_map,
	x: locations[home][0].x,
	y: locations[home][0].y
};

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

	// 2. Bosses: only if they already have a target
	if (CONFIG.combat.attack_if_targeted.includes(mob.mtype)) {
		return mob.target !== null && mob.target !== undefined;
	}

	// 3. Always attack whitelist (e.g., crabx)
	if (CONFIG.combat.always_attack.includes(mob.mtype)) return true;

	// 4. Default: attack if targeting party members
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
	const threshold = (!healer || healer.rip) ? 0.9 : 0.4;
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
	let delay = 5;
	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();
		const ms = ms_to_next_skill('attack');

		if (ms === 0) {
			/*if (cache.heal_target) {
				equip_set('heal');
				await attack(cache.heal_target);
			} else */await handle_attack();
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
		equip_set('boom');
		await use_skill('5shot', clumped.slice(0, 5).map(e => e.id));
	} else if (can_5shot && in_range.length >= min5) {
		equip_set('boom');
		await use_skill('5shot', in_range.slice(0, 5).map(e => e.id));
	} else if (can_5shot && out_of_range.length >= min5) {
		equip_set('boom');
		await use_skill('5shot', out_of_range.slice(0, 5).map(e => e.id));
	} else if (can_3shot && sorted_by_hp.length >= min3) {
		equip_set('boom');
		await use_skill('3shot', sorted_by_hp.slice(0, 3).map(e => e.id));
	} else if (can_1shot && sorted_by_hp.length >= 1 && is_in_range(sorted_by_hp[0])) {
		equip_set('single');
		await attack(sorted_by_hp[0]);
	}
};

const skill_loop = async () => {
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
		if (CONFIG.party.auto_manage) party_maker();
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potion_loop() {
	let delay = 100;

	try {
		const hp_threshold = character.max_hp - CONFIG.potions.hp_threshold;
		const mp_threshold = character.max_mp - CONFIG.potions.mp_threshold;

		if (character.mp < mp_threshold) {
			use_skill('use_mp');
			reduce_cooldown('use_mp', character.ping * 0.95);
			delay = ms_to_next_skill('use_mp');
		} else if (character.hp < hp_threshold) {
			use_skill('use_hp');
			reduce_cooldown('use_hp', character.ping * 0.95);
			delay = ms_to_next_skill('use_hp');
		}
	} catch (e) {
		console.error('potion_loop error:', e);
	}

    setTimeout(potion_loop, delay || 2010);
}

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

		scare();

	} catch (e) {
		console.error('equipment_loop error:', e);
	}

	setTimeout(equipment_loop, delay);
}

function find_booster_slot() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && ['xpbooster', 'goldbooster', 'luckbooster'].includes(item.name)) {
			return i;
		}
	}
	return null;
}

function get_num_chests() {
	return Object.keys(get_chests()).length;
}

function get_num_targets(player_name) {
	if (!player_name) return 0;
	let targetCount = 0;

	for (const id in parent.entities) {
		const entity = parent.entities[id];
		if (entity.type === 'monster' && entity.target === player_name) {
			target_count++;
		}
	}

	return target_count;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_handle_events() {
	const holiday_spirit = parent?.S?.holidayseason && !character?.s?.holidayspirit;
	const has_handleable_event = EVENT_LOCATIONS.some(e => parent?.S?.[e.name]?.live);
	return holiday_spirit || has_handleable_event;
}

function handle_events() {
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit) {
		if (!smart.moving) {
			smart_move({ to: 'town' }, () => {
				parent.socket.emit('interaction', { type: 'newyear_tree' });
			});
		}
		return;
	}

	const alive_sorted = EVENT_LOCATIONS
		.map(e => ({ ...e, data: parent.S[e.name] }))
		.filter(e => e.data?.live)
		.sort((a, b) =>
			(a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp)
		);

	if (!alive_sorted.length) return;

	const target = alive_sorted[0];

	if (target.join === true && character.map !== target.map) {
		parent.socket.emit('join', { name: target.name });
		return;
	}

	if (!smart.moving) {
		handle_specific_event(target.name, target.map, target.x, target.y);
	}
}

async function handle_specific_event(eventType, mapName, x, y) {
	if (!parent?.S?.[eventType]?.live) return;

	const monster = get_nearest_monster({ type: eventType });
	if (!monster) {
		smart_move({ x, y, map: mapName });
		return;
	}

	const halfway_x = character.x + (monster.x - character.x) / 2;
	const halfway_y = character.y + (monster.y - character.y) / 2;

	if (!is_in_range(monster, 'attack') && !smart.moving) {
		await xmove(halfway_x, halfway_y);
	}
}

function handle_return_home() {
	if (!smart.moving) {
		smart_move(destination);
	}
}

async function walk_in_circle() {
	if (smart.moving || character.moving) return;

	const { x: center_x, y: center_y } = locations[home][0];
	const now = performance.now();
	const delta = (now - state.last_angle_update) / 1000;

	state.angle = (state.angle + CONFIG.movement.circle_speed * delta) % (2 * Math.PI);
	state.last_angle_update = now;

	const target_x = center_x + Math.cos(state.angle) * CONFIG.movement.circle_radius;
	const target_y = center_y + Math.sin(state.angle) * CONFIG.movement.circle_radius;

	const dist_to_target = Math.hypot(character.x - target_x, character.y - target_y);
	if (dist_to_target > CONFIG.movement.move_threshold) {
		await xmove(target_x, target_y);
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

const clear_inventory = () => {
	const mule = get_player('Riff');
	if (!mule) return;

	if (character.gold > 51000000) send_gold(mule, character.gold - 50000000);

	const exclude = new Set(['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'pumpkinspice', 'xptome', 'tracker', 'jacko']);

	character.items.forEach((item, i) => {
		if (item && !exclude.has(item.name) && !item.l && !item.s && is_in_range(mule, 'attack'))
			send_item(mule.id, i, item.q ?? 1);
	});
};

const inventory_sorter = () => {
	const slots = { tracktrix: 0, ancientcomputer: 1, hpot1: 2, mpot1: 3, xptome: 4, pumpkinspice: 5, xpbooster: 6 };
	character.items.forEach((item, i) => {
		const target = slots[item?.name];
		if (target !== undefined && i !== target) swap(i, target);
	});
};

function auto_buy_potions() {
	if (quantity('hpot1') < CONFIG.potions.min_stock) buy('hpot1', CONFIG.potions.min_stock);
	if (quantity('mpot1') < CONFIG.potions.min_stock) buy('mpot1', CONFIG.potions.min_stock);
	if (quantity('xptome') < 1) buy('xptome', 1);
}

function elixir_usage() {
	const required = 'pumpkinspice';
	const current_elixir = character.slots.elixir?.name;

	if (current_elixir !== required) {
		const slot = locate_item(required);
		if (slot !== -1) use(slot);
	}
}

let target_start_times = {};

const scare = () => {
	const slot = character.items.findIndex(i => i?.name === 'jacko');
	const now = performance.now();
	let should_scare = false;

	for (const id in parent.entities) {
		const e = parent.entities[id];

		if (e.type === 'monster' && e.target === character.name && e.mtype !== 'grinch') {
			if (target_start_times[id] == null) target_start_times[id] = now;
			if (now - target_start_times[id] > 250) should_scare = true;
		} else {
			delete target_start_times[id];
		}
	}

	if (should_scare && !is_on_cooldown('scare') && slot !== -1) {
		equip(slot);
		use('scare');
		equip(slot);
	}

	// const paused = parent?.paused;
	// if (character?.afk && !paused) { pause(); parent.no_graphics = true; }
	// else if (!character?.afk && paused) { pause(); parent.no_graphics = false; }
};

function party_maker() {
	if (!CONFIG.party.auto_manage) return;

	const group = CONFIG.party.group_members;
	const leader_name = group[0];
	const party = get_party() || {};
	const party_lead = get_entity(leader_name);

	if (character.name === leader_name) {
		for (let i = 1; i < group.length; i++) {
			const name = group[i];
			if (name === character.name) continue;
			if (party[name]) continue;

			send_party_invite(name);
		}
	} else {
		if (!party[character.name] && party_lead) {
			send_party_request(leader_name);
		}
	}
}

function suicide() {
	if (!character.rip && character.hp < 2000) {
		parent.socket.emit('harakiri');
		game_log('Harakiri');
	}

	if (character.rip) {
		respawn();
	}
}
setInterval(suicide, 50);

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

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
// ESSENTIAL HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function get_nearest_monster_v2(args = {}) {
	let min_d = 999999;
	let target = null;
	let optimal_hp = args.check_max_hp ? 0 : 999999999;

	for (let id in parent.entities) {
		let current = parent.entities[id];
		if (current.type !== 'monster' || !current.visible || current.dead) continue;

		if (args.type) {
			if (Array.isArray(args.type)) {
				if (!args.type.includes(current.mtype)) continue;
			} else {
				if (current.mtype !== args.type) continue;
			}
		}

		if (args.min_level !== undefined && current.level < args.min_level) continue;
		if (args.max_level !== undefined && current.level > args.max_level) continue;
		if (args.target && !args.target.includes(current.target)) continue;
		if (args.no_target && current.target && current.target !== character.name) continue;

		if (args.statusEffects && !args.statusEffects.every(effect => current.s[effect])) continue;

		if (args.min_xp !== undefined && current.xp < args.min_xp) continue;
		if (args.max_xp !== undefined && current.xp > args.max_xp) continue;

		if (args.max_att !== undefined && current.attack > args.max_att) continue;

		if (args.path_check && !can_move_to(current)) continue;

		let c_dist = args.point_for_distance_check
			? Math.hypot(args.point_for_distance_check[0] - current.x, args.point_for_distance_check[1] - current.y)
			: parent.distance(character, current);

		if (args.max_distance !== undefined && c_dist > args.max_distance) continue;

		if (args.check_min_hp || args.check_max_hp) {
			let c_hp = current.hp;
			if ((args.check_min_hp && c_hp < optimal_hp) || (args.check_max_hp && c_hp > optimal_hp)) {
				optimal_hp = c_hp;
				target = current;
			}
			continue;
		}

		if (c_dist < min_d) {
			min_d = c_dist;
			target = current;
		}
	}

	return target;
}

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill];
	if (next_skill === undefined) return 0;
	const ping = parent.pings?.length ? Math.min(...parent.pings) : 0;
	const ms = next_skill.getTime() - Date.now() - ping;
	return ms < 0 ? 0 : ms;
}

const batch_equip = async data => {
	if (!Array.isArray(data) || data.length > 15) return;

	const valid = data.reduce((acc, { item_name, slot, level, l }) => {
		if (!item_name) return acc;

		const current = character.slots[slot];
		if (current?.name === item_name && current.level === level && current.l === l) return acc;

		const i = character.items.findIndex(item =>
			item?.name === item_name && item.level === level && item.l === l
		);
		if (i !== -1) acc.push({ num: i, slot });
		return acc;
	}, []);

	if (!valid.length) return;

	try {
		parent.socket.emit('equip_batch', valid);
		await parent.push_deferred('equip_batch');
	} catch (e) {
		console.error('batch_equip:', e);
	}
};

const is_set_equipped = name =>
	equipment_sets[name]?.every(({ item_name, slot, level }) =>
		character.slots[slot]?.name === item_name && character.slots[slot]?.level === level
	) ?? false;

// const equip_set = name => equipment_sets[name] && batch_equip(equipment_sets[name]);

function equip_set(set_name) {
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
// 		await sleep(500);
// 		return skinChanger();
// 	}

// 	const slot = character.slots.ring1;
// 	if (slot?.name !== config.normalRing.name || slot?.level !== config.normalRing.level) {
// 		console.log(`Equipping normalRing: ${config.normalRing.name} lvl ${config.normalRing.level}`);
// 		equipIfNeeded(config.normalRing.name, 'ring1', config.normalRing.level, config.normalRing.locked);
// 		await sleep(500);
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

// --------------------------------------------------------------------------------------------------------- //

// // ============================================================================
// // UI Stuff
// // ============================================================================
// function updateMonsterButton() {
// 	let totalMonsters = 0;
// 	let poisonedMonsters = 0;

// 	for (const id in parent.entities) {
// 		const entity = parent.entities[id];
// 		if (entity.type === "monster" && (entity.target === "CrownPriest" || entity.target === "CrownPal")) {
// 			totalMonsters++;
// 			if (entity.s && entity.s.poisoned) {
// 				poisonedMonsters++;
// 			}
// 		}
// 	}

// 	add_top_button("mon_status", `${totalMonsters} | ${poisonedMonsters} poisoned`);
// }

// // Call this function periodically to update the button
// //setInterval(updateMonsterButton, 250);

// // ============= CONFIGURATION =============
// const DISCORD_WEBHOOK_URL = "DISCORD WEBHOOK URL HERE";
// const MENTION_USER_ID = "*********************";  // Set to null or "" to disable pings
// const BOT_USERNAME = "Lootbot";
// const OUTPUT_SIZE = 50; // Scale image size
// // =========================================

// const rareItems = {
// 	"suckerpunch": { name: "Sucker Punch" },
// 	"ringofluck": { name: "Ring of Luck" },
// 	"mpxbelt": { name: "Mana Belt" },
// 	"amuletofm": { name: "Amulet of Mystery" },
// 	"goldring": { name: "Gold Ring" },
// 	"ukey": { name: "Underground Key" },
// 	"goldenpowerglove": { name: "Golden Power Glove" },
// 	"goldbooster": { name: "Gold Booster" },
// 	"fallen": { name: "Pants of the Fallen Master" },
// 	'bkey': { name: "Bank Key" },
// 	'networkcard': { name: "Network Card" },
// 	'glitch': { name: "Glitch" },
// 	//'electronics': { name: "Electronics"},
// 	//'stramulet': { name: "Strength Amulet" },
// };

// async function sendRareLootToDiscord(itemID, quantity, itemData, mentionUserID, looterName) {
// 	const article = getArticle(itemData.name);

// 	try {
// 		const imageDataURL = await generateItemImage(itemID);

// 		const base64Data = imageDataURL.split(',')[1];
// 		const byteCharacters = atob(base64Data);
// 		const byteNumbers = new Array(byteCharacters.length);
// 		for (let i = 0; i < byteCharacters.length; i++) {
// 			byteNumbers[i] = byteCharacters.charCodeAt(i);
// 		}
// 		const byteArray = new Uint8Array(byteNumbers);
// 		const blob = new Blob([byteArray], { type: 'image/png' });

// 		const formData = new FormData();
// 		formData.append('file', blob, `${itemID}.png`);

// 		let messageContent = `${looterName} found ${article} **${itemData.name}**!`;
// 		if (mentionUserID) {
// 			messageContent += ` <@${mentionUserID}>`;
// 		}

// 		const payload = {
// 			...(mentionUserID && { content: messageContent }),
// 			username: BOT_USERNAME,
// 			embeds: [{
// 				description: `${looterName} found ${quantity > 1 ? `${quantity}x ` : ''}${article} **${itemData.name}**!`,
// 				thumbnail: {
// 					url: `attachment://${itemID}.png`
// 				},
// 				color: 0xFFD700,
// 				timestamp: new Date().toISOString()
// 			}]
// 		};

// 		formData.append('payload_json', JSON.stringify(payload));

// 		const response = await fetch(DISCORD_WEBHOOK_URL, {
// 			method: 'POST',
// 			body: formData
// 		});

// 		const responseData = await response.json();

// 		if (!response.ok) {
// 			console.error('Discord error:', responseData);
// 		} else {
// 			console.log(`Discord message sent: ${itemData.name}`);
// 		}
// 	} catch (error) {
// 		console.error('Error sending to Discord:', error);
// 	}
// }

// const TILE_SIZE = 20;

// function generateItemImage(itemID) {
// 	return new Promise(async (resolve, reject) => {
// 		const coords = G.positions[itemID];
// 		if (!coords) {
// 			reject(`No sprite data for ${itemID}`);
// 			return;
// 		}

// 		console.log(`Found coords for ${itemID}:`, coords);

// 		const [sheetName, col, row] = coords;

// 		const actualSheetName = sheetName === "" ? "pack_20vt8" : sheetName;
// 		const sheetURL = `https://raw.githubusercontent.com/kaansoral/adventureland/main/images/tiles/items/${actualSheetName}.png`;

// 		console.log(`Fetching sprite sheet: ${sheetURL}`);

// 		try {
// 			const response = await fetch(sheetURL, { mode: 'cors' });

// 			if (!response.ok) {
// 				reject(`Failed to fetch: ${response.status}`);
// 				return;
// 			}

// 			const blob = await response.blob();
// 			console.log(`Fetched blob size: ${blob.size}`);

// 			const objectURL = URL.createObjectURL(blob);

// 			const canvas = document.createElement('canvas');
// 			const ctx = canvas.getContext('2d');
// 			canvas.width = OUTPUT_SIZE;
// 			canvas.height = OUTPUT_SIZE;

// 			const img = new Image();

// 			img.onload = () => {
// 				console.log(`Drawing at col:${col}, row:${row}`);

// 				ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

// 				ctx.imageSmoothingEnabled = false;
// 				ctx.mozImageSmoothingEnabled = false;
// 				ctx.webkitImageSmoothingEnabled = false;
// 				ctx.msImageSmoothingEnabled = false;

// 				ctx.drawImage(
// 					img,
// 					col * TILE_SIZE,
// 					row * TILE_SIZE,
// 					TILE_SIZE,
// 					TILE_SIZE,
// 					0,
// 					0,
// 					OUTPUT_SIZE,
// 					OUTPUT_SIZE
// 				);

// 				URL.revokeObjectURL(objectURL);

// 				const dataURL = canvas.toDataURL('image/png');
// 				console.log(`Generated image, length: ${dataURL.length}`);
// 				resolve(dataURL);
// 			};

// 			img.onerror = (error) => {
// 				URL.revokeObjectURL(objectURL);
// 				reject(`Image load error: ${error}`);
// 			};

// 			img.src = objectURL;

// 		} catch (error) {
// 			reject(`Fetch error: ${error}`);
// 		}
// 	});
// }

// function getArticle(itemName) {
// 	const vowels = ['A', 'E', 'I', 'O', 'U'];
// 	return vowels.includes(itemName[0].toUpperCase()) ? "an" : "a";
// }

// /**
//  * Enhanced game log with filtering and timestamps
//  * Creates a tabbed filter UI above the game log to show/hide different message types
//  */
// (function () {
// 	const FILTERS = {
// 		kills: { show: false, regex: /killed/, label: 'Kills' },
// 		gold: { show: true, regex: /gold/, label: 'Gold' },
// 		party: { show: true, regex: /party/, label: 'Party' },
// 		items: { show: true, regex: /found/, label: 'Items' },
// 		upgrade: { show: true, regex: /(upgrade|combination)/, label: 'Upgr.' },
// 		errors: { show: true, regex: /(error|line|column)/i, label: 'Errors' }
// 	};

// 	const COLORS = {
// 		active: ['#151342', '#1D1A5C'],
// 		inactive: ['#222', '#333'],
// 		activeText: '#FFF',
// 		inactiveText: '#999'
// 	};

// 	const TRUNCATE_AT = 1000;
// 	const TRUNCATE_TO = 720;

// 	function padZero(num, length = 2) {
// 		return num.toString().padStart(length, '0');
// 	}

// 	function getTimestamp() {
// 		const now = new Date();
// 		return `${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}`;
// 	}

// 	function createFilterBar() {
// 		const existingBar = parent.document.getElementById('gamelog-tab-bar');
// 		if (existingBar) existingBar.remove();

// 		const bar = parent.document.createElement('div');
// 		bar.id = 'gamelog-tab-bar';
// 		bar.className = 'enableclicks';
// 		Object.assign(bar.style, {
// 			border: '5px solid gray',
// 			height: '24px',
// 			background: 'black',
// 			margin: '-5px 0',
// 			display: 'flex',
// 			fontSize: '20px',
// 			fontFamily: 'pixel'
// 		});

// 		Object.entries(FILTERS).forEach(([key, filter], index) => {
// 			const tab = parent.document.createElement('div');
// 			tab.id = `gamelog-tab-${key}`;
// 			tab.className = 'gamelog-tab enableclicks';
// 			tab.textContent = filter.label;

// 			const colors = filter.show ? COLORS.active : COLORS.inactive;
// 			const textColor = filter.show ? COLORS.activeText : COLORS.inactiveText;

// 			Object.assign(tab.style, {
// 				height: '100%',
// 				width: `${100 / Object.keys(FILTERS).length}%`,
// 				textAlign: 'center',
// 				lineHeight: '24px',
// 				cursor: 'default',
// 				background: colors[index % 2],
// 				color: textColor
// 			});

// 			tab.addEventListener('click', () => toggleFilter(key));
// 			bar.appendChild(tab);
// 		});

// 		const gamelog = parent.document.getElementById('gamelog');
// 		gamelog.parentElement.insertBefore(bar, gamelog);
// 	}

// 	function toggleFilter(key) {
// 		FILTERS[key].show = !FILTERS[key].show;

// 		const tab = parent.document.getElementById(`gamelog-tab-${key}`);
// 		const index = Array.from(tab.parentElement.children).indexOf(tab);
// 		const colors = FILTERS[key].show ? COLORS.active : COLORS.inactive;
// 		const textColor = FILTERS[key].show ? COLORS.activeText : COLORS.inactiveText;

// 		tab.style.background = colors[index % 2];
// 		tab.style.color = textColor;

// 		filterGamelog();
// 		scrollGamelogToBottom();
// 	}

// 	function filterGamelog() {
// 		const entries = parent.document.querySelectorAll('.gameentry');
// 		entries.forEach(entry => {
// 			let shouldShow = true;
// 			for (const filter of Object.values(FILTERS)) {
// 				if (filter.regex.test(entry.innerHTML)) {
// 					shouldShow = filter.show;
// 					break;
// 				}
// 			}
// 			entry.style.display = shouldShow ? 'block' : 'none';
// 		});
// 	}

// 	function scrollGamelogToBottom() {
// 		const gamelog = parent.document.getElementById('gamelog');
// 		gamelog.scrollTop = gamelog.scrollHeight;
// 	}

// 	function addLogEntry(message, color = 'white') {
// 		if (parent.mode?.dom_tests || parent.inside === 'payments') return;

// 		const gamelog = parent.document.getElementById('gamelog');

// 		if (parent.game_logs.length > TRUNCATE_AT) {
// 			parent.game_logs = parent.game_logs.slice(-TRUNCATE_TO);

// 			const truncateMsg = "<div class='gameentry' style='color: gray'>- Truncated -</div>";
// 			const entries = parent.game_logs.map(([msg, clr]) =>
// 				`<div class='gameentry' style='color: ${clr || 'white'}'>${msg}</div>`
// 			).join('');

// 			gamelog.innerHTML = truncateMsg + entries;
// 		}

// 		parent.game_logs.push([message, color]);

// 		let display = 'block';
// 		for (const filter of Object.values(FILTERS)) {
// 			if (filter.regex.test(message)) {
// 				display = filter.show ? 'block' : 'none';
// 				break;
// 			}
// 		}

// 		const entry = parent.document.createElement('div');
// 		entry.className = 'gameentry';
// 		entry.style.color = color;
// 		entry.style.display = display;
// 		entry.innerHTML = message;

// 		gamelog.appendChild(entry);
// 		scrollGamelogToBottom();
// 	}

// 	function initTimestamps() {
// 		if (parent.socket.hasListeners('game_log')) {
// 			parent.socket.removeListener('game_log');
// 		}

// 		parent.socket.on('game_log', data => {
// 			parent.draw_trigger(() => {
// 				const timestamp = getTimestamp();

// 				if (typeof data === 'string') {
// 					addLogEntry(`${timestamp} | ${data}`, 'gray');
// 				} else {
// 					if (data.sound) sfx(data.sound);
// 					addLogEntry(`${timestamp} | ${data.message}`, data.color);
// 				}
// 			});
// 		});
// 	}

// 	createFilterBar();
// 	filterGamelog();
// 	initTimestamps();
// })();
// ///////////////////////////////////////////
// function toggleMeter(meterId) {
// 	let $ = parent.$;
// 	let meter = $(`#${meterId}`);

// 	if (meter.length) {
// 		meter.toggle();
// 	}
// }

// function openDPSConfig() {
// 	let $ = parent.$;

// 	$('#dpsConfigPopup').remove();

// 	const allDamageTypes = ["Base", "Blast", "Burn", "HPS", "MPS", "DR", "RF", "DPS", "Dmg Taken"];

// 	let configPopup = $('<div id="dpsConfigPopup"></div>').css({
// 		position: 'absolute',
// 		top: '50%',
// 		left: '50%',
// 		transform: 'translate(-50%, -50%)',
// 		backgroundColor: 'rgba(0, 0, 0, 0.9)',
// 		color: 'white',
// 		padding: '15px',
// 		border: '2px solid gray',
// 		borderRadius: '10px',
// 		zIndex: 10000,
// 		width: '350px',
// 		textAlign: 'center'
// 	});

// 	configPopup.append('<h3>DPS Meter Configuration</h3>');
// 	configPopup.append('<p style="font-size: 12px; margin: 5px 0;">Select which stats to display:</p>');

// 	allDamageTypes.forEach(type => {
// 		let checkboxDiv = $('<div></div>').css({
// 			textAlign: 'left',
// 			padding: '5px',
// 			margin: '5px 0'
// 		});

// 		let checkbox = $('<input type="checkbox">').attr('id', `dps_${type}`).css({
// 			marginRight: '10px'
// 		});

// 		if (damageTypes.includes(type)) {
// 			checkbox.prop('checked', true);
// 		}

// 		let label = $(`<label for="dps_${type}">${type}</label>`).css({
// 			cursor: 'pointer',
// 			fontSize: '16px'
// 		});

// 		checkboxDiv.append(checkbox);
// 		checkboxDiv.append(label);
// 		configPopup.append(checkboxDiv);
// 	});

// 	let applyButton = $('<button>Apply Changes</button>').css({
// 		margin: '10px 5px 5px 5px',
// 		padding: '10px 20px',
// 		backgroundColor: '#4CAF50',
// 		color: 'white',
// 		border: 'none',
// 		borderRadius: '5px',
// 		cursor: 'pointer'
// 	}).click(function () {
// 		damageTypes.length = 0;
// 		allDamageTypes.forEach(type => {
// 			if ($(`#dps_${type}`).is(':checked')) {
// 				damageTypes.push(type);
// 			}
// 		});

// 		updateDPSMeterUI();

// 		$('#dpsConfigPopup').remove();
// 	});

// 	let closeButton = $('<button>Cancel</button>').css({
// 		margin: '5px',
// 		padding: '10px 20px',
// 		backgroundColor: '#f44336',
// 		color: 'white',
// 		border: 'none',
// 		borderRadius: '5px',
// 		cursor: 'pointer'
// 	}).click(function () {
// 		$('#dpsConfigPopup').remove();
// 	});

// 	configPopup.append(applyButton);
// 	configPopup.append(closeButton);

// 	$('body').append(configPopup);
// }

// function createTogglePopup() {
// 	let $ = parent.$;

// 	$('#togglePopupWindow').remove();

// 	let togglePopup = $('<div id="togglePopupWindow"></div>').css({
// 		position: 'absolute',
// 		top: '50%',
// 		left: '50%',
// 		transform: 'translate(-50%, -50%)',
// 		backgroundColor: 'rgba(0, 0, 0, 0.8)',
// 		color: 'white',
// 		padding: '10px',
// 		border: '2px solid gray',
// 		borderRadius: '10px',
// 		zIndex: 9999,
// 		width: '300px',
// 		textAlign: 'center'
// 	});

// 	togglePopup.append('<h3>UI Addon Toggles</h3>');

// 	let scoopToggleBtn = $('<button>Toggle SCOOP Meter</button>').css({
// 		margin: '5px',
// 		padding: '10px'
// 	}).click(function () {
// 		toggleMeter('scoopmeter');
// 	});

// 	let dpsToggleBtn = $('<button>Toggle DPS Meter</button>').css({
// 		margin: '5px',
// 		padding: '10px'
// 	}).click(function () {
// 		toggleMeter('dpsmeter');
// 	});

// 	let dpsConfigBtn = $('<button>Configure DPS Meter</button>').css({
// 		margin: '5px',
// 		padding: '10px',
// 		backgroundColor: '#4CAF50'
// 	}).click(function () {
// 		openDPSConfig();
// 	});

// 	let xpToggleBtn = $('<button>Toggle XP Meter</button>').css({
// 		margin: '5px',
// 		padding: '10px'
// 	}).click(function () {
// 		toggleMeter('xptimer');
// 	});

// 	let goldToggleBtn = $('<button>Toggle Gold Meter</button>').css({
// 		margin: '5px',
// 		padding: '10px'
// 	}).click(function () {
// 		toggleMeter('goldtimer');
// 	});

// 	let partyToggleBtn = $('<button>Toggle Party</button>').css({
// 		margin: '5px',
// 		padding: '10px'
// 	}).click(function () {
// 		toggleMeter('newparty');
// 	});

// 	togglePopup.append(scoopToggleBtn);
// 	togglePopup.append(dpsToggleBtn);
// 	togglePopup.append(dpsConfigBtn);
// 	togglePopup.append(xpToggleBtn);
// 	togglePopup.append(goldToggleBtn);
// 	togglePopup.append(partyToggleBtn);

// 	let closeButton = $('<button>Close</button>').css({
// 		margin: '5px',
// 		padding: '10px',
// 		backgroundColor: '#FF0000',
// 		color: 'white'
// 	}).click(function () {
// 		$('#togglePopupWindow').remove();
// 	});

// 	togglePopup.append(closeButton);
// 	$('body').append(togglePopup);
// }
// ///////////////////////////////////////////////
// function initXP() {
// 	let $ = parent.$;

// 	$('#xpui').css({
// 		fontSize: '28px',
// 		width: "100%",
// 		background: "transparent",
// 		color: "white",
// 	});

// 	$('.xpsui').css({
// 		background: "rgba(0, 0, 0, 0.7)"
// 	});

// 	$('#xpslider').css({
// 	});
// }

// function displayXP() {
// 	let $ = parent.$;
// 	let xpPercent = ((character.xp / parent.G.levels[character.level]) * 100).toFixed(2);
// 	let xpString = `LV${character.level} ${xpPercent}%`;
// 	$('#xpui').html(xpString);
// }

// initXP();
// //setInterval(displayXP, 1000);
// //////////////////////////////////////////////////
// let lastGoldCheck = character.gold;
// let totalGoldAcquired = 0;

// function trackGoldAcquisition() {
// 	let currentGold = character.gold;

// 	if (currentGold > lastGoldCheck) {
// 		let goldGained = currentGold - lastGoldCheck;
// 		totalGoldAcquired += goldGained;
// 	}

// 	lastGoldCheck = currentGold;

// 	set_message(totalGoldAcquired.toLocaleString(), "gold");
// }

// setInterval(trackGoldAcquisition, 1000);  // Check every second	
// //////////////////////////////////////////////////////////////////////////
// function initscoopMeter() {
// 	let $ = parent.$;
// 	let brc = $('#bottomrightcorner');

// 	brc.find('#scoopmeter').remove();

// 	let scoopmeter_container = $('<div id="scoopmeter"></div>').css({
// 		fontSize: '20px',
// 		color: 'white',
// 		textAlign: 'center',
// 		display: 'table',
// 		overflow: 'hidden',
// 		marginBottom: '-3px',
// 		width: "100%",
// 		backgroundColor: 'rgba(0, 0, 0, 0.7)',
// 	});

// 	let scoopmeter_content = $('<div id="scoopmetercontent"></div>').css({
// 		display: 'table-cell',
// 		verticalAlign: 'middle',
// 		backgroundColor: 'rgba(0, 0, 0, 0)',
// 		padding: '2px',
// 		border: '4px solid grey',
// 	}).appendTo(scoopmeter_container);

// 	brc.children().first().after(scoopmeter_container);
// }

// function updatescoopMeterUI() {
// 	try {
// 		let $ = parent.$;
// 		let scoopDisplay = $('#scoopmetercontent');

// 		if (scoopDisplay.length === 0) return;

// 		let entitiesWithscoop = [];

// 		if (character?.s?.coop?.p !== undefined) {
// 			entitiesWithscoop.push({
// 				name: character.name,
// 				scoop: character.s.coop.p,
// 				classType: character.ctype
// 			});
// 		}

// 		for (let id in parent.entities) {
// 			let entity = parent.entities[id];
// 			if (!entity.npc && entity.s && entity.s.coop && entity.s.coop.p !== undefined) {
// 				entitiesWithscoop.push({
// 					name: entity.name || entity.mtype,
// 					scoop: entity.s.coop.p,
// 					classType: entity.ctype
// 				});
// 			}
// 		}

// 		entitiesWithscoop.sort((a, b) => b.scoop - a.scoop);

// 		let highestscoop = entitiesWithscoop[0].scoop || 1;

// 		let listString = '<div>👑 Boss Contribution 👑</div>';
// 		listString += '<table border="1" style="width:100%;">';

// 		let maxRows = 6;
// 		let totalPlayers = entitiesWithscoop.length;
// 		let numColumns = Math.ceil(totalPlayers / maxRows);

// 		let columnWidth = (100 / numColumns).toFixed(2) + '%';

// 		for (let row = 0; row < maxRows; row++) {
// 			listString += '<tr>';
// 			for (let col = 0; col < numColumns; col++) {
// 				let index = row + col * maxRows;
// 				if (index >= totalPlayers) break;

// 				let entity = entitiesWithscoop[index];
// 				const playerClass = entity.classType.toLowerCase();
// 				const nameColor = classColors[playerClass] || '#FFFFFF';

// 				let entityScoop = Number(entity.scoop) || 0;
// 				let highestScoop = Number(highestscoop) || 1;
// 				let percentBarWidth = (entityScoop / highestScoop) * 100;
// 				percentBarWidth = Math.min(100, +percentBarWidth.toFixed(1));

// 				let progressBar = `<div style="width: 100%; background-color: gray; border-radius: 5px; overflow: hidden; position: relative;">
// 					<div style="width: ${percentBarWidth}%; background-color: ${nameColor}; height: 10px;"></div>
// 					<span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); margin-top: -1px; color: black; font-size: 16px; font-weight: bold;">
// ${getFormattedscoop(entity.scoop)}
// </span>
// 				</div>`;

// 				listString += `<td style="color: ${nameColor}; width: ${columnWidth};">${entity.name} ${progressBar}</td>`;
// 			}
// 			listString += '</tr>';
// 		}

// 		listString += '</table>';
// 		scoopDisplay.html(listString);

// 	} catch (error) {
// 		//console.error('Error updating scoop meter UI:', error);
// 	}
// }

// function getFormattedscoop(scoop) {
// 	try {
// 		let roundedscoop = Math.round(scoop); // Round to the nearest whole number
// 		return roundedscoop.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// 	} catch (error) {
// 		console.error('Formatting scoop error:', error);
// 		return 'N/A';
// 	}
// }

// initscoopMeter();
// setInterval(updatescoopMeterUI, 250);
// ////////////////////////////////////////////
// /**
//  * Modifies the game log window appearance with fixed width
//  * @returns {boolean} True if successful, false if gamelog not found
//  */
// function modifyGamelogAppearance() {
// 	const gamelog = parent.document.getElementById('gamelog');

// 	if (!gamelog) {
// 		console.log('Gamelog not ready yet');
// 		return false;
// 	}

// 	Object.assign(gamelog.style, {
// 		position: 'relative',
// 		background: 'rgba(0,0,0,0.7)',
// 		border: '4px solid gray',
// 		width: '330px',
// 		height: '150px',
// 		fontSize: '20px',
// 		color: 'white',
// 		textAlign: 'left',
// 		overflowY: 'scroll',
// 		lineHeight: '24px',
// 		padding: '10px',
// 		fontFamily: 'pixel',
// 		wordWrap: 'break-word',
// 		webkitFontSmoothing: 'subpixel-antialiased',
// 		pointerEvents: 'auto',
// 		fontWeight: 'normal',
// 		verticalAlign: 'middle',
// 		boxSizing: 'border-box'
// 	});

// 	console.log('Gamelog appearance modified successfully');
// 	return true;
// }

// setTimeout(modifyGamelogAppearance, 1000);

// function modifyServerDivAppearance() {
// 	let $ = parent.$;
// 	let otherDiv = $('#bottomleftcorner2 > div.clickable');

// 	if (otherDiv.length) {
// 		otherDiv.css({
// 			background: 'black',
// 			border: 'solid gray',
// 			borderWidth: '4px 4px',
// 			width: '272px',
// 			height: '25px',
// 			lineHeight: '27px',
// 			fontSize: '20px',
// 			color: '#FFFFFF',
// 			textAlign: 'center',
// 			overflow: 'auto',
// 			backgroundColor: 'rgba(0, 0, 0, 0.7)',
// 		});
// 	} else {
// 		console.log("Element not found.");
// 	}
// }
// setTimeout(modifyServerDivAppearance, 40000);

// function modifyChatDivAppearance() {
// 	let $ = parent.$;
// 	let otherDiv = $('#bottomleftcorner2 > div:nth-child(3)');

// 	if (otherDiv.length) {
// 		otherDiv.css({
// 			background: 'black',
// 			border: 'solid gray',
// 			borderWidth: '4px 4px',
// 			width: '280px',
// 			height: '159px',
// 			fontSize: '17px',
// 			color: '#FFFFFF',
// 			textAlign: 'left',
// 			overflow: 'auto',
// 			backgroundColor: 'rgba(0, 0, 0, 0.7)',
// 		});
// 	} else {
// 		console.log("Element not found.");
// 	}
// }
// setTimeout(modifyChatDivAppearance, 40000);

// function modifyChatLogDivAppearance() {
// 	let $ = parent.$;
// 	let chatLogDiv = $('#chatlog');

// 	if (chatLogDiv.length) {
// 		chatLogDiv.css({
// 			fontSize: '18px',
// 			overflowX: 'hidden',
// 			backgroundColor: 'rgba(0, 0, 0, 0.1)',
// 			width: '100%',
// 		});
// 	} else {
// 		console.log("Chat log div element not found.");
// 	}
// }
// setTimeout(modifyChatLogDivAppearance, 40000);

// function modifyChatInputDivAppearance() {
// 	let $ = parent.$;
// 	let otherDiv = $('#chatinput');

// 	if (otherDiv.length) {
// 		otherDiv.css({
// 			userSelect: 'none',
// 			wordWrap: 'break-word',
// 			WebkitFontSmoothing: 'subpixel-antialiased',
// 			position: 'fixed',
// 			zIndex: 99,
// 			bottom: '2px',
// 			left: '7px',
// 			width: '275px',
// 			height: '25px',
// 			fontSize: '24px',
// 			fontFamily: 'Pixel',
// 			display: 'inline-block',
// 			background: '#404040',
// 			color: 'white',
// 			border: 'none',
// 			padding: '1px'
// 		});
// 	} else {
// 		console.log("Element not found.");
// 	}
// }
// setTimeout(modifyChatInputDivAppearance, 40000);

// function removeChatWithParty() {
// 	let $ = parent.$;
// 	let chatWithPartyDiv = $('#chatwparty');

// 	if (chatWithPartyDiv.length) {
// 		chatWithPartyDiv.remove();
// 	} else {
// 		console.log("Chat with party div element not found.");
// 	}
// }

// setTimeout(removeChatWithParty, 40000);
// //////////////////////////////////////////////////////////////////////////////
// function loadChestMap() {
// 	const data = get(CHEST_STORAGE_KEY);
// 	return (data && typeof data === "object" && !Array.isArray(data))
// 		? data
// 		: {};
// }

// function updateChestButton() {
// 	const chestMap = loadChestMap();
// 	const count = Object.keys(chestMap).length;

// 	add_top_button(
// 		"chest_status",
// 		`Chests: ${count}`,
// 		() => show_json(chestMap)
// 	);
// }

// setInterval(updateChestButton, 250);
// //////////////////////////////////////////////////////////////////////////////
// function swapDivs() {
// 	let $ = parent.$;
// 	let skbar = $('#skillbar');
// 	let iframelist = $('#iframelist');
// 	$('#movebottomrighthere').remove();
// 	$('#skillbar').remove();
// 	$('#chatwparty').remove();
// 	$('#bottomleftcorner2').children().first().before(`<div id="movebottomrighthere" style="display: flex; flex-direction: row; align-items: flex-end; margin-top: -20px;"></div>`);
// 	$('#movebottomrighthere').append(skbar);
// }

// swapDivs();
// /////////////////////////////////////////////////////////////////////////////////////////////////

// if (parent.party_style_prepared) {
// 	parent.$('#style-party-frames').remove();
// }

// let css = `
// 		.party-container {
// 			position: absolute;
// 			top: 55px;
// 			left: -15%;
// 			width: 1000px; 
// 			height: 300px;
// 			transform: translate(0%, 0);
// 			fontFamily: 'pixel';
// 		}
// 	`;
// parent.$('head').append(`<style id="style-party-frames">${css}</style>`);
// parent.party_style_prepared = true;

// const includeThese = ['mp', 'max_mp', 'hp', 'max_hp', 'name', 'max_xp', 'name', 'xp', 'level', 'share', 'cc'];
// const partyFrameWidth = 80;

// function updatePartyData() {
// 	let myInfo = Object.fromEntries(Object.entries(character).filter(current => { return character.read_only.includes(current[0]) || includeThese.includes(current[0]); }));
// 	myInfo.lastSeen = Date.now();
// 	set(character.name + '_newparty_info', myInfo);
// }

// setInterval(updatePartyData, 200);

// function getIFramedCharacter(name) {
// 	for (const iframe of top.$('iframe')) {
// 		const char = iframe.contentWindow.character;
// 		if (!char) continue;
// 		if (char.name == name) return char;
// 	}
// 	return null;
// }

// let show_party_frame_property = {
// 	img: true,
// 	hp: true,
// 	mp: true,
// 	xp: true,
// 	cc: true,
// 	ping: true,
// 	share: true
// };

// function get_toggle_text(key) {
// 	return key.toUpperCase() + (show_party_frame_property[key] ? '✔️' : '❌');
// }

// function update_toggle_text(key) {
// 	const toggle = parent.document.getElementById('party-props-toggles-' + key);
// 	toggle.textContent = get_toggle_text(key);
// }

// function addPartyFramePropertiesToggles() {
// 	if (parent.document.getElementById('party-props-toggles')) {
// 		return;
// 	}

// 	const toggles = parent.document.createElement('div');
// 	toggles.id = 'party-props-toggles';
// 	toggles.classList.add('hidden');
// 	toggles.style = `
// 	display: flex; 
// 	flex-wrap: wrap;
// 	width: 100%;
// 	max-width: 480px;
// 	background-color: black;
// 	margin-top: 2px;
// `;

// 	function create_toggle(key) {
// 		const toggle = parent.document.createElement('button');
// 		toggle.id = 'party-props-toggles-' + key;
// 		toggle.setAttribute('data-key', key);
// 		toggle.style = `
// 		border: 1px #ccc solid; 
// 		background-color: #000; 
// 		color: #ccc;
// 		width: 20%;
// 		margin: 0px;
// 		font-size: 9px;
// 		padding: 5px;
// 		cursor: pointer;
// 	`;
// 		toggle.setAttribute(
// 			'onclick',
// 			`parent.code_eval(show_party_frame_property['${key}'] = !show_party_frame_property['${key}']; update_toggle_text('${key}'));`
// 		);
// 		toggle.appendChild(parent.document.createTextNode(get_toggle_text(key)));
// 		return toggle;
// 	}

// 	for (let key of ['img', 'hp', 'mp', 'xp', 'cc']) {
// 		toggles.appendChild(create_toggle(key));
// 	}

// 	const rightBottomMenu = parent.document.getElementById("bottomrightcorner");
// 	const gameLogUi = parent.document.getElementById("gamelog");
// 	//rightBottomMenu.insertBefore(toggles, gameLogUi);
// }

// function updatePartyFrames() {
// 	let $ = parent.$;
// 	let partyFrame = $('#newparty');
// 	partyFrame.addClass('party-container');

// 	if (partyFrame) {
// 		addPartyFramePropertiesToggles();

// 		for (let x = 0; x < partyFrame.children().length; x++) {
// 			let party_member_name = Object.keys(parent.party)[x];
// 			let info = get(party_member_name + '_newparty_info');
// 			if (!info || Date.now() - info.lastSeen > 1000) {
// 				let iframed_party_member = getIFramedCharacter(party_member_name);
// 				if (iframed_party_member) {
// 					info = Object.fromEntries(Object.entries(iframed_party_member).filter(current => { return character.read_only.includes(current[0]) || includeThese.includes(current[0]); }));
// 				} else {
// 					let party_member = get_player(party_member_name);
// 					if (party_member) {
// 						info = Object.fromEntries(Object.entries(party_member).filter(current => { return includeThese.includes(current[0]); }));
// 					} else {
// 						info = { name: party_member_name };
// 					}
// 				}
// 			}

// 			let infoHTML = `<div style="width: ${partyFrameWidth}px; height: 20px; margin-top: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${info.name}</div>`;

// 			info.max_cc = 200;

// 			let hpWidth = 0;
// 			let mpWidth = 0;
// 			let hp = '??';
// 			let mp = '??';
// 			if (info.hp !== undefined) {
// 				hpWidth = info.hp / info.max_hp * 100;
// 				mpWidth = info.mp / info.max_mp * 100;
// 				hp = info.hp;
// 				mp = info.mp;
// 			}

// 			let xpWidth = 0;
// 			let xp = '??';
// 			if (info.xp !== undefined) {
// 				let lvl = info.level;
// 				let max_xp = G.levels[lvl];
// 				xpWidth = info.xp / max_xp * 100;
// 				xp = xpWidth.toFixed(2) + '%';
// 			}

// 			let ccWidth = 0;
// 			let cc = '??';
// 			if (info.cc !== undefined) {
// 				ccWidth = info.cc / info.max_cc * 100;
// 				cc = info.cc.toFixed(2);
// 			}

// 			let pingWidth = 0;
// 			let ping = '??';
// 			if (character.ping !== undefined) {
// 				pingWidth = -10;
// 				ping = character.ping.toFixed(0);
// 			}

// 			let shareWidth = 0;
// 			let share = '??';
// 			if (parent.party[party_member_name] && parent.party[party_member_name].share !== undefined) {
// 				shareWidth = parent.party[party_member_name].share * 100;
// 				share = (parent.party[party_member_name].share * 100).toFixed(2) + '%';
// 			}

// 			let data = {
// 				hp: hp,
// 				hpWidth: hpWidth,
// 				hpColor: 'red',
// 				mp: mp,
// 				mpWidth: mpWidth,
// 				mpColor: 'blue',
// 				xp: xp,
// 				xpWidth: xpWidth,
// 				xpColor: 'green',
// 				cc: cc,
// 				ccWidth: ccWidth,
// 				ccColor: 'grey',
// 				ping: ping,
// 				pingWidth: pingWidth,
// 				pingColor: 'black',
// 				share: share,
// 				shareWidth: shareWidth * 3,
// 				shareColor: 'teal',
// 			};

// 			for (let key of ['hp', 'mp', 'xp', 'cc']) {
// 				const text = key.toUpperCase();
// 				const value = data[key];
// 				const width = data[key + 'Width'];
// 				const color = data[key + 'Color'];
// 				if (show_party_frame_property[key]) {
// 					infoHTML += `<div style="position: relative; width: 100%; height: 20px; text-align: center; margin-top: 3px;">
// 	<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-weight: bold; font-size: 17px; z-index: 1; white-space: nowrap; text-shadow: -1px 0 black, 0 2px black, 2px 0 black, 0 -1px black;">${text}: ${value}</div>
// 	<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${color}; width: ${width}%; height: 20px; transform: translate(0, 0); border: 1px solid grey;"></div>
// </div>`;
// 				}
// 			}

// 			let party_member_frame = partyFrame.find(partyFrame.children()[x]);
// 			party_member_frame.children().first().css('display', show_party_frame_property['img'] ? 'inherit' : 'none');
// 			party_member_frame.children().last().html(`<div style="font-size: 22px;" onclick='pcs(event); party_click("${party_member_name}\");'>${infoHTML}</div>`);
// 		}
// 	}
// }

// parent.$('#party-props-toggles').remove();

// setInterval(updatePartyFrames, 500);
// ///////////////////////////////////////////////////////////////////////////////////////
// const ALDATA_KEY = "*********************";

// function updateTrackerData() {
// 	parent.socket.once("tracker", (data) => {
// 		const url = `https://aldata.earthiverse.ca/achievements/${character.id}/${ALDATA_KEY}`;
// 		const settings = {
// 			method: "PUT",
// 			headers: { "Content-Type": "application/json" },
// 			body: JSON.stringify({ max: data.max, monsters: data.monsters }),
// 		};
// 		fetch(url, settings).then((response) => console.log(response.status));
// 	});
// }
// parent.socket.emit("tracker");
// function hideTracker() {
// 	parent.hide_modal()
// }
// setTimeout(hideTracker, 1000);
// setInterval(updateTrackerData, 1000 * 60 * 10);

// /**
//  * Adds a Stats tab to the default tracker window
//  * Shows achievement progress for stat bonuses earned from monster kills
//  */
// function modify_tracker() {
// 	const tracker_function = function () {
// 		this.render_tracker = function () {
// 			let html = "";

// 			// Tab buttons
// 			html += "<div style='font-size: 32px'>";
// 			html += "<div style='background-color:#575983; border: 2px solid #9F9FB0; display: inline-block; margin: 2px; padding: 6px;' class='clickable' onclick='pcs(event); $(\".trackers\").hide(); $(\".trackerm\").show();'>Monsters</div>";
// 			html += "<div style='background-color:#575983; border: 2px solid #9F9FB0; display: inline-block; margin: 2px; padding: 6px;' class='clickable' onclick='pcs(event); $(\".trackers\").hide(); $(\".trackere\").show();'>Exchanges and Quests</div>";
// 			html += "<div style='background-color:#575983; border: 2px solid #9F9FB0; display: inline-block; margin: 2px; padding: 6px;' class='clickable' onclick='pcs(event); $(\".trackers\").hide(); $(\".trackerx\").show();'>Stats</div>";
// 			html += "</div>";

// 			// Monsters tab (default game code)
// 			html += "<div class='trackers trackerm'>";
// 			object_sort(G.monsters, "hpsort").forEach(function (e) {
// 				if (e[1].cute && !e[1].achievements || e[1].unlist) return;
// 				let count = (tracker.monsters[e[0]] || 0) + (tracker.monsters_diff[e[0]] || 0);
// 				let color = "#50ADDD";
// 				if (tracker.max.monsters[e[0]] && tracker.max.monsters[e[0]][0] > count) {
// 					count = tracker.max.monsters[e[0]][0];
// 					color = "#DCC343";
// 				}
// 				html += "<div style='background-color:#575983; border: 2px solid #9F9FB0; position: relative; display: inline-block; margin: 2px;' class='clickable' onclick='pcs(event); render_monster_info(\"" + e[0] + "\")'>";
// 				html += sprite(e[0], { scale: 1.5 });
// 				if (count) {
// 					html += "<div style='background-color:#575983; border: 2px solid #9F9FB0; position: absolute; top: -2px; left: -2px; color:" + color + "; display: inline-block; padding: 1px 1px 1px 3px;'>" + to_shrinked_num(count) + "</div>";
// 				}
// 				if (tracker.drops && tracker.drops[e[0]] && tracker.drops[e[0]].length) {
// 					html += "<div style='background-color:#FD79B0; border: 2px solid #9F9FB0; position: absolute; bottom: -2px; right: -2px; display: inline-block; padding: 1px 1px 1px 1px; height: 2px; width: 2px'></div>";
// 				}
// 				html += "</div>";
// 			});
// 			html += "</div>";

// 			// Exchanges tab (default game code)
// 			html += "<div class='trackers trackere hidden' style='margin-top: 3px'>";
// 			object_sort(G.items).forEach(function (e) {
// 				if (e[1].e && !e[1].ignore) {
// 					let list = [[e[0], e[0], undefined]];
// 					if (e[1].upgrade || e[1].compound) {
// 						list = [];
// 						for (let i = 0; i < 13; i++) {
// 							if (G.drops[e[0] + i]) list.push([e[0], e[0] + i, i]);
// 						}
// 					}
// 					list.forEach(function (d) {
// 						html += "<div style='margin-right: 3px; margin-bottom: 3px; display: inline-block; position: relative;'";
// 						if (G.drops[d[1]]) {
// 							html += " class='clickable' onclick='pcs(event); render_exchange_info(\"" + d[1] + "\"," + (tracker.exchanges[d[1]] || 0) + ")'>";
// 						} else {
// 							html += ">";
// 						}
// 						html += item_container({ skin: G.items[d[0]].skin }, { name: d[0], level: d[2] });
// 						if (tracker.exchanges[d[1]]) {
// 							html += "<div style='background-color:#575983; border: 2px solid #9F9FB0; position: absolute; top: -2px; left: -2px; color:#ED901C; font-size: 16px; display: inline-block; padding: 1px 1px 1px 3px;'>" + to_shrinked_num(tracker.exchanges[d[1]]) + "</div>";
// 						}
// 						html += "</div>";
// 					});
// 				}
// 			});
// 			html += "</div>";

// 			// Stats tab
// 			html += "<div class='trackers trackerx hidden' style='margin-top: 3px; padding: 10px;'>";
// 			const kills = parent.tracker.max.monsters;
// 			const achievements = {};

// 			for (const mtype in kills) {
// 				if (!(mtype in G.monsters) || !G.monsters[mtype].achievements) continue;
// 				const killCount = kills[mtype][0];

// 				for (const achievement of G.monsters[mtype].achievements) {
// 					const [needed, type, reward, amount] = achievement;
// 					if (type !== "stat") continue;

// 					if (!achievements[reward]) {
// 						achievements[reward] = { value: 0, maxvalue: 0, monsters: [] };
// 					}

// 					if (killCount >= needed) {
// 						achievements[reward].value += amount;
// 					} else {
// 						achievements[reward].value += 0;
// 					}
// 					achievements[reward].maxvalue += amount;
// 					achievements[reward].monsters.push({ mtype, needed, amount });
// 				}
// 			}

// 			// Sort achievements alphabetically
// 			const sortedAchievements = Object.entries(achievements)
// 				.sort(([a], [b]) => a.localeCompare(b))
// 				.reduce((obj, [key, value]) => {
// 					obj[key] = value;
// 					return obj;
// 				}, {});

// 			html += "<div style='font-size: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px;'>";

// 			for (const ac in sortedAchievements) {
// 				const achievement = sortedAchievements[ac];
// 				const percentage = ((achievement.value / achievement.maxvalue) * 100).toFixed(1);
// 				const borderColor = achievement.value >= achievement.maxvalue ? '#22c725' : '#9F9FB0';

// 				html += "<div style='background-color:#575983; border: 2px solid " + borderColor + "; padding: 5px; text-align: center; cursor: pointer; position: relative;' onclick='toggleDropdown(\"" + ac + "\")'>";
// 				html += "<div style='font-weight: bold; font-size: 28px; margin-bottom: 3px;'>" + ac + "</div>";
// 				html += "<div style='font-size: 25px; margin-bottom: 1px;'>" + achievement.value.toFixed(2) + " / " + achievement.maxvalue.toFixed(2) + "</div>";
// 				html += "<div style='font-size: 22px; color: #DCC343;'>(" + percentage + "%)</div>";

// 				html += "<div id='dropdown-" + ac + "' class='dropdown-content' style='display: none; background-color:#1a1a1a; border: 2px solid #9F9FB0; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 600px; max-height: 70vh; overflow-y: auto; padding: 15px; z-index: 10000; box-shadow: 0 0 20px rgba(0,0,0,0.8);'>";
// 				html += "<div style='position: sticky; top: 0; background-color:#1a1a1a; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 2px solid #9F9FB0; font-size: 22px; font-weight: bold;'>" + ac + " Progress</div>";

// 				// Sort monsters by needed value, then alphabetically
// 				achievement.monsters.sort((a, b) => {
// 					if (a.needed !== b.needed) return a.needed - b.needed;
// 					return a.mtype.localeCompare(b.mtype);
// 				}).forEach(monster => {
// 					const currentKills = tracker.max.monsters[monster.mtype] ? Math.floor(tracker.max.monsters[monster.mtype][0]) : 0;
// 					const isCompleted = currentKills >= monster.needed;
// 					const bgColor = isCompleted ? '#1a3d1a' : '#2a2a3a';
// 					const fontColor = isCompleted ? '#22c725' : 'white';

// 					html += "<div style='background-color: " + bgColor + "; margin: 5px 0; padding: 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;'>";
// 					html += "<div style='color: " + fontColor + "; flex: 1;'>" + monster.mtype + "</div>";
// 					html += "<div style='color: " + fontColor + "; font-size: 19px;'>" + currentKills.toLocaleString() + " / " + monster.needed.toLocaleString() + " (+" + monster.amount.toLocaleString() + ")</div>";
// 					html += "</div>";
// 				});

// 				html += "</div>";
// 				html += "</div>";
// 			}

// 			html += "</div></div>";

// 			show_modal(html, { wwidth: 578, hideinbackground: true });
// 			window.toggleDropdown = function (achievement) {
// 				const dropdown = document.getElementById('dropdown-' + achievement);
// 				dropdown.style.display = (dropdown.style.display === 'none' || dropdown.style.display === '') ? 'block' : 'none';
// 			};
// 		};
// 	};

// 	const full_text = tracker_function.toString();
// 	parent.smart_eval(full_text.slice(full_text.indexOf("{") + 1, full_text.lastIndexOf("}")));
// }

// modify_tracker();

// // ========== TRACKING STATE ==========
// let sumGold = 0, largestGoldDrop = 0;
// const goldStartTime = performance.now();
// let goldInterval = 'hour';
// const goldHistory = [];

// const xpStartTime = performance.now();
// const startXP = character.xp;
// let xpInterval = 'second';
// const xpHistory = [];

// let playerDamageSums = {};
// const dpsStartTime = performance.now();
// const dpsHistory = {};

// // Kill tracking state
// const killStartTime = performance.now();
// let totalKills = 0;
// let mobKills = {};
// let killInterval = 'day';
// const killHistory = {};

// // Multi-select damage types - default to DPS only
// let selectedDamageTypes = ['DPS'];

// // Toggle variables for overheal and over-manasteal
// let includeOverheal = false;
// let includeOverMana = false;

// // Chart config
// const MAX_HISTORY = 60;
// const HISTORY_INTERVAL = 5000;
// let lastGoldUpdate = 0;
// let lastXpUpdate = 0;
// let lastDpsUpdate = 0;
// let lastKillUpdate = 0;

// const classColors = {
// 	mage: '#3FC7EB', paladin: '#F48CBA', priest: '#FFFFFF',
// 	ranger: '#AAD372', rogue: '#FFF468', warrior: '#C69B6D'
// };

// const sectionColors = {
// 	gold: { primary: '#FFD700', rgba: 'rgba(255, 215, 0, 0.3)', axis: 'rgba(255, 215, 0, 0.1)' },
// 	xp: { primary: '#87CEEB', rgba: 'rgba(135, 206, 235, 0.3)', axis: 'rgba(135, 206, 235, 0.2)' },
// 	dps: { primary: '#FF6B6B', rgba: 'rgba(255, 107, 107, 0.3)', axis: 'rgba(255, 107, 107, 0.2)' },
// 	kills: { primary: '#9D4EDD', rgba: 'rgba(157, 78, 221, 0.3)', axis: 'rgba(157, 78, 221, 0.1)' }
// };

// // Mob type colors
// const mobColors = [
// 	'#FF6B9D', '#4ECDC4', '#FFE66D', '#95E1D3', '#FF8B94',
// 	'#A8E6CF', '#FFD3B6', '#FFAAA5', '#AA96DA', '#FCBAD3'
// ];
// let mobColorMap = {};

// const damageTypeLabels = {
// 	DPS: 'Total DPS',
// 	Base: 'Base Damage',
// 	Cleave: 'Cleave Damage',
// 	Blast: 'Blast Damage',
// 	Burn: 'Burn Damage',
// 	HPS: 'Healing',
// 	MPS: 'Mana Steal',
// 	DR: 'Damage Return',
// 	Reflect: 'Reflection'
// };

// const damageTypeColors = {
// 	DPS: '#E53935',
// 	Base: '#6D1B7B',
// 	Cleave: '#8D6E63',
// 	Blast: '#FB8C00',
// 	Burn: '#FDD835',
// 	HPS: '#43A047',
// 	MPS: '#1E88E5',
// 	DR: '#546E7A',
// 	Reflect: '#26A69A'
// };

// // ========== INITIALIZATION ==========
// setTimeout(() => {
// 	const $ = parent.$;
// 	$('#metricsDashboard').remove();
// 	if (parent.buttons?.['metrics']) {
// 		delete parent.buttons['metrics'];
// 		$('.codebuttonmetrics').remove();
// 	}
// 	add_top_button('metrics', 'Metrics', toggleMetricsDashboard);
// }, 100);

// // ========== DPS TRACKING ==========
// function getPlayerEntry(id) {
// 	return playerDamageSums[id] || (playerDamageSums[id] = {
// 		startTime: performance.now(), sumDamage: 0, sumBurnDamage: 0,
// 		sumBlastDamage: 0, sumBaseDamage: 0, sumCleaveDamage: 0,
// 		sumHeal: 0, sumManaSteal: 0,
// 		sumDamageReturn: 0, sumReflection: 0,
// 	});
// }

// function calculateDamageTypeValue(id, now, damageType) {
// 	const entry = playerDamageSums[id];
// 	if (!entry) return 0;
// 	const elapsed = now - entry.startTime;
// 	if (elapsed <= 0) return 0;

// 	switch (damageType) {
// 		case 'DPS':
// 			return Math.floor((entry.sumDamage + entry.sumDamageReturn + entry.sumReflection) * 1000 / elapsed);
// 		case 'Base':
// 			return Math.floor(entry.sumBaseDamage * 1000 / elapsed);
// 		case 'Cleave':
// 			return Math.floor(entry.sumCleaveDamage * 1000 / elapsed);
// 		case 'Blast':
// 			return Math.floor(entry.sumBlastDamage * 1000 / elapsed);
// 		case 'Burn':
// 			return Math.floor(entry.sumBurnDamage * 1000 / elapsed);
// 		case 'HPS':
// 			return Math.floor(entry.sumHeal * 1000 / elapsed);
// 		case 'MPS':
// 			return Math.floor(entry.sumManaSteal * 1000 / elapsed);
// 		case 'DR':
// 			return Math.floor(entry.sumDamageReturn * 1000 / elapsed);
// 		case 'Reflect':
// 			return Math.floor(entry.sumReflection * 1000 / elapsed);
// 		default:
// 			return 0;
// 	}
// }

// function calculateTotalDamageType(damageType, now) {
// 	let total = 0;
// 	for (const id in playerDamageSums) {
// 		total += calculateDamageTypeValue(id, now, damageType);
// 	}
// 	return total;
// }

// // ========== UI CREATION ==========
// const createMetricsDashboard = () => {
// 	const $ = parent.$;
// 	$('#metricsDashboard').remove();

// 	const metricCard = (label, valueId) =>
// 		`<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value" id="${valueId}">0</div></div>`;

// 	const intervalButtons = (type, buttons) =>
// 		buttons.map(b => `<button class="interval-btn ${b.active ? 'active' : ''}" data-interval="${b.interval}" data-type="${type}">${b.label}</button>`).join('');

// 	const damageButtons = (buttons) =>
// 		buttons.map(b => `<button class="damage-type-btn ${b.active ? 'active' : ''}" data-damage-type="${b.type}" data-color="${b.color}">${b.label}</button>`).join('');

// 	const dashboard = $(`
// 		<div id="metricsDashboard">
// 			<div id="metricsHeader">
// 				<span id="metricsTitle">Performance Metrics</span>
// 				<button id="closeBtn">×</button>
// 			</div>
// 			<div id="metricsContent">
// 				<div class="metrics-section" data-section="gold">
// 					<h3>Gold Tracking</h3>
// 					<div class="metrics-grid">
// 						${metricCard('Gold/Hour', 'goldRate')}
// 						${metricCard('Largest Drop', 'jackpotValue')}
// 						${metricCard('Total Gold', 'totalGold')}
// 					</div>
// 					<div class="interval-selector">
// 						${intervalButtons('gold', [
// 		{ interval: 'minute', label: 'Minute' },
// 		{ interval: 'hour', label: 'Hour', active: true },
// 		{ interval: 'day', label: 'Day' }
// 	])}
// 					</div>
// 					<canvas id="goldChart" class="metric-chart"></canvas>
// 				</div>
				
// 				<div class="metrics-section" data-section="xp">
// 					<h3>XP Tracking</h3>
// 					<div class="metrics-grid">
// 						${metricCard('XP/Second', 'xpRate')}
// 						${metricCard('Time to Level', 'timeToLevel')}
// 						${metricCard('Total XP Gained', 'totalXP')}
// 					</div>
// 					<div class="interval-selector">
// 						${intervalButtons('xp', [
// 		{ interval: 'second', label: 'Second', active: true },
// 		{ interval: 'minute', label: 'Minute' },
// 		{ interval: 'hour', label: 'Hour' },
// 		{ interval: 'day', label: 'Day' }
// 	])}
// 					</div>
// 					<canvas id="xpChart" class="metric-chart"></canvas>
// 				</div>

// 				<div class="metrics-section" data-section="dps">
// 					<h3>DPS Tracking</h3>
// 					<div class="metrics-grid">
// 						${metricCard('Party Total', 'partyDPS')}
// 						${metricCard('Your Total', 'yourDPS')}
// 						${metricCard('Session Time', 'sessionTime')}
// 					</div>
// 					<div class="damage-type-selector">
// 						${damageButtons([
// 		{ type: 'DPS', label: 'Total', color: damageTypeColors.DPS, active: true },
// 		{ type: 'Base', label: 'Base', color: damageTypeColors.Base },
// 		{ type: 'Cleave', label: 'Cleave', color: damageTypeColors.Cleave },
// 		{ type: 'Blast', label: 'Blast', color: damageTypeColors.Blast },
// 		{ type: 'Burn', label: 'Burn', color: damageTypeColors.Burn },
// 		{ type: 'HPS', label: 'Heal', color: damageTypeColors.HPS },
// 		{ type: 'MPS', label: 'Mana', color: damageTypeColors.MPS },
// 		{ type: 'DR', label: 'Return', color: damageTypeColors.DR },
// 		{ type: 'Reflect', label: 'Reflect', color: damageTypeColors.Reflect }
// 	])}
// 					</div>
// 					<canvas id="dpsChart" class="metric-chart"></canvas>
// 				</div>

// 				<div class="metrics-section" data-section="kills">
// 					<h3>Kill Tracking</h3>
// 					<div class="metrics-grid">
// 						${metricCard('Kills/Day', 'killRate')}
// 						${metricCard('Total Kills', 'totalKillCount')}
// 					</div>
// 					<div class="interval-selector" id="killIntervalSelector">
// 						${intervalButtons('kills', [
// 		{ interval: 'minute', label: 'Minute' },
// 		{ interval: 'hour', label: 'Hour' },
// 		{ interval: 'day', label: 'Day', active: true }
// 	])}
// 					</div>
// 					<canvas id="killChart" class="metric-chart"></canvas>
// 					<div id="mobBreakdown"></div>
// 				</div>
// 			</div>
// 		</div>
// 	`).css({
// 		position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
// 		width: '1250px', maxHeight: '120vh', background: 'rgba(20, 20, 30, 0.98)',
// 		border: '3px solid #6366F1', borderRadius: '10px', zIndex: 9999, display: 'none',
// 		boxShadow: '0 0 30px rgba(99, 102, 241, 0.5)', overflow: 'hidden',
// 		fontFamily: $('#bottomrightcorner').css('font-family') || 'pixel'
// 	});

// 	$('body').append(dashboard);
// 	applyStyles($);
// 	attachEventHandlers($);
// };

// const applyStyles = ($) => {
// 	const styles = {
// 		'#metricsHeader': {
// 			background: 'linear-gradient(to right, #1a1a2e, #16213e)', padding: '12px 15px',
// 			borderBottom: '2px solid #3436a0ff', display: 'flex', justifyContent: 'space-between',
// 			alignItems: 'center', borderRadius: '7px 7px 0 0', userSelect: 'none'
// 		},
// 		'#metricsTitle': { color: '#3436a0ff', fontSize: '34px', fontWeight: 'bold', textShadow: '0 0 10px rgba(99, 102, 241, 0.5)' },
// 		'#closeBtn': { background: 'rgba(255, 255, 255, 0.1)', border: '1px solid #6366F1', color: '#6366F1', fontSize: '25px', width: '30px', height: '30px', cursor: 'pointer', borderRadius: '3px', transition: 'all 0.2s', fontFamily: 'inherit' },
// 		'#metricsContent': { padding: '15px', color: 'white', height: 'calc(90vh - 70px)', overflowY: 'auto', overflowX: 'hidden' },
// 		'.metrics-section': { marginBottom: '20px', padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' },
// 		'.metrics-section h3': { marginTop: '0', marginBottom: '15px', fontSize: '28px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' },
// 		'.metrics-grid': { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' },
// 		'.metric-card': { background: 'rgba(0, 0, 0, 0.4)', padding: '15px', borderRadius: '8px', textAlign: 'center' },
// 		'.metric-label': { fontSize: '20px', color: '#aaa', marginBottom: '8px', textTransform: 'uppercase' },
// 		'.metric-value': { fontSize: '24px', fontWeight: 'bold' },
// 		'.interval-selector': { display: 'flex', gap: '5px', marginBottom: '15px', justifyContent: 'center', flexWrap: 'wrap' },
// 		'.interval-btn': { padding: '8px 15px', minWidth: '70px', minHeight: '40px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', cursor: 'pointer', borderRadius: '5px', transition: 'all 0.2s', fontSize: '20px', fontFamily: 'inherit', border: 'none' },
// 		'.damage-type-selector': { display: 'flex', gap: '5px', marginBottom: '10px', justifyContent: 'center', flexWrap: 'wrap' },
// 		'.damage-type-btn': { padding: '8px 15px', minWidth: '70px', minHeight: '40px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', cursor: 'pointer', borderRadius: '5px', transition: 'all 0.2s', fontSize: '20px', border: '2px solid rgba(255, 255, 255, 0.3)', fontFamily: 'inherit' },
// 		'.damage-type-btn.active': { boxShadow: '0 0 10px rgba(255, 255, 255, 0.3)' },
// 		'.metric-chart': { width: '100%', height: '550px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', display: 'block' },
// 		'#mobBreakdown': { marginTop: '15px', padding: '15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px' },
// 		'.mob-breakdown-title': { color: '#9D4EDD', fontSize: '20px', marginBottom: '15px', textAlign: 'center' },
// 		'.mob-breakdown-grid': { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' },
// 		'.mob-stat': { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 20px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', minWidth: '120px' },
// 		'.mob-stat-name': { fontSize: '18px', marginBottom: '5px', textTransform: 'capitalize', fontWeight: 'bold' },
// 		'.mob-stat-count': { fontSize: '16px', color: '#FFF' }
// 	};

// 	Object.entries(styles).forEach(([sel, style]) => $(sel).css(style));

// 	$('.metrics-section').each(function () {
// 		const section = $(this).data('section');
// 		const color = sectionColors[section]?.rgba || 'rgba(255,255,255,0.2)';
// 		$(this).css('border', `2px solid ${color}`);
// 		$(this).find('h3').css('color', sectionColors[section]?.primary || '#FFF');
// 	});

// 	Object.entries(sectionColors).forEach(([section, colors]) => {
// 		$(`[data-section="${section}"] .metric-card`).css('border', `1px solid ${colors.rgba}`);
// 		$(`[data-section="${section}"] .metric-value`).css('color', colors.primary);
// 		$(`[data-section="${section}"] .interval-btn`).css('border', `1px solid ${colors.primary}`);
// 		$(`[data-section="${section}"] .metric-chart`).css('border', `1px solid ${colors.rgba}`);
// 	});

// 	$('.damage-type-btn').each(function () {
// 		const color = $(this).data('color');
// 		if (color) {
// 			$(this).css('border-color', color);
// 			if ($(this).hasClass('active')) {
// 				const hexToRgba = (hex, a) =>
// 					`rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
// 				$(this).css('background', hexToRgba(color, 0.4));
// 			}
// 		}
// 	});
// };

// const attachEventHandlers = ($) => {
// 	$('#closeBtn').on('click', () => $('#metricsDashboard').hide());

// 	$('.interval-btn').on('click', function () {
// 		const type = $(this).data('type');
// 		const interval = $(this).data('interval');
// 		const sectionMap = { gold: 'gold', xp: 'xp', damage: 'dps', kills: 'kills', killtype: 'kills' };
// 		const color = sectionColors[sectionMap[type]]?.primary || '#FFF';

// 		$(`[data-type="${type}"]`).removeClass('active').css('background', 'rgba(255, 255, 255, 0.1)');
// 		const hexToRgba = (hex, a) =>
// 			`rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
// 		$(this).addClass('active').css('background', hexToRgba(color, 0.2));

// 		if (type === 'kills') {
// 			if (killInterval !== interval) {
// 				killInterval = interval;
// 				resetKillHistory();
// 			}
// 			$('[data-section="kills"] .metric-label').first().text(`Kills/${interval.charAt(0).toUpperCase() + interval.slice(1)}`);
// 		} else {
// 			const intervalState = {
// 				gold: { get: () => goldInterval, set: v => goldInterval = v, reset: resetGoldHistory },
// 				xp: { get: () => xpInterval, set: v => xpInterval = v, reset: resetXpHistory }
// 			};

// 			const s = intervalState[type];
// 			if (s && s.get() !== interval) {
// 				s.set(interval);
// 				s.reset();
// 			}
// 		}

// 		updateMetricsDashboard();
// 	});

// 	$('.damage-type-btn').on('click', function () {
// 		const $ = parent.$;
// 		const damageType = $(this).data('damage-type');
// 		const color = $(this).data('color');

// 		if ($(this).hasClass('active')) {
// 			$(this).removeClass('active').css('background', 'rgba(255, 255, 255, 0.1)');
// 			selectedDamageTypes = selectedDamageTypes.filter(t => t !== damageType);
// 		} else {
// 			$(this).addClass('active');
// 			const hexToRgba = (hex, a) =>
// 				`rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
// 			$(this).css('background', hexToRgba(color, 0.3));
// 			if (!selectedDamageTypes.includes(damageType)) {
// 				selectedDamageTypes.push(damageType);
// 			}
// 		}

// 		updateMetricsDashboard();
// 	});

// 	$('#closeBtn').hover(
// 		function () { $(this).css('background', 'rgba(99, 102, 241, 0.3)'); },
// 		function () { $(this).css('background', 'rgba(255, 255, 255, 0.1)'); }
// 	);
// };

// // ========== UPDATE LOGIC ==========
// let $goldRate, $jackpotValue, $totalGold, $goldLabel;
// let $xpRate, $totalXP, $timeToLevel, $xpLabel;
// let $partyDPS, $yourDPS, $sessionTime;
// let $killRate, $totalKillCount, $mobBreakdown;

// const updateMetricsDashboard = () => {
// 	const $ = parent.$;
// 	const now = performance.now();

// 	if (!$goldRate) {
// 		$goldRate = $('#goldRate');
// 		$jackpotValue = $('#jackpotValue');
// 		$totalGold = $('#totalGold');
// 		$goldLabel = $('[data-section="gold"] .metric-label').first();

// 		$xpRate = $('#xpRate');
// 		$totalXP = $('#totalXP');
// 		$timeToLevel = $('#timeToLevel');
// 		$xpLabel = $('[data-section="xp"] .metric-label').first();

// 		$partyDPS = $('#partyDPS');
// 		$yourDPS = $('#yourDPS');
// 		$sessionTime = $('#sessionTime');

// 		$killRate = $('#killRate');
// 		$totalKillCount = $('#totalKillCount');
// 		$mobBreakdown = $('#mobBreakdown');
// 	}

// 	const avgGold = calculateAverageGold();
// 	$goldRate.text(avgGold.toLocaleString('en'));
// 	$jackpotValue.text(largestGoldDrop.toLocaleString('en'));
// 	$totalGold.text(sumGold.toLocaleString('en'));
// 	$goldLabel.text(`Gold/${goldInterval.charAt(0).toUpperCase() + goldInterval.slice(1)}`);

// 	if (now - lastGoldUpdate >= HISTORY_INTERVAL) {
// 		goldHistory.push({ time: now, value: avgGold });
// 		if (goldHistory.length > MAX_HISTORY) goldHistory.shift();
// 		lastGoldUpdate = now;
// 	}

// 	const xpGained = character.xp - startXP;
// 	const avgXP = calculateAverageXP();
// 	$xpRate.text(avgXP.toLocaleString('en'));
// 	$totalXP.text(xpGained.toLocaleString('en'));

// 	const xpMissing = parent.G.levels[character.level] - character.xp;
// 	const elapsedSec = Math.round((now - xpStartTime) / 1000);

// 	if (elapsedSec > 0 && xpGained > 0) {
// 		const secondsToLevel = Math.round(xpMissing / (xpGained / elapsedSec));
// 		$timeToLevel.css('fontSize', '24px').text(formatTime(secondsToLevel));
// 	} else {
// 		$timeToLevel.text('--');
// 	}

// 	$xpLabel.text(`XP/${xpInterval.charAt(0).toUpperCase() + xpInterval.slice(1)}`);

// 	if (now - lastXpUpdate >= HISTORY_INTERVAL) {
// 		xpHistory.push({ time: now, value: avgXP });
// 		if (xpHistory.length > MAX_HISTORY) xpHistory.shift();
// 		lastXpUpdate = now;
// 	}

// 	const totalPartyDPS = calculateTotalDamageType('DPS', now);
// 	const totalYourDPS = calculateDamageTypeValue(character.id, now, 'DPS');

// 	$partyDPS.text(totalPartyDPS.toLocaleString('en'));
// 	$yourDPS.text(totalYourDPS.toLocaleString('en'));

// 	const elapsedMs = now - dpsStartTime;
// 	const hours = Math.floor(elapsedMs / 3600000);
// 	const minutes = Math.floor((elapsedMs % 3600000) / 60000);
// 	$sessionTime.text(hours ? `${hours}h ${minutes}m` : `${minutes}m`);

// 	if (now - lastDpsUpdate >= HISTORY_INTERVAL) {
// 		for (const id in playerDamageSums) {
// 			if (!dpsHistory[id]) dpsHistory[id] = {};

// 			for (const damageType of Object.keys(damageTypeLabels)) {
// 				if (!dpsHistory[id][damageType]) dpsHistory[id][damageType] = [];

// 				const value = calculateDamageTypeValue(id, now, damageType);
// 				dpsHistory[id][damageType].push({ time: now, value });

// 				if (dpsHistory[id][damageType].length > MAX_HISTORY) {
// 					dpsHistory[id][damageType].shift();
// 				}
// 			}
// 		}
// 		lastDpsUpdate = now;
// 	}

// 	const avgKills = calculateAverageKills('Total');
// 	$killRate.text(Math.round(avgKills).toLocaleString('en'));
// 	$totalKillCount.text(totalKills.toLocaleString('en'));

// 	if (now - lastKillUpdate >= HISTORY_INTERVAL) {
// 		if (!killHistory['Total']) killHistory['Total'] = [];
// 		const totalAvg = calculateAverageKills('Total');
// 		killHistory['Total'].push({ time: now, value: totalAvg });
// 		if (killHistory['Total'].length > MAX_HISTORY) killHistory['Total'].shift();

// 		for (const mobType in mobKills) {
// 			if (!killHistory[mobType]) killHistory[mobType] = [];
// 			const mobAvg = calculateAverageKills(mobType);
// 			killHistory[mobType].push({ time: now, value: mobAvg });
// 			if (killHistory[mobType].length > MAX_HISTORY) killHistory[mobType].shift();
// 		}

// 		lastKillUpdate = now;
// 	}

// 	updateMobBreakdown($);

// 	drawChart('goldChart', [{ history: goldHistory, color: sectionColors.gold.primary }], sectionColors.gold.primary);
// 	drawChart('xpChart', [{ history: xpHistory, color: sectionColors.xp.primary }], sectionColors.xp.primary);
// 	drawDPSBarChart();
// 	drawKillBarChart();
// };

// // ========== CHART DRAWING ==========
// const drawDPSBarChart = () => {
// 	const $ = parent.$;
// 	const canvas = parent.document.getElementById('dpsChart');
// 	if (!canvas || !$('#metricsDashboard').is(':visible')) return;

// 	const ctx = canvas.getContext('2d');
// 	const rect = canvas.getBoundingClientRect();

// 	if (canvas.width !== rect.width || canvas.height !== rect.height) {
// 		canvas.width = rect.width;
// 		canvas.height = rect.height;
// 	}

// 	ctx.clearRect(0, 0, canvas.width, canvas.height);

// 	const now = performance.now();
// 	const players = [];

// 	for (const id in playerDamageSums) {
// 		const player = get_player(id);
// 		if (!player) continue;

// 		const values = {};
// 		for (const type of selectedDamageTypes) {
// 			values[type] = calculateDamageTypeValue(id, now, type);
// 		}

// 		players.push({ id, name: player.name, ctype: player.ctype, values });
// 	}

// 	if (players.length === 0) {
// 		ctx.fillStyle = '#999';
// 		ctx.font = '24px pixel, monospace';
// 		ctx.textAlign = 'center';
// 		ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
// 		return;
// 	}

// 	if (selectedDamageTypes.length === 0) {
// 		ctx.fillStyle = '#999';
// 		ctx.font = '24px pixel, monospace';
// 		ctx.textAlign = 'center';
// 		ctx.fillText('Select a damage type to display', canvas.width / 2, canvas.height / 2);
// 		return;
// 	}

// 	players.sort((a, b) => {
// 		const sumA = Object.values(a.values).reduce((s, v) => s + v, 0);
// 		const sumB = Object.values(b.values).reduce((s, v) => s + v, 0);
// 		return sumB - sumA;
// 	});

// 	const padding = 60;
// 	const labelHeight = 40;
// 	const chartHeight = canvas.height - padding - labelHeight;
// 	const chartWidth = canvas.width - 2 * padding;

// 	let maxValue = 1;
// 	for (const player of players) {
// 		for (const type of selectedDamageTypes) {
// 			if (player.values[type] > maxValue) maxValue = player.values[type];
// 		}
// 	}
// 	maxValue *= 1.1;

// 	ctx.strokeStyle = sectionColors.dps.axis;
// 	ctx.lineWidth = 1;
// 	for (let i = 0; i <= 5; i++) {
// 		const y = padding + chartHeight * (1 - i / 5);
// 		ctx.beginPath();
// 		ctx.moveTo(padding, y);
// 		ctx.lineTo(canvas.width - padding, y);
// 		ctx.stroke();

// 		ctx.fillStyle = sectionColors.dps.primary;
// 		ctx.font = '16px pixel, monospace';
// 		ctx.textAlign = 'right';
// 		const value = Math.round(maxValue * i / 5);
// 		ctx.fillText(value.toLocaleString(), padding - 10, y + 5);
// 	}

// 	const groupWidth = chartWidth / players.length;
// 	const barWidth = Math.min(groupWidth / selectedDamageTypes.length - 10, 60);
// 	const groupPadding = (groupWidth - barWidth * selectedDamageTypes.length) / 2;

// 	for (let i = 0; i < players.length; i++) {
// 		const player = players[i];
// 		const groupX = padding + i * groupWidth;

// 		for (let j = 0; j < selectedDamageTypes.length; j++) {
// 			const type = selectedDamageTypes[j];
// 			const value = player.values[type];
// 			const barHeight = (value / maxValue) * chartHeight;
// 			const barX = groupX + groupPadding + j * barWidth;
// 			const barY = padding + chartHeight - barHeight;

// 			const baseColor = type === 'DPS'
// 				? (classColors[player.ctype] || damageTypeColors.DPS)
// 				: damageTypeColors[type];

// 			ctx.fillStyle = getDamageBarFill(ctx, type, barX, barY, barWidth, barHeight, baseColor);
// 			ctx.fillRect(barX, barY, barWidth, barHeight);

// 			ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
// 			ctx.lineWidth = 1;
// 			ctx.strokeRect(barX, barY, barWidth, barHeight);

// 			if (barHeight > 30) {
// 				ctx.font = '18px pixel, monospace';
// 				ctx.textAlign = 'center';

// 				const text = value.toLocaleString();
// 				const x = barX + barWidth / 2;
// 				const y = barY + 15;

// 				ctx.lineWidth = 3;
// 				ctx.strokeStyle = 'black';
// 				ctx.strokeText(text, x, y);

// 				ctx.fillStyle = 'white';
// 				ctx.fillText(text, x, y);
// 			}
// 		}

// 		ctx.fillStyle = classColors[player.ctype] || '#FFF';
// 		ctx.font = '16px pixel, monospace';
// 		ctx.textAlign = 'center';
// 		ctx.fillText(player.name, groupX + groupWidth / 2, canvas.height - 20);
// 	}

// 	if (selectedDamageTypes.length > 0) {
// 		const legendY = 10;
// 		let legendX = padding;

// 		for (const type of selectedDamageTypes) {
// 			if (type === 'DPS' && players.length === 1) {
// 				const player = players[0];
// 				ctx.fillStyle = classColors[player.ctype] || damageTypeColors.DPS;
// 			} else {
// 				ctx.fillStyle = damageTypeColors[type];
// 			}
// 			ctx.fillRect(legendX, legendY, 15, 15);

// 			ctx.fillStyle = 'white';
// 			ctx.font = '16px pixel, monospace';
// 			ctx.textAlign = 'left';
// 			const label = type === 'DPS' && players.length === 1 ? damageTypeLabels[type] : damageTypeLabels[type];
// 			ctx.fillText(label, legendX + 20, legendY + 12);

// 			legendX += ctx.measureText(label).width + 40;
// 		}
// 	}
// };

// const updateMobBreakdown = ($) => {
// 	const sortedMobs = Object.entries(mobKills).sort((a, b) => b[1] - a[1]);

// 	if (sortedMobs.length === 0) {
// 		$mobBreakdown.html('<div style="text-align: center; color: #999; padding: 20px;">No kills yet...</div>');
// 		return;
// 	}

// 	let html = `<div class="mob-breakdown-title" style=" text-align: center; color: #9D4EDD; font-weight: bold; font-size: 22px; margin-bottom: 10px;">Mob Breakdown</div><div class="mob-breakdown-grid" style="display: flex; justify-content: center; gap: 30px; flex-wrap: wrap;">`;

// 	sortedMobs.forEach(([mobType, count]) => {
// 		const percentage = ((count / totalKills) * 100).toFixed(1);
// 		const color = getMobColor(mobType);

// 		html += `
// 			<div class="mob-stat" style="text-align: center; font-size: 18px;">
// 				<span class="mob-stat-name" style="color: ${color}; display: block; font-weight: bold;">${mobType}</span>
// 				<span class="mob-stat-count" style="display: block;">${count.toLocaleString()} (${percentage}%)</span>
// 			</div>
// 		`;
// 	});

// 	html += '</div>';
// 	$mobBreakdown.html(html);
// };

// const drawKillBarChart = () => {
// 	const $ = parent.$;
// 	const canvas = parent.document.getElementById('killChart');
// 	if (!canvas || !$('#metricsDashboard').is(':visible')) return;

// 	const ctx = canvas.getContext('2d');
// 	const rect = canvas.getBoundingClientRect();

// 	if (canvas.width !== rect.width || canvas.height !== rect.height) {
// 		canvas.width = rect.width;
// 		canvas.height = rect.height;
// 	}

// 	ctx.clearRect(0, 0, canvas.width, canvas.height);

// 	const mobData = [];
// 	const allMobTypes = Object.keys(mobKills);

// 	for (const mobType of allMobTypes) {
// 		const value = calculateAverageKills(mobType);
// 		mobData.push({ type: mobType, displayName: mobType.charAt(0).toUpperCase() + mobType.slice(1), value });
// 	}

// 	if (mobData.length === 0) {
// 		ctx.fillStyle = '#999';
// 		ctx.font = '24px pixel, monospace';
// 		ctx.textAlign = 'center';
// 		ctx.fillText('No kills yet...', canvas.width / 2, canvas.height / 2);
// 		return;
// 	}

// 	mobData.sort((a, b) => b.value - a.value);

// 	const padding = 60;
// 	const labelHeight = 40;
// 	const chartHeight = canvas.height - padding - labelHeight;
// 	const chartWidth = canvas.width - 2 * padding;

// 	let maxValue = 1;
// 	for (const mob of mobData) {
// 		if (mob.value > maxValue) maxValue = mob.value;
// 	}
// 	maxValue *= 1.1;

// 	ctx.strokeStyle = sectionColors.kills.axis;
// 	ctx.lineWidth = 1;
// 	for (let i = 0; i <= 5; i++) {
// 		const y = padding + chartHeight * (1 - i / 5);
// 		ctx.beginPath();
// 		ctx.moveTo(padding, y);
// 		ctx.lineTo(canvas.width - padding, y);
// 		ctx.stroke();

// 		ctx.fillStyle = sectionColors.kills.primary;
// 		ctx.font = '16px pixel, monospace';
// 		ctx.textAlign = 'right';
// 		const value = Math.round(maxValue * i / 5);
// 		ctx.fillText(value.toLocaleString(), padding - 10, y + 5);
// 	}

// 	const groupWidth = chartWidth / mobData.length;
// 	const barWidth = Math.min(groupWidth - 20, 60);

// 	for (let i = 0; i < mobData.length; i++) {
// 		const mob = mobData[i];
// 		const groupX = padding + i * groupWidth;
// 		const mobColor = getMobColor(mob.type);

// 		const value = mob.value;
// 		const barHeight = (value / maxValue) * chartHeight;
// 		const barX = groupX + (groupWidth - barWidth) / 2;
// 		const barY = padding + chartHeight - barHeight;

// 		ctx.fillStyle = mobColor;
// 		ctx.fillRect(barX, barY, barWidth, barHeight);

// 		ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
// 		ctx.lineWidth = 1;
// 		ctx.strokeRect(barX, barY, barWidth, barHeight);

// 		if (barHeight > 30) {
// 			ctx.font = '18px pixel, monospace';
// 			ctx.textAlign = 'center';

// 			const text = Math.round(value).toLocaleString();
// 			const x = barX + barWidth / 2;
// 			const y = barY + 15;

// 			ctx.lineWidth = 3;
// 			ctx.strokeStyle = 'black';
// 			ctx.strokeText(text, x, y);

// 			ctx.fillStyle = 'white';
// 			ctx.fillText(text, x, y);
// 		}

// 		ctx.fillStyle = mobColor;
// 		ctx.font = '16px pixel, monospace';
// 		ctx.textAlign = 'center';
// 		ctx.fillText(mob.displayName, groupX + groupWidth / 2, canvas.height - 20);
// 	}
// };

// const drawChart = (canvasId, lines, sectionColor) => {
// 	const canvas = parent.document.getElementById(canvasId);
// 	if (!canvas || !parent.$('#metricsDashboard').is(':visible')) return;

// 	const ctx = canvas.getContext('2d');
// 	const rect = canvas.getBoundingClientRect();

// 	if (canvas.width !== rect.width || canvas.height !== rect.height) {
// 		canvas.width = rect.width;
// 		canvas.height = rect.height;
// 	}

// 	ctx.clearRect(0, 0, canvas.width, canvas.height);

// 	let hasData = false;
// 	for (let i = 0; i < lines.length; i++) {
// 		if (lines[i].history.length >= 2) {
// 			hasData = true;
// 			break;
// 		}
// 	}

// 	if (!hasData) {
// 		ctx.fillStyle = '#999';
// 		ctx.font = '24px pixel, monospace';
// 		ctx.textAlign = 'center';
// 		ctx.fillText('Collecting data...', canvas.width / 2, canvas.height / 2);
// 		return;
// 	}

// 	let lastMinutes = 0;
// 	if (lines.length && lines[0].history.length > 1) {
// 		const hist = lines[0].history;
// 		const firstTime = hist[0].time;
// 		const lastTime = hist[hist.length - 1].time;
// 		lastMinutes = Math.round((lastTime - firstTime) / 60000);
// 	}

// 	let maxValue = 1;
// 	for (let i = 0; i < lines.length; i++) {
// 		const lineMax = lines[i].smoothedMax || Math.max(...lines[i].history.map(d => d.value), 1);
// 		if (lineMax > maxValue) maxValue = lineMax;
// 	}
// 	maxValue *= 1.2;
// 	const range = maxValue || 1;

// 	ctx.font = '18px pixel, monospace';
// 	const padding = ctx.measureText(maxValue.toLocaleString()).width + 15;
// 	const labelSpace = lines[0].label ? 60 : 0;
// 	const gw = canvas.width - 2 * padding - labelSpace;
// 	const gh = canvas.height - 2 * padding;
// 	const axisColor = sectionColors[canvasId.replace('Chart', '').toLowerCase()]?.axis || 'rgba(255,255,255,0.1)';

// 	ctx.strokeStyle = axisColor;
// 	ctx.lineWidth = 1;
// 	for (let i = 0; i <= 5; i++) {
// 		const y = padding + gh * i / 5;
// 		ctx.beginPath();
// 		ctx.moveTo(padding, y);
// 		ctx.lineTo(canvas.width - padding, y);
// 		ctx.stroke();
// 	}

// 	ctx.strokeStyle = axisColor;
// 	ctx.lineWidth = 2;
// 	ctx.beginPath();
// 	ctx.moveTo(padding, padding);
// 	ctx.lineTo(padding, canvas.height - padding);
// 	ctx.lineTo(canvas.width - padding, canvas.height - padding);
// 	ctx.stroke();

// 	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
// 		const line = lines[lineIdx];
// 		const history = line.history;
// 		const color = line.color;
// 		const histLen = history.length - 1;

// 		if (lines.length === 1) {
// 			const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
// 			gradient.addColorStop(0, color + '4D');
// 			gradient.addColorStop(1, color + '0D');
// 			ctx.fillStyle = gradient;
// 			ctx.beginPath();
// 			ctx.moveTo(padding, canvas.height - padding);
// 			for (let i = 0; i < history.length; i++) {
// 				const x = padding + gw * i / histLen;
// 				const y = canvas.height - padding - gh * history[i].value / range;
// 				ctx.lineTo(x, y);
// 			}
// 			ctx.lineTo(padding + gw, canvas.height - padding);
// 			ctx.closePath();
// 			ctx.fill();
// 		}

// 		ctx.strokeStyle = color;
// 		ctx.lineWidth = 2;
// 		ctx.beginPath();
// 		for (let i = 0; i < history.length; i++) {
// 			const x = padding + gw * i / histLen;
// 			const y = canvas.height - padding - gh * history[i].value / range;
// 			if (i === 0) ctx.moveTo(x, y);
// 			else ctx.lineTo(x, y);
// 		}
// 		ctx.stroke();

// 		ctx.fillStyle = color;
// 		for (let i = 0; i < history.length; i++) {
// 			const x = padding + gw * i / histLen;
// 			const y = canvas.height - padding - gh * history[i].value / range;
// 			ctx.beginPath();
// 			ctx.arc(x, y, 3, 0, 2 * Math.PI);
// 			ctx.fill();
// 		}

// 		if (line.label) {
// 			const last = history[histLen];
// 			const lastY = canvas.height - padding - gh * last.value / range;
// 			ctx.font = '16px pixel, monospace';
// 			ctx.textAlign = 'left';
// 			ctx.fillText(line.label, padding + gw + 6, lastY + 4);
// 		}
// 	}

// 	ctx.fillStyle = sectionColor;
// 	ctx.font = '18px pixel, monospace';
// 	ctx.textAlign = 'right';
// 	for (let i = 0; i <= 5; i++) {
// 		const value = Math.round(range * i / 5);
// 		const y = canvas.height - padding - (gh * i / 5);
// 		ctx.fillText(value.toLocaleString(), padding - 6, y + 4);
// 	}
// 	ctx.textAlign = 'center';
// 	ctx.fillText(`Last ${lastMinutes} min${lastMinutes !== 1 ? 's' : ''}`, canvas.width / 2, canvas.height - 10);
// };

// // ========== HELPER FUNCTIONS ==========
// const intervalSeconds = {
// 	second: 1,
// 	minute: 60,
// 	hour: 3600,
// 	day: 86400
// };

// const calculateAverageGold = () => {
// 	const elapsed = (performance.now() - goldStartTime) / 1000;
// 	const divisor = elapsed / intervalSeconds[goldInterval];
// 	return divisor > 0 ? Math.round(sumGold / divisor) : 0;
// };

// const calculateAverageXP = () => {
// 	const elapsed = (performance.now() - xpStartTime) / 1000;
// 	const divisor = elapsed / intervalSeconds[xpInterval];
// 	return divisor > 0 ? Math.round((character.xp - startXP) / divisor) : 0;
// };

// const calculateAverageKills = (killType = 'Total') => {
// 	const elapsed = (performance.now() - killStartTime) / 1000;
// 	const divisor = elapsed / intervalSeconds[killInterval];
// 	if (divisor <= 0) return 0;

// 	if (killType === 'Total') {
// 		return totalKills / divisor;
// 	} else {
// 		return (mobKills[killType] || 0) / divisor;
// 	}
// };

// const formatTime = (seconds) => {
// 	const d = Math.floor(seconds / 86400);
// 	const h = Math.floor((seconds % 86400) / 3600);
// 	const m = Math.floor((seconds % 3600) / 60);
// 	return `${d}d ${h}h ${m}m`;
// };

// function getMobColor(mobType) {
// 	if (!mobColorMap[mobType]) {
// 		const colorIndex = Object.keys(mobColorMap).length % mobColors.length;
// 		mobColorMap[mobType] = mobColors[colorIndex];
// 	}
// 	return mobColorMap[mobType];
// }

// const resetGoldHistory = () => {
// 	goldHistory.length = 0;
// 	lastGoldUpdate = 0;
// };

// const resetXpHistory = () => {
// 	xpHistory.length = 0;
// 	lastXpUpdate = 0;
// };

// const resetKillHistory = () => {
// 	for (const key in killHistory) {
// 		killHistory[key].length = 0;
// 	}
// 	lastKillUpdate = 0;
// };

// const barGradientCache = {};

// function getDamageBarFill(ctx, type, barX, barY, barWidth, barHeight, fallbackColor) {
// 	if (type !== 'Burn' && type !== 'Blast') {
// 		return fallbackColor;
// 	}

// 	const key = `${type}_${barWidth}_${barHeight}`;
// 	if (barGradientCache[key]) return barGradientCache[key];

// 	const g = ctx.createLinearGradient(barX, barY + barHeight, barX, barY);

// 	switch (type) {
// 		case 'Burn':
// 			g.addColorStop(0.0, '#8B1A1A');
// 			g.addColorStop(0.5, '#F4511E');
// 			g.addColorStop(1.0, '#FFD54F');
// 			break;

// 		case 'Blast':
// 			g.addColorStop(0.0, '#6D2C00');
// 			g.addColorStop(1.0, '#FF9800');
// 			break;
// 	}

// 	barGradientCache[key] = g;
// 	return g;
// }

// // ========== EVENT LISTENERS ==========
// let updateInterval;

// const toggleMetricsDashboard = () => {
// 	const $ = parent.$;
// 	let dashboard = $('#metricsDashboard');
// 	if (dashboard.length === 0) {
// 		createMetricsDashboard();
// 		dashboard = $('#metricsDashboard');
// 	}

// 	if (dashboard.is(':visible')) {
// 		dashboard.hide();
// 		if (updateInterval) {
// 			clearInterval(updateInterval);
// 			updateInterval = null;
// 		}
// 	} else {
// 		dashboard.show();
// 		updateMetricsDashboard();
// 		if (!updateInterval) {
// 			updateInterval = setInterval(updateMetricsDashboard, 1000);
// 		}
// 	}
// };

// parent.socket.on('hit', data => {
// 	const isParty = id => parent.party_list.includes(id);
// 	try {
// 		if (!isParty(data.hid) && !isParty(data.id)) return;

// 		if (data.dreturn && get_player(data.id) && !get_player(data.hid)) {
// 			getPlayerEntry(data.id).sumDamageReturn += data.dreturn;
// 		}
// 		if (data.reflect && get_player(data.id) && !get_player(data.hid)) {
// 			getPlayerEntry(data.id).sumReflection += data.reflect;
// 		}
// 		if (get_player(data.hid) && isParty(data.hid) && (data.heal || data.lifesteal)) {
// 			const e = getPlayerEntry(data.hid);
// 			const healer = get_player(data.hid);
// 			const target = get_player(data.id);

// 			const totalHeal = (data.heal ?? 0) + (data.lifesteal ?? 0);
// 			if (includeOverheal) {
// 				e.sumHeal += totalHeal;
// 			} else {
// 				const actualHeal = (data.heal
// 					? Math.min(data.heal, (target?.max_hp ?? 0) - (target?.hp ?? 0))
// 					: 0
// 				) + (data.lifesteal
// 					? Math.min(data.lifesteal, healer.max_hp - healer.hp)
// 					: 0
// 					);
// 				e.sumHeal += actualHeal;
// 			}
// 		}
// 		if (get_player(data.hid) && isParty(data.hid) && data.manasteal) {
// 			const e = getPlayerEntry(data.hid);
// 			const p = get_entity(data.hid);
// 			if (includeOverMana) {
// 				e.sumManaSteal += data.manasteal;
// 			} else {
// 				e.sumManaSteal += Math.min(data.manasteal, p.max_mp - p.mp);
// 			}
// 		}
// 		if (data.damage && get_player(data.hid)) {
// 			const e = getPlayerEntry(data.hid);
// 			e.sumDamage += data.damage;
// 			if (data.source === 'burn') {
// 				e.sumBurnDamage += data.damage;
// 			} else if (data.splash) {
// 				e.sumBlastDamage += data.damage;
// 			} else if (data.source === 'cleave') {
// 				e.sumCleaveDamage += data.damage;
// 			} else {
// 				e.sumBaseDamage += data.damage;
// 			}
// 		}
// 	} catch (err) {
// 		console.error('hit handler error', err);
// 	}
// });

// /*
// game.on('death', data => {
// 	const mob = parent.entities[data.id];
// 	if (!mob?.cooperative) return;

// 	const mobTarget = mob.target;
// 	const party = get_party();
// 	const partyMembers = party ? Object.keys(party) : [];

// 	if (mobTarget === character.name || partyMembers.includes(mobTarget)) {

// 		totalKills++;
// 		const mobType = (mob.mtype || 'unknown').charAt(0).toUpperCase() + (mob.mtype || 'unknown').slice(1);
// 		mobKills[mobType] = (mobKills[mobType] || 0) + 1;
// 		getMobColor(mobType);
// 	}
// });
// */
// parent.socket.on("game_log", data => {
// 	if (typeof data !== "string") return;

// 	const match = data.match(/killed (.+)$/);
// 	if (!match) return;

// 	let mobType = match[1].trim().replace(/^(a |an |the )/i, '');
// 	mobType = mobType.charAt(0).toUpperCase() + mobType.slice(1);

// 	totalKills++;
// 	mobKills[mobType] = (mobKills[mobType] || 0) + 1;
// 	getMobColor(mobType);
// });

// character.on("loot", (data) => {

// 	if (data.gold && typeof data.gold === 'number' && !Number.isNaN(data.gold)) {
// 		const count = Object.keys(parent.party).filter(name =>
// 			name === character.name || parent.entities[name]?.owner === character.owner
// 		).length;
// 		const myGold = Math.round(data.gold * count);
// 		sumGold += myGold;
// 		if (myGold > largestGoldDrop) largestGoldDrop = myGold;
// 	}
// 	if (data.items && Array.isArray(data.items)) {
// 		data.items.forEach((item) => {
// 			let quantity = item.q !== undefined ? item.q : 1;
// 			let savedLoot = JSON.parse(localStorage.getItem(CONFIG.looting.lootMonth) || "{}");

// 			if (savedLoot[item.name]) {
// 				savedLoot[item.name] += quantity;
// 			} else {
// 				savedLoot[item.name] = quantity;
// 			}
// 			localStorage.setItem(CONFIG.looting.lootMonth, JSON.stringify(savedLoot));
// 			console.log(`Looted: ${item.name}, Quantity: ${quantity}`);

// 			if (rareItems[item.name]) {
// 				console.log(`Sending ${item.name} to Discord!`);
// 				sendRareLootToDiscord(
// 					item.name,
// 					quantity,
// 					rareItems[item.name],
// 					MENTION_USER_ID,
// 					item.looter || character.name
// 				);
// 			}
// 		});
// 	}
// });

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // 1) GLOBAL LOOP SWITCHES AND VARIABLES
// // --------------------------------------------------------------------------------------------------------------------------------- //

// const TARGET_LOWEST_HP = false;         // true: lowest HP, false: highest HP
// const ATTACK_UNTARGETED = false;        // Prevent attacking mobs not targeting anyone

// const POTION_HP_THRESHOLD = 300;        // Use potion if missing this much HP
// const POTION_MP_THRESHOLD = 400;        // Use potion if missing this much MP

// const ORBIT_RADIUS = 70;                // Combat Orbit radius
// const ORBIT_STEPS = 12;                 // Number of steps in orbit (e.g., 12 = 30 degrees per step)

// const PANIC_HP_THRESHOLD = 0.66;        // Panic if below 66% HP
// const PANIC_MP_THRESHOLD = 1;           // Panic if below 1 MP
// const SAFE_HP_THRESHOLD = 0.80;         // Resume normal if above 80% HP
// const SAFE_MP_THRESHOLD = 500;          // Resume normal if above 500 MP
// const PANIC_AGGRO_THRESHOLD = 3;        // Panic if this many monsters are targeting you

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // ATTACK LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function attack_loop() {

//     let delayMs = 100;

//     while (true) {
//         try {

//             if (!ATTACK_LOOP_ENABLED) {
//                 await delay(100);
//                 continue;
//             }

//             // Find all monsters in range
//             const inRange = [];
//             let cursed = null;
//             for (const id in parent.entities) {
//                 const mob = parent.entities[id];
//                 if (mob.type !== "monster" || mob.dead) continue;
//                 if (!DUNGEON_LOOP_ENABLED) {
//                     if (!MONSTER_TYPES.includes(mob.mtype)) continue;
//                 }
//                 const dist = Math.hypot(mob.x - character.x, mob.y - character.y);
//                 if (dist <= character.range-1) {
//                     inRange.push(mob);
//                     // Find a cursed monster in range (prioritize lowest HP if multiple)
//                     if (mob.s && mob.s.cursed) {
//                         if (!cursed || mob.hp < cursed.hp) cursed = mob;
//                     }
//                 }
//             }

//             // Sort by HP (lowest first)
//             inRange.sort((a, b) => b.hp - a.hp);
//             const sorted_targets = inRange.slice(0, 5);

//             try {
//                 if (smart.moving) {
//                     await delay(1000)
//                     continue; // Skip attacking while smart moving
//                 } else {
//                     // Filter out dead monsters before using their IDs
//                     const alive_targets = sorted_targets.filter(m => m && !m.dead);
//                     let valid_targets = [];

//                     if (ATTACK_UNTARGETED) {
//                         valid_targets = alive_targets;
//                     } else if (is_boss_alive()) {
//                         valid_targets = alive_targets;
//                     } else {
//                         valid_targets = alive_targets.filter(mob => mob.target === "Myras");
//                     }

//                     if (valid_targets.length >= 5 && character.mp >= 320 + 88) {
//                         use_skill("5shot", valid_targets.slice(0, 5).map(m => m.id));
//                     } else if (valid_targets.length >= 2 && character.mp >= 200 + 88) {
//                         use_skill("3shot", valid_targets.slice(0, 3).map(m => m.id));
//                     } else if (valid_targets.length >= 1 && character.mp >= 100) {
//                         const bscorpion = valid_targets.find(m => m.mtype === "bscorpion");
//                         if (bscorpion) {
//                             if (!is_on_cooldown("huntersmark")) {
//                                 use_skill("huntersmark", bscorpion.id);
//                             }
//                             else if (!is_on_cooldown("piercingshot") && character.mp >= 160) {
//                                 use_skill("piercingshot", bscorpion.id);
//                             }
//                             else if (!is_on_cooldown("supershot") && character.mp >= 400) {
//                                 use_skill("supershot", bscorpion.id);
//                             } else {
//                                 attack(valid_targets[0]);
//                             }
//                         } else {
//                             attack(valid_targets[0]);
//                         }
//                     }
//                 }
//                 delayMs = ms_to_next_skill("attack") + character.ping + 50;
//                 await delay(delayMs);
//                 continue;   
//             } catch (e) {
//                 catcher(e, "Attack Loop error ");
//             }
//             await delay(100);
//         } catch (e) {
//             catcher(e, "Attack Loop outer error ");
//             await delay(1000); // Prevent rapid error spam
//         }
//         await delay(100);        
//     }
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // BOSS LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// const BOSSES = ["mrpumpkin", "mrgreen", "dragold"];
// const BOSS_RANGE_TOLERANCE = 5;

// function get_party_names() {
//     return Object.keys(parent.party).concat(character.name);
// }

// function get_alive_bosses() {
//     return BOSSES
//         .filter(name => parent.S[name] && parent.S[name].live)
//         .map(name => ({ name, live: parent.S[name].live }));
// }

// function get_boss_entity(boss_name) {
//     return Object.values(parent.entities).find(e =>
//         e.type === "monster" && e.mtype === boss_name && !e.dead && e.visible
//     );
// }

// function select_boss(alive_bosses) {
//     let lowest_hp_boss = null, lowest_hp = Infinity;
//     for (const boss of alive_bosses) {
//         let hp = Infinity;
//         const entity = get_boss_entity(boss.name);
//         if (entity) hp = entity.hp;
//         else if (parent.S[boss.name] && typeof parent.S[boss.name].hp === "number") hp = parent.S[boss.name].hp;
//         if (hp < lowest_hp) {
//             lowest_hp = hp;
//             lowest_hp_boss = boss.name;
//         }
//     }
//     return lowest_hp_boss || (alive_bosses[0] && alive_bosses[0].name);
// }

// async function boss_loop() {

//     if (ATTACK_LOOP_ENABLED) ATTACK_LOOP_ENABLED = false;
//     if (SKILL_LOOP_ENABLED)  SKILL_LOOP_ENABLED = false;
//     if (ORBIT_LOOP_ENABLED)  ORBIT_LOOP_ENABLED = false;
//     if (PRIM_FARM_LOOT_ENABLED) PRIM_FARM_LOOT_ENABLED = false;

//     while (true) {
//         // Check if boss loop is enabled
//         if (!BOSS_LOOP_ENABLED) {
//             await delay(1000);
//             continue;
//         }

//         log("⚠️ Boss detected ⚠️", "#ff00e6ff", "Alerts");

//         // 1. Find all alive bosses and pick the one with the lowest HP (fallback: oldest spawn)
//         const alive_bosses = get_alive_bosses();
//         if (!alive_bosses.length) {
//             log("No alive bosses found.", "#ffaa00", "Alerts");
//             return;
//         }

//         const boss_name = select_boss(alive_bosses);

//         // 2. Move to boss spawn if known
//         const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
//             ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
//             : null;
//         if (boss_spawn) {
//             let aggro_timeout = false;
//             const timeout_ms = 30000;
//             const start_time = Date.now();

//             // Start smarter_move and monitor aggro
//             const movePromise = smarter_move(boss_spawn);
//             while (!aggro_timeout && !character.moving && !smart.moving) {
//                 // Wait for movement to start
//                 await delay(100);
//             }
//             while (!aggro_timeout && (character.moving || smart.moving)) {
//                 // Check for aggro and timeout
//                 const monsters_targeting_me = Object.values(parent.entities).filter(
//                     e => e.type === "monster" && e.target === character.name && !e.dead
//                 ).length;
//                 if (Date.now() - start_time > timeout_ms && monsters_targeting_me > 0) {
//                     aggro_timeout = true;
//                     log("⏰ Timeout: Still have aggro after 30s of smarter_move. Reloading...", "#ff0000", "Alerts");
//                     parent.window.location.reload();
//                     break;
//                 }
//                 await delay(250);
//             }
//             await movePromise;
//         } else {
//             log("⚠️ Boss spawn location unknown, skipping smarter_move.", "#ffaa00", "Alerts");
//         }

//         if (character.name === "Ulric") single_set();
//         if (character.name === "Riva") {
//             batch_equip({ itemName: "firebow", slot: "mainhand", level: 8, l: "l" });
//         }

//         // 3. Engage boss until dead
//         log("⚔️ Engaging boss...", "#ff00e6ff", "Alerts");
//         while (parent.S[boss_name] && parent.S[boss_name].live) {
//             const boss = get_boss_entity(boss_name);

//             if (!boss) {
//                 await delay(100);
//                 if (parent.S[boss_name] && parent.S[boss_name].live && boss_spawn) {
//                     await smarter_move(boss_spawn);
//                 }
//                 continue;
//             }

//             // Maintain distance: character.range - 5, with a tolerance
//             const dist = parent.distance(character, boss);
//             const desired_range = character.range - BOSS_RANGE_TOLERANCE;
//             if (
//                 (dist > desired_range + BOSS_RANGE_TOLERANCE || dist < desired_range - BOSS_RANGE_TOLERANCE) &&
//                 !character.moving
//             ) {
//                 const dx = boss.x - character.x;
//                 const dy = boss.y - character.y;
//                 const d = Math.hypot(dx, dy);
//                 const target_x = boss.x - (dx / d) * desired_range;
//                 const target_y = boss.y - (dy / d) * desired_range;
//                 if (Math.hypot(target_x - character.x, target_y - character.y) > 10) {
//                     move(target_x, target_y);
//                 }
//             }

//             if (!ATTACK_LOOP_ENABLED) ATTACK_LOOP_ENABLED = true;
//             if (!SKILL_LOOP_ENABLED) SKILL_LOOP_ENABLED = true;

//             await delay(100);

//         }

//         if (character.name === "Riva") {
//             batch_equip({ itemName: "pouchbow", slot: "mainhand", level: 10, l: "l" });
//         }

//         // 4. Move back to target location
//         let moving_home = true;
//         if (character.name === "Ulric") smarter_move(WARRIOR_TARGET).then(() => { moving_home = false; });
//         if (character.name === "Myras") smarter_move(HEALER_TARGET).then(() => { moving_home = false; });
//         if (character.name === "Riva") smarter_move(RANGER_TARGET).then(() => { moving_home = false; });
//         while (moving_home) {
//             // If boss respawns while returning, break and restart boss loop
//             if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
//                 log("🔄 Boss spawned while returning home. Restarting boss loop.", "#ffaa00", "Alerts");
//                 break;
//             }
//             await delay(100);
//         }
//     }
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // MOVE LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function move_loop() {

//     let delayMs = 200;

//     while (true) {
//         // Check if move loop is enabled
//         if (!MOVE_LOOP_ENABLED) {
//             await delay(delayMs);
//             continue;
//         }
//         // Don’t override an in-progress move
//         if (character.moving || smart.moving) {
//             await delay(delayMs);
//             continue;
//         }

//         let move_target = null;
//         let best_dist = Infinity;

//         // 1) Find the absolute closest monster in MONSTER_TYPES
//         for (const mtype of MONSTER_TYPES) {
//             const mon = get_nearest_monster_v2({ type: mtype, path_check: true });
//             if (!mon) continue;
//             const d = parent.distance(character, mon);
//             if (d < best_dist) {
//                 best_dist = d;
//                 move_target = mon;
//             }
//         }

//         // If monster is already in attack range, we don’t need to move
//         if (move_target && parent.distance(character, move_target) <= character.range) {
//             move_target = null;
//         }

//         // 3) If we’ve picked someone to follow, move directly to them
//         if (move_target) {
//             await move(move_target.real_x, move_target.real_y);
//             move_target = null;
//         }

//         await delay(delayMs);
//     }

// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // LOOT LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let lastLoot = null;
// let tryLoot = false;
// const chestThreshold = 12;

// // Count the number of available chests
// function getNumChests() {
//     return Object.keys(get_chests()).length;
// }

// // Async function to loot up to chestThreshold chests
// async function loot_chests() {
//     let looted = 0;
//     for (const id in get_chests()) {
//         if (looted >= chestThreshold) break;
//         parent.open_chest(id);
//         looted++;
//         await delay(60); // Small delay to avoid server spam
//     }
//     lastLoot = Date.now();
//     tryLoot = true;
// }

// async function loot_loop() {
//     let delayMs = 100;

//         while (true) {
//             // Check if loot loop is enabled
//             if (!LOOT_LOOP_ENABLED) {
//                 await delay(delayMs);
//                 continue;
//             }
//             const now = Date.now();

//             // If enough time has passed since last loot, and enough chests are present, and not feared
//             if ((lastLoot ?? 0) + 500 < now) {
//                 if (getNumChests() >= chestThreshold && character.fear < 6) {
//                     await loot_chests();
//                 }
//             }

//             // If chests drop below threshold after looting, reset tryLoot
//             if (getNumChests() < chestThreshold && tryLoot) {
//                 tryLoot = false;
//             }

//             await delay(delayMs);
//         }
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // POTION LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function potion_loop() {

//     while (true) {
//         // Check if potion loop is enabled
//         if (!POTION_LOOP_ENABLED) {
//             await delay(200);
//             continue;
//         }
//         // Calculate missing HP/MP
//         const HP_MISSING = character.max_hp - character.hp;
//         const MP_MISSING = character.max_mp - character.mp;

//         let used_potion = false;

//         // Use mana potion if needed
//         if (HP_MISSING >= 300) {
//             if (can_use("hp")) {
//                 use("hp");
//                 used_potion = true;
//             }
//         }

//         // Use health potion if needed
//         else if (MP_MISSING >= 400) {
//             if (can_use("mp")) {
//                 use("mp");
//                 used_potion = true;
//             }
//         }

//         if (used_potion) {
//             await delay(2010); // Wait 2 seconds after using a potion
//         } else {
//             await delay(10);   // Otherwise, check again in 10ms
//         }
//     }

// }

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