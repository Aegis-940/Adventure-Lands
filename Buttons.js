// -------------------------------------------------------------------- //
// BOTTOM BUTTONS - TODO: CHANGE TO REGULAR BUTTONS
// -------------------------------------------------------------------- //

function fight_solo_or_group(title) {
	if (!parent.caracAL) {
		add_bottom_button("toggle_fight_mode", title, () => {
			fight_as_a_team = !fight_as_a_team;
			set_button_value("toggle_fight_mode", fight_as_a_team ? "Group" : "Solo");

			title = fight_as_a_team ? "Group" : "Solo";
			game_log("Fight mode now: " + (fight_as_a_team ? "GROUP" : "SOLO"));
			group_or_solo_button_title = title;
			return group_or_solo_button_title;
		});
	}
}

function taunt_active() {
	if (!parent.caracAL) {
		add_bottom_button("toggle_taunt_mode", taunt_button_title, () => {
			taunt_mode = !taunt_mode;
			taunt_button_title = taunt_mode ? "Taunt" : "No Taunt";
			set_button_value("toggle_taunt_mode", taunt_button_title);
			game_log("Taunt mode now: " + (taunt_mode ? "Active" : "Inactive"));
			return taunt_mode;
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
	floating_button_ids.forEach(id => remove_floating_button(id));
	floating_button_ids.length = 0;
}

// -------------------------------------------------------------------- //
// CREATE FLOATING BUTTONS
// -------------------------------------------------------------------- //

function create_floating_button(id, label, on_click, style_overrides = {}) {
	remove_floating_button(id);

	if (!floating_button_ids.includes(id)) {
		floating_button_ids.push(id);
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
	const id = "map_movement_window";
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

	add_button("map-btns", "btn_mainland", "🌍 Main", () => smart_move({ map: "main", x: -36, y: -153 }));
	add_button("map-btns", "btn_desertland", "☀️ Desert", () => smart_move("desertland"));
	add_button("map-btns", "btn_snowland", "❄️ Snow", () => smart_move("winterland"));

	add_button("char-btns", "btn_ulric", "🛡️ Ulric", () => move_to_character("Ulric"));
	add_button("char-btns", "btn_myras", "🧪 Myras", () => move_to_character("Myras"));
	add_button("char-btns", "btn_riva", "🏹 Riva", () => move_to_character("Riva"));
	add_button("char-btns", "btn_riff", "💰 Riff", () => move_to_character("Riff"));

	custom_actions.forEach(({ id, label, onClick }) => {
		add_button("custom-btns", id, label, onClick);
	});
}

// -------------------------------------------------------------------- //
// COMBAT TOGGLE
// -------------------------------------------------------------------- //

function toggle_combat() {
	create_floating_button("toggle_combat", "⚔️", () => {
		attack_mode = !attack_mode;
		const btn = window.top.document.getElementById("toggle_combat");
		btn.innerText = attack_mode ? "⚔️" : "🕊️";
		set_message(attack_mode ? "Enabled" : "Combat Off");
		game_log(attack_mode ? "Combat Enabled" : "Combat Disabled");
	}, {
		top: "2.1vh",
		right: "523px",
		minWidth: "57px",
		height: "57px",
		fontSize: "24px",
		border: "4px solid #888",
		title: "Toggle Combat Mode"
	});
}

// -------------------------------------------------------------------- //
// BOTTOM BUTTONS - TODO: CHANGE TO REGULAR BUTTONS
// -------------------------------------------------------------------- //

function fight_solo_or_group(title) {
	if (!parent.caracAL) {
		add_bottom_button("toggle_fight_mode", title, () => {
			fight_as_a_team = !fight_as_a_team;
			set_button_value("toggle_fight_mode", fight_as_a_team ? "Group" : "Solo");

			title = fight_as_a_team ? "Group" : "Solo";
			game_log("Fight mode now: " + (fight_as_a_team ? "GROUP" : "SOLO"));
			group_or_solo_button_title = title;
			return group_or_solo_button_title;
		});
	}
}

function taunt_active() {
	if (!parent.caracAL) {
		add_bottom_button("toggle_taunt_mode", taunt_button_title, () => {
			taunt_mode = !taunt_mode;
			taunt_button_title = taunt_mode ? "Taunt" : "No Taunt";
			set_button_value("toggle_taunt_mode", taunt_button_title);
			game_log("Taunt mode now: " + (taunt_mode ? "Active" : "Inactive"));
			return taunt_mode;
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
	floating_button_ids.forEach(id => remove_floating_button(id));
	floating_button_ids.length = 0;
}

// -------------------------------------------------------------------- //
// CREATE FLOATING BUTTONS
// -------------------------------------------------------------------- //

function create_floating_button(id, label, on_click, style_overrides = {}) {
	remove_floating_button(id);

	if (!floating_button_ids.includes(id)) {
		floating_button_ids.push(id);
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
	const id = "map_movement_window";
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

	add_button("map-btns", "btn_mainland", "🌍 Main", () => smart_move({ map: "main", x: -36, y: -153 }));
	add_button("map-btns", "btn_desertland", "☀️ Desert", () => smart_move("desertland"));
	add_button("map-btns", "btn_snowland", "❄️ Snow", () => smart_move("winterland"));

	add_button("char-btns", "btn_ulric", "🛡️ Ulric", () => move_to_character("Ulric"));
	add_button("char-btns", "btn_myras", "🧪 Myras", () => move_to_character("Myras"));
	add_button("char-btns", "btn_riva", "🏹 Riva", () => move_to_character("Riva"));
	add_button("char-btns", "btn_riff", "💰 Riff", () => move_to_character("Riff"));

	custom_actions.forEach(({ id, label, onClick }) => {
		add_button("custom-btns", id, label, onClick);
	});
}

// -------------------------------------------------------------------- //
// COMBAT TOGGLE
// -------------------------------------------------------------------- //

function toggle_combat() {
	create_floating_button("toggle_combat", "⚔️", () => {
		attack_mode = !attack_mode;
		const btn = window.top.document.getElementById("toggle_combat");
		btn.innerText = attack_mode ? "⚔️" : "🕊️";
		set_message(attack_mode ? "Enabled" : "Combat Off");
		game_log(attack_mode ? "Combat Enabled" : "Combat Disabled");
	}, {
		top: "2.1vh",
		right: "523px",
		minWidth: "57px",
		height: "57px",
		fontSize: "24px",
		border: "4px solid #888",
		title: "Toggle Combat Mode"
	});
}

