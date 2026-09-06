
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Buttons/Windows UI removed, being redesigned from scratch.
create_custom_log_window();

// Keeps localStorage state cache fresh so other characters can read it — see Shared/Game_Config.js.
state_cache_loop();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

setInterval(async () => {
	
	// Throttle to every 20s
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

}, 250);
