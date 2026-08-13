
performance_trick();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

// Buttons/Windows UI removed, being redesigned from scratch.
add_bank_buttons();

// Resting loadout — loop_controller()'s fishing/mining states swap gear temporarily and restore this after.
equip_default_gear();

// Passive loop — no travel, safe alongside loop_controller()'s state machine. Drives
// should_buy_potions()/should_collect_loot()/should_buff_party() decisions each tick.
opportunistic_actions_loop();
potion_loop(); // shared self-use loop from Shared/Game_Config.js
state_cache_loop(); // keeps Riff's state cache fresh for the fighters to read

loop_controller(); // sole owner of movement — see Character_Functions/Merchant_Functions.js

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

// party_manager() not called here — loop_controller() already calls it every 250ms; calling both raced concurrent socket calls.
setInterval(() => {

	// Throttle to every 20s
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

}, 1000);

