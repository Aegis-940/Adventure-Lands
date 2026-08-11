
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
		upgrading: false,
		crafting: false,
		exchanging: false,
		fishing: false,
		mining: false,
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
	cycles: {
		delivery_interval: 30 * 60 * 1000, // how often to run a potions/loot/bank support pass
		upgrade_interval: 1 * 60 * 1000,
		craft_interval: 5 * 60 * 1000,
		exchange_interval: 10 * 60 * 1000,
		fishing_interval: 2 * 60 * 1000,
		mining_interval: 2 * 60 * 1000,
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
	do_not_bank: ["scroll0", "scroll1", "scroll2", "cscroll0", "cscroll1", "cscroll2", "offeringp"],
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

const MERCHANT_STATES = {
	DEAD: "dead",
	PANIC: "panic",
	DELIVERING: "delivering",
	UPGRADING: "upgrading",
	CRAFTING: "crafting",
	EXCHANGING: "exchanging",
	FISHING: "fishing",
	MINING: "mining",
	IDLE: "idle",
};

const PANIC_HP_PCT = 0.3;
const DELIVERY_WAIT_MAX_ATTEMPTS = 40; // ~2 minutes at 3s/attempt before giving up and heading home anyway
const FISHING_POSITION_TOLERANCE = 5;
const MINING_POSITION_TOLERANCE = 10;
const FISHING_TIME = 9000;
const MINING_TIME = 4000;

let last_delivery_time = 0;
let last_upgrade_time = 0;
let last_craft_time = 0;
let last_exchange_time = 0;
let last_fishing_time = 0;
let last_mining_time = 0;

function should_run_delivery() {
	return merchant_task === "Idle" && (Date.now() - last_delivery_time) > CONFIG.cycles.delivery_interval;
}

function should_run_upgrade() {
	return CONFIG.enabled.upgrading
		&& merchant_task === "Idle"
		&& character.gold >= CONFIG.upgrade_gold_threshold
		&& (Date.now() - last_upgrade_time) > CONFIG.cycles.upgrade_interval;
}

function should_run_craft() {
	return CONFIG.enabled.crafting
		&& merchant_task === "Idle"
		&& (Date.now() - last_craft_time) > CONFIG.cycles.craft_interval;
}

function should_run_exchange() {
	return CONFIG.enabled.exchanging
		&& merchant_task === "Idle"
		&& (Date.now() - last_exchange_time) > CONFIG.cycles.exchange_interval;
}

function should_run_fishing() {
	return CONFIG.enabled.fishing
		&& merchant_task === "Idle"
		&& (Date.now() - last_fishing_time) > CONFIG.cycles.fishing_interval;
}

function should_run_mining() {
	return CONFIG.enabled.mining
		&& merchant_task === "Idle"
		&& (Date.now() - last_mining_time) > CONFIG.cycles.mining_interval;
}

// The merchant doesn't fight — "danger" just means something is actually hitting it.
function is_in_danger() {
	if (character.hp < character.max_hp * PANIC_HP_PCT) return true;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e && e.type === "monster" && !e.dead && e.target === character.name) return true;
	}
	return false;
}

function get_character_state() {
	if (character.rip) return MERCHANT_STATES.DEAD;
	if (is_in_danger()) return MERCHANT_STATES.PANIC;
	if (should_run_delivery()) return MERCHANT_STATES.DELIVERING;
	if (should_run_upgrade()) return MERCHANT_STATES.UPGRADING;
	if (should_run_craft()) return MERCHANT_STATES.CRAFTING;
	if (should_run_exchange()) return MERCHANT_STATES.EXCHANGING;
	if (should_run_fishing()) return MERCHANT_STATES.FISHING;
	if (should_run_mining()) return MERCHANT_STATES.MINING;
	return MERCHANT_STATES.IDLE;
}

async function handle_dead_state() {
	try {
		if (character.rip) await respawn();
	} catch (e) {
		catcher(e, "handle_dead_state");
	}
}

async function handle_panic_state() {
	try {
		if (character.moving || smart.moving) return;
		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_panic_state");
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

		await smarter_move(HOME);
		await delay(1000);
		await sell_and_bank();

		last_delivery_time = Date.now();
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
	} finally {
		last_upgrade_time = Date.now();
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
		last_craft_time = Date.now();
		merchant_task = "Idle";
	}
}

async function handle_exchanging_state() {
	if (merchant_task !== "Idle") return;
	try {
		await exchange_items(); // has its own exchange_items_running guard + finally reset to "Idle"
	} finally {
		last_exchange_time = Date.now();
	}
}

async function handle_fishing_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Fishing";
	try {
		let rod_equipped = character.slots.mainhand && character.slots.mainhand.name === "rod";
		if (!rod_equipped) {
			const rod_index = character.items.findIndex(item => item && item.name === "rod");
			if (rod_index !== -1) {
				await equip(rod_index, "mainhand");
				await delay(400);
				rod_equipped = character.slots.mainhand && character.slots.mainhand.name === "rod";
			}
		}
		if (!rod_equipped) {
			log("❌ No fishing rod equipped or in inventory.");
			return;
		}

		const spot = CONFIG.locations.FISHING_SPOT;
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
		last_fishing_time = Date.now();
		merchant_task = "Idle";
	}
}

async function handle_mining_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Mining";
	try {
		let pickaxe_equipped = character.slots.mainhand && character.slots.mainhand.name === "pickaxe";
		if (!pickaxe_equipped) {
			const pickaxe_index = character.items.findIndex(item => item && item.name === "pickaxe");
			if (pickaxe_index !== -1) {
				await equip(pickaxe_index, "mainhand");
				await delay(400);
				pickaxe_equipped = character.slots.mainhand && character.slots.mainhand.name === "pickaxe";
			}
		}
		if (!pickaxe_equipped) {
			log("❌ No pickaxe equipped or in inventory.");
			return;
		}

		const spot = CONFIG.locations.MINING_SPOT;
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
		last_mining_time = Date.now();
		merchant_task = "Idle";
	}
}

async function set_state(state) {
	try {
		switch (state) {
			case MERCHANT_STATES.DEAD:       await handle_dead_state(); break;
			case MERCHANT_STATES.PANIC:      await handle_panic_state(); break;
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

async function mluck_buff_loop() {
	const COOLDOWN = 60000;
	let last_buff_time = 0;
	while (true) {
		if (Date.now() - last_buff_time >= COOLDOWN && any_party_within_range()) {
			for (const name of PARTY) {
				try {
					const player = get_player(name);
					if (
						!player || player.rip || character.map !== player.map ||
						Math.hypot(character.x - player.x, character.y - player.y) > CONFIG.party.action_range
					) {
						continue;
					}
					change_target(player);
					await delay(100);
					use_skill("mluck", player);
					await delay(200);
				} catch (e) {
					catcher(e, "mluck_buff_loop: " + name);
				}
			}
			log("Cast MLuck.", "limegreen");
			last_buff_time = Date.now();
		}
		await delay(500);
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
					await delay(500);
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
