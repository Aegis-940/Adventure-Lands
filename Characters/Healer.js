
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

// toggle_combat();
// toggle_free_move();
// create_priest_skill_buttons();
// toggle_circle_move_button();
hide_skills_ui();

potions_loop();

loot_loop();


// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

function universal_loop_controller() {

	// Boss detection logic
    const boss_alive = BOSSES.some(name =>
        parent.S[name] &&
        parent.S[name].live &&
        typeof parent.S[name].hp === "number" &&
        typeof parent.S[name].max_hp === "number" &&
        (parent.S[name].max_hp - parent.S[name].hp) > 100000
    );

    if (boss_alive && !boss_loop_active) {
        stop_attack_loop();
        stop_skill_loop();
        stop_circle_move();
        stop_panic_loop();
        boss_loop();
        return;
    }

	if (!boss_alive) {

		if (!panic_enabled) {
			start_panic_loop();
		}

		if (!skill_enabled) {
			start_skill_loop();
		}

		if (!attack_enabled && !panicking) {
			start_attack_loop();
		}

		if (!circle_move_enabled) {
			start_circle_move();
		}

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
