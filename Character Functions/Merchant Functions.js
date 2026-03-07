
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL LOOP SWITCHES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_STATES = {

    potions_and_loot: false,
    fishing: false,
    mining: false,
    upgrading: false,

}

// Define party members to assist
const PARTY = ["Ulric", "Myras", "Riva"];

// Define default location to wait when idle
const HOME = { map: "main", x: -87, y: -96 };

let merchant_task = "Idle"; // Current task: "Idle", "Mining", etc.

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_NAMES = [
    "potion_delivery",
    "loot_collection",
    "fishing",
    "mining",
    "upgrading"
];

for (const name of LOOP_NAMES) {
    globalThis[`start_${name}_loop`] = () => { LOOP_STATES[name] = true; };
    globalThis[`stop_${name}_loop`] = () => { LOOP_STATES[name] = false; };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// 3) MERCHANT LOOP CONTROLLER
// --------------------------------------------------------------------------------------------------------------------------------- //

const MERCHANT_STATES = {
    DEAD: "dead",
    PANIC: "panic",
    DELIVERING: "delivering",
    UPGRADING: "upgrading",
    EXCHANGING: "exchanging",
    FISHING: "fishing",
    MINING: "mining",
    BUFFING: "buffing",
    IDLE: "idle"
};

let last_auto_upgrade_time = 0; // Timestamp in ms
let last_exchange_time = 0;     // Timestamp in ms
let last_mluck_time = 0;

function should_run_auto_upgrade() {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    return (Date.now() - last_auto_upgrade_time) > THIRTY_MINUTES;
}

function get_character_state() {
    const now = Date.now();
    if (character.rip) return MERCHANT_STATES.DEAD;
    // if (panicking) return MERCHANT_STATES.PANIC;
    if (now - last_mluck_time > 30 * 60 * 1000) return MERCHANT_STATES.BUFFING;
    if (Object.keys(party_status_cache).length > 0) return MERCHANT_STATES.DELIVERING;
    if (merchant_task !== "Delivering" && should_run_auto_upgrade()) return MERCHANT_STATES.UPGRADING;
    if (merchant_task === "Idle" && (Date.now() - last_exchange_time) > (1 * 60 * 1000)) return MERCHANT_STATES.EXCHANGING;
    if (merchant_task === "Idle") return MERCHANT_STATES.IDLE;
}

let handling_merchant_death = false;
let handling_delivery = false;
let handling_upgrading = false;
let handling_exchanging = false;
let handling_buffing = false;
async function set_state(state) {
    try {
        // State-specific
        switch (state) {
            case MERCHANT_STATES.DEAD:
                if (!handling_merchant_death) {
                    handling_merchant_death = true;
                    try {
                        // panicking = false;

                        // log("Respawning in 30s...", "red");
                        // await delay(30000);
                        // if (character.rip) await respawn();
                        // await delay(5000);
                        
                        // await smarter_move(HOME);

                        // // Re-evaluate state after respawn
                        // const NEW_STATE = get_character_state();
                        // if (NEW_STATE !== MERCHANT_STATES.NORMAL) {
                        //     await set_state(NEW_STATE);
                        //     return;
                        // }
                    } catch (e) {
                        catcher(e, "set_state: DEAD state error");
                    }
                    handling_merchant_death = false;
                }
                break;

            case MERCHANT_STATES.PANIC:
                try {
                    // PANIC state logic here
                } catch (e) {
                    catcher(e, "set_state: PANIC state error");
                }
                break;

            case MERCHANT_STATES.DELIVERING:
                try {
                    if (!handling_delivery) {
                        log("Starting potion delivery and loot collection...");
                        handling_delivery = true;
                        merchant_task = "Delivering";
                        await potions_and_loot_controller_loop()
                        merchant_task = "Idle";
                    }
                    handling_delivery = false;
                } catch (e) {
                    catcher(e, "set_state: DELIVERING state error");
                }
                break;

            case MERCHANT_STATES.UPGRADING:
                try {
                    if (!handling_upgrading) {
                        if (character.gold < 100000000) {
                            log("❌ Skipping auto-upgrade: Not enough gold (< 100,000,000).");
                            last_auto_upgrade_time = Date.now();
                            merchant_task = "Idle";
                            return;
                        }
                        log("Starting auto-upgrade process...");
                        handling_upgrading = true;
                        merchant_task = "Upgrading";
                        // await pouchbow_upgrade();
                        // await auto_upgrade();
                        last_auto_upgrade_time = Date.now();
                        merchant_task = "Idle";
                    }
                    handling_upgrading = false;
                } catch (e) {
                    catcher(e, "set_state: UPGRADING state error");
                }
                break;

            case MERCHANT_STATES.EXCHANGING:
                try {
                    // if(!handling_exchanging) {
                    //     handling_exchanging = true;
                    //     merchant_task = "Exchanging";
                    //     exchange_items();
                    //     last_exchange_time = Date.now();
                    //     merchant_task = "Idle";
                    // }
                    // handling_exchanging = false;
                } catch (e) {
                    catcher(e, "set_state: EXCHANGING state error");
                }
                break;

            case MERCHANT_STATES.FISHING:
                try {
                    // FISHING state logic here
                } catch (e) {
                    catcher(e, "set_state: FISHING state error");
                }
                break;

            case MERCHANT_STATES.MINING:
                try {
                    // MINING state logic here
                } catch (e) {
                    catcher(e, "set_state: MINING state error");
                }
                break;

            case MERCHANT_STATES.BUFFING:
                try {
                    log("Starting MLuck buff on party members...");
                    // await mluck_buff();
                } catch (e) {
                    catcher(e, "set_state: BUFFING state error");
                }
                break;

            case MERCHANT_STATES.IDLE:
                try {
                    // IDLE state logic here
                } catch (e) {
                    catcher(e, "set_state: IDLE state error");
                }
                break;
        }
    } catch (e) {
        catcher(e, "set_state: Global error");
    }
}

async function loop_controller() {
    while (true) {
        try {
            const state = get_character_state();
            await set_state(state);
        } catch (e) {
            catcher(e, "Loop Controller error");
        }
        await delay(250);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO BUY POTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function auto_buy_potion_loop() {
    const TARGET_MAP = "main";
    const TARGET_X = -87;
    const TARGET_Y = -150;
    const RANGE = 300;
    const MAX_POTS = 9999;
    const MIN_BUY = 100;
    while (true) {
        try {
            // Check if on correct map and within range
            if (character.map === TARGET_MAP) {
                const dx = character.x - TARGET_X;
                const dy = character.y - TARGET_Y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < RANGE) {
                    // Count mpot1 in inventory
                    let mpot_total = 0;
                    for (const item of character.items) {
                        if (item && item.name === "mpot1") mpot_total += item.q || 1;
                    }
                    if (mpot_total < MAX_POTS) {
                        const to_buy = MAX_POTS - mpot_total;
                        if (to_buy > MIN_BUY) {
                            log(`🧪 Buying ${to_buy} x mpot1 (you have ${mpot_total})`);
                            buy("mpot1", to_buy);
                        }
                    }
                    // Count hpot1 in inventory
                    let hpot_total = 0;
                    for (const item of character.items) {
                        if (item && item.name === "hpot1") hpot_total += item.q || 1;
                    }
                    if (hpot_total < MAX_POTS) {
                        const to_buy = MAX_POTS - hpot_total;
                        if (to_buy > MIN_BUY) {
                            log(`🧪 Buying ${to_buy} x hpot1 (you have ${hpot_total})`);
                            buy("hpot1", to_buy);
                        }
                    }
                }
            }
        } catch (e) {
            game_log("auto_buy_potion_loop error: " + e.message);
        }
        await delay(1000);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY POTION DELIVERY LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function party_potion_delivery_loop() {
    const PARTY = ["Myras", "Ulric", "Riva"];
    const POTION_CAP = 5000;
    const RANGE = 300;
    const POT_TYPES = ["hpot1", "mpot1"];
    let last_delivery_time = 0;
    while (true) {
        let delivered = false;
        log("[potion_delivery_loop] Polling for delivery opportunities...");
        for (const name of PARTY) {
            try {
                log(`[potion_delivery_loop] Checking ${name}...`);
                // Only deliver if 60s have passed since last delivery
                if (Date.now() - last_delivery_time < 60000) {
                    log(`[potion_delivery_loop] Waiting for cooldown. ${(60000 - (Date.now() - last_delivery_time))}ms left.`);
                    break;
                }
                const player = get_player(name);
                if (!player) {
                    log(`[potion_delivery_loop] ${name} not found.`);
                    continue;
                }
                if (player.rip) {
                    log(`[potion_delivery_loop] ${name} is dead.`);
                    continue;
                }
                const dx = character.x - player.x;
                const dy = character.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                log(`[potion_delivery_loop] Distance to ${name}: ${dist.toFixed(2)} (map: ${character.map} vs ${player.map})`);
                if (character.map !== player.map || dist > RANGE) {
                    log(`[potion_delivery_loop] ${name} not in range or on different map.`);
                    continue;
                }

                // Request status_update from the party member
                let responded = false;
                let status = null;
                function handle_status_update(n, data) {
                    if (n === name && data && data.type === "status_update" && data.data) {
                        status = data.data;
                        responded = true;
                    }
                }
                add_cm_listener(handle_status_update);
                log(`[potion_delivery_loop] Requesting status_update from ${name}...`);
                send_cm(name, { type: "status_update_request" });

                // Wait up to 2s for response
                for (let i = 0; i < 20; i++) {
                    if (responded) break;
                    await delay(100);
                }
                remove_cm_listener(handle_status_update);

                if (!status) {
                    log(`[potion_delivery_loop] No status received from ${name}.`);
                    continue;
                }

                // Deliver potions as needed
                let did_deliver = false;
                for (const pot of POT_TYPES) {
                    const have = status[pot] || 0;
                    const need = Math.max(0, Math.min(POTION_CAP - have, get_potion_count(pot)));
                    log(`[potion_delivery_loop] ${name} has ${have} ${pot}, needs ${need}.`);
                    if (need > 0) {
                        game_log(`🚚 Giving ${need} x ${pot} to ${name}`);
                        log(`[potion_delivery_loop] Giving ${need} x ${pot} to ${name}`);
                        give_item(name, pot, need);
                        await delay(200);
                        did_deliver = true;
                    }
                }
                if (did_deliver) {
                    last_delivery_time = Date.now();
                    delivered = true;
                    log(`[potion_delivery_loop] Delivered potions to ${name}. Waiting 60s before next delivery.`);
                    break; // Only deliver to one party member per 60s
                } else {
                    log(`[potion_delivery_loop] No potions delivered to ${name}.`);
                }
            } catch (e) {
                game_log(`party_potion_delivery_loop error: ${e.message}`);
                log(`[potion_delivery_loop] Error: ${e.message}`);
            }
        }
        if (delivered) {
            // Wait out the rest of the 60s interval
            let wait_time = 60000 - (Date.now() - last_delivery_time);
            log(`[potion_delivery_loop] Waiting out cooldown: ${wait_time}ms`);
            if (wait_time > 0) await delay(wait_time);
        } else {
            await delay(250);
        }
    }
}

function get_potion_count(pot) {
    let total = 0;
    for (const item of character.items) {
        if (item && item.name === pot) total += item.q || 1;
    }
    return total;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COLLECT LOOT AND DELIVER POTIONS LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

const POTION_CAP = 5000;
const POTION_MIN = 2000;
const LOOT_MIN = 20;
const FREQUENCY = 1 * 60 * 1000; // 1 minute

const DELIVERY_RADIUS = 300;

// Global cache for party status, updated via code messages
let party_status_cache = {};

// Listen for status_update code messages from party members
add_cm_listener((name, data) => {
    if (data && data.type === "status_update" && data.data) {
        party_status_cache[name] = data.data;
    }
});

async function potion_delivery_loop(name, info) {

    try {
        let target = get_player(name);
        // Give potions up to POTION_CAP
        let hpot_needed = Math.max(0, POTION_CAP - (info.hpot1 || 0));
        let mpot_needed = Math.max(0, POTION_CAP - (info.mpot1 || 0));
        let hpot_slot = locate_item("hpot1");
        let mpot_slot = locate_item("mpot1");
        if (hpot_needed > 0 && hpot_slot !== -1) send_item(target, hpot_slot, hpot_needed);
        if (mpot_needed > 0 && mpot_slot !== -1) send_item(target, mpot_slot, mpot_needed);
        if ((hpot_needed > 0 && hpot_slot === -1) || (mpot_needed > 0 && mpot_slot === -1)) {
            log(`⚠️ Not enough potions in inventory to deliver to ${name}`);
        }
        log(`🧪 Delivered potions to ${name}`);
 
    } catch (e) {
        catcher(e, "Potion Delivery Loop error");
    }
}

async function loot_collection_loop(name, info) {

    try {
        // Request loot from the target
        send_cm(name, { type: "send_loot" });
        game_log(`📦 Requested loot from ${name}`);
        await delay(4000);
        log(`💰 Collected loot from ${name}`);

    } catch (e) {
        catcher(e, "Loot Collection Loop error");
    }
}

async function move_to_party_member(name, info, radius = DELIVERY_RADIUS) {
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    let tx = info.x, ty = info.y, tmap = info.map;

    // Start moving toward the target (do not await)
    log(`🚶 Moving to ${name} at (${tx}, ${ty}) on map ${tmap}`);
    smarter_move({ map: tmap, x: tx, y: ty });
    await delay(10000); // Initial delay to start movement

    while (true) {
        // Timeout check
        if (Date.now() - startTime > TIMEOUT_MS) {
            log(`⏰ Timeout moving to ${name}. Returning home and removing from cache.`);
            delete party_status_cache[name];
            if (character.moving) halt_movement();
            await smarter_move(HOME);
            return;
        }

        if (info) {
            // If map changed, restart smarter_move
            if (tmap !== info.map || tx !== info.x || ty !== info.y) {
                tmap = info.map;
                tx = info.x;
                ty = info.y;
                if (character.moving || smart.moving) stop();
                log(`🔄 ${name} moved, updating target location to (${tx}, ${ty}) on map ${tmap}`);
                smarter_move({ map: tmap, x: tx, y: ty });
                await delay(5000)
            } else {
                tx = info.x;
                ty = info.y;
            }
        }

        // Calculate distance
        let dist = Math.hypot(character.x - tx, character.y - ty);

        // Only halt and exit if on the correct map and within radius
        if (character.map === tmap && dist <= radius) {
            if (smart.moving) stop();
            break;
        }

        await delay(200);
    }
}

async function potions_and_loot_controller_loop() {

    for (const name of PARTY) {
        const info = party_status_cache[name];
        if (!info || !info.map || typeof info.x !== "number" || typeof info.y !== "number") {
            game_log(`⚠️ Invalid location info for ${name}, skipping.`);
            delete party_status_cache[name];
            continue;
        }
        try {
            await move_to_party_member(name, info, DELIVERY_RADIUS);
            await potion_delivery_loop(name, info);
            await delay(500);
            await loot_collection_loop(name, info);
            await delay(500);

            // Clean up after delivery
            delete party_status_cache[name];
            await smarter_move(HOME);
            await delay(500);
            await sell_and_bank();
            await delay(500);
            await buy_pots();
            await delay(500);
            merchant_task = "Idle";
        } catch (e) {
            game_log(`Error processing delivery for ${name}: ${e.message}`);
            merchant_task = "Idle";
            delete party_status_cache[name];
        }
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SELL AND BANK ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = ["hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap", "cclaw", "crabclaw", "slimestaff", "stinger", "coat1", "helmet1",
		       			"gloves1", "pants1", "mushroomstaff", "wbreeches", "shoes1", "vitring", "helmet", "shoes", "gloves", "pmace", "throwingstars", "t2bow",
						 "spear", "dagger", "rapier", "sword", "rfangs", "gphelmet", "phelmet", "vitearring", "vitscroll", "pstem", "gslime", "hhelmet", "harmor", "hpants",
                        "hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring", "strbelt", "warmscarf", "snowball", "santasbelt",
                        "dexbelt", "intbelt", "pants", "lantern", "pclaw", "broom", "skullamulet", "iceskates", "carrot", "snowball", "xmace", "candycanesword",
                        "ornamentstaff", "merry", "rednose", "xmashat", "xmasshoes", "xmassweater", "xmaspants", "mittens", "angelwings"];
const BANKABLE_ITEMS = [];
const BANK_LOCATION = { map: "bank", x: 0, y: -37 };

async function sell_and_bank() {
	// Only run when not moving
	if (character.moving) return;

	// === SELLING ===
	// Move to vendor
	await smarter_move(HOME);
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
	await smarter_move(BANK_LOCATION);
	await delay(1000);

	for (let i = 3; i < character.items.length; i++) {
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
	await smarter_move(HOME);
	await delay(1000);
	game_log("🏠 Returned home after banking.");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUY HP AND MP POTIONS
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
// FISHING LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

function check_fishing_rod_and_pickaxe() {
    let has_rod = false;
    let has_pickaxe = false;

    // Check if fishing rod is equipped or in inventory
    has_rod =
        (character.slots.mainhand && character.slots.mainhand.name === "rod") ||
        character.items.some(item => item && item.name === "rod");

    // Check if pickaxe is equipped or in inventory
    has_pickaxe =
        (character.slots.mainhand && character.slots.mainhand.name === "pickaxe") ||
        character.items.some(item => item && item.name === "pickaxe");

    return { has_rod, has_pickaxe };
}

async function fishing_loop() {
    const FISHING_SPOT = { map: "main", x: -1116, y: -285 };
    const FISHING_TIME = 9000;
    const POSITION_TOLERANCE = 5;

    LOOP_STATES.fishing = true;

    try {
        while (LOOP_STATES.fishing) {
            try {
                // 1. Check if rod is equipped in mainhand, if not try to equip from inventory
                let rodEquipped = character.slots.mainhand && character.slots.mainhand.name === "rod";
                if (!rodEquipped) {
                    try {
                        const rodIndex = character.items.findIndex(item => item && item.name === "rod");
                        if (rodIndex !== -1) {
                            await equip(rodIndex, "mainhand");
                            await delay(400);
                            rodEquipped = character.slots.mainhand && character.slots.mainhand.name === "rod";
                        }
                    } catch (e) {
                        game_log("Error equipping rod: " + e.message);
                    }
                }

                // 2. If no rod, return
                if (!rodEquipped) {
                    game_log("❌ No fishing rod equipped or in inventory.");
                    stop_fishing_loop();
                    merchant_task = "Idle";
                    return;
                }

                // 3. Set merchant_task to Fishing
                merchant_task = "Fishing";

                // 4. smarter_move to FISHING SPOT
                try {
                    if (character.map !== FISHING_SPOT.map ||
                        Math.hypot(character.x - FISHING_SPOT.x, character.y - FISHING_SPOT.y) > POSITION_TOLERANCE) {
                        await smarter_move(FISHING_SPOT);
                    }
                } catch (e) {
                    game_log("Error moving to fishing spot: " + e.message);
                    merchant_task = "Idle";
                    return;
                }

                // 5. Begin fishing loop
                while (!is_on_cooldown("fishing")) {
                    // 5a. Check if rod is equipped
                    if (!character.slots.mainhand || character.slots.mainhand.name !== "rod") {
                        game_log("❌ Fishing rod not equipped, stopping fishing.");
                        break;
                    }
                    // 6. Check if at FISHING SPOT
                    if (character.map !== FISHING_SPOT.map ||
                        Math.hypot(character.x - FISHING_SPOT.x, character.y - FISHING_SPOT.y) > POSITION_TOLERANCE) {
                        game_log("❌ Not at fishing spot, stopping fishing.");
                        break;
                    }
                    // 7. Check if inventory is full
                    if (character.items.filter(Boolean).length >= character.items.length) {
                        game_log("📦 Inventory full, stopping fishing.");
                        break;
                    }
                    // 8. Use skill "fishing"
                    try {
                        use_skill("fishing");
                    } catch (e) {
                        game_log("Error using fishing skill: " + e.message);
                        break;
                    }
                    // 9. Wait FISHING_TIME
                    await delay(FISHING_TIME);
                }

                // 11. Once fishing is finished (is on cooldown), smarter_move HOME
                try {
                    await smarter_move(HOME);
                } catch (e) {
                    game_log("Error moving home after fishing: " + e.message);
                }
                merchant_task = "Idle";
                // End the fishing loop after one session
                LOOP_STATES.fishing = false;
            } catch (e) {
                game_log("Fishing loop error: " + e.message);
                merchant_task = "Idle";
                LOOP_STATES.fishing = false;
            }
        }
    } catch (e) {
        game_log("Fishing loop fatal error: " + e.message);
        merchant_task = "Idle";
        LOOP_STATES.fishing = false;
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MINING LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function mining_loop() {
    const MINING_SPOT = { map: "tunnel", x: 244, y: -153 };
    const POSITION_TOLERANCE = 10;

    LOOP_STATES.mining = true;

    try {
        while (LOOP_STATES.mining) {
            try {
                // 1. Check if pickaxe is equipped in mainhand, if not try to equip from inventory
                let pickaxeEquipped = character.slots.mainhand && character.slots.mainhand.name === "pickaxe";
                if (!pickaxeEquipped) {
                    try {
                        const pickaxeIndex = character.items.findIndex(item => item && item.name === "pickaxe");
                        if (pickaxeIndex !== -1) {
                            await equip(pickaxeIndex, "mainhand");
                            await delay(400);
                            pickaxeEquipped = character.slots.mainhand && character.slots.mainhand.name === "pickaxe";
                        }
                    } catch (e) {
                        game_log("Error equipping pickaxe: " + e.message);
                    }
                }

                // 2. If no pickaxe, return
                if (!pickaxeEquipped) {
                    game_log("❌ No pickaxe equipped or in inventory.");
                    merchant_task = "Idle";
                    stop_mining_loop();
                    return;
                }

                // 3. Set merchant_task to Mining
                merchant_task = "Mining";

                // 4. smarter_move to MINING SPOT
                try {
                    if (character.map !== MINING_SPOT.map ||
                        Math.hypot(character.x - MINING_SPOT.x, character.y - MINING_SPOT.y) > POSITION_TOLERANCE) {
                        await smarter_move(MINING_SPOT);
                    }
                } catch (e) {
                    game_log("Error moving to mining spot: " + e.message);
                    merchant_task = "Idle";
                    return;
                }

                // 5. Begin mining loop
                while (!is_on_cooldown("mining")) {
                    // 5a. Check if pickaxe is equipped
                    if (!character.slots.mainhand || character.slots.mainhand.name !== "pickaxe") {
                        game_log("❌ Pickaxe not equipped, stopping mining.");
                        break;
                    }
                    // 6. Check if at MINING SPOT
                    if (character.map !== MINING_SPOT.map ||
                        Math.hypot(character.x - MINING_SPOT.x, character.y - MINING_SPOT.y) > POSITION_TOLERANCE) {
                        game_log("❌ Not at mining spot, stopping mining.");
                        break;
                    }
                    // 7. Check if inventory is full
                    if (character.items.filter(Boolean).length >= character.items.length) {
                        game_log("📦 Inventory full, stopping mining.");
                        break;
                    }
                    // 8. Use skill "mining"
                    try {
                        use_skill("mining");
                    } catch (e) {
                        game_log("Error using mining skill: " + e.message);
                        break;
                    }
                    // 9. Wait for mining animation/cooldown (default 4000ms)
                    await delay(4000);
                }

                // 11. Once mining is finished (is on cooldown), smarter_move HOME
                try {
                    await smarter_move(HOME);
                } catch (e) {
                    game_log("Error moving home after mining: " + e.message);
                }
                merchant_task = "Idle";
                // End the mining loop after one session
                LOOP_STATES.mining = false;
            } catch (e) {
                game_log("Mining loop error: " + e.message);
                merchant_task = "Idle";
                LOOP_STATES.mining = false;
            }
        }
    } catch (e) {
        game_log("Mining loop fatal error: " + e.message);
        merchant_task = "Idle";
        LOOP_STATES.mining = false;
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EXCHANGE ITEMS FOR LOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

let exchange_items_running = false;

const EXCHANGE_LIST= [
    { name: "mistletoe",    min: 1 },
    { name: "xbox",         min: 1 },
    { name: "candy1",       min: 1 },
    { name: "gem0",         min: 1 },
    { name: "gem1",         min: 1 },
    { name: "armorbox",     min: 1 },
    // { name: "seashell",     min: 20,    map: "main", x: -22, y: -406 },
]

async function exchange_items() {
    if (exchange_items_running) {
        log("⚠️ Exchange already running, skipping duplicate call.");
        return;
    }

    exchange_items_running = true;
    merchant_task = "Exchanging";

    try {
        // Find the first item in EXCHANGE_LIST that you have
        let item_name = null;
        let item_slot = -1;
        for (const config of EXCHANGE_LIST) {
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

        // If not found, try to withdraw from bank
        if (item_slot === -1) {
            log(`No exchangeable items found, attempting to withdraw from bank...`, "#888");
            await smarter_move(BANK_LOCATION);
            await delay(500);

            // Only withdraw the first available item in the bank
            let withdrew = false;
            for (const item of EXCHANGE_LIST) {
                try {
                    withdraw_item(item.name, null, 9999);
                    await delay(500);
                    // Search inventory again for the item after withdrawal
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
                    log(`Error withdrawing ${item.name} from bank: ${e.message}`);
                }
                if (withdrew) break; // Stop after first successful withdrawal
            }

            // If still no valid items, go home and exit
            if (item_slot === -1) {
                log(`No valid items to exchange after bank withdrawal, returning home.`, "#888");
                await smarter_move(HOME);
                exchange_items_running = false;
                merchant_task = "Idle";
                return;
            }
        }

        // Get the config for the item we have
        const item_config = EXCHANGE_LIST.find(cfg => cfg.name === item_name);
        const { min: min_count, map: target_map, x: target_x, y: target_y } = item_config || {};
        const exchange_location = target_map && typeof target_x === "number" && typeof target_y === "number"
            ? { map: target_map, x: target_x, y: target_y }
            : HOME;

        // Move to the exchange location if not already there
        await smarter_move(HOME);
        await delay(500);

        log(`📍 At exchange location for ${item_name}. Starting exchange...`);

        // Exchange loop for this item type
        let keep_going = true;
        while (keep_going) {
            // Stop if not at exchange location
            if (character.map !== HOME.map ||
                character.x !== HOME.x ||
                character.y !== HOME.y) {
                log(`❌ Not at exchange location. Stopping.`);
                keep_going = false;
                break;
            }

            // Sell approved items
            for (let i = 0; i < character.items.length; i++) {
                const itm = character.items[i];
                if (itm && SELLABLE_ITEMS.includes(itm.name)) {
                    sell(i, itm.q || 1);
                    log(`💰 Sold ${itm.name} x${itm.q || 1}`);
                }
            }

            // Inventory full handling
            if (character.items.filter(Boolean).length >= character.items.length) {
                log(`📦 Inventory full. Running sell_and_bank for ${item_name}.`);
                await sell_and_bank();
                await delay(200);
                // Return to exchange location
                await smarter_move(HOME);
                await delay(200);
                continue;
            }

            // Find a stack that meets the minimum count
            let found_stack = false;
            for (let i = 0; i < character.items.length; i++) {
                const itm = character.items[i];
                if (itm && itm.name === item_name && (itm.q || 1) >= min_count) {
                    // Exchange
                    try {
                        log(`🔁 Exchanging slot ${i} (${item_name} x${itm.q || 1})`);
                        if (!character.q.exchange) {
                            use_skill("massexchange");
                        }
                        exchange(i);
                        found_stack = true;
                        // Only delay after a successful exchange
                        await delay(50);
                    } catch (e) {
                        log(`Error exchanging ${item_name}: ${e.message}`);
                        keep_going = false;
                        break;
                    }
                    break;
                }
            }

            if (!found_stack) {
                log(`✅ No more ${item_name} stacks with at least ${min_count}.`);
                keep_going = false;
                // Short delay to avoid tight loop at end
                await delay(50);
            }
        }

        log(`Finished exchanging all ${item_name}`, "#00ff00");
        log("✅ Exchange process complete", "#00ff00");
    } catch (e) {
        log(`🔥 exchange_items error: ${e.message}`);
    } finally {
        exchange_items_running = false;
        merchant_task = "Idle";
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADE ARMOUR
// --------------------------------------------------------------------------------------------------------------------------------- //

async function target_upgrade(target_item, target_amount) {
    const TARGET_MAP = "main";
    const XLOC = -209;
    const YLOC = -117;

    await smarter_move({ map: TARGET_MAP, x: XLOC, y: YLOC });

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

async function pouchbow_upgrade() {
    // Move to bank
    await smarter_move(BANK_LOCATION);

    // Withdraw "smoke" until we have at least 25 in inventory
    let smoke_slot = -1;
    let smoke_qty = 0;
    let smoke_attempts = 0;
    const MAX_ATTEMPTS = 5;

    while (smoke_qty < 25 && smoke_attempts < MAX_ATTEMPTS) {
        try {
            await withdraw_item("essenceoffire");
            await delay(200);
        } catch (e) {
            game_log("⚠️ Could not withdraw 'smoke': " + e.message, "#FF0000");
        }
        smoke_slot = character.items.findIndex(itm => itm && itm.name === "essenceoffire");
        smoke_qty = smoke_slot !== -1 ? (character.items[smoke_slot].q || 1) : 0;
        smoke_attempts++;
    }

    if (smoke_qty < 25) {
        game_log("❌ Not enough 'smoke' in inventory after multiple attempts. Aborting pouchbow upgrade.", "#FF0000");
        return;
    }

    // Move home
    await smarter_move(HOME);

    // Buy 25 "bow"
    for (let i = 0; i < 25; i++) {
        await parent.buy("staff");
        await delay(50); // Small delay to avoid flooding
    }

    // Move to main, 5, 419
    await smarter_move({ map: "main", x: 5, y: 419 });

    // Auto-craft pouchbow 25 times with 100ms delay between each
    for (let i = 0; i < 25; i++) {
        await auto_craft("firestaff");
        await delay(50);
    }

    // Move home
    await smarter_move(HOME);

    // Set state to UPGRADING
    set_state(MERCHANT_STATES.UPGRADING);
}

async function coat_upgrade() {

    // Move home
    await smarter_move(HOME);

    // Buy 25 "coat"
    for (let i = 0; i < 25; i++) {
        await parent.buy("coat");
        await delay(50); // Small delay to avoid flooding
    }

    async function short_upgrade() {

        // --- Upgrade all items level-by-level ---
        let upgraded = true;
        for (let level = 0; level <= 10; level++) {
            upgraded = false;
            while (true) {
                const result = await auto_upgrade_item(level);
                if (result === "done" || result === "wait") {
                    upgraded = true;
                    await delay(UPGRADE_INTERVAL);
                } else if (result === "end") {
                    // Stop all upgrading if "end" is returned (e.g., not enough gold)
                    game_log("❌ Ending auto-upgrade early due to insufficient gold or resources.");
                    break;
                } else {
                    break;
                }
            }
        }
    }

    await short_upgrade();

    game_log("✅ Auto upgrade and combine complete.");
    await delay(5000);
    await sell_and_bank();
    merchant_task = "Idle";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MLuck Buff Function
// --------------------------------------------------------------------------------------------------------------------------------- //



async function mluck_buff() {
    log("✨ Attempting to cast MLuck buff on party members...");
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const now = Date.now();
    if (now - last_mluck_time < THIRTY_MINUTES) {
        log("Failed");
        return;
    }

    // Request Myras' location via CM
    let myras_location = null;
    let responded = false;

    function handle_location_response(name, data) {
        if (name === "Myras" && data && data.type === "my_location") {
            myras_location = { map: data.map, x: data.x, y: data.y };
            responded = true;
        }
    }
    add_cm_listener(handle_location_response);
    send_cm("Myras", { type: "where_are_you" });

    // Wait up to 2 seconds for response
    for (let i = 0; i < 20; i++) {
        if (responded) break;
        await delay(100);
    }
    remove_cm_listener(handle_location_response);

    if (!myras_location || !myras_location.map || typeof myras_location.x !== "number" || typeof myras_location.y !== "number") {
        log("❌ Could not get Myras' location via CM. Aborting MLuck buff.", "#ff0000");
        return;
    }

    // Move to Myras' location
    await smarter_move(myras_location);
    await delay(200);

    // Try to cast mluck on each target
    const targets = ["Myras", "Ulric", "Riva"];
    log(`🎯 Attempting to cast MLuck on: ${targets.join(", ")}`);
    for (const name of targets) {
        const player = get_player(name);
        if (player && !player.rip && can_use("mluck") && !is_on_cooldown("mluck")) {
            change_target(player);
            await delay(100);
            use_skill("mluck", player);
            await delay(1000); // Small delay to ensure cast
        }
    }

    // Move home (assume HOME is defined globally)
    await smarter_move(HOME);

    last_mluck_time = Date.now();
}

