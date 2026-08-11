
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

remove_all_floating_stats_windows();
remove_all_floating_buttons();

create_map_movement_window([
	{ id: "SellBank", label: "Sell / Bank", on_click: () => sell_and_bank() },
	{ id: "custom3", label: "Custom 3", on_click: () => null },
	{ id: "custom4", label: "Custom 4", on_click: () => null },
	{ id: "custom5", label: "Custom 5", on_click: () => null },
	{ id: "custom6", label: "Custom 6", on_click: () => null }
]);

add_bank_buttons();
hide_skills_ui();

// Resting loadout (CONFIG.default_gear) — loop_controller()'s fishing/mining states
// swap to a rod/pickaxe only right at the spot and restore this the moment they end.
equip_default_gear();

// Passive loops — no travel, safe to run alongside loop_controller()'s state machine.
buy_potion_loop();
mluck_buff_loop();
loot_collection_loop();
potion_loop(); // shared self-use loop from Shared/Common_Functions.js
// Keeps Riff's own localStorage state cache fresh so the fighters can read it too —
// see Shared/Common_Functions.js's state_cache_loop()/read_state_cache().
state_cache_loop();

loop_controller(); // sole owner of movement — see Character_Functions/Merchant_Functions.js

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

