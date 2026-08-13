
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

// Ranger_Functions.js already runs its own 20s send_updates interval.
