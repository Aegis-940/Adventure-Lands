// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER ENTRY POINT — windows and every loop this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

performance_trick();

create_custom_log_window();
add_bank_buttons();

state_cache_loop();

run_character({
	update_cache,
	pre_move: ranger_pre_move,
	farm_step: default_farm_step,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop, anniversary_loop],
	intervals: [[remote_sell_items, 5000]],
});

if (RANGER_TARGET === "bscorpion") prim_farm_loop();
