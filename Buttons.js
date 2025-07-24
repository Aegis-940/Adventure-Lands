// -------------------------------------------------------------------- //
// BOTTOM BUTTONS - TODO: CHANGE TO REGULAR BUTTONS
// -------------------------------------------------------------------- //

function fight_solo_or_group(title) {
	if (!parent.caracAL) {
		add_bottom_button("ToggleFightMode", title, () => {
			// Flip the mode
			fight_as_a_team = !fight_as_a_team;

			// Update button text
			set_button_value("ToggleFightMode", fight_as_a_team ? "Group" : "Solo");

			title = fight_as_a_team ? "Group" : "Solo";

			// Feedback
			log("Fight mode now: " + (fight_as_a_team ? "GROUP" : "SOLO"));
			group_or_solo_button_title = title;
			return group_or_solo_button_title;
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
		font_size = "14px",
		min_width = "120px",
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
		fontSize: font_size,
		zIndex: "9999",
		background: "#000",
		color: "#fff",
		border,
		borderRadius: "4px",
		cursor: "pointer",
		minWidth: min_width,
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
		pa
