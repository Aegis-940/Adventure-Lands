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
	set_dungeon_mode(dungeon_mode_enabled() ? null : "crypt");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTON
// --------------------------------------------------------------------------------------------------------------------------------- //

function paint_dungeon_button() {
	const $ = parent.$;
	const btn = $("#" + DUNGEON_BTN_ID);
	if (!btn.length) return;

	const on = dungeon_mode_enabled();
	btn.html(on ? "⚰️" : "🪦");
	btn.attr("title", on
		? `Crypt mode ON for ${character.name} — click to turn off`
		: `Enter the crypt with the party (ignores events, bosses and farming)`);
	btn.css("filter", on ? "drop-shadow(0 0 4px #AA88FF)" : "");
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
