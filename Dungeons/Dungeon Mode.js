// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON MODE — the toggle that puts the party into a dungeon, and its buttons
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_BUTTONS = [
	{ key: "crypt", id: "dungeon-btn", on: "⚰️", off: "🪦", stopping: "🛑" },
	{ key: "spider", id: "spider-btn", on: "🕷️", off: "🕸️", stopping: "🛑" },
];

function dungeon_mode_enabled() {
	return typeof dungeon_override === "function" && !!dungeon_override();
}

function set_dungeon_mode(key, broadcast = true) {
	const was = dungeon_override();
	set_dungeon_override(key);
	paint_dungeon_buttons();

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
	if (character.name === MOVEMENT_LEADER && !was) start_active_dungeon_when_ready();
}

function dungeon_name_for(key) {
	const d = DUNGEONS[key];
	return d ? d.name : key;
}

function toggle_dungeon_mode(key) {
	const current = dungeon_override();

	if (!current) {
		clear_dungeon_stop();
		return set_dungeon_mode(key);
	}

	if (current !== key) {
		return game_log(`${dungeon_name_for(current)} mode is already on — turn it off first`, DUNGEON_WARN_COLOR);
	}

	if (dungeon_loop_running() && !dungeon_stop_requested()) {
		request_dungeon_stop();
		paint_dungeon_buttons();
		game_log("🪦 Dungeon mode off after this run — press again to stop now", "#FFCC00");
		return;
	}

	clear_dungeon_stop();
	set_dungeon_mode(null);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function paint_dungeon_buttons() {
	const $ = parent.$;
	const current = dungeon_override();

	for (const spec of DUNGEON_BUTTONS) {
		const btn = $("#" + spec.id);
		if (!btn.length) continue;

		const name = dungeon_name_for(spec.key);
		const on = current === spec.key;
		const stopping = on && dungeon_stop_requested();
		const blocked = !!current && !on;

		btn.html(stopping ? spec.stopping : (on ? spec.on : spec.off));
		btn.attr("title", stopping
			? `${name} mode stops after this run — click again to stop now`
			: (on
				? `${name} mode ON for ${character.name} — click to turn off`
				: (blocked
					? `${dungeon_name_for(current)} mode is on — turn it off first`
					: `Enter the ${name} with the party (ignores events, bosses and farming)`)));
		btn.css("filter", on ? `drop-shadow(0 0 4px ${stopping ? "#FFCC00" : "#AA88FF"})` : "");
		btn.css("opacity", blocked ? "0.4" : "");
	}
}

function add_dungeon_buttons() {
	if (typeof DUNGEON_PARTY === "undefined") return setTimeout(add_dungeon_buttons, 500);
	if (!DUNGEON_PARTY.includes(character.name)) return;

	const $ = parent.$;
	const trc = $("#toprightcorner");
	const pause_btn = $("#pause-btn");
	if (!trc.length || !pause_btn.length) return setTimeout(add_dungeon_buttons, 500);

	let after = pause_btn;
	for (const spec of DUNGEON_BUTTONS) {
		$("#" + spec.id).remove();

		const btn = $(`
		<div id="${spec.id}" class="gamebutton" style="cursor: pointer;">
			${spec.off}
		</div>`);
		btn.on("click", () => toggle_dungeon_mode(spec.key));

		after.after(btn);
		after = btn;
	}

	paint_dungeon_buttons();

	setInterval(paint_dungeon_buttons, 500);
}
add_dungeon_buttons();
