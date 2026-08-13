
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Shared/Buttons.js and Shared/Windows.js were removed — this section (floating stats
// window cleanup, the movement/action button window, hiding the native skills UI) is
// being redesigned from scratch. The map-movement window used to expose one real
// action here: Sell / Bank -> sell_and_bank().
add_bank_buttons();

// Resting loadout (CONFIG.default_gear) — loop_controller()'s fishing/mining states
// swap to a rod/pickaxe only right at the spot and restore this the moment they end.
equip_default_gear();

// Passive loops — no travel, safe to run alongside loop_controller()'s state machine.
buy_potion_loop();
mluck_buff_loop();
loot_collection_loop();
potion_loop(); // shared self-use loop from Shared/Game_Config.js
// Keeps Riff's own localStorage state cache fresh so the fighters can read it too —
// see Shared/Game_Config.js's state_cache_loop()/read_state_cache().
state_cache_loop();

loop_controller(); // sole owner of movement — see Character_Functions/Merchant_Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

// party_manager() is NOT called here — loop_controller() (Character_Functions/
// Merchant_Functions.js) already calls it every 250ms; calling it again here too
// raced two independent owners issuing invite/accept socket calls concurrently.
setInterval(() => {

	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

}, 1000); // Check every second

