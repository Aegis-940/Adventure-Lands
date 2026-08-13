
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

// Overridable live via UI/Settings_Window.js -- localStorage is shared across all 4
// characters' tabs, so a save from any tab is visible here on next reload.
function local_bool(key, fallback) {
	const raw = localStorage.getItem(key);
	return raw === null ? fallback : raw === "true";
}

// var, not const: this file runs through Bootstrapper.js's eval-based loader, where
// top-level const/let stay scoped to that eval and aren't visible to Game_Config.js's
// shared CONFIG-reading functions (e.g. potion_loop()'s CONFIG.potions.*).
var CONFIG = {
	// Flip any of these off to stop that state from ever being selected.
	enabled: {
		upgrading:  local_bool("AL_merchant_enabled_upgrading", true),
		crafting:   local_bool("AL_merchant_enabled_crafting", true),
		exchanging: local_bool("AL_merchant_enabled_exchanging", false),
		fishing:    local_bool("AL_merchant_enabled_fishing", true),
		mining:     local_bool("AL_merchant_enabled_mining", true),
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
	// Delivery is triggered contextually (see should_run_delivery()) from a fighter's
	// cached state (state_cache_loop()/read_state_cache()), not a timer.
	delivery: {
		free_slots_threshold: 10, // deliver if any party member has this many or fewer free slots
		gold_threshold: 20000000, // deliver if any party member is carrying at least this much gold
		// MLuck lasts 3600s — refresh at least this often. Satisfied opportunistically by
		// mluck_buff_loop(); an impending lapse alone also triggers a delivery run.
		mluck_refresh_interval: 50 * 60 * 1000,
	},
	upgrade_gold_threshold: 100000000,
	// Read by Shared/Game_Config.js's shared potion_loop() (self-use, HP/MP independent checks).
	potions: {
		hp_threshold: 500,
		mp_threshold: 500,
	},
	// Items to auto-craft — read by Auto_Craft.js's try_craft(). min (default 1) is the
	// smallest batch worth bothering with; max (default unlimited) caps batch size. Both
	// are further bounded by ingredients, free space, and gold (see max_craftable_now()).
	crafting: {
		targets: [{ name: "basketofeggs", min: 25, max: 9999 }],
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
	// Crafting/exchanging/fishing/mining all deposit into the bank eventually — disabled
	// below this threshold so a run doesn't start with nowhere to put what it collects.
	min_bank_free_space: 10,
	// Resting gear — worn at all times except the brief window a rod/pickaxe is
	// equipped for fishing/mining (see ensure_tool_equipped()/equip_default_gear()).
	default_gear: {
		mainhand: { name: "broom", level: 9 },
		offhand: { name: "wbookhs", level: 1 },
	},
	// Checked top to bottom by get_character_state() (see PRIORITY_CHECKS) whenever Idle.
	// Fishing/mining sit above crafting/exchanging: all four require free bank space
	// (has_enough_bank_space()) but upgrading doesn't, so when space is scarce, crafting/
	// exchanging previously starved fishing/mining out of a turn every cycle.
	priorities: ["dead", "delivering", "upgrading", "fishing", "mining", "crafting", "exchanging"],
};

// Game_Config.js's shared potion_loop()/auto_buy_potions() aren't used here — bulk
// buying for the party is handled by buy_potion_loop() below; potion_loop() (self-use)
// is started separately from Characters/Merchant.js.

// var, not const: Auto_Upgrade.js/Auto_Craft.js are separate eval closures that reference
// HOME/BANK_LOCATION as bare globals — same visibility requirement as CONFIG.
var HOME = CONFIG.locations.HOME;
var BANK_LOCATION = CONFIG.locations.BANK_LOCATION;
const PARTY = CONFIG.party.members; // only read within this file — const is fine

var merchant_task = "Idle"; // Current task: "Idle", "Delivering", etc. — var so Auto_Upgrade.js can share this global

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE MACHINE
// --------------------------------------------------------------------------------------------------------------------------------- //

// State name constants — priority/check order lives in CONFIG.priorities, not here.
// Each state is contextual, not time-interval-based. Once started, a handler runs to
// completion (loop_controller() awaits it) before the priority list is re-checked.
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

// read_state_cache() reads each fighter's localStorage snapshot directly (no CM round
// trip), returning null for stale/missing entries. An impending mluck lapse alone also
// triggers delivery, since that run doubles as the buff pass.
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

		// Fighters jitter x/y constantly while orbiting their target (walk_in_circle());
		// only re-target when the cached position moved meaningfully or the map changed,
		// to avoid erratically recalculating on every tiny cache update. Must exceed the
		// largest orbit diameter (2x circle_radius; Ranger's 75 is the largest), not just
		// its radius, since opposite points on one orbit can be that far apart.
		const RETARGET_THRESHOLD = 160;
		let last_target = null;

		let attempts = 0;
		while (!any_party_within_range() && attempts < DELIVERY_WAIT_MAX_ATTEMPTS) {
			// Head toward the first party member with a live, non-stale cache entry
			// (state_cache_loop() keeps map/x/y fresh in localStorage), re-reading every
			// attempt to keep tracking them as they move.
			for (const name of PARTY) {
				const status = read_state_cache(name);
				if (status && !status.rip) {
					const moved_enough = !last_target
						|| last_target.map !== status.map
						|| Math.hypot(status.x - last_target.x, status.y - last_target.y) > RETARGET_THRESHOLD;

					if (moved_enough) {
						log(`🎯 Delivery: heading to ${name} @ ${status.map} (${Math.round(status.x)}, ${Math.round(status.y)})`, "#888");

						// "interrupted" = this re-target replaced a still-in-flight move, not a
						// real failure -- don't log it via catcher() like a genuine one.
						smarter_move({ map: status.map, x: status.x, y: status.y })
							.catch(e => {
								if (e?.reason !== "interrupted") catcher(e, "handle_delivering_state: smarter_move to " + name);
							});
						last_target = { map: status.map, x: status.x, y: status.y };
					}
					break;
				}
			}

			await delay(3000);
			attempts++;
		}
		if (attempts >= DELIVERY_WAIT_MAX_ATTEMPTS) {
			log("⚠️ No party member came within range — heading home anyway.", "#FFA500");
		}

		// Covers both a normal delivery and one triggered solely by an impending mluck lapse.
		await buff_nearby_party();

		// No explicit travel to HOME here -- sell_and_bank() already gets there
		// contextually (via sell_items()/bank_items() if there's actually something to
		// sell/bank, always ending with one trip home either way), so a pre-emptive move
		// here was a redundant extra leg.
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

// Equips the resting loadout (CONFIG.default_gear). Called once fishing/mining ends
// and once at startup. No-ops per slot if the gear isn't in inventory.
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

// Ensures `tool_name` ("rod"/"pickaxe") is in inventory: checks inventory, then bank,
// then crafts via Auto_Craft.js's craft_item(). Does NOT equip it. Called before
// traveling to the spot so an unobtainable tool doesn't waste a trip.
async function ensure_tool_available(tool_name) {
	function find_in_inventory() {
		return character.items.findIndex(item => item && item.name === tool_name);
	}

	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;
	if (find_in_inventory() !== -1) return true;

	log(`🔎 No ${tool_name} in inventory, checking bank...`);
	await smarter_move(BANK_LOCATION);
	await delay(500);
	// Awaited: runs once per gathering start, and the tool must be confirmed in inventory
	// before the caller trusts the return value.
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

// Equips `tool_name` in mainhand — call only once standing at the spot; the rod/pickaxe
// is worn only immediately before the skill, CONFIG.default_gear otherwise. Assumes
// ensure_tool_available() already confirmed it's in inventory. Two-handed, so the
// offhand must be empty first.
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

// Shared by fishing/mining — gathers the tool, travels to the spot, equips it, channels
// the skill until cooldown/space/position/death stops it, then sells and banks. Checks
// character.rip every iteration so death preempts gathering immediately.
async function handle_gathering_state(tool_name, skill_name, spot, tolerance, task_label) {
	if (merchant_task !== "Idle") return;
	merchant_task = task_label;
	try {
		// Check availability before traveling — no point walking to the spot for a tool
		// we can't get.
		const tool_available = await ensure_tool_available(tool_name);
		if (!tool_available) {
			log(`❌ No ${tool_name} available (not in inventory, bank, or craftable).`);
			return;
		}

		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
			// Explicit radius: smarter_move()'s default arrival radius (10) is looser than
			// tolerance (5 for fishing) -- without this it could "arrive" outside tolerance
			// and the loop's own check below would abort before ever casting.
			await smarter_move(spot, null, { radius: tolerance });
		}

		const tool_equipped = await equip_tool(tool_name);
		if (!tool_equipped) {
			log(`❌ Could not equip ${tool_name} at the ${skill_name} spot.`);
			return;
		}

		// character.c[skill_name] tracks whether a single cast attempt is in progress;
		// is_on_cooldown(skill_name) only goes true once an attempt actually succeeds
		// (caught something) -- see the two waits below the use_skill() call.
		while (true) {
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
				if (e?.reason === "cooldown") {
					// Not a real failure -- retry shortly instead of aborting the session.
					await delay(2000);
					continue;
				}
				catcher(e, `handle_gathering_state(${skill_name}): use_skill`);
				break;
			}

			// character.c[skill_name] tracks whether THIS attempt (cast) is still in
			// progress -- wait for it to clear before checking anything else, whether or
			// not this particular attempt succeeded.
			await delay(200);
			let channel_wait_ms = 0;
			while (!character.rip && character.c && character.c[skill_name]) {
				await delay(200);
				channel_wait_ms += 200;
				if (channel_wait_ms >= 15000) {
					log(`⚠️ ${skill_name}: still channeling after ${channel_wait_ms / 1000}s per character.c — giving up waiting.`, "#FFA500");
					break;
				}
			}

			// is_on_cooldown() only goes true once an attempt actually succeeds (caught
			// something) -- if it's still false, nothing was caught, loop straight back
			// and recast immediately with no cooldown to wait out. If it's true, wait for
			// the real cooldown to clear before the next attempt.
			let cooldown_wait_ms = 0;
			while (!character.rip && is_on_cooldown(skill_name)) {
				await delay(200);
				cooldown_wait_ms += 200;
				if (cooldown_wait_ms >= 20000) {
					log(`⚠️ ${skill_name}: still on cooldown after ${cooldown_wait_ms / 1000}s — giving up waiting.`, "#FFA500");
					break;
				}
			}
		}

		// Re-equip resting gear BEFORE selling/banking, not after -- otherwise bank_items()
		// could sweep the unequipped resting gear into the bank first, leaving the
		// character stuck wielding the pickaxe/rod permanently.
		try {
			await equip_default_gear();
		} catch (e) {
			catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
		}

		// sell_items()/bank_items() directly, not sell_and_bank() -- this cycle doesn't
		// need to specifically end at HOME; whatever loop_controller() picks next travels
		// on from wherever this leaves off.
		log(`🏁 ${skill_name} loop ended, selling/banking...`, "#888");
		await sell_items();
		await bank_items();
		log(`✅ Selling/banking finished for ${skill_name}.`, "#888");
	} catch (e) {
		catcher(e, `handle_gathering_state(${skill_name})`);
	} finally {
		// An exception thrown inside a finally block skips the rest of it -- keep the
		// merchant_task reset unconditional by guarding equip_default_gear() separately.
		try {
			await equip_default_gear();
		} catch (e) {
			catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
		}
		merchant_task = "Idle";
		log(`🔁 ${task_label} cycle finished, back to Idle.`, "#888");
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

// Safety net: if merchant_task ever gets stuck non-"Idle" (a deadlock in some handler),
// the whole state machine freezes, since every should_run_*() check requires "Idle".
// Tracked here rather than at each assignment site since merchant_task is set in
// several places (state handlers, Auto_Upgrade.js).
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

// Casts mluck on every nearby party member whose buff is due (is_mluck_due()), skipping
// anyone already fresh. Shared by mluck_buff_loop() and handle_delivering_state().
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

// Opportunistic buffing only — doesn't guarantee the 50-minute refresh by itself (only
// fires when someone's nearby); should_run_delivery() is the actual guarantee.
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

// Waits for movement already in progress elsewhere to settle before issuing a new
// smarter_move() -- previously abandoned the call outright, stranding the character
// wherever it happened to be moving. Shared by sell_items()/bank_items() below.
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

// Composes sell_items()/bank_items(), then always finishes with a trip home. Use only
// when the caller genuinely wants to end at HOME (handle_delivering_state(),
// auto_upgrade()); call sell_items()/bank_items() directly when the caller's next step
// travels elsewhere regardless (handle_gathering_state(), try_craft(),
// exchange_items()'s mid-loop cleanup), so this function's HOME trip isn't wasted.
async function sell_and_bank() {
	const sold = await sell_items();
	const banked = await bank_items();

	// Retry a few times rather than let one rejected smarter_move() strand the caller
	// (previously propagated uncaught, leaving the caller wherever it had been).
	const HOME_RETRY_ATTEMPTS = 3;
	for (let attempt = 1; attempt <= HOME_RETRY_ATTEMPTS; attempt++) {
		try {
			await smarter_move(HOME);
			break;
		} catch (e) {
			if (attempt === HOME_RETRY_ATTEMPTS) {
				catcher(e, `sell_and_bank: smarter_move(HOME) — giving up after ${HOME_RETRY_ATTEMPTS} attempts`);
			} else {
				await delay(1000);
			}
		}
	}
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

		// Explicit radius: see the matching comment in handle_gathering_state() -- default
		// arrival radius (10) is looser than EXCHANGE_POSITION_TOLERANCE (5).
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
				log(`📦 Inventory full. Selling/banking before continuing to exchange ${item_name}.`);
				// sell_items()/bank_items() directly, not sell_and_bank() -- its own HOME
				// trip would be redundant with the smarter_move() below, which needs the
				// tighter EXCHANGE_POSITION_TOLERANCE radius this loop requires.
				await sell_items();
				await bank_items();
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
