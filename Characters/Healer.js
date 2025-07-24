// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //

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

let lastCurseTime = 0;
const CURSE_COOLDOWN = 5250;

setInterval(() => {
	const now = Date.now();

	if (!attack_mode || character.rip || is_moving(character)) return;

	// === Gold/hr tracking ===
	const wind = window._statsWin;
	if (wind) {
		const gph = Math.round(getGoldPerHour());
		wind.innerHTML = `<strong>Gold/hr (5m avg)</strong><br>${gph.toLocaleString()} g/h`;
	}

	goldHistory.push({ t: now, gold: character.gold });
	goldHistory = goldHistory.filter(entry => entry.t >= now - 5 * 60 * 1000);

	// === Core utility loops ===
	pots();
	loot();
	party_manager();
	check_and_request_pots();

	// === Follow logic ===
	const leader = parent.entities[party_leader];
	const distance_from_leader = leader ? simple_distance(character, leader) : Infinity;

	if (!leader || leader.rip || leader.map !== character.map) {
		if (character.moving) stop();
		return;
	}

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

	// === Healing logic ===
	if (can_use("heal")) {
		let lowest = null;

		for (const name in parent.entities) {
			const entity = parent.entities[name];
			if (
				entity?.type === "character" &&
				entity.visible &&
				is_in_range(entity, "heal") &&
				entity.hp < entity.max_hp - HEAL_THRESHOLD
			) {
				if (!lowest || entity.hp / entity.max_hp < lowest.hp / lowest.max_hp) {
					lowest = entity;
				}
			}
		}

		if (
			character.hp < character.max_hp - HEAL_THRESHOLD &&
			(!lowest || character.hp / character.max_hp < lowest.hp / lowest.max_hp)
		) {
			lowest = character;
		}

		if (lowest) {
			heal(lowest);
		}
	}

	// === Get Target ===
	const isTank = character.name === tank_name;
	const tank = isTank ? character : parent.entities[tank_name];

	if (!tank || tank.rip) {
		set_message("No Tank");
		return;
	}

	let target;

	if (isTank) {
		target = get_targeted_monster();
		if (!target || target.rip) {
			const found = get_monster_by_type_array(MONSTER_TYPES, 200);
			if (found) {
				change_target(found);
				target = found;
			}
		}
	} else if (tank.target) {
		const maybeTarget = parent.entities[tank.target];
		if (maybeTarget && maybeTarget.type === "monster" && !maybeTarget.rip) {
			target = maybeTarget;
		}
	}

	if (!target || target.rip || target.type !== "monster") {
		set_message("No Monsters");
		return;
	}

	if (!isTank) {
		const tankEngaged = tank.target === target.id;
		const monsterAggroed = target.target === tank_name;
		if (!tankEngaged || !monsterAggroed) {
			set_message("No Aggro");
			return;
		}
	}

	// === Curse before attacking ===
	if (
		can_use("curse") &&
		now - lastCurseTime > CURSE_COOLDOWN &&
		is_in_range(target, "curse")
	) {
		use_skill("curse", target);
		lastCurseTime = now;
		set_message("Cursing");
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
	
	
}, 250);
