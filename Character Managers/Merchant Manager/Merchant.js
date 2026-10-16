// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT ENTRY POINT — windows and every loop this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Merchant", () => {
	performance_trick();

	add_bank_buttons();

	equip_default_gear();

	opportunistic_actions_loop();
	potion_loop();
	state_cache_loop();
	stand_loop();

	loop_controller();
});
