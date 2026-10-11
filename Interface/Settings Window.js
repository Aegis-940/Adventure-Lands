// --------------------------------------------------------------------------------------------------------------------------------- //
// SETTINGS WINDOW — per-character targets and merchant toggles, persisted in localStorage
// --------------------------------------------------------------------------------------------------------------------------------- //

const SETTINGS_DESCRIPTORS = [
	{ label: "Warrior (Ulric)", storage_key: farm_target_key("Ulric"), type: "select", options: monster_options, default: DEFAULT_FARM_TARGET },
	{ label: "Healer (Myras)",  storage_key: farm_target_key("Myras"), type: "select", options: monster_options, default: DEFAULT_FARM_TARGET },
	{ label: "Ranger (Riva)",   storage_key: farm_target_key("Riva"),  type: "select", options: monster_options, default: DEFAULT_FARM_TARGET },
	{ label: "Merchant: Upgrading",  storage_key: "AL_merchant_enabled_upgrading",  type: "checkbox", default: true },
	{ label: "Target item",  storage_key: "AL_merchant_upgrade_target", type: "select", options: upgrade_target_options, default: "", indent: true },
	{ label: "Target level", storage_key: "AL_merchant_upgrade_level",  type: "number", min: 1, max: 12,  default: 10, indent: true },
	{ label: "Target count", storage_key: "AL_merchant_upgrade_count",  type: "number", min: 1, max: 999, default: 1,  indent: true },
	{ label: "Merchant: Crafting",   storage_key: "AL_merchant_enabled_crafting",   type: "checkbox", default: true },
	{ label: "Craft target", storage_key: "AL_merchant_craft_target",   type: "select", options: craft_target_options,   default: "", indent: true },
	{ label: "Merchant: Exchanging", storage_key: "AL_merchant_enabled_exchanging", type: "checkbox", default: true },
	{ label: "Merchant: Fishing",    storage_key: "AL_merchant_enabled_fishing",    type: "checkbox", default: false },
	{ label: "Merchant: Mining",     storage_key: "AL_merchant_enabled_mining",     type: "checkbox", default: false },
];

const ALL_CHARACTERS = ["Ulric", "Myras", "Riva", "Riff"];

function monster_options() {
	return Object.keys(LOCATIONS).sort().map(name => ({ value: name, text: name }));
}

function item_options(names) {
	const options = names
		.map(name => ({ value: name, text: `${G.items[name].name} (${name})` }))
		.sort((a, b) => a.text.localeCompare(b.text));
	return [{ value: "", text: "(none)" }].concat(options);
}

function upgrade_target_options() {
	return item_options(Object.keys(G.items).filter(name => G.items[name].upgrade));
}

function craft_target_options() {
	return item_options(Object.keys(G.craft).filter(name => G.items[name]));
}

function settings_input(doc, setting, stored) {
	const input = doc.createElement(setting.type === "select" ? "select" : "input");

	if (setting.type === "checkbox") {
		input.type = "checkbox";
		input.checked = stored === null ? setting.default : stored === "true";
		return input;
	}

	if (setting.type === "number") {
		input.type = "number";
		input.min = setting.min;
		input.max = setting.max;
		input.style.width = "70px";
		input.value = stored === null ? setting.default : stored;
		return input;
	}

	input.style.width = "100%";
	for (const { value, text } of setting.options()) {
		const option = doc.createElement("option");
		option.value = value;
		option.textContent = text;
		input.appendChild(option);
	}
	input.value = stored === null ? setting.default : stored;
	return input;
}

function settings_row(doc, setting, input) {
	const row = doc.createElement(setting.type === "checkbox" ? "label" : "div");
	row.style.display = "flex";
	row.style.gap = setting.type === "select" ? "2px" : "6px";
	row.style.flexDirection = setting.type === "select" ? "column" : "row";
	row.style.alignItems = setting.type === "select" ? "stretch" : "center";
	if (setting.type === "number") row.style.justifyContent = "space-between";
	if (setting.type === "checkbox") row.style.cursor = "pointer";
	if (setting.indent) row.style.marginLeft = "22px";

	const label = doc.createElement("span");
	label.textContent = setting.label;
	if (setting.type === "checkbox") {
		row.appendChild(input);
		row.appendChild(label);
	} else {
		row.appendChild(label);
		row.appendChild(input);
	}
	return row;
}

function save_settings(inputs) {
	for (const setting of SETTINGS_DESCRIPTORS) {
		const input = inputs[setting.storage_key];
		localStorage.setItem(setting.storage_key, setting.type === "checkbox" ? input.checked : input.value);
	}
}

function open_settings_window() {
	const doc = parent.document;
	if (doc.getElementById("settings-window")) return;

	const div = doc.createElement("div");
	div.id = "settings-window";
	div.style.position = "absolute";
	const WINDOW_WIDTH = 320;
	const WINDOW_HEIGHT = 480;
	div.style.left = ((parent.window.innerWidth - WINDOW_WIDTH) / 2) + "px";
	div.style.top = Math.max(0, (parent.window.innerHeight - WINDOW_HEIGHT) / 2) + "px";
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

	const inputs = {};
	for (const setting of SETTINGS_DESCRIPTORS) {
		const input = settings_input(doc, setting, localStorage.getItem(setting.storage_key));
		inputs[setting.storage_key] = input;
		body.appendChild(settings_row(doc, setting, input));
	}

	const button_row = doc.createElement("div");
	button_row.style.display = "flex";
	button_row.style.gap = "8px";
	button_row.style.marginTop = "6px";

	const buttons = [
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
	body.appendChild(button_row);

	div.appendChild(body);
	doc.body.appendChild(div);
}

function add_settings_button() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	const reload_btn = $("#reload-btn");
	if (!trc.length || !reload_btn.length) return setTimeout(add_settings_button, 500);

	$("#settings-btn").remove();

	const settings_btn = $(`
	<div id="settings-btn" class="gamebutton" style="cursor: pointer;">
		⚙️
	</div>`);
	settings_btn.on("click", open_settings_window);

	reload_btn.after(settings_btn);
}
add_settings_button();
