// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT ENTRY POINT — windows and every loop this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

if (window.__al_runner_started) throw new Error("Merchant.js loaded twice — reload the tab to restart");
window.__al_runner_started = true;

performance_trick();

add_bank_buttons();

equip_default_gear();

opportunistic_actions_loop();
potion_loop();
state_cache_loop();

loop_controller();
