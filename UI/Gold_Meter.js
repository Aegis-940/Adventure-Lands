// --------------------------------------------------------------------------------------------------------------------------------- //
// GOLD METER WITH 5-MINUTE ROLLING AVERAGE
// --------------------------------------------------------------------------------------------------------------------------------- //

let gold_events       = [];                            // array of { t: timestamp, amount: gold }
let largest_gold_drop  = 0;
const start_time      = Date.now();                    // for initial window growth
const WINDOW_MS      = 30 * 60 * 1000;                 // 30 minutes in ms
let interval         = "hour";                        // "minute" | "hour" | "day"

// Initialize the gold meter UI
const init_gold_meter = () => {
	const $   = parent.$;
	const brc = $("#bottomrightcorner");
	brc.find("#goldtimer").remove();

	const gold_container = $('<div id="goldtimer"></div>').css({
		fontSize:     "25px",
		color:        "white",
		textAlign:    "center",
		display:      "table",
		overflow:     "hidden",
		marginBottom: "-5px",
		width:        "100%",
	});

	$('<div id="goldtimercontent"></div>')
		.css({ display: "table-cell", verticalAlign: "middle" })
		.appendTo(gold_container);

	brc.children().first().after(gold_container);
};

// Format gold string to display
const format_gold_string = (average_gold) => `
	<div>${average_gold.toLocaleString("en")} Gold/${interval.charAt(0).toUpperCase() + interval.slice(1)}</div>
	<div>${largest_gold_drop.toLocaleString("en")} Jackpot</div>
`;

// Update the gold display with current data
const update_gold_display = () => {
	const $           = parent.$;
	const average_gold = calculate_average_gold();
	$("#goldtimercontent").html(format_gold_string(average_gold)).css({
		background:      "black",
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		border:          "solid gray",
		borderWidth:     "4px 4px",
		height:          "50px",
		lineHeight:      "25px",
		fontSize:        "25px",
		color:           "#FFD700",
		textAlign:       "center",
	});
};

// Refresh display twice a second
setInterval(update_gold_display, 500);

// Kick things off
init_gold_meter();

// Listen for loot events
character.on("loot", (data) => {
	if (data.gold && typeof data.gold === "number" && !Number.isNaN(data.gold)) {
		const party_share        = parent.party[character.name]?.share || 1;
		const total_gold_in_chest  = Math.round(data.gold / party_share);
		const now               = Date.now();

		// Record this drop
		gold_events.push({ t: now, amount: total_gold_in_chest });

		// Track the largest gold drop
		if (total_gold_in_chest > largest_gold_drop) {
			largest_gold_drop = total_gold_in_chest;
		}
	} else {
		console.warn("Invalid gold value:", data.gold);
	}
});

// Calculate rolling-average gold over the past up to 5 minutes
const calculate_average_gold = () => {
	const now       = Date.now();
	const elapsed_ms = now - start_time;
	// window grows from 0 up to WINDOW_MS
	const window_ms  = Math.min(elapsed_ms, WINDOW_MS);
	const cutoff    = now - window_ms;

	// Discard events older than our window
	gold_events = gold_events.filter(e => e.t >= cutoff);

	// Sum the gold in that window
	const sum_window = gold_events.reduce((sum, e) => sum + e.amount, 0);

	const divisor_seconds = window_ms / 1000;
	if (divisor_seconds <= 0) return 0;

	// Convert to per-interval rate
	const unit_seconds = interval === "minute" ? 60
						: interval === "hour"   ? 3600
						:                          86400;

	return Math.round(sum_window / divisor_seconds * unit_seconds);
};

// Change the display interval: "minute", "hour", or "day"
const set_gold_interval = (new_interval) => {
	if (["minute", "hour", "day"].includes(new_interval)) {
		interval = new_interval;
	} else {
		console.warn("Invalid interval. Use 'minute', 'hour', or 'day'.");
	}
};
