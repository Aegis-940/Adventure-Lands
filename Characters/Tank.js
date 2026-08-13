
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

// Warrior_Functions.js already runs its own 20s send_updates interval.
