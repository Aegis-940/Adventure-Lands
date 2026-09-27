// --------------------------------------------------------------------------------------------------------------------------------- //
// WIDGETS — the bottom-right meter container (Gold/XP/CC/DPS), the render tick they share, and
// make_draggable() (used by Interface/Settings Window.js and Interface/Stats Window.js).
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_bottomrightcorner_widget(id, css) {
	const $ = parent.$;
	const brc = $("#bottomrightcorner");
	brc.find("#" + id).remove();

	const container = $(`<div id="${id}"></div>`).css(css || {});
	const first = brc.children().first();
	if (first.length) first.after(container);
	else brc.append(container);
	return container;
}

function register_widget(id, opts) {
	const $ = parent.$;

	function build() {
		const container = create_bottomrightcorner_widget(id, opts.container);
		const content = $(`<div id="${id}content"></div>`).css(opts.content || {}).appendTo(container);
		if (opts.init) opts.init(content);
		return content;
	}

	let content = build();

	setInterval(() => {
		if (!$("#" + id).length) content = build();
		const html = opts.render(content);
		if (typeof html === "string") content.html(html);
	}, opts.tick_ms || 500);
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
// WINDOW DRAGGER
// --------------------------------------------------------------------------------------------------------------------------------- //

let _drag = null;

(function _init_drag_listeners() {
	window.top.addEventListener("mousemove", e => {
	if (!_drag) return;
	const dx = e.clientX - _drag.start_x;
	const dy = e.clientY - _drag.start_y;
	_drag.el.style.top  = `${_drag.start_top  + dy}px`;
	_drag.el.style.left = `${_drag.start_left + dx}px`;
	});
	window.top.addEventListener("mouseup", () => {
	_drag = null;
	});
})();

function make_draggable(el, handle = el) {
	handle.addEventListener("mousedown", e => {
	_drag = {
		el,
		start_x:    e.clientX,
		start_y:    e.clientY,
		start_top:  parseInt(el.style.top),
		start_left: parseInt(el.style.left),
	};
	e.preventDefault();
	});
}
