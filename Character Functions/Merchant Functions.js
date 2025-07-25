
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
