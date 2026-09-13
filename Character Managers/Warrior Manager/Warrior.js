// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR ENTRY POINT — windows, event handlers, and every loop this character starts
// --------------------------------------------------------------------------------------------------------------------------------- //

performance_trick();

create_custom_log_window();
add_bank_buttons();

state_cache_loop();

game.on("death", data => {
	const mob = parent.entities[data.id];
	if (!mob || !mob.cooperative) return;

	const mob_name = mob.mtype;
	const mob_target = mob.target;
	const party_members = Object.keys(get_party() || {});

	if (mob_target === character.name || party_members.includes(mob_target)) {
		const msg = `${mob_name} died with ${character.luckm} luck`;
		game_log(msg, "#96a4ff");
		console.log(msg);
	}
});

run_character({
	update_cache,
	farm_step: default_farm_step,
	loops: [action_loop, skill_loop, equipment_manager_loop, maintenance_loop, potion_loop, anniversary_loop],
	intervals: [[remote_sell_items, 5000]],
});

if (WARRIOR_TARGET === "bscorpion") {
	prim_farm_loop();
	bscorpion_kill_logger_loop();
}
