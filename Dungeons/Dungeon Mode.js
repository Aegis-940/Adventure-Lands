// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON MODE — the ⚙️ dungeon choice that puts the party into a dungeon, and the mode it sets on every fighter
// --------------------------------------------------------------------------------------------------------------------------------- //

function dungeon_mode_enabled() {
	return !!dungeon_override();
}

function set_dungeon_mode(key, broadcast = true) {
	const was = dungeon_override();
	set_dungeon_override(key);

	if (broadcast) {
		const others = DUNGEON_PARTY.filter(n => n !== character.name);
		send_cm(others, { type: "dungeon_mode", dungeon: key || null });
	}

	if (!key) {
		if (was) {
			game_log(dungeon_loop_running()
				? "🪦 Dungeon mode off — finishing this run, then stopping"
				: "🪦 Dungeon mode off — normal farming resumes", "#FFCC00");
		}
		if (!dungeon_loop_running()) hold_reset_for_mode(false);
		return;
	}

	const d = active_dungeon();
	if (!d) return game_log(`Dungeon mode: no dungeon named ${key}`, DUNGEON_WARN_COLOR);

	game_log(`⚰️ ${d.name} mode on — events, bosses and farming are ignored`, DUNGEON_LOG_COLOR);
	hold_reset_for_mode(true);
	if (character.name === MOVEMENT_LEADER && was !== key) start_active_dungeon_when_ready();
}

function dungeon_name_for(key) {
	const d = DUNGEONS[key];
	return d ? d.name : key;
}

function choose_dungeon(key) {
	const current = dungeon_override();
	const choice = dungeon_choice();
	if (key === choice) return;

	if (current === "dreams") {
		set_dungeon_resume(key);
		game_log(key
			? `${dungeon_name_for(key)} starts after the dreams visit`
			: `${dungeon_name_for(choice)} won't resume after the dreams visit`, DUNGEON_LOG_COLOR);
		return;
	}

	if (!current) {
		clear_dungeon_stop();
		set_dungeon_resume(null);
		return set_dungeon_mode(key);
	}

	if (key) {
		return game_log(`${dungeon_name_for(current)} mode is on — choose none first, then ${dungeon_name_for(key)}`, DUNGEON_WARN_COLOR);
	}

	if (dungeon_loop_running() && !dungeon_stop_requested()) {
		request_dungeon_stop();
		game_log("🪦 Dungeon mode off after this run — choose none again to stop now", "#FFCC00");
		return;
	}

	clear_dungeon_stop();
	set_dungeon_mode(null);
}
