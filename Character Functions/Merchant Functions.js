
// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT ACTIVITY QUEUE SYSTEM
// --------------------------------------------------------------------------------------------------------------------------------- //

let merchant_busy = false;
const merchant_queue = [];

function queue_merchant_action(action_name, action_fn) {
    merchant_queue.push({ name: action_name, fn: action_fn });
    process_merchant_queue();
}

async function process_merchant_queue() {
    if (merchant_busy || merchant_queue.length === 0) return;

    merchant_busy = true;
    const { name, fn } = merchant_queue.shift();

    try {
        game_log(`🔁 Executing: ${name}`);
        await fn();
    } catch (err) {
        game_log(`⚠️ Error in action "${name}": ${err.message}`);
    }

    merchant_busy = false;
    setTimeout(process_merchant_queue, 100); // small delay before next
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DELIVER POTS ON A LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

const POTION_DELIVERY_INTERVAL = 60 * 60 * 1000; // 1 hour
const POTION_CAP = 6000;
const MINIMUM_DELIVERED = 100; // new: must send at least 100 total
const PARTY = ["Ulric", "Myras", "Riva"];
const DELIVERY_RADIUS = 400;
const HOME = { map: "main", x: -89, y: -116 };

const location_responses = {};
const potion_counts = {};

// Request location via CM
async function request_location(name) {
	location_responses[name] = null;
	send_cm(name, { type: "where_are_you" });

	for (let i = 0; i < 10; i++) {
		await delay(300);
		if (location_responses[name]) return location_responses[name];
	}

	game_log(`⚠️ No location received from ${name}`);
	return null;
}

// Request potion counts via CM
async function request_potion_counts(name) {
	potion_counts[name] = null;
	send_cm(name, { type: "what_potions" });

	for (let i = 0; i < 10; i++) {
		await delay(300);
		if (potion_counts[name]) return potion_counts[name];
	}

	game_log(`⚠️ No potion count received from ${name}`);
	return null;
}

// CM listener for potion counts
add_cm_listener((name, data) => {
	if (data.type === "my_potions" && PARTY.includes(name)) {
		potion_counts[name] = {
			hpot1: data.hpot1 || 0,
			mpot1: data.mpot1 || 0
		};
	}
});

async function deliver_potions_loop() {
	while (true) {
		const delivered_to = new Set();

		for (const name of PARTY) {
			if (delivered_to.has(name)) continue;

			const potions = await request_potion_counts(name);
			if (!potions) continue;

			let needs_delivery = false;
			for (const pot of POTION_TYPES) {
				if ((potions[pot] || 0) < POTION_CAP) {
					needs_delivery = true;
					break;
				}
			}

			if (!needs_delivery) {
				game_log(`📭 ${name} does not need potions.`);
				continue;
			}

			const destination = await request_location(name);
			if (!destination) continue;

			game_log(`➡️ Walking to ${name} at ${destination.map}...`);
			smart_move(destination); // Don't await

			let all_sent = false;
			let attempts = 0;
			let has_retried_move = false;

			const sent_totals = { mpot1: 0, hpot1: 0 };

			while (!all_sent && attempts < 40) {
				await delay(300);
				const target_char = get_player(name);
				const in_range = target_char && distance(character, target_char) <= DELIVERY_RADIUS;

				if (!in_range) {
					attempts++;

					// Retry move once if the target drifted away
					if (attempts === 10 && !has_retried_move) {
						game_log(`🔁 ${name} moved. Attempting re-approach...`);
						const new_dest = await request_location(name);
						if (new_dest) {
							await smart_move(new_dest);
							has_retried_move = true;
							attempts = 0;
						}
					}

					continue;
				}

				const target_pots = await request_potion_counts(name);
				if (!target_pots) break;

				let any_delivered = false;

				for (const pot of POTION_TYPES) {
					const current_qty = target_pots[pot] || 0;
					const needed = POTION_CAP - current_qty;
					if (needed <= 0) continue;

					let to_send = needed;

					for (let i = 0; i < character.items.length && to_send > 0; i++) {
						const my_item = character.items[i];
						if (!my_item || my_item.name !== pot) continue;

						const send_qty = Math.min(my_item.q || 1, to_send);
						send_item(name, i, send_qty);
						sent_totals[pot] += send_qty;
						to_send -= send_qty;
						await delay(200);
						any_delivered = true;

						if (to_send <= 0) break;
					}
				}

				if (any_delivered) {
					game_log(`🧃 Sent potions to ${name}, checking inventory...`);
					await delay(1000); // Allow CM to update
				}

				const check_again = await request_potion_counts(name);
				if (!check_again) break;

				all_sent = POTION_TYPES.every(pot =>
					(check_again[pot] || 0) >= POTION_CAP
				);
			}

			const total_delivered = sent_totals.hpot1 + sent_totals.mpot1;

			if (all_sent || total_delivered >= MINIMUM_DELIVERED) {
				stop();
				game_log(`✅ Delivered ${total_delivered} potions to ${name}`);
				delivered_to.add(name);
			} else {
				game_log(`⚠️ Could not fully deliver to ${name} after timeout`);
			}

			await delay(500);
		}

		game_log("🏠 Returning to home base...");
		await smart_move(HOME);

		game_log("⏳ Potion delivery loop done. Resting...");
		await delay(POTION_DELIVERY_INTERVAL);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT SELL AND BANK ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = ["hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap", "cclaw", "crabclaw", "slimestaff", "stinger", "coat1", "helmet1",
		       "gloves1", "pants1", "mushroomstaff", "wbreeches", "shoes1"];
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

const INVENTORY_QUEUE		= ["Ulric", "Myras", "Riva"];
const INVENTORY_THRESHOLD  	= 20;
const SELLING_LOCATION     	= { map: "main", x: -20, y: -100 };
const INVENTORY_LOCK_DURATION  	= 5000; // 5 seconds max lock
let currently_processing    	= false;
let inventory_lock_timestamp    = 0;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function check_remote_inventories() {
    const now = Date.now();

    // Prevent overlapping calls
    if (currently_processing && now - inventory_lock_timestamp < INVENTORY_LOCK_DURATION) {
        game_log("⏳ Inventory check already in progress.");
        return;
    }

    currently_processing = true;
    inventory_lock_timestamp = now;

    const initial_count = character.items.filter(Boolean).length;
    let resolved = false;

    const cleanup = () => {
        for (const t of INVENTORY_QUEUE) remove_cm_listener(listeners[t]);
        currently_processing = false;
        inventory_lock_timestamp = 0;
        INVENTORY_QUEUE.length = 0;
        INVENTORY_QUEUE.push("Ulric", "Myras", "Riva");
    };

    const listeners = {};

    for (const target of INVENTORY_QUEUE) {
        listeners[target] = (name, data) => {
            if (resolved || name !== target || data?.type !== "inventory_status") return;
            if (data.count <= INVENTORY_THRESHOLD) return;

            resolved = true;

            (async () => {
                try {
                    game_log(`📦 ${target} has ${data.count} items. Transferring...`);
                    move_to_character(target);
                    await delay(3000);
                    send_cm(target, { type: "send_inventory" });

                    // Wait for item increase
                    while (character.items.filter(Boolean).length <= initial_count) {
                        await delay(500);
                    }

                    // Wait for stable inventory
                    let stable_ticks = 0, last = character.items.filter(Boolean).length;
                    while (stable_ticks < 4) {
                        await delay(500);
                        const current = character.items.filter(Boolean).length;
                        if (current === last) {
                            stable_ticks++;
                        } else {
                            last = current;
                            stable_ticks = 0;
                        }
                    }

                    await smart_move(SELLING_LOCATION);
                    await sell_and_bank();
                } catch (e) {
                    console.error("❌ Inventory transfer error:", e);
                } finally {
                    cleanup();
                }
            })();
        };

        add_cm_listener(listeners[target]);
        send_cm(target, { type: "check_inventory" });
    }

    // Global timeout fallback
    setTimeout(() => {
        if (!resolved) {
            game_log("⚠️ No valid inventory responses received. Skipping.");
            cleanup();
        }
    }, INVENTORY_LOCK_DURATION);
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

	game_log("*** Moving to fishing spot... ***");
	await smart_move(FISHING_SPOT);

	if (!atFishingSpot()) {
		game_log("*** Not at fishing spot. Aborting. ***");
		return;
	}

	game_log("*** Arrived at fishing spot. Starting to fish... ***");

	while (true) {
		// Pre-cast checks
		if (is_on_cooldown("fishing")) return;

		if (character.slots.mainhand?.name !== "rod") {
			await delay(500);
			game_log("*** Fishing rod not equipped or broken ***");
			break;
		}

		if (!atFishingSpot()) {
			game_log("*** Moved away from fishing spot. Re-walking... ***");
			await smart_move(FISHING_SPOT);
			if (!atFishingSpot()) {
				game_log("*** Failed to return to fishing spot. Aborting. ***");
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
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// SIMPLE MINING SCRIPT WITH AUTO-EQUIP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function go_mine() {
	const MINING_SPOT = { map: "tunnel", x: 244, y: -153 };
	const POSITION_TOLERANCE = 10; // how close is “close enough”

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

	// Move to mining spot
	game_log("*** Moving to mining spot... ***");
	await smart_move(MINING_SPOT);

	// Check arrival
	if (!atMiningSpot()) {
		game_log("*** Not at mining spot. Aborting. ***");
		return;
	}

	game_log("*** Arrived at mining spot. Starting to mine... ***");

	while (true) {
		if (is_on_cooldown("mining")) return;
		// Final pre-mining checks
		if (!can_use("mining")) {
			await delay(500);
			game_log("*** Mining cooldown active ***");
			continue;
		}

		if (character.slots.mainhand?.name !== "pickaxe") {
			await delay(500);
			game_log("*** Pickaxe not equipped or broken ***");
			break;
		}

		if (!atMiningSpot()) {
			game_log("*** Moved away from mining spot. Re-walking... ***");
			await smart_move(MINING_SPOT);
			if (!atMiningSpot()) {
				game_log("*** Failed to return to mining spot. Aborting. ***");
				break;
			}
			continue;
		}

		// Snapshot inventory before mining
		const before_items = character.items.map(i => i?.name || null);
		await delay(500);
		game_log("*** Starting mining attempt... ***");
		use_skill("mining");

		let success = false;
		let attempts = 0;

		while (attempts < 30) { // wait up to 30s
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
