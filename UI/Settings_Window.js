// --------------------------------------------------------------------------------------------------------------------------------- //
// SETTINGS WINDOW — live in-game config for per-character target monsters. Persisted via
// localStorage (shared across all 4 characters' tabs, same origin — same mechanism
// state_cache_loop()/read_state_cache() already rely on), read back by Shared/Game_Config.js's
// WARRIOR_TARGET/HEALER_TARGET/RANGER_TARGET at each character's next reload.
// --------------------------------------------------------------------------------------------------------------------------------- //

// One entry per setting this window edits. Extend this array (not copy-pasted rows) to
// add more settings later — the row-building loop below reads it generically.
const SETTINGS_DESCRIPTORS = [
	{ label: "Warrior (Ulric)", storage_key: "AL_target_Ulric", default: "bscorpion" },
	{ label: "Healer (Myras)",  storage_key: "AL_target_Myras", default: "bscorpion" },
	{ label: "Ranger (Riva)",   storage_key: "AL_target_Riva",  default: "bscorpion" },
];

const ALL_CHARACTERS = ["Ulric", "Myras", "Riva", "Riff"];

function open_settings_window() {
	// locations/send_cm live in Shared/Game_Config.js/Shared/Messaging.js, both loaded in
	// the same parallel batch as this file with no ordering guarantee -- this only runs on
	// a user click though (by which point loading is long done), so this is cheap
	// insurance rather than a real expected case.
	if (typeof locations === "undefined" || typeof send_cm !== "function") {
		game_log("⚠️ Settings window: still loading, try again in a moment.");
		return;
	}

	const doc = parent.document;
	if (doc.getElementById("settings-window")) return; // already open

	const monster_names = Object.keys(locations).sort();

	const div = doc.createElement("div");
	div.id = "settings-window";
	div.style.position = "absolute";
	const WINDOW_WIDTH = 300;
	const WINDOW_HEIGHT = 260; // approximate -- content auto-sizes, only used to center initially
	div.style.left = ((parent.window.innerWidth - WINDOW_WIDTH) / 2) + "px";
	div.style.top = ((parent.window.innerHeight - WINDOW_HEIGHT) / 2) + "px";
	div.style.width = WINDOW_WIDTH + "px";
	div.style.background = "rgba(0,0,0,0.85)";
	div.style.color = "#fff";
	div.style.zIndex = 9999;
	div.style.fontSize = "14px";
	div.style.fontFamily = "sans-serif";
	div.style.border = "2px solid #888";
	div.style.borderRadius = "4px";
	div.style.overflow = "hidden";

	// Drag handle (title bar)
	const drag_handle = doc.createElement("div");
	drag_handle.style.height = "24px";
	drag_handle.style.background = "#444";
	drag_handle.style.cursor = "move";
	drag_handle.style.display = "flex";
	drag_handle.style.alignItems = "center";
	drag_handle.style.paddingLeft = "8px";
	drag_handle.style.fontWeight = "bold";
	drag_handle.textContent = "⚙️ Settings";
	make_draggable(div, drag_handle); // Shared/Widgets.js
	div.appendChild(drag_handle);

	const body = doc.createElement("div");
	body.style.padding = "10px";
	body.style.display = "flex";
	body.style.flexDirection = "column";
	body.style.gap = "8px";

	const selects = {};
	for (const setting of SETTINGS_DESCRIPTORS) {
		const row = doc.createElement("div");
		row.style.display = "flex";
		row.style.flexDirection = "column";
		row.style.gap = "2px";

		const label = doc.createElement("label");
		label.textContent = setting.label;
		row.appendChild(label);

		const select = doc.createElement("select");
		select.style.width = "100%";
		for (const name of monster_names) {
			const option = doc.createElement("option");
			option.value = name;
			option.textContent = name;
			select.appendChild(option);
		}
		select.value = localStorage.getItem(setting.storage_key) || setting.default;
		selects[setting.storage_key] = select;
		row.appendChild(select);

		body.appendChild(row);
	}

	const button_row = doc.createElement("div");
	button_row.style.display = "flex";
	button_row.style.gap = "8px";
	button_row.style.marginTop = "6px";

	const save_btn = doc.createElement("button");
	save_btn.textContent = "Save and Reload";
	save_btn.style.flex = "1";
	save_btn.style.cursor = "pointer";
	save_btn.onclick = () => {
		for (const setting of SETTINGS_DESCRIPTORS) {
			localStorage.setItem(setting.storage_key, selects[setting.storage_key].value);
		}
		// Broadcast to the other 3 -- reuses the existing "reload" CM_HANDLERS entry
		// (Shared/Messaging.js), same reload mechanism the toprightcorner button uses.
		for (const name of ALL_CHARACTERS) {
			if (name !== character.name) send_cm(name, { type: "reload" });
		}
		parent.window.location.reload();
	};

	const close_btn = doc.createElement("button");
	close_btn.textContent = "Close";
	close_btn.style.flex = "1";
	close_btn.style.cursor = "pointer";
	close_btn.onclick = () => div.remove(); // discards whatever's selected -- nothing was written

	button_row.appendChild(save_btn);
	button_row.appendChild(close_btn);
	body.appendChild(button_row);

	div.appendChild(body);
	doc.body.appendChild(div);
}

// Inserts the ⚙️ button right after the existing 🔄 reload button (UI/Remote_Bank_Viewer.js's
// add_reload_button()) -- waits for both #toprightcorner and #reload-btn specifically, rather
// than the "children().first().after(...)" pattern used elsewhere, so relative placement is
// guaranteed regardless of which of these two parallel-loaded files' auto-invoke runs first.
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
