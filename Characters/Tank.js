
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
create_custom_log_window();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

// === Core utility loops ===
// Designed to run continuously, toggles on and off as needed
potion_loop();
// loot_loop();
move_loop();
skill_loop();
panic_loop();
boss_loop();
orbit_loop();
status_cache_loop();
attack_loop();

// === Watchdog and Activity Monitor ===
// Designed to ensure the bot is running smoothly and doesn't stall
// passive_activity_monitor();
// watchdog_loop();

// == Loop Controller ===
// Designed to manage state transitions and ensure appropriate loops are running
loop_controller();

setInterval(async () => {
	
	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

	// === Core utility loops ===
	party_manager();

	if (!attack_mode || character.rip || is_moving(character)) return;


}, 250);
