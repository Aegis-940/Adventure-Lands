// -------------------------------------------------------------------- //
// BOTTOM BUTTONS - TODO: CHANGE TO REGULAR BUTTONS
// -------------------------------------------------------------------- //

function fight_solo_or_group(title) {
	if (!parent.caracAL) {
		add_bottom_button("ToggleFightMode", title, () => {
			FIGHT_AS_A_TEAM = !FIGHT_AS_A_TEAM;
			set_button_value("ToggleFightMode", FIGHT_AS_A_TEAM ? "Group" : "Solo");

			title = FIGHT_AS_A_TEAM ? "Group" : "Solo";
			log("Fight mode now: " + (FIGHT_AS_A_TEAM ? "GROUP" : "SOLO"));

			GROUP_OR_SOLO_BUTTON_TITLE = title;
			return GROUP_OR_SOLO_BUTTON_TITLE;
		});
	}
}

function taunt_active() {
	if (!parent.caracAL) {
		add_bottom_button("ToggleTauntMode", TAUNT_BUTTON_TITLE, () => {
			TAUNT_MODE = !TAUNT_MODE;
			TAUNT_BUTTON_TITLE = TAUNT_MODE ? "Taunt" : "No Taunt";
			set_button_value("ToggleTauntMode", TAUNT_BUTTON_TITLE);
			log("Taunt mode now: " + (TAUNT_MODE ? "Active" : "Inactive"));
			return TAUNT_MODE;
		});
	}
}

// -------------------------------------------------------------------- //
// REMOVING BUTTONS
// -------------------------------------------------------------------- //

function remove_floating_button(id) {
	const btn = window.top.document.getElementById(id);
	if (btn) btn.remove();
}

function remove_all_floating_buttons() {
	FLOATING_BUTTON_IDS.forEach(id => remove_floating_button(id));
	FLOATING_BUTTON_IDS.length = 0;
}

// -------------------------------------------------------------------- //
// CREATE FLOATING BUTTONS
// -------------------------------------------------------------------- //

function create_floating_button(id, label, on_click, style_overrides = {}) {
	remove_floating_button(id);

	if (!FLOATING_BUTTON_IDS.includes(id)) {
		FLOATING_BUTTON_IDS.push(id);
	}

	const {
		top = "50vh",
		right = "20px",
		fontSize = "14px",
		minWidth = "120px",
		height = "35px",
		border = "2px solid #888",
		title = ""
	} = style_overrides;

	const btn = window.top.document.createElement("button");
	btn.id = id;
	btn.innerText = label;
	btn.title = title;
	btn.addEventListener("click", on_click);

	Object.assign(btn.style, {
		position: "fixed",
		top,
		right,
		transform: "translateY(-50%)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: "0",
		fontSize,
		zIndex: "9999",
		background: "#000",
		color: "#fff",
		border,
		borderRadius: "4px",
		cursor: "pointer",
		minWidth,
		height
	});

	window.top.document.body.appendChild(btn);
}

// -------------------------------------------------------------------- //
// GENERAL BUTTONS
// -------------------------------------------------------------------- //

function create_map_movement_window(custom_actions = []) {
	const id = "mapMovementWindow";
	const existing = window.top.document.getElementById(id);
	if (existing) existing.remove();

	const win = window.top.document.createElement("div");
	win.id = id;
	win.className = "floating-map-window";

	Object.assign(win.style, {
		position: "fixed",
		top: "380px",
		right: "2px",
		width: "300px",
		padding: "8px",
		background: "rgba(0, 0, 0, 0.5)",
		color: "#fff",
		border: "3px solid rgba(255, 255, 255, 0.2)",
		borderRadius: "5px",
		backdropFilter: "blur(1px)",
		zIndex: 9999,
		fontFamily: "sans-serif",
		fontSize: "14px",
		cursor: "move",
	});

	win.innerHTML = `
		<div style="font-weight: bold; margin-bottom: 10px;">🧭 Map Movement</div>
		<div id="map-btns" style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px;"></div>
		<div id="char-btns" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-bottom: 8px;"></div>
		<div id="custom-btns" style="display: flex; flex-wrap: wrap; gap: 5px;"></div>
	`;

	window.top.document.body.appendChild(win);
	make_draggable(win);

	function add_button(container_id, id, label, on_click) {
		const container = win.querySelector(`#${container_id}`);
		const btn = window.top.document.createElement("button");
		btn.id = id;
		btn.innerText = label;
		btn.addEventListener("click", on_click);

		Object.assign(btn.style, {
			padding: "6px 10px",
			fontSize: "13px",
			background: "rgba(0, 0, 0, 0.5)",
			color: "#fff",
			border: "2px solid rgba(255, 255, 255, 0.3)",
			borderRadius: "3px",
			cursor: "pointer",
			flex: "1 1 30%",
		});

		container.appendChild(btn);
	}

	// Region buttons
	add_button("map-btns", "btnMainland", "🌍 Main", () => smart_move({ map: "main", x: -36, y: -153 }));
	add_button("map-btns", "btnDesertland", "☀️ Desert", () => smart_move("desertland"));
	add_button("map-btns", "btnSnowland", "❄️ Snow", () => smart_move("winterland"));

	// Character buttons
	add_button("char-btns", "btnUlric", "🛡️ Ulric", () => move_to_character("Ulric"));
	add_button("char-btns", "btnMyras", "🧪 Myras", () => move_to_character("Myras"));
	add_button("char-btns", "btnRiva", "🏹 Riva", () => move_to_character("Riva"));
	add_button("char-btns", "btnRiff", "💰 Riff", () => move_to_character("Riff"));

	// Custom buttons
	custom_actions.forEach(({ id, label, onClick }) => {
		add_button("custom-btns", id, label, onClick);
	});
}
