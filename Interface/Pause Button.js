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
	game_log(running ? `▶️ ${character.name} resumed`
		: `⏸️ ${character.name} parked — combat, panic and potions still run`,
		running ? "#00ff00" : "#ffcc00");
}

function add_pause_button() {
	toolbar_button("pause-btn", { label: "⏸️", order: 40, title: "Pause / resume automation", on_click: toggle_automation });
	paint_pause_button();

	every("pause button", { ms: 500, kind: "ui", fixed: true }, paint_pause_button);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Pause Button", add_pause_button);
