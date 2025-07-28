// --------------------------------------------------------------------------------------------------------------------------------- //
// PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

//init_persistent_state();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

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

//toggle_inventory_check();
add_bank_buttons();
hide_skills_ui();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_check_inventories = 0;
const INVENTORY_CHECK_INTERVAL = 5 * 60000;  // every 5 mins
const POTION_DELIVERY_INTERVAL = 60000;
let last_potion_delivery_check = 0;

setInterval(async () => {
	const now = Date.now();

	// ─────────────────────────────────────
	// Priority 1: Check Potions & Deliver
	// ─────────────────────────────────────
	if (now - last_potion_delivery_check >= POTION_DELIVERY_INTERVAL) {
		last_potion_delivery_check = now;
		queue_merchant_action("[PRIORITY] Deliver Potions", async () => {
			await check_and_deliver_pots();
		});
	}
	
	// ─────────────────────────────────────
	// Priority 2: Check Remote Inventories
	// ─────────────────────────────────────
	if (now - last_check_inventories >= INVENTORY_CHECK_INTERVAL) {
		last_check_inventories = now;
		queue_merchant_action("[PRIORITY] Check Inventories", async () => {
			await check_remote_inventories();
		});
	}
	
	// ─────────────────────────────────────
	// Priority 3: Mine if Possible
	// ─────────────────────────────────────
	if (!is_on_cooldown("mining") && hasTool("pickaxe")) {
		queue_merchant_action("Go Mine", async () => {
			await go_mine();
		});
	}
	
	// ─────────────────────────────────────
	// Priority 4: Fish if Possible
	// ─────────────────────────────────────
	else if (!is_on_cooldown("fishing") && hasTool("rod")) {
		queue_merchant_action("Go Fish", async () => {
			await go_fish();
		});
	}

	// Other non-critical tasks could go here…

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

}, 1000); // Check every second

