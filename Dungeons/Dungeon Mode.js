// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON MODE — the toggle that puts the party into a dungeon, and its button
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_BTN_ID = "dungeon-btn";

function dungeon_mode_enabled() {
	return typeof dungeon_override === "function" && !!dungeon_override();
}

function set_dungeon_mode(key, broadcast = true) {
	const was = dungeon_override();
	set_dungeon_override(key);
	paint_dungeon_button();

	if (broadcast) {
		const others = DUNGEON_PARTY.filter(n => n !== character.name);
		send_cm(others, { type: "dungeon_mode", dungeon: key || null });
	}

	if (!key) {
		if (was) {
			log(dungeon_loop_running()
				? "🪦 Dungeon mode off — finishing this run, then stopping"
				: "🪦 Dungeon mode off — normal farming resumes", "#FFCC00", "Alerts");
		}
		if (!dungeon_loop_running()) hold_reset_for_mode(false);
		return;
	}

	const d = active_dungeon();
	if (!d) return log(`Dungeon mode: no dungeon named ${key}`, DUNGEON_WARN_COLOR);

	log(`⚰️ ${d.name} mode on — events, bosses and farming are ignored`, DUNGEON_LOG_COLOR, "Alerts");
	hold_reset_for_mode(true);
	if (character.name === MOVEMENT_LEADER && !was) start_active_dungeon_when_ready();
}

function toggle_dungeon_mode() {
	if (!dungeon_mode_enabled()) {
		clear_dungeon_stop();
		return set_dungeon_mode("crypt");
	}

	if (dungeon_loop_running() && !dungeon_stop_requested()) {
		request_dungeon_stop();
		paint_dungeon_button();
		log("🪦 Dungeon mode off after this run — press again to stop now", "#FFCC00", "Alerts");
		return;
	}

	clear_dungeon_stop();
	set_dungeon_mode(null);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTON
// --------------------------------------------------------------------------------------------------------------------------------- //

function paint_dungeon_button() {
	const $ = parent.$;
	const btn = $("#" + DUNGEON_BTN_ID);
	if (!btn.length) return;

	const on = dungeon_mode_enabled();
	const stopping = on && dungeon_stop_requested();

	btn.html(stopping ? "🛑" : (on ? "⚰️" : "🪦"));
	btn.attr("title", stopping
		? `Crypt mode stops after this run — click again to stop now`
		: (on
			? `Crypt mode ON for ${character.name} — click to turn off`
			: `Enter the crypt with the party (ignores events, bosses and farming)`));
	btn.css("filter", on ? `drop-shadow(0 0 4px ${stopping ? "#FFCC00" : "#AA88FF"})` : "");
}

function add_dungeon_button() {
	if (typeof DUNGEON_PARTY === "undefined") return setTimeout(add_dungeon_button, 500);
	if (!DUNGEON_PARTY.includes(character.name)) return;

	const $ = parent.$;
	const trc = $("#toprightcorner");
	const pause_btn = $("#pause-btn");
	if (!trc.length || !pause_btn.length) return setTimeout(add_dungeon_button, 500);

	$("#" + DUNGEON_BTN_ID).remove();

	const dungeon_btn = $(`
	<div id="${DUNGEON_BTN_ID}" class="gamebutton" style="cursor: pointer;">
		🪦
	</div>`);
	dungeon_btn.on("click", toggle_dungeon_mode);

	pause_btn.after(dungeon_btn);
	paint_dungeon_button();

	setInterval(paint_dungeon_button, 500);
}
add_dungeon_button();
