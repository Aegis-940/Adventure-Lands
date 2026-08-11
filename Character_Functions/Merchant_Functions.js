
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: this file only ever runs through Bootstrapper.js's eval-based
// loader, where top-level const/let are scoped to that one eval call and never
// become visible to Common_Functions.js's shared CONFIG-reading functions (here,
// potion_loop()'s CONFIG.potions.hp_threshold/mp_threshold).
var CONFIG = {
	// Master switches — flip any of these off to stop that state from ever being selected.
	enabled: {
		upgrading: true,
		crafting: false,
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
	// reported status (Shared/Common_Functions.js's status_cache_loop()), not a timer.
	delivery: {
		free_slots_threshold: 10, // deliver if any party member has this many or fewer free slots
		gold_threshold: 20000000, // deliver if any party member is carrying at least this much gold
		// MLuck lasts 3600s — refresh each party member at least this often. Satisfied
		// opportunistically by mluck_buff_loop() whenever near the party; if it's about
		// to lapse on its own, that alone triggers a delivery run (see should_run_delivery()).
		mluck_refresh_interval: 50 * 60 * 1000,
	},
	upgrade_gold_threshold: 100000000,
	// Read by Shared/Common_Functions.js's shared potion_loop() (self-use, HP/MP independent checks).
	potions: {
		hp_threshold: 500,
		mp_threshold: 500,
	},
	// Items to auto-craft — read directly by Merchant_Systems/Auto_Craft.js's try_craft().
	crafting: {
		targets: ["pouchbow"],
	},
	// Items to turn in at the exchange NPC, in priority order.
	exchange: {
		targets: [
			{ name: "basketofeggs", min: 1 },
			{ name: "gem0",         min: 1 },
			{ name: "gem1",         min: 1 },
			{ name: "armorbox",     min: 1 },
			{ name: "weaponbox",    min: 1 },
		],
	},
	// Items sell_and_bank() must never bank away, even mid-cycle.
	do_not_bank: [],
	// Resting gear — worn at all times except the brief window a rod/pickaxe is
	// equipped for fishing/mining (see ensure_tool_equipped()/equip_default_gear()).
	default_gear: {
		mainhand: { name: "broom", level: 9 },
		offhand: { name: "wbookhs", level: 1 },
	},
	// Checked top to bottom by get_character_state() (see PRIORITY_CHECKS) every time
	// the merchant is Idle. Reorder to change what the merchant prefers to do first.
	priorities: ["dead", "delivering", "upgrading", "crafting", "exchanging", "fishing", "mining"],
};

// Common_Functions.js's shared potion_loop()/auto_buy_potions() aren't used here — the
// merchant's potion needs (bulk buying to redistribute to the party) are handled by
// buy_potion_loop() below; Common_Functions.js's shared potion_loop() (self-use) is
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

// Priority order (checked top to bottom every time the merchant is Idle — see
// get_character_state()). Each state is purely contextual — "is there actually
// something to do right now" — not time-interval-based. Once a state starts, its
// handler runs to completion (loop_controller() awaits it) before the priority list
// is ever re-checked, so nothing here interrupts an in-progress action.
const MERCHANT_STATES = {
	DEAD: "dead",             // 0
	DELIVERING: "delivering", // 1
	UPGRADING: "upgrading",   // 2
	CRAFTING: "crafting",     // 3
	EXCHANGING: "exchanging", // 4
	FISHING: "fishing",       // 5
	MINING: "mining",         // 6
	IDLE: "idle",
};

const DELIVERY_WAIT_MAX_ATTEMPTS = 40; // ~2 minutes at 3s/attempt before giving up and heading home anyway
const FISHING_POSITION_TOLERANCE = 5;
const MINING_POSITION_TOLERANCE = 10;
const FISHING_TIME = 9000;
const MINING_TIME = 9000;
const PARTY_STATUS_STALE_MS = 30000; // ignore a party member's last-reported status once it's this old

// Last time each party member (by name) was mluck'd — see is_mluck_due()/
// buff_nearby_party(), shared by the passive mluck_buff_loop() and delivery runs.
let last_mluck_time = {};

function is_mluck_due(name) {
	return (Date.now() - (last_mluck_time[name] || 0)) > CONFIG.delivery.mluck_refresh_interval;
}

// party_status is Shared/Common_Functions.js's cache of each fighter's last-reported
// free_slots/gold, pushed by their own status_cache_loop(). Delivery is also due on
// its own once mluck is about to lapse on anyone — that run doubles as the buff pass
// (see handle_delivering_state()), so a stale buff alone is enough to trigger it.
function should_run_delivery() {
	if (merchant_task !== "Idle") return false;
	for (const name of PARTY) {
		if (is_mluck_due(name)) return true;
		const status = party_status[name];
		if (!status || (Date.now() - status.last_seen) > PARTY_STATUS_STALE_MS) continue;
		if (status.free_slots <= CONFIG.delivery.free_slots_threshold) return true;
		if (status.gold >= CONFIG.delivery.gold_threshold) return true;
	}
	return false;
}

function should_run_upgrade() {
	return CONFIG.enabled.upgrading
		&& merchant_task === "Idle"
		&& character.gold >= CONFIG.upgrade_gold_threshold
		&& bank_has_upgradeable_items(); // Merchant_Systems/Auto_Upgrade.js — is there anything in the bank worth upgrading/combining?
}

function should_run_craft() {
	return CONFIG.enabled.crafting
		&& merchant_task === "Idle"
		&& can_afford_any_craft(); // Merchant_Systems/Auto_Craft.js
}

function should_run_exchange() {
	return CONFIG.enabled.exchanging
		&& merchant_task === "Idle"
		&& has_exchangeable_items();
}

function should_run_fishing() {
	return CONFIG.enabled.fishing
		&& merchant_task === "Idle"
		&& !is_on_cooldown("fishing");
}

function should_run_mining() {
	return CONFIG.enabled.mining
		&& merchant_task === "Idle"
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
		move_to_character("Myras").catch(e => catcher(e, "handle_delivering_state: move_to_character"));

		let attempts = 0;
		while (!any_party_within_range() && attempts < DELIVERY_WAIT_MAX_ATTEMPTS) {
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

// Ensures `tool_name` ("rod"/"pickaxe") is equipped in mainhand — checks inventory,
// then the bank, then falls back to crafting one via Merchant_Systems/Auto_Craft.js's
// craft_item(). Rod/pickaxe are two-handed, so the offhand must be empty before
// equipping — unequips it first if occupied. Returns true once equipped, false if the
// tool couldn't be obtained any way. Called only once already standing at the fishing/
// mining spot (see the handlers below), never in advance — the rod/pickaxe should only
// ever be worn immediately before the skill, with CONFIG.default_gear worn otherwise.
async function ensure_tool_equipped(tool_name) {
	function find_in_inventory() {
		return character.items.findIndex(item => item && item.name === tool_name);
	}

	if (character.slots.mainhand && character.slots.mainhand.name === tool_name) return true;

	let idx = find_in_inventory();

	if (idx === -1) {
		log(`🔎 No ${tool_name} in inventory, checking bank...`);
		await smarter_move(BANK_LOCATION);
		await delay(500);
		// Awaited (unlike the hot-path withdrawal loops elsewhere) — this only runs once
		// per fishing/mining start, and the tool must actually be in inventory before the
		// caller trusts the return value enough to start the skill.
		await withdraw_item(tool_name);
		await delay(400);
		idx = find_in_inventory();
	}

	if (idx === -1) {
		log(`🔨 No ${tool_name} in bank either, attempting to craft one...`);
		for (let attempt = 0; attempt < 8; attempt++) {
			const result = await craft_item(tool_name); // Merchant_Systems/Auto_Craft.js
			if (result === "crafted") break;
			if (result !== "buying" && result !== "withdrawing") break; // "missing"/"no_recipe" — no point retrying
			await delay(400);
		}
		idx = find_in_inventory();
	}

	if (idx === -1) {
		log(`❌ Could not obtain a ${tool_name} (not in inventory, bank, or craftable).`);
		return false;
	}

	// Two-handed tool — clear the offhand before equipping, or the equip can fail/be rejected.
	if (character.slots.offhand) {
		await unequip("offhand");
		await delay(400);
	}

	await equip(idx, "mainhand");
	await delay(400);
	return character.slots.mainhand && character.slots.mainhand.name === tool_name;
}

async function handle_fishing_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Fishing";
	try {
		// Travel to the spot BEFORE equipping the rod — ensure_tool_equipped() may need
		// to detour to the bank/crafting bench first, so this can re-check afterward.
		const spot = CONFIG.locations.FISHING_SPOT;
		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > FISHING_POSITION_TOLERANCE) {
			await smarter_move(spot);
		}

		const rod_equipped = await ensure_tool_equipped("rod");
		if (!rod_equipped) {
			log("❌ No fishing rod available (not in inventory, bank, or craftable).");
			return;
		}

		// ensure_tool_equipped() may have wandered off to fetch/craft the rod.
		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > FISHING_POSITION_TOLERANCE) {
			await smarter_move(spot);
		}

		while (!is_on_cooldown("fishing")) {
			if (!character.slots.mainhand || character.slots.mainhand.name !== "rod") {
				log("❌ Fishing rod not equipped, stopping fishing.");
				break;
			}
			if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > FISHING_POSITION_TOLERANCE) {
				log("❌ Not at fishing spot, stopping fishing.");
				break;
			}
			if (character.items.filter(Boolean).length >= character.items.length) {
				log("📦 Inventory full, stopping fishing.");
				break;
			}
			try {
				use_skill("fishing");
			} catch (e) {
				catcher(e, "handle_fishing_state: use_skill");
				break;
			}
			await delay(FISHING_TIME);
		}

		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_fishing_state");
	} finally {
		await equip_default_gear();
		merchant_task = "Idle";
	}
}

async function handle_mining_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Mining";
	try {
		// Travel to the spot BEFORE equipping the pickaxe — ensure_tool_equipped() may
		// need to detour to the bank/crafting bench first, so this can re-check afterward.
		const spot = CONFIG.locations.MINING_SPOT;
		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > MINING_POSITION_TOLERANCE) {
			await smarter_move(spot);
		}

		const pickaxe_equipped = await ensure_tool_equipped("pickaxe");
		if (!pickaxe_equipped) {
			log("❌ No pickaxe available (not in inventory, bank, or craftable).");
			return;
		}

		// ensure_tool_equipped() may have wandered off to fetch/craft the pickaxe.
		if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > MINING_POSITION_TOLERANCE) {
			await smarter_move(spot);
		}

		while (!is_on_cooldown("mining")) {
			if (!character.slots.mainhand || character.slots.mainhand.name !== "pickaxe") {
				log("❌ Pickaxe not equipped, stopping mining.");
				break;
			}
			if (character.map !== spot.map || Math.hypot(character.x - spot.x, character.y - spot.y) > MINING_POSITION_TOLERANCE) {
				log("❌ Not at mining spot, stopping mining.");
				break;
			}
			if (character.items.filter(Boolean).length >= character.items.length) {
				log("📦 Inventory full, stopping mining.");
				break;
			}
			try {
				use_skill("mining");
			} catch (e) {
				catcher(e, "handle_mining_state: use_skill");
				break;
			}
			await delay(MINING_TIME);
		}

		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_mining_state");
	} finally {
		await equip_default_gear();
		merchant_task = "Idle";
	}
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

// Sole owner of "where is the character going right now" — every other loop in this
// file is passive (no smarter_move calls), so there's only ever one active traveler.
async function loop_controller() {
	while (true) {
		try {
			party_manager();
			const state = get_character_state();
			await set_state(state);
		} catch (e) {
			catcher(e, "loop_controller");
		}
		await delay(250);
	}
}

// Game-engine-invoked callbacks (same convention as on_cm in Common_Functions.js) — not dead code.
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

// SELLABLE_ITEMS defined in Common_Functions.js
let sell_and_bank_running = false;

async function sell_and_bank() {
	if (sell_and_bank_running) {
		log("⚠️ sell_and_bank already running, skipping duplicate call.");
		return;
	}
	if (character.moving) return;

	sell_and_bank_running = true;
	try {
		// === SELLING ===
		await smarter_move(HOME);
		await delay(3000);

		for (let i = 0; i < character.items.length; i++) {
			const item = character.items[i];
			if (!item) continue;
			if (SELLABLE_ITEMS.includes(item.name)) {
				try {
					sell(i, item.q || 1);
					game_log(`💰 Sold ${item.name} x${item.q || 1}`);
				} catch (e) {
					catcher(e, "sell_and_bank: sell " + item.name);
				}
			}
		}

		// === BANKING ===
		await smarter_move(BANK_LOCATION);
		await delay(1000);

		for (let i = 3; i < character.items.length; i++) {
			const item = character.items[i];
			if (!item || CONFIG.do_not_bank.includes(item.name)) continue;
			try {
				await bank_store(i);
				game_log(`🏦 Deposited ${item.name} x${item.q || 1} to bank`);
			} catch (e) {
				catcher(e, "sell_and_bank: bank_store " + item.name);
			}
		}

		// === RETURN HOME ===
		await parent.$("#maincode")[0].contentWindow.render_bank_items();
		await delay(1000);
		await parent.hide_modal();
		await smarter_move(HOME);
		await delay(1000);
		game_log("🏠 Returned home after banking.");
	} catch (e) {
		catcher(e, "sell_and_bank");
	} finally {
		sell_and_bank_running = false;
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

		await smarter_move(HOME);
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
				await smarter_move(HOME);
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
