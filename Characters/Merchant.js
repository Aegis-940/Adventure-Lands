// -------------------------------------------------------------------- //
// TASK QUEUE
// -------------------------------------------------------------------- //

function enqueue_merchant_task(taskFn) {
	MERCHANT_TASK_QUEUE.push(taskFn);
	process_merchant_queue();
}

async function process_merchant_queue() {
	if (merchant_busy || MERCHANT_TASK_QUEUE.length === 0) return;

	merchant_busy = true;

	const task = MERCHANT_TASK_QUEUE.shift();
	try {
		await task(); // Run the task
	} catch (e) {
		console.error("❌ Merchant task error:", e);
	}
	
	merchant_busy = false;
	process_merchant_queue(); // Continue with the next task
}

// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //

removeAllFloatingButtons();

removeAllFloatingStatsWindows();

createMapMovementWindow([
  { id: "SellBank", label: "Sell / Bank", onClick: () => sell_and_bank() },
  { id: "CollectLoot", label: "Take Loot", onClick: () => check_remote_inventories()  },
  { id: "GoFish", label: "Go Fish", onClick: () => go_fish() },
  { id: "custom4", label: "Custom 4", onClick: () => null },
  { id: "custom5", label: "Custom 5", onClick: () => null },
  { id: "custom6", label: "Custom 6", onClick: () => null }
]);

toggle_inventory_check();

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
