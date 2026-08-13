// Bank Viewer + Saver Script for Adventure Land

const STACK_BANK_ITEMS = true; // Set to false to list all items individually

function pretty3(q) {
	if (q < 10_000) return `${q}`;
	if (q >= 1_000_000) return q >= 100_000_000 ? `${Math.floor(q / 1_000_000)}m` : `${strip(q / 1_000_000)}m`;
	return q >= 100_000 ? `${Math.floor(q / 1_000)}k` : `${strip(q / 1_000)}k`;
}

function strip(num) {
	let fixed = num.toFixed(1);
	return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function save_bank_local() {
	if (character.bank) {
	localStorage.setItem("savedBank", JSON.stringify(character.bank));
	game_log("💾 Bank saved!");
	} else {
	game_log("⚠️ No bank data found.");
	}
}

function load_bank_from_local_storage() {
	const saved = localStorage.getItem("savedBank");
	if (saved) return JSON.parse(saved);
	game_log("⚠️ No saved bank data.");
	return null;
}

function render_items(categories, used, total) {
	categories = categories.filter(([, items]) => items.length > 0);
	let html = `
	<div style="position:relative; border:5px solid gray; background:black; padding:10px; width:90%; height:90%;">
		<div style="position:absolute; top:5px; right:10px; font-size:24px; color:white; z-index:10;">
		${used}/${total}
		</div>
	`;

	categories.forEach(([label, items]) => {
	html += `
		<div style="float:left; margin-left:5px;">
		<div class="gamebutton gamebutton-small" style="margin-bottom:5px;">${label}</div>
		<div style="margin-bottom:10px;">
	`;

	items.forEach(item => {
		// Build an onclick that withdraws, then re-renders the ATM window
		const lvl_arg = item.level != null ? item.level : null;
		// Single quotes only, deliberately: item_container() embeds this whole string
		// into a double-quoted onclick="..." HTML attribute, so it can't contain "
		// itself without corrupting the markup (which is what was happening before).
		const onclick = `
		parent.$('#maincode')[0].contentWindow
			.withdraw_item('${item.name}', ${lvl_arg}, ${1})
			.then(() => {
			parent.hide_modal();
			parent.$('#maincode')[0].contentWindow.render_bank_items();
			});
		`;
		let opts = {
		skin: G.items[item.name].skin,
		onclick,
		title: `Withdraw ${item.name}${lvl_arg !== null ? " (lvl " + lvl_arg + ")" : ""}`
		};

		let item_div = parent.item_container(opts, item);

		if (item.p) {
		const tag_colors = {
			festive: "#79ff7e", firehazard: "#f79b11", glitched: "grey",
			gooped: "#64B867", legacy: "white", lucky: "#00f3ff",
			shiny: "#99b2d8", superfast: "#c681dc"
		};
		const tag = item.p[0]?.toUpperCase() || "?";
		const color = tag_colors[item.p] || "grey";
		const tag_div = `<div class="trruui imu" style="border-color:black;color:${color};">${tag}</div>`;
		// Anchored to the END of the string, not the first match — item_container()'s
		// markup can have more than one "</div></div>" sequence (icon/level-badge
		// wrappers), and a plain .replace() would splice the tag into the wrong spot.
		item_div = item_div.replace(/<\/div><\/div>\s*$/, `</div>${tag_div}</div>`);
		}

		html += item_div;
	});

	html += `</div></div>`;
	});

	html += `<div style="clear:both;"></div></div>`;

	// Close any modal already open before showing this one — otherwise each open/re-render
	// stacks a new modal on top instead of replacing it.
	parent.hide_modal();
	parent.show_modal(html, {
	wrap: false,
	hideinbackground: true,
	url: "/docs/guide/all/items"
	});
}

function render_bank_items() {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return;

	const slot_ids = [
	"helmet","chest","pants","gloves","shoes","cape","ring",
	"earring","amulet","belt","orb","weapon","shield",
	"offhand","elixir","pot","scroll","material","exchange",""
	];
	const categories = [
	["Helmets", []], ["Armors", []], ["Underarmors", []],
	["Gloves", []], ["Shoes", []], ["Capes", []],
	["Rings", []], ["Earrings", []], ["Amulets", []],
	["Belts", []], ["Orbs", []], ["Weapons", []],
	["Shields", []], ["Offhands", []], ["Elixirs", []],
	["Potions", []], ["Scrolls", []],
	["Crafting and Collecting", []],
	["Exchangeables", []], ["Others", []]
	];

	function itm_cmp(a, b) {
	if (a == null) return b == null ? 0 : 1;
	if (b == null) return -1;
	if (a.name !== b.name) return a.name < b.name ? -1 : 1;
	return (b.level ?? 0) - (a.level ?? 0);
	}

	object_sort(G.items, "gold_value").forEach(([id, def]) => {
	if (def.ignore) return;
	for (let ci = 0; ci < categories.length; ci++) {
		let type = slot_ids[ci];
		if (
		!type || def.type === type ||
		(type === "offhand" && ["source", "quiver", "misc_offhand"].includes(def.type)) ||
		(type === "scroll" && ["cscroll", "uscroll", "pscroll", "offering"].includes(def.type)) ||
		(type === "exchange" && def.e)
		) {
		let slice = [];
		for (let pack in bank_data) {
			let arr = bank_data[pack];
			if (!Array.isArray(arr)) continue;
			arr.forEach(it => { if (it && it.name === id) slice.push(it); });
		}
		slice.sort(itm_cmp);
		categories[ci][1].push(slice);
		break;
		}
	}
	});

	// Stack or flatten
	categories.forEach(cat => {
	const flat = cat[1].flat();
	if (STACK_BANK_ITEMS) {
		const map = new Map();
		flat.forEach(item => {
		const key = `${item.name}:${item.level}:${item.p || ""}`;
		if (!map.has(key)) map.set(key, { ...item, q: item.q || 1 });
		else map.get(key).q += item.q || 1;
		});
		cat[1] = Array.from(map.values()).map(it => ({ ...it, q: pretty3(it.q) }));
	} else {
		cat[1] = flat.map(it => ({ ...it, q: it.q != null ? pretty3(it.q) : undefined }));
	}
	cat[1].sort((a, b) => (a.name === b.name ? 0 : (a.name > b.name ? 1 : -1)));
	});

	let used = 0, total = 0;
	Object.values(bank_data).forEach(arr => {
	if (Array.isArray(arr)) {
		total += arr.length;
		used += arr.filter(x => !!x).length;
	}
	});

	render_items(categories, used, total);
	save_bank_local()
}

function add_bank_buttons() {
	const $ = parent.$;
	const trc = $("#toprightcorner");
	if (!trc.length) return setTimeout(add_bank_buttons, 500);

	$("#bankbutton,#saveBankButton").remove();

	const bank_btn = $(`
	<div id="bankbutton" class="gamebutton"
		 onclick="parent.$('#maincode')[0].contentWindow.render_bank_items()">
		🏧
	</div>`);
	const save_btn = $((`
	<div id="saveBankButton" class="gamebutton"
		 onclick="parent.$('#maincode')[0].contentWindow.save_bank_local()">
		💾
	</div>`));

	trc.children().first().after(save_btn).after(bank_btn);
}

// Make sure your async withdraw_item() is defined in maincode BEFORE you click 🏧!
