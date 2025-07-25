
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
