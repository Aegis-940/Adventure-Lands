
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: this file only ever runs through Bootstrapper.js's eval-based
// loader, where top-level const/let are scoped to that one eval call and never
// become visible to Game_Config.js's shared CONFIG-reading functions (here,
// potion_loop()'s CONFIG.potions.hp_threshold/mp_threshold).
var CONFIG = {
	// Master switches — flip any of these off to stop that state from ever being selected.
	enabled: {
		upgrading: true,
		crafting: true,
		exchanging: false,
		fishing: true,
		mining: true,
	},
	locations: {
		HOME: { map: "main", x: -87, y: -96 },
		BANK_LOCATION: { map: "bank", x: 0, y: -37 },
		POTION_SHOP: { map: "main", x: -87, y: -150 },
		FISHING_SPOT: { map: "main", x: -1116, y: -285 },
		MINING_SPOT: { map: "tunnel", x: 244, y: -153 },
	},
	party: {
		members: ["Ulric", "Myras", "Riva"],
		nearby_trigger_range: 200, // is anyone worth checking on at all
		action_range: 350,        // close enough to actually act on this specific member
	},
	// Delivery is triggered contextually (see should_run_delivery()) by a fighter's own
	// cached state (Shared/Game_Config.js's state_cache_loop()/read_state_cache()),
	// not a timer.
	delivery: {
		free_slots_threshold: 10, // deliver if any party member has this many or fewer free slots
		gold_threshold: 20000000, // deliver if any party member is carrying at least this much gold
		// MLuck lasts 3600s — refresh each party member at least this often. Satisfied
		// opportunistically by mluck_buff_loop() whenever near the party; if it's about
		// to lapse on its own, that alone triggers a delivery run (see should_run_delivery()).
		mluck_refresh_interval: 50 * 60 * 1000,
	},
	upgrade_gold_threshold: 100000000,
	// Read by Shared/Game_Config.js's shared potion_loop() (self-use, HP/MP independent checks).
	potions: {
		hp_threshold: 500,
		mp_threshold: 500,
	},
	// Items to auto-craft — read directly by Merchant_Systems/Auto_Craft.js's try_craft().
	// { name, min?, max? } — min (default 1) is the smallest batch worth bothering with;
	// max (default unlimited) caps the batch size. Both are further bounded by actual
	// ingredient availability, free inventory space, and gold (see max_craftable_now()).
	crafting: {
		targets: [{ name: "basketofeggs", min: 100, max: 9999 }],
	},
	// Items to turn in at the exchange NPC, in priority order.
	exchange: {
		targets: [
			{ name: "goldenegg",    min: 1 },
			{ name: "basketofeggs", min: 1 },
			{ name: "gem0",         min: 1 },
			{ name: "gem1",         min: 1 },
			{ name: "armorbox",     min: 1 },
			{ name: "weaponbox",    min: 1 },
		],
	},
	// Items sell_and_bank() must never bank away, even mid-cycle.
	do_not_bank: [],
	// Crafting/exchanging/fishing/mining all end up depositing into the bank (directly,
	// or via sell_and_bank() at the end of a run) — disabled while free bank space is
	// below this, so a run doesn't start only to have nowhere to put what it collects.
	min_bank_free_space: 10,
	// Resting gear — worn at all times except the brief window a rod/pickaxe is
	// equipped for fishing/mining (see ensure_tool_equipped()/equip_default_gear()).
	default_gear: {
		mainhand: { name: "broom", level: 9 },
		offhand: { name: "wbookhs", level: 1 },
	},
	// Checked top to bottom by get_character_state() (see PRIORITY_CHECKS) every time
	// the merchant is Idle. Reorder to change what the merchant prefers to do first.
	// Fishing/mining sit above crafting/exchanging: all four require free bank space
	// (has_enough_bank_space()), but upgrading no longer does (see should_run_upgrade()),
	// so whenever bank space is scarce, upgrading was winning every cycle and crafting/
	// exchanging were permanently starving fishing/mining out of a turn.
	priorities: ["dead", "delivering", "upgrading", "fishing", "mining", "crafting", "exchanging"],
};

// Game_Config.js's shared potion_loop()/auto_buy_potions() aren't used here — the
// merchant's potion needs (bulk buying to redistribute to the party) are handled by
// buy_potion_loop() below; Game_Config.js's shared potion_loop() (self-use) is
// started separately from Characters/Merchant.js.

// var, not const: Auto_Upgrade.js and Auto_Craft.js are separate role files that each get
// their own eval closure (see the CONFIG comment above) and reference HOME/BANK_LOCATION
// as bare globals — same visibility requirement as CONFIG.
var HOME = CONFIG.locations.HOME;
var BANK_LOCATION = CONFIG.locations.BANK_LOCATION;
const PARTY = CONFIG.party.members; // only read within this file — const is fine

var merchant_task = "Idle"; // Current task: "Idle", "Delivering", etc. — var so Auto_Upgrade.js can share this global

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE MACHINE
// --------------------------------------------------------------------------------------------------------------------------------- //

// Just state name constants — actual priority/check order lives entirely in
// CONFIG.priorities (see get_character_state()) above, not in this object's own key
// order. Each state is purely contextual — "is there actually something to do right
// now" — not time-interval-based. Once a state starts, its handler runs to completion
// (loop_controller() awaits it) before the priority list is ever re-checked, so nothing
// here interrupts an in-progress action.
const MERCHANT_STATES = {
	DEAD: "dead",
	DELIVERING: "delivering",
	UPGRADING: "upgrading",
	CRAFTING: "crafting",
	EXCHANGING: "exchanging",
	FISHING: "fishing",
	MINING: "mining",
	IDLE: "idle",
};

const DELIVERY_WAIT_MAX_ATTEMPTS = 40; // ~2 minutes at 3s/attempt before giving up and heading home anyway
const FISHING_POSITION_TOLERANCE = 5;
const MINING_POSITION_TOLERANCE = 10;

// Last time each party member (by name) was mluck'd — see is_mluck_due()/
// buff_nearby_party(), shared by the passive mluck_buff_loop() and delivery runs.
let last_mluck_time = {};

function is_mluck_due(name) {
	return (Date.now() - (last_mluck_time[name] || 0)) > CONFIG.delivery.mluck_refresh_interval;
}

// read_state_cache() (Shared/Game_Config.js) reads each fighter's localStorage
// state snapshot directly — no CM round trip, and it already returns null for a stale
// or missing entry. Delivery is also due on its own once mluck is about to lapse on
// anyone — that run doubles as the buff pass (see handle_delivering_state()), so a
// stale buff alone is enough to trigger it.
function should_run_delivery() {
	if (merchant_task !== "Idle") return false;
	for (const name of PARTY) {
		if (is_mluck_due(name)) return true;
		const status = read_state_cache(name);
		if (!status) continue;
		if (status.free_slots <= CONFIG.delivery.free_slots_threshold) return true;
		if (status.gold >= CONFIG.delivery.gold_threshold) return true;
	}
	return false;
}

// Total free slots across every bank pack. Returns 0 (fail safe — treat as "no room")
// if bank data hasn't been loaded yet, rather than guessing there's space.
function bank_free_space() {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return 0;

	let free = 0;
	for (const pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		free += bank_data[pack].filter(it => !it).length;
	}
	return free;
}

// Crafting/exchanging/fishing/mining all end up depositing into the bank — gate them
// on there actually being room, so a run doesn't start only to have nowhere to put
// what it collects.
function has_enough_bank_space() {
	return bank_free_space() >= CONFIG.min_bank_free_space;
}

function should_run_upgrade() {
	// Unlike craft/exchange/fishing/mining, upgrading doesn't need free bank space to
	// start: it consumes scrolls and (on compound) merges multiple stacks into fewer
	// items, so it typically frees space rather than needing it up front.
	return CONFIG.enabled.upgrading
		&& merchant_task === "Idle"
		&& character.gold >= CONFIG.upgrade_gold_threshold
		&& bank_has_upgradeable_items(); // Merchant_Systems/Auto_Upgrade.js — is there anything in the bank worth upgrading/combining?
}

function should_run_craft() {
	return CONFIG.enabled.crafting
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& can_afford_any_craft(); // Merchant_Systems/Auto_Craft.js
}

function should_run_exchange() {
	return CONFIG.enabled.exchanging
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& has_exchangeable_items();
}

function should_run_fishing() {
	return CONFIG.enabled.fishing
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& !is_on_cooldown("fishing");
}

function should_run_mining() {
	return CONFIG.enabled.mining
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& !is_on_cooldown("mining");
}

// Maps each CONFIG.priorities key to the state it selects and the check that decides
// whether that state is due right now.
const PRIORITY_CHECKS = {
	dead:        { state: MERCHANT_STATES.DEAD,       should_run: () => character.rip },
	delivering:  { state: MERCHANT_STATES.DELIVERING, should_run: should_run_delivery },
	upgrading:   { state: MERCHANT_STATES.UPGRADING,  should_run: should_run_upgrade },
	crafting:    { state: MERCHANT_STATES.CRAFTING,   should_run: should_run_craft },
	exchanging:  { state: MERCHANT_STATES.EXCHANGING, should_run: should_run_exchange },
	fishing:     { state: MERCHANT_STATES.FISHING,    should_run: should_run_fishing },
	mining:      { state: MERCHANT_STATES.MINING,     should_run: should_run_mining },
};

function get_character_state() {
	for (const key of CONFIG.priorities) {
		const check = PRIORITY_CHECKS[key];
		if (check && check.should_run()) return check.state;
	}
	return MERCHANT_STATES.IDLE;
}

async function handle_dead_state() {
	try {
		if (character.rip) await respawn();
	} catch (e) {
		catcher(e, "handle_dead_state");
	}
}

async function handle_delivering_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Delivering";
	try {
		log("Beginning delivery run...");

		let attempts = 0;
		while (!any_party_within_range() && attempts < DELIVERY_WAIT_MAX_ATTEMPTS) {
			// state_cache_loop() (running on every fighter, ~every 100ms) already keeps
			// each party member's map/x/y fresh in localStorage — read_state_cache() is
			// instant and local, no CM round trip needed (that's exactly why the cache
			// exists; move_to_character()'s "where_are_you"/"my_location" exchange was
			// redundant with it). Head toward the first party member with a live,
			// non-stale cache entry, re-reading every attempt so we keep tracking them
			// as they move.
			for (const name of PARTY) {
				const status = read_state_cache(name);
				if (status && !status.rip) {
					smarter_move({ map: status.map, x: status.x, y: status.y })
						.catch(e => catcher(e, "handle_delivering_state: smarter_move to " + name));
					break;
				}
			}

			await delay(3000);
			attempts++;
		}
		if (attempts >= DELIVERY_WAIT_MAX_ATTEMPTS) {
			log("⚠️ No party member came within range — heading home anyway.", "#FFA500");
		}

		// Covers both "buffed opportunistically during a normal delivery" and "delivery
		// was triggered solely because mluck was about to lapse" — same run either way.
		await buff_nearby_party();

		await smarter_move(HOME);
		await delay(1000);
		await sell_and_bank();
	} catch (e) {
		catcher(e, "handle_delivering_state");
	} finally {
		merchant_task = "Idle";
	}
}

async function handle_upgrading_state() {
	if (merchant_task !== "Idle") return;
	try {
		log("Starting auto-upgrade process...");
		await auto_upgrade(); // Merchant_Systems/Auto_Upgrade.js — manages merchant_task itself, ends back on "Idle"
	} catch (e) {
		catcher(e, "handle_upgrading_state");
		merchant_task = "Idle";
	}
}

async function handle_crafting_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Crafting";
	try {
		await try_craft(); // Merchant_Systems/Auto_Craft.js
	} catch (e) {
		catcher(e, "handle_crafting_state");
	} finally {
		merchant_task = "Idle";
	}
}

async function handle_exchanging_state() {
	if (merchant_task !== "Idle") return;
	await exchange_items(); // has its own exchange_items_running guard + finally reset to "Idle"
}

// Equips CONFIG.default_gear's mainhand/offhand — the merchant's resting loadout,
// worn at all times except the brief window a rod/pickaxe is equipped for fishing/
// mining. Called once fishing/mining ends (success, failure, or error) and once at
// startup (Characters/Merchant.js). No-ops per slot if the gear isn't in inventory.
async function equip_default_gear() {
	for (const slot of ["mainhand", "offhand"]) {
		const gear = CONFIG.default_gear[slot];
		const current = character.slots[slot];
		if (current && current.name === gear.name && current.level === gear.level) continue;

		const idx = character.items.findIndex(item => item && item.name === gear.name && item.level === gear.level);
		if (idx === -1) continue;

		await equip(idx, slot);
		await delay(400);
	}
}

// Makes sure `tool_name` ("rod"/"pickaxe") is available in inventory — checks
// inventory first, then the bank, then falls back to crafting one via
// Merchant_Systems/Auto_Craft.js's craft_item(). Does NOT equip it. Called BEFORE
// traveling to the fishing/mining spot, so a genuinely unobtainable tool doesn't waste
// a trip there. Returns true once available, false if it couldn't be obtained any way.
async function ensure_tool_available(tool_name) {
	function find_in_inventory() {
		return character.items.findIndex(item => item && item.name === tool_name);
	}

	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;
	if (find_in_inventory() !== -1) return true;

	log(`🔎 No ${tool_name} in inventory, checking bank...`);
	await smarter_move(BANK_LOCATION);
	await delay(500);
	// Awaited (unlike the hot-path withdrawal loops elsewhere) — this only runs once
	// per fishing/mining start, and the tool must actually be in inventory before the
	// caller trusts the return value.
	await withdraw_item(tool_name);
	await delay(400);
	if (find_in_inventory() !== -1) return true;

	log(`🔨 No ${tool_name} in bank either, attempting to craft one...`);
	for (let attempt = 0; attempt < 8; attempt++) {
		const result = await craft_item(tool_name); // Merchant_Systems/Auto_Craft.js
		if (result === "crafted") break;
		if (result !== "buying" && result !== "withdrawing") break; // "missing"/"no_recipe" — no point retrying
		await delay(400);
	}

	if (find_in_inventory() === -1) {
		log(`❌ Could not obtain a ${tool_name} (not in inventory, bank, or craftable).`);
		return false;
	}
	return true;
}

// Equips `tool_name` in mainhand — call only once already standing at the fishing/
// mining spot (see the handlers below), never in advance: the rod/pickaxe should only
// ever be worn immediately before the skill, with CONFIG.default_gear worn otherwise.
// Assumes ensure_tool_available() already confirmed it's in inventory. Two-handed, so
// the offhand must be empty first — unequips it if occupied.
async function equip_tool(tool_name) {
	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;

	const idx = character.items.findIndex(item => item && item.name === tool_name);
	if (idx === -1) return false;

	if (character.slots.offhand) {
		await unequip("offhand");
		await delay(400);
	}

	await equip(idx, "mainhand");
	await delay(400);
	return character.slots.mainhand && character.slots.mainhand.name === tool_name;
}

// Shared by fishing/mining (previously two ~55-line near-identical copies) — gathers
// the tool, travels to the spot, equips it there, then channels the skill until
// cooldown/space/position/death stops it, and finally sells and banks. Checks
// character.rip on every iteration (including mid-channel waits) so death preempts
// gathering immediately instead of waiting for an incidental skill-call rejection.
async function handle_gathering_state(tool_name, skill_name, spot, tolerance, task_label) {
	if (merchant_task !== "Idle") return;
	merchant_task = task_label;
	try {
		// Check availability BEFORE traveling anywhere — no point walking to the spot
		// for a tool we can't actually get.
		const tool_available = await ensure_tool_available(tool_name);
		if (!tool_available) {
			log(`❌ No ${tool_name} available (not in inventory, bank, or craftable).`);
			return;
		}

		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
			// Explicit radius: smarter_move()'s own default arrival radius (10) is looser
			// than tolerance (5 for fishing) — without this, smarter_move() could consider
			// itself "arrived" 6-9 units out, and the while loop's own tolerance check right
			// below would immediately see "not close enough" and abort before ever casting.
			await smarter_move(spot, null, { radius: tolerance });
		}

		const tool_equipped = await equip_tool(tool_name);
		if (!tool_equipped) {
			log(`❌ Could not equip ${tool_name} at the ${skill_name} spot.`);
			return;
		}

		while (!is_on_cooldown(skill_name)) {
			if (character.rip) {
				log(`❌ Died while ${skill_name}, stopping.`);
				break;
			}
			if (!character.slots.mainhand || character.slots.mainhand.name !== tool_name) {
				log(`❌ ${tool_name} not equipped, stopping ${skill_name}.`);
				break;
			}
			if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
				log(`❌ Not at ${skill_name} spot, stopping.`);
				break;
			}
			if (character.items.filter(Boolean).length >= character.items.length) {
				log(`📦 Inventory full, stopping ${skill_name}.`);
				break;
			}
			try {
				await use_skill(skill_name);
			} catch (e) {
				catcher(e, `handle_gathering_state(${skill_name}): use_skill`);
				break;
			}
			// is_on_cooldown() alone clears before the multi-second channel actually
			// finishes — also wait for character.c[skill_name] to clear, or the skill
			// gets spammed mid-channel. Also bail out immediately on death.
			await delay(200);
			while (!character.rip && ((character.c && character.c[skill_name]) || is_on_cooldown(skill_name))) {
				await delay(200);
			}
		}

		await sell_and_bank();
	} catch (e) {
		catcher(e, `handle_gathering_state(${skill_name})`);
	} finally {
		// try/catch here, not just around the outer body — an exception thrown inside a
		// finally block aborts the REST of that finally block too, so an unguarded
		// equip_default_gear() failure (rejected equip(), network hiccup, anything) would
		// skip merchant_task = "Idle" entirely, permanently stuck on this task forever
		// since every should_run_*() check requires merchant_task === "Idle".
		try {
			await equip_default_gear();
		} catch (e) {
			catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
		}
		merchant_task = "Idle";
	}
}

async function handle_fishing_state() {
	await handle_gathering_state("rod", "fishing", CONFIG.locations.FISHING_SPOT, FISHING_POSITION_TOLERANCE, "Fishing");
}

async function handle_mining_state() {
	await handle_gathering_state("pickaxe", "mining", CONFIG.locations.MINING_SPOT, MINING_POSITION_TOLERANCE, "Mining");
}

async function set_state(state) {
	try {
		switch (state) {
			case MERCHANT_STATES.DEAD:       await handle_dead_state(); break;
			case MERCHANT_STATES.DELIVERING: await handle_delivering_state(); break;
			case MERCHANT_STATES.UPGRADING:  await handle_upgrading_state(); break;
			case MERCHANT_STATES.CRAFTING:   await handle_crafting_state(); break;
			case MERCHANT_STATES.EXCHANGING: await handle_exchanging_state(); break;
			case MERCHANT_STATES.FISHING:    await handle_fishing_state(); break;
			case MERCHANT_STATES.MINING:     await handle_mining_state(); break;
			case MERCHANT_STATES.IDLE:
			default:
				break;
		}
	} catch (e) {
		catcher(e, "set_state: unhandled error");
	}
}

// Self-healing safety net: if merchant_task ever gets stuck non-"Idle" (an unforeseen
// deadlock in some handler — we've already found and fixed two different ways that
// happened) the whole state machine freezes forever, since every should_run_*() check
// requires merchant_task === "Idle". Tracked here rather than at each assignment site
// since merchant_task is set in several places (state handlers, Auto_Upgrade.js).
const MERCHANT_TASK_WATCHDOG_MS = 5 * 60 * 1000; // 5 minutes
let watchdog_task = merchant_task;
let watchdog_since = Date.now();

// Sole owner of "where is the character going right now" — every other loop in this
// file is passive (no smarter_move calls), so there's only ever one active traveler.
async function loop_controller() {
	while (true) {
		try {
			party_manager();

			if (merchant_task !== watchdog_task) {
				watchdog_task = merchant_task;
				watchdog_since = Date.now();
			} else if (merchant_task !== "Idle" && Date.now() - watchdog_since > MERCHANT_TASK_WATCHDOG_MS) {
				game_log(`⚠️ Merchant stuck on "${merchant_task}" for over ${MERCHANT_TASK_WATCHDOG_MS / 60000} minutes — forcing back to Idle.`, "#FF3333");
				merchant_task = "Idle";
				watchdog_task = "Idle";
				watchdog_since = Date.now();
			}

			const state = get_character_state();
			await set_state(state);
		} catch (e) {
			catcher(e, "loop_controller");
		}
		await delay(250);
	}
}

// Game-engine-invoked callbacks (same convention as on_cm in Game_Config.js) — not dead code.
function on_party_request(name) {
	if (PARTY.includes(name)) accept_party_request(name);
}

function on_party_invite(name) {
	if (PARTY.includes(name)) accept_party_invite(name);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SHARED HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

function any_party_within_range(range = CONFIG.party.nearby_trigger_range) {
	for (const name of PARTY) {
		const player = get_player(name);
		if (
			player &&
			!player.rip &&
			player.map === character.map &&
			Math.hypot(character.x - player.x, character.y - player.y) <= range
		) {
			return true;
		}
	}
	return false;
}

async function mluck_party_member(player) {
	change_target(player);
	await delay(100);
	use_skill("mluck", player);
	await delay(200);
	last_mluck_time[player.name] = Date.now();
}

// Casts mluck on every nearby party member whose buff is actually due (is_mluck_due()),
// skipping anyone already fresh. Shared by the passive mluck_buff_loop() (opportunistic,
// whenever near the party) and handle_delivering_state() (a delivery run doubles as the
// buff pass — see should_run_delivery()).
async function buff_nearby_party() {
	let buffed_any = false;
	for (const name of PARTY) {
		if (!is_mluck_due(name)) continue;
		try {
			const player = get_player(name);
			if (
				!player || player.rip || character.map !== player.map ||
				Math.hypot(character.x - player.x, character.y - player.y) > CONFIG.party.action_range
			) {
				continue;
			}
			await mluck_party_member(player);
			buffed_any = true;
		} catch (e) {
			catcher(e, "buff_nearby_party: " + name);
		}
	}
	if (buffed_any) log("Cast MLuck.", "limegreen");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUY POTION LOOP (passive — no travel, safe to run alongside the state machine)
// --------------------------------------------------------------------------------------------------------------------------------- //

async function buy_potion_loop() {
	const MAX_POTS = 9999;
	const MIN_BUY = 100;
	while (true) {
		try {
			const shop = CONFIG.locations.POTION_SHOP;
			if (character.map === shop.map && Math.hypot(character.x - shop.x, character.y - shop.y) < 300) {
				for (const pot of ["mpot1", "hpot1"]) {
					let total = 0;
					for (const item of character.items) {
						if (item && item.name === pot) total += item.q || 1;
					}
					const to_buy = MAX_POTS - total;
					if (to_buy > MIN_BUY) {
						log(`🧪 Buying ${to_buy} x ${pot} (you have ${total})`);
						buy(pot, to_buy);
					}
				}
			}
		} catch (e) {
			catcher(e, "buy_potion_loop");
		}
		await delay(1000);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT COLLECTION LOOP (passive)
// --------------------------------------------------------------------------------------------------------------------------------- //

async function loot_collection_loop() {
	const COOLDOWN = 60000;
	let last_loot_time = 0;
	while (true) {
		try {
			if (Date.now() - last_loot_time >= COOLDOWN && any_party_within_range()) {
				for (const name of PARTY) {
					const player = get_player(name);
					if (
						!player || player.rip || character.map !== player.map ||
						Math.hypot(character.x - player.x, character.y - player.y) > CONFIG.party.action_range
					) {
						continue;
					}
					send_cm(name, { type: "send_loot" });
					await delay(200);
				}
				log("Requested loot from nearby party members.", "limegreen");
				last_loot_time = Date.now();
			}
		} catch (e) {
			catcher(e, "loot_collection_loop");
		}
		await delay(500);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MLUCK BUFF LOOP (passive)
// --------------------------------------------------------------------------------------------------------------------------------- //

// Opportunistic buffing — casts on whoever's nearby and due (is_mluck_due()) right now.
// Doesn't guarantee the 50-minute refresh by itself (only fires when someone happens to
// be nearby); should_run_delivery()/handle_delivering_state() is the guarantee, actively
// finding the party once a buff is about to lapse on its own.
async function mluck_buff_loop() {
	while (true) {
		try {
			if (any_party_within_range()) {
				await buff_nearby_party();
			}
		} catch (e) {
			catcher(e, "mluck_buff_loop");
		}
		await delay(5000);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SELL AND BANK ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

// SELLABLE_ITEMS defined in Game_Config.js

function has_sellable_items() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && SELLABLE_ITEMS.includes(item.name)) return true;
	}
	return false;
}

function has_bankable_items() {
	for (let i = 3; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !CONFIG.do_not_bank.includes(item.name)) return true;
	}
	return false;
}

// Don't issue smarter_move() on top of movement already in progress elsewhere (e.g. a
// fishing/mining loop's own step, or the state machine mid-transition) -- but wait for
// it to settle instead of silently abandoning the call, which left the character
// stranded wherever it happened to be moving when this fired. Shared by sell_items()
// and bank_items() below.
async function wait_for_movement_to_settle(caller_label) {
	let move_wait = 0;
	while (character.moving && move_wait < 20) {
		await delay(250);
		move_wait++;
	}
	if (character.moving) {
		log(`⚠️ ${caller_label}: still moving after waiting, proceeding anyway.`);
	}
}

let sell_items_running = false;

// Travels home and sells everything in SELLABLE_ITEMS -- no-ops (no travel at all) if
// nothing sellable is actually carried. Returns true if anything was sold.
async function sell_items() {
	if (!has_sellable_items()) return false;
	if (sell_items_running) {
		log("⚠️ sell_items already running, skipping duplicate call.");
		return false;
	}

	await wait_for_movement_to_settle("sell_items");

	sell_items_running = true;
	let sold_any = false;
	try {
		await smarter_move(HOME);
		await delay(3000);

		for (let i = 0; i < character.items.length; i++) {
			const item = character.items[i];
			if (!item) continue;
			if (SELLABLE_ITEMS.includes(item.name)) {
				try {
					sell(i, item.q || 1);
					game_log(`💰 Sold ${item.name} x${item.q || 1}`);
					sold_any = true;
				} catch (e) {
					catcher(e, "sell_items: sell " + item.name);
				}
			}
		}
	} catch (e) {
		catcher(e, "sell_items");
	} finally {
		sell_items_running = false;
	}
	return sold_any;
}

let bank_items_running = false;

// Travels to the bank and deposits everything from slot 3 onward not in
// CONFIG.do_not_bank -- no-ops (no travel at all) if nothing bankable is actually
// carried. Returns true if anything was banked.
async function bank_items() {
	if (!has_bankable_items()) return false;
	if (bank_items_running) {
		log("⚠️ bank_items already running, skipping duplicate call.");
		return false;
	}

	await wait_for_movement_to_settle("bank_items");

	bank_items_running = true;
	let banked_any = false;
	try {
		await smarter_move(BANK_LOCATION);
		await delay(1000);

		for (let i = 3; i < character.items.length; i++) {
			const item = character.items[i];
			if (!item || CONFIG.do_not_bank.includes(item.name)) continue;
			try {
				await bank_store(i);
				game_log(`🏦 Deposited ${item.name} x${item.q || 1} to bank`);
				banked_any = true;
			} catch (e) {
				catcher(e, "bank_items: bank_store " + item.name);
			}
		}

		if (banked_any) {
			await parent.$("#maincode")[0].contentWindow.render_bank_items();
			await delay(1000);
			await parent.hide_modal();
		}
	} catch (e) {
		catcher(e, "bank_items");
	} finally {
		bank_items_running = false;
	}
	return banked_any;
}

// Composes sell_items()/bank_items() -- each independently skips its own travel when
// there's nothing to do -- then always finishes with one trip home, so callers (fishing/
// mining/delivering/exchanging) can rely on this to reliably reposition them at HOME
// even on a "nothing to sell or bank" run.
async function sell_and_bank() {
	const sold = await sell_items();
	const banked = await bank_items();

	await smarter_move(HOME);
	await delay(1000);

	if (sold || banked) {
		game_log("🏠 Returned home after selling/banking.");
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

let exchange_items_running = false;
const EXCHANGE_POSITION_TOLERANCE = 5;

// Checked by should_run_exchange() — is there actually an exchangeable target on hand
// (inventory or bank) right now, rather than firing on a timer regardless of contents?
function has_exchangeable_items() {
	for (const target of CONFIG.exchange.targets) {
		let count = 0;
		for (const item of character.items) {
			if (item && item.name === target.name) count += item.q || 1;
		}
		if (count >= target.min) return true;
	}

	const bank_data = character.bank || load_bank_from_local_storage();
	if (bank_data) {
		for (const target of CONFIG.exchange.targets) {
			let count = 0;
			for (const pack in bank_data) {
				if (!Array.isArray(bank_data[pack])) continue;
				for (const item of bank_data[pack]) {
					if (item && item.name === target.name) count += item.q || 1;
				}
			}
			if (count >= target.min) return true;
		}
	}

	return false;
}

async function exchange_items() {
	if (exchange_items_running) {
		log("⚠️ Exchange already running, skipping duplicate call.");
		return;
	}

	exchange_items_running = true;
	merchant_task = "Exchanging";

	try {
		let item_name = null;
		let item_slot = -1;
		for (const config of CONFIG.exchange.targets) {
			for (let i = 0; i < character.items.length; i++) {
				const itm = character.items[i];
				if (itm && itm.name === config.name) {
					item_slot = i;
					item_name = config.name;
					break;
				}
			}
			if (item_slot !== -1) break;
		}

		if (item_slot === -1) {
			log("No exchangeable items found, attempting to withdraw from bank...", "#888");
			await smarter_move(BANK_LOCATION);
			await delay(500);

			let withdrew = false;
			for (const item of CONFIG.exchange.targets) {
				try {
					withdraw_item(item.name, null, 9999);
					await delay(400);
					for (let i = 0; i < character.items.length; i++) {
						const itm = character.items[i];
						if (itm && itm.name === item.name) {
							item_slot = i;
							item_name = item.name;
							withdrew = true;
							log("Item withdrawn from bank: " + item.name);
							break;
						}
					}
				} catch (e) {
					catcher(e, "exchange_items: withdraw " + item.name);
				}
				if (withdrew) break;
			}

			if (item_slot === -1) {
				log("No valid items to exchange after bank withdrawal, returning home.", "#888");
				await smarter_move(HOME);
				return;
			}
		}

		const item_config = CONFIG.exchange.targets.find(cfg => cfg.name === item_name);
		const min_count = item_config?.min ?? 1;

		// Explicit radius: see the matching comment in handle_gathering_state() — without
		// this, smarter_move()'s looser default arrival radius (10) vs
		// EXCHANGE_POSITION_TOLERANCE (5) could immediately fail the while loop's own
		// position check below, right after arriving.
		await smarter_move(HOME, null, { radius: EXCHANGE_POSITION_TOLERANCE });
		await delay(500);

		log(`📍 At exchange location for ${item_name}. Starting exchange...`);

		let keep_going = true;
		while (keep_going) {
			if (character.map !== HOME.map || Math.hypot(character.x - HOME.x, character.y - HOME.y) > EXCHANGE_POSITION_TOLERANCE) {
				log("❌ Not at exchange location. Stopping.");
				break;
			}

			for (let i = 0; i < character.items.length; i++) {
				const itm = character.items[i];
				if (itm && SELLABLE_ITEMS.includes(itm.name)) {
					sell(i, itm.q || 1);
					log(`💰 Sold ${itm.name} x${itm.q || 1}`);
				}
			}

			if (character.items.filter(Boolean).length >= character.items.length) {
				log(`📦 Inventory full. Running sell_and_bank for ${item_name}.`);
				await sell_and_bank();
				await delay(200);
				await smarter_move(HOME, null, { radius: EXCHANGE_POSITION_TOLERANCE });
				await delay(200);
				continue;
			}

			let found_stack = false;
			for (let i = 0; i < character.items.length; i++) {
				const itm = character.items[i];
				if (itm && itm.name === item_name && (itm.q || 1) >= min_count) {
					try {
						log(`🔁 Exchanging slot ${i} (${item_name} x${itm.q || 1})`);
						if (!character.q.exchange) {
							await use_skill("massexchange");
						}
						await exchange(i);
						found_stack = true;
					} catch (e) {
						catcher(e, "exchange_items: exchange " + item_name);
						keep_going = false;
					}
					break;
				}
			}

			if (!found_stack) {
				log(`✅ No more ${item_name} stacks with at least ${min_count}.`);
				keep_going = false;
				await delay(50);
			}
		}

		log(`Finished exchanging all ${item_name}`, "#00ff00");
	} catch (e) {
		catcher(e, "exchange_items");
	} finally {
		exchange_items_running = false;
		merchant_task = "Idle";
	}
}
