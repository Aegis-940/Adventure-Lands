// --------------------------------------------------------------------------------------------------------------------------------- //
// PAUSE BUTTON — parks this character's automation, leaving combat, panic and upkeep running.
// --------------------------------------------------------------------------------------------------------------------------------- //

function paint_pause_button() {
	const $ = parent.$;
	const btn = $("#pause-btn");
	if (!btn.length) return;

	const running = automation_enabled();
	btn.html(running ? "⏸️" : "▶️");
	btn.attr("title", running
		? `Pause ${character.name}: movement, travel and farming stop; combat and panic continue`
		: `Resume ${character.name}`);
	btn.css("filter", running ? "" : "drop-shadow(0 0 4px #ff4444)");
}

function toggle_automation() {
	const running = set_automation(!automation_enabled());
	paint_pause_button();
	log(running ? `▶️ ${character.name} resumed`
		: `⏸️ ${character.name} parked — combat, panic and potions still run`,
		running ? "#00ff00" : "#ffcc00", "Alerts");
}

function add_pause_button() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	const settings_btn = $("#settings-btn");
	if (!trc.length || !settings_btn.length) return setTimeout(add_pause_button, 500);

	$("#pause-btn").remove();

	const pause_btn = $(`
	<div id="pause-btn" class="gamebutton" style="cursor: pointer;">
		⏸️
	</div>`);
	pause_btn.on("click", toggle_automation);

	settings_btn.after(pause_btn);
	paint_pause_button();

	setInterval(paint_pause_button, 500);
}
add_pause_button();
