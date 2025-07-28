
// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT ACTIVITY QUEUE SYSTEM
// --------------------------------------------------------------------------------------------------------------------------------- //

let merchant_task = "Idle";
let merchant_busy = false;

let last_potion_delivery = 0;
const POTION_DELIVERY_DELAY = 30 * 60 * 1000;
let last_loot_collection = 0;
const LOOT_COLLECTION_DELAY = 15 * 60 * 1000;

async function merchant_task_loop() {
	while (true) {
		const now = Date.now();

		// Priority 1: Deliver Potions (every 30 min)
		if (!merchant_busy && (now - last_potion_delivery > POTION_DELIVERY_DELAY)) {
			merchant_busy = true;
			merchant_task = "Delivering Potions";
			await deliver_potions();
			last_potion_delivery = Date.now();
			merchant_busy = false;
			continue;
		}

		// Priority 2: Collect Loot (every 15 min)
		if (!merchant_busy && (now - last_loot_collection > LOOT_COLLECTION_DELAY)) {
			merchant_busy = true;
			merchant_task = "Collecting Loot";
			await collect_loot();
			last_loot_collection = Date.now();
			merchant_busy = false;
			continue;
		}

		// Priority 3: Fishing (whenever not on cooldown)
		if (!merchant_busy && !is_on_cooldown("fishing")) {
			merchant_busy = true;
			merchant_task = "Fishing";
			await go_fish();
			merchant_busy = false;
			continue;
		}

		// Priority 4: Mining (whenever not on cooldown)
		if (!merchant_busy && can_use("mining")) {
			merchant_busy = true;
			merchant_task = "Mining";
			await go_mine();
			merchant_busy = false;
			continue;
		}

		// Default to Idle
		if (!merchant_busy) merchant_task = "Idle";

		await delay(500); // check periodically
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DELIVER POTIONS AS NEEDED
// --------------------------------------------------------------------------------------------------------------------------------- //

const POTION_DELIVERY_INTERVAL = 30 * 60 * 1000; // 1 hour
const POTION_CAP = 6000;
const MINIMUM_DELIVERED = 1000;
const PARTY = ["Ulric", "Myras", "Riva"];
const DELIVERY_RADIUS = 400;
const HOME = { map: "main", x: -89, y: -116 };

const location_responses = {};
const potion_counts = {};

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

	for (const name of PARTY) {
		game_log(`🔍 Starting delivery check for ${name}`);
		let target_pots = await request_potion_counts(name);
		if (!target_pots) continue;

		const hpot_missing = POTION_CAP - (target_pots.hpot1 || 0);
		const mpot_missing = POTION_CAP - (target_pots.mpot1 || 0);

		if (hpot_missing < MINIMUM_DELIVERED && mpot_missing < MINIMUM_DELIVERED) {
			game_log(`📭 ${name} doesn't need enough potions. Skipping.`);
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

	game_log("⏳ Potion delivery task complete.");
}

async function try_deliver_to(name, hpot_needed, mpot_needed) {
	for (let attempts = 0; attempts <= 10; attempts++) {
		const target = get_player(name);

		if (!target || distance(character, target) > DELIVERY_RADIUS) {
			await delay(300);
			continue;
		}

		let delivered = false;

		if (hpot_needed > 0) {
			let remaining = hpot_needed;
			for (let i = 0; i < character.items.length && remaining > 0; i++) {
				const item = character.items[i];
				if (!item || item.name !== "hpot1") continue;

				const send_qty = Math.min(item.q || 1, remaining);
				send_item(name, i, send_qty);
				await delay(200);
				remaining -= send_qty;
				delivered = true;
			}
		}

		if (mpot_needed > 0) {
			let remaining = mpot_needed;
			for (let i = 0; i < character.items.length && remaining > 0; i++) {
				const item = character.items[i];
				if (!item || item.name !== "mpot1") continue;

				const send_qty = Math.min(item.q || 1, remaining);
				send_item(name, i, send_qty);
				await delay(200);
				remaining -= send_qty;
				delivered = true;
			}
		}

		if (delivered) {
			game_log(`✅ Delivered potions to ${name}`);
			stop();
			return true;
		} else {
			game_log(`⚠️ Attempted delivery to ${name} but had nothing to send`);
			return false;
		}
	}

	game_log(`⚠️ Could not deliver potions to ${name} (out of range or missing after 10 tries)`);
	return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHECK FOR LOOT AND COLLECT
// --------------------------------------------------------------------------------------------------------------------------------- //

const loot_responses = {};

function request_loot_status(name) {
	loot_responses[name] = null;
	send_cm(name, { type: "do_you_have_loot" });
}

add_cm_listener((name, data) => {
	if (data.type === "yes_i_have_loot" && PARTY.includes(name)) {
		loot_responses[name] = true;
	}
});

async function collect_loot() {
	merchant_task = "Collecting Loot";
	const targets = [];

	// Ask each party member if they have loot
	for (const name of PARTY) {
		request_loot_status(name);
	}

	// Wait for responses
	for (let i = 0; i < 10; i++) {
		await delay(300);
		for (const name of PARTY) {
			if (loot_responses[name]) {
				targets.push(name);
				loot_responses[name] = null; // Reset after handling
			}
		}
	}

	// Visit each target and collect loot
	for (const name of targets) {
		const destination = await request_location(name);
		if (!destination) continue;

		game_log(`🚶 Moving to ${name} for loot pickup...`);
		let arrived = false;
		let collected = false;

		smart_move(destination); // async walk

		while (!arrived && !collected) {
			await delay(300);
			const target = get_player(name);
			if (target && distance(character, target) <= DELIVERY_RADIUS) {
				send_cm(name, { type: "send_loot" });
				await delay(1000);
				collected = true;
			}
			if (!smart.moving) arrived = true;
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
		       "gloves1", "pants1", "mushroomstaff", "wbreeches", "shoes1", "vitring"];
const BANKABLE_ITEMS = [];

async function sell_and_bank() {
    // Only run when not moving
    if (character.moving) return;

    await smart_move({ x: -210, y: -107, map: "main" });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // === SELLING ===
    for (let i = 0; i < character.items.length; i++) {
        let item = character.items[i];
        if (!item) continue;

        if (SELLABLE_ITEMS.includes(item.name)) {
            sell(i, item.q || 1);
            game_log(`Sold ${item.name}`);
        }
    }
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
// CHECK FOR LOOT AND TRANSFER
// --------------------------------------------------------------------------------------------------------------------------------- //



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

	function atFishingSpot() {
		return character.map === FISHING_SPOT.map &&
			Math.hypot(character.x - FISHING_SPOT.x, character.y - FISHING_SPOT.y) <= POSITION_TOLERANCE;
	}

	// Skip if still on cooldown
	if (is_on_cooldown("fishing")) {
		game_log("*** Fishing cooldown active ***");
		return;
	}

	// Equip rod if needed
	if (character.slots.mainhand?.name !== "rod") {
		const rod_index = character.items.findIndex(item => item?.name === "rod");
		if (rod_index === -1) {
			game_log("*** No fishing rod equipped or in inventory ***");
			return;
		}
		game_log("*** Equipping fishing rod... ***");
		await equip(rod_index);
		await delay(500);
	}

	// Confirm rod equipped
	if (character.slots.mainhand?.name !== "rod") {
		game_log("*** Failed to equip fishing rod ***");
		return;
	}

	merchant_task = "Fishing"
	game_log("*** Moving to fishing spot... ***");
	await smart_move(FISHING_SPOT);

	if (!atFishingSpot()) {
		game_log("*** Not at fishing spot. Aborting. ***");
		merchant_task = "Idle"
		return;
	}

	game_log("*** Arrived at fishing spot. Starting to fish... ***");

	while (true) {
		// Pre-cast checks
		if (is_on_cooldown("fishing")) {
			merchant_task = "Idle"
			return;
		}

		if (character.slots.mainhand?.name !== "rod") {
			await delay(500);
			game_log("*** Fishing rod not equipped or broken ***");
			merchant_task = "Idle"
			break;
		}

		if (!atFishingSpot()) {
			game_log("*** Moved away from fishing spot. Re-walking... ***");
			await smart_move(FISHING_SPOT);
			if (!atFishingSpot()) {
				game_log("*** Failed to return to fishing spot. Aborting. ***");
				merchant_task = "Idle"
				break;
			}
			continue;
		}

		const before_items = character.items.map(i => i?.name || null);
		await delay(500);
		game_log("*** Casting line... ***");
		use_skill("fishing");

		let success = false;
		let attempts = 0;

		while (attempts < 30) {
			await delay(500);
			attempts++;

			const after_items = character.items.map(i => i?.name || null);
			if (after_items.some((name, i) => name !== before_items[i])) {
				success = true;
				break;
			}
		}

		if (success) {
			game_log("*** 🎣 Caught something! ***");
		} else {
			game_log("*** ⚠️ No catch or timeout. ***");
		}

		await delay(500);
	}

	merchant_task = "Idle"
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

		while (attempts < 30) {
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
		} else {
			game_log("*** ⚠️ No ore mined or timeout. ***");
		}

		await delay(500);
	}

	merchant_task = "Idle"
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

async function exchange_item(item_name) {
    const TARGET_MAP = "main";
    const TARGET_X = -21;
    const TARGET_Y = -422;
    const RANGE = 50;
    const EXCHANGE_INTERVAL = 6000; // 10 seconds

    // === Move to exchange NPC ===
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

    game_log("📍 At exchange location. Starting exchange loop...");

    // === Main exchange loop ===
    const interval = setInterval(() => {
        if (character.moving) return; // Skip while moving

        // Stop if inventory is full
        if (character.items.filter(Boolean).length >= character.items.length) {
            game_log("⚠️ Inventory full. Stopping exchange.");
            clearInterval(interval);
            return;
        }

        // Find the slot of the item
        const slot = locate_item(item_name);

        if (slot === -1 || !character.items[slot]) {
            game_log(`✅ No more ${item_name} to exchange. Done.`);
            clearInterval(interval);
            return;
        }

        game_log(`🔁 Exchanging slot ${slot} (${item_name})`);
        exchange(slot);

    }, EXCHANGE_INTERVAL);
}
