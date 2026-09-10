// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER ENTRY POINT — windows and every loop this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

performance_trick();

create_custom_log_window();
add_bank_buttons();

state_cache_loop();

run_character({
	update_cache,
	on_disabled: healer_on_disabled,
	skip_panic_check: healer_skip_panic_check,
	local: healer_local,
	loops: [action_loop, skill_loop, maintenance_loop, equipment_manager_loop, potion_loop, anniversary_loop],
	intervals: [[remote_sell_items, 5000]],
});

if (HEALER_TARGET === "bscorpion") {
	prim_farm_loop();
	prim_orbit_loop();
}

if (HEALER_TARGET === "giantspider") {
	start_spider_dungeon_when_ready();
}
