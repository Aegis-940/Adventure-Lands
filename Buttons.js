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
	createFloatingButton("ToggleRoleMode", TANK_ROLES[who_is_tank].label, () => {
		who_is_tank = (who_is_tank + 1) % TANK_ROLES.length;
		tank_name = TANK_ROLES[who_is_tank].name;

		set("who_is_tank", who_is_tank);
		set("tank_name", tank_name);
		const label = TANK_ROLES[who_is_tank].label;

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
