
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

remove_all_floating_stats_windows();
remove_all_floating_buttons();

create_map_movement_window([
	{ id: "SendToMerchant", label: "Deposit", on_click: () => send_to_merchant() },
	{ id: "custom2", label: "Custom 2", on_click: () => null },
	{ id: "custom3", label: "Custom 3", on_click: () => null },
	{ id: "custom4", label: "Custom 4", on_click: () => null },
	{ id: "custom5", label: "Custom 5", on_click: () => null },
	{ id: "custom6", label: "Custom 6", on_click: () => null }
]);

hide_skills_ui();
create_custom_log_window();

// Keeps this character's localStorage state cache fresh (hp/mp/gold/position/free
// slots/conditions/etc.) so any other character can read it directly — see
// Shared/Common_Functions.js's state_cache_loop()/read_state_cache().
state_cache_loop();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

// Ranger_Functions.js already runs its own 20s send_updates interval.
