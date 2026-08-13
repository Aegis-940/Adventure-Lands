// --------------------------------------------------------------------------------------------------------------------------------- //
// WIDGETS — split out of the now-removed Shared/Windows.js. Keeps only the two pieces
// still genuinely depended on by files that aren't part of the buttons/windows redesign:
// create_bottomrightcorner_widget() (Gold/XP/CC/DPS meters' display container) and
// make_draggable() (used by UI/Custom_Log.js and UI/Stats_Window.js). The rest of
// Windows.js (floating stats windows, drag-state for those) was removed along with it.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Shared bootstrap scaffolding for small #bottomrightcorner UI widgets (Gold/XP/CC/DPS
// meters, previously each hand-rolled this identically) — removes any existing element
// with this id, creates a styled container, inserts it right after #bottomrightcorner's
// first child, and returns the jQuery element so the caller can append its own content.
function create_bottomrightcorner_widget(id, css) {
	const $ = parent.$;
	const brc = $("#bottomrightcorner");
	brc.find("#" + id).remove();

	const container = $(`<div id="${id}"></div>`).css(css || {});
	brc.children().first().after(container);
	return container;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WINDOW DRAGGER
// --------------------------------------------------------------------------------------------------------------------------------- //

// Shared drag state — listeners are registered once on window.top, not per-element.
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
