// --------------------------------------------------------------------------------------------------------------------------------- //
// KILL TRACKER — session kill rate, counted from the server's kill_credit (every party kill, and coop kills we earn a share of)
// --------------------------------------------------------------------------------------------------------------------------------- //

const KILL_TRACKER_START = performance.now();
const KILL_RATES = [
	{ id: "kill_rate_kpm", unit: "kpm", seconds: 60, title: "Kills per minute" },
	{ id: "kill_rate_kph", unit: "kph", seconds: 3600, title: "Kills per hour" },
	{ id: "kill_rate_kpd", unit: "kpd", seconds: 86400, title: "Kills per day" },
];

let tracked_kills = 0;


function update_kill_rates() {
	const per_second = tracked_kills / ((performance.now() - KILL_TRACKER_START) / 1000);
	for (const rate of KILL_RATES) {
		parent.$("#" + rate.id).text(`${commas(per_second * rate.seconds)} ${rate.unit}`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Kill Tracker", () => {
	on_socket("kill_credit", "kill_tracker_handler", () => { tracked_kills++; });
	KILL_RATES.forEach((rate, i) => toolbar_button(rate.id, { label: `0 ${rate.unit}`, order: 80 + i, title: rate.title }));
	every("kill rates", { ms: 1000, kind: "ui", fixed: true }, update_kill_rates);
});
