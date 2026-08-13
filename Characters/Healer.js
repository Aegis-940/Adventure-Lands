
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Shared/Buttons.js and Shared/Windows.js were removed — this section (floating stats
// window cleanup, the movement/action button window, hiding the native skills UI) is
// being redesigned from scratch. The map-movement window used to expose one real
// action here: Deposit -> send_to_merchant().
create_custom_log_window();

// Keeps this character's localStorage state cache fresh (hp/mp/gold/position/free
// slots/conditions/etc.) so any other character can read it directly — see
// Shared/Game_Config.js's state_cache_loop()/read_state_cache().
state_cache_loop();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

setInterval(async () => {
	
	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

}, 250);
