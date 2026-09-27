// --------------------------------------------------------------------------------------------------------------------------------- //
// CC METER — 0-200 bar with rolling 60s min/max markers and average
// --------------------------------------------------------------------------------------------------------------------------------- //

const MAX_CC = 200;
const CC_WINDOW_MS = 60000;

const CC_HISTORY = [];

const CC_BAR_CSS = {
	width: "100%", height: "28px", position: "relative",
	background: "rgba(0,0,0,0.3)", border: "2px solid gray",
};

const CC_MARK_CSS = {
	position: "absolute", top: "0px", width: "2px", height: "100%",
	opacity: 0.6, pointerEvents: "none",
};

function build_cc_bar(content) {
	const $ = parent.$;

	const bar = $('<div id="ccbar"></div>').css(CC_BAR_CSS);

	bar.append($('<div id="ccfill"></div>').css({
		position: "absolute", top: 0, left: 0, height: "100%", width: "0%",
		background: "linear-gradient(to right, #1e90ff, #4169e1)",
	}));
	bar.append($('<div id="cclow"></div>').css({ ...CC_MARK_CSS, background: "red" }));
	bar.append($('<div id="cchigh"></div>').css({ ...CC_MARK_CSS, background: "lime" }));
	bar.append($('<div id="cctext"></div>').css({
		position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
		display: "flex", alignItems: "center", justifyContent: "center",
		fontWeight: "bold", color: "#FFFFFF", textShadow: "1px 1px 2px black",
		pointerEvents: "none",
	}));

	content.append(bar);
}

function update_cc_bar() {
	const $ = parent.$;
	const now = Date.now();
	const current = Math.min(character.cc, MAX_CC);

	CC_HISTORY.push({ t: now, v: current });
	prune_before(CC_HISTORY, now - CC_WINDOW_MS);

	const values = CC_HISTORY.map(e => e.v);
	const average = Math.floor(values.reduce((a, b) => a + b, 0) / values.length || 0);
	const pct = value => `${Math.floor((value / MAX_CC) * 100)}%`;

	$("#ccfill").css("width", pct(current));
	$("#cclow").css("left", pct(Math.min(...values)));
	$("#cchigh").css("left", pct(Math.max(...values)));
	$("#cctext").text(`CC: ${Math.floor(current)}/${MAX_CC} (Avg: ${average})`);
}

register_widget("ccmeter", {
	tick_ms: 200,
	container: {
		width: "100%", marginTop: "4px", marginBottom: "-4px",
		fontSize: "20px", color: "white", textAlign: "center", display: "table",
	},
	content: { display: "table-cell", verticalAlign: "middle", width: "100%" },
	init: build_cc_bar,
	render: update_cc_bar,
});
