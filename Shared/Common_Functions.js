// --------------------------------------------------------------------------------------------------------------------------------- //
// COMMON FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 1: CONFIGURATION
// --------------------------------------------------------------------------------------------------------------------------------- //

const PARTY_LEADER                = "Ulric";
const PARTY_MEMBERS               = ["Riva", "Myras", "Riff"];

// For potion deliveries from merchant
const POTION_TYPES = ["mpot1", "hpot1"];

// Merchant collects nth item and above when collecting loot.
const LOOT_THRESHOLD = 6;

const all_bosses = ["grinch", "icegolem", "dragold", "mrgreen", "mrpumpkin", "greenjr", "jr", "franky", "rgoo", "bgoo", "crabxx"];

const locations = {
	bat:        [{ x: 1200, y: -782 }],
	bigbird:    [{ map: "main", x: 1270, y: 245 }],
	booboo:     [{ map: "spookytown", x: 375, y: -739 }],
	bscorpion:  [{ map: "desertland", x: -408, y: -1141 }],
	boar:       [{ x: 19, y: -1109 }],
	cgoo:       [{ x: -221, y: -274 }],
	crab:       [{ x: -11840, y: -37 }],
	dryad:      [{ map: "mforest", x: 403, y: -347 }],
	ent:        [{ x: -420, y: -1960 }],
	fireroamer: [{ map: "desertland", x: 150, y: -650 }],
	// fireroamer: [{ map: "desertland", x: 113, y: -412 }],
	ghost:      [{ x: -405, y: -1642 }],
	gscorpion:  [{ x: 390, y: -1422 }],
	iceroamer:  [{ x: 823, y: -45 }],
	mechagnome: [{ map: "cyberland", x: 0, y: 0 }],
	mole:       [{ x: 14, y: -1072 }],
	mummy:      [{ map: "spookytown", x: 256, y: -1417 }],
	odino:      [{ x: -52, y: 756 }],
	oneeye:     [{ x: -255, y: 176 }],
	pinkgoblin: [{ x: 485, y: 157 }],
	poisio:     [{ x: -121, y: 1360 }],
	prat:       [{ x: 11, y: 84 }],
	pppompom:   [{ x: 292, y: -189 }],
	plantoid:   [{ map: "desertland", x: -780, y: -387 }],
	rat:        [{ x: 6, y: 430 }],
	scorpion:   [{ x: -495, y: 685 }],
	stoneworm:  [{ x: 830, y: 7 }],
	spider:     [{ x: 895, y: -145 }],
	giantspider: [{ }],
	squig:      [{ x: -1175, y: 422 }],
	targetron:  [{ x: -544, y: -275 }],
	wolf:       [{ map: "winterland", x: 390, y: -2745 }],
	wolfie:     [{ x: 113, y: -2014 }],
	xscorpion:  [{ x: -495, y: 685 }],
};

const HEALER_TARGET    = "dryad";
const WARRIOR_TARGET   = "dryad";
const RANGER_TARGET    = "dryad";

const MERCHANT_TARGET  = { map: "main", x: -87, y: -96 };

const EVENT_LOCATIONS = [
	{ name: "mrpumpkin", map: "halloween", x: -217, y: 720 },
	{ name: "mrgreen", map: "spookytown", x: 605, y: 1000 },
	{ name: "dragold", map: "cave", x: 873, y: -727 },
	// { name: "wabbit", dynamic: true },
];

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 2: CONSTANTS
// --------------------------------------------------------------------------------------------------------------------------------- //

const TICK_RATE = {
	main: 100,
	action: 1,
	skill: 40,
	equipment: 25,
	maintenance: 2000
};

const COOLDOWNS = {
	equip_swap: 300,
	weapon_swap: 1000,
	zapper_swap: 200,
	cc: 125
};

const CACHE_TTL = 50;

const SOFT_RESTART_TIMER = 60000;    // 1 minute
const HARD_RESET_TIMER   = 90000;    // 1.5 minutes

const PANIC_ORB   = "jacko";

const FLOATING_BUTTON_IDS = [];

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 3: LOOP TOGGLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let HEAL_LOOP_ENABLED         = true;
let MOVE_LOOP_ENABLED         = false;
let SKILL_LOOP_ENABLED        = true;
let PANIC_LOOP_ENABLED        = true;
let BOSS_LOOP_ENABLED         = false;
let ORBIT_LOOP_ENABLED        = false;
let POTION_LOOP_ENABLED       = true;
let LOOT_LOOP_ENABLED         = true;
let STATUS_CACHE_LOOP_ENABLED = true;
let PRIM_FARM_LOOT_ENABLED    = true;
let DUNGEON_LOOP_ENABLED      = false;

// --------------------------------------------------------------------------------------------------------------------------------- //
// SECTION 4: STATE VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

let inventory_count = 0, mpot1_count = 0, hpot1_count = 0, map = "", x = 0, y = 0;
let attack_mode                   = true;
let handling_death = false;
let timeout_interval = 30000; // Default timeout of 30 seconds

// --------------------------------------------------------------------------------------------------------------------------------- //
// CORE UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

// Critical function. Must be declared early.
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function with_timeout(
	promise,
	timeout_interval = Math.max(...parent.pings),
) {
	return Promise.race([
	promise,
	new Promise((resolve) => setTimeout(resolve, timeout_interval)),
	]);
}

function halt_movement() {
	parent.socket.emit("move", { to: { x: character.x, y: character.y } });
}

/**
 * Improved smarter_move function.
 * - Returns a Promise that always resolves or rejects.
 * - Handles interruptions and timeouts gracefully.
 * - Allows for external interruption via halt_movement or a global flag.
 * - Provides better error messages and status.
 */
function smarter_move(destination, on_done, options = {}) {
	// Cancel any previous smarter_move
	if (smart.moving && typeof smart._interrupt === "function") {
		smart._interrupt("interrupted");
	}

	// Internal state
	let interrupted = false;
	let interrupt_reason = null;
	let resolve_fn, reject_fn;
	let timeout_id = null;

	// Default timeout: 120 seconds
	const MOVE_TIMEOUT = options.timeout || 120000;

	// Helper to interrupt movement
	smart._interrupt = (reason = "interrupted") => {
		interrupted = true;
		interrupt_reason = reason;
		smart.moving = false;
		if (timeout_id) clearTimeout(timeout_id);
		if (typeof on_done === "function") on_done(false, reason);
		if (reject_fn) reject_fn({ success: false, reason });
	};

	// Helper to complete movement
	function complete(success = true, reason = null) {
		smart.moving = false;
		if (timeout_id) clearTimeout(timeout_id);
		if (typeof on_done === "function") on_done(success, reason);
		if (success && resolve_fn) resolve_fn({ success: true });
		else if (reject_fn) reject_fn({ success: false, reason });
	}

	// Validate destination
	let target = {};
	if (typeof destination === "string") target = { to: destination };
	else if (typeof destination === "number") target = { x: destination, y: on_done }, on_done = null;
	else if (typeof destination === "object") target = { ...destination };
	else return Promise.reject({ reason: "invalid destination" });

	// Set up target coordinates
	if ("x" in target) {
		smart.map = target.map || character.map;
		smart.x = target.x;
		smart.y = target.y;
	} else if ("to" in target || "map" in target) {
		const dest_name = target.to || target.map;

		if (locations[dest_name]) {
			// Named monster/farm location from the shared locations table
			const loc = locations[dest_name][0];
			smart.map = loc.map || character.map;
			smart.x = loc.x;
			smart.y = loc.y;
		} else if (G.maps[dest_name]) {
			// Bare map name — head to its default spawn point
			smart.map = dest_name;
			smart.x = G.maps[smart.map].spawns[0][0];
			smart.y = G.maps[smart.map].spawns[0][1];
		} else {
			return Promise.reject({ reason: "invalid location" });
		}
	} else {
		return Promise.reject({ reason: "invalid destination" });
	}

	// Start movement
	smart.moving = true;
	smart.plot = [];
	smart.flags = {};
	smart.searching = smart.found = false;

	// Movement monitoring loop
	function monitor_movement() {
		// If interrupted, exit
		if (interrupted) return;

		// If arrived at destination
		if (
			character.map === smart.map &&
			Math.hypot(character.x - smart.x, character.y - smart.y) < (options.radius || 10)
		) {
			complete(true);
			return;
		}

		// If movement stopped unexpectedly
		if (!smart.moving) {
			complete(false, "movement stopped");
			return;
		}

		// Continue monitoring
		setTimeout(monitor_movement, 200);
	}

	// Start monitoring
	setTimeout(monitor_movement, 200);

	// Timeout handler
	timeout_id = setTimeout(() => {
		smart._interrupt("timeout");
	}, MOVE_TIMEOUT);

	// Return a Promise that resolves/rejects on completion/interruption
	return new Promise((resolve, reject) => {
		resolve_fn = resolve;
		reject_fn = reject;
	});
}

// Usage example:
// let move_promise = smarter_move({ map: "main", x: 100, y: 100 }, null, { timeout: 30000, radius: 20 });
// To interrupt: smart._interrupt("manual stop");

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE MACHINE
// --------------------------------------------------------------------------------------------------------------------------------- //

// --- Helper: Boss alive check ---
function is_boss_alive() {
	return BOSSES.some(name => {
		const s = parent.S[name];
		return (
			s &&
			s.live === true
		);
	});
}

function is_bscorpion_alive() {
	let found = false;
	if (HEALER_TARGET    === MONSTER_LOCS.bscorpion || WARRIOR_TARGET   === MONSTER_LOCS.bscorpion || RANGER_TARGET    === MONSTER_LOCS.bscorpion){
		const TARGET_LOC = { map: "desertland", x: -408, y: -1266 };
		const within_200 = character.map === TARGET_LOC.map &&
			Math.hypot(character.x - TARGET_LOC.x, character.y - TARGET_LOC.y) <= 200;
		if (within_200) {
			found = true;
		}
	}
	if (found) {
		PRIM_FARM_LOOT_ENABLED = true;
	} else {
		PRIM_FARM_LOOT_ENABLED = false;
	}
	return found;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CM HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------- //

const _cmListeners = []; // unified naming

// Utility to add CM listeners
function add_cm_listener(fn) {
	if (!_cmListeners.includes(fn)) _cmListeners.push(fn);
}

// Utility to remove CM listeners
function remove_cm_listener(fn) {
	const index = _cmListeners.indexOf(fn);
	if (index !== -1) _cmListeners.splice(index, 1);
}

// Preserve existing handler
const original_on_cm = typeof on_cm === "function" ? on_cm : () => {};

// Global handler dispatcher
on_cm = function (name, data) {
	_cmListeners.forEach(fn => {
		try {
			fn(name, data);
		} catch (e) {
			console.error("CM listener error:", e);
		}
	});
	original_on_cm(name, data);
};

const location_responses = {};

// Central CM message handlers
const CM_HANDLERS = {
	"my_location": (name, data) => {
		location_responses[name] = { map: data.map, x: data.x, y: data.y };
	},

	"where_are_you": (name) => {
		send_cm(name, {
			type: "my_location",
			map: character.map,
			x: character.x,
			y: character.y
		});
	},

	"what_potions": (name) => {
		const counts = {};
		for (const pot of POTION_TYPES) {
			counts[pot] = character.items.reduce((sum, item) =>
				item?.name === pot ? sum + (item.q || 1) : sum, 0);
		}
		send_cm(name, { type: "my_potions", ...counts });
	},

	"do_you_have_loot": (name) => {
		const count = character.items.slice(6).filter(Boolean).length;
		if (count > 0) {
			send_cm(name, { type: "yes_i_have_loot", count });
		}
	},

	"send_loot": async (name) => {
			await send_to_merchant();
	},

	"status_update_request": async (name) => {
		get_status_cache();
		send_cm(name, { type: "status_update", data: {
			name: character.name,
			inventory: inventory_count,
			mpot1: mpot1_count,
			hpot1: hpot1_count,
			map: map,
			x: x,
			y: y,
			last_seen: Date.now()
		}});
	},

	"reload": () => {
		setTimeout(() => parent.window.location.reload(), 500);
	}
};

// Register the handler dispatcher
add_cm_listener((name, data) => {
	if (!["Ulric", "Riva", "Myras", "Riff"].includes(name)) {
		game_log("❌ Unauthorized CM from " + name);
		return;
	}

	const handler = CM_HANDLERS[data.type] || CM_HANDLERS["default"];
	if (handler) {
		if (handler.constructor.name === "AsyncFunction") {
			handler(name, data).catch(e => console.error("CM async handler error:", e));
		} else {
			try {
				handler(name, data);
			} catch (e) {
				console.error("CM handler error:", e);
			}
		}
	}
});

// --------------------------------------------------------------------------------------------------------------------------------- //
// MONSTER & COMBAT UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill];
	if (next_skill === undefined) return 0;
	const ping = parent.pings?.length ? Math.min(...parent.pings) : 0;
	const ms = next_skill.getTime() - Date.now() - ping;
	return ms < 0 ? 0 : ms;
}

function get_nearest_monster_v2(args = {}) {
	let min_d = 999999, target = null;
	let optimal_hp = args.check_max_hp ? 0 : 999999999;

	for (let id in parent.entities) {
		let current = parent.entities[id];
		if (current.type != "monster" || !current.visible || current.dead) continue;

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
		if (args.no_target && current.target) continue;

		if (args.status_effects && !args.status_effects.every(effect => current.s[effect])) continue;

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

// Returns true if the target character is within 500 units
function detect_character(target) {
	if (!target || !character || typeof target.x !== "number" || typeof target.y !== "number" || typeof character.x !== "number" || typeof character.y !== "number") return false;
	const dx = target.x - character.x;
	const dy = target.y - character.y;
	const distance = Math.sqrt(dx * dx + dy * dy);
	return distance <= 500;
}

function get_num_targets(player_name) {
	if (!player_name) return 0;
	let count = 0;
	for (const id in parent.entities) {
		const entity = parent.entities[id];
		if (entity.type === "monster" && entity.target === player_name) {
			count++;
		}
	}
	return count;
}

function get_num_chests() {
	return Object.keys(get_chests()).length;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_handle_events() {
	const holiday_spirit = parent?.S?.holidayseason && !character?.s?.holidayspirit;
	const has_handleable_event = EVENT_LOCATIONS.some(e => parent?.S?.[e.name]?.live);
	return holiday_spirit || has_handleable_event;
}

function handle_events() {
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit) {
		if (!smart.moving) {
			smart_move({ to: "town" }, () => {
				parent.socket.emit("interaction", { type: "newyear_tree" });
			});
		}
		return;
	}

	const alive_sorted = EVENT_LOCATIONS
		.map(e => {
			const data = parent.S[e.name];
			if (e.dynamic && data?.live) {
				return { ...e, map: data.map, x: data.x, y: data.y, data };
			}
			return { ...e, data };
		})
		.filter(e => e.data?.live)
		.sort((a, b) => (a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp));

	if (!alive_sorted.length) return;

	// Wabbit takes exclusive priority when alive
	const wabbit = alive_sorted.find(e => e.name === "wabbit");
	const target = wabbit || alive_sorted[0];

	// Some events require joining an instance first
	if (target.join === true && character.map !== target.map) {
		parent.socket.emit("join", { name: target.name });
		return;
	}

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

	if (!is_in_range(monster, "attack") && !smart.moving) {
		await xmove(halfway_x, halfway_y);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// GAME EVENT CALLBACKS (event-driven, replaces parent.S polling where possible)
// --------------------------------------------------------------------------------------------------------------------------------- //

// Tracks live game events pushed by the server (boss spawns, special mobs, etc.)
// Character scripts can check LIVE_EVENTS[name] instead of polling parent.S
const LIVE_EVENTS = {};

on_game_event = function(data) {
	if (!data?.name) return;
	LIVE_EVENTS[data.name] = data;
	log(`[Event] ${data.name} spawned`, "#FF8800");
};

// Fires when monsters deal AoE damage to co-located characters.
// Sets a flag that movement loops can check to trigger spread behavior.
let combined_damage_flag = false;
let combined_damage_time = 0;

on_combined_damage = function() {
	combined_damage_flag = true;
	combined_damage_time = Date.now();
};

function should_spread() {
	if (!combined_damage_flag) return false;
	// Auto-clear after 2 seconds
	if (Date.now() - combined_damage_time > 2000) {
		combined_damage_flag = false;
		return false;
	}
	return true;
}

function handle_return_home() {
	const dx = character.x - destination.x;
	const dy = character.y - destination.y;
	const dist = Math.hypot(dx, dy);
	const home_radius = (CONFIG.movement.circle_radius || 75) + 20;

	if (dist <= home_radius) return;

	if (dist < 200 && character.map === destination.map) {
		// Short drift: raw move() keeps smart.moving false (xmove falls back to smart_move on obstacles)
		if (!character.moving && !smart.moving) move(destination.x, destination.y);
	} else if (!smart.moving) {
		smart_move(destination);
	}
}

async function potion_loop() {
	const HP_MISSING = character.max_hp - character.hp;
	const MP_MISSING = character.max_mp - character.mp;

	let used_potion = false;

	// Use MP potion if needed
	if (MP_MISSING >= CONFIG.potions.mp_threshold) {
		use("mp");
		used_potion = true;
	}

	// Use HP potion if needed
	if (HP_MISSING >= CONFIG.potions.hp_threshold) {
		use("hp");
		used_potion = true;
	}

	setTimeout(potion_loop, used_potion ? 2050 : 10);
}

// function suicide() {
// 	if (!character.rip && character.hp < 2000) {
// 		parent.socket.emit("harakiri");
// 		game_log("Harakiri");
// 	}

// 	if (character.rip) {
// 		respawn();
// 	}
// }

function auto_buy_potions() {
	if (quantity("hpot1") < CONFIG.potions.min_stock) buy("hpot1", CONFIG.potions.min_stock);
	if (quantity("mpot1") < CONFIG.potions.min_stock) buy("mpot1", CONFIG.potions.min_stock);
	if (quantity("xptome") < 1) buy("xptome", 1);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PERIODIC RESET - Reload the game tab every N hours, on the hour
// --------------------------------------------------------------------------------------------------------------------------------- //

const RESET_INTERVAL_HOURS = 2;
const RESET_WINDOW_MINUTES = 2;
let _last_reset_bucket = null;
let _suppress_periodic_reset = false;

function set_suppress_reset(val) { _suppress_periodic_reset = val; }

function schedule_periodic_reset() {
	// Module-level state is per-iframe/tab, so each character decides
	// independently. Boot-seed prevents a reload loop if we come back up
	// inside an active reset window.
	const boot = new Date();
	if (boot.getHours() % RESET_INTERVAL_HOURS === 0 && boot.getMinutes() < RESET_WINDOW_MINUTES) {
		_last_reset_bucket = `${boot.toDateString()}-${boot.getHours()}`;
	}

	setInterval(() => {
		if (_suppress_periodic_reset) return;

		const now = new Date();
		const hour = now.getHours();

		if (now.getMinutes() >= RESET_WINDOW_MINUTES) return;
		if (hour % RESET_INTERVAL_HOURS !== 0) return;

		const bucket = `${now.toDateString()}-${hour}`;
		if (_last_reset_bucket === bucket) return;
		_last_reset_bucket = bucket;

		game_log(`[reset] Periodic reload at ${hour}:00`, "#FFAA00");
		setTimeout(() => parent.window.location.reload(), 1000);
	}, 60000);
}
schedule_periodic_reset();

function find_booster_slot() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && ["xpbooster", "goldbooster", "luckbooster"].includes(item.name)) {
			return i;
		}
	}
	return null;
}

async function batch_equip(data) {
	if (!Array.isArray(data)) {
		return Promise.reject({ reason: "invalid", message: "Not an array" });
	}
	if (data.length > 15) {
		return Promise.reject({ reason: "invalid", message: "Too many items" });
	}

	let valid_items = [];
	let claimed_slots = new Set();

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
			if (item && item.name === item_name && item.level === level && item.l === l && !claimed_slots.has(j)) {
				valid_items.push({ num: j, slot: slot });
				claimed_slots.add(j);
				break;
			}
		}
	}

	if (valid_items.length === 0) return;

	try {
		parent.socket.emit("equip_batch", valid_items);
		await parent.push_deferred("equip_batch");
	} catch (error) {
		console.error("batch_equip error:", error);
		return Promise.reject({ reason: "invalid", message: "Failed to equip" });
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MANAGER
// --------------------------------------------------------------------------------------------------------------------------------- //

function is_in_party(name) {
	return !!(parent.party && parent.party[name] !== undefined);
}

function party_manager() {
	const am_leader = character.name === PARTY_LEADER;
	const am_member = PARTY_MEMBERS.includes(character.name);
	const current_party = Object.keys(parent.party || {});

	if (am_leader) {
		PARTY_MEMBERS.forEach(name => {
			if (name === character.name) return;
			if (!current_party.includes(name)) {
				send_party_invite(name);
				accept_party_request(name); // Optional, in case of mutual sending
			}
		});
	} else if (am_member) {
		if (!current_party.includes(PARTY_LEADER)) {
			send_party_request(PARTY_LEADER);
			accept_party_invite(PARTY_LEADER);
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT & INVENTORY
// --------------------------------------------------------------------------------------------------------------------------------- //

// Keep at least this much gold on hand when a merchant-requested loot pull fires.
// Shared so it stays in sync with each fighter's own clear_inventory() threshold.
const LOOT_GOLD_RESERVE = 10000000;

async function send_to_merchant() {
	const merchant_name = "Riff";          // e.g., "Riff"
	const merchant = get_player(merchant_name);   // use get_player for live info

	if (!merchant || merchant.rip) {
		return game_log("❌ Merchant not found or dead");
	}
	if (merchant.map !== character.map || distance(character, merchant) > 400) {
		return game_log("❌ Merchant not nearby");
	}

	// Each fighter file defines its own var ITEMS_TO_KEEP (items it needs on hand and
	// must never auto-send) — fall back to nothing excluded if a file doesn't define one.
	const items_to_keep = typeof ITEMS_TO_KEEP !== "undefined" ? ITEMS_TO_KEEP : [];

	// Send every unlocked, non-reserved item in slots ≥ LOOT_THRESHOLD
	for (let i = LOOT_THRESHOLD; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !item.l && !items_to_keep.includes(item.name)) { // Skip locked/reserved items
			await delay(150);
			try {
				send_item(merchant_name, i, item.q || 1);
			} catch (e) {
				game_log(`⚠️ Could not send item in slot ${i}: ${item.name}`);
			}
		}
	}

	// Send gold above the reserve
	const gold_to_send = character.gold - LOOT_GOLD_RESERVE;
	if (gold_to_send > 0) {
		await delay(10);
		try {
			await send_gold(merchant_name, gold_to_send);
		} catch (e) {
			game_log("⚠️ Could not send gold");
		}
	}
}

let bank_inventory = [];

/**
 * Scans all available bank tabs using `parent.bank`, if available.
 * Fills `bank_inventory` with metadata: name, level, quantity, tab, slot.
 */
function scan_bank_inventory() {
	if (!parent.bank || !Array.isArray(parent.bank)) {
		game_log("❌ Bank data not available. Open the bank first.");
		return;
	}

	bank_inventory = [];

	for (let tab = 0; tab < parent.bank.length; tab++) {
		const tab_items = parent.bank[tab];
		if (!Array.isArray(tab_items)) continue;

		for (let slot = 0; slot < tab_items.length; slot++) {
			const item = tab_items[slot];
			if (!item) continue;

			bank_inventory.push({
				name: item.name,
				level: item.level ?? 0,
				q: item.q ?? 1,
				tab: tab,
				slot: slot
			});
		}
	}

	game_log(`📦 Bank scan complete: ${bank_inventory.length} items recorded`);
}

/**
 * Withdraws items from your bank using the native `bank_retrieve` call.
 * Call this while standing at your bank.
 *
 * @param {string} item_name         – The name of the item to withdraw.
 * @param {number|null} level       – (optional) Only withdraw items at this exact level.
 * @param {number|null} total       – (optional) Max total quantity to withdraw; omit to take all.
 */
async function withdraw_item(item_name, level = null, total = null) {

	const BANK_LOC1 = { map: "bank", x: 0, y: -37 };
	const BANK_LOC2 = { map: "bank_b", x: -265, y: -344 };

	await delay(200);

	// 1) Grab live bank data
	let bank_data = character.bank;
	if (!bank_data || Object.keys(bank_data).length === 0) {
		bank_data = load_bank_from_local_storage();
		if (!bank_data) {
			game_log("⚠️ No bank data available. Open your bank or save it first.");
			return;
		}
	}

	let remaining = (total != null ? total : Infinity);
	let found_any  = false;

	// 2) Iterate each "items<N>" pack
	for (const pack_key of Object.keys(bank_data)) {
		if (!pack_key.startsWith("items")) continue;
		const slot_arr = bank_data[pack_key];
		if (!Array.isArray(slot_arr)) continue;

		// 3) Scan slots in this pack
		for (let slot = 0; slot < slot_arr.length && remaining > 0; slot++) {
			const itm = slot_arr[slot];
			if (!itm || itm.name !== item_name) continue;
			if (level != null && itm.level !== level) continue;

			found_any = true;

			// Determine which bank location to move to based on pack_key
			const pack_num = parseInt(pack_key.replace("items", ""), 10);
			if (!isNaN(pack_num)) {
				if (pack_num >= 0 && pack_num <= 7 && character.map !== "bank") {
					log(`Moving to Bank for pack ${pack_key}`);
					await smarter_move(BANK_LOC1);
					await delay(200);
				} else if (pack_num >= 8 && pack_num <= 14 && character.map !== "bank_b") {
					log(`Moving to Bank Basement for pack ${pack_key}`);
					await smarter_move(BANK_LOC1);
					await smarter_move(BANK_LOC2);
					await delay(200);
				}
			}

			// bank_retrieve pulls the ENTIRE stack from a bank slot in a single call — there's
			// no partial-quantity retrieval. Looping it per-unit (the old behavior) emptied the
			// slot on the first call, then wasted further calls on the now-empty slot while
			// still decrementing `remaining` once per call — so whenever a caller wanted fewer
			// than the full stack (e.g. withdrawing combine items in capped multiples of 3),
			// the real call over-delivered the whole stack while `remaining`'s bookkeeping
			// assumed only part of it arrived, throwing off every later slot/round and dropping
			// the last item or two short of what the caller expected to see in inventory.
			await bank_retrieve(pack_key, slot, -1);
			await delay(100);
			remaining -= (itm.q || 1);
		}

		if (remaining <= 0) break;
	}

	// 4) Summarize
	if (!found_any) {
		game_log(`⚠️ No "${item_name}"${level != null ? ` level ${level}` : ""} found in bank.`);
	} else if (total != null && remaining > 0) {
		const got = total - remaining;
		game_log(`⚠️ Only retrieved ${got}/${total} of ${item_name}.`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE TO CHARACTER'S LOCATION
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_to_character(name, timeout_ms = 10000) {
	// Prevent multiple overlapping handlers
	let responded = false;

	function handle_response(n, data) {
		if (n !== name || !data || data.type !== "my_location") return;

		responded = true;
		remove_cm_listener(handle_response);
		clearTimeout(timeout_id);

		const { map, x, y } = data;
		if (!map || x == null || y == null) {
			game_log(`❌ Invalid location data from ${name}`);
			return;
		}

		smarter_move({ map, x, y });
	}

	// Add listener
	add_cm_listener(handle_response);

	// Send request
	send_cm(name, { type: "where_are_you" });

	// Timeout fallback
	const timeout_id = setTimeout(() => {
		if (!responded) {
			remove_cm_listener(handle_response);
			game_log(`⚠️ No location response from ${name} within ${timeout_ms / 1000}s`);
		}
	}, timeout_ms);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION / PRIMLING FARM
// --------------------------------------------------------------------------------------------------------------------------------- //

const PRIM_FARM_LOC = { map: "desertland", x: -409, y: -1236 };
const PRIM_FARM_LOC_HEALER = { map: "desertland", x: -408, y: -1146 };
const PRIM_FARM_RADIUS = 105;
const SAFETY_DISTANCE = 100;

// Shared helper: find nearest alive bscorpion
let cached_bscorpion_id = null;

function find_nearest_bscorpion() {
	let nearest = null;
	let min_dist = Infinity;

	// Try cached id first
	if (cached_bscorpion_id && parent.entities[cached_bscorpion_id]) {
		const ent = parent.entities[cached_bscorpion_id];
		if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
			nearest = ent;
			min_dist = Math.hypot(ent.x - character.x, ent.y - character.y);
		} else {
			cached_bscorpion_id = null;
		}
	}

	// If not cached or cache invalid, search
	if (!nearest) {
		for (const id in parent.entities) {
			const ent = parent.entities[id];
			if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
				const dist = Math.hypot(ent.x - character.x, ent.y - character.y);
				if (dist < min_dist) {
					min_dist = dist;
					nearest = ent;
					cached_bscorpion_id = id;
				}
			}
		}
	}

	if (!nearest) return null;
	return { entity: nearest, distance: min_dist, x: nearest.x, y: nearest.y, id: nearest.id };
}

function is_bscorpion_targeting_myras() {
	for (const id in parent.entities) {
	const ent = parent.entities[id];
	if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
		if (ent.target === "Myras") return true;
	}
	}
	return false;
}

// Returns true if a visible bscorpion has >= 5% HP. Used to gate party buffs
// (warcry, dark blessing) so they aren't wasted on a near-dead boss or fired
// when no bscorpion is visible.
function bscorpion_worth_buffing() {
	const info = find_nearest_bscorpion();
	if (!info) return false;
	return info.entity.hp / info.entity.max_hp >= 0.05;
}

// Consolidated: move to maintain a specific distance from bscorpion
async function move_distance_from_bscorpion(desired = 40, tolerance = 0.75) {
	const info = find_nearest_bscorpion();
	if (!info) return false;

	if (Math.abs(info.distance - desired) > tolerance) {
		if (!character.moving || Math.hypot(character.x - info.x, character.y - info.y) > tolerance) {
			const angle = Math.atan2(character.y - info.y, character.x - info.x);
			const new_x = info.x + Math.cos(angle) * desired;
			const new_y = info.y + Math.sin(angle) * desired;
			move(new_x, new_y);
		}
		return true;
	}
	return false;
}

// Predictive movement: maintain exactly the right distance from bscorpion
async function maintain_distance_from_bscorpion() {
	const info = find_nearest_bscorpion();
	if (!info) return false;

	// Predict bscorpion's future position (100ms ahead)
	const prediction_time = 0.1; // seconds
	const nearest = info.entity;
	let pred_x = nearest.x;
	let pred_y = nearest.y;
	if (typeof nearest.vx === "number" && typeof nearest.vy === "number") {
		pred_x += nearest.vx * prediction_time;
		pred_y += nearest.vy * prediction_time;
	} else if (typeof nearest.going_x === "number" && typeof nearest.going_y === "number") {
		// Fallback: use going_x/going_y if vx/vy not available
		pred_x = nearest.going_x;
		pred_y = nearest.going_y;
	}

	// Desired distance
	const desired = 38;
	const angle = Math.atan2(character.y - pred_y, character.x - pred_x);
	const new_x = pred_x + Math.cos(angle) * desired;
	const new_y = pred_y + Math.sin(angle) * desired;
	// Only move if not already at the correct distance (with a small tolerance)
	const dist_to_pred = Math.hypot(character.x - new_x, character.y - new_y);
	log(dist_to_pred);
	if (dist_to_pred > 2) {
		move(new_x, new_y);
		return true;
	}
	return false;
}

let _orbit_angle = 0;
async function move_safe_from_bscorpion() {
	// Orbit PRIM_FARM_LOC at PRIM_FARM_RADIUS clockwise
	_orbit_angle += Math.PI / 16;
	if (_orbit_angle > 2 * Math.PI) _orbit_angle -= 2 * Math.PI;
	const new_x = PRIM_FARM_LOC.x + Math.cos(_orbit_angle) * PRIM_FARM_RADIUS;
	const new_y = PRIM_FARM_LOC.y + Math.sin(_orbit_angle) * PRIM_FARM_RADIUS;
	await move(new_x, new_y);
}

async function prim_farm_loop() {

	while (true) {
		if (PRIM_FARM_LOOT_ENABLED) {

			if (character.name === "Ulric") {

				move_distance_from_bscorpion();

			}

			if (character.name === "Myras") {

				const bscorp_info = find_nearest_bscorpion();
				let too_close = false;
				if (bscorp_info) {
					const dist = Math.hypot(character.x - bscorp_info.x, character.y - bscorp_info.y);
					if (dist < SAFETY_DISTANCE) too_close = true;
				}

				if (!is_bscorpion_targeting_myras() && !too_close) {
					// Cast absorb on bscorpion if possible
					const bscorp = Object.values(parent.entities).find(ent =>
						ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead
					);
					if (bscorp && can_use("absorb")) {
						parent.socket.emit("ability", { name: "absorb", id: bscorp.id });
					}
				}

			}

			if (character.name === "Riva") {

				move_distance_from_bscorpion(50, 0);

			}

			await delay(100);

		} else {
			await delay(1000);
		}
	}
}

async function prim_orbit_loop() {

	// User algorithm:
	// 1. Establish where the scorpion is and where I am.
	// 2. If possible move away in the most direct manner.
	// 3. If at the radius boundary, rotate clockwise or anticlockwise, whichever creates the most separation.

	const RADIUS_TOL = 2; // How close to PRIM_FARM_RADIUS counts as "at boundary"
	const ROTATE_STEP_DEG = 10; // How much to rotate per step (degrees)
	while (true) {
		if (PRIM_FARM_LOOT_ENABLED) {
			const bscorp = find_nearest_bscorpion();
			if (!bscorp) { await delay(500); continue; }

			const cx = character.x;
			const cy = character.y;
			const sx = bscorp.x;
			const sy = bscorp.y;

			// Vector from scorpion to self
			const dx = cx - sx;
			const dy = cy - sy;
			const dist = Math.hypot(dx, dy);

			// Vector from farm center to self
			const fx = cx - PRIM_FARM_LOC.x;
			const fy = cy - PRIM_FARM_LOC.y;
			const farm_dist = Math.hypot(fx, fy);

			// 1. If not at radius, move directly away from scorpion, but clamp to farm radius
			if (Math.abs(farm_dist - PRIM_FARM_RADIUS) > RADIUS_TOL) {
				// Target point: in the direction away from scorpion, but at farm radius
				const away_angle = Math.atan2(dy, dx);
				const target_x = PRIM_FARM_LOC.x + Math.cos(away_angle) * PRIM_FARM_RADIUS;
				const target_y = PRIM_FARM_LOC.y + Math.sin(away_angle) * PRIM_FARM_RADIUS;
				await move(target_x, target_y);
				await delay(80);
				continue;
			}

			// 2. At radius: try rotating clockwise and counterclockwise, pick direction that increases separation
			const my_angle = Math.atan2(fy, fx);
			const step_rad = ROTATE_STEP_DEG * Math.PI / 180;
			// Clockwise
			const cw_angle = my_angle - step_rad;
			const cw_x = PRIM_FARM_LOC.x + Math.cos(cw_angle) * PRIM_FARM_RADIUS;
			const cw_y = PRIM_FARM_LOC.y + Math.sin(cw_angle) * PRIM_FARM_RADIUS;
			const cw_dist = Math.hypot(cw_x - sx, cw_y - sy);
			// Counterclockwise
			const ccw_angle = my_angle + step_rad;
			const ccw_x = PRIM_FARM_LOC.x + Math.cos(ccw_angle) * PRIM_FARM_RADIUS;
			const ccw_y = PRIM_FARM_LOC.y + Math.sin(ccw_angle) * PRIM_FARM_RADIUS;
			const ccw_dist = Math.hypot(ccw_x - sx, ccw_y - sy);

			// Pick the direction that gives more separation
			let target_x, target_y;
			if (cw_dist > ccw_dist) {
				target_x = cw_x;
				target_y = cw_y;
			} else {
				target_x = ccw_x;
				target_y = ccw_y;
			}
			await move(target_x, target_y);
			await delay(100);
		} else {
			await delay(1000);
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT ORBIT
// --------------------------------------------------------------------------------------------------------------------------------- //

let orbit_origin = null;

// Dynamically set orbit_origin based on character name
if (character.name === "Myras") {
	orbit_origin = HEALER_TARGET;
} else if (character.name === "Ulric") {
	orbit_origin = WARRIOR_TARGET;
} else if (character.name === "Riva") {
	orbit_origin = RANGER_TARGET;
}

let orbit_path_points = [];
let orbit_path_index = 0;
const MOVE_CHECK_INTERVAL = 120; // ms
const MOVE_TOLERANCE = 5; // pixels

function set_orbit_radius(r) {
	if (typeof r === "number" && r > 0) {
		orbit_radius = r;
		game_log(`Orbit radius set to ${orbit_radius}`);
	}
}

function compute_orbit_path(origin, ORBIT_RADIUS, steps) {
	const points = [];
	for (let i = 0; i < steps; i++) {
		const angle = (2 * Math.PI * i) / steps;
		points.push({
			x: origin.x + ORBIT_RADIUS * Math.cos(angle),
			y: origin.y + ORBIT_RADIUS * Math.sin(angle)
		});
	}
	return points;
}

async function orbit_loop() {

	let delay_ms = 50;

	while(true) {
		// Wait until orbit loop is enabled
		if (!ORBIT_LOOP_ENABLED) {
			await delay(100);
			continue;
		}

		// orbit_origin = { x: character.real_x, y: character.real_y };
		set_orbit_radius(ORBIT_RADIUS);
		orbit_path_points = compute_orbit_path(orbit_origin, ORBIT_RADIUS, ORBIT_STEPS);
		orbit_path_index = 0;

		while (true) {
			// Check if orbit loop is enabled
			if (!ORBIT_LOOP_ENABLED) {
				await delay(100);
				continue;
			}
			// Stop the loop if character is more than 100 units from the orbit origin
			const dist_from_origin = Math.hypot(character.real_x - orbit_origin.x, character.real_y - orbit_origin.y);
			if (dist_from_origin > 100) {
				game_log("⚠️ Exiting orbit: too far from origin.", "#FF0000");
				ORBIT_LOOP_ENABLED = false;
				break;
			}

			const point = orbit_path_points[orbit_path_index];
			orbit_path_index = (orbit_path_index + 1) % orbit_path_points.length;

			// Only move if not already close to the next point
			const dist = Math.hypot(character.real_x - point.x, character.real_y - point.y);
			if (!character.moving && !smart.moving && dist > MOVE_TOLERANCE) {
				try {
					await move(point.x, point.y);
				} catch (e) {
					console.error("Orbit move error:", e);
				}
			}

			// Wait until movement is finished or interrupted
			while (ORBIT_LOOP_ENABLED && (character.moving || smart.moving)) {
				await new Promise(resolve => setTimeout(resolve, MOVE_CHECK_INTERVAL));
			}

			// Small delay before next step to reduce CPU usage
			await delay(delay_ms);
		}
	}

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATUS CACHE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

function get_status_cache() {
	try { inventory_count = character.items.filter(Boolean).length; } catch (e) {}
	try { mpot1_count = character.items.filter(it => it && it.name === "mpot1").reduce((sum, it) => sum + (it.q || 1), 0); } catch (e) {}
	try { hpot1_count = character.items.filter(it => it && it.name === "hpot1").reduce((sum, it) => sum + (it.q || 1), 0); } catch (e) {}
	try { map = character.map; x = character.x; y = character.y; } catch (e) {}
}

async function status_cache_loop() {
	STATUS_CACHE_LOOP_ENABLED = true;
	let delay_ms = 5000;

		while (true) {
			if (!STATUS_CACHE_LOOP_ENABLED) {
				await delay(100);
				continue;
			}
			get_status_cache();
			// Only send status if inventory is 20+ or either potion is below 2000
			if (
				inventory_count >= 30 ||
				mpot1_count < 2000 ||
				hpot1_count < 2000
			) {
				try {
					send_cm("Riff", {
						type: "status_update",
						data: {
							name: character.name,
							inventory: inventory_count,
							mpot1: mpot1_count,
							hpot1: hpot1_count,
							map: map,
							x: x,
							y: y,
							last_seen: Date.now()
						}
					});
				} catch (e) {
					catcher(e, "Error sending status to Riff: ");
				}
			}

			await delay(delay_ms);
		}

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR CATCHER
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRITICAL_ERROR = "#ff1100ff";
const GENERAL_ERROR = "#ffa127ff";

function catcher(e, context = "Error") {
	// Map keywords to either a shorthand function or [shorthand, color]
	const keyword_map = {
		"attack cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("attack") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Attack c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"3shot cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("3shot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `3-Shot c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"5shot cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("5shot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `5-Shot c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"supershot cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("supershot") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Super Shot c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"huntersmark cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("huntersmark") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Hunters Mark c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"heal cooldown": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("heal") && msg.toLowerCase().includes("cooldown") && msg.toLowerCase().includes("ms")) {
					let ms_match = msg.match(/"ms":\s*(\d+)/) || msg.match(/ms[:=]\s*(\d+)/i);
					let ms_text = ms_match ? `, ${ms_match[1]}ms` : "";
					return `Heal c/d${ms_text} (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"missing monster": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("not_there")) {
					return `Monster already dead (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"out of range": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("too_far")) {
					return `Monster out of range (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		"out of mana": [
			(msg, ctx) => {
				if (msg.toLowerCase().includes("no_mp")) {
					return `Out of mana (${ctx})`;
				}
				return null;
			},
			GENERAL_ERROR
		],
		// Add more as needed
	};

	// Robust error message extraction
	let msg;
	if (typeof e === "string") {
		msg = e;
	} else if (e && e.message) {
		msg = e.message;
	} else {
		try {
			msg = JSON.stringify(e);
		} catch {
			msg = String(e);
		}
	}

	// Check for keywords and print shorthand if matched
	for (const [keyword, value] of Object.entries(keyword_map)) {
		if (Array.isArray(value)) {
			const [handler_or_str, color] = value;
			if (typeof handler_or_str === "function") {
				const result = handler_or_str(msg, context);
				if (result) {
					log(result, color, "Errors");
					return;
				}
			} else if (msg && msg.toLowerCase().includes(keyword)) {
				log(`${handler_or_str} (${context})`, color, "Errors");
				return;
			}
		}
	}

	// Default: print full error and stack trace if available
	let stack = "";
	if (e && e.stack) {
		stack = `\nStack trace:\n${e.stack}`;
	}
	log(`⚠️ ${context}: ${msg}${stack}`, "#FF0000", "Errors");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UI LAYOUT & BUTTONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function hide_skills_ui() {
	const doc = parent.document;

	// Hide skill buttons (bottom right grid)
	const skill_buttons = doc.querySelector("#skillbar");
	if (skill_buttons) skill_buttons.style.display = "none";

	// Hide the right panel (contains skills, info, etc.)
	const right_panel = doc.querySelector("#rightcorner");
	if (right_panel) right_panel.style.display = "none";

	// Optional: Hide the "Stats", "Skills", "Inventory" tab buttons
	const tabs = [
		"#rightcornerbuttonskills",
		"#rightcornerbuttonstats",
		"#rightcornerbuttoninventory"
	];
	for (const selector of tabs) {
		const btn = doc.querySelector(selector);
		if (btn) btn.style.display = "none";
	}
}

// Hides the game's native party bar UI
function hide_party_ui() {
	const doc = parent.document;
	// Hide the main party bar (usually #party or #party-frames)
	const party_bar = doc.querySelector("#party, #party-frames");
	if (party_bar) party_bar.style.display = "none";
	// Optionally hide any party-related buttons or elements
	const party_buttons = [
		"#party-button", // Example, adjust as needed
		"#party-leader-icon"
	];
	for (const selector of party_buttons) {
		const btn = doc.querySelector(selector);
		if (btn) btn.style.display = "none";
	}
}

function move_element_up_by_px(element_id, pixels) {
	const el = parent.document.getElementById(element_id);
	if (el) {
	const current_bottom = parseInt(window.getComputedStyle(el).bottom) || 0;
	el.style.bottom = (current_bottom + pixels) + "px";
	}
}

move_element_up_by_px("bottomleftcorner2", 370);
move_element_up_by_px("chatwparty", 370);
move_element_up_by_px("chatinput", 370);

parent.$("#bottomleftcorner").show();

function add_reload_button() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	if (!trc.length) return setTimeout(add_reload_button, 500);


	// Remove any existing reload or stats button to avoid duplicates
	$("#reload-btn").remove();
	$("#stats-btn").remove();

	// Create the stats button (as a div for consistent style)
	const stats_btn = $(`
		<div id="stats-btn" class="gamebutton" style="margin-right: 4px; cursor: pointer;">
			📊
		</div>
	`);
	stats_btn.on("click", () => {
		const doc = parent.document;
		let win = doc.getElementById("ui-statistics-window");
		if (!win) {
			if (typeof ui_window === "function") ui_window();
		} else {
			win.style.display = win.style.display === "none" ? "block" : "none";
		}
	});

	// Create the reload button
	const reload_btn = $(`
		<div id="reload-btn" class="gamebutton" style="margin-right: 0px; cursor: pointer;">
			🔄
		</div>
	`);
	reload_btn.on("click", () => {
		parent.window.location.reload();
	});

	// Insert stats button to the left of reload button
	trc.children().first().after(stats_btn);
	stats_btn.after(reload_btn);
}

add_reload_button();

// --------------------------------------------------------------------------------------------------------------------------------- //
// REMOTE SELLING
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = [
	"hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap",
	"cclaw", "crabclaw", "slimestaff", "stinger", "pstem", "gslime", "coat1", "helmet1",
	"gloves1", "pants1", "shoes1", "wbreeches", "vitring", "helmet", "shoes", "gloves",
	"pmace", "throwingstars", "t2bow", "spear", "dagger", "rapier", "sword", "mushroomstaff",
	"rfangs", "gphelmet", "phelmet", "vitearring", "vitscroll", "hhelmet", "harmor", "hpants",
	"hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring",
	"warmscarf", "snowball", "santasbelt", "lantern", "pclaw", "broom", "skullamulet",
	"iceskates", "carrot", "xmace", "candycanesword", "pmaceofthedead", "ornamentstaff",
	"merry", "rednose", "xmashat", "xmasshoes", "xmassweater", "xmaspants", "mittens",
	"angelwings", "snowflakes", "epyjamas", "ecape", "eears", "eslippers", "carrotsword",
	"pinkie", "oozingterror", "harbringer",
];

function remote_sell_items() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;
		if (item.l === "l" || item.p !== undefined) continue;
		if (SELLABLE_ITEMS.includes(item.name)) {
			sell(i, item.q || 1);
		}
	}
}
