// --------------------------------------------------------------------------------------------------------------------------------- //
// SETTINGS WINDOW — the ⚙️ window over the settings registry, saved to localStorage
// --------------------------------------------------------------------------------------------------------------------------------- //

const ALL_CHARACTERS = ["Ulric", "Myras", "Riva", "Riff"];
const SETTINGS_GRID_SECTIONS = ["Bosses & events", "Exchange"];

function settings_input(doc, s, value) {
	const input = doc.createElement(s.type === "select" ? "select" : "input");

	if (s.type === "checkbox") {
		input.type = "checkbox";
		input.checked = value;
		return input;
	}

	if (s.type === "number") {
		input.type = "number";
		input.min = s.min;
		input.max = s.max;
		input.style.width = "70px";
		input.value = value;
		return input;
	}

	input.style.width = "100%";
	for (const choice of setting_options(s)) {
		const option = doc.createElement("option");
		option.value = choice.value;
		option.textContent = choice.text;
		input.appendChild(option);
	}
	input.value = value;
	return input;
}

function settings_row(doc, s, input) {
	const row = doc.createElement(s.type === "checkbox" ? "label" : "div");
	row.style.display = "flex";
	row.style.gap = s.type === "select" ? "2px" : "6px";
	row.style.flexDirection = s.type === "select" ? "column" : "row";
	row.style.alignItems = s.type === "select" ? "stretch" : "center";
	if (s.type === "number") row.style.justifyContent = "space-between";
	if (s.type === "checkbox") row.style.cursor = "pointer";
	if (s.indent) row.style.marginLeft = "22px";

	const label = doc.createElement("span");
	label.textContent = s.label;
	if (s.type === "checkbox") {
		row.appendChild(input);
		row.appendChild(label);
	} else {
		row.appendChild(label);
		row.appendChild(input);
	}
	return row;
}

function settings_section(doc, title) {
	const header = doc.createElement("div");
	header.textContent = title;
	header.style.fontWeight = "bold";
	header.style.borderBottom = "1px solid #666";
	header.style.marginTop = "4px";

	const rows = doc.createElement("div");
	rows.style.display = "grid";
	rows.style.gridTemplateColumns = SETTINGS_GRID_SECTIONS.includes(title) ? "1fr 1fr" : "1fr";
	rows.style.gap = "6px";
	return { header, rows };
}

function input_value(s, input) {
	if (s.type === "checkbox") return input.checked;
	if (s.type === "number") return Number(input.value);
	return input.value;
}

function save_settings(inputs) {
	let changed = 0;
	for (const s of settings_list()) {
		if (inputs[s.name] && save_setting(s.name, input_value(s, inputs[s.name]))) changed++;
	}
	return changed;
}

function open_settings_window() {
	const doc = parent.document;
	if (doc.getElementById("settings-window")) return;

	const div = doc.createElement("div");
	div.id = "settings-window";
	div.className = "al-panel al-window";
	const WINDOW_WIDTH = 360;
	const BODY_HEIGHT = Math.min(600, parent.window.innerHeight - 120);
	div.style.width = WINDOW_WIDTH + "px";

	const drag_handle = doc.createElement("div");
	drag_handle.className = "al-panel-title";
	drag_handle.textContent = "⚙️ Settings";
	div.appendChild(drag_handle);
	remember_window("settings", div, drag_handle,
		(parent.window.innerWidth - WINDOW_WIDTH) / 2, (parent.window.innerHeight - BODY_HEIGHT - 80) / 2);

	const body = doc.createElement("div");
	body.style.fontSize = "14px";
	body.style.lineHeight = "normal";
	body.style.fontFamily = "sans-serif";
	body.style.padding = "10px";
	body.style.display = "flex";
	body.style.flexDirection = "column";
	body.style.gap = "8px";
	body.style.maxHeight = BODY_HEIGHT + "px";
	body.style.overflowY = "auto";

	const actions = settings_actions();
	if (actions.length) {
		const tools = settings_section(doc, "Tools");
		tools.rows.style.gridTemplateColumns = "1fr 1fr";
		for (const action of actions) {
			const button = doc.createElement("button");
			button.className = "al-button";
			button.textContent = action.label;
			button.style.fontSize = "14px";
			button.onclick = () => {
				div.remove();
				action.on_click();
			};
			tools.rows.appendChild(button);
		}
		body.appendChild(tools.header);
		body.appendChild(tools.rows);
	}

	const inputs = {};
	let section = null;
	for (const s of settings_list()) {
		if (!setting_shown(s)) continue;
		if (!section || section.title !== s.section) {
			section = Object.assign(settings_section(doc, s.section), { title: s.section });
			body.appendChild(section.header);
			body.appendChild(section.rows);
		}
		const input = settings_input(doc, s, setting(s.name));
		inputs[s.name] = input;
		section.rows.appendChild(settings_row(doc, s, input));
	}

	const button_row = doc.createElement("div");
	button_row.style.display = "flex";
	button_row.style.gap = "8px";
	button_row.style.padding = "0 10px 10px";

	const buttons = [
		["Save", () => {
			const changed = save_settings(inputs);
			game_log(`⚙️ ${changed} setting${changed === 1 ? "" : "s"} saved`, "#88CCFF");
			div.remove();
		}],
		["Reload All", () => {
			save_settings(inputs);
			for (const name of ALL_CHARACTERS) {
				if (name !== character.name) send_cm(name, { type: "reload" });
			}
			staggered_reload();
		}],
		["Reload One", () => {
			save_settings(inputs);
			parent.window.location.reload();
		}],
		["Close", () => div.remove()],
	];
	for (const [text, onclick] of buttons) {
		const button = doc.createElement("button");
		button.className = "al-button";
		button.textContent = text;
		button.style.flex = "1";
		button.style.fontSize = "14px";
		button.onclick = onclick;
		button_row.appendChild(button);
	}

	div.appendChild(body);
	div.appendChild(button_row);
	doc.body.appendChild(div);
}

function add_settings_button() {
	toolbar_button("settings-btn", { label: "⚙️", order: 30, title: "Settings", on_click: open_settings_window, keep: true });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Settings Window", add_settings_button);
