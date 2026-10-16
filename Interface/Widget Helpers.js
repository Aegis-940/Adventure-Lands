// --------------------------------------------------------------------------------------------------------------------------------- //
// WIDGETS — the panel theme, the meter column (Gold/XP/CC/DPS/Boss Contribution) and its render tick, the toolbar,
// CLASS_COLORS, and the drag helpers (Interface/Layout.js, Settings Window.js and Stats Window.js).
// --------------------------------------------------------------------------------------------------------------------------------- //

const UI_METER_WIDTH = 358;

const UI_THEME_CSS = `
	.al-panel {
		background: rgba(0, 0, 0, 0.72);
		border: 4px solid #555;
		border-radius: 4px;
		color: #fff;
		font-family: pixel, monospace;
		font-size: 20px;
		line-height: 22px;
		box-sizing: border-box;
	}
	.al-panel table {
		width: 100%;
		border-collapse: collapse;
	}
	.al-panel td, .al-panel th {
		border: 1px solid #444;
		padding: 1px 3px;
	}
	.al-meter {
		width: ${UI_METER_WIDTH}px;
		margin-bottom: 4px;
		padding: 4px 6px;
		text-align: center;
	}
	.al-panel-title {
		background: #333;
		border-bottom: 2px solid #555;
		padding: 6px 10px;
		font-size: 22px;
		font-weight: bold;
		text-align: left;
		cursor: move;
		user-select: none;
	}
	.al-window {
		position: absolute;
		z-index: 9999;
		overflow: hidden;
	}
	.al-button {
		background: #222;
		color: #fff;
		border: 2px solid #555;
		border-radius: 3px;
		font-family: inherit;
		font-size: 18px;
		padding: 4px 10px;
		cursor: pointer;
	}
	.al-button:hover {
		border-color: #999;
	}
	#al-toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		width: max-content;
		max-width: 100vw;
		margin-left: auto;
	}
	#al-toolbar > .gamebutton {
		cursor: pointer;
	}
`;

function ui_style(id, css) {
	const doc = parent.document;
	let style = doc.getElementById(id);
	if (!style) {
		style = doc.createElement("style");
		style.id = id;
		doc.head.appendChild(style);
	}
	if (style.textContent !== css) style.textContent = css;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// METERS — each one a themed panel in the bottom-right column, free to float once Layout moves it
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_bottomrightcorner_widget(id) {
	const $ = parent.$;
	const brc = $("#bottomrightcorner");
	brc.find("#" + id).remove();

	const container = $(`<div id="${id}" class="al-panel al-meter"></div>`);
	const first = brc.children().first();
	if (first.length) first.after(container);
	else brc.append(container);
	return container;
}

function register_widget(id, opts) {
	const $ = parent.$;

	function build() {
		const container = create_bottomrightcorner_widget(id);
		const content = $(`<div id="${id}content"></div>`).css(opts.content || {}).appendTo(container);
		if (opts.init) opts.init(content);
		return content;
	}

	let content = build();

	every("widget " + id, { ms: opts.tick_ms || 500, kind: "ui", fixed: true }, () => {
		if (!$("#" + id).length) content = build();
		const html = opts.render(content);
		if (typeof html === "string") content.html(html);
	});
}

const CLASS_COLORS = {
	mage: "#3FC7EB",
	paladin: "#F48CBA",
	priest: "#FFFFFF",
	ranger: "#AAD372",
	rogue: "#FFF468",
	warrior: "#C69B6D"
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// TOOLBAR — every bot button, registered with an order and drawn as one bar under the game's menu
// --------------------------------------------------------------------------------------------------------------------------------- //

const _toolbar = [];

function toolbar_button(id, spec) {
	const i = _toolbar.findIndex(b => b.id === id);
	if (i !== -1) _toolbar.splice(i, 1);
	_toolbar.push({ id, ...spec });
	_toolbar.sort((a, b) => a.order - b.order);
	render_toolbar();
}

function toolbar_buttons() {
	return _toolbar.slice();
}

const _settings_actions = [];

function settings_action(id, spec) {
	const i = _settings_actions.findIndex(a => a.id === id);
	if (i !== -1) _settings_actions.splice(i, 1);
	_settings_actions.push({ id, ...spec });
	_settings_actions.sort((a, b) => a.order - b.order);
}

function settings_actions() {
	return _settings_actions.slice();
}

function render_toolbar() {
	const $ = parent.$;
	let bar = $("#al-toolbar");
	if (!bar.length) bar = $('<div id="al-toolbar"></div>').insertAfter($("#toprightcorner > .game-controls"));

	for (const b of _toolbar) {
		$("#" + b.id).remove();
		const button = $(`<div id="${b.id}" class="gamebutton">${b.label}</div>`);
		if (b.title) button.attr("title", b.title);
		if (b.on_click) button.on("click", b.on_click);
		bar.append(button);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COOP POINTS — every visible player's points on our cooperative boss, and the server's loot share formula (issue_monster_awards)
// --------------------------------------------------------------------------------------------------------------------------------- //

const COOP_SHARE_POWER = 0.65;
const COOP_CREDIT_SHARE = 0.0025;

function coop_contributors() {
	const coop_id = character.s.coop?.id;
	const players = [character, ...Object.values(parent.entities).filter(e => e.type === "character")];
	return players
		.filter(p => p.s.coop?.p && (!coop_id || p.s.coop.id === coop_id))
		.map(p => ({ name: p.name, ctype: p.ctype, points: p.s.coop.p }))
		.sort((a, b) => b.points - a.points);
}

function coop_share_weight(points) {
	return Math.pow(Math.max(0, points), COOP_SHARE_POWER);
}

function coop_total_weight(entries) {
	return 0.1 + entries.reduce((sum, e) => sum + coop_share_weight(e.points), 0);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ROLLING WINDOWS — the {t, v} event series every meter keeps
// --------------------------------------------------------------------------------------------------------------------------------- //

function commas(value) {
	return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function prune_before(events, cutoff) {
	let i = 0;
	while (i < events.length && events[i].t < cutoff) i++;
	if (i) events.splice(0, i);
	return events;
}

function window_sum(events, cutoff) {
	let sum = 0;
	for (const e of events) {
		if (e.t >= cutoff) sum += e.v;
	}
	return sum;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DRAGGING — start_drag(e, move, end) follows the mouse on the game window; make_draggable() moves a window by its handle
// --------------------------------------------------------------------------------------------------------------------------------- //

let _drag = null;

function start_drag(e, move, end) {
	_drag = { start_x: e.clientX, start_y: e.clientY, move, end };
	e.preventDefault();
}

function drag_move(e) {
	if (!_drag) return;
	_drag.move(e.clientX - _drag.start_x, e.clientY - _drag.start_y);
}

function drag_end() {
	const drag = _drag;
	_drag = null;
	if (drag && drag.end) drag.end();
}

function make_draggable(el, handle = el, on_end) {
	on_dom(handle, "mousedown", "drag_start", e => {
		const top = parseInt(el.style.top);
		const left = parseInt(el.style.left);
		start_drag(e, (dx, dy) => {
			el.style.top = `${top + dy}px`;
			el.style.left = `${left + dx}px`;
		}, on_end);
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Widget Helpers", () => {
	ui_style("al-theme-style", UI_THEME_CSS);
	on_dom(window.top, "mousemove", "drag_move", drag_move);
	on_dom(window.top, "mouseup", "drag_end", drag_end);
});
