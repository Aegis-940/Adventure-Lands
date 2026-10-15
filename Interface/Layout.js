// --------------------------------------------------------------------------------------------------------------------------------- //
// LAYOUT — one arrangement of every game and bot panel, shared by all four windows: which are hidden, which float and where
// --------------------------------------------------------------------------------------------------------------------------------- //

const UI_LAYOUT_KEY = "AL_ui_layout";

const UI_PANELS = [
	{ id: "character",  group: "Game", label: "Character & gear",     selector: "#topleftcorner" },
	{ id: "menu",       group: "Game", label: "Game menu",            selector: "#toprightcorner > .game-controls" },
	{ id: "partylist",  group: "Game", label: "Party list",           selector: "#newparty" },
	{ id: "serverinfo", group: "Game", label: "Server info",          selector: "#toprightcorner .serverinfo-row", pin: true },
	{ id: "inventory",  group: "Game", label: "Inventory",            selector: "#bottomleftcorner" },
	{ id: "chat",       group: "Game", label: "Chat",                 selector: "#bottomleftcorner2" },
	{ id: "partychat",  group: "Game", label: "Party chat",           selector: "#chatwparty" },
	{ id: "chatinput",  group: "Game", label: "Chat input",           selector: "#chatinput" },
	{ id: "vitals",     group: "Game", label: "HP / MP bars",         selector: "#bottommid" },
	{ id: "skillbar",   group: "Game", label: "Skill bar",            selector: "#skillbar" },
	{ id: "codelist",   group: "Game", label: "Code windows",         selector: "#iframelist" },
	{ id: "level",      group: "Game", label: "Level bar",            selector: "#bottomrightcorner > .xpsui" },
	{ id: "tutorial",   group: "Game", label: "Tutorial",             selector: "#bottomrightcorner > .tutorialui" },
	{ id: "events",     group: "Game", label: "Event announcements",  selector: "#event-announcements" },
	{ id: "toolbar",    group: "Bot",  label: "Toolbar",              selector: "#al-toolbar", keep: true },
	{ id: "log",        group: "Bot",  label: "Game log",             selector: "#al-log-panel" },
	{ id: "party",      group: "Bot",  label: "Party frames",         selector: "#simple-party-ui-container" },
	{ id: "cc",         group: "Bot",  label: "CC meter",             selector: "#ccmeter" },
	{ id: "boss",       group: "Bot",  label: "Boss contribution",    selector: "#bosscontribution" },
	{ id: "dps",        group: "Bot",  label: "DPS meter",            selector: "#dpsmeter" },
	{ id: "gold",       group: "Bot",  label: "Gold meter",           selector: "#goldtimer" },
	{ id: "xp",         group: "Bot",  label: "XP meter",             selector: "#xptimer" },
];

const ARRANGE_Z = 100000;
const ARRANGE_BOX_Z = 100000000;

let _layout = null;
let _arranging = false;
let _arrange_loop = null;

function ui_layout() {
	if (!_layout) _layout = storage_read(UI_LAYOUT_KEY) || { panels: {}, buttons: {}, windows: {} };
	return _layout;
}

function save_ui_layout() {
	storage_write(UI_LAYOUT_KEY, ui_layout());
	apply_ui_layout();
	if (_arranging) render_layout_window();
}

function panel_entry(id) {
	const panels = ui_layout().panels;
	if (!panels[id]) panels[id] = {};
	return panels[id];
}

function panel_element(panel) {
	return parent.document.querySelector(panel.selector);
}

function panel_floats(entry) {
	return !!(entry && entry.ax);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// APPLYING — the whole layout is one generated stylesheet, so panels the game or a meter rebuilds later still obey it
// --------------------------------------------------------------------------------------------------------------------------------- //

function panel_rule(panel, entry) {
	if (!entry) return "";
	if (entry.hidden) return `${panel.selector} { display: none !important; }`;
	if (!panel_floats(entry)) return "";

	const away_x = entry.ax === "left" ? "right" : "left";
	const away_y = entry.ay === "top" ? "bottom" : "top";
	const width = entry.w ? `width: ${entry.w}px !important; box-sizing: border-box !important;` : "";
	return `${panel.selector} {
		position: fixed !important;
		${entry.ax}: min(${entry.x}px, max(0px, calc(100vw - ${entry.sw}px))) !important;
		${away_x}: auto !important;
		${entry.ay}: min(${entry.y}px, max(0px, calc(100vh - ${entry.sh}px))) !important;
		${away_y}: auto !important;
		margin: 0 !important;
		transform: none !important;
		${width}
	}`;
}

function apply_ui_layout() {
	const layout = ui_layout();
	const rules = UI_PANELS.map(p => panel_rule(p, layout.panels[p.id])).filter(Boolean);
	for (const id of Object.keys(layout.buttons)) {
		if (layout.buttons[id]) rules.push(`#${id} { display: none !important; }`);
	}
	ui_style("al-layout-style", rules.join("\n"));
}

function float_panel(panel, rect) {
	const vw = parent.innerWidth;
	const vh = parent.innerHeight;
	const entry = panel_entry(panel.id);
	entry.ax = rect.left + rect.width / 2 < vw / 2 ? "left" : "right";
	entry.x = Math.max(0, Math.round(entry.ax === "left" ? rect.left : vw - rect.right));
	entry.ay = rect.top + rect.height / 2 < vh / 2 ? "top" : "bottom";
	entry.y = Math.max(0, Math.round(entry.ay === "top" ? rect.top : vh - rect.bottom));
	entry.sw = Math.round(rect.width);
	entry.sh = Math.round(rect.height);
	if (panel.pin) entry.w = Math.round(rect.width);
}

function dock_panel(id) {
	const entry = panel_entry(id);
	ui_layout().panels[id] = entry.hidden ? { hidden: true } : {};
	save_ui_layout();
}

function set_panel_hidden(id, hidden) {
	panel_entry(id).hidden = hidden;
	save_ui_layout();
}

function set_button_hidden(id, hidden) {
	const buttons = ui_layout().buttons;
	if (hidden) buttons[id] = true;
	else delete buttons[id];
	save_ui_layout();
}

function ui_layout_reset() {
	_layout = { panels: {}, buttons: {}, windows: {} };
	save_ui_layout();
	return "every panel shown and back in its place";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WINDOWS — the bot's own windows open where they were last dragged
// --------------------------------------------------------------------------------------------------------------------------------- //

function remember_window(name, el, handle, left, top) {
	const saved = ui_layout().windows[name];
	const max_left = Math.max(0, parent.innerWidth - 100);
	const max_top = Math.max(0, parent.innerHeight - 40);
	el.style.left = `${Math.min(max_left, Math.max(0, saved ? saved.left : left))}px`;
	el.style.top = `${Math.min(max_top, Math.max(0, saved ? saved.top : top))}px`;
	make_draggable(el, handle, () => {
		ui_layout().windows[name] = { left: parseInt(el.style.left), top: parseInt(el.style.top) };
		storage_write(UI_LAYOUT_KEY, ui_layout());
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ARRANGING — an outline over every visible panel: drag it to float it, ✕ hides it, ↺ puts it back where it started
// --------------------------------------------------------------------------------------------------------------------------------- //

function ui_arrange() {
	_arranging = !_arranging;
	if (!_arranging) return close_arrange();
	open_arrange();
}

function close_arrange() {
	_arranging = false;
	if (_arrange_loop) stop_loop(_arrange_loop);
	_arrange_loop = null;
	const doc = parent.document;
	for (const id of ["al-arrange-layer", "al-layout-window"]) {
		const el = doc.getElementById(id);
		if (el) el.remove();
	}
}

function open_arrange() {
	const doc = parent.document;
	close_arrange();
	_arranging = true;

	const layer = doc.createElement("div");
	layer.id = "al-arrange-layer";
	Object.assign(layer.style, {
		position: "fixed", left: "0", top: "0", width: "100vw", height: "100vh",
		zIndex: ARRANGE_Z, pointerEvents: "none", background: "rgba(0, 0, 0, 0.25)",
	});
	doc.body.appendChild(layer);

	open_layout_window();
	sync_arrange_boxes();
	_arrange_loop = every("arrange", { ms: 250, kind: "ui" }, sync_arrange_boxes);
}

function arrange_box(layer, panel) {
	const doc = parent.document;
	const box = doc.createElement("div");
	box.id = "al-arrange-" + panel.id;
	box.className = "al-arrange-box";
	Object.assign(box.style, {
		position: "fixed", boxSizing: "border-box", border: "2px dashed #6CF", background: "rgba(80, 160, 255, 0.18)",
		pointerEvents: "auto", cursor: "move", fontFamily: "pixel, monospace", fontSize: "18px", color: "#fff",
	});

	const bar = doc.createElement("div");
	Object.assign(bar.style, {
		display: "flex", gap: "4px", alignItems: "center", background: "rgba(0, 0, 0, 0.8)",
		padding: "1px 4px", width: "max-content", maxWidth: "100%", overflow: "hidden", whiteSpace: "nowrap",
	});

	const label = doc.createElement("span");
	label.textContent = panel.label;
	bar.appendChild(label);

	const actions = [["↺", "Put it back where it started", () => dock_panel(panel.id), "dock"]];
	if (!panel.keep) actions.push(["✕", "Hide it", () => set_panel_hidden(panel.id, true), "hide"]);
	for (const [text, title, act, role] of actions) {
		const button = doc.createElement("span");
		button.textContent = text;
		button.title = title;
		button.dataset.role = role;
		button.style.cursor = "pointer";
		button.style.color = "#FFCC66";
		button.onmousedown = e => e.stopPropagation();
		button.onclick = act;
		bar.appendChild(button);
	}

	box.appendChild(bar);
	box.onmousedown = e => arrange_drag(panel, e);
	layer.appendChild(box);
	return box;
}

function sync_arrange_boxes() {
	const doc = parent.document;
	const layer = doc.getElementById("al-arrange-layer");
	if (!layer) return;
	const layout = ui_layout();

	for (const panel of UI_PANELS) {
		const entry = layout.panels[panel.id];
		const el = panel_element(panel);
		const rect = el && el.getBoundingClientRect();
		let box = doc.getElementById("al-arrange-" + panel.id);

		if (!rect || rect.width < 2 || rect.height < 2 || (entry && entry.hidden)) {
			if (box) box.remove();
			continue;
		}

		if (!box) box = arrange_box(layer, panel);
		box.style.left = `${rect.left}px`;
		box.style.top = `${rect.top}px`;
		box.style.width = `${rect.width}px`;
		box.style.height = `${rect.height}px`;
		box.style.zIndex = String(ARRANGE_BOX_Z - Math.round(rect.width * rect.height));
		box.querySelector('[data-role="dock"]').style.display = panel_floats(entry) ? "" : "none";
	}
}

function arrange_drag(panel, e) {
	const el = panel_element(panel);
	if (!el) return;
	const start = el.getBoundingClientRect();
	start_drag(e, (dx, dy) => {
		float_panel(panel, {
			left: start.left + dx, right: start.right + dx, top: start.top + dy, bottom: start.bottom + dy,
			width: start.width, height: start.height,
		});
		apply_ui_layout();
		sync_arrange_boxes();
	}, save_ui_layout);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LAYOUT WINDOW — every panel and toolbar button with a checkbox, Reset all, and Done
// --------------------------------------------------------------------------------------------------------------------------------- //

function open_layout_window() {
	const doc = parent.document;
	const win = doc.createElement("div");
	win.id = "al-layout-window";
	win.className = "al-panel al-window";
	win.style.zIndex = ARRANGE_Z + 1;

	const title = doc.createElement("div");
	title.className = "al-panel-title";
	title.textContent = "🧩 Layout — drag any outlined panel";
	win.appendChild(title);

	const body = doc.createElement("div");
	body.id = "al-layout-body";
	Object.assign(body.style, {
		display: "grid", gridTemplateColumns: "repeat(3, max-content)", gap: "4px 24px",
		padding: "10px", maxHeight: "70vh", overflowY: "auto",
	});
	win.appendChild(body);

	const footer = doc.createElement("div");
	Object.assign(footer.style, { display: "flex", gap: "8px", padding: "0 10px 10px", justifyContent: "flex-end" });
	for (const [text, act] of [["Reset all", ui_layout_reset], ["Done", close_arrange]]) {
		const button = doc.createElement("button");
		button.className = "al-button";
		button.textContent = text;
		button.onclick = act;
		footer.appendChild(button);
	}
	win.appendChild(footer);

	doc.body.appendChild(win);
	remember_window("layout", win, title, Math.round(parent.innerWidth / 2 - 330), 120);
	render_layout_window();
}

function layout_row(doc, text, checked, on_change, keep, floats, on_dock) {
	const row = doc.createElement("label");
	Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center", cursor: keep ? "default" : "pointer" });

	const box = doc.createElement("input");
	box.type = "checkbox";
	box.checked = checked;
	box.disabled = keep;
	box.onchange = () => on_change(box.checked);
	row.appendChild(box);

	const label = doc.createElement("span");
	label.textContent = text;
	row.appendChild(label);

	if (floats) {
		const dock = doc.createElement("span");
		dock.textContent = "↺";
		dock.title = "Put it back where it started";
		dock.style.cursor = "pointer";
		dock.style.color = "#FFCC66";
		dock.onclick = e => {
			e.preventDefault();
			on_dock();
		};
		row.appendChild(dock);
	}
	return row;
}

function layout_column(doc, heading) {
	const column = doc.createElement("div");
	Object.assign(column.style, { display: "flex", flexDirection: "column", gap: "3px" });
	const head = doc.createElement("div");
	head.textContent = heading;
	Object.assign(head.style, { fontWeight: "bold", borderBottom: "1px solid #666", marginBottom: "2px" });
	column.appendChild(head);
	return column;
}

function render_layout_window() {
	const doc = parent.document;
	const body = doc.getElementById("al-layout-body");
	if (!body) return;
	body.innerHTML = "";
	const layout = ui_layout();

	for (const group of ["Game", "Bot"]) {
		const column = layout_column(doc, group === "Game" ? "Game panels" : "Bot panels");
		for (const panel of UI_PANELS.filter(p => p.group === group)) {
			const entry = layout.panels[panel.id];
			column.appendChild(layout_row(doc, panel.label, !(entry && entry.hidden),
				shown => set_panel_hidden(panel.id, !shown), !!panel.keep, panel_floats(entry), () => dock_panel(panel.id)));
		}
		body.appendChild(column);
	}

	const buttons = layout_column(doc, "Toolbar buttons");
	for (const b of toolbar_buttons()) {
		const text = `${b.label} ${b.title || ""}`.trim();
		buttons.appendChild(layout_row(doc, text.length > 34 ? text.slice(0, 33) + "…" : text, !layout.buttons[b.id],
			shown => set_button_hidden(b.id, !shown), !!b.keep, false));
	}
	body.appendChild(buttons);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SYNC — another window saved the layout: read it again
// --------------------------------------------------------------------------------------------------------------------------------- //

function on_layout_storage(e) {
	if (e.key !== UI_LAYOUT_KEY) return;
	_layout = null;
	apply_ui_layout();
	if (_arranging) render_layout_window();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Layout", () => {
	apply_ui_layout();
	on_dom(window, "storage", "ui_layout_sync", on_layout_storage);
	settings_action("layout", { label: "🧩 Arrange the screen", order: 10, on_click: ui_arrange });
});

console_api({
	ui_arrange: "arrange mode: drag any panel to float it, hide or show panels and toolbar buttons (shared by all four windows)",
	ui_layout_reset: "every panel shown and back where the game and the bot first draw it",
});
