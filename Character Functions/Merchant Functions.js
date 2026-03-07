
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
let last_loop_time = 0;

function should_run_auto_upgrade() {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    return (Date.now() - last_auto_upgrade_time) > THIRTY_MINUTES;
}

function should_run_loop() {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    return (Date.now() - last_loop_time) > THIRTY_MINUTES;
}

function get_character_state() {
    const now = Date.now();
    // if (character.rip) return MERCHANT_STATES.DEAD;
    // if (panicking) return MERCHANT_STATES.PANIC;
    if (should_run_loop()) return MERCHANT_STATES.DELIVERING;
    if (merchant_task !== "Delivering" && should_run_auto_upgrade()) return MERCHANT_STATES.UPGRADING;
    // if (merchant_task === "Idle" && (Date.now() - last_exchange_time) > (1 * 60 * 1000)) return MERCHANT_STATES.EXCHANGING;
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
                        // DEAD state logic here
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
                    // DELIVERING state logic here
                    if (merchant_task !== "Delivering") {
                        log("Beginning potions / loot / buffing run...");
                        merchant_task = "Delivering";
                        await move_to_character("Myras");
                        await delay(1000);
                        await smarter_move(HOME);
                        last_loop_time = Date.now();
                        merchant_task = "Idle";
                    }
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
                        await auto_upgrade();
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
// SUPPORTING FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Returns true if any party member is within 200 units
function any_party_within_200() {
    for (const name of PARTY) {
        const player = get_player(name);
        if (
            player &&
            !player.rip &&
            player.map === character.map &&
            Math.hypot(character.x - player.x, character.y - player.y) <= 200
        ) {
            return true;
        }
    }
    return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUY POTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function buy_potion_loop() {
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
// POTION DELIVERY LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potion_delivery_loop() {
    const PARTY = ["Myras", "Ulric", "Riva"];
    const POTION_CAP = 5000;
    const POT_TYPES = ["mpot1", "hpot1"];
    const COOLDOWN = 60000; // 60 seconds
    let last_delivery_time = 0;
    while (true) {
        const now = Date.now();
        // Only deliver if 60s have passed since last delivery
        if (now - last_delivery_time < COOLDOWN) {
            await delay(500);
            continue;
        }

        if (!any_party_within_200()) {
            await delay(500);
            continue;
        }

        for (const name of PARTY) {
            try {
                const player = get_player(name);
                if (!player || player.rip || character.map !== player.map || Math.hypot(character.x - player.x, character.y - player.y) > 350) {
                    continue;
                }

                // Helper to request status_update and wait for response, scoped per name
                async function request_status_update(target_name) {
                    return new Promise((resolve) => {
                        let responded = false;
                        let status = null;
                        function handle_status_update(n, data) {
                            if (n === target_name && data && data.type === "status_update" && data.data) {
                                status = data.data;
                                responded = true;
                            }
                        }
                        add_cm_listener(handle_status_update);
                        send_cm(target_name, { type: "status_update_request" });
                        // Wait up to 2s for response
                        let waited = 0;
                        (async function waitLoop() {
                            while (!responded && waited < 2000) {
                                await delay(100);
                                waited += 100;
                            }
                            remove_cm_listener(handle_status_update);
                            resolve(status);
                        })();
                    });
                }

                // Await the status update for this party member
                const status = await request_status_update(name);
                if (!status) {
                    continue;
                }

                // Deliver potions as needed
                let did_deliver = false;
                for (const pot of POT_TYPES) {
                    const have = status[pot] || 0;
                    const need = Math.max(0, Math.min(POTION_CAP - have, get_potion_count(pot)));
                    const slot = character.items.findIndex(item => item && item.name === pot);
                    if (slot !== -1 && need > 0) {
                        send_item(name, slot, need);
                        await delay(200);
                        did_deliver = true;
                    }
                }
            } catch (e) {
                log(`[potion_delivery_loop] Error: ${e.message}`);
            }
        }
        log(`Potions delivered.`, "limegreen");
        last_delivery_time = Date.now();
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
// LOOT COLLECTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function loot_collection_loop() {
    const COOLDOWN = 60000; // 60 seconds
    const PARTY = ["Myras", "Ulric", "Riva"];
    let last_loot_time = 0;
    while (true) {
        const now = Date.now();
        if (now - last_loot_time < COOLDOWN) {
            await delay(500);
            continue;
        }

        if (!any_party_within_200()) {
            await delay(500);
            continue;
        }

        for (const name of PARTY) {
            try {
                const player = get_player(name);
                if (!player || player.rip || character.map !== player.map || Math.hypot(character.x - player.x, character.y - player.y) > 350) {
                    continue;
                }
                send_cm(name, { type: "send_loot" });
                await delay(200);
            } catch (e) {
                catcher(e, "Loot Collection Loop error");
            }
        }
        log("Loot collected.", "limegreen");
        last_loot_time = Date.now();
        
        await delay(500);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MLUCK BUFF LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function mluck_buff_loop() {
    const COOLDOWN = 60000; // 60 seconds
    const PARTY = ["Myras", "Ulric", "Riva"];
    let last_buff_time = 0;
    while (true) {
        const now = Date.now();
        if (now - last_buff_time < COOLDOWN) {
            await delay(500);
            continue;
        }

        if (!any_party_within_200()) {
            await delay(500);
            continue;
        }

        try {
            // Try to cast mluck on each target if within 200 units
            for (const name of PARTY) {
                const player = get_player(name);
                if (!player || player.rip || character.map !== player.map || Math.hypot(character.x - player.x, character.y - player.y) > 350) {
                    continue;
                }
                change_target(player);
                await delay(100);
                use_skill("mluck", player);
                await delay(200); // Small delay to ensure cast
            }
        } catch (e) {
            log(`[mluck_buff_loop] Error: ${e.message}`);
            last_buff_time = Date.now();
        }
        log(`Cast MLuck.`, "limegreen");
        last_buff_time = Date.now();
        await delay(500);
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
                            await use_skill("massexchange");
                        }
                        await exchange(i);
                        found_stack = true;
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
