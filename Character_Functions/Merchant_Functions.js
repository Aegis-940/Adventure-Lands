
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

function local_bool(key, fallback) {
	const raw = localStorage.getItem(key);
	return raw === null ? fallback : raw === "true";
}

var CONFIG = {
	enabled: {
		upgrading:  local_bool("AL_merchant_enabled_upgrading", true),
		crafting:   local_bool("AL_merchant_enabled_crafting", true),
		exchanging: local_bool("AL_merchant_enabled_exchanging", false),
		fishing:    local_bool("AL_merchant_enabled_fishing", false),
		mining:     false,
	},

	trading: {
		enabled: true,
		own_flavour: "slice_citrus",
		price: 100000,
		quantity: 1000,
		target_each: 1000,
	},
	sell_profile: [
		{ name: "firebow", level: 9, price: 1000000000, quantity: 3 },
		{ name: "firebow", level: 8, price: 100000000, quantity: 5 },
		{ name: "strring", level: 4, price: 1000000000, quantity: 1 },
		{ name: "ukey", level: 0, price: 20000000000, quantity: 1 },
	],
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
			{ name: "seashell",         min: 1 },
			{ name: "brownenvelope",    min: 1 },
			{ name: "goldenegg",    	min: 1 },
			{ name: "basketofeggs", 	min: 1 },
			{ name: "gem0",         	min: 1 },
			{ name: "gem1",         	min: 1 },
			{ name: "armorbox",     	min: 1 },
			{ name: "weaponbox",    	min: 1 },
			{ name: "candy1",   	 	min: 1 },
		],
	},
	do_not_bank: ["hpot1", "mpot1"],
	min_bank_free_space: 10,
	min_free_inventory_slots: 3,
	default_gear: {
		mainhand: { name: "broom", level: 9 },
		offhand: { name: "wbookhs", level: 1 },
	},
	priorities: ["dead", "anniversary", "delivering", "banking", "upgrading", "fishing", "mining", "crafting", "exchanging", "restocking"],
};

var HOME = CONFIG.locations.HOME;
var BANK_LOCATION = CONFIG.locations.BANK_LOCATION;
const PARTY = CONFIG.party.members;

var merchant_task = "Idle";

let merchant_task_generation = 0;

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE MACHINE
// --------------------------------------------------------------------------------------------------------------------------------- //

const MERCHANT_STATES = {
	DEAD: "dead",
	ANNIVERSARY: "anniversary",
	RESTOCKING: "restocking",
	DELIVERING: "delivering",
	BANKING: "banking",
	UPGRADING: "upgrading",
	CRAFTING: "crafting",
	EXCHANGING: "exchanging",
	FISHING: "fishing",
	MINING: "mining",
	IDLE: "idle",
};

const DELIVERY_WAIT_MAX_ATTEMPTS = 40;
const FISHING_POSITION_TOLERANCE = 5;
const MINING_POSITION_TOLERANCE = 10;

const MLUCK_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

const MLUCK_TOPUP_THRESHOLD_MS = 50 * 60 * 1000;

function is_mluck_due(status) {
	const remaining = status.conditions?.mluck?.ms;
	return remaining == null || remaining < MLUCK_REFRESH_THRESHOLD_MS;
}

function mluck_worth_topping_up(status) {
	const remaining = status.conditions?.mluck?.ms;
	return remaining == null || remaining < MLUCK_TOPUP_THRESHOLD_MS;
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

function free_inventory_slots() {
	return character.items.filter(it => !it).length;
}

const BANKING_RETRY_MS = 60000;
let _bank_retry_at = 0;

function should_run_banking() {
	return merchant_task === "Idle"
		&& Date.now() >= _bank_retry_at
		&& free_inventory_slots() <= CONFIG.min_free_inventory_slots
		&& has_bankable_items();
}

function should_run_upgrade() {
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
	anniversary: { state: MERCHANT_STATES.ANNIVERSARY, should_run: () => typeof anniversary_should_travel === "function" && anniversary_should_travel() },
	delivering:  { state: MERCHANT_STATES.DELIVERING, should_run: should_run_delivery },
	banking:     { state: MERCHANT_STATES.BANKING,    should_run: should_run_banking },
	upgrading:   { state: MERCHANT_STATES.UPGRADING,  should_run: should_run_upgrade },
	crafting:    { state: MERCHANT_STATES.CRAFTING,   should_run: should_run_craft },
	exchanging:  { state: MERCHANT_STATES.EXCHANGING, should_run: should_run_exchange },
	fishing:     { state: MERCHANT_STATES.FISHING,    should_run: should_run_fishing },
	mining:      { state: MERCHANT_STATES.MINING,     should_run: should_run_mining },
	restocking:  { state: MERCHANT_STATES.RESTOCKING, should_run: should_run_restock },
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

async function handle_anniversary_state() {
	merchant_task = "Anniversary";
	try {
		await anniversary_tick();
		const goal = anniversary_destination();
		if (!travel_arbiter(goal)) local_step(goal);
	} catch (e) {
		catcher(e, "handle_anniversary_state");
	} finally {
		merchant_task = "Idle";
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT STAND — open while idle, closed whenever we need to move.
// --------------------------------------------------------------------------------------------------------------------------------- //

const SLICE_FLAVOURS = ["slice_strawberry", "slice_citrus", "slice_honey",
	"slice_mint", "slice_blueberry", "slice_nightberry"];
const TRADE_SLOTS = 16;
const WISHLIST_REFRESH_MS = 15000;

let _last_wishlist_refresh = 0;

function stand_is_open() {
	return !!character.stand;
}

async function open_merchant_stand() {
	if (stand_is_open()) return;
	try {
		await open_stand();
	} catch (e) {
		catcher(e, "open_merchant_stand");
	}
}

async function close_merchant_stand() {
	if (!stand_is_open()) return;
	try {
		await close_stand();
	} catch (e) {
		catcher(e, "close_merchant_stand");
	}
}

function slice_count(name) {
	let q = 0;
	for (const item of character.items) {
		if (item && item.name === name) q += item.q || 1;
	}
	return q;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STAND STOCK — items listed for sale from CONFIG.sell_profile
// --------------------------------------------------------------------------------------------------------------------------------- //

function level_matches(item, entry) {
	return entry.level === undefined || (item.level || 0) === entry.level;
}

function is_stand_stock(item) {
	if (!CONFIG.trading.enabled || !item) return false;
	return CONFIG.sell_profile.some(entry => entry.name === item.name && level_matches(item, entry));
}

function is_default_gear(item) {
	if (!item) return false;
	for (const slot in CONFIG.default_gear) {
		const g = CONFIG.default_gear[slot];
		if (g && g.name === item.name) return true;
	}
	return false;
}

function stock_bag_reserve(entry) {
	return Math.max(0, (entry.quantity || 1) - stock_listed_count(entry));
}

function make_stand_stock_keeper() {
	if (!CONFIG.trading.enabled) return () => false;
	const budget = CONFIG.sell_profile.map(stock_bag_reserve);
	return item => {
		if (!item) return false;
		const ei = CONFIG.sell_profile.findIndex(e => e.name === item.name && level_matches(item, e));
		if (ei < 0 || budget[ei] <= 0) return false;
		budget[ei] -= (item.q || 1);
		return true;
	};
}

function stock_inventory_index(entry) {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && item.name === entry.name && level_matches(item, entry)) return i;
	}
	return -1;
}

function stock_inventory_count(entry) {
	let q = 0;
	for (const item of character.items) {
		if (item && item.name === entry.name && level_matches(item, entry)) q += item.q || 1;
	}
	return q;
}

function stock_listed_count(entry) {
	let q = 0;
	for (let sn = 1; sn <= TRADE_SLOTS; sn++) {
		const slot = character.slots["trade" + sn];
		if (!slot || slot.b) continue;
		if (slot.name === entry.name && level_matches(slot, entry)) {
			q += (slot.q === undefined ? 1 : slot.q);
		}
	}
	return q;
}

function stock_held_count(entry) {
	return stock_inventory_count(entry) + stock_listed_count(entry);
}

function stock_bank_count(entry) {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return 0;
	let q = 0;
	for (const pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		for (const item of bank_data[pack]) {
			if (item && item.name === entry.name && level_matches(item, entry)) q += item.q || 1;
		}
	}
	return q;
}

function sell_slot_for(index) {
	return TRADE_SLOTS - index;
}

let _last_sell_refresh = 0;

async function refresh_sell_offers() {
	if (!CONFIG.trading.enabled || !stand_is_open()) return;
	if (Date.now() - _last_sell_refresh < WISHLIST_REFRESH_MS) return;
	_last_sell_refresh = Date.now();

	const buy_slots = missing_slice_flavours().length;

	const listed = CONFIG.sell_profile.map(() => 0);
	for (let sn = 1; sn <= TRADE_SLOTS; sn++) {
		const slot = character.slots["trade" + sn];
		if (!slot || slot.b) continue;
		const ei = CONFIG.sell_profile.findIndex(e =>
			e.name === slot.name && level_matches(slot, e) && slot.price === e.price);
		if (ei >= 0) listed[ei] += (slot.q === undefined ? 1 : slot.q);
	}

	const free = [];
	for (let i = 0; i < TRADE_SLOTS; i++) {
		const sn = sell_slot_for(i);
		if (sn <= buy_slots) break;
		if (!character.slots["trade" + sn]) free.push(sn);
	}

	for (let ei = 0; ei < CONFIG.sell_profile.length; ei++) {
		const entry = CONFIG.sell_profile[ei];
		const label = entry.name + (entry.level === undefined ? "" : " +" + entry.level);
		let short = (entry.quantity || 1) - listed[ei];

		while (short > 0 && free.length) {
			const num = stock_inventory_index(entry);
			if (num < 0) break;

			const take = Math.min(short, character.items[num].q || 1);
			const slot_no = free.shift();
			try {
				await trade(num, slot_no, entry.price, take);
				game_log(`🏷️ WTS ${label} x${take} @ ${entry.price}g (slot ${slot_no})`, "#F0B742");
			} catch (e) {
				catcher(e, "refresh_sell_offers: " + label);
				break;
			}
			short -= take;
		}
	}
}

const RESTOCK_RETRY_MS = 10 * 60 * 1000;
const _restock_blocked = {};

function restock_key(entry) {
	return entry.name + "@" + (entry.level === undefined ? "any" : entry.level);
}

function restock_blocked(entry) {
	return Date.now() < (_restock_blocked[restock_key(entry)] || 0);
}

function should_run_restock() {
	if (!CONFIG.trading.enabled) return false;
	if (merchant_task !== "Idle") return false;
	if (free_inventory_slots() <= CONFIG.min_free_inventory_slots) return false;
	for (const entry of CONFIG.sell_profile) {
		if (restock_blocked(entry)) continue;
		if (stock_held_count(entry) >= (entry.quantity || 1)) continue;
		if (stock_bank_count(entry) > 0) return true;
	}
	return false;
}

async function handle_restocking_state() {
	merchant_task = "Restocking";
	try {
		for (const entry of CONFIG.sell_profile) {
			const want = entry.quantity || 1;
			const held = stock_held_count(entry);
			if (held >= want) continue;
			if (restock_blocked(entry)) continue;
			const in_bag = stock_inventory_count(entry);

			const in_bank = stock_bank_count(entry);
			if (in_bank <= 0) continue;

			try {
				await withdraw_item(entry.name, entry.level === undefined ? null : entry.level,
					Math.min(want - held, in_bank));
			} catch (e) {
				catcher(e, "handle_restocking_state: " + restock_key(entry));
			}

			if (stock_inventory_count(entry) <= in_bag) {
				_restock_blocked[restock_key(entry)] = Date.now() + RESTOCK_RETRY_MS;
				game_log(`⚠️ Restock: ${restock_key(entry)} is not in the bank as listed — `
					+ `pausing that entry for ${RESTOCK_RETRY_MS / 60000} min`, "#FFA500");
			}
		}
	} catch (e) {
		catcher(e, "handle_restocking_state");
	} finally {
		merchant_task = "Idle";
	}
}

function missing_slice_flavours() {
	return SLICE_FLAVOURS.filter(name =>
		name !== CONFIG.trading.own_flavour && slice_count(name) < CONFIG.trading.target_each);
}

async function refresh_slice_buy_orders() {
	if (!CONFIG.trading.enabled || !stand_is_open()) return;
	if (Date.now() - _last_wishlist_refresh < WISHLIST_REFRESH_MS) return;
	_last_wishlist_refresh = Date.now();

	const want = missing_slice_flavours();
	for (let i = 0; i < want.length && i < TRADE_SLOTS; i++) {
		const slot = character.slots["trade" + (i + 1)];
		if (slot && slot.b && slot.name === want[i] && (slot.q || 0) > 0) continue;
		try {
			await wishlist(i + 1, want[i], CONFIG.trading.price, 0, CONFIG.trading.quantity);
			game_log(`🎂 WTB ${want[i]} x${CONFIG.trading.quantity} @ ${CONFIG.trading.price}g`, "#F0B742");
		} catch (e) {
			catcher(e, "refresh_slice_buy_orders");
		}
	}
}

async function handle_idle_state() {
	if (character.map === HOME.map && Math.hypot(character.x - HOME.x, character.y - HOME.y) <= 10) {
		await open_merchant_stand();
		await refresh_slice_buy_orders();
		await refresh_sell_offers();
		return;
	}
	await close_merchant_stand();
	try {
		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_idle_state: smarter_move(HOME)");
	}
}

async function handle_banking_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Banking";
	try {
		log(`🎒 Down to ${free_inventory_slots()} free slots — emptying the pack.`, "#888");
		await sell_items();
		const banked = await bank_items();
		if (!banked) _bank_retry_at = Date.now() + BANKING_RETRY_MS;
	} catch (e) {
		catcher(e, "handle_banking_state");
	} finally {
		merchant_task = "Idle";
	}
}

async function handle_delivering_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Delivering";
	try {
		log("Beginning delivery run...");

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
		await auto_upgrade();
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
	await exchange_items();
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
		if (my_generation === merchant_task_generation) {
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
		if (state !== MERCHANT_STATES.IDLE && state !== MERCHANT_STATES.EXCHANGING && stand_is_open()) {
			await close_merchant_stand();
		}

		switch (state) {
			case MERCHANT_STATES.DEAD:       await handle_dead_state(); break;
			case MERCHANT_STATES.ANNIVERSARY: await handle_anniversary_state(); break;
			case MERCHANT_STATES.DELIVERING: await handle_delivering_state(); break;
			case MERCHANT_STATES.BANKING:    await handle_banking_state(); break;
			case MERCHANT_STATES.UPGRADING:  await handle_upgrading_state(); break;
			case MERCHANT_STATES.CRAFTING:   await handle_crafting_state(); break;
			case MERCHANT_STATES.EXCHANGING: await handle_exchanging_state(); break;
			case MERCHANT_STATES.FISHING:    await handle_fishing_state(); break;
			case MERCHANT_STATES.MINING:     await handle_mining_state(); break;
			case MERCHANT_STATES.RESTOCKING: await handle_restocking_state(); break;
			case MERCHANT_STATES.IDLE: await handle_idle_state(); break;
			default: break;
		}
	} catch (e) {
		catcher(e, "set_state: unhandled error");
	}
}

const MERCHANT_TASK_WATCHDOG_MS = 5 * 60 * 1000;
let watchdog_task = merchant_task;
let watchdog_since = Date.now();

async function loop_controller() {
	while (true) {
		try {
			party_manager();

			if (!automation_enabled()) {
				if (stand_is_open()) await close_merchant_stand();
				merchant_task = "Idle";
				watchdog_task = "Idle";
				watchdog_since = Date.now();
				await delay(250);
				continue;
			}

			if (merchant_task !== watchdog_task) {
				watchdog_task = merchant_task;
				watchdog_since = Date.now();
			} else if (merchant_task !== "Idle" && Date.now() - watchdog_since > MERCHANT_TASK_WATCHDOG_MS) {
				game_log(`⚠️ Merchant stuck on "${merchant_task}" for over ${MERCHANT_TASK_WATCHDOG_MS / 60000} minutes — forcing back to Idle.`, "#FF3333");
				merchant_task = "Idle";
				merchant_task_generation++;
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
}

async function buff_nearby_party() {
	let buffed_any = false;
	for (const name of PARTY) {
		const status = read_state_cache(name);
		if (!status || !mluck_worth_topping_up(status)) continue;
		try {
			const mluck_range = (G.skills.mluck && G.skills.mluck.range) || 320;
			const player = get_player(name);
			if (
				!player || player.rip || character.map !== player.map ||
				Math.hypot(character.x - player.x, character.y - player.y) > mluck_range
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
	if (free_inventory_slots() <= CONFIG.min_free_inventory_slots) return false;
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


function has_sellable_items() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || !SELLABLE_ITEMS.includes(item.name)) continue;
		if (is_stand_stock(item) || is_default_gear(item)) continue;
		return true;
	}
	return false;
}

function has_bankable_items() {
	const keep_for_stand = make_stand_stock_keeper();
	for (let i = 3; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || CONFIG.do_not_bank.includes(item.name)) continue;
		if (keep_for_stand(item)) continue;
		return true;
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
			if (!SELLABLE_ITEMS.includes(item.name)) continue;
			if (is_stand_stock(item)) continue;
			if (is_default_gear(item)) continue;
			try {
				sell(i, item.q || 1);
				game_log(`💰 Sold ${item.name} x${item.q || 1}`);
				sold_any = true;
			} catch (e) {
				catcher(e, "sell_items: sell " + item.name);
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

		const keep_for_stand = make_stand_stock_keeper();

		for (let i = 3; i < character.items.length; i++) {
			const item = character.items[i];
			if (!item || CONFIG.do_not_bank.includes(item.name)) continue;
			if (keep_for_stand(item)) continue;
			try {
				await bank_store(i);
				refresh_bank_snapshot();
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
			await close_merchant_stand();
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
				log("No valid items to exchange after bank withdrawal.", "#888");
				return;
			}
		}

		const item_config = CONFIG.exchange.targets.find(cfg => cfg.name === item_name);
		const min_count = item_config?.min ?? 1;

		log(`🔁 Starting exchange for ${item_name}.`);

		let keep_going = true;
		while (keep_going) {
			for (let i = 0; i < character.items.length; i++) {
				const itm = character.items[i];
				if (!itm || !SELLABLE_ITEMS.includes(itm.name)) continue;
				if (is_stand_stock(itm) || is_default_gear(itm)) continue;
				sell(i, itm.q || 1);
				log(`💰 Sold ${itm.name} x${itm.q || 1}`);
			}

			if (free_inventory_slots() === 0) {
				log(`📦 Inventory full. Selling/banking before continuing to exchange ${item_name}.`);
				await close_merchant_stand();
				await sell_items();
				await bank_items();
				await delay(200);
				if (free_inventory_slots() === 0) {
					log("📦 Still full after selling and banking — stopping the exchange.", "#FFA500");
					break;
				}
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
		await close_merchant_stand();
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "exchange_items");
	} finally {
		exchange_items_running = false;
		merchant_task = "Idle";
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT ENTRY POINT — windows and every loop this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

performance_trick();

add_bank_buttons();

equip_default_gear();

opportunistic_actions_loop();
potion_loop();
state_cache_loop();

loop_controller();
