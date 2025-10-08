
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

hide_skills_ui();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

function universal_loop_controller() {

	try {

		// Boss detection logic
		const boss_alive = BOSSES.some(name =>
			parent.S[name] &&
			parent.S[name].live &&
			typeof parent.S[name].hp === "number" &&
			typeof parent.S[name].max_hp === "number" &&
			(parent.S[name].max_hp - parent.S[name].hp) > 100000
		);

		if (panicking) {
			return;
		}

		if (!LOOP_STATES.boss && boss_alive && !character.rip) {
			stop_attack_loop();
			stop_skill_loop();
			stop_orbit_loop();
			stop_panic_loop();
			start_boss_loop();
			return;
		}

		if (!boss_alive && !character.rip) {

			if (!LOOP_STATES.potion) { start_potion_loop(); game_log("Check 1");}

			if (!LOOP_STATES.loot) { start_loot_loop(); game_log("Check 2");}

			if (!LOOP_STATES.panic) { start_panic_loop(); game_log("Check 3");}

			if (!LOOP_STATES.skill && !panicking) { start_skill_loop(); game_log("Check 4");}

			if (!LOOP_STATES.attack && !panicking) { start_attack_loop(); game_log("Check 5");}

			if (!LOOP_STATES.orbit && character.x === GRIND_HOME.x && character.y === GRIND_HOME.y && !panicking) {
				start_orbit_loop();
			}
		}
	} catch (e) {
		console.log("Error in universal_loop_controller:", e);
	}
}

let last_update_time = 0;

setInterval(() => {
	
	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

	// === Core utility loops ===
	party_manager();
	universal_loop_controller();

	if (!attack_mode || character.rip || is_moving(character)) return;


}, 250);
