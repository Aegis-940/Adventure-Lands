
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
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 1.8,
		circle_radius: 30,
		avoid_mobs: true
	},

	healing: {
		party_heal_threshold: 0.65,
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
		{ item_name: "supermittens", slot: "gloves", level: 6, l: "l" },
		{ item_name: "talkingskull", slot: "orb", level: 3, l: "l" },
		{ item_name: "harbringer", slot: "mainhand", level: 8, l: "l" },
		{ item_name: "mshield", slot: "offhand", level: 8, l: "l" },
	],
	gold: [
		{ item_name: "handofmidas", slot: "gloves", level: 4, l: "l" },
	],
	single_target: [
		{ item_name: "firestaff", slot: "mainhand", level: 8, l: "l" },
	],
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
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

		if (CONFIG.equipment.auto_swap_sets/* && state.skin_ready*/) {
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
		if (is_disabled(character)) return setTimeout(action_loop, 50);
		if (smart.moving) return setTimeout(action_loop, 50);

		update_cache();

		const ms = ms_to_next_skill('attack');

		if (ms === 0) {
			const HEALED = await try_heal();

			if (!HEALED) {
				const TARGET = cache.target;
				if (TARGET && is_in_range(TARGET) && !smart.moving) {
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
			log('Using Dark Blessing', '#AA00FF');
			await use_skill('darkblessing');
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
		log(`Cursing → ${target.mtype} (${Math.round((target.hp / target.max_hp) * 100)}%)`, '#FF33AA');
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
			log(`Absorbing → ${entity.mtype} targeting ${entity.target}`, '#FFA600');
			await use_skill('absorb', entity.target);
			return;
		}
	}
}


const PARTY_HEAL_COOLDOWN = 500;
let last_party_heal_time = 0;

async function handle_party_heal() {
	const now = Date.now();
	if (now - last_party_heal_time < PARTY_HEAL_COOLDOWN) return;

	let threshold = CONFIG.healing.party_heal_threshold;
	if (character.map !== mob_map) {
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

	// Calculate missing HP/MP
	const HP_MISSING = character.max_hp - character.hp;
	const MP_MISSING = character.max_mp - character.mp;

	let used_potion = false;
	let delay = 0;

	// Use health potion if needed
	if (MP_MISSING >= CONFIG.potions.mp_threshold) {
		use("mp");
		used_potion = true;
	}

	// Use health potion if needed
	if (HP_MISSING >= CONFIG.potions.hp_threshold) {
		use("hp");
		used_potion = true;
	}

	if (used_potion) {
		delay = 2050;
	} else {
		delay = 10;
	}

	setTimeout(potion_loop, delay);

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
		if (CONFIG.looting.equip_gold_gear && !is_set_equipped('gold')) {
			equip_set('gold');
			swap_booster('luckbooster', 'goldbooster');
			await sleep(100);
		}

		let looted = 0;
		const max_loots = CONFIG.looting.chest_threshold * 5;

		const stored_chests = get_chests();
		for (const chest_id in stored_chests) {
			if (looted >= max_loots) break;
			parent.open_chest(chest_id);
			looted++;
		}

		await sleep(150);

		if (CONFIG.looting.equip_gold_gear) {
			await swap_booster('goldbooster', 'luckbooster');
			await sleep(100);
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

async function equip_set(set_name) {
	const set = equipment_sets[set_name];
	if (set) {
		batch_equip(set);
	}
}

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

	const items_to_exclude = ['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'pumpkinspice', 'xptome', 'tracker', 'jacko', 'orbg', 'talkingskull', "mshield"];

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

async function swap_booster(current, target) {
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

		if (!item_name) {
			continue;
		}

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

	if (valid_items.length === 0) {
		return;
	}

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
	if (CONFIG.party.groupMembers.includes(name)) {
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


// // --------------------------------------------------------------------------------------------------------------------------------- //
// // 1) GLOBAL TOGGLES AND VARIABLES
// // --------------------------------------------------------------------------------------------------------------------------------- //

// const TARGET_LOWEST_HP = false;         // true: lowest HP, false: highest HP
// const PRIORITIZE_UNTARGETED = true;     // true: prefer monsters with no target first

// const POTION_HP_THRESHOLD = 700;        // Use potion if missing this much HP
// const POTION_MP_THRESHOLD = 400;        // Use potion if missing this much MP

// const ORBIT_RADIUS = 27;                // Combat Orbit radius
// const ORBIT_STEPS = 12;                 // Number of steps in orbit (e.g., 12 = 30 degrees per step)

// const PANIC_HP_THRESHOLD = 0.40;        // Panic if below 40% HP
// const PANIC_MP_THRESHOLD = 100;         // Panic if below 100 MP
// const SAFE_HP_THRESHOLD = 0.70;         // Resume normal if above 70% HP
// const SAFE_MP_THRESHOLD = 500;          // Resume normal if above 500 MP
// const PANIC_AGGRO_THRESHOLD = 99;       // Panic if this many monsters are targeting you

// const TARGET_LIMIT = 99;                // Max number of monsters allowed to target you before stopping attacks
// const HEAL_THRESHOLD = 1.3;             // Overheal factor to compensate for resistance. (max_hp - heal/threshold)
// const ATTACK_MP_THRESHOLD = 3000;       // Minimum MP required to perform attacks (throttles aggro)

// const PRIEST_SKILL_TOGGLES = {
// 	curse: true,
// 	absorb: true,
// 	party_heal: true,
// 	dark_blessing: true,
// };

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // SUPPORT FUNCTIONS
// // --------------------------------------------------------------------------------------------------------------------------------- //

// function lowest_health_partymember() {
// 	let party_mems = Object.keys(parent.party).filter(e => parent.entities[e] && !parent.entities[e].rip);
// 	let the_party = [];

// 	for (let key of party_mems)
// 		the_party.push(parent.entities[key]);

// 	the_party.push(character);

// 	// Populate health percentages
// 	let res = the_party.sort(function (a, b) {
// 		let a_rat = a.hp / a.max_hp;
// 		let b_rat = b.hp / b.max_hp;
// 		return a_rat - b_rat;
// 	});

// 	return res[0];
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // ATTACK LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function heal_attack_loop() {
//     // This loop is designed to be called ONCE and runs forever
//     let delayMs = 50;

//     while (true) {
//         try {

//             // --- Target selection ---
//             const heal_target = lowest_health_partymember();
//             const should_heal = (
//                 heal_target &&
//                 heal_target.hp < heal_target.max_hp - (character.heal / HEAL_THRESHOLD) &&
//                 is_in_range(heal_target)
//             );
//             // --- Healing logic ---
//             if (should_heal && HEAL_LOOP_ENABLED) {
//                 try {
//                     heal(heal_target);
//                 } catch (e) {
//                     catcher(e, "Heal loop error");
//                 }
//                 delayMs = ms_to_next_skill("attack") + character.ping + 50;
//                 await delay(delayMs);
//                 continue;
//             }

//             // --- Attacking logic ---
//             else if (ATTACK_LOOP_ENABLED) {
//                 // Gather all valid monsters in range
//                 let monsters = Object.values(parent.entities).filter(e =>
//                     e.type === "monster" &&
//                     (DUNGEON_LOOP_ENABLED || MONSTER_TYPES.includes(e.mtype)) &&
//                     !e.dead &&
//                     e.visible &&
//                     parent.distance(character, e) <= character.range
//                 );

//                 // Prioritize untargeted if toggle is on
//                 if (PRIORITIZE_UNTARGETED) {
//                     monsters = monsters.sort((a, b) => {
//                         let aUntargeted = !a.target ? -1 : 0;
//                         let bUntargeted = !b.target ? -1 : 0;
//                         return aUntargeted - bUntargeted;
//                     });
//                 }

//                 // Prioritize by HP (lowest or highest)
//                 if (TARGET_LOWEST_HP) {
//                     monsters = monsters.sort((a, b) => (a.hp / a.max_hp) - (b.hp / b.max_hp));
//                 } else {
//                     monsters = monsters.sort((a, b) => (b.hp / b.max_hp) - (a.hp / a.max_hp));
//                 }

//                 // Prioritize: cursed > highest HP
//                 let target = monsters.find(m => m.s && m.s.cursed)
//                     || (monsters.length ? monsters.reduce((a, b) => (b.hp < a.hp ? a : b)) : null);

//                 let monsters_targeting_me = monsters.filter(e => e.target === character.name).length;

//                 if (
//                     target &&
//                     is_in_range(target) &&
//                     !smart.moving &&
//                     character.mp >= ATTACK_MP_THRESHOLD &&
//                     monsters_targeting_me < TARGET_LIMIT
//                 ) {
//                     try {
//                         attack(target);
//                     } catch (e) {
//                         catcher(e, "Attack loop error");
//                     }
//                     delayMs = ms_to_next_skill("attack") + character.ping + 50;
//                     await delay(delayMs);
//                     continue;
//                 }
//             }

//             await delay(100);
//         } catch (e) {
//             catcher(e, "heal_attack_loop (outer)");
//             await delay(1000); // Prevent rapid error spam
//         }
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
// // SKILL LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function skill_loop() {

//     let delayMs = 100;

//     while (true) {
//         // Check if skill loop is enabled
//         if (!SKILL_LOOP_ENABLED) {
//             await delay(delayMs);
//             continue;
//         }
//         const X = character.real_x;
//         const Y = character.real_y;
//         const dead = character.rip;
//         const disabled = !parent.is_disabled(character);
//         const mapsToExclude = [];
//         const eventMaps = [];
//         const eventMobs = [];

//         // Use global PRIEST_SKILL_TOGGLES if you want toggles to persist
//         if (character.ctype === "priest") {
//             await handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps);
//         }

//         await delay(delayMs);
//     }

// }

// async function safe_call(fn, name) {
// 	try {
// 		await fn();
// 	} catch (e) {
// 		game_log(`Error in ${name}:`, e);
// 	}
// }

// const CURSE_WHITELIST = ["mrpumpkin", "mrgreen", "phoenix", "dryad", "bscorpion"];
// const ABSORB_BLACKLIST = ["mrpumpkin", "mrgreen"];

// async function handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps, zapperMobs) {
//     if (dead || !disabled) return;

//     if (!smart.moving)
//         safe_call(() => handle_cursing(X, Y, CURSE_WHITELIST), "handle_cursing");
//     if (!smart.moving)
//         safe_call(() => handle_absorb(mapsToExclude, eventMobs, eventMaps, ABSORB_BLACKLIST), "handle_absorb");
//     if (PRIEST_SKILL_TOGGLES.party_heal)
//         safe_call(() => handle_party_heal(), "handle_party_heal");
//     if (!smart.moving)
//         safe_call(() => handle_dark_blessing(), "handle_dark_blessing");
//     if (PRIEST_SKILL_TOGGLES.zap_spam && !smart.moving)
//         safe_call(() => handleZapSpam(zapperMobs), "handleZapSpam");
// }

// async function handle_cursing(X, Y, whitelist) {
//     const ctarget = get_nearest_monster_v2({
//         type: whitelist,
//         check_max_hp: true,
//         max_distance: 75,
//         point_for_distance_check: [X, Y],
//     }) || get_targeted_monster();

//     if (
//         ctarget &&
//         !ctarget.immune &&
//         whitelist.includes(ctarget.mtype)
//     ) {
//         if (!is_on_cooldown("curse") && character.mp > 2000) {
//             try {
//                 await use_skill("curse", ctarget);
//             } catch (e) {
//                 if (e?.reason !== "cooldown") throw e;
//             }
//         }
//     }
// }

// let absorb_last_used = 0;
// const ABSORB_COOLDOWN = 2000; // 2 second cooldown for absorb

// async function handle_absorb(mapsToExclude, eventMobs, eventMaps, blacklist) {
//     const now = Date.now();
//     if (now - absorb_last_used < ABSORB_COOLDOWN) return;

//     const partyNames = Object.keys(parent.party).filter(name => name !== character.name);

//     const attackers = {};
//     for (const id in parent.entities) {
//         const monster = parent.entities[id];
//         if (
//             monster.type !== "monster" ||
//             monster.dead ||
//             !monster.visible ||
//             blacklist.includes(monster.mtype)
//         ) continue;
//         if (partyNames.includes(monster.target)) attackers[monster.target] = true;
//     }

//     for (const name of partyNames) {
//         if (attackers[name] && character.hp > character.max_hp * 0.5 && character.mp > 1000) {
//             try {
//                 await use_skill("absorb", name);
//                 game_log(`Absorbing ${name}`, "#FFA600");
//                 absorb_last_used = now;
//             } catch (e) {
//                 if (e?.reason !== "cooldown") throw e;
//             }
//             return;
//         }
//     }
// }

// let last_party_heal_time = 0;
// async function handle_party_heal(minMissingHpMap = {}, minMp = 2000) {
//     if (character.mp <= minMp) return;
//     if (is_on_cooldown("partyheal")) return;

//     // Default thresholds for each character
//     const defaultThresholds = {
//         Myras: character.heal + 1500,
//         Ulric: character.heal + 1000,
//         Riva: character.heal + 1500,
//         Riff: character.heal + 500
//     };

//     // Merge user-provided thresholds with defaults
//     const thresholds = { ...defaultThresholds, ...minMissingHpMap };

//     // Use remote party info for up-to-date HP/MP, even across maps
//     for (const name of Object.keys(parent.party)) {
//         // if (name === character.name) continue;
//         const info = get(name + '_newparty_info');
//         if (!info || info.rip) continue;
//         const threshold = thresholds[name] !== undefined ? thresholds[name] : 2000;
//         if ((info.max_hp - info.hp) > threshold) {
//             const now = Date.now();
//             if (now - last_party_heal_time < 500) return; // Only block if about to actually cast
//             try {
//                 use_skill("partyheal");
//                 last_party_heal_time = Date.now();
//             } catch (e) {
//                 if (e?.reason !== "cooldown") throw e;
//             }
//             break;
//         }
//     }
// }

// let last_dark_blessing_time = 0;
// async function handle_dark_blessing() {
//     if (is_on_cooldown("darkblessing")) return;
//     const now = Date.now();
//     if (now - last_dark_blessing_time < 500) return;
//     try {
//         use_skill("darkblessing");
//         last_dark_blessing_time = Date.now();
//     } catch (e) {
//         // Only log errors that are not cooldown-related
//         if (!(e && (e.reason === "cooldown" || (e.message && e.message.toLowerCase().includes("cooldown"))))) {
//             catcher(e, "handle_dark_blessing");
//         }
//     }
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // LOOT LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let last_loot_time = null;
// let tryLoot = false;
// const chestThreshold = 6;

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
//         await delay(30); // Small delay to avoid server spam
//     }
//     last_loot_time = Date.now();
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
//             if ((last_loot_time ?? 0) + 1000 < now) {
//                 if (getNumChests() >= chestThreshold) {
//                     await batch_equip([{ itemName: "handofmidas", slot: "gloves", level: 4 }]);
//                     await shift(5, 'goldbooster');
//                     await loot_chests();
//                     await delay(100);
//                     await batch_equip([{ itemName: "supermittens", slot: "gloves", level: 6 }]);
//                     await shift(5, 'luckbooster');
//                     await delay(500);
//                 }
                
//                  // Check if gloves are "supermittens", if not, try to equip again
//                 if (!character.slots.gloves || character.slots.gloves.name !== "supermittens") {
//                     await batch_equip([{ itemName: "supermittens", slot: "gloves", level: 6 }]);
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
// // POTIONS LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function potion_loop() {
//     while (true) {
//         if (!POTION_LOOP_ENABLED) {
//             await delay(200);
//             continue;
//         }

//         try {
//             // Only use MP potions
//             const HP_MISSING = character.max_hp - character.hp;
//             const MP_MISSING = character.max_mp - character.mp;
            
//             if (HP_MISSING >= 4000 && can_use("mp")) {
//                  await use_skill("partyheal");
//                  await delay(Math.max(ms_to_next_skill("use_mp"), 50))
//             } else if (MP_MISSING >= POTION_MP_THRESHOLD && can_use("mp")) {
//                 use("mp");
//                 await delay(Math.max(ms_to_next_skill("use_mp"), 50));
//             } else {
//                 await delay(50);
//             }
//         } catch (e) {
//             catcher(e, "potion_loop");
//             await delay(500);
//         }
//     }
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // DUNGEON LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function dungeon_loop() {

//     while (true) {

//         if (!DUNGEON_LOOP_ENABLED) {
//             await delay(1000);
//             continue;
//         }

//         // // Set orbit_origin to Myras' location (map, x, y)
//         // const myras = Object.values(parent.entities).find(e => e.type === "character" && e.name === "Myras");
//         // if (myras) {
//         //     orbit_origin = { map: myras.map, x: myras.x, y: myras.y };
//         // } else {
//         //     orbit_origin = null;
//         // }

//         await delay(200);

//     }

// }

