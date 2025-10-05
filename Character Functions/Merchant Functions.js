
// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT ACTIVITY QUEUE SYSTEM
// --------------------------------------------------------------------------------------------------------------------------------- //

let merchant_task = "Idle";
let merchant_busy = false;

let last_potion_delivery = 0;
const POTION_DELIVERY_DELAY = 10 * 60 * 1000;
let last_loot_collection = 0;
const LOOT_COLLECTION_DELAY = 10 * 60 * 1000;

async function merchant_task_loop() {
	while (true) {
		try {
			const now = Date.now();

			// Priority 1: Deliver Potions (every 10 min)
			if (!merchant_busy && (now - last_potion_delivery > POTION_DELIVERY_DELAY)) {
				merchant_busy = true;
				merchant_task = "Delivering Potions";
				await deliver_potions();
				last_potion_delivery = Date.now();
				merchant_busy = false;
				continue;
			}

			// Priority 2: Collect Loot (every 10 min)
			if (!merchant_busy && (now - last_loot_collection > LOOT_COLLECTION_DELAY)) {
				merchant_busy = true;
				merchant_task = "Collecting Loot";
				await collect_loot();
				last_loot_collection = Date.now();
				merchant_busy = false;
				continue;
			}

			// // Priority 3: Fishing (whenever not on cooldown)
			// if (!merchant_busy && !is_on_cooldown("fishing")) {
			// 	merchant_busy = true;
			// 	merchant_task = "Fishing";
			// 	await go_fish();
			// 	merchant_busy = false;
			// 	continue;
			// }

			// // Priority 4: Mining (whenever not on cooldown)
			// if (!merchant_busy && can_use("mining")) {
			// 	merchant_busy = true;
			// 	merchant_task = "Mining";
			// 	await go_mine();
			// 	merchant_busy = false;
			// 	continue;
			// }

			if (!merchant_busy) {
				merchant_busy = true;
				merchant_task = "Exchanging Items";
				await exchange_items();
				merchant_busy = false;
				continue;
			}

			// Default to Idle
			if (!merchant_busy) merchant_task = "Idle";

		} catch (e) {
			game_log("🔥 merchant_task_loop error:", e.message);
			merchant_busy = false;
			merchant_task = "Idle";
		}

		await delay(1000); // check periodically
	}
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// DELIVER POTIONS AS NEEDED
// --------------------------------------------------------------------------------------------------------------------------------- //

const POTION_CAP = 6000;
const MINIMUM_DELIVERED = 2000;
const PARTY = ["Ulric", "Myras", "Riva"];
const DELIVERY_RADIUS = 350;
const HOME = { map: "main", x: -89, y: -116 };

const potion_counts = {};

const recent_deliveries = {};
const DELIVERY_COOLDOWN = 3000; // ms

function halt_movement() {
	parent.socket.emit("move", { to: { x: character.x, y: character.y } });
}

async function request_location(name) {
	location_responses[name] = null;
	send_cm(name, { type: "where_are_you" });

	return await new Promise((resolve) => {
		let checks = 0;
		const checkInterval = setInterval(() => {
			checks++;
			if (location_responses[name]) {
				clearInterval(checkInterval);
				resolve(location_responses[name]);
			} else if (checks > 10) {
				clearInterval(checkInterval);
				game_log(`⚠️ No location received from ${name}`);
				resolve(null);
			}
		}, 300);
	});
}

async function request_potion_counts(name) {
	potion_counts[name] = null;
	send_cm(name, { type: "what_potions" });

	return await new Promise((resolve) => {
		let checks = 0;
		const checkInterval = setInterval(() => {
			checks++;
			if (potion_counts[name]) {
				clearInterval(checkInterval);
				resolve(potion_counts[name]);
			} else if (checks > 10) {
				clearInterval(checkInterval);
				game_log(`⚠️ No potion count received from ${name}`);
				resolve(null);
			}
		}, 300);
	});
}

add_cm_listener((name, data) => {
	try {
		if (data.type === "my_potions" && PARTY.includes(name)) {
			potion_counts[name] = {
				hpot1: data.hpot1 || 0,
				mpot1: data.mpot1 || 0
			};
		}
	} catch (e) {
		game_log("🔥 CM listener threw an error:", e.message);
	}
});

async function deliver_potions() {
	game_log("Starting Potions Delivery...");
	for (const name of PARTY) {
		if (
			recent_deliveries[name] &&
			Date.now() - recent_deliveries[name] < DELIVERY_COOLDOWN
		) {
			continue;
		}

		let target_pots = await request_potion_counts(name);
		if (!target_pots) continue;

		const hpot_missing = POTION_CAP - (target_pots.hpot1 || 0);
		const mpot_missing = POTION_CAP - (target_pots.mpot1 || 0);

		if (hpot_missing < MINIMUM_DELIVERED && mpot_missing < MINIMUM_DELIVERED) {
			continue;
		}

		let destination = await request_location(name);
		if (!destination) continue;

		let arrived = false;
		let delivered = false;

		smart_move(destination); // fire-and-forget

		while (!arrived && !delivered) {
			await delay(300);
			const target = get_player(name);
			if (target && distance(character, target) <= DELIVERY_RADIUS) {
				delivered = await try_deliver_to(name, hpot_missing, mpot_missing);
			}
			if (!smart.moving) {
				arrived = true;
				break;
			}
		}

		if (!delivered) {
			game_log(`🔁 Delivery failed en route. Rechecking position for ${name}...`);
			const new_dest = await request_location(name);
			if (new_dest) {
				await smart_move(new_dest);
				await delay(300);
				await try_deliver_to(name, hpot_missing, mpot_missing);
			}
		}

		await delay(500);
	}

	game_log("🏠 Returning to home base...");
	await smart_move(HOME);
}

async function try_deliver_to(name, hpot_needed, mpot_needed) {
	for (let attempts = 0; attempts <= 10; attempts++) {
		const target = get_player(name);

		if (!target || distance(character, target) > DELIVERY_RADIUS) {
			await delay(300);
			continue;
		}

		let hpot_remaining = hpot_needed;
		let mpot_remaining = mpot_needed;

		for (let i = 0; i < character.items.length && (hpot_remaining > 0 || mpot_remaining > 0); i++) {
			const item = character.items[i];
			if (!item) continue;

			if (item.name === "hpot1" && hpot_remaining > 0) {
				const send_qty = Math.min(item.q || 1, hpot_remaining);
				send_item(name, i, send_qty);
				await delay(200);
				hpot_remaining -= send_qty;
			}

			if (item.name === "mpot1" && mpot_remaining > 0) {
				const send_qty = Math.min(item.q || 1, mpot_remaining);
				send_item(name, i, send_qty);
				await delay(200);
				mpot_remaining -= send_qty;
			}
		}

		const fully_delivered = hpot_remaining <= 0 && mpot_remaining <= 0;

		if (fully_delivered) {
			recent_deliveries[name] = Date.now();
			halt_movement();
			return true;
		} else {
			game_log(`⚠️ Partial delivery to ${name}, retrying...`);
			await delay(300);
		}
	}

	game_log(`❌ Could not fully deliver potions to ${name} after 10 attempts`);
	return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHECK FOR LOOT AND COLLECT
// --------------------------------------------------------------------------------------------------------------------------------- //

const ITEM_THRESHOLD = 15;
const loot_responses = {};

function request_loot_status(name) {
	loot_responses[name] = null;
	send_cm(name, { type: "do_you_have_loot" });
}

// Modify CM listener to include count
add_cm_listener((name, data) => {
	if (data.type === "yes_i_have_loot" && PARTY.includes(name)) {
		if (typeof data.count === "number") {
			loot_responses[name] = data.count;
		}
	}
});

async function collect_loot() {
	game_log("📦 Starting loot collection task...");
	merchant_task = "Collecting Loot";
	const targets = [];

	// Send CM requests
	for (const name of PARTY) {
		request_loot_status(name);
	}

	// Wait up to 3 seconds for all responses
	await delay(3000);

	for (const name of PARTY) {
		const count = loot_responses[name];
		if (count !== null && count >= ITEM_THRESHOLD) {
			targets.push(name);
		}
		loot_responses[name] = null; // Safe to clear here
	}

	if (targets.length === 0) {
		merchant_task = "Idle";
		return;
	}

	// Visit each target and collect loot
	for (const name of targets) {
		const destination = await request_location(name);
		if (!destination) {
			game_log(`⚠️ Failed to get location for ${name}, skipping.`);
			continue;
		}

		let arrived = false;
		let collected = false;

		smart_move(destination); // async walk

		while (!arrived && !collected) {
			await delay(300);
			const target = get_player(name);
			if (target && distance(character, target) <= DELIVERY_RADIUS) {
				send_cm(name, { type: "send_loot" });
				await delay(5000);
				collected = true;
			}
			if (!smart.moving) {
				arrived = true;
			}
		}

		game_log(`🏠 Returning to town to sell loot...`);
		stop();
		await smart_move(HOME);
		await sell_and_bank();
		await delay(500);
	}

	game_log("✅ Loot collection task complete.");
	merchant_task = "Idle";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT SELL AND BANK ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = ["hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap", "cclaw", "crabclaw", "slimestaff", "stinger", "coat1", "helmet1",
		       			"gloves1", "pants1", "mushroomstaff", "wbreeches", "shoes1", "vitring", "helmet", "shoes", "pants", "gloves", "coat", "pmace", "throwingstars", "t2bow",
						 "spear", "dagger", "rapier", "sword", "fireblade", "firestaff", "firebow", "rfangs"];
const BANKABLE_ITEMS = [];
const BANK_LOCATION = { map: "bank", x: 0, y: -37 };

async function sell_and_bank() {
	// Only run when not moving
	if (character.moving) return;

	// === SELLING ===
	// Move to vendor
	await smart_move(HOME);
	await delay(3000);

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;
		if (SELLABLE_ITEMS.includes(item.name)) {
			sell(i, item.q || 1);
			game_log(`💰 Sold ${item.name} x${item.q || 1}`);
		}
	}

	// === BANKING ===
	// Move to bank NPC (adjust coords as needed)
	await smart_move(BANK_LOCATION);
	await delay(1000);

	for (let i = 8; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;
		//if (BANKABLE_ITEMS.includes(item.name)) {
		await bank_store(i);
		game_log(`🏦 Deposited ${item.name} x${item.q || 1} to bank`);
		//}
	}

	// === RETURN HOME ===
	// HOME must be defined elsewhere, e.g.:
	// const HOME = { map: "main", x: -89, y: -116 };
	await smart_move(HOME);
	await delay(1000);
	game_log("🏠 Returned home after banking.");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT BUY POTS FOR DISTRIBUTION
// --------------------------------------------------------------------------------------------------------------------------------- //

// Global cooldown tracker
let last_buy_time 	= 0;
const MAX_POTS 		= 9999;
const POT_TYPES 	= ["hpot1", "mpot1"];
const TARGET_MAP 	= "main";
const TARGET_X 		= -36;
const TARGET_Y 		= -153;
const RANGE 		= 300;
const COOLDOWN 		= 2000;

function buy_pots() {

    // === Pre-check: If both hpot and mpot are at or above max, skip ===
    let hpot_total = 0;
    let mpot_total = 0;

    for (const item of character.items) {
        if (!item) continue;
        if (item.name === "hpot1") hpot_total += item.q || 1;
        if (item.name === "mpot1") mpot_total += item.q || 1;
    }

    if (hpot_total >= MAX_POTS && mpot_total >= MAX_POTS) {
        return;
    }

    const now = Date.now();
    if (now - last_buy_time < COOLDOWN) {
        return;
    }

    last_buy_time = now;

    // Check if we're on the correct map and within distance
    if (character.map !== TARGET_MAP) return;

    const dx = character.x - TARGET_X;
    const dy = character.y - TARGET_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > RANGE) {
        return;
    }

    for (const pot of POT_TYPES) {
        let total = 0;

        for (const item of character.items) {
            if (item && item.name === pot) {
                total += item.q || 1;
            }
        }

        const to_buy = Math.max(0, MAX_POTS - total);

        if (to_buy > 0) {
            game_log(`🧪 Buying ${to_buy} x ${pot} (you have ${total})`);
            buy(pot, to_buy);
        } else {
            game_log(`✅ You already have enough ${pot} (${total})`);
        }
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SIMPLE FISHING SCRIPT WITH AUTO-EQUIP
// --------------------------------------------------------------------------------------------------------------------------------- //

function hasTool(toolName) {
	return (
		character.slots.mainhand?.name === toolName ||
		character.slots.offhand?.name === toolName ||
		character.items.some(item => item && item.name === toolName)
	);
}

async function go_fish() {
	const FISHING_SPOT = { map: "main", x: -1116, y: -285 };
	const POSITION_TOLERANCE = 10;
	const MAX_FISHING_WAIT = 9000;
	const POLL_INTERVAL = 200;

	const HOME = { map: "main", x: -89, y: -116 };

	const atFishingSpot = () =>
		character.map === FISHING_SPOT.map &&
		Math.hypot(character.x - FISHING_SPOT.x, character.y - FISHING_SPOT.y) <= POSITION_TOLERANCE;

	const hasRodEquipped = () => character.slots.mainhand?.name === "rod";

	if (!hasRodEquipped()) {
		const rod_index = character.items.findIndex(item => item?.name === "rod");
		if (rod_index === -1) {
			game_log("❌ No fishing rod found.");
			return;
		}
		await equip(rod_index);
		await delay(400);
	}
	if (!hasRodEquipped()) {
		game_log("❌ Failed to equip rod.");
		return;
	}

	if (!atFishingSpot()) {
		game_log("📍 Heading to fishing spot...");
		await smart_move(FISHING_SPOT);
		await delay(200);
		if (!atFishingSpot()) {
			game_log("❌ Could not reach fishing spot.");
			return;
		}
	}

	game_log("🎣 At fishing spot. Starting loop...");

	while (!is_on_cooldown("fishing")) {
		if (!hasRodEquipped()) break;
		if (!atFishingSpot()) break;
		if (character.items.filter(Boolean).length >= character.items.length) {
			game_log("📦 Inventory full. Stopping fishing.");
			break;
		}

		while (is_on_cooldown("fishing")) {
			await delay(POLL_INTERVAL);
		}

		game_log("🎣 Casting...");
		use_skill("fishing");
		await delay(MAX_FISHING_WAIT);
		game_log("✅ Fishing attempt complete.");
	}

	game_log("🏠 Returning home after fishing...");
	await smart_move(HOME);
	game_log("✅ Arrived at home.");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SIMPLE MINING SCRIPT WITH AUTO-EQUIP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function go_mine() {
	const MINING_SPOT = { map: "tunnel", x: 244, y: -153 };
	const POSITION_TOLERANCE = 10;

	function atMiningSpot() {
		return character.map === MINING_SPOT.map &&
			Math.hypot(character.x - MINING_SPOT.x, character.y - MINING_SPOT.y) <= POSITION_TOLERANCE;
	}

	// Check if mining is available
	if (!can_use("mining")) {
		game_log("*** Mining cooldown active ***");
		return;
	}

	// Ensure pickaxe is equipped or try to equip it
	if (character.slots.mainhand?.name !== "pickaxe") {
		const pickaxe_index = character.items.findIndex(item => item?.name === "pickaxe");
		if (pickaxe_index === -1) {
			game_log("*** No pickaxe equipped or in inventory ***");
			return;
		}
		game_log("*** Equipping pickaxe... ***");
		await equip(pickaxe_index);
		await delay(500);
	}

	// Confirm it's now equipped
	if (character.slots.mainhand?.name !== "pickaxe") {
		game_log("*** Failed to equip pickaxe ***");
		return;
	}

	merchant_task = "Mining"
	game_log("*** Moving to mining spot... ***");
	await smart_move(MINING_SPOT);

	if (!atMiningSpot()) {
		game_log("*** Not at mining spot. Aborting. ***");
		merchant_task = "Idle"
		return;
	}

	game_log("*** Arrived at mining spot. Starting to mine... ***");

	while (true) {
		if (is_on_cooldown("mining")) {
			merchant_task = "Idle"
			return;
		}

		// Final pre-mining checks
		if (!can_use("mining")) {
			await delay(500);
			game_log("*** Mining cooldown active ***");
			continue;
		}

		if (character.slots.mainhand?.name !== "pickaxe") {
			await delay(500);
			game_log("*** Pickaxe not equipped or broken ***");
			merchant_task = "Idle"
			break;
		}

		if (!atMiningSpot()) {
			game_log("*** Moved away from mining spot. Re-walking... ***");
			await smart_move(MINING_SPOT);
			if (!atMiningSpot()) {
				game_log("*** Failed to return to mining spot. Aborting. ***");
				merchant_task = "Idle"
				break;
			}
			continue;
		}

		const before_items = character.items.map(i => i?.name || null);
		await delay(500);
		game_log("*** Starting mining attempt... ***");
		use_skill("mining");

		let success = false;
		let attempts = 0;

		while (attempts < 18) {
			await delay(500);
			attempts++;

			const after_items = character.items.map(i => i?.name || null);
			let changed = false;

			for (let i = 0; i < after_items.length; i++) {
				if (after_items[i] !== before_items[i]) {
					changed = true;
					break;
				}
			}

			if (changed) {
				success = true;
				break;
			}
		}

		if (success) {
			game_log("*** ⛏️ Mined something! ***");
		}

		await delay(500);
	}

	merchant_task = "Idle"
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

let exchange_items_running = false;

async function exchange_items() {
    if (exchange_items_running) {
        game_log("⚠️ Exchange already running, skipping duplicate call.");
        return;
    }
    exchange_items_running = true;

    const TARGET_MAP         = "main";
    const TARGET_X           = -1594;
    const TARGET_Y           = 581;
    const RANGE              = 50;
    const MAX_DIST           = 500;
    const EXCHANGE_INTERVAL  = 500; // 0.5 seconds

    // Define minimum counts for each item
    const min_counts = {
        seashell: 20,
        // Add more items and their minimums as needed
        // candycane: 5,
        // mistletoe: 3,
    };
    const items_to_exchange = ["seashell"]; // Example list, edit as needed

    try {
        // Move to exchange NPC
        await smart_move({ map: TARGET_MAP, x: TARGET_X, y: TARGET_Y });

        // Wait until we're in correct spot and not moving
        while (
            character.map !== TARGET_MAP ||
            Math.abs(character.x - TARGET_X) > RANGE ||
            Math.abs(character.y - TARGET_Y) > RANGE ||
            character.moving
        ) {
            await delay(500);
        }

        game_log("📍 At exchange location. Starting exchange & sell loop...");

        let exchanged_any = false;
        for (const item of items_to_exchange) {
            let keep_going = true;
            while (keep_going) {
                // Stop if character is too far from exchange NPC
                const dist = Math.hypot(character.x - TARGET_X, character.y - TARGET_Y);
                if (dist > MAX_DIST) {
                    game_log("❌ Too far from exchange NPC. Stopping exchange.");
                    keep_going = false;
                    break;
                }

                if (character.moving) {
                    await delay(500);
                    continue;
                }

                // Sell off any approved items
                for (let i = 0; i < character.items.length; i++) {
                    const itm = character.items[i];
                    if (itm && SELLABLE_ITEMS.includes(itm.name)) {
                        sell(i, itm.q || 1);
                        game_log(`💰 Sold ${itm.name} x${itm.q || 1}`);
                    }
                }

                // Stop if inventory is full
                if (character.items.filter(Boolean).length >= character.items.length) {
                    game_log("⚠️ Inventory full. Stopping exchange.");
                    keep_going = false;
                    break;
                }

                // Find a stack that meets the minimum count
                let found_stack = false;
                for (let i = 0; i < character.items.length; i++) {
                    const itm = character.items[i];
                    if (itm && itm.name === item && (itm.q || 1) >= (min_counts[item] || 1)) {
                        game_log(`🔁 Exchanging slot ${i} (${item})`);
                        exchange(i);
                        found_stack = true;
                        exchanged_any = true;
                        break;
                    }
                }

                if (!found_stack) {
                    game_log(`✅ No more ${item} stacks with at least ${min_counts[item] || 1}.`);
                    keep_going = false;
                }

                await delay(EXCHANGE_INTERVAL);
            }
        }
        if (!exchanged_any) {
            game_log("✅ No items to exchange.");
        }
    } catch (e) {
        game_log("🔥 exchange_items error:", e.message);
    }
    exchange_items_running = false;
}