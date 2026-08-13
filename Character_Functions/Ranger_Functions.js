
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const home = RANGER_TARGET;

// var, not const: eval-loader scoping — const/let here wouldn't be visible to
// Game_Config.js's shared CONFIG-reading functions.
var CONFIG = {
	combat: {
		enabled: true,
		target_priority: ["Ulric", "Myras"],
		always_attack: ["crabx", "bscorpion"], // Attack regardless of target
		attack_if_targeted: [...all_bosses, "phoenix"], // Only attack if has target
		never_attack: ["nerfedmummy"], // Never attack
		use_hunters_mark: true,
		use_supershot: true,
		skill_blacklist: ["dryad", "fireroamer", "plantoid"], // Monster types to skip supershot + huntersmark on
		min_targets_for_5shot: 4,
		min_targets_for_3shot: 2,
	},

	movement: {
		enabled: true,
		circle_walk: true,
		circle_speed: 0.95,
		circle_radius: 75,
		move_threshold: 10,
		clump_radius: 30,
		follow_distance: 30,
	},

	equipment: {
		boss_hp_thresholds: {
			mrpumpkin: 100000,
			mrgreen: 100000,
			crabxx: 100000,
			grinch: 100000,
		},
		mp_thresholds: { upper: 2100, lower: 1700 },
		chest_threshold: 12,
		swap_cooldown: 500,
		cape_swap_enabled: false,
		coat_swap_enabled: false,
		boss_set_swap_enabled: true,
		xp_set_swap_enabled: false,
		xp_monsters: [home, "sparkbot"],
		xp_mob_hp_threshold: 12000,
		use_licence: false,
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

	looting: {
		enabled: false,
		delay_ms: 180000,
		loot_month: "lootItemsJan"
	},

	selling: {
		enabled: false,
		whitelist: ["vitearring", "iceskates", "cclaw", "hpbelt", "ringsj", "hpamulet",
			"warmscarf", "quiver", "snowball", "vitring", "wbreeches", "wgloves",
			"strring", "dexring", "intring"]
	},

	upgrading: {
		enabled: false,
		whitelist: {}
	},

	combining: {
		enabled: false,
		whitelist: {
			dexamulet: { target_level: 3, primling: 3, prim: 4 },
			intamulet: { target_level: 3, primling: 3, prim: 4 },
			stramulet: { target_level: 3, primling: 3, prim: 4 }
		}
	},

	character_starter: {
		enabled: false,
		characters: {
			MERCHANT: { name: "Riff", code_slot: 95 },
			PRIEST: { name: "Myras", code_slot: 3 },
			WARRIOR: { name: "Ulric", code_slot: 2 }
		}
	},

	location_broadcast: {
		enabled: true,
		target_player: "Riff",
		check_interval: 1000,
		low_inventory_slots: 7
	}
};

// var, not const: Game_Config.js's handle_return_home() reads this global.
var destination = {
	map: locations[home][0].map,
	x: locations[home][0].x,
	y: locations[home][0].y
};

// var, not const: send_to_merchant() (Shared/Game_Config.js) reads this global.
var ITEMS_TO_KEEP = ["hpot1", "mpot1", "luckbooster", "goldbooster", "xpbooster", "pumpkinspice", "xptome", "tracker", "jacko", "orbg", "talkingskull", "cupid", "computer"];

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE & CACHE
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: Ranger_Equipment.js (separate eval closure) also reads/writes these.
var state = {
	skin_ready: false,
	last_equip_time: 0,
	last_weapon_swap: 0,
	last_booster_swap: 0,
	last_cape_swap: 0,
	last_coat_swap: 0,
	last_boss_set_swap: 0,
	last_xp_swap: 0,
	angle: 0,
	last_angle_update: performance.now(),
};

var cache = {
	targets: { sorted_by_hp: [], in_range: [], out_of_range: [], clumped: [], cluster_targets: [], cluster_target: null },
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

// var, not const: shared is_set_equipped()/equip_set() (Game_Config.js) read this at call time.
var equipment_sets = {
	single: [
		{ item_name: "firebow", slot: "mainhand", level: 10, l: "l" },
		{ item_name: "t2quiver", slot: "offhand", level: 7, l: "l" },
	],
	dead: [

	],

	boom: [
		{ item_name: "pouchbow", slot: "mainhand", level: 10, l: "l" },
		{ item_name: "alloyquiver", slot: "offhand", level: 5, l: "l" },
	],

	burnboom: [
		{ item_name: "firebow", slot: "mainhand", level: 10, l: "l" },
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

	// 5. In follow mode, attack any visible monster
	if (RANGER_TARGET === "giantspider") return true;

	// 6. Default: attack if targeting party members
	return CONFIG.combat.target_priority.includes(mob.target);
};

const update_cache = () => {
	if (cache.is_valid()) return;
	const now = performance.now();
	cache.targets = update_target_cache();
	cache.heal_target = find_heal_target();
	cache.last_update = now;
};

const update_target_cache = () => {
	const { x: home_x, y: home_y } = locations[home][0];
	const clump_radius = CONFIG.movement.clump_radius;
	const sorted_by_hp = [];

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && should_attack_mob(e)) {
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

	const within_range = RANGER_TARGET === "giantspider"
		? mob => is_in_range(mob) && parent.distance(character, mob) <= 50
		: mob => is_in_range(mob);

	for (const mob of sorted_by_hp) {
		if (within_range(mob)) {
			in_range.push(mob);

			if (Math.hypot(mob.x - home_x, mob.y - home_y) <= clump_radius) {
				clumped.push(mob);
			}
		} else {
			out_of_range.push(mob);
		}
	}

	// In single-target follow mode, prefer the closest target
	if (RANGER_TARGET === "giantspider") {
		in_range.sort((a, b) => parent.distance(character, a) - parent.distance(character, b));
	}

	// Score in-range mobs by nearby aggro'd mob count, sort densest first
	const explosion_radius = character.explosion || 40;
	const scored = in_range.map(mob => {
		let count = 0;
		for (const id in parent.entities) {
			const e = parent.entities[id];
			if (e?.type === "monster" && !e.dead && e.target && e !== mob &&
				Math.hypot(e.x - mob.x, e.y - mob.y) <= explosion_radius) count++;
		}
		return { mob, count };
	});
	scored.sort((a, b) => b.count - a.count);
	const cluster_targets = scored.map(s => s.mob);
	const cluster_target = scored[0]?.count >= 3 ? scored[0].mob : null;

	return { sorted_by_hp, in_range, out_of_range, clumped, cluster_targets, cluster_target };
};

const find_heal_target = () => {
	const healer = get_entity("Myras");
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
// FOLLOW HEALER — used when RANGER_TARGET === "giantspider". Orbits Myras when
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

		if (should_handle_events()) {
			handle_events();
		} else if (CONFIG.movement.enabled) {
			if (home === "bscorpion") {
				handle_bscorpion_farm_approach(); // Shared/Movement.js
			} else if (RANGER_TARGET === "giantspider") {
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
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP - Attack and heal
// --------------------------------------------------------------------------------------------------------------------------------- //

const action_loop = async () => {
	if (panicking) return setTimeout(action_loop, 100);
	if (RANGER_TARGET !== "giantspider") {
		const myras = get_player("Myras");
		if (!myras || distance(character, myras) > 200) return setTimeout(action_loop, 100);
	}
	let delay = 5;
	try {
		if (is_disabled(character)) return setTimeout(action_loop, 50);

		update_cache();
		const ms = ms_to_next_skill("attack");

		if (ms === 0 && smart.moving === false) {
			if (cache.heal_target) {
				await attack(cache.heal_target);
			} else await handle_attack();
		} else {
			delay = ms > 200 ? 200 : ms > 50 ? 50 : 10;
		}
	} catch { delay = 10; }
	setTimeout(action_loop, delay);
};

const handle_attack = async () => {
	const { sorted_by_hp, in_range, out_of_range, cluster_targets, cluster_target } = cache.targets;
	if (!sorted_by_hp.length) return;

	const min5 = CONFIG.combat.min_targets_for_5shot;
	const min3 = CONFIG.combat.min_targets_for_3shot;
	const mp5 = (G.skills["5shot"]?.mp + 400);
	const mp3 = (G.skills["3shot"]?.mp + 200);
	const mp1 = 100;
	const can_5shot = character.mp >= mp5;
	const can_3shot = character.mp >= mp3;
	const can_1shot = character.mp >= mp1;

	const single_target_mode = RANGER_TARGET === "giantspider";
	let skill_call;
	if (!single_target_mode && can_5shot && in_range.length >= min5)           { skill_call = () => use_skill("5shot", cluster_targets.slice(0, 5).map(e => e.id)); }
	else if (!single_target_mode && can_5shot && out_of_range.length >= min5)  { skill_call = () => use_skill("5shot", out_of_range.slice(0, 5).map(e => e.id)); }
	else if (!single_target_mode && can_3shot && in_range.length >= min3)      { skill_call = () => use_skill("3shot", cluster_targets.slice(0, 3).map(e => e.id)); }
	else if (can_1shot && cluster_target)               { skill_call = () => attack(cluster_target); }
	else if (can_1shot && in_range.length >= 1)         { skill_call = () => attack(in_range[0]); }
	else return;

	await skill_call();
};

const skill_loop = async () => {
	if (panicking) return setTimeout(skill_loop, 100);
	if (RANGER_TARGET !== "giantspider") {
		const myras = get_player("Myras");
		if (!myras || distance(character, myras) > 200) return setTimeout(skill_loop, 100);
	}
	let delay = 5;
	try {
		if (!CONFIG.combat.use_hunters_mark && !CONFIG.combat.use_supershot) {
			setTimeout(skill_loop, 1000);
			return;
		}
		if (is_disabled(character)) return setTimeout(skill_loop, 250);

		update_cache();

		const { sorted_by_hp, in_range } = cache.targets;
		if (!sorted_by_hp.length) {
			setTimeout(skill_loop, 200);
			return;
		}

		const target = RANGER_TARGET === "giantspider" ? in_range[0] : sorted_by_hp[0];
		if (!target || !is_in_range(target)) {
			setTimeout(skill_loop, 100);
			return;
		}

		const ms_hunter = ms_to_next_skill("huntersmark");
		const ms_super = ms_to_next_skill("supershot");
		const min_ms = Math.min(ms_hunter, ms_super);

		if (min_ms < character.ping / 10) {
			change_target(target);

			const skill_allowed = !CONFIG.combat.skill_blacklist.includes(target.mtype);

			if (skill_allowed && CONFIG.combat.use_hunters_mark && ms_hunter === 0 && !target.s?.marked) {
				await use_skill("huntersmark", target);
			}

			if (skill_allowed && CONFIG.combat.use_supershot && ms_super === 0) {
				await use_skill("supershot", target);
			}
		} else {
			delay = min_ms > 200 ? 100 : min_ms > 50 ? 20 : 5;
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
	if (smart.moving || character.moving) return;
	if (RANGER_TARGET === "bscorpion") return;

	let center;
	if (RANGER_TARGET === "giantspider") {
		const healer = get_player("Myras");
		if (!healer || healer.rip || healer.map !== character.map) return;
		center = { x: healer.x, y: healer.y };
	} else {
		center = locations[home][0];
	}
	const { x: center_x, y: center_y } = center;
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

// const CHEST_STORAGE_KEY = "loot_chest_ids";

// function loadChestMap() {
// 	const data = get(CHEST_STORAGE_KEY);
// 	return typeof data === "object" && data !== null ? data : {};
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
// 		console.error("Looting error:", err);
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
	low_hp: 0.50, low_mp: 0.01, high_hp: 0.80, high_mp: 0.33,
	aggro: 1, cooldown: 1000,
};

// panic_check() moved to Shared/Game_Config.js; reads this file's PANIC_THRESHOLDS.

// party_maker() — replaced by shared party_manager() from Game_Config.js
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

// suicide, setInterval(suicide, 50), sleep → Game_Config.js

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
// SELLING
// --------------------------------------------------------------------------------------------------------------------------------- //

function sell_items() {
	if (!CONFIG.selling.enabled) return;

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;

		if (CONFIG.selling.whitelist.includes(item.name)) {
			if (item.p === undefined && item.l !== "l") {
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
		if (item.level >= config.target_level) continue;

		const grades = G.items[item.name].grades;
		let scrollname;

		if (item.level < grades[0]) scrollname = "scroll0";
		else if (item.level < grades[1]) scrollname = "scroll1";
		else scrollname = "scroll2";

		const scroll_slot = locate_item(scrollname);
		if (scroll_slot === -1) {
			buy(scrollname);
			return;
		}

		let offering_slot = null;
		if (item.level >= config.prim) {
			offering_slot = locate_item("offering");
		} else if (item.level >= config.primling) {
			offering_slot = locate_item("offeringp");
		}

		if (character.q.upgrade === undefined) {
			try {
				await upgrade(i, scroll_slot, offering_slot);
			} catch (e) {
				console.error("Upgrade failed:", e);
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

	const to_compound = new Map();

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || !CONFIG.combining.whitelist[item.name]) continue;

		const config = CONFIG.combining.whitelist[item.name];
		if (item.level >= config.target_level) continue;

		const key = item.name + item.level;
		const grade = item_grade(item);

		if (!to_compound.has(key)) {
			to_compound.set(key, [item.level, grade, i]);
		} else {
			to_compound.get(key).push(i);
		}
	}

	for (const group of to_compound.values()) {
		const item_level = group[0];
		const grade = group[1];
		const scroll_name = "cscroll" + grade;

		for (let i = 2; i + 2 < group.length; i += 3) {
			const scroll_slot = locate_item(scroll_name);
			if (scroll_slot === -1) {
				buy(scroll_name);
				return;
			}

			const item = character.items[group[i]];
			const config = CONFIG.combining.whitelist[item.name];

			let offering_slot = null;
			if (item_level >= config.prim) {
				offering_slot = locate_item("offering");
			} else if (item_level >= config.primling) {
				offering_slot = locate_item("offeringp");
			}

			if (character.q.compound === undefined) {
				try {
					await compound(group[i], group[i + 1], group[i + 2], scroll_slot, offering_slot);
				} catch (e) {
					console.error("Compound failed:", e);
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
// 	add_top_button("Ping", character.ping.toFixed(0));
// }
// setInterval(pingButton, 1000);

// function topButtons() {
// 	add_top_button("Return", "R&M", () => {
// 		send_cm(["CrownPriest", "CrownMage", "CrownTown"], {
// 			message: "location",
// 			x: character.x,
// 			y: character.y,
// 			map: character.map
// 		});
// 	});

// 	add_top_button("showLoot", "💼", displayLoot);

// 	add_top_button("Pause2", "⏸️", () => {
// 		pause();
// 		CONFIG.characterStarter.enabled = true
// 	});

// 	add_top_button("Stop", "🔄", () => {
// 		stop_character("CrownMerch");
// 		CONFIG.characterStarter.enabled = false
// 	});
// }
// topButtons();

// function displayLoot() {
// 	const savedLoot = JSON.parse(localStorage.getItem(CONFIG.looting.lootMonth) || "{}");

// 	const sortedLoot = {};
// 	Object.keys(savedLoot)
// 		.sort()
// 		.forEach((key) => {
// 			sortedLoot[key] = savedLoot[key];
// 		});

// 	console.log("Saved Loot (Sorted):", sortedLoot);
// 	show_json(sortedLoot);
// }

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

// get_nearest_monster_v2, ms_to_next_skill, batch_equip → Game_Config.js

// is_set_equipped()/equip_set() moved to Shared/Game_Config.js; reads this file's
// own `equipment_sets` global at call time.

// ============================================================================
// SKIN CHANGER
// ============================================================================

// const skinConfigs = {
// 	ranger: {
// 		skin: "tm_yellow",
// 		skinRing: { name: "tristone", level: 2, locked: "l" },
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

// send_updates() -> Shared/Messaging.js
setInterval(send_updates, 20000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// START ALL LOOPS
// --------------------------------------------------------------------------------------------------------------------------------- //

main_loop();
action_loop();
// skill_loop() (huntersmark/supershot) is defined in THIS file, so it's safe to
// start directly here — no eval-closure boundary to cross.
skill_loop();
// equipment_loop() is NOT started here: it's defined in Ranger_Equipment.js, a
// separate eval closure loading after this file finishes evaluating — calling it
// here would throw ReferenceError. Ranger_Equipment.js starts it itself.
maintenance_loop();
potion_loop();
if (RANGER_TARGET === "bscorpion") prim_farm_loop();
setInterval(remote_sell_items, 5000);
