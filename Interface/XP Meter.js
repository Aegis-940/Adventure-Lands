// --------------------------------------------------------------------------------------------------------------------------------- //
// XP METER — time until level up, and how the current rate compares to the target
// --------------------------------------------------------------------------------------------------------------------------------- //

const XP_ROLLING_WINDOW = 5 * 60 * 1000;

let xp_history = [];
let target_xp_rate = 40000;

function format_remaining_time(seconds) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${days}d ${hours}h ${minutes}min`;
}

function get_xp_rate_color(avg, target) {
	if (avg < target * 0.5) return "#FF0000";
	if (avg < target) return "#FFA500";
	if (avg <= target * 1.2) return "#FFFF00";
	if (avg <= target * 1.5) return "#90EE90";
	return "#00FF00";
}

function xp_meter_lines() {
	const now = Date.now();

	if (xp_history.length && xp_history[xp_history.length - 1].level !== character.level) {
		xp_history = [];
	}

	xp_history.push({ t: now, xp: character.xp, level: character.level });
	prune_before(xp_history, now - XP_ROLLING_WINDOW);

	if (xp_history.length < 2) return null;

	const first = xp_history[0];
	const last = xp_history[xp_history.length - 1];
	const elapsed_seconds = (last.t - first.t) / 1000;
	const xp_gain = last.xp - first.xp;

	if (elapsed_seconds <= 0 || xp_gain <= 0) return null;

	const per_second = xp_gain / elapsed_seconds;
	const xp_remaining = parent.G.levels[character.level] - character.xp;
	const color = get_xp_rate_color(per_second * 60, target_xp_rate);

	return `Estimated time until level up:`
		+ `<br><span style="font-size: 26px; color: #87CEEB">${format_remaining_time(Math.round(xp_remaining / per_second))}</span>`
		+ `<br><span style="color: ${color}">${commas(per_second * 60)} XP/min</span>`;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("XP Meter", () => {
	register_widget("xptimer", {
		tick_ms: 500,
		content: { color: "#00FF00", fontSize: "22px", lineHeight: "26px" },
		init: content => content.html('Estimated time until level up:<br><span style="font-size: 26px;">Loading...</span><br><span>(Kill something!)</span>'),
		render: () => xp_meter_lines(),
	});
});
