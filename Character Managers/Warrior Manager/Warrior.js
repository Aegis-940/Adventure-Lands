// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR ENTRY POINT — the loop set this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

run_character({
	update_cache,
	farm_step: warrior_farm_step,
	engage_step: warrior_engage_step,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop,start_dungeon_watchers, cooperative_luck_logger, swap_penalty_logger, cc_report_logger, sugar_rush_roll_logger, rime_shell_logger],
	intervals: [[remote_sell_items, 5000]],
});
