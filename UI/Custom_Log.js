// --------------------------------------------------------------------------------------------------------------------------------- //
// CUSTOM GAME LOG
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_custom_log_window() {
	// Only create if it doesn't exist
	if (parent.document.getElementById("custom-log-window")) return;

	const doc = parent.document;

	// Create main window
	const div = doc.createElement("div");
	div.id = "custom-log-window";
	div.style.position = "absolute";
	div.style.bottom = "1px";
	div.style.right = "650px";
	div.style.width = "350px";
	div.style.height = "260px";
	div.style.background = "rgba(0,0,0,0.66)";
	div.style.color = "#fff";
	div.style.overflow = "hidden";
	div.style.zIndex = 9999;
	div.style.fontSize = "22px";
	div.style.fontFamily = "pixel";
	div.style.padding = "0";
	div.style.border = "4px solid #888";
	div.style.display = "flex";
	div.style.flexDirection = "column";
	div.style.cursor = "default";

	// --- Drag logic ---
	let is_dragging = false, drag_offset_x = 0, drag_offset_y = 0;

	// Drag handle (top bar)
	const drag_handle = doc.createElement("div");
	drag_handle.style.height = "18px";
	drag_handle.style.background = "#444";
	drag_handle.style.cursor = "move";
	drag_handle.style.display = "flex";
	drag_handle.style.alignItems = "center";
	drag_handle.style.justifyContent = "flex-start";
	drag_handle.style.paddingLeft = "8px";
	drag_handle.style.fontSize = "16px";
	drag_handle.style.fontFamily = "pixel";
	drag_handle.style.color = "#fff";
	drag_handle.textContent = "Custom Log";

	drag_handle.onmousedown = function (e) {
		is_dragging = true;
		drag_offset_x = e.clientX - div.offsetLeft;
		drag_offset_y = e.clientY - div.offsetTop;
		doc.body.style.userSelect = "none";
	};

	doc.onmousemove = function (e) {
		if (is_dragging) {
			div.style.left = (e.clientX - drag_offset_x) + "px";
			div.style.top = (e.clientY - drag_offset_y) + "px";
			div.style.right = ""; // Unset right when dragging
			div.style.bottom = ""; // Unset bottom when dragging
		}
	};

	doc.onmouseup = function () {
		is_dragging = false;
		doc.body.style.userSelect = "";
	};

	div.appendChild(drag_handle);

	// --- Tabs ---
	const tab_bar = doc.createElement("div");
	tab_bar.style.display = "flex";
	tab_bar.style.background = "#222";
	tab_bar.style.borderBottom = "2px solid #888";
	tab_bar.style.height = "32px";
	tab_bar.style.alignItems = "center";

	const tabs = [
		{ name: "All", id: "tab-all" },
		{ name: "General", id: "tab-general" },
		{ name: "Alerts", id: "tab-alerts" },
		{ name: "Errors", id: "tab-errors" }
	];

	// Store current tab in window
	div._currentTab = "All";

	// --- Log containers for each tab ---
	const log_containers = {};
	const alert_states = {};
	// For checkboxes: which tabs are included in "All"
	const include_in_all = {
		"General": true,
		"Alerts": true,
		"Errors": true
	};

	// Store all log entries for each tab for dynamic All tab updates
	const log_history = {
		"General": [],
		"Alerts": [],
		"Errors": []
	};

	for (const tab of tabs) {
		const tab_div = doc.createElement("div");
		tab_div.id = `custom-log-${tab.id}`;
		tab_div.style.flex = "1";
		tab_div.style.overflowY = "auto";
		tab_div.style.display = tab.name === "All" ? "block" : "none";
		tab_div.style.height = "100%";
		div.appendChild(tab_div);
		log_containers[tab.name] = tab_div;
		alert_states[tab.name] = false;
	}

	// --- Tab buttons with alert indicators and checkboxes ---
	for (const tab of tabs) {
		const btn = doc.createElement("button");
		btn.textContent = tab.name;
		btn.style.flex = "1";
		btn.style.height = "100%";
		btn.style.background = tab.name === "All" ? "#444" : "#222";
		btn.style.color = "#fff";
		btn.style.border = "none";
		btn.style.fontFamily = "pixel";
		btn.style.fontSize = "20px";
		btn.style.cursor = "pointer";
		btn.id = `btn-${tab.id}`;
		btn.style.display = "flex";
		btn.style.alignItems = "center";
		btn.style.justifyContent = "center";
		btn.style.position = "relative";

		// Alert indicator span
		const alert_span = doc.createElement("span");
		alert_span.textContent = "";
		alert_span.style.color = "#fff";
		alert_span.style.marginLeft = "8px";
		alert_span.style.fontWeight = "bold";
		alert_span.id = `alert-${tab.id}`;
		btn.appendChild(alert_span);

		// Add checkbox for General, Alerts, and Errors tabs
		if (tab.name !== "All") {
			const checkbox = doc.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = true;
			checkbox.style.marginLeft = "6px";
			checkbox.style.transform = "scale(1.2)";
			checkbox.title = `Include ${tab.name} messages in All tab`;
			checkbox.onclick = (e) => {
				include_in_all[tab.name] = checkbox.checked;
				update_all_tab(log_containers, log_history, include_in_all);
			};
			btn.appendChild(checkbox);
		}

		btn.onclick = () => {
			// Switch tab
			div._currentTab = tab.name;
			for (const t of tabs) {
				log_containers[t.name].style.display = t.name === tab.name ? "block" : "none";
				tab_bar.querySelector(`#btn-${t.id}`).style.background = t.name === tab.name ? "#444" : "#222";
				// Clear alert when tab is viewed
				const alert_elem = tab_bar.querySelector(`#alert-${t.id}`);
				if (alert_elem) alert_elem.textContent = "";
				alert_states[t.name] = false;
			}
		};
		tab_bar.appendChild(btn);
	}

	div.appendChild(tab_bar);

	// Move log containers after tab bar
	for (const tab of tabs) {
		div.appendChild(log_containers[tab.name]);
	}

	doc.body.appendChild(div);

	// Store containers, alert state, include_in_all, and log_history globally for log() to use
	parent._custom_log_tabs = log_containers;
	parent._custom_log_window = div;
	parent._custom_log_alerts = alert_states;
	parent._custom_log_includeInAll = include_in_all;
	parent._custom_log_history = log_history;
}

// Helper to update the All tab when checkboxes change
function update_all_tab(log_containers, log_history, include_in_all) {
	const all_div = log_containers["All"];
	all_div.innerHTML = "";
	let all_entries = [];
	for (const tab_name of ["General", "Alerts", "Errors"]) {
		if (include_in_all[tab_name]) {
			all_entries = all_entries.concat(log_history[tab_name]);
		}
	}
	// Sort by timestamp (oldest first)
	all_entries.sort((a, b) => a.time - b.time);
	// Only keep the most recent 100
	all_entries = all_entries.slice(-100);
	for (const entry of all_entries) {
		const p = parent.document.createElement("div");
		p.textContent = entry.text;
		p.style.color = entry.color;
		p.style.padding = "2px";
		all_div.appendChild(p);
	}
	all_div.scrollTop = all_div.scrollHeight;
}

// Modified log function to support All tab and checkboxes
function log(msg, color = "#fff", type = "General") {
	create_custom_log_window();
	const log_containers = parent._custom_log_tabs;
	const div = parent._custom_log_window;
	const alert_states = parent._custom_log_alerts;
	const include_in_all = parent._custom_log_includeInAll;
	const log_history = parent._custom_log_history;

	// Support "General", "Alerts", "Errors" as valid types
	let tab_name = "General";
	if (type === "Errors") tab_name = "Errors";
	else if (type === "Alerts") tab_name = "Alerts";

	const log_div = log_containers[tab_name];

	const time = Date.now();
	const text = `[${new Date(time).toLocaleTimeString()}] ${msg}`;

	// Store in history for this tab
	if (!log_history[tab_name]) log_history[tab_name] = [];
	log_history[tab_name].push({ text, color, time });
	// Keep only the most recent 100 messages per tab
	while (log_history[tab_name].length > 100) log_history[tab_name].shift();

	// Add to tab display
	const p = parent.document.createElement("div");
	p.textContent = text;
	p.style.color = color;
	p.style.padding = "2px";
	log_div.appendChild(p);
	while (log_div.children.length > 100) log_div.removeChild(log_div.firstChild);

	// If this tab is visible, scroll to bottom
	if (div._currentTab === tab_name) {
		log_div.scrollTop = log_div.scrollHeight;
	} else {
		// Show alert (!) if new message arrives in a hidden tab
		if (!alert_states[tab_name]) {
			const alert_elem = parent.document.getElementById(`alert-tab-${tab_name.toLowerCase()}`);
			if (alert_elem) alert_elem.textContent = "*";
			alert_states[tab_name] = true;
		}
	}

	// Also log to All tab if enabled for this type
	if (tab_name !== "All" && include_in_all[tab_name]) {
		// Add to All history and update All tab
		if (!log_history["All"]) log_history["All"] = [];
		log_history["All"].push({ text, color, time, source: tab_name });
		// Only keep the most recent 100 in All history
		while (log_history["All"].length > 100) log_history["All"].shift();
		update_all_tab(log_containers, log_history, include_in_all);
	}
}
