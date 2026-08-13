
// --------------------------------------------------------------------------------------------------------------------------------- //
// REMOVING BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

function remove_floating_button(id) {
	const btn = window.top.document.getElementById(id);
	if (btn) btn.remove();
}

function remove_all_floating_buttons() {
	FLOATING_BUTTON_IDS.forEach(id => remove_floating_button(id));
	FLOATING_BUTTON_IDS.length = 0;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CREATE FLOATING BUTTONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function create_floating_button(id, label, on_click, style_overrides = {}) {
	remove_floating_button(id);

	// ✅ Add ID only if not already present
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// GENERAL BUTTONS
// --------------------------------------------------------------------------------------------------------------------------------- //

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

	// make_draggable reads/writes el.style.left in pixels, but this window is
	// positioned via top/right — pin down an explicit left before it can be dragged.
	win.style.left = win.offsetLeft + "px";
	win.style.right = "";

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

	add_button("map-btns", "btn_mainland", "🌍 Main", () => smarter_move({ map: "main", x: -36, y: -153 }));
	add_button("map-btns", "btn_desertland", "☀️ Desert", () => smarter_move("desertland"));
	add_button("map-btns", "btn_snowland", "❄️ Snow", () => smarter_move("winterland"));

	add_button("char-btns", "btn_ulric", "🛡️ Ulric", () => move_to_character("Ulric"));
	add_button("char-btns", "btn_myras", "🧪 Myras", () => move_to_character("Myras"));
	add_button("char-btns", "btn_riva", "🏹 Riva", () => move_to_character("Riva"));
	add_button("char-btns", "btn_riff", "💰 Riff", () => move_to_character("Riff"));

	custom_actions.forEach(({ id, label, on_click }) => {
		add_button("custom-btns", id, label, on_click);
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UI LAYOUT & BUTTONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function hide_skills_ui() {
	const doc = parent.document;

	// Hide skill buttons (bottom right grid)
	const skill_buttons = doc.querySelector("#skillbar");
	if (skill_buttons) skill_buttons.style.display = "none";

	// Hide the right panel (contains skills, info, etc.)
	const right_panel = doc.querySelector("#rightcorner");
	if (right_panel) right_panel.style.display = "none";

	// Optional: Hide the "Stats", "Skills", "Inventory" tab buttons
	const tabs = [
		"#rightcornerbuttonskills",
		"#rightcornerbuttonstats",
		"#rightcornerbuttoninventory"
	];
	for (const selector of tabs) {
		const btn = doc.querySelector(selector);
		if (btn) btn.style.display = "none";
	}
}

// Hides the game's native party bar UI
function hide_party_ui() {
	const doc = parent.document;
	// Hide the main party bar (usually #party or #party-frames)
	const party_bar = doc.querySelector("#party, #party-frames");
	if (party_bar) party_bar.style.display = "none";
	// Optionally hide any party-related buttons or elements
	const party_buttons = [
		"#party-button", // Example, adjust as needed
		"#party-leader-icon"
	];
	for (const selector of party_buttons) {
		const btn = doc.querySelector(selector);
		if (btn) btn.style.display = "none";
	}
}

function move_element_up_by_px(element_id, pixels) {
	const el = parent.document.getElementById(element_id);
	if (el) {
	const current_bottom = parseInt(window.getComputedStyle(el).bottom) || 0;
	el.style.bottom = (current_bottom + pixels) + "px";
	}
}

move_element_up_by_px("bottomleftcorner2", 370);
move_element_up_by_px("chatwparty", 370);
move_element_up_by_px("chatinput", 370);

parent.$("#bottomleftcorner").show();

function add_reload_button() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	if (!trc.length) return setTimeout(add_reload_button, 500);


	// Remove any existing reload or stats button to avoid duplicates
	$("#reload-btn").remove();
	$("#stats-btn").remove();

	// Create the stats button (as a div for consistent style)
	const stats_btn = $(`
		<div id="stats-btn" class="gamebutton" style="margin-right: 4px; cursor: pointer;">
			📊
		</div>
	`);
	stats_btn.on("click", () => {
		const doc = parent.document;
		let win = doc.getElementById("ui-statistics-window");
		if (!win) {
			if (typeof ui_window === "function") ui_window();
		} else {
			win.style.display = win.style.display === "none" ? "block" : "none";
		}
	});

	// Create the reload button
	const reload_btn = $(`
		<div id="reload-btn" class="gamebutton" style="margin-right: 0px; cursor: pointer;">
			🔄
		</div>
	`);
	reload_btn.on("click", () => {
		parent.window.location.reload();
	});

	// Insert stats button to the left of reload button
	trc.children().first().after(stats_btn);
	stats_btn.after(reload_btn);
}

add_reload_button();

// --------------------------------------------------------------------------------------------------------------------------------- //
// REMOTE SELLING
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = [
	"hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap",
	"cclaw", "crabclaw", "slimestaff", "stinger", "pstem", "gslime", "coat1", "helmet1",
	"gloves1", "pants1", "shoes1", "wbreeches", "vitring", "helmet", "shoes", "gloves",
	"pmace", "throwingstars", "t2bow", "spear", "dagger", "rapier", "sword", "mushroomstaff",
	"rfangs", "gphelmet", "phelmet", "vitearring", "vitscroll", "hhelmet", "harmor", "hpants",
	"hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring",
	"warmscarf", "snowball", "santasbelt", "lantern", "pclaw", "broom", "skullamulet",
	"iceskates", "carrot", "xmace", "candycanesword", "pmaceofthedead", "ornamentstaff",
	"merry", "rednose", "xmashat", "xmasshoes", "xmassweater", "xmaspants", "mittens",
	"angelwings", "snowflakes", "epyjamas", "ecape", "eears", "eslippers", "carrotsword",
	"pinkie", "oozingterror", "harbringer",
];

function remote_sell_items() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;
		if (item.l === "l" || item.p !== undefined) continue;
		if (SELLABLE_ITEMS.includes(item.name)) {
			sell(i, item.q || 1);
		}
	}
}
