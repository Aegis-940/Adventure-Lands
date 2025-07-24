
// -------------------------------------------------------------------- //
// TASK QUEUE
// -------------------------------------------------------------------- //

function enqueueMerchantTask(taskFn) {
	merchantTaskQueue.push(taskFn);
	processMerchantQueue();
}

async function processMerchantQueue() {
	if (merchantBusy || merchantTaskQueue.length === 0) return;

	merchantBusy = true;

	const task = merchantTaskQueue.shift();
	try {
		await task(); // Run the task
	} catch (e) {
		console.error("❌ Merchant task error:", e);
	}
	
	merchantBusy = false;
	processMerchantQueue(); // Continue with the next task
}

// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //

removeAllFloatingButtons();

removeAllFloatingStatsWindows();

createMapMovementWindow([
  { id: "SellBank", label: "Sell / Bank", onClick: () => sell_and_bank() },
  { id: "CollectLoot", label: "Take Loot", onClick: () => checkRemoteInventories(),  },
  { id: "GoFish", label: "Go Fish", onClick: () => goFish() },
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
	if (now - lastInventoryCheck >= INVENTORY_CHECK_INTERVAL) {
		lastInventoryCheck = now;
		game_log("*** Checking for loot ***")
		checkRemoteInventories();
	}
	
	// Detect death and record time
	if (character.rip && lastDeathTime === 0) {
		lastDeathTime = Date.now();
	}

	// Revive after 30 seconds
	if (character.rip && Date.now() - lastDeathTime >= 30000) {
		respawn();
		lastDeathTime = 0;
	}

	// Reset if revived manually
	if (!character.rip && lastDeathTime !== 0) {
		lastDeathTime = 0;
	}

    pots();
	buy_pots();
	party_manager();
	
}, 250);
