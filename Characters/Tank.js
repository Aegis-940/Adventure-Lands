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

	// TAUNT — pull aggro from monsters targeting allies
	if (
		taunt_mode &&
		can_use("taunt") &&
		!is_moving(character) &&
		tank_name === "Ulric"
	) {
		for (const id in parent.entities) {
			const e = parent.entities[id];
			if (
				e?.type === "monster" &&
				e.target &&
				e.target !== character.name &&
				is_in_party(e.target) &&
				is_in_range(e, "taunt")
			) {
				use_skill("taunt", e);
				break;
			}
		}
	}

	const is_tank = character.name === tank_name;
	const tank    = is_tank ? character : parent.entities[tank_name];

	if (!tank || tank.rip) {
		set_message("No Tank");
		return;
	}

	// Determine the target
	let target;

	if (is_tank) {
		target = get_targeted_monster();

		// Auto-acquire target if tank has none
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

	// If not the tank, ensure the tank has engaged and drawn aggro
	if (!is_tank) {
		const tank_engaged    = tank.target === target.id;
		const monster_aggroed = target.target === tank_name;

		if (!tank_engaged || !monster_aggroed) {
			set_message("No Aggro");
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
