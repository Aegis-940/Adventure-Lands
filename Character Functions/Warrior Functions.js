
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIGURATION - Toggle features here instead of editing code
// --------------------------------------------------------------------------------------------------------------------------------- //

const home = WARRIOR_TARGET;

const CONFIG = {
	combat: {
		enabled: true,
		target_priority: ['Myras'],
		all_bosses,
		cleave_min_mobs: 1,
		cleave_blacklist: ['fireroamer'],
		agitate_min_mobs: 2,
		agitate_blacklist: [],
		agitate_fireroamer_conditions: {
			healer_hp_pct: 0.60,
			healer_mp_pct: 0.80,
			ranger_hp_pct: 0.95,
			warrior_hp_pct: 0.95,
			max_mobs_in_range: 7
		},
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
		group_members: ['Myras', 'Ulric', 'Riva', 'Riff']
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOCATION & EQUIPMENT DATA
// --------------------------------------------------------------------------------------------------------------------------------- //

const equipment_sets = {
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

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

	// Priority 2: Any cursed monster in range (highest HP)
	const cursed = get_nearest_monster_v2({
		status_effects: ['cursed'],
		max_distance: character.range,
		check_max_hp: true
	});
	if (cursed) return cursed;

	// Priority 3: Highest HP monster in range
	const highest_hp = get_nearest_monster_v2({
		max_distance: character.range,
		check_max_hp: true
	});
	if (highest_hp) return highest_hp;

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

let sugar_rush_attempts = 0;
const sugar_rush_history = [];

async function sugar_rush_check(target) {

    attack(target);

    if (character.s.sugarrush === undefined && WARRIOR_TARGET === 'bscorpion') {
        sugar_rush_attempts++;
        equip_batch([{ num: 39, slot: "mainhand" }, { num: 40, slot: "offhand" }]);
        await delay(75);
        equip_batch([{ num: 39, slot: "mainhand" }, { num: 40, slot: "offhand" }]);
        await delay(225);
        if (character.s.sugarrush !== undefined) {
            sugar_rush_history.push(sugar_rush_attempts);
            if (sugar_rush_history.length > 30) sugar_rush_history.shift();
            const avg = sugar_rush_history.reduce((a, b) => a + b, 0) / sugar_rush_history.length;
            log(`Sugar Rush activated! Avg attempts: ${avg.toFixed(1)}`, "#ff69b4", "Alerts");
            sugar_rush_attempts = 0;
        }
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN TICK LOOP
// ---------------------------------------------------------------------------------------------------------------------------------

async function main_loop() {
	try {
		if (is_disabled(character)) {
			return setTimeout(main_loop, 250);
		}

		update_cache();
		// panic_check();

		if (should_handle_events()) {
			handle_events();
		}

		else if (CONFIG.movement.enabled) {
			if (WARRIOR_TARGET === 'bscorpion') {
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

	} catch (e) {
		console.error('main_loop error:', e);
	}

	setTimeout(main_loop, TICK_RATE.main);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Attack only
// ---------------------------------------------------------------------------------------------------------------------------------

async function action_loop() {
	if (panicking) return setTimeout(action_loop, 100);
	const myras = get_player("Myras");
	if (!myras || distance(character, myras) > 200) {
		return setTimeout(action_loop, 100);
	}
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		// Keep cache fresh even while waiting on cooldowns
		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill('attack');

		if (ms === 0 && smart.moving === false && target) {
			await sugar_rush_check(target);
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}

	} catch (e) {
		console.error('action_loop error:', e);
		delay = 1;
	}

	setTimeout(action_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP - All warrior skills
// ---------------------------------------------------------------------------------------------------------------------------------

async function skill_loop() {
	if (panicking) return setTimeout(skill_loop, 100);
	const myras = get_player("Myras");
	if (!myras || distance(character, myras) > 200) {
		return setTimeout(skill_loop, 100);
	}
	const delay = TICK_RATE.skill;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const tank = cache.tank_entity;

		// Warcry
		if (CONFIG.skills.warcry_enabled && !is_on_cooldown('warcry') && !character.s.warcry) {
			if (WARRIOR_TARGET !== 'bscorpion' || bscorpion_worth_buffing()) {
				await use_skill('warcry');
			}
		}

		// Stomp
		// if (CONFIG.skills.stomp_enabled && tank?.hp < tank?.max_hp * 0.3) {
		// 	await handle_stomp();
		// }

		// Cleave
		if (CONFIG.skills.cleave_enabled && WARRIOR_TARGET !== 'bscorpion') {
			await handle_cleave();
		}

		// Agitate
		if (CONFIG.skills.agitate_enabled && tank) {
			await handle_agitate(tank);
		}

		// Taunt
		// if (CONFIG.skills.taunt_enabled) {
		// 	await handle_taunt();
		// }

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
	if (!can_cleave()) return;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== 'bataxe';
	const now = performance.now();

	if (now - state.last_cleave_swap > COOLDOWNS.weapon_swap) {
		state.last_cleave_swap = now;
		unequip('offhand');
		batch_equip(equipment_sets.bataxe);
	}

	await use_skill('cleave');

	const target_set = mob_count() === 1 ? 'single' : 'aoe';
	batch_equip(equipment_sets[target_set]);

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

	// Don't cleave if a blacklisted monster is in AoE range
	const blacklisted_nearby = cache.monsters_in_cleave_range.some(e =>
		CONFIG.combat.cleave_blacklist.includes(e.mtype)
	);
	if (blacklisted_nearby) return false;

	return cache.monsters_in_cleave_range.length >= CONFIG.combat.cleave_min_mobs;
}

function is_fireroamer_agitate_safe(nearby_mobs) {
	const cond = CONFIG.combat.agitate_fireroamer_conditions;

	const healer = get_player('Myras');
	const ranger = get_player('Riva');

	if (!healer || healer.rip) return false;
	if (!ranger || ranger.rip) return false;

	if (healer.hp / healer.max_hp < cond.healer_hp_pct) return false;
	if (healer.mp / healer.max_mp < cond.healer_mp_pct) return false;
	if (ranger.hp / ranger.max_hp < cond.ranger_hp_pct) return false;
	if (character.hp / character.max_hp < cond.warrior_hp_pct) return false;
	if (nearby_mobs.length > cond.max_mobs_in_range) return false;

	return true;
}

async function handle_agitate(tank) {
	if (is_on_cooldown('agitate') || !tank || tank.rip) return;

	const skill_range = G.skills.agitate.range;
	const nearby_mobs = Object.values(parent.entities).filter(e =>
		e.visible && !e.dead && e.type === 'monster' && distance(character, e) <= skill_range
	);

	// Fireroamer is high-risk: only agitate when party-safety conditions hold
	if (WARRIOR_TARGET === 'fireroamer' && !is_fireroamer_agitate_safe(nearby_mobs)) return;

	const crabx = nearby_mobs.filter(e => e.mtype === 'crabx');
	const untargeted_crabs = crabx.filter(m => !m.target);

	// Crabx priority
	if (crabx.length >= 5 && untargeted_crabs.length === 5) {
		await use_skill('agitate');
		return;
	}

	// Other mobs
	const other_mobs = nearby_mobs.filter(e =>
		['sparkbot', 'jr', 'greenjr', 'bigbird', home].includes(e.mtype) &&
		!CONFIG.combat.agitate_blacklist.includes(e.mtype)
	);
	const untargeted_other = other_mobs.filter(m => !m.target);

	if (other_mobs.length >= CONFIG.combat.agitate_min_mobs && untargeted_other.length >= CONFIG.combat.agitate_min_mobs && !smart.moving) {
		const needs_protecting = ['porcupine', 'redfairy'];
		const nearby_threat = needs_protecting.some(type => {
			const target = get_nearest_monster({ type });
			return target && is_in_range(target, 'agitate');
		});

		if (!nearby_threat && distance(character, tank) <= 100) {
			await use_skill('agitate');
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
		console.error('maintenance_loop error:', e);
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

// potion_loop → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT MANAGEMENT LOOP - Independent from combat
// --------------------------------------------------------------------------------------------------------------------------------- //

async function equipment_loop() {
	const delay = TICK_RATE.equipment;

	try {
		if (!state.skinReady) {
			return setTimeout(equipment_loop, delay);
		}

		if (panicking) {
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
			const num_targets = cache.tank_entity ? get_num_targets(cache.tank_entity.name) : 0;

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

// find_booster_slot, get_num_chests, get_num_targets → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// should_handle_events, handle_events, handle_specific_event, handle_return_home → Common Functions.js

async function walk_in_circle() {
	if (smart.moving) return;
	if (WARRIOR_TARGET === 'bscorpion') return;

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
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function clear_inventory() {
	const loot_mule = get_player('Riff');
	if (!loot_mule) return;

	const dist = distance(character, loot_mule);
	
	if (dist < 250 && character.gold > 5000000) {
			send_gold(loot_mule, character.gold - 5000000);
	}

	const items_to_exclude = ['hpot1', 'mpot1', 'luckbooster', 'goldbooster', 'xpbooster', 'pumpkinspice', 'xptome', 'tracker', 'jacko', 'orbg', 'talkingskull', 'computer'];

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
	jacko: 7,
	candycanesword: 38,
	candycanesword: 39,
	fireblade: 40,
	bataxe: 41,
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
	const PANIC_AGGRO_THRESHOLD = 99;
	const PANIC_COOLDOWN = 1000;

	// --- Panic/Safe Conditions ---
	LOW_HEALTH = character.hp < character.max_hp * 0.2;
	LOW_MANA = character.mp < character.max_mp * 0.01;
	HIGH_HEALTH = character.hp >= character.max_hp * 0.35;
	HIGH_MANA = character.mp >= character.max_mp * 0.02;

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
// 	const party_lead = get_entity(group[0]);
// 	const current_party = character.party;
// 	const healer = get_entity('CrownPriest');
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

// suicide, sleep, get_nearest_monster_v2, ms_to_next_skill, batch_equip → Common Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

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
// --------------------------------------------------------------------------------------------------------------------------------- //
// SKIN CHANGER
// --------------------------------------------------------------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
skill_loop();
equipment_loop();
maintenance_loop();
potion_loop();
if (WARRIOR_TARGET === 'bscorpion') prim_farm_loop();

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