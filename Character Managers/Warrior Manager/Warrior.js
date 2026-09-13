// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR ENTRY POINT — the loop set this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

run_character({
	update_cache,
	farm_step: default_farm_step,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop, anniversary_loop, cooperative_luck_logger],
	intervals: [[remote_sell_items, 5000]],
});
