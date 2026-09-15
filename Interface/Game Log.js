// --------------------------------------------------------------------------------------------------------------------------------- //
// GAME LOG — RESIZED, TIMESTAMPED, FILTERED, TABBED
// --------------------------------------------------------------------------------------------------------------------------------- //

function al_log_state() {
	if (!parent.__al_log) {
		parent.__al_log = {
			entries: [],
			show: { gold: true, kills: true, items: true, errors: true },
			tab: "log",
			base_w: 0,
			base_h: 0,
			hooked: false,
			seeded: false,
			resize_hooked: false
		};
	}
	return parent.__al_log;
}

function al_log_filters() {
	return [
		{ key: "gold",   label: "Gold",   regex: /gold/i },
		{ key: "kills",  label: "Kills",  regex: /(killed|slain|died)/i },
		{ key: "items",  label: "Items",  regex: /(found|looted|received)/i },
		{ key: "errors", label: "Errors", regex: /(error|line \d|column \d)/i }
	];
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ENTRIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function al_log_category(text, explicit) {
	if (explicit) return explicit;
	const plain = String(text);
	for (const f of al_log_filters()) {
		if (f.regex.test(plain)) return f.key;
	}
	return "other";
}

function al_log_is_shown(entry) {
	return al_log_state().show[entry.cat] !== false;
}

function al_log_stamp(time) {
	if (!time) return "--:--:--";
	const d = new Date(time);
	const p = n => ("0" + n).slice(-2);
	return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function al_log_entry_node(entry) {
	const node = parent.document.createElement("div");
	node.className = "gameentry";
	node.style.color = entry.color;
	node.innerHTML = `<span style="color:#777">${al_log_stamp(entry.time)}</span> ${entry.html}`;
	return node;
}

function al_log_push(html, color, explicit) {
	const st = al_log_state();
	const entry = {
		html: html,
		color: color || "white",
		time: Date.now(),
		cat: al_log_category(html, explicit)
	};

	st.entries.push(entry);
	while (st.entries.length > 500) st.entries.shift();

	const doc = parent.document;
	const box = al_log_is_shown(entry) ? doc.getElementById("gamelog") : doc.getElementById("gamelog-filtered");
	if (!box) return;

	box.appendChild(al_log_entry_node(entry));
	while (box.children.length > 500) box.removeChild(box.firstChild);
	box.scrollTop = box.scrollHeight;
}

function al_log_render_all() {
	const st = al_log_state();
	const doc = parent.document;
	const main = doc.getElementById("gamelog");
	const filtered = doc.getElementById("gamelog-filtered");
	if (!main || !filtered) return;

	main.innerHTML = "";
	filtered.innerHTML = "";

	for (const entry of st.entries) {
		const box = al_log_is_shown(entry) ? main : filtered;
		box.appendChild(al_log_entry_node(entry));
	}

	main.scrollTop = main.scrollHeight;
	filtered.scrollTop = filtered.scrollHeight;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// INGESTION HOOK
// --------------------------------------------------------------------------------------------------------------------------------- //

function al_log_hook() {
	const st = al_log_state();
	if (st.hooked || typeof parent.add_log !== "function") return;

	st.hooked = true;
	parent.__al_add_log = parent.add_log;
	parent.add_log = function(message, color) {
		if (parent.mode && parent.mode.dom_tests) return;
		if (parent.inside === "payments") return;
		if (parent.game_logs) {
			parent.game_logs.push([message, color]);
			while (parent.game_logs.length > 1000) parent.game_logs.shift();
		}
		al_log_push(message, color);
	};
}

function al_log_seed() {
	const st = al_log_state();
	if (st.seeded) return;
	st.seeded = true;
	if (!parent.game_logs) return;

	for (const old of parent.game_logs.slice(-200)) {
		st.entries.push({
			html: old[0],
			color: old[1] || "white",
			time: 0,
			cat: al_log_category(old[0])
		});
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// GEOMETRY
// --------------------------------------------------------------------------------------------------------------------------------- //

function al_log_apply_geometry() {
	const st = al_log_state();
	const doc = parent.document;
	const log = doc.getElementById("gamelog");
	if (!log) return;

	if (!st.base_w || !st.base_h) {
		const rect = log.getBoundingClientRect();
		if (rect.width < 50 || rect.height < 20) return;
		st.base_w = rect.width;
		st.base_h = rect.height;
	}

	const width = Math.round(st.base_w * 1.5);
	const height = Math.round(st.base_h * 1.25);
	const shift = width - Math.round(st.base_w);

	let style = doc.getElementById("al-log-style");
	if (!style) {
		style = doc.createElement("style");
		style.id = "al-log-style";
		doc.head.appendChild(style);
	}

	style.textContent = `
		#gamelog, #gamelog-filtered {
			width: ${width}px !important;
			height: ${height}px !important;
			margin-left: -${shift}px !important;
			position: relative !important;
			z-index: 100 !important;
			background: rgba(0,0,0,0.82) !important;
			overflow-y: auto !important;
			overflow-x: hidden !important;
		}
		#al-log-tabs, #al-log-filters {
			width: ${width}px !important;
			margin-left: -${shift}px !important;
			position: relative !important;
			z-index: 100 !important;
			display: flex !important;
			font-family: pixel !important;
			background: rgba(0,0,0,0.9) !important;
			border-top: 2px solid #555 !important;
		}
		#al-log-tabs > div, #al-log-filters > div {
			flex: 1 !important;
			text-align: center !important;
			cursor: pointer !important;
			user-select: none !important;
		}
		#al-log-tabs > div {
			height: 26px !important;
			line-height: 26px !important;
			font-size: 20px !important;
		}
		#al-log-filters > div {
			height: 22px !important;
			line-height: 22px !important;
			font-size: 16px !important;
		}
	`;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UI
// --------------------------------------------------------------------------------------------------------------------------------- //

function al_log_paint_controls() {
	const st = al_log_state();
	const doc = parent.document;

	for (const name of ["log", "filtered"]) {
		const tab = doc.getElementById(`al-log-tab-${name}`);
		if (!tab) continue;
		tab.style.background = st.tab === name ? "#1D1A5C" : "#222";
		tab.style.color = st.tab === name ? "#FFF" : "#999";
	}

	for (const f of al_log_filters()) {
		const btn = doc.getElementById(`al-log-filter-${f.key}`);
		if (!btn) continue;
		btn.style.background = st.show[f.key] ? "#151342" : "#222";
		btn.style.color = st.show[f.key] ? "#FFF" : "#666";
	}

	const main = doc.getElementById("gamelog");
	const filtered = doc.getElementById("gamelog-filtered");
	if (main) main.style.display = st.tab === "log" ? "block" : "none";
	if (filtered) filtered.style.display = st.tab === "filtered" ? "block" : "none";
}

function al_log_build_ui() {
	const st = al_log_state();
	const doc = parent.document;
	const log = doc.getElementById("gamelog");
	if (!log || doc.getElementById("al-log-tabs")) return;

	const filtered = doc.createElement("div");
	filtered.id = "gamelog-filtered";
	filtered.className = log.className;
	filtered.style.display = "none";
	log.parentNode.insertBefore(filtered, log.nextSibling);

	const filter_bar = doc.createElement("div");
	filter_bar.id = "al-log-filters";
	filter_bar.className = "enableclicks";
	for (const f of al_log_filters()) {
		const btn = doc.createElement("div");
		btn.id = `al-log-filter-${f.key}`;
		btn.className = "enableclicks";
		btn.textContent = f.label;
		btn.onclick = () => {
			st.show[f.key] = !st.show[f.key];
			al_log_paint_controls();
			al_log_render_all();
		};
		filter_bar.appendChild(btn);
	}
	log.parentNode.insertBefore(filter_bar, log);

	const tab_bar = doc.createElement("div");
	tab_bar.id = "al-log-tabs";
	tab_bar.className = "enableclicks";
	for (const tab of [{ key: "log", label: "Log" }, { key: "filtered", label: "Filtered" }]) {
		const btn = doc.createElement("div");
		btn.id = `al-log-tab-${tab.key}`;
		btn.className = "enableclicks";
		btn.textContent = tab.label;
		btn.onclick = () => {
			st.tab = tab.key;
			al_log_paint_controls();
		};
		tab_bar.appendChild(btn);
	}
	log.parentNode.insertBefore(tab_bar, filter_bar);

	al_log_paint_controls();
}

function enhance_game_log() {
	al_log_state();
	al_log_seed();
	al_log_build_ui();
	al_log_apply_geometry();
	al_log_hook();
	al_log_render_all();

	const st = al_log_state();
	if (!st.resize_hooked) {
		st.resize_hooked = true;
		parent.addEventListener("resize", () => setTimeout(al_log_apply_geometry, 100));
	}
}
