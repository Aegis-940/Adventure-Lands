// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER ENTRY POINT — the loop set this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

run_character({
	update_cache,
	pre_move: ranger_pre_move,
	farm_step: ranger_farm_step,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop,start_dungeon_watchers],
	intervals: [[remote_sell_items, 5000]],
});
