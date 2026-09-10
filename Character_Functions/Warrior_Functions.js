
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIGURATION - Toggle features here instead of editing code
// --------------------------------------------------------------------------------------------------------------------------------- //

var home = WARRIOR_TARGET;

var CONFIG = {
	combat: {
		enabled: true,
		target_priority: ["Myras"],
		all_bosses,
		cleave_min_mobs: 3,
		cleave_blacklist: ["fireroamer", "plantoid"],
		agitate_min_mobs: 2,
		cluster_min_mobs: 2,
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
		reposition: true,
		circle_radius: 35,
		move_threshold: 10,
		follow_distance: 15,
	},

	equipment: {
		auto_swap_sets: true,
		boss_luck_switch: true,
		boss_hp_thresholds: {
			mrpumpkin: 200000,
			mrgreen: 200000,
			franky: 999999999,
			icegolem: 999999999,
		},
		single_target_maps: ["halloween", "spookyforest", "desertland"],
		aoe_maps: ["cave", "main", "goobrawl", "level2n", "level2w", "mforest", "tunnel", "uhills", "winterland"],
		cleave_maps: ["cave", "desertland", "goobrawl", "halloween", "level2n", "level2w", "main", "mforest", "spookytown", "tunnel", "uhills", "winterland", "level2e"],
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

var destination = {
	map: locations[home][0].map,
	x: locations[home][0].x,
	y: locations[home][0].y
};

var ITEMS_TO_KEEP = ["hpot1", "mpot1", "luckbooster", "goldbooster", "xpbooster", "pumpkinspice", "xptome", "tracker", "jacko", "orbg", "talkingskull", "computer"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

var state = {
	skin_ready: false,
	last_basher_swap: 0,
	last_cleave_swap: 0,
	equip_cooldowns: {},
	last_reposition: 0
};

var cache = {
	target: null,
	cluster_target: null,
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
		// { item_name: "cearring", slot: "earring1", level: 5, l: "l" },
		// { item_name: "cearring", slot: "earring2", level: 5, l: "u" },
		// { item_name: "coat", slot: "chest", level: 13, l: "l" },
		// { item_name: "suckerpunch", slot: "ring1", level: 2, l: "l" },
		// { item_name: "suckerpunch", slot: "ring2", level: 2, l: "u" },
		// { item_name: "fireblade", slot: "mainhand", level: 13, l: "s" },
		// { item_name: "candycanesword", slot: "offhand", level: 13, l: "s" },
	],
	luck: [
		// { item_name: "mearring", slot: "earring1", level: 0, l: "l" },
		// { item_name: "mearring", slot: "earring2", level: 0, l: "u" },
		// { item_name: "ringofluck", slot: "ring2", level: 0, l: "u" },
		// { item_name: "ringofluck", slot: "ring1", level: 0, l: "l" },
		// { item_name: "mshield", slot: "offhand", level: 9, l: "l" },
		// { item_name: "tshirt88", slot: "chest", level: 0, l: "l" }
	],
	stealth: [
		// { item_name: "stealthcape", slot: "cape", level: 0, l: "l" },
	],
	cape: [
		// { item_name: "vcape", slot: "cape", level: 6, l: "l" },
	],
	mana: [
		{ item_name: "tshirt9", slot: "chest", level: 6, l: "l" }
	],
	stat: [
		{ item_name: "coat", slot: "chest", level: 13, l: "l" }
	],
	dps_accessories: [
		// { item_name: "cearring", slot: "earring1", level: 5, l: "l" },
		// { item_name: "cearring", slot: "earring2", level: 5, l: "u" },
		// { item_name: "suckerpunch", slot: "ring1", level: 2, l: "l" },
		// { item_name: "suckerpunch", slot: "ring2", level: 2, l: "u" },
	],
	panic: [
		{ item_name: "jacko", slot: "orb", level: 0, l: "l" },
	],
	orb_dps: [
		{ item_name: "orbofstr", slot: "orb", level: 5, l: "l" },
	],
	orb_luck: [
		{ item_name: "rabbitsfoot", slot: "orb", level: 2, l: "l" },
	],
	orb: [
		{ item_name: "orbg", slot: "orb", level: 2, l: "l" },
	],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	cache.tank_entity = get_entity("Myras")
	cache.monsters_in_cleave_range = find_monsters_in_cleave_range();

	if (!cache.is_valid()) {
		cache.cluster_target = find_cluster_target();
		cache.target = find_best_target();
		cache.party_members = get_party_members();
		cache.last_update = performance.now();
	}
}

function find_cluster_target() {
	const in_range = Object.values(parent.entities).filter(e =>
		e?.type === "monster" &&
		!e.dead &&
		e.visible &&
		distance(character, e) <= character.range
	);
	if (!in_range.length) return null;

	const scored = score_by_explosion_spread(in_range);
	return scored[0]?.count >= CONFIG.combat.cluster_min_mobs ? scored[0].mob : null;
}

function find_best_target() {
	const max_dist = WARRIOR_TARGET === "giantspider" ? 50 : character.range;

	for (const boss_type of CONFIG.combat.all_bosses) {
		const boss = get_nearest_monster_v2({ type: boss_type, max_distance: max_dist });
		if (boss) return boss;
	}

	const cursed = get_nearest_monster_v2({ status_effects: ["cursed"], max_distance: max_dist, check_max_hp: true });
	if (cursed) return cursed;

	if (WARRIOR_TARGET === "giantspider") {
		return get_nearest_monster_v2({ max_distance: max_dist }) || null;
	}
	if (cache.cluster_target && !cache.cluster_target.dead) return cache.cluster_target;

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

	Promise.resolve(attack(target)).catch(e => catcher(e, "action_loop"));

	const trick = STATUS_SWAP_TRICKS[target?.mtype];
	if (!trick || character.s[trick.status] !== undefined) return;

	if (!is_set_equipped(trick.base_set)) return;

	const token = equip_claim("swap-trick", EQUIP_PRIORITY.trick);
	if (!token) return;
	try {
		swap_trick_attempts++;
		if (!await equip_apply_slots(token, trick.swap_slots)) return;
		await delay(trick.swap_delay_ms);
		if (!await equip_apply_slots(token, trick.swap_slots)) return;
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
		equip_release(token);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN TICK LOOP
// ---------------------------------------------------------------------------------------------------------------------------------

function warrior_farm_step() {
	if (CONFIG.movement.reposition && get_nearest_monster({ type: home })) reposition();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Attack only
// ---------------------------------------------------------------------------------------------------------------------------------

async function action_loop() {
	if (should_pause_combat_loop()) return setTimeout(action_loop, 100);
	let delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill("attack");

		if (ms === 0 && !is_travelling() && target) {
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


// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

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
	const boss_blocks_coat = active_boss && active_boss.data.hp <= CONFIG.equipment.boss_hp_thresholds[active_boss.name];
	if (boss_blocks_coat) return null;

	if (character.mp > CONFIG.equipment.mp_thresholds.upper) return "stat";
	if (character.mp < CONFIG.equipment.mp_thresholds.lower) return "mana";
	return null;
}

function resolve_warrior_orb() {
	let preferred = "orb_dps";
	if (CONFIG.equipment.boss_set_swap_enabled) {
		const active_boss = find_active_boss();
		if (active_boss && active_boss.data.hp <= CONFIG.equipment.boss_hp_thresholds[active_boss.name]) {
			preferred = "orb_luck";
		}
	}
	if (set_available(preferred)) return preferred;
	if (set_available("orb")) return "orb";
	return null;
}

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

var EQUIPMENT_RULES = {
	booster: { kind: "booster", resolve: resolve_warrior_booster },
	cape:    { kind: "set", resolve: resolve_warrior_cape },
	coat:    { kind: "set", resolve: resolve_warrior_coat },
	loadout: { kind: "set", resolve: resolve_warrior_loadout },
	orb:     { kind: "set", resolve: resolve_warrior_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { loadout: ["dps_accessories", "single"] },
};


// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

const REPOSITION_INTERVAL_MS = 250;

async function reposition() {
	if (smart.moving || character.moving) return;
	if (WARRIOR_TARGET === "bscorpion") return;

	const now = performance.now();
	if (now - state.last_reposition < REPOSITION_INTERVAL_MS) return;
	state.last_reposition = now;

	const center = reposition_center();
	if (!center) return;

	let score;
	if (panicking) {
		score = make_distance_from_monsters_scorer();
		if (!score) return;
	} else {
		const target_mob = cache.cluster_target;
		if (!target_mob || target_mob.dead) return;

		const reach = character.range * 0.9;
		score = (x, y) => {
			if (Math.hypot(target_mob.x - x, target_mob.y - y) > reach) return null;
			return -Math.hypot(character.x - x, character.y - y);
		};
	}

	const spot = best_orbit_spot(center, CONFIG.movement.circle_radius, score);
	if (!spot) return;
	if (Math.hypot(character.x - spot.x, character.y - spot.y) <= CONFIG.movement.move_threshold) return;

	move(spot.x, spot.y);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //


var item_order = {
	tracktrix: 0,
	computer: 1,
	hpot1: 2,
	mpot1: 3,
	xptome: 4,
	pumpkinspice: 5,
	xpbooster: 6,
	jacko: 7,
	candycanesword: [38, 39],
	fireblade: [40, 41],
	bataxe: 37,
};


function elixir_usage() {
	const required = "pumpkinspice";
	const current_elixir = character.slots.elixir?.name;

	if (current_elixir !== required) {
		const slot = locate_item(required);
		if (slot !== -1) use(slot);
	}
}

var panicking = false;
var last_panic_time = 0;
var last_safe_time = 0;
var panic_external = false;
var panic_external_since = 0;

var PANIC_THRESHOLDS = {
	low_hp: 0.35, low_mp: 0.01, high_hp: 0.60, high_mp: 0.02,
	aggro: 99, cooldown: 1000,
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// EVENT HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------- //


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

setInterval(send_updates, 20000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

run_character({
	update_cache,
	farm_step: warrior_farm_step,
	loops: [action_loop, equipment_manager_loop, maintenance_loop, potion_loop, anniversary_loop],
	intervals: [[remote_sell_items, 5000]],
});
if (WARRIOR_TARGET === "bscorpion") prim_farm_loop();


// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION KILL LOGGER LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_bscorpion_ids = new Set();

async function bscorpion_kill_logger_loop() {
	while (true) {
		try {
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

if (WARRIOR_TARGET === "bscorpion") bscorpion_kill_logger_loop();

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

