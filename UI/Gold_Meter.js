// --------------------------------------------------------------------------------------------------------------------------------- //
// GOLD METER WITH 5-MINUTE ROLLING AVERAGE
// --------------------------------------------------------------------------------------------------------------------------------- //

let goldEvents       = [];                            // array of { t: timestamp, amount: gold }
let largestGoldDrop  = 0;
const startTime      = Date.now();                    // for initial window growth
const WINDOW_MS      = 5 * 60 * 1000;                 // 5 minutes in ms
let interval         = 'hour';                        // 'minute' | 'hour' | 'day'

// Initialize the gold meter UI
const initGoldMeter = () => {
	const $   = parent.$;
	const brc = $('#bottomrightcorner');
	brc.find('#goldtimer').remove();

	const goldContainer = $('<div id="goldtimer"></div>').css({
		fontSize:     '25px',
		color:        'white',
		textAlign:    'center',
		display:      'table',
		overflow:     'hidden',
		marginBottom: '-5px',
		width:        "100%",
	});

	$('<div id="goldtimercontent"></div>')
		.css({ display: 'table-cell', verticalAlign: 'middle' })
		.appendTo(goldContainer);

	brc.children().first().after(goldContainer);
};

// Format gold string to display
const formatGoldString = (averageGold) => `
	<div>${averageGold.toLocaleString('en')} Gold/${interval.charAt(0).toUpperCase() + interval.slice(1)}</div>
	<div>${largestGoldDrop.toLocaleString('en')} Jackpot</div>
`;

// Update the gold display with current data
const updateGoldDisplay = () => {
	const $           = parent.$;
	const averageGold = calculateAverageGold();
	$('#goldtimercontent').html(formatGoldString(averageGold)).css({
		background:      'black',
		backgroundColor: 'rgba(0, 0, 0, 0.6)',
		border:          'solid gray',
		borderWidth:     '4px 4px',
		height:          '50px',
		lineHeight:      '25px',
		fontSize:        '25px',
		color:           '#FFD700',
		textAlign:       'center',
	});
};

// Refresh display twice a second
setInterval(updateGoldDisplay, 500);

// Kick things off
initGoldMeter();

// Listen for loot events
character.on("loot", (data) => {
	if (data.gold && typeof data.gold === 'number' && !Number.isNaN(data.gold)) {
		const partyShare        = parent.party[character.name]?.share || 1;
		const totalGoldInChest  = Math.round(data.gold / partyShare);
		const now               = Date.now();

		// Record this drop
		goldEvents.push({ t: now, amount: totalGoldInChest });

		// Track the largest gold drop
		if (totalGoldInChest > largestGoldDrop) {
			largestGoldDrop = totalGoldInChest;
		}
	} else {
		console.warn("Invalid gold value:", data.gold);
	}
});

// Calculate rolling-average gold over the past up to 5 minutes
const calculateAverageGold = () => {
	const now       = Date.now();
	const elapsedMs = now - startTime;
	// window grows from 0 up to WINDOW_MS
	const windowMs  = Math.min(elapsedMs, WINDOW_MS);
	const cutoff    = now - windowMs;

	// Discard events older than our window
	goldEvents = goldEvents.filter(e => e.t >= cutoff);

	// Sum the gold in that window
	const sumWindow = goldEvents.reduce((sum, e) => sum + e.amount, 0);

	const divisorSeconds = windowMs / 1000;
	if (divisorSeconds <= 0) return 0;

	// Convert to per-interval rate
	const unitSeconds = interval === 'minute' ? 60
	                    : interval === 'hour'   ? 3600
	                    :                          86400;

	return Math.round(sumWindow / divisorSeconds * unitSeconds);
};

// Change the display interval: 'minute', 'hour', or 'day'
const setGoldInterval = (newInterval) => {
	if (['minute', 'hour', 'day'].includes(newInterval)) {
		interval = newInterval;
	} else {
		console.warn("Invalid interval. Use 'minute', 'hour', or 'day'.");
	}
};
