
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const home = 'targetron';
const mob_map = 'uhills';
const all_bosses = ['grinch', 'icegolem', 'dragold', 'mrgreen', 'mrpumpkin', 'greenjr', 'jr', 'franky', 'rgoo', 'bgoo'];

const CONFIG = {
	combat: {
		enabled: true,
		zapper_enabled: false,
		zapper_mobs: [home, ...all_bosses, 'sparkbot'],
		target_priority: ['CrownTown', 'CrownPriest'],
		all_bosses,
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 1.8,
		circle_radius: 25,
		avoid_mobs: true
	},

	healing: {
		party_heal_threshold: 0.65,
		party_heal_min_mp: 2000,
		absorb_enabled: true,
		dark_blessing_enabled: true
	},

	looting: {
		enabled: true,
		chest_threshold: 10,
		target_count: 8,
		equip_gold_gear: true,
		loot_cooldown: 3000
	},

	equipment: {
		auto_swap_sets: true,
		boss_luck_switch: true,
		boss_hp_thresholds: {
			mrpumpkin: 300000,
			mrgreen: 300000,
			bscorpion: 75000,
			pinkgoblin: 75000
		}
	},

	potions: {
		auto_buy: false,
		hp_threshold: 400,
		mp_threshold: 500,
		min_stock: 1000
	},

	party: {
		auto_manage: true,
		group_members: ['Myras', 'Ulric', 'Riva']
	},
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL CONSTANTS
// --------------------------------------------------------------------------------------------------------------------------------- //

const TICK_RATE = {
	main: 100,      // Main game loop
	action: 1,     // Combat/skill actions (dynamic)
	maintenance: 2000  // Inventory, potions, etc
};

const COOLDOWNS = {
	equip_swap: 300,
	zapper_swap: 200,
	cc: 125
};

const EVENT_LOCATIONS = [
	{ name: 'mrpumpkin', map: 'halloween', x: -222, y: 720 },
	{ name: 'mrgreen', map: 'spookytown', x: 610, y: 1000 }
];

const CACHE_TTL = 100; // Cache validity in ms

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

const state = {
	current: 'idle', // idle, looting, moving
	skin_ready: false,
	last_equip_time: 0,
	last_loot_time: 0,
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

const locations = {
	bat: [{ x: 1200, y: -782 }],
	bigbird: [{ x: 1304, y: -69 }],
	bluefairy: [{ x: -357, y: -675 }],
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
	sparkbot: [{ x: -544, y: -275 }],
	spider: [{ x: 895, y: -145 }],
	squig: [{ x: -1175, y: 422 }],
	targetron: [{ x: -544, y: -275 }],
	wolf: [{ x: 433, y: -2745 }],
	wolfie: [{ x: 113, y: -2014 }],
	xscorpion: [{ x: -495, y: 685 }]
};


const destination = {
	map: mobMap,
	x: locations[home][0].x,
	y: locations[home][0].y
};

const equipment_sets = {
	zap_on: [
		{ itemName: "zapper", slot: "ring2", level: 2, l: "u" }
	],
	zap_off: [
		{ itemName: "ringofluck", slot: "ring2", level: 2, l: "l" }
	],
	luck: [
		{ itemName: "xhelmet", slot: "helmet", level: 9, l: "l" },
		{ itemName: "tshirt88", slot: "chest", level: 4, l: "l" },
		{ itemName: "starkillers", slot: "pants", level: 8, l: "l" },
		{ itemName: "wingedboots", slot: "shoes", level: 9, l: "l" },
		{ itemName: "mpxgloves", slot: "gloves", level: 7, l: "l" },
		{ itemName: "sbelt", slot: "belt", level: 2, l: "l" },
		{ itemName: "lmace", slot: "mainhand", level: 9, l: "l" },
		{ itemName: "mshield", slot: "offhand", level: 10, l: "l" },
		{ itemName: "ringofluck", slot: "ring1", level: 2, l: "u" },
		{ itemName: "ringofluck", slot: "ring2", level: 2, l: "l" },
		{ itemName: "rabbitsfoot", slot: "orb", level: 3, l: "l" },
		{ itemName: "mpxamulet", slot: "amulet", level: 1, l: "l" },
		{ itemName: "bcape", slot: "cape", level: 7, l: "l" },
		{ itemName: "mearring", slot: "earring1", level: 1, l: "l" },
		{ itemName: "mearring", slot: "earring2", level: 1, l: "u" }
	],
	gold: [
		{ itemName: "wcap", slot: "helmet", level: 6, l: "l" },
		{ itemName: "wattire", slot: "chest", level: 6, l: "l" },
		{ itemName: "wbreeches", slot: "pants", level: 6, l: "l" },
		{ itemName: "wshoes", slot: "shoes", level: 6, l: "l" },
		{ itemName: "handofmidas", slot: "gloves", level: 9, l: "l" },
		{ itemName: "goldring", slot: "ring1", level: 1, l: "l" },
		{ itemName: "goldring", slot: "ring2", level: 0, l: "u" },
		{ itemName: "spookyamulet", slot: "amulet", level: 1, l: "l" }
	]
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

	// Priority 2: Named targets
	for (const name of CONFIG.combat.target_priority) {
		const target = get_nearest_monster_v2({
			target: name,
			check_min_hp: true,
			max_distance: character.range
		});
		if (target) return target;
	}

	return null;
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

		if (should_handle_events()) {
			handle_events();
		}
		else if (should_loot()) {
			await handle_looting();
		}
		else if (CONFIG.movement.enabled) {
			if (!get_nearest_monster({ type: home })) {
				handle_return_home();
			} else if (CONFIG.movement.circle_walk) {
				walk_in_circle();
			}
		}

		if (CONFIG.equipment.auto_swap_sets && state.skin_ready) {
			handle_equipment_swap();
		}

	} catch (e) {
		console.error('main_loop error:', e);
	}

	setTimeout(main_loop, TICK_RATE.main);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Combat and healing only
// --------------------------------------------------------------------------------------------------------------------------------- //

async function action_loop() {
	let delay = 10;

	try {
		if (is_disabled(character)) {
			return setTimeout(action_loop, 25);
		}

		update_cache();

		const MS_UNTIL_ATTACK = ms_to_next_skill('attack');

		if (MS_UNTIL_ATTACK < character.ping / 10) {
			const HEALED = await try_heal();

			if (!HEALED) {
				const TARGET = cache.target;
				if (TARGET && is_in_range(TARGET) && !smart.moving) {
					await attack(TARGET);
				}
			}
		}

		if (MS_UNTIL_ATTACK > 200) delay = 40;
		else if (MS_UNTIL_ATTACK > 60) delay = 20;
		else delay = 5;

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
		if (character.party) {
			await handle_party_heal();
		}

		// Dark Blessing
		if (CONFIG.healing.dark_blessing_enabled && !is_on_cooldown('darkblessing')) {
			await use_skill('darkblessing');
		}

		// Zapper
		if (CONFIG.combat.zapper_enabled) {
			await handle_zapper();
		}

	} catch (e) {
		console.error('skill_loop error:', e);
	}

	setTimeout(skill_loop, delay);
}

async function try_heal() {
	const HEAL_TARGET = cache.heal_target;
	if (!HEAL_TARGET) return false;

	const HEAL_THRESHOLD = HEAL_TARGET.max_hp - character.heal / 1.33;

	if (HEAL_TARGET.hp < HEAL_THRESHOLD && is_in_range(HEAL_TARGET)) {
		await heal(HEAL_TARGET);
		return true;
	}

	return false;
}

async function handle_curse() {
	if (is_on_cooldown('curse') || smart.moving) return;

	const X = locations[home][0].x;
	const Y = locations[home][0].y;

	let target = null;

	// Boss priority
	for (const b of CONFIG.combat.all_bosses) {
		const mb = get_nearest_monster_v2({ type: b });
		if (mb) {
			target = mb;
			break;
		}
	}

	// Home mob
	if (!target) {
		target = get_nearest_monster_v2({
			type: home,
			check_max_hp: true,
			max_distance: 175,
			point_for_distance_check: [X, Y]
		});
	}

	if (target && target.hp >= target.max_hp * 0.01 && !target.immune && is_in_range(target, 'curse')) {
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
	// 		game_log(`Boss Absorb → ${boss.mtype} from ${boss.target}`, '#FF3333');
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
			game_log(`Absorbing ${entity.target}`, '#FFA600');
			return;
		}
	}
}

async function handle_party_heal() {
	let threshold = CONFIG.healing.party_heal_threshold;

	if (character.map !== mobMap) {
		threshold = 0.99;
	}

	if (character.mp <= CONFIG.healing.party_heal_min_mp || is_on_cooldown('partyheal')) return;

	for (const name of cache.party_members) {
		const ally = get_player(name);
		if (!ally || ally.rip || ally.hp >= ally.max_hp * threshold) continue;

		await use_skill('partyheal');
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
	if (TARGETS.length > 0 && !HAS_ZAPPER && CAN_SWAP && HAS_ENOUGH_MP && character.map === mob_map) {
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
	if (TARGETS.length === 0 && HAS_ZAPPER && CAN_SWAP && character.map === mob_map) {
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
			party_maker();
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTION HANDLER - Separate from maintenance for faster response
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potion_loop() {
	let delay = 100;

	try {
		const HP_THRESHOLD = character.max_hp - CONFIG.potions.hp_threshold;
		const MP_THRESHOLD = character.max_mp - CONFIG.potions.mp_threshold;

		if (character.mp < MP_THRESHOLD && !is_on_cooldown('use_mp')) {
			use_skill('use_mp');
			reduce_cooldown('use_mp', character.ping * 0.95);
			delay = ms_to_next_skill('use_mp');
		} else if (character.hp < HP_THRESHOLD && !is_on_cooldown('use_hp')) {
			use_skill('use_hp');
			reduce_cooldown('use_hp', character.ping * 0.95);
			delay = ms_to_next_skill('use_hp');
		}
	} catch (e) {
		console.error('potion_loop error:', e);
	}

	setTimeout(potion_loop, delay || 2000);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_handle_events() {
	const holiday_spirit =
		parent?.S?.holidayseason && !character?.s?.holidayspirit;

	const has_handleable_event = EVENT_LOCATIONS.some(e =>
		parent?.S?.[e.name]?.live
	);

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
		.sort((a, b) => (a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp));

	if (!alive_sorted.length) return;

	const target = alive_sorted[0];

	if (!smart.moving) {
		handle_specific_event(target.name, target.map, target.x, target.y);
	}
}

async function handle_specific_event(event_type, map_name, x, y) {
	if (!parent?.S?.[event_type]?.live) return;

	const monster = get_nearest_monster({ type: event_type });
	if (!monster) {
		smart_move({ x, y, map: map_name });
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
	if (smart.moving) return;

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
	const stored_chest_count = Object.keys(load_chest_map()).length;
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
		if (CONFIG.looting.equip_goldgear/* && !is_set_equipped('gold')*/) {
			// equip_set('gold');
			swap_booster('luckbooster', 'goldbooster');
			await sleep(150);
		}

		let looted = 0;
		const max_loots = CONFIG.looting.chest_threshold * 5;

		const stored_chests = load_chest_map();
		for (const chest_id in stored_chests) {
			if (looted >= max_loots) break;
			parent.open_chest(chest_id);
			looted++;
		}

		await sleep(75);

		if (CONFIG.looting.equip_goldgear) {
			swap_booster('goldbooster', 'luckbooster');
		}
	} catch (e) {
		console.error('Looting error:', e);
	} finally {
		state.current = 'idle';
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
// EQUIPMENT MANAGEMENT
// --------------------------------------------------------------------------------------------------------------------------------- //

function handle_equipment_swap() {
	if (!CONFIG.equipment.auto_swap_sets || character.cc > COOLDOWNS.cc) return;

	const now = performance.now();
	if (now - state.last_equip_time < COOLDOWNS.equip_swap) return;

	let target_set = 'luck';

	if (CONFIG.equipment.boss_luck_switch && cache.nearest_boss) {
		const { mob, type } = cache.nearest_boss;
		const threshold = CONFIG.equipment.boss_hp_thresholds[type] || 0;
		target_set = mob.hp < threshold ? 'luck' : 'luck';
	}

	if (!is_set_equipped(target_set)) {
		state.last_equip_time = now;
		equip_set(target_set);
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

function equip_set(set_name) {
	const set = equipment_sets[set_name];
	if (set) {
		batch_equip(set);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function clear_inventory() {
	let lootMule = get_player('Riff');
	if (!lootMule) return;

	if (character.gold > 5000000) {
		send_gold(loot_mule, character.gold - 5000000);
	}

	const items_to_exclude = ['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'elixirluck', 'xptome', 'essenceoflife', 'jacko'];

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !items_to_exclude.includes(item.name) && !item.l && !item.s) {
			if (is_in_range(loot_mule, 'attack')) {
				send_item(loot_mule.id, i, item.q ?? 1);
			}
		}
	}
}

function inventory_sorter() {
	const slot_map = {
		tracker: 0,
		computer: 1,
		hpot1: 2,
		mpot1: 3,
		luckbooster: 4,
		elixirluck: 5,
		xptome: 6
	};

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;

		const target_slot = slot_map[item.name];
		if (target_slot !== undefined && i !== target_slot) {
			swap(i, target_slot);
		}
	}
}

function auto_buy_potions() {
	if (quantity('hpot1') < CONFIG.potions.min_stock) buy('hpot1', CONFIG.potions.min_stock);
	if (quantity('mpot1') < CONFIG.potions.min_stock) buy('mpot1', CONFIG.potions.min_stock);
	if (quantity('xptome') < 1) buy('xptome', 1);
}

function elixir_usage() {
	const required = 'elixirluck';
	// const current_elixir = character.slots.elixir?.name;
	// const current_qty = quantity(required);

	// if (current_elixir !== required) {
	// 	const slot = locate_item(required);
	// 	if (slot !== -1) use(slot);
	// }

	// if (current_qty < 2) {
	// 	buy(required, 2 - current_qty);
	// }
}

function swap_booster(current, target) {
	const slot = locate_item(current);
	if (slot !== -1) shift(slot, target);
}

function party_maker() {
	if (!CONFIG.party.auto_manage) return;

	const group = CONFIG.party.group_members;
	const party_lead = get_entity(group[0]);
	const current_party = character.party;
	const healer = get_entity('Myras');

	if (character.name === group[0]) {
		for (let i = 1; i < group.length; i++) {
			send_party_invite(group[i]);
		}
	} else {
		if (current_party && current_party !== group[0] && healer) {
			leave_party();
		}

		if (!current_party && party_lead) {
			send_party_request(group[0]);
		}
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function suicide() {
	if (!character.rip && character.hp < 2000) {
		parent.socket.emit('harakiri');
		game_log("Harakiri");
	}

	if (character.rip/* && locate_item("xptome") !== -1*/) {
		respawn();
	}
}

setInterval(suicide, 50);

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

		// Allow type to be an array for multiple types
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

		// Status effects check
		if (args.status_effects && !args.status_effects.every(effect => current.s[effect])) continue;

		// Min/max XP check
		if (args.min_xp !== undefined && current.xp < args.min_xp) continue;
		if (args.max_xp !== undefined && current.xp > args.max_xp) continue;

		// Attack limit
		if (args.max_att !== undefined && current.attack > args.max_att) continue;

		// Path check
		if (args.path_check && !can_move_to(current)) continue;

		// Distance calculation
		let c_dist = args.point_for_distance_check
			? Math.hypot(args.point_for_distance_check[0] - current.x, args.point_for_distance_check[1] - current.y)
			: parent.distance(character, current);

		if (args.max_distance !== undefined && c_dist > args.max_distance) continue;

		// HP check
		if (args.check_min_hp || args.check_max_hp) {
			let c_hp = current.hp;
			if ((args.check_min_hp && c_hp < optimal_hp) || (args.check_max_hp && c_hp > optimal_hp)) {
				optimal_hp = c_hp;
				target = current;
			}
			continue;
		}

		// Closest monster
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

async function batch_equip(data) {
	if (!Array.isArray(data)) {
		return Promise.reject({ reason: 'invalid', message: 'Not an array' });
	}
	if (data.length > 15) {
		return Promise.reject({ reason: 'invalid', message: 'Too many items' });
	}

	let valid_items = [];

	for (let i = 0; i < data.length; i++) {
		let item_name = data[i].item_name;
		let slot = data[i].slot;
		let level = data[i].level;
		let l = data[i].l;

		if (!item_name) continue;

		let found = false;
		if (parent.character.slots[slot]) {
			let slot_item = parent.character.items[parent.character.slots[slot]];
			if (slot_item && slot_item.name === item_name && slot_item.level === level && slot_item.l === l) {
				found = true;
			}
		}

		if (found) continue;

		for (let j = 0; j < parent.character.items.length; j++) {
			const item = parent.character.items[j];
			if (item && item.name === item_name && item.level === level && item.l === l) {
				valid_items.push({ num: j, slot: slot });
				break;
			}
		}
	}

	if (valid_items.length === 0) return;

	try {
		parent.socket.emit('equip_batch', valid_items);
		await parent.push_deferred('equip_batch');
	} catch (error) {
		console.error('Batch_equip error:', error);
		return Promise.reject({ reason: 'invalid', message: 'Failed to equip' });
	}
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
// 		await sleep(500);
// 		return skinChanger();
// 	}

// 	// 2. Ensure correct normal ring
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

function on_cm(name, data) {
	if (name == "CrownsAnal") {
		if (data.message == "location") {
			respawn();
			smart_move({ x: data.x, y: data.y, map: data.map });
			game_log("Repsawning & Moving");
		}
	}
	if (name == "Riff") {
		if (data.message == "Heal Merch") {
			use_skill("partyheal");
			game_log("Party Healing Riff");
		}
	}
}

function on_party_request(name) {
	if (CONFIG.party.groupMembers.includes(name)) {
		console.log('Accepting party request from ' + name);
		accept_party_request(name);
	}
}

function on_party_invite(name) {
	if (CONFIG.party.groupMembers.includes(name)) {
		console.log('Accepting party invite from ' + name);
		accept_party_invite(name);
	}
}

game.on('death', data => {
	const mob = parent.entities[data.id];
	if (!mob) return;

	const mob_name = mob.mtype;
	const mob_target = mob.target;

	const partyMembers = Object.keys(get_party() || {});

	if (mob_target === character.name || partyMembers.includes(mob_target)) {
		const luck_display = mob.cooperative ? character.luckm : data.luckm;
		const msg = `${mob_name} died with ${luck_display} luck`;
		game_log(msg, '#96a4ff');
		console.log(msg);
	}
});

character.on('loot', data => {
	if (data.id) {
		console.log(`${data.opener} looted chest goldm: ${data.goldm}`);
		game_log(`${data.opener} looted chest goldm: ${data.goldm}`, 'gold');

		// Remove chest ID after successful loot with delay to ensure it's gone
		setTimeout(() => {
			remove_chest_id(data.id);
		}, 2000);
	}
});

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
skill_loop();
maintenance_loop();
potion_loop();