// --------------------------------------------------------------------------------------------------------------------------------- //
// GOLD METER — rolling gold/hour and the biggest chest of the session
// --------------------------------------------------------------------------------------------------------------------------------- //

const GOLD_START = Date.now();
const GOLD_WINDOW_MS = 30 * 60 * 1000;
const GOLD_UNIT_SECONDS = { minute: 60, hour: 3600, day: 86400 };

let gold_events = [];
let largest_gold_drop = 0;
let gold_interval = "hour";

function calculate_average_gold() {
	const now = Date.now();
	const window_ms = Math.min(now - GOLD_START, GOLD_WINDOW_MS);
	if (window_ms <= 0) return 0;

	prune_before(gold_events, now - window_ms);

	const per_second = window_sum(gold_events, now - window_ms) / (window_ms / 1000);
	return Math.round(per_second * GOLD_UNIT_SECONDS[gold_interval]);
}

function set_gold_interval(new_interval) {
	if (GOLD_UNIT_SECONDS[new_interval]) gold_interval = new_interval;
	else game_log(`Invalid gold interval "${new_interval}" — use minute, hour or day`, "#FFA500");
}

register_widget("goldtimer", {
	tick_ms: 500,
	container: {
		fontSize: "25px", color: "white", textAlign: "center", display: "table",
		overflow: "hidden", marginBottom: "-5px", width: "100%",
	},
	content: {
		display: "table-cell", verticalAlign: "middle",
		background: "black", backgroundColor: "rgba(0, 0, 0, 0.6)",
		border: "solid gray", borderWidth: "4px 4px",
		height: "50px", lineHeight: "25px", fontSize: "25px",
		color: "#FFD700", textAlign: "center",
	},
	render: () => `
		<div>${commas(calculate_average_gold())} Gold/${gold_interval.charAt(0).toUpperCase() + gold_interval.slice(1)}</div>
		<div>${commas(largest_gold_drop)} Jackpot</div>
	`,
});

character.on("loot", (data) => {
	if (typeof data.gold !== "number" || Number.isNaN(data.gold)) return;

	const party_share = parent.party[character.name]?.share || 1;
	const chest_total = Math.round(data.gold / party_share);

	gold_events.push({ t: Date.now(), v: chest_total });
	if (chest_total > largest_gold_drop) largest_gold_drop = chest_total;
});
