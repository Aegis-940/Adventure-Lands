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
	const now = Date.now();

	if (!attack_mode || character.rip || smart.moving) return;

	// Utility logic
	pots();
	loot();
	party_manager();
	check_and_request_pots();

	var target=get_targeted_monster();
		if(!target)
		{
			target=get_nearest_monster();
			if(target) change_target(target);
			else
			{
				set_message("No Monsters");
				return;
			}
		}
	

	// Move or attack
	if (!is_in_range(target)) {
		if (!is_moving(character)) {
			move(
				character.x + (target.x - character.x) / 2,
				character.y + (target.y - character.y) / 2
			);
		}
	} else if (
		character.ctype === "warrior" &&
		can_use("cleave") &&
		is_in_range(target, "cleave")
	) {
		use_skill("cleave", target);
	} else if (can_attack(target)) {
		set_message("Attacking");
		attack(target);
	}
}, 250);
