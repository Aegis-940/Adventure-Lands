
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

remove_all_floating_stats_windows();
remove_all_floating_buttons();

create_map_movement_window([
	{ id: "SellBank", label: "Sell / Bank", on_click: () => sell_and_bank() },
	{ id: "CollectLoot", label: "Take Loot", on_click: () => check_remote_inventories()  },
	{ id: "GoFish", label: "Go Fish", on_click: () => go_fish() },
	{ id: "GoMine", label: "Go Mine", on_click: () => go_mine() },
	{ id: "custom5", label: "Custom 5", on_click: () => null },
	{ id: "custom6", label: "Custom 6", on_click: () => null }
]);

add_bank_buttons();
hide_skills_ui();
buy_potion_loop()
mluck_buff_loop()
loot_collection_loop()
potion_loop()

loop_controller();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

setInterval(() => {
	
	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

	party_manager();

}, 1000); // Check every second

