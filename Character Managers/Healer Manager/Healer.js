// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER ENTRY POINT — the loop set this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

run_character({
	update_cache,
	on_disabled: healer_on_disabled,
	skip_panic_check: healer_skip_panic_check,
	farm_step: healer_farm_step,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop, anniversary_loop, server_watch_loop, start_active_dungeon_when_ready],
	intervals: [[remote_sell_items, 5000]],
});
