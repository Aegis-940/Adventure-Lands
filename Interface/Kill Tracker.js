// --------------------------------------------------------------------------------------------------------------------------------- //
// KILL TRACKER — session kill rate, counted from the server's kill_credit (every party kill, and coop kills we earn a share of)
// --------------------------------------------------------------------------------------------------------------------------------- //

const KILL_TRACKER_START = performance.now();
const KILL_RATES = [
	{ id: "kill_rate_kpm", unit: "kpm", seconds: 60 },
	{ id: "kill_rate_kph", unit: "kph", seconds: 3600 },
	{ id: "kill_rate_kpd", unit: "kpd", seconds: 86400 },
];

let tracked_kills = 0;

if (parent.socket._kill_tracker_handler) {
	parent.socket.off("kill_credit", parent.socket._kill_tracker_handler);
}

parent.socket._kill_tracker_handler = () => {
	tracked_kills++;
};

parent.socket.on("kill_credit", parent.socket._kill_tracker_handler);

function update_kill_rates() {
	const per_second = tracked_kills / ((performance.now() - KILL_TRACKER_START) / 1000);
	for (const rate of KILL_RATES) {
		parent.$("#" + rate.id).text(`${commas(per_second * rate.seconds)} ${rate.unit}`);
	}
}

KILL_RATES.slice().reverse().forEach(rate => add_toprightcorner_button(rate.id, `0 ${rate.unit}`));
setInterval(update_kill_rates, 1000);
