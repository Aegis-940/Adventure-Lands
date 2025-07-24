// -------------------------------------------------------------------- //
// PERSISTENT STATE
// -------------------------------------------------------------------- //

//init_persistent_state();

// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //

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

// -------------------------------------------------------------------- //
// MAIN LOOP
// -------------------------------------------------------------------- //

let last_curse_time = 0;
const CURSE_COOLDOWN = 5250;

setInterval(() => {
	const now = Date.now();

	if (!attack_mode || character.rip || is_moving(character)) return;

	// === Gold/hr tracking ===
	const stats_win = window._stats_win;
	if (stats_win) {
		const gph = Math.round(get_gold_per_hour());
		stats_win.innerHTML = `<strong>Gold/hr (5m avg)</strong><br>${gph.toLocaleString()} g/h`;
	}

	gold_history.push({ t: now, gold: character.gold });
	gold_history = gold_history.filter(entry => entry.t >= now - 5 * 60 * 1000);

	// === Core utility loops ===
	pots();
	loot();
	party_manager();
	check_and_request_pots();

	// === Follow logic ===
	const leader = parent.entities[PARTY_LEADER];
	const distance_from_leader = leader ? simple_distance(character, leader) : Infinity;

	if (!leader || leader.rip || leader.map !== character.map) {
		if (character.moving) stop();
		return;
	}

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
		const maybe_target = parent.entities[tank.target];
		if (maybe_target && maybe_target.type === "monster" && !maybe_target.rip) {
			target = maybe_target;
		}
	}

	if (!target || target.rip || target.type !== "monster") {
		set_message("No Monsters");
		return;
	}

	if (!is_tank) {
		const tank_engaged = tank.target === target.id;
		const monster_aggroed = target.target === tank_name;
		if (!tank_engaged || !monster_aggroed) {
			set_message("No Aggro");
			return;
		}
	}

	// === Curse before attacking ===
	if (
		can_use("curse") &&
		now - last_curse_time > CURSE_COOLDOWN &&
		is_in_range(target, "curse")
	) {
		use_skill("curse", target);
		last_curse_time = now;
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
