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
	{ id: "SendToMerchant", label: "Deposit", onClick: () => send_to_merchant() },
	{ id: "custom2", label: "Custom 2", onClick: () => null },
	{ id: "custom3", label: "Custom 3", onClick: () => null },
	{ id: "custom4", label: "Custom 4", onClick: () => null },
	{ id: "custom5", label: "Custom 5", onClick: () => null },
	{ id: "custom6", label: "Custom 6", onClick: () => null }
]);

toggle_combat();
toggle_tank_role();
toggle_follow_tank();
toggle_free_move();
hide_skills_ui();
// toggle_stats_window();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

setInterval(() => {

	// === Core utility loops ===
	pots();
	loot();
	party_manager();
	check_and_request_pots();

	if (!attack_mode || character.rip || is_moving(character)) return;

}, 250);
