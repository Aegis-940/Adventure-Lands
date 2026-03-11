
// ============================================================================
// CONFIGURATION - Toggle features here instead of editing code
// ============================================================================

const home = 'dryad';
const mob_map = 'mforest';
const all_bosses = ['grinch', 'icegolem', 'dragold', 'mrgreen', 'mrpumpkin', 'greenjr', 'jr', 'franky', 'rgoo', 'bgoo'];

const CONFIG = {
	combat: {
		enabled: true,
		target_priority: ['Myras'],
		all_bosses,
		cleave_min_mobs: 1,
		agitate_min_mobs: 3,
		taunt_ents: false
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 1.8,
		circle_radius: 35,
	},

	equipment: {
		auto_swap_sets: true,
		boss_luck_switch: true,
		boss_hp_thresholds: {
			mrpumpkin: 200000,
			mrgreen: 200000,
		},
		single_target_maps: ['halloween', 'spookyforest', 'desertland'],
		aoe_maps: ['cave', 'main', 'goobrawl', 'level2n', 'level2w', 'mforest', 'tunnel', 'uhills', 'winterland'],
		cleave_maps: ['cave', 'desertland', 'goobrawl', 'halloween', 'level2n', 'level2w', 'main', 'mforest', 'spookytown', 'uhills', 'winterland', 'level2e'],
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
		group_members: ['Myras', 'Ulric', 'Riva']
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

// ============================================================================
// CONSTANTS
// ============================================================================

const TICK_RATE = {
	main: 100,
	action: 1,
	skill: 40,
	equipment: 25,
	maintenance: 2000
};

const COOLDOWNS = {
	weapon_swap: 1000,
	cc: 135
};

const EVENT_LOCATIONS = [
	{ name: 'mrpumpkin', map: 'halloween', x: -222, y: 720 },
	{ name: 'mrgreen', map: 'spookytown', x: 610, y: 1000 },
	{ name: 'dragold', map: 'cave', x: 873, y: -727 },
];

const CACHE_TTL = 100;

// ============================================================================
// STATE & CACHE
// ============================================================================

const state = {
	skin_ready: false,
	last_basher_swap: 0,
	last_cleave_swap: 0,
	last_cape_swap: 0,
	last_coat_swap: 0,
	last_boss_set_swap: 0,
	last_booster_swap: 0,
	angle: 0,
	last_angle_update: performance.now()
};

const cache = {
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

// ============================================================================
// LOCATION & EQUIPMENT DATA
// ============================================================================

const locations = {
	bat: [{ x: 1200, y: -782 }],
	bigbird: [{ x: 1304, y: -79 }],
	bscorpion: [{ x: -408, y: -1241 }],
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
	odino: [{ x: -42, y: 746 }],
	oneeye: [{ x: -270, y: 160 }],
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
		{ item_name: "fireblade", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "fireblade", slot: "offhand", level: 9, l: "l" },
	],
	aoe: [
		{ item_name: "fireblade", slot: "mainhand", level: 9, l: "l" },
		{ item_name: "ololipop", slot: "offhand", level: 9, l: "l" },
	],
	basher: [
		{ item_name: "basher", slot: "mainhand", level: 8, l: "l" }
	],
	bataxe: [
		{ item_name: "bataxe", slot: "mainhand", level: 7, l: "l" }
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
};

// ============================================================================
// CORE UTILITIES
// ============================================================================

function update_cache() {
	if (!cache.is_valid()) {
		cache.target = find_best_target();
		cache.party_members = get_party_members();
		cache.last_update = performance.now();
	}

	cache.tank_entity = get_entity('Myras')
	cache.monsters_in_cleave_range = find_monsters_in_cleave_range();
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

	// Priority 2: Targets with curse
	for (const name of CONFIG.combat.target_priority) {
		const target = get_nearest_monster_v2({
			target: name,
			max_distance: character.range,
			status_effects: ['cursed']
		});
		if (target) return target;
	}

	// Priority 3: Targets with max HP
	for (const name of CONFIG.combat.target_priority) {
		const target = get_nearest_monster_v2({
			target: name,
			check_max_hp: true,
			max_distance: character.range
		});
		if (target) return target;
	}

	return null;
}

function get_party_members() {
	return Object.keys(get_party() || {});
}

function find_monsters_in_cleave_range() {
	return Object.values(parent.entities).filter(e =>
		e?.type === 'monster' &&
		!e.dead &&
		e.visible &&
		distance(character, e) <= G.skills.cleave.range
	);
}

function mob_count() {
	const tank_name = cache.tank_entity?.name;
	if (!tank_name) return 0;

	return Object.values(parent.entities).filter(e =>
		e?.type === 'monster' &&
		e.target === tank_name &&
		!e.dead
	).length;
}

// ============================================================================
// MAIN TICK LOOP
// ============================================================================

async function main_loop() {
	try {
		if (is_disabled(character)) {
			return setTimeout(main_loop, 250);
		}

		update_cache();

		if (should_handle_events()) {
			handle_events();
		}

		else if (CONFIG.movement.enabled) {
			if (!get_nearest_monster({ type: home })) {
				handle_return_home();
			} else if (CONFIG.movement.circle_walk) {
				walk_in_circle();
			}
		}

	} catch (e) {
		console.error('main_loop error:', e);
	}

	setTimeout(main_loop, TICK_RATE.main);
}

// ============================================================================
// ACTION LOOP - Attack only
// ============================================================================

async function action_loop() {
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		// Keep cache fresh even while waiting on cooldowns
		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill('attack');

		if (ms === 0) {
			await attack(target);
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}

	} catch (e) {
		console.error('action_loop error:', e);
		delay = 1;
	}

	setTimeout(action_loop, delay);
}

// ============================================================================
// SKILL LOOP - All warrior skills
// ============================================================================

async function skill_loop() {
	const delay = TICK_RATE.skill;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const tank = cache.tank_entity;

		// Warcry
		if (CONFIG.skills.warcry_enabled && !is_on_cooldown('warcry') && !character.s.warcry && character.s.darkblessing) {
			await use_skill('warcry');
		}

		// Stomp
		// if (CONFIG.skills.stomp_enabled && tank?.hp < tank?.max_hp * 0.3) {
		// 	await handle_stomp();
		// }

		// Cleave
		if (CONFIG.skills.cleave_enabled) {
			await handle_cleave();
		}

		// Agitate
		if (CONFIG.skills.agitate_enabled && tank) {
			await handle_agitate(tank);
		}

		// Taunt
		if (CONFIG.skills.taunt_enabled) {
			await handle_taunt();
		}

		// Charge
		// if (CONFIG.skills.charge_enabled && !is_on_cooldown('charge')) {
		// 	await use_skill('charge');
		// }

		// Hardshell
		// if (CONFIG.skills.hardshell_enabled && !is_on_cooldown('hardshell') && character.hp < CONFIG.skills.hardshell_hp_threshold) {
		// 	await use_skill('hardshell');
		// }

	} catch (e) {
		console.error('skill_loop error:', e);
	}

	setTimeout(skill_loop, delay);
}

async function handle_stomp() {
	if (is_on_cooldown('stomp')) return;
	if (ms_to_next_skill('attack') <= 75) return;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== 'basher';
	const now = performance.now();

	if (needs_swap && now - state.last_basher_swap > COOLDOWNS.weapon_swap) {
		state.last_basher_swap = now;
		unequip('offhand');
		batch_equip(equipment_sets.basher);
	}

	await use_skill('stomp');

	if (needs_swap) {
		const target_set = mob_count() === 1 ? 'single' : 'aoe';
		batch_equip(equipment_sets[target_set]);
	}
}

async function handle_cleave() {
	const ms_until_cleave = ms_to_next_skill('cleave');
	if (ms_until_cleave !== 0) return;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== 'bataxe';
	const now = performance.now();

	if (now - state.last_cleave_swap > COOLDOWNS.weapon_swap) {
		state.last_cleave_swap = now;
		unequip('offhand');
		batch_equip(equipment_sets.bataxe);
	}

	await use_skill('cleave');

	// const target_set = mob_count() === 1 ? 'single' : 'aoe';
	batch_equip(equipment_sets.aoe);

}

function can_cleave() {
	// Fast checks first
	if (!CONFIG.equipment.cleave_maps.includes(character.map)) return false;
	if (smart.moving || is_disabled(character)) return false;
	if (character.cc >= COOLDOWNS.cc) return false;
	if (ms_to_next_skill('attack') <= 75) return false;

	const required_mp = character.mp_cost * 2 + G.skills.cleave.mp + 320;
	if (character.mp < required_mp) return false;

	const tank = cache.tank_entity;
	if (!tank) return false;

	// Don't cleave if low boss exists
	const low_boss = Object.values(parent.entities).find(e =>
		e?.type === 'monster' &&
		CONFIG.combat.all_bosses.includes(e.mtype) &&
		!e.dead &&
		e.hp < CONFIG.equipment.boss_hp_thresholds[e.mtype]
	);
	if (low_boss) return false;

	return cache.monsters_in_cleave_range.length >= CONFIG.combat.cleave_min_mobs;
}

async function handle_agitate(tank) {
	if (is_on_cooldown('agitate') || !tank || tank.rip) return;

	const skill_range = G.skills.agitate.range;
	const nearby_mobs = Object.values(parent.entities).filter(e =>
		e.visible && !e.dead && e.type === 'monster' && distance(character, e) <= skill_range
	);

	const crabx = nearby_mobs.filter(e => e.mtype === 'crabx');
	const untargeted_crabs = crabx.filter(m => !m.target);

	// Crabx priority
	if (crabx.length >= 5 && untargeted_crabs.length === 5) {
		await use_skill('agitate');
		return;
	}

	// Other mobs
	const other_mobs = nearby_mobs.filter(e => ['sparkbot', 'jr', 'greenjr', home].includes(e.mtype));
	const untargeted_other = other_mobs.filter(m => !m.target);

	if (other_mobs.length >= CONFIG.combat.agitate_min_mobs && untargeted_other.length >= CONFIG.combat.agitate_min_mobs && !smart.moving) {
		const needs_protecting = ['porcupine', 'redfairy'];
		const nearby_threat = needs_protecting.some(type => {
			const target = get_nearest_monster({ type });
			return target && is_in_range(target, 'agitate');
		});

		if (!nearby_threat && distance(character, tank) <= 100) {
			await use_skill('agitate');
			game_log('Agitating!!');
		}
	}
}

async function handle_taunt() {
	if (is_on_cooldown('taunt')) return;
	if (!CONFIG.combat.taunt_ents) return;

	const skill_range = G.skills.taunt.range;
	const ents = Object.values(parent.entities).filter(e =>
		e.type === 'monster' &&
		e.mtype === 'ent' &&
		e.target !== character.name &&
		e.visible &&
		!e.dead &&
		distance(character, e) <= skill_range
	);

	for (const ent of ents) {
		if (is_in_range(ent, 'taunt')) {
			await use_skill('taunt', ent.id);
			game_log(`Taunting ${ent.name}`, '#FFA600');
			break;
		}
	}
}

// ============================================================================
// MAINTENANCE LOOP
// ============================================================================

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
		scare();

		if (character.rip && locate_item('xptome') !== -1) {
			respawn();
		}

	} catch (e) {
		console.error('maintenance_loop error:', e);
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

// ============================================================================
// POTION LOOP
// ============================================================================

async function potion_loop() {
	let delay = 100;

	try {
		const hpThreshold = character.max_hp - CONFIG.potions.hp_threshold;
		const mpThreshold = character.max_mp - CONFIG.potions.mp_threshold;

		if (character.mp < mpThreshold && !is_on_cooldown('use_mp')) {
			use_skill('use_mp');
			reduce_cooldown('use_mp', character.ping * 0.95);
			delay = ms_to_next_skill('use_mp');
		} else if (character.hp < hpThreshold && !is_on_cooldown('use_hp')) {
			use_skill('use_hp');
			reduce_cooldown('use_hp', character.ping * 0.95);
			delay = ms_to_next_skill('use_hp');
		}
	} catch (e) {
		console.error('potion_loop error:', e);
	}

	setTimeout(potion_loop, delay || 2000);
}

// ============================================================================
// EQUIPMENT MANAGEMENT LOOP - Independent from combat
// ============================================================================

async function equipment_loop() {
	const delay = TICK_RATE.equipment;

	try {
		if (!state.skinReady) {
			return setTimeout(equipment_loop, delay);
		}

		if (character.cc > COOLDOWNS.cc) {
			return setTimeout(equipment_loop, delay);
		}

		const now = performance.now();
		const swap_cooldown = CONFIG.equipment.swap_cooldown;

		// Don't swap if using special weapons
		const mainhand = character.slots?.mainhand?.name;
		if (mainhand === 'basher' || mainhand === 'bataxe') {
			return setTimeout(equipment_loop, delay);
		}

		// --- FIND ACTIVE BOSS ---
		const active_boss = EVENT_LOCATIONS
			.map(e => ({ name: e.name, data: parent.S[e.name] }))
			.find(e => e.data?.live);

		// --- BOOSTER SWAP ---
		if (CONFIG.equipment.booster_swap_enabled && now - state.last_booster_swap > swap_cooldown) {
			let desired_booster = 'xpbooster';

			if (active_boss && active_boss.data.hp < CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
				desired_booster = 'luckbooster';
			}

			const current_booster_slot = locate_item(desired_booster);
			if (current_booster_slot === -1) {
				const other_booster_slot = find_booster_slot();
				if (other_booster_slot !== null) {
					shift(other_booster_slot, desired_booster);
					state.last_booster_swap = now;
				}
			}
		}

		// --- CAPE SWAP ---
		if (CONFIG.equipment.cape_swap_enabled && now - state.last_cape_swap > swap_cooldown) {
			let target_cape_set = null;
			const chest_count = get_num_chests();
			const num_targets = cache.tankEntity ? get_num_targets(cache.tankEntity.name) : 0;

			if (chest_count >= CONFIG.equipment.chest_threshold && num_targets < 6) {
				target_cape_set = 'stealth';
			} else {
				target_cape_set = 'cape';
			}

			if (target_cape_set && !isSetEquipped(target_cape_set)) {
				equipSet(target_cape_set);
				state.last_cape_swap = now;
			}
		}

		// --- COAT SWAP (only when not at boss or boss HP high) ---
		if (CONFIG.equipment.coat_swap_enabled && (!active_boss || active_boss.data.hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name]) && now - state.last_coat_swap > swap_cooldown) {
			let target_coat_set = null;

			if (character.mp > CONFIG.equipment.mp_thresholds.upper) {
				target_coat_set = 'stat';
			} else if (character.mp < CONFIG.equipment.mp_thresholds.lower) {
				target_coat_set = 'mana';
			}

			if (target_coat_set && !isSetEquipped(target_coat_set)) {
				equipSet(target_coat_set);
				state.last_coat_swap = now;
			}
		}

		// --- BOSS/WEAPON SET LOGIC ---
		if (now - state.last_boss_set_swap > swap_cooldown) {
			let target_set = null;

			// Boss-specific logic
			if (CONFIG.equipment.boss_set_swap_enabled && active_boss) {
				const boss_hp = active_boss.data.hp;
				if (boss_hp > CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
					   if (character.map !== mob_map) {
						target_set = 'dps';
					}
				} else {
					target_set = 'luck';
				}
			}
			// Home map logic
			   else if (character.map === mob_map) {
				target_set = 'dps_accessories';

				// Weapon swap based on mob count/map
				if (CONFIG.equipment.weapon_swap_enabled) {
					const home_count = mob_count();
					if (home_count === 1) {
						if (!is_set_equipped('single')) {
							equip_set('single');
							state.last_boss_set_swap = now;
						}
					} else if (home_count > 1) {
						if (!is_set_equipped('aoe')) {
							equip_set('aoe');
							state.last_boss_set_swap = now;
						}
					} else {
						// Map-based fallback
						if (CONFIG.equipment.aoe_maps.includes(character.map) && !is_set_equipped('aoe')) {
							equip_set('aoe');
							state.last_boss_set_swap = now;
						} else if (CONFIG.equipment.single_target_maps.includes(character.map) && !is_set_equipped('single')) {
							equip_set('single');
							state.last_boss_set_swap = now;
						}
					}
				}
			}

			// Apply boss set if determined
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
	let target_count = 0;

	for (const id in parent.entities) {
		const entity = parent.entities[id];
		if (entity.type === 'monster' && entity.target === player_name) {
			target_count++;
		}
	}

	return target_count;
}

// ============================================================================
// MOVEMENT FUNCTIONS
// ============================================================================

function should_handle_events() {
	const holiday_spirit = parent?.S?.holidayseason && !character?.s?.holidayspirit;
	const has_handleable_event = EVENT_LOCATIONS.some(e => parent?.S?.[e.name]?.live);
	return holiday_spirit || has_handleable_event;
}

function handle_events() {
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit) {
		if (!smart.moving) {
			scare();
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
		scare();
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function clear_inventory() {
	const loot_mule = get_player('Riff');
	if (!loot_mule) return;

	if (character.gold > 5000000) {
		send_gold(loot_mule, character.gold - 5000000);
	}

	const items_to_exclude = ['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'pumpkinspice', 'xptome', 'tracker', 'jacko'];

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !items_to_exclude.includes(item.name) && !item.l && !item.s) {
			if (is_in_range(loot_mule, 'attack')) {
				send_item(loot_mule.id, i, item.q ?? 1);
			}
		}
	}
}

const move_stuff = {
	basher: 40,
	computer: 1,
	fireblade: 35,
	hpot1: 2,
	luckbooster: 6,
	mpot1: 3,
	pumpkinspice: 5,
	rapier: 41,
	bataxe: 39,
	tracker: 0,
	candycanesword: 36,
	xptome: 4,
};

function inventory_sorter() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || !(item.name in move_stuff)) continue;

		const target_slot = move_stuff[item.name];
		if (i !== target_slot) {
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
	const required = 'pumpkinspice';
	const current_elixir = character.slots.elixir?.name;

	if (current_elixir !== required) {
		const slot = locate_item(required);
		if (slot !== -1) use(slot);
	}
}

let target_start_times = {};

function scare() {
	const slot = character.items.findIndex(i => i && i.name === 'jacko');
	const current_time = performance.now();
	let should_scare = false;

	for (const id in parent.entities) {
		const current = parent.entities[id];

		if (current.type === 'monster' && current.target === character.name && current.mtype !== 'grinch') {
			if (!target_start_times[id]) {
				target_start_times[id] = current_time;
			} else if (current_time - target_start_times[id] > 1000) {
				should_scare = true;
			}
		} else {
			delete target_start_times[id];
		}
	}

	if (should_scare && !is_on_cooldown('scare') && slot !== -1) {
		equip(slot);
		use('scare');
		equip(slot);
	}
}

function party_maker() {
	if (!CONFIG.party.auto_manage) return;

	const group = CONFIG.party.group_members;
	const party_lead = get_entity(group[0]);
	const current_party = character.party;
	const healer = get_entity('CrownPriest');

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

// ============================================================================
// ESSENTIAL HELPER FUNCTIONS
// ============================================================================

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
		console.error('batch_equip error:', error);
		return Promise.reject({ reason: 'invalid', message: 'Failed to equip' });
	}
}

function is_set_equipped(set_name) {
	const set = equipmentSets[set_name];
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
	} else {
		console.error(`Set "${set_name}" not found.`);
	}
}
// ============================================================================
// SKIN CHANGER
// ============================================================================

// const skinConfigs = {
// 	warrior: {
// 		skin: 'tf_green',
// 		skinRing: { name: 'tristone', level: 1, locked: 'l' },
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

// ============================================================================
// EVENT HANDLERS
// ============================================================================

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

game.on('death', data => {
	const mob = parent.entities[data.id];
	if (!mob || !mob.cooperative) return;

	const mob_name = mob.mtype;
	const mob_target = mob.target;
	const party_members = Object.keys(get_party() || {});

	if (mob_target === character.name || party_members.includes(mob_target)) {
		const msg = `${mob_name} died with ${character.luckm} luck`;
		game_log(msg, '#96a4ff');
		console.log(msg);
	}
});

function send_updates() {
	parent.socket.emit('send_updates', {});
}
setInterval(send_updates, 20000);

// ============================================================================
// START ALL LOOPS
// ============================================================================

main_loop();
action_loop();
skill_loop();
equipment_loop();
maintenance_loop();
potion_loop();

//=============================================================================


// // --------------------------------------------------------------------------------------------------------------------------------- //
// // 1) GLOBAL LOOP SWITCHES AND VARIABLES
// // --------------------------------------------------------------------------------------------------------------------------------- //

// const TARGET_LOWEST_HP = false;         // true: lowest HP, false: highest HP
// const ATTACK_UNTARGETED = false;        // Prevent attacking mobs not targeting anyone

// const POTION_HP_THRESHOLD = 300;        // Use potion if missing this much HP
// const POTION_MP_THRESHOLD = 400;        // Use potion if missing this much MP

// const ORBIT_RADIUS = 27;                // Combat Orbit radius
// const ORBIT_STEPS = 12;                 // Number of steps in orbit (e.g., 12 = 30 degrees per step)

// const PANIC_HP_THRESHOLD = 0.50;        // Panic if below 50% HP
// const PANIC_MP_THRESHOLD = 1;           // Panic if below 100 MP
// const SAFE_HP_THRESHOLD = 0.75;         // Resume normal if above 75% HP
// const SAFE_MP_THRESHOLD = 500;          // Resume normal if above 500 MP
// const PANIC_AGGRO_THRESHOLD = 99;       // Panic if this many monsters are targeting you

// const AGITATE_MP_THRESHOLD = 500;       // Minimum MP Warrior must have to cast Agitate
// const CLEAVE_MP_THRESHOLD = 900;        // Minimum MP Warrior must have to cast Cleave

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // ATTACK LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// async function sugar_rush_check(target) {

//     attack(target);

//     if (character.s.sugarrush === undefined && WARRIOR_TARGET === MONSTER_LOCS.bscorpion) {
//         batch_equip([{ num: 6, slot: "mainhand" }, { num: 7, slot: "offhand" }]);
//         await delay(100);
//         batch_equip([{ num: 6, slot: "mainhand" }, { num: 7, slot: "offhand" }]);
//         await delay(200);
//         if (character.s.sugarrush !== undefined) {
//             log("🍬 Sugar Rush activated! 🍬", "#ff69b4", "Alerts");
//         }
//     }
// }

// async function attack_loop() {

//     let delayMs = 100;

//     while (true) {
//         try {

//             if (!ATTACK_LOOP_ENABLED) {
//                 await delay(100);
//                 continue;
//             }

//             let target = null;

//             // Use current logic
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
//                     // If ATTACK_UNTARGETED is false, skip mobs with no target
//                     if (!ATTACK_UNTARGETED && (!mob.target || mob.target === character.name)) continue;
//                     inRange.push(mob);
//                     // Find a cursed monster in range (prioritize lowest HP if multiple)
//                     if (mob.s && mob.s.cursed) {
//                         if (!cursed || mob.hp < cursed.hp) cursed = mob;
//                     }
//                 }
//             }

//             // Sort by HP according to TARGET_LOWEST_HP
//             if (TARGET_LOWEST_HP) {
//                 inRange.sort((a, b) => a.hp - b.hp); // lowest HP first
//             } else {
//                 inRange.sort((a, b) => b.hp - a.hp); // highest HP first
//             }
//             target = cursed || (inRange.length ? inRange[0] : null);

//             try {

//                 if (target && !smart.moving && character.mp >= 80) {
//                     sugar_rush_check(target)
//                 }
//                 delayMs = (1000/character.frequency) + 50;
//                 await delay(delayMs);
//                 continue; //
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

// let eTime = 0;

// const st_maps = [];
// const aoe_maps = ["main", "level2s", "winter_cave", "spookytown", "halloween", "level1", "mforest"];
// const taunt_mobs = ["ghost"];

// async function skill_loop() {

//     let delayMs = 50; // Start with a higher delay

//     while (true) {

//         if (!SKILL_LOOP_ENABLED) {
//             await delay(delayMs);
//             continue;
//         }

//         if (character.mp >= 600 && !is_on_cooldown("warcry") && can_use("warcry")) {
//             await use_skill("warcry");
//         }

//         const Mainhand = character.slots?.mainhand?.name;
//         const code_cost_check = character.cc < 135;
//         let cleave_cooldown = is_on_cooldown("cleave");

//         // Exclude cleave if current target is a boss
//         const current_target = get_target();
//         const is_boss_target = current_target && BOSSES.includes(current_target.mtype);

//         const warriorTargetName = Object.keys(MONSTER_LOCS).find(
//             k => MONSTER_LOCS[k] === WARRIOR_TARGET
//         );

//         try {
//             // Check if character is at WARRIOR_TARGET location (within 20 units)
//             const atWarriorTarget =
//                 Math.hypot(character.x - WARRIOR_TARGET.x, character.y - WARRIOR_TARGET.y) < 50;

//             // Find Myras entity and check if within 50 units
//             const myras = Object.values(parent.entities).find(
//                 e => e.type === "character" && e.name === "Myras"
//             );
//             const myrasNearby = myras && parent.distance(character, myras) <= 50;

//             if (
//                 atWarriorTarget &&
//                 myrasNearby &&
//                 warriorTargetName &&
//                 taunt_mobs.includes(warriorTargetName)
//             ) {
//                 // Count mobs within 600 range that don't have a target
//                 const untargetedMobs = Object.values(parent.entities).filter(
//                     e =>
//                         e.type === "monster" &&
//                         e.mtype === warriorTargetName &&
//                         !e.dead &&
//                         parent.distance(character, e) <= 320 &&
//                         !e.target
//                 );
//                 if (
//                     untargetedMobs.length > 3 &&
//                     !is_on_cooldown("agitate") &&
//                     can_use("agitate") &&
//                     character.mp >= AGITATE_MP_THRESHOLD
//                 ) {
//                     await use_skill("agitate");
//                 }
//             }
//         } catch (e) {
//             catcher(e, "Agitate error ");
//         }

//         try {
//             // Only check cleave if it's off cooldown and not targeting a boss
//             if (
//                 !cleave_cooldown &&
//                 code_cost_check &&
//                 !is_boss_target &&
//                 character.mp >= CLEAVE_MP_THRESHOLD &&
//                 !smart.moving &&
//                 aoe_maps.includes(character.map) // <-- Only cleave on allowed maps
//             ) {
//                 await handle_cleave(Mainhand);
//             }
//         } catch (e) {
//             catcher(e, "Skill Loop error ");
//         }

//         // try {
//         //     // Only check cleave if it's off cooldown and not targeting a boss
//         //     await handle_taunt();
//         // } catch (e) {
//         //     catcher(e, "Skill Loop error ");
//         // }

//         await delay(delayMs);
//     }
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // LOOT LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let lastLoot = null;
// let tryLoot = false;
// const chestThreshold = 60;

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
// // POTIONS LOOP
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

//         // Use health potion if needed
//         const myras = Object.values(parent.entities).find(e => e.type === "character" && e.name === "Myras");
//         if (HP_MISSING >= POTION_HP_THRESHOLD && !detect_character(myras)) {
//             if (can_use("hp")) {
//                 use("hp");
//                 used_potion = true;
//             }
//         }

//         // Use mana potion if needed
//         else if (MP_MISSING >= POTION_MP_THRESHOLD) {
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
// // EQUIPMENT SETS
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let weapon_set_equipped = "";

// async function cleave_set() {
//     // Only unequip offhand if it's not already empty
//     if (character.slots.offhand) {
//         unequip("offhand");
//     }
//     // Only equip bataxe if not already equipped
//     const mainhand = character.slots.mainhand;
//     if (!mainhand || mainhand.name !== "bataxe" || mainhand.level !== 7) {
//         batch_equip([
//             { itemName: "bataxe", slot: "mainhand", level: 7, l: "l" }
//         ]);
//     }
//     weapon_set_equipped = "cleave";
// }

// async function explosion_set() {

//     batch_equip([
//         { itemName: "fireblade", slot: "mainhand", level: 9, l: "l" },
//         { itemName: "ololipop", slot: "offhand", level: 9, l: "l" }
//     ]);

//     weapon_set_equipped = "explosion";
// }

// async function single_set() {

//     batch_equip([
//         { itemName: "fireblade", slot: "mainhand", level: 9, l: "l" },
//         { itemName: "fireblade", slot: "offhand", level: 9, l: "l" }
//     ]);
    
//     weapon_set_equipped = "single";
// }

// async function sugar_rush_set() {

//     batch_equip([
//         { itemName: "candycanesword", slot: "mainhand", level: 7, l: "l" },
//         { itemName: "candycanesword", slot: "offhand", level: 7, l: "l" }
//     ]);

//     weapon_set_equipped = "sugar_rush";
// }

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // HANDLE SKILLS
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let last_cleave_time = 0;
// const CLEAVE_THRESHOLD = 500;
// const CLEAVE_RANGE = G.skills.cleave.range;
// const MAPS_TO_CLEAVE = ["mansion", "main"];

// async function handle_cleave(Mainhand) {
//     const now = performance.now();
//     const time_since_last = now - last_cleave_time;

//     // Only proceed if all other conditions are met
//     if (
//         !smart.moving &&
//         time_since_last >= CLEAVE_THRESHOLD &&
//         ms_to_next_skill("attack") > 75
//     ) {
//         // Only now filter monsters
//         const monsters = Object.values(parent.entities).filter(e =>
//             e?.type === "monster" &&
//             !e.dead &&
//             e.visible &&
//             distance(character, e) <= CLEAVE_RANGE
//         );

//         if (monsters.length > 2) {
//             cleave_set();
//             await use_skill("cleave");
//             //reduce_cooldown("cleave", character.ping * 0.95);
//             last_cleave_time = now;
//             // Swap back instantly (don't delay this)
//             explosion_set();
//         }
//     } 
// }

// const MAPS_TO_TAUNT = ["mforest"];

// // Casts 'agitate' if at least three untargeted monsters are within agitate range
// async function handle_taunt() {
//     if (smart.moving || is_on_cooldown("agitate") || !can_use("agitate") || character.mp < AGITATE_MP_THRESHOLD) return;
//     const AGITATE_RANGE = G.skills.agitate.range;
//     const untargeted = Object.values(parent.entities).filter(e =>
//         e?.type === "monster" &&
//         !e.dead &&
//         e.visible &&
//         distance(character, e) <= AGITATE_RANGE &&
//         !e.target
//     );
//     if (untargeted.length >= 2) {
//         await use_skill("agitate");
//     }
// }

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

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // BSCORPION KILL LOGGER LOOP
// // --------------------------------------------------------------------------------------------------------------------------------- //

// let last_bscorpion_ids = new Set();

// async function bscorpion_kill_logger_loop() {
//     while (true) {
//         try {
//             // Get all bscorpion entities
//             const bscorps = Object.values(parent.entities).filter(e => e.type === "monster" && e.mtype === "bscorpion");
//             const alive_ids = new Set(bscorps.filter(e => !e.dead).map(e => e.id));
//             const dead_now = [...last_bscorpion_ids].filter(id => !alive_ids.has(id));
//             if (dead_now.length > 0) {
//                 log_bscorpion_kill();
//             }
//             last_bscorpion_ids = alive_ids;
//         } catch (e) {
//             catcher(e, "bscorpion_kill_logger_loop");
//         }
//         await delay(250);
//     }
// }

// bscorpion_kill_logger_loop()

// // --------------------------------------------------------------------------------------------------------------------------------- //
// // BSCORPION KILL TIMER LOGGER
// // --------------------------------------------------------------------------------------------------------------------------------- //


// let bscorpion_kill_count = 0;
// let bscorpion_kill_times = [];

// function log_bscorpion_kill() {
//     const now = Date.now();
//     bscorpion_kill_count++;
//     bscorpion_kill_times.push(now);
//     if (bscorpion_kill_times.length > 50) bscorpion_kill_times.shift();

//     if (bscorpion_kill_times.length > 1) {
//         // Calculate rolling average
//         let total = 0;
//         for (let i = 1; i < bscorpion_kill_times.length; i++) {
//             total += bscorpion_kill_times[i] - bscorpion_kill_times[i - 1];
//         }
//         const avg = total / (bscorpion_kill_times.length - 1);
//         log(`Seconds / Kill (Avg): ${(avg/1000).toFixed(1)}s`, "#ffb347", "Bscorpion");
//     } else {
//         log(`Bscorpion kill #${bscorpion_kill_count}: ${new Date(now).toLocaleTimeString()} (first recorded)`, "#ffb347", "Bscorpion");
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