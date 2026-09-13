// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER ENTRY POINT — the loop set this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

run_character({
	update_cache,
	on_disabled: healer_on_disabled,
	skip_panic_check: healer_skip_panic_check,
	local: healer_local,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop, anniversary_loop, start_spider_dungeon_when_ready],
	intervals: [[remote_sell_items, 5000]],
});
