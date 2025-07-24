// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //

var attack_mode = true;

const party_leader = "Ulric";

var fight_as_a_team = false;
let group_or_solo_button_title = "Solo";

const _cmListeners = [];

const floatingButtonIds = [];

let goldHistory = [];

load_code(99);
load_code(98);
load_code(97);

init_persistent_state();

// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //

removeAllFloatingStatsWindows();
removeAllFloatingButtons();

createTeamStatsWindow();
hookGoldTrackingToStatsWindow("teamStatsWindow");
hookDPSTrackingToStatsWindow("teamStatsWindow");

createMapMovementWindow([
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
//toggle_stats_window();

// -------------------------------------------------------------------- //
// MAIN LOOP
// -------------------------------------------------------------------- //

setInterval(function () {

	if (!attack_mode || character.rip || is_moving(character)) return;

	pots();
	loot();
	party_manager();
	check_and_request_pots();
	fight_solo_or_group(group_or_solo_button_title);

	const leader = parent.entities[party_leader];

	if (!fight_as_a_team) {

		// *** Attack Own Target *** //

		// Get current target or find a new one
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

		// If not in range, move toward the target (only if not already moving)
		if (!is_in_range(target)) {
			if (!is_moving(character)) {
				move(
					character.x + (target.x - character.x) / 2,
					character.y + (target.y - character.y) / 2
				);
			}
		} else if (character.ctype === "ranger" && can_use("3shot")) {
			if (is_in_range(target, "3shot")) {
				use_skill("3shot", target);
			}
		} else if (can_attack(target)) {
			set_message("Attacking");
			attack(target);
		}

	}

	if (fight_as_a_team) {

		const distance_from_leader = simple_distance(character, leader);

		if (distance_from_leader > follow_distance) {
			const targetX = character.x + (leader.x - character.x) / 2;
			const targetY = character.y + (leader.y - character.y) / 2;

			change_target(null);

			if (can_move_to(targetX, targetY)) {
				move(targetX, targetY);
			} else if (!smart.moving && !character.moving) {
				smart_move({ x: leader.x, y: leader.y });
			}

			return;
		}

		// *** Attack Tank Target *** //

		const isTank = character.name === tank_name;
		const tank = isTank ? character : parent.entities[tank_name];

		if (!tank || tank.rip) {
			set_message("No Tank");
			return;
		}

		// Determine the target
		let target;

		if (isTank) {
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
		if (!isTank && fight_as_a_team === true) {
			const tankEngaged = tank.target === target.id;
			const monsterAggroed = target.target === tank_name;

			if (!tankEngaged || !monsterAggroed) {
				set_message("No Aggro");
				return;
			}
		}

		// === Attack fallback ===
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
