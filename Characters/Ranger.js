// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //

// init_persistent_state();

// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //

remove_all_floating_stats_windows();
remove_all_floating_buttons();

create_team_stats_window();
hook_gold_tracking_to_stats_window("teamStatsWindow");
hook_dps_tracking_to_stats_window("teamStatsWindow");

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
// toggle_stats_window();

// -------------------------------------------------------------------- //
// MAIN LOOP
// -------------------------------------------------------------------- //

setInterval(function () {
	if (!attack_mode || character.rip || is_moving(character)) return;

	pots();
	loot_items();
	manage_party();
	check_and_request_pots();
	fight_solo_or_group(group_or_solo_button_title);

	const leader = parent.entities[PARTY_LEADER];

	if (!fight_as_a_team) {
		// === Attack Own Target === //
		let target = get_targeted_monster();
		if (!target || target.rip || !parent.entities[target.id]) {
			target = get_monster_by_type_array(MONSTER_TYPES, 300);
			if (target) {
				change_target(target);
			} else {
				set_message("No Monsters");
				return;
			}
		}

		if (!is_in_range(target)) {
			if (!is_moving(character)) {
				move(
					character.x + (target.x - character.x) / 2,
					character.y + (target.y - character.y) / 2
				);
			}
		} else if (character.ctype === "ranger" && can_use("3shot") && is_in_range(target, "3shot")) {
			use_skill("3shot", target);
		} else if (can_attack(target)) {
			set_message("Attacking");
			attack(target);
		}
	}

	if (fight_as_a_team) {
		const distance_from_leader = simple_distance(character, leader);

		if (distance_from_leader > FOLLOW_DISTANCE) {
			const target_x = character.x + (leader.x - character.x) / 2;
			const target_y = character.y + (leader.y - character.y) / 2;

			change_target(null);

			if (can_move_to(target_x, target_y)) {
				move(target_x, target_y);
			} else if (!smart.moving && !character.moving) {
				smart_move({ x: leader.x, y: leader.y });
			}

			return;
		}

		const is_tank = character.name === tank_name;
		const tank = is_tank ? character : parent.entities[tank_name];

		if (!tank || tank.rip) {
			set_message("No Tank");
			return;
		}

		let target;
		if (is_tank) {
			target = get_targeted_monster();
			if (!target || target.rip) {
				const found = get_monster_by_type_array(MONSTER_TYPES, 200);
				if (found) {
					change_target(found);
					target = found;
				}
			}
		} else if (tank.target) {
			target = parent.entities[tank.target];
		}

		if (!target || target.rip) {
			set_message("No Monsters");
			return;
		}

		if (!is_tank && fight_as_a_team === true) {
			const tank_engaged = tank.target === target.id;
			const monster_aggroed = target.target === tank_name;

			if (!tank_engaged || !monster_aggroed) {
				set_message("No Aggro");
				return;
			}
		}

		if (!is_in_range(target)) {
			if (!is_moving(character) && free_move) {
				move(
					character.x + (target.x - character.x) / 2,
					character.y + (target.y - character.y) / 2
				);
			}
		} else if (can_attack(target)) {
			set_message("Attacking");
			attack(target);
		}
	}
}, 150);
