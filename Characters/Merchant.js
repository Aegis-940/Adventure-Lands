// -------------------------------------------------------------------- //
// PERSISTENT STATE
// -------------------------------------------------------------------- //

//init_persistent_state();

// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //

remove_all_floating_stats_windows();
remove_all_floating_buttons();

create_map_movement_window([
  { id: "SellBank", label: "Sell / Bank", onClick: () => sell_and_bank() },
  { id: "CollectLoot", label: "Take Loot", onClick: () => check_remote_inventories()  },
  { id: "GoFish", label: "Go Fish", onClick: () => go_fish() },
  { id: "GoMine", label: "Go Mine", onClick: () => go_mine() },
  { id: "custom5", label: "Custom 5", onClick: () => null },
  { id: "custom6", label: "Custom 6", onClick: () => null }
]);

toggle_inventory_check();
hide_skills_ui();

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
// MAIN LOOP
// -------------------------------------------------------------------- //

setInterval(function () {
	
	const now = Date.now();
	if (now - last_inventory_check >= INVENTORY_CHECK_INTERVAL) {
		last_inventory_check = now;
		game_log("*** Checking for loot ***")
		check_remote_inventories();
	}
	
	// Detect death and record time
	if (character.rip && last_death_time === 0) {
		last_death_time = Date.now();
	}

	// Revive after 30 seconds
	if (character.rip && Date.now() - last_death_time >= 30000) {
		respawn();
		last_death_time = 0;
	}

	// Reset if revived manually
	if (!character.rip && last_death_time !== 0) {
		last_death_time = 0;
	}

	pots();
	buy_pots();
	party_manager();
	
}, 250);
