
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

function local_bool(key, fallback) {
	const raw = localStorage.getItem(key);
	return raw === null ? fallback : raw === "true";
}

// var, not const: this file runs through Bootstrapper.js's eval-based loader, where
// top-level const/let stay scoped to that eval and aren't visible to Game_Config.js's
// shared CONFIG-reading functions.
var CONFIG = {
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
		nearby_trigger_range: 200,
		action_range: 350,
	},
	delivery: {
		free_slots_threshold: 10,
		gold_threshold: 20000000,
	},
	upgrade_gold_threshold: 100000000,
	potions: {
		hp_threshold: 500,
		mp_threshold: 500,
	},
	crafting: {
		targets: [{ name: "basketofeggs", min: 25, max: 9999 }],
	},
	exchange: {
		targets: [
			{ name: "goldenegg",    min: 1 },
			{ name: "basketofeggs", min: 1 },
			{ name: "gem0",         min: 1 },
			{ name: "gem1",         min: 1 },
			{ name: "armorbox",     min: 1 },
			{ name: "weaponbox",    min: 1 },
			{ name: "candy1",    min: 1 },
		],
	},
	do_not_bank: [],
	min_bank_free_space: 10,
	default_gear: {
		mainhand: { name: "broom", level: 9 },
		offhand: { name: "wbookhs", level: 1 },
	},
	// Fishing/mining sit above crafting/exchanging: all four need free bank space, but
	// upgrading doesn't, so putting crafting/exchanging first starved fishing/mining out
	// of a turn whenever space was scarce.
	priorities: ["dead", "delivering", "upgrading", "fishing", "mining", "crafting", "exchanging"],
};

// var, not const: Auto_Upgrade.js/Auto_Craft.js are separate eval closures that reference
// HOME/BANK_LOCATION as bare globals.
var HOME = CONFIG.locations.HOME;
var BANK_LOCATION = CONFIG.locations.BANK_LOCATION;
const PARTY = CONFIG.party.members;

var merchant_task = "Idle"; // var so Auto_Upgrade.js can share this global

// Bumped whenever the watchdog force-resets a stuck task. A long-running handler captures
// this when it starts and bails if it changes -- otherwise the watchdog frees the task slot
// while the stuck handler keeps running, loop_controller starts a second one, and the two
// fight over movement while the watchdog re-fires every 5 minutes.
let merchant_task_generation = 0;

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE MACHINE
// --------------------------------------------------------------------------------------------------------------------------------- //

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

const DELIVERY_WAIT_MAX_ATTEMPTS = 40; // ~2 minutes at 3s/attempt
const FISHING_POSITION_TOLERANCE = 5;
const MINING_POSITION_TOLERANCE = 10;

// Reads each fighter's cached character.s.mluck.ms (remaining time) instead of tracking
// our own cast history -- accurate regardless of restarts or a missed cast.
const MLUCK_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

function is_mluck_due(status) {
	const remaining = status.conditions?.mluck?.ms;
	return remaining == null || remaining < MLUCK_REFRESH_THRESHOLD_MS;
}

function should_run_delivery() {
	if (merchant_task !== "Idle") return false;
	for (const name of PARTY) {
		const status = read_state_cache(name);
		if (!status) continue;
		if (is_mluck_due(status)) return true;
		if (status.free_slots <= CONFIG.delivery.free_slots_threshold) return true;
		if (status.gold >= CONFIG.delivery.gold_threshold) return true;
	}
	return false;
}

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

function has_enough_bank_space() {
	return bank_free_space() >= CONFIG.min_bank_free_space;
}

function should_run_upgrade() {
	// Unlike craft/exchange/fishing/mining, upgrading doesn't need free bank space up
	// front -- it consumes scrolls and (on compound) merges stacks into fewer items.
	return CONFIG.enabled.upgrading
		&& merchant_task === "Idle"
		&& character.gold >= CONFIG.upgrade_gold_threshold
		&& bank_has_upgradeable_items();
}

function should_run_craft() {
	return CONFIG.enabled.crafting
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& can_afford_any_craft();
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

async function handle_idle_state() {
	// Only travel if not already close, so this doesn't reissue smarter_move() every tick.
	if (character.map === HOME.map && Math.hypot(character.x - HOME.x, character.y - HOME.y) <= 10) return;
	try {
		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_idle_state: smarter_move(HOME)");
	}
}

async function handle_delivering_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Delivering";
	try {
		log("Beginning delivery run...");

		// Fighters jitter x/y constantly while orbiting their target; only re-target on a
		// meaningful move or map change. Threshold must exceed the largest orbit diameter
		// (2x circle_radius; Ranger's 75 is the largest), not just its radius.
		const RETARGET_THRESHOLD = 160;
		let last_target = null;

		let attempts = 0;
		while (!any_party_within_range() && attempts < DELIVERY_WAIT_MAX_ATTEMPTS) {
			for (const name of PARTY) {
				const status = read_state_cache(name);
				if (status && !status.rip) {
					const moved_enough = !last_target
						|| last_target.map !== status.map
						|| Math.hypot(status.x - last_target.x, status.y - last_target.y) > RETARGET_THRESHOLD;

					if (moved_enough) {
						log(`🎯 Delivery: heading to ${name} @ ${status.map} (${Math.round(status.x)}, ${Math.round(status.y)})`, "#888");

						// "interrupted" = this re-target replaced a still-in-flight move, not
						// a real failure.
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

		await buff_nearby_party();
		await sell_items();
		await bank_items();
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
		await auto_upgrade(); // manages merchant_task itself, ends back on "Idle"
	} catch (e) {
		catcher(e, "handle_upgrading_state");
		merchant_task = "Idle";
	}
}

async function handle_crafting_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Crafting";
	try {
		await try_craft();
	} catch (e) {
		catcher(e, "handle_crafting_state");
	} finally {
		merchant_task = "Idle";
	}
}

async function handle_exchanging_state() {
	if (merchant_task !== "Idle") return;
	await exchange_items(); // has its own exchange_items_running guard + finally reset
}

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

async function ensure_tool_available(tool_name) {
	function find_in_inventory() {
		return character.items.findIndex(item => item && item.name === tool_name);
	}

	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;
	if (find_in_inventory() !== -1) return true;

	log(`🔎 No ${tool_name} in inventory, checking bank...`);
	await smarter_move(BANK_LOCATION);
	await delay(500);
	await withdraw_item(tool_name);
	await delay(400);
	if (find_in_inventory() !== -1) return true;

	log(`🔨 No ${tool_name} in bank either, attempting to craft one...`);
	for (let attempt = 0; attempt < 8; attempt++) {
		const result = await craft_item(tool_name);
		if (result === "crafted") break;
		if (result !== "buying" && result !== "withdrawing") break;
		await delay(400);
	}

	if (find_in_inventory() === -1) {
		log(`❌ Could not obtain a ${tool_name} (not in inventory, bank, or craftable).`);
		return false;
	}
	return true;
}

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

// use_skill() can reject with "cooldown" while is_on_cooldown() still reads false; without a
// bound, the retry below spins forever, the task never ends, and the watchdog fires every
// 5 minutes while a second copy of the task starts alongside it.
const GATHERING_MAX_COOLDOWN_RETRIES = 15;

async function handle_gathering_state(tool_name, skill_name, spot, tolerance, task_label) {
	if (merchant_task !== "Idle") return;
	merchant_task = task_label;
	const my_generation = merchant_task_generation;
	let cooldown_retries = 0;
	try {
		const tool_available = await ensure_tool_available(tool_name);
		if (!tool_available) {
			log(`❌ No ${tool_name} available (not in inventory, bank, or craftable).`);
			return;
		}

		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > tolerance) {
			// Explicit radius: smarter_move()'s default (10) is looser than tolerance (5),
			// which would let it "arrive" outside tolerance and abort before ever casting.
			await smarter_move(spot, null, { radius: tolerance });
		}

		const tool_equipped = await equip_tool(tool_name);
		if (!tool_equipped) {
			log(`❌ Could not equip ${tool_name} at the ${skill_name} spot.`);
			return;
		}

		while (true) {
			if (my_generation !== merchant_task_generation) {
				log(`⚠️ ${task_label} was force-reset by the watchdog — abandoning this run.`, "#FFA500");
				return;
			}
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
			// is_on_cooldown() only goes true once an attempt succeeds (caught something) --
			// stop here and let should_run_fishing()/should_run_mining() (which gate on
			// !is_on_cooldown()) bring the merchant back once the real cooldown clears.
			// Waiting it out inline here instead proved unreliable.
			if (is_on_cooldown(skill_name)) {
				log(`✅ ${skill_name} succeeded — on cooldown now, moving on.`, "limegreen");
				break;
			}

			try {
				await use_skill(skill_name);
				cooldown_retries = 0;
			} catch (e) {
				if (e?.reason === "cooldown") {
					if (++cooldown_retries > GATHERING_MAX_COOLDOWN_RETRIES) {
						log(`⚠️ ${skill_name}: use_skill kept reporting cooldown while is_on_cooldown() read false — giving up this run.`, "#FFA500");
						break;
					}
					await delay(2000);
					continue;
				}
				catcher(e, `handle_gathering_state(${skill_name}): use_skill`);
				break;
			}

			// character.c[skill_name] reflects this one attempt resolving, regardless of
			// whether it succeeds -- wait for it before checking again.
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
		}

		// Re-equip resting gear BEFORE selling/banking -- otherwise bank_items() could
		// sweep the still-unequipped resting gear away, leaving the pickaxe/rod stuck on.
		try {
			await equip_default_gear();
		} catch (e) {
			catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
		}

		log(`🏁 ${skill_name} loop ended, selling/banking...`, "#888");
		await sell_items();
		await bank_items();
		log(`✅ Selling/banking finished for ${skill_name}.`, "#888");
	} catch (e) {
		catcher(e, `handle_gathering_state(${skill_name})`);
	} finally {
		// Only clean up if this run still owns the task slot. After a watchdog force-reset a
		// replacement task is already running, and re-equipping resting gear / clearing
		// merchant_task here would strip its tool and free a slot it legitimately holds.
		if (my_generation === merchant_task_generation) {
			// try/catch here too: an exception inside a finally block skips the rest of that
			// finally, so an unguarded equip_default_gear() failure would skip the
			// merchant_task reset and deadlock the state machine permanently.
			try {
				await equip_default_gear();
			} catch (e) {
				catcher(e, `handle_gathering_state(${skill_name}): equip_default_gear`);
			}
			merchant_task = "Idle";
			log(`🔁 ${task_label} cycle finished, back to Idle.`, "#888");
		}
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
			case MERCHANT_STATES.IDLE: await handle_idle_state(); break;
			default: break;
		}
	} catch (e) {
		catcher(e, "set_state: unhandled error");
	}
}

// If merchant_task ever gets stuck non-"Idle" (a deadlock in some handler), every
// should_run_*() check requires "Idle", freezing the whole state machine -- force it back
// after a long timeout so an undiscovered deadlock self-heals instead of hanging forever.
const MERCHANT_TASK_WATCHDOG_MS = 5 * 60 * 1000;
let watchdog_task = merchant_task;
let watchdog_since = Date.now();

// Sole owner of movement -- every other loop in this file is passive (no smarter_move calls).
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
				merchant_task_generation++; // tells the stuck handler to abandon its run
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

// Game-engine-invoked callbacks (same convention as on_cm) -- not dead code despite no
// visible call site.
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
	// No local bookkeeping -- the target's own cache reports the refreshed
	// character.s.mluck.ms within ~100ms, which is_mluck_due() reads directly.
}

async function buff_nearby_party() {
	let buffed_any = false;
	for (const name of PARTY) {
		const status = read_state_cache(name);
		if (!status || !is_mluck_due(status)) continue;
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
// OPPORTUNISTIC SIDE-DECISIONS (buy potions / collect loot / buff party)
// --------------------------------------------------------------------------------------------------------------------------------- //

// None of these travel on their own -- each only acts if the merchant already happens to
// be near the relevant spot/party. Don't compete in CONFIG.priorities since they cost
// nothing to check and never block on travel.

function should_buy_potions() {
	const shop = CONFIG.locations.POTION_SHOP;
	return character.map === shop.map && Math.hypot(character.x - shop.x, character.y - shop.y) < 300;
}

async function handle_buy_potions() {
	const MAX_POTS = 1000;
	const MIN_BUY = 100;
	try {
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
	} catch (e) {
		catcher(e, "handle_buy_potions");
	}
}

const LOOT_COLLECTION_COOLDOWN = 60000;
let last_loot_time = 0;

function should_collect_loot() {
	return Date.now() - last_loot_time >= LOOT_COLLECTION_COOLDOWN && any_party_within_range();
}

async function handle_collect_loot() {
	try {
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
	} catch (e) {
		catcher(e, "handle_collect_loot");
	}
}

function should_buff_party() {
	return any_party_within_range();
}

async function handle_buff_party() {
	try {
		await buff_nearby_party();
	} catch (e) {
		catcher(e, "handle_buff_party");
	}
}

async function decide_opportunistic_actions() {
	if (should_buy_potions()) await handle_buy_potions();
	if (should_collect_loot()) await handle_collect_loot();
	if (should_buff_party()) await handle_buff_party();
}

// Runs concurrently with loop_controller(), not nested inside it -- set_state() blocks
// for however long the current task takes (a delivery or fishing run can last minutes),
// so a per-tick check there would stop checking these for that whole duration.
async function opportunistic_actions_loop() {
	while (true) {
		try {
			await decide_opportunistic_actions();
		} catch (e) {
			catcher(e, "opportunistic_actions_loop");
		}
		await delay(1000);
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

let exchange_items_running = false;
const EXCHANGE_POSITION_TOLERANCE = 5;

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

		// Explicit radius: smarter_move()'s default (10) is looser than EXCHANGE_POSITION_TOLERANCE (5).
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
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "exchange_items");
	} finally {
		exchange_items_running = false;
		merchant_task = "Idle";
	}
}
