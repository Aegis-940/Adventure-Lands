
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) LOBAL LOOP SWITCHES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_STATES = {

    loot_and_potions: false,

}

// Define party members to assist
const PARTY = ["Ulric", "Myras", "Riva"];

// Define default location to wait when idle
const HOME = { map: "main", x: -89, y: -116 };

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS (with persistent state saving)
// --------------------------------------------------------------------------------------------------------------------------------- //

function start_deliver_potions_loop() {
    if (LOOP_STATES.deliver_potions) return;
    LOOP_STATES.deliver_potions = true;
    deliver_potions_loop();
    game_log("▶️ Deliver potions loop started");
}

function stop_deliver_potions_loop() {
    if (!LOOP_STATES.deliver_potions) return;
    LOOP_STATES.deliver_potions = false;
    game_log("⏹ Deliver potions loop stopped");
}

function start_loot_and_potions_loop() {
    if (LOOP_STATES.loot_and_potions) return;
    LOOP_STATES.loot_and_potions = true;
    loot_and_potions_loop();
    game_log("▶️ Loot and potions loop started");
}

function stop_loot_and_potions_loop() {
    if (!LOOP_STATES.loot_and_potions) return;
    LOOP_STATES.loot_and_potions = false;
    game_log("⏹ Loot and potions loop stopped");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT LOOP CONTROLLER
// --------------------------------------------------------------------------------------------------------------------------------- //

// --- Helper: Handle death and respawn ---
async function handle_death_and_respawn() {
    stop_deliver_potions_loop();
    stop_collect_loot_loop();

    await delay(30000);
    await respawn();
    await delay(5000);
}

async function merchant_loop_controller() {

	try {

		if (!LOOP_STATES.loot_and_potions) loot_and_potions_loop();

    } catch (e) {
        game_log("⚠️ Merchant Loop error:", "#FF0000");
        game_log(e);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COLLECT LOOT AND DELIVER POTIONS LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

const POTION_CAP = 5000;
const POTION_MIN = 2000;
const FREQUENCY = 10 * 60 * 1000; // 10 minutes

const DELIVERY_RADIUS = 350;

async function loot_and_potions_loop() {

    LOOP_STATES.loot_and_potions = true;

	game_log("🔄 Starting loot and potions loop...");

    try {
        while (LOOP_STATES.loot_and_potions) {
            // --- 1. Wait for status_cache to be populated ---
            try {
                if (!status_cache || Object.keys(status_cache).length === 0) {
                    game_log("⏳ Waiting for status_cache to populate...");
                    await delay(10000);
                    continue;
                }
            } catch (e) {
                game_log("Error checking status_cache: " + e.message);
                await delay(10000);
                continue;
            }

            // --- 2. Process each party member in order ---
            for (const name of ["Ulric", "Myras", "Riva"]) {
                try {
                    const info = status_cache[name];
                    if (!info) {
                        game_log(`⚠️ No status info for ${name}, skipping.`);
                        continue;
                    }

                    // --- 2a. Attempt to deliver potions ---
                    try {
                        let hpot_needed = Math.max(0, POTION_CAP - (info.hpot1 || 0));
                        let mpot_needed = Math.max(0, POTION_CAP - (info.mpot1 || 0));

                        // Only deliver if below POTION_MIN
                        if ((info.hpot1 || 0) < POTION_MIN || (info.mpot1 || 0) < POTION_MIN) {
                            let delivered = false;
                            let delivery_attempts = 0;
                            while (!delivered && delivery_attempts < 3) {
                                try {
                                    // Move to target
                                    if (info.map && typeof info.x === "number" && typeof info.y === "number") {
                                        await smart_move({ map: info.map, x: info.x, y: info.y });
                                    }
                                    await delay(500);

                                    // Check distance
                                    const target = get_player(name);
                                    if (target && distance(character, target) <= DELIVERY_RADIUS) {
                                        // Deliver potions
                                        if (hpot_needed > 0) send_item(target, locate_item("hpot1"), hpot_needed);
                                        if (mpot_needed > 0) send_item(target, locate_item("mpot1"), mpot_needed);
                                        game_log(`🧪 Delivered potions to ${name}`);
                                        delivered = true;
                                    } else {
                                        game_log(`❌ Could not reach ${name} for potion delivery (attempt ${delivery_attempts + 1})`);
                                    }
                                } catch (e) {
                                    game_log(`Potion delivery error for ${name}: ${e.message}`);
                                }
                                if (!delivered) {
                                    await delay(2000);
                                }
                                delivery_attempts++;
                            }
                        }
                    } catch (e) {
                        game_log(`Error in potion delivery section for ${name}: ${e.message}`);
                    }

                    // --- 2b. Attempt to collect loot ---
                    try {
                        if ((info.inventory || 0) >= 20) {
                            let collected = false;
                            let collect_attempts = 0;
                            while (!collected && collect_attempts < 3) {
                                try {
                                    // Move to target
                                    if (info.map && typeof info.x === "number" && typeof info.y === "number") {
                                        await smart_move({ map: info.map, x: info.x, y: info.y });
                                    }
                                    await delay(500);

                                    // Check distance
                                    const target = get_player(name);
                                    if (target && distance(character, target) <= DELIVERY_RADIUS) {
                                        send_cm(name, { type: "send_loot" });
                                        game_log(`📦 Requested loot from ${name}`);
                                        await delay(5000); // Wait for loot transfer
                                        collected = true;
                                    } else {
                                        game_log(`❌ Could not reach ${name} for loot collection (attempt ${collect_attempts + 1})`);
                                    }
                                } catch (e) {
                                    game_log(`Loot collection error for ${name}: ${e.message}`);
                                }
                                if (!collected) {
                                    await delay(2000);
                                }
                                collect_attempts++;
                            }
                        }
                    } catch (e) {
                        game_log(`Error in loot collection section for ${name}: ${e.message}`);
                    }

                } catch (e) {
                    game_log(`Error processing ${name}: ${e.message}`);
                }
            }

            // --- 3. Sell and bank, then buy more potions ---
            try {
                await sell_and_bank();
            } catch (e) {
                game_log("Error during sell_and_bank: " + e.message);
            }
            try {
                buy_pots();
            } catch (e) {
                game_log("Error during buy_pots: " + e.message);
            }

            // --- 4. Wait for next cycle ---
            await delay(FREQUENCY);
        }
    } catch (e) {
        game_log("⚠️ Loot and Potions Loop error:", "#FF0000");
        game_log(e);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT SELL AND BANK ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = ["hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap", "cclaw", "crabclaw", "slimestaff", "stinger", "coat1", "helmet1",
		       			"gloves1", "pants1", "mushroomstaff", "wbreeches", "shoes1", "vitring", "helmet", "shoes", "gloves", "pmace", "throwingstars", "t2bow",
						 "spear", "dagger", "rapier", "sword", "rfangs", "gphelmet", "phelmet"];
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
	await parent.$('#maincode')[0].contentWindow.render_bank_items();
	await delay(1000);
	await parent.hide_modal();
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADE ARMOUR
// --------------------------------------------------------------------------------------------------------------------------------- //

async function target_upgrade(target_item, target_amount) {
    const TARGET_MAP = "main";
    const XLOC = -209;
    const YLOC = -117;

    await smart_move({ map: TARGET_MAP, x: XLOC, y: YLOC });

    // Count how many you already have
    let owned = 0;
    for (const itm of character.items) {
        if (itm && itm.name === target_item) owned += itm.q || 1;
    }
    const to_buy = Math.max(0, target_amount - owned);

    if (to_buy > 0) {
        for (let i = 0; i < to_buy; i++) {
            await buy(target_item, 1);
            await delay(200); // Small delay to avoid server rate limits
        }
        game_log(`🛒 Bought ${to_buy} ${target_item}(s)`);
    } else {
        game_log(`✅ Already have at least ${target_amount} ${target_item}(s)`);
    }

	await delay(500);

    await run_auto_upgrade();

	await delay(500);

	// await sell_and_bank();
}
