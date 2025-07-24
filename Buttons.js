
// -------------------------------------------------------------------- //
// BOTTOM BUTTONS - TODO: CHANGE TO REGULAR BUTTONS
// -------------------------------------------------------------------- //

function fight_solo_or_group(title) {
	
	if (!parent.caracAL) {
		add_bottom_button("ToggleFightMode", title, () => {
			// flip the mode
			fight_as_a_team = !fight_as_a_team;

			// update button text
			set_button_value("ToggleFightMode", fight_as_a_team ? "Group" : "Solo");

			if (fight_as_a_team === true) {
				title = "Group"; 
			} else {
				title = "Solo";
			}

			// feedback
			log("Fight mode now: " + (fight_as_a_team ? "GROUP" : "SOLO"));
			group_or_solo_button_title = title;
			return group_or_solo_button_title;
		});
	}

}

// -------------------------------------------------------------------- //
// REMOVING BUTTONS
// -------------------------------------------------------------------- //

function removeFloatingButton(id) {
  const btn = window.top.document.getElementById(id);
  if (btn) btn.remove();
}

function removeAllFloatingButtons() {
  floatingButtonIds.forEach(id => removeFloatingButton(id));
  floatingButtonIds.length = 0;  // clear the registry
}

// -------------------------------------------------------------------- //
// CREATE FLOTING BUTTONS
// -------------------------------------------------------------------- //

function createFloatingButton(id, label, onClick, styleOverrides = {}) {
  // Remove old one if present
  removeFloatingButton(id);

  // Track created button IDs
  if (!floatingButtonIds.includes(id)) {
    floatingButtonIds.push(id);
  }

  // Extract values from styleOverrides or use defaults
  const {
    top = "50vh",
    right = "20px",
    fontSize = "14px",
	minWidth = "120px",
	height = "35px",
    border = "2px solid #888",
    title = ""
  } = styleOverrides;

  // Create button element
  const btn = window.top.document.createElement("button");
  btn.id = id;
  btn.innerText = label;
  btn.title = title;
  btn.addEventListener("click", onClick);

  // Apply styles
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

  // Append to document
  window.top.document.body.appendChild(btn);
}

// -------------------------------------------------------------------- //
// GENERAL BUTTONS
// -------------------------------------------------------------------- //

function createMapMovementWindow(customActions = []) {
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
  makeDraggable(win);

  function addButton(containerId, id, label, onClick) {
    const container = win.querySelector(`#${containerId}`);
    const btn = window.top.document.createElement("button");
    btn.id = id;
    btn.innerText = label;
    btn.addEventListener("click", onClick);

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
  addButton("map-btns", "btnMainland", "🌍 Main", () => smart_move({ map: "main", x: -36, y: -153 }));
  addButton("map-btns", "btnDesertland", "☀️ Desert", () => smart_move("desertland"));
  addButton("map-btns", "btnSnowland", "❄️ Snow", () => smart_move("winterland"));

  // Character buttons
  addButton("char-btns", "btnUlric", "🛡️ Ulric", () => move_to_character("Ulric"));
  addButton("char-btns", "btnMyras", "🧪 Myras", () => move_to_character("Myras"));
  addButton("char-btns", "btnRiva", "🏹 Riva", () => move_to_character("Riva"));
  addButton("char-btns", "btnRiff", "💰 Riff", () => move_to_character("Riff"));

  // Custom buttons from argument
  customActions.forEach(({ id, label, onClick }) => {
    addButton("custom-btns", id, label, onClick);
  });
}

// -------------------------------------------------------------------- //
// COMBAT TOGGLE
// -------------------------------------------------------------------- //

function toggle_combat() {
	createFloatingButton("ToggleCombat", "⚔️", () => {
	  attack_mode = !attack_mode;
	  const btn = window.top.document.getElementById("ToggleCombat");
	  btn.innerText = attack_mode ? "⚔️" : "🕊️";
		set_message(attack_mode ? "Enabled" : "Combat Off");
		game_log(attack_mode ? "Combat Enabled" : "Combat Disabled")
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
// TOGGLE WHICH CHARACTER IS TANKING
// -------------------------------------------------------------------- //

function toggle_tank_role() {
	// Floating toggle button with sync broadcast
	createFloatingButton("ToggleRoleMode", tankRoles[who_is_tank].label, () => {
		who_is_tank = (who_is_tank + 1) % tankRoles.length;
		tank_name = tankRoles[who_is_tank].name;

		set("who_is_tank", who_is_tank);
		set("tank_name", tank_name);
		const label = tankRoles[who_is_tank].label;

		// Update local button
		const btn = window.top.document.getElementById("ToggleRoleMode");
		if (btn) btn.innerText = label;

		// Broadcast new tank info and label
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
	createFloatingButton("ToggleFollowTank", "➡️", () => {
	  follow_tank = !follow_tank;
	  const btn = window.top.document.getElementById("ToggleFollowTank");
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
// TOGGLE FREE MOVE
// -------------------------------------------------------------------- //

let free_move = true;

function toggle_free_move() {
	createFloatingButton("ToggleFreeMove", "🚶", () => {
	  free_move = !free_move;
	  const btn = window.top.document.getElementById("ToggleFreeMove");
	  btn.innerText = free_move ? "🚶" : "🧍";
		game_log(free_move ? "Free Move During Combat" : "Remain Stationary During Combat");
	}, {
	  top: "2.1vh",
	  right: "725px",
	  minWidth: "57px",
	  height: "57px",
	  fontSize: "24px",
	  border: "4px solid #888",
	  title: "Toggle Stationary / Free Move"
	});
}



// -------------------------------------------------------------------- //
// TOGGLE STATS WINDOW
// -------------------------------------------------------------------- //
/*
let stats_window = true;

function toggle_stats_window() {
	createFloatingButton("ToggleStatsWindow", "📊", () => {
		// Flip the state
		stats_window = !stats_window;

		const btn = window.top.document.getElementById("ToggleStatsWindow");
		btn.innerText = "📊"; // Optional: could show e.g. 📊/❌ if you want visual toggle

		if (!stats_window) {
			game_log("📉 Stats Window Disabled");
			removeAllFloatingStatsWindows();
			window._statsWin = null;
		} else {
			game_log("📈 Stats Window Enabled");
			window._statsWin = createTeamStatsWindow();
		}
	}, {
		top: "2.1vh",
		right: "788px",
		minWidth: "57px",
		height: "57px",
		fontSize: "24px",
		border: "4px solid #888",
		title: "Toggle Stats Window On/Off"
	});
}
*/
// -------------------------------------------------------------------- //
// TOGGLE AUTO COLLECT LOOT
// -------------------------------------------------------------------- //

function toggle_inventory_check() {
	// Floating toggle button for inventory transfer
	createFloatingButton("ToggleInventoryCheck", "🔁✅", async () => {
		inventory_check_enabled = !inventory_check_enabled;

		const btn = window.top.document.getElementById("ToggleInventoryCheck");
		if (btn) btn.innerText = inventory_check_enabled ? "🔁✅" : "🔁❌";

		if (inventory_check_enabled) {
			game_log("🔁 Inventory check ENABLED");

			// Kick off the function immediately
			checkRemoteInventories();
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
