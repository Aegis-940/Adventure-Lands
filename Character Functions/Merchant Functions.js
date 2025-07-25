
// -------------------------------------------------------------------- //
// MERCHANT ACTIVITY QUEUE SYSTEM
// -------------------------------------------------------------------- //

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

// -------------------------------------------------------------------- //
// MERCHANT SELL AND BANK ITEMS
// -------------------------------------------------------------------- //

const SELLABLE_ITEMS = ["hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap", "cclaw", "crabclaw", "slimestaff", "stinger", "coat1", "helmet1"];
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

// -------------------------------------------------------------------- //
// MERCHANT BUY POTS FOR DISTRIBUTION
// -------------------------------------------------------------------- //

// Global cooldown tracker
let last_buy_time = 0;

function buy_pots() {
    const MAX_POTS      = 9999;
    const POT_TYPES     = ["hpot1", "mpot1"];
    const TARGET_MAP    = "main";
    const TARGET_X      = -36;
    const TARGET_Y      = -153;
    const RANGE         = 300;
    const COOLDOWN      = 2000;

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

// -------------------------------------------------------------------- //
// CHECK FOR LOOT AND TRANSFER
// -------------------------------------------------------------------- //

const INVENTORY_QUEUE       = ["Ulric", "Myras", "Riva"];
let currently_processing    = false;
const INVENTORY_THRESHOLD  = 15;
const SELLING_LOCATION     = { map: "main", x: -20, y: -100 };

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let inventory_lock_timestamp    = 0;
const INVENTORY_LOCK_DURATION  = 5000; // 5 seconds max lock

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
