
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
  const initialIcon = attack_enabled ? "⚔️" : "🕊️";

  create_floating_button("toggle_combat", initialIcon, () => {
    attack_enabled = !attack_enabled;
    if (attack_enabled) start_attack_loop();
    else stop_attack_loop();

    const btn = window.top.document.getElementById("toggle_combat");
    btn.innerText = attack_enabled ? "⚔️" : "🕊️";
    set_message(attack_enabled ? "Combat On" : "Combat Off");
    game_log(attack_enabled ? "Combat Enabled" : "Combat Disabled");
  },{
    top: "2.05vh",
    right: "523px",
    minWidth: "56px",
    height: "56px",
    fontSize: "24px",
    border: "4px solid #888",
    borderRadius: "0px",
    title: "Toggle Combat Mode"
  });
  // Immediately zero out any border-radius on the new button
  setTimeout(() => {
    const btn = window.top.document.getElementById("toggle_combat");
    if (btn) {
      btn.style.borderRadius = "0px";
    }
  }, 0);
}

// -------------------------------------------------------------------- //
// TOGGLE FREE MOVE
// -------------------------------------------------------------------- //

function toggle_free_move() {
  // Determine initial icon based on current state
  const initialIcon = move_enabled ? "🚶" : "🧍";

  create_floating_button("toggle_free_move", initialIcon, () => {
    // Flip the flag and start/stop the loop
    move_enabled = !move_enabled;
    if (move_enabled) start_move_loop();
    else stop_move_loop();

    // Update button icon & log
    const btn = window.top.document.getElementById("toggle_free_move");
    btn.innerText = move_enabled ? "🚶" : "🧍";
    game_log(
      move_enabled
        ? "Free Move During Combat"
        : "Remain Stationary During Combat"
    );
  }, {
    top:     "2.05vh",
    right:   "584px",
    minWidth:"56px",
    height:  "56px",
    fontSize:"24px",
    border:  "4px solid #888",
    borderRadius: "0px",
    title:   "Toggle Stationary / Free Move"
  });
  // Immediately zero out any border-radius on the new button
  setTimeout(() => {
    const btn = window.top.document.getElementById("toggle_free_move");
    if (btn) {
      btn.style.borderRadius = "0px";
    }
  }, 0);
}

// -------------------------------------------------------------------- //
// TOGGLE WHICH CHARACTER IS TANKING
// -------------------------------------------------------------------- //

// Create a toggle button to determine who the tank is and broadcast it
function toggle_tank_role() {
	create_floating_button("toggle_role_mode", TANK_ROLES[who_is_tank].label, () => {
		who_is_tank = (who_is_tank + 1) % TANK_ROLES.length;
		tank_name = TANK_ROLES[who_is_tank].name;

		set("who_is_tank", who_is_tank);
		set("tank_name", tank_name);
		const label = TANK_ROLES[who_is_tank].label;

		const btn = window.top.document.getElementById("toggle_role_mode");
		if (btn) btn.innerText = label;

		for (const name of ["Ulric", "Myras", "Riva"]) {
			if (name !== character.name) {
				send_cm(name, {
					type: "set_tank",
					tank_name,
					who_is_tank,
					label
				});
			}
		}
	}, {
		top: "2.1vh",
		right: "585px",
		minWidth: "57px",
		height: "57px",
		fontSize: "24px",
		border: "4px solid #888",
		title: "Toggle Tank Role"
	});
}

// -------------------------------------------------------------------- //
// TOGGLE FOLLOW TANK
// -------------------------------------------------------------------- //

let follow_tank = true;

function toggle_follow_tank() {
	create_floating_button("toggle_follow_tank", "➡️", () => {
		follow_tank = !follow_tank;
		const btn = window.top.document.getElementById("toggle_follow_tank");
		btn.innerText = follow_tank ? "➡️" : "⏸️";
		game_log(follow_tank ? "Follow Tank" : "Don't Follow Tank");
	}, {
		top: "2.1vh",
		right: "663px",
		minWidth: "57px",
		height: "57px",
		fontSize: "24px",
		border: "4px solid #888",
		title: "Toggle Follow-Tank Mode"
	});
}

// -------------------------------------------------------------------- //
// TOGGLE AUTO COLLECT LOOT
// -------------------------------------------------------------------- //

function toggle_inventory_check() {
	create_floating_button("toggle_inventory_check", "🔁✅", async () => {
		inventory_check_enabled = !inventory_check_enabled;

		const btn = window.top.document.getElementById("toggle_inventory_check");
		btn.innerText = inventory_check_enabled ? "🔁✅" : "🔁❌";

		if (inventory_check_enabled) {
			game_log("🔁 Inventory check ENABLED");
			check_remote_inventories();
		} else {
			game_log("⛔ Inventory check DISABLED");
		}
	}, {
		top: "2.1vh",
		right: "523px",
		minWidth: "57px",
		height: "57px",
		fontSize: "24px",
		border: "4px solid #888",
		title: "Toggle Inventory Transfer"
	});
}

// -------------------------------------------------------------------- //
// TOGGLE MAINTAIN POSITION
// -------------------------------------------------------------------- //

function toggle_maintain_position() {
	const BUTTON_ID = "toggle_maintain_position";

	let btn = window.top.document.getElementById(BUTTON_ID);

	if (!btn) {
		// Create button if it doesn't exist
		create_floating_button(BUTTON_ID, "🌐", () => {
			toggle_radius_lock();

			const btn = window.top.document.getElementById(BUTTON_ID);
			btn.innerText = radius_lock_enabled ? "🌐" : "🎯";

			if (radius_lock_enabled) {
				game_log("🌐 Maintain Position ENABLED");
			} else {
				game_log("🎯 Maintain Position DISABLED");
			}
		}, {
			top: "2.1vh",
			right: "645px",
			minWidth: "56px",
			height: "56px",
			fontSize: "24px",
			border: "4px solid #888",
			title: "Toggle Maintain Position"
		});

		setTimeout(() => {
			const btn = window.top.document.getElementById(BUTTON_ID);
			if (btn) btn.style.borderRadius = "0px";
		}, 0);
	} else {
		// Button already exists, simulate a click to toggle
		btn.click();
	}
}
