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
	div.style.position = "absolute";
	const WINDOW_WIDTH = 360;
	const BODY_HEIGHT = Math.min(600, parent.window.innerHeight - 120);
	div.style.left = ((parent.window.innerWidth - WINDOW_WIDTH) / 2) + "px";
	div.style.top = Math.max(0, (parent.window.innerHeight - BODY_HEIGHT - 80) / 2) + "px";
	div.style.width = WINDOW_WIDTH + "px";
	div.style.background = "rgba(0,0,0,0.85)";
	div.style.color = "#fff";
	div.style.zIndex = 9999;
	div.style.fontSize = "14px";
	div.style.fontFamily = "sans-serif";
	div.style.border = "2px solid #888";
	div.style.borderRadius = "4px";
	div.style.overflow = "hidden";

	const drag_handle = doc.createElement("div");
	drag_handle.style.height = "24px";
	drag_handle.style.background = "#444";
	drag_handle.style.cursor = "move";
	drag_handle.style.display = "flex";
	drag_handle.style.alignItems = "center";
	drag_handle.style.paddingLeft = "8px";
	drag_handle.style.fontWeight = "bold";
	drag_handle.textContent = "⚙️ Settings";
	make_draggable(div, drag_handle);
	div.appendChild(drag_handle);

	const body = doc.createElement("div");
	body.style.padding = "10px";
	body.style.display = "flex";
	body.style.flexDirection = "column";
	body.style.gap = "8px";
	body.style.maxHeight = BODY_HEIGHT + "px";
	body.style.overflowY = "auto";

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
		button.textContent = text;
		button.style.flex = "1";
		button.style.cursor = "pointer";
		button.onclick = onclick;
		button_row.appendChild(button);
	}

	div.appendChild(body);
	div.appendChild(button_row);
	doc.body.appendChild(div);
}

function add_settings_button() {
	when("settings button", () => parent.$("#toprightcorner").length > 0 && parent.$("#reload-btn").length > 0, place_settings_button, 500);
}

function place_settings_button() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	const reload_btn = $("#reload-btn");

	$("#settings-btn").remove();

	const settings_btn = $(`
	<div id="settings-btn" class="gamebutton" style="cursor: pointer;">
		⚙️
	</div>`);
	settings_btn.on("click", open_settings_window);

	reload_btn.after(settings_btn);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Settings Window", add_settings_button);
