
const bankMode = 'tab';
// 'stack' - groups identical items together and sums their quantities
// 'flat'  - shows every item individually, no grouping
// 'tab'   - shows each bank tab preserving exact slot positions

function add_bank_button() {
	const $ = parent.$;
	$('#bankbutton').remove();
	$(`<div id="bankbutton" class="gamebutton" title="View Player Banks" style="cursor:pointer">🏧</div>`)
		.on('click', showBankSelector)
		.insertAfter($("#toprightcorner").children().first());
}

async function showBankSelector() {
	const $ = parent.$;
	try {
		const data = await fetch("https://aldata.earthiverse.ca/active-owners").then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
		if (!data.some(e => e.owner === character.owner))
			data.unshift({ owner: character.owner, characters: [character.name], bank: character.bank || loadBankFromLocalStorage() });

		const html = `<div style="padding:10px;">
			<div style="position:relative;font-size:16px;margin-bottom:6px;display:inline-block;">
				<div style="position:absolute;top:-1px;left:-1px;color:black;z-index:0;user-select:none;">Select a public bank:</div>
				<div style="position:relative;color:white;z-index:1;">Select a public bank:</div>
			</div>
			${data.filter(({ characters }) => characters.length).map(({ owner, characters }) =>
			`<div class="gamebutton" style="margin:2px;" onclick="parent.$('#maincode')[0].contentWindow.renderBankItems('${owner}')">${characters[0]}</div>`
		).join('')}</div>`;

		parent.show_modal(html, { wrap: false, hideinbackground: true, title: "Public Banks" });
	} catch (e) {
		game_log(`Couldn't load public banks: ${e.message}`, "red");
	}
}

async function renderBankItems(ownerId) {
	let bankData = !ownerId && (character.bank || loadBankFromLocalStorage());
	if (!bankData) {
		try {
			const r = await fetch(`https://aldata.earthiverse.ca/bank/${ownerId || character.owner}`);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			bankData = await r.json();
		} catch (err) { return game_log(`Couldn't fetch bank data: ${err.message}`); }
	}
	if (!bankData) return game_log("No bank data found.");

	if (bankMode === 'tab') {
		const packs = Object.keys(bankData)
			.filter(k => Array.isArray(bankData[k]))
			.sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
		const categories = [];
		let used = 0, total = 0;
		for (let p = 0; p < packs.length; p++) {
			const pack = packs[p], arr = bankData[pack];
			total += arr.length;
			const items = [];
			for (let i = 0; i < arr.length; i++) {
				const it = arr[i];
				if (it) used++;
				items.push(it?.q ? { ...it, q: pretty3(it.q) } : it);
			}
			if (items.length) categories.push([pack, items]);
		}
		return renderItems(categories, used, total, true);
	}

	const byName = new Map();
	let used = 0, total = 0;
	for (const pack in bankData) {
		const arr = bankData[pack];
		if (!Array.isArray(arr)) continue;
		total += arr.length;
		for (let i = 0; i < arr.length; i++) {
			const it = arr[i];
			if (!it) continue;
			used++;
			let bucket = byName.get(it.name);
			if (!bucket) { bucket = []; byName.set(it.name, bucket); }
			bucket.push(it);
		}
	}

	const slotIds = [
		"helmet", "chest", "pants", "gloves", "shoes", "cape", "ring",
		"earring", "amulet", "belt", "orb", "weapon", "shield",
		"offhand", "elixir", "pot", "scroll", "material", "exchange", ""
	];
	const catNames = [
		"Helmets", "Armors", "Underarmors", "Gloves", "Shoes", "Capes",
		"Rings", "Earrings", "Amulets", "Belts", "Orbs", "Weapons",
		"Shields", "Offhands", "Elixirs", "Potions", "Scrolls",
		"Crafting and Collecting", "Exchangeables", "Others"
	];
	const categories = catNames.map(n => [n, []]);

	object_sort(G.items, "gold_value").forEach(([id, def]) => {
		if (def.ignore) return;
		for (let ci = 0; ci < slotIds.length; ci++) {
			const type = slotIds[ci];
			if (type && def.type !== type
				&& !(type === "offhand" && (def.type === "source" || def.type === "quiver" || def.type === "misc_offhand"))
				&& !(type === "scroll" && (def.type === "cscroll" || def.type === "uscroll" || def.type === "pscroll" || def.type === "offering"))
				&& !(type === "exchange" && def.e)
			) continue;

			const raw = byName.get(id);
			if (raw?.length) {
				if (bankMode === 'stack') {
					const map = new Map();
					for (let k = 0; k < raw.length; k++) {
						const it = raw[k], key = `${it.level}:${it.p || ""}`;
						const ex = map.get(key);
						if (ex) ex.q += (it.q || 1);
						else map.set(key, { name: it.name, level: it.level, p: it.p, q: it.q || 1 });
					}
					for (const d of map.values()) { d.q = pretty3(d.q); categories[ci][1].push(d); }
				} else {
					for (let k = 0; k < raw.length; k++) {
						const it = raw[k];
						categories[ci][1].push(it.q ? { name: it.name, level: it.level, p: it.p, q: pretty3(it.q) } : it);
					}
				}
			}
			break;
		}
	});

	renderItems(categories, used, total);
}

function renderItems(categories, used, total, tab = false) {
	const cats = categories.filter(([, items]) => items.length);
	const parts = [
		`<div style='position:relative;border:5px solid gray;background-color:black;padding:36px 12px 12px 12px;width:1875px;overflow-x:auto;'>`,
		`<div style="position:absolute;top:5px;right:10px;font-size:24px;color:white;z-index:10;">${used}/${total}</div>`,
	];
	for (let i = 0; i < cats.length; i++) {
		const [label, items] = cats[i];
		parts.push(`<div style='${tab ? "display:inline-flex;flex-direction:column;margin-left:20px;" : "float:left;margin-left:5px;"}'><div class='gamebutton gamebutton-small' style='margin-bottom:5px;${tab ? "margin-left:2px;width:350px;box-sizing:border-box;" : ""}'>${label}</div><div style='margin-bottom:10px;${tab ? "display:grid;grid-template-columns:repeat(7,50px);gap:0;" : ""}'>`);
		for (let j = 0; j < items.length; j++) {
			const item = items[j];
			if (!item) {
				parts.push(`<div style='position:relative;display:inline-block;margin:2px;border:2px solid gray;height:46px;width:46px;background:rgba(255,255,255,0.05);vertical-align:top;'></div>`);
				continue;
			}
			let div = parent.item_container({ skin: G.items[item.name].skin, onclick: `render_item_info('${item.name}')` }, item);
			if (item.p) {
				const pm = pmap[item.p];
				const corner = pm
					? `<div class='trruui imu' style='border-color:${pm[0]};color:${pm[1]}'>${pm[2]}</div>`
					: `<div class='trruui imu' style='border-color:black;color:grey'>?</div>`;
				div = div.replace('</div></div>', `</div>${corner}</div>`);
			}
			parts.push(div);
		}
		parts.push(`</div></div>`);
	}
	parts.push(`<div style='clear:both;'></div></div>`);
	parent.show_modal(parts.join(''), { wrap: false, hideinbackground: true, url: "/docs/guide/all/items" });
}

const pmap = {
	festive: ['grey', '#00FF00', 'F'], firehazard: ['grey', '#FF4500', 'H'],
	glitched: ['grey', '#00CED1', 'G'], gooped: ['grey', '#3CB371', 'G'],
	legacy: ['grey', '#C0C0C0', 'L'], lucky: ['grey', '#7CFC00', 'L'],
	shiny: ['grey', '#FFD700', 'S'], superfast: ['grey', '#8A2BE2', 'S'],
};

function saveBankLocal() {
	if (character.bank) { localStorage.setItem("savedBank", JSON.stringify(character.bank)); game_log("Bank saved!"); }
	else game_log("No bank data!");
}

function loadBankFromLocalStorage() {
	const s = localStorage.getItem("savedBank");
	if (s) return JSON.parse(s);
	game_log("No saved bank data found.");
	return null;
}

function pretty3(q) {
	if (q < 10_000) return `${q}`;
	if (q >= 1_000_000) {
		const m = q / 1_000_000;
		return `${m >= 100 ? m | 0 : strip(m)}m`;
	}
	const k = q / 1_000;
	return `${k >= 100 ? k | 0 : strip(k)}k`;
}

function strip(n) {
	const f = n.toFixed(1);
	return f.endsWith('.0') ? f.slice(0, -2) : f;
}


// // Bank Viewer + Saver Script for Adventure Land

// const stackBankItems = true; // Set to false to list all items individually

// function pretty3(q) {
//   if (q < 10_000) return `${q}`;
//   if (q >= 1_000_000) return q >= 100_000_000 ? `${Math.floor(q / 1_000_000)}m` : `${strip(q / 1_000_000)}m`;
//   return q >= 100_000 ? `${Math.floor(q / 1_000)}k` : `${strip(q / 1_000)}k`;
// }

// function strip(num) {
//   let fixed = num.toFixed(1);
//   return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
// }

// function saveBankLocal() {
//   if (character.bank) {
//     localStorage.setItem("savedBank", JSON.stringify(character.bank));
//     game_log("💾 Bank saved!");
//   } else {
//     game_log("⚠️ No bank data found.");
//   }
// }

// function load_bank_from_local_storage() {
//   const saved = localStorage.getItem("savedBank");
//   if (saved) return JSON.parse(saved);
//   game_log("⚠️ No saved bank data.");
//   return null;
// }

// function render_items(categories, used, total) {
//   categories = categories.filter(([, items]) => items.length > 0);
//   let html = `
//     <div style="position:relative; border:5px solid gray; background:black; padding:10px; width:90%; height:90%;">
//       <div style="position:absolute; top:5px; right:10px; font-size:24px; color:white; z-index:10;">
//         ${used}/${total}
//       </div>
//   `;

//   categories.forEach(([label, items]) => {
//     html += `
//       <div style="float:left; margin-left:5px;">
//         <div class="gamebutton gamebutton-small" style="margin-bottom:5px;">${label}</div>
//         <div style="margin-bottom:10px;">
//     `;

//     items.forEach(item => {
//       // Build an onclick that withdraws, then re-renders the ATM window
//       const lvlArg = item.level != null ? item.level : null;
//       const onclick = `
//         parent.$('#maincode')[0].contentWindow
//           .withdraw_item('${item.name}', ${lvlArg}, ${1})
//           .then(() => {
//             parent.hide_modal();
//             parent.$('#maincode')[0].contentWindow.render_bank_items();
//           });
//       `;
//       let opts = {
//         skin: G.items[item.name].skin,
//         onclick,
//         title: `Withdraw ${item.name}${lvlArg !== null ? ' (lvl ' + lvlArg + ')' : ''}`
//       };

//       let itemDiv = parent.item_container(opts, item);

//       if (item.p) {
//         const tagColors = {
//           festive: "#79ff7e", firehazard: "#f79b11", glitched: "grey",
//           gooped: "#64B867", legacy: "white", lucky: "#00f3ff",
//           shiny: "#99b2d8", superfast: "#c681dc"
//         };
//         const tag = item.p[0]?.toUpperCase() || "?";
//         const color = tagColors[item.p] || "grey";
//         const tagDiv = `<div class="trruui imu" style="border-color:black;color:${color};">${tag}</div>`;
//         itemDiv = itemDiv.replace("</div></div>", `</div>${tagDiv}</div>`);
//       }

//       html += itemDiv;
//     });

//     html += `</div></div>`;
//   });

//   html += `<div style="clear:both;"></div></div>`;

//   parent.show_modal(html, {
//     wrap: false,
//     hideinbackground: true,
//     url: "/docs/guide/all/items"
//   });
// }

// function render_bank_items() {
//   const bankData = character.bank || load_bank_from_local_storage();
//   if (!bankData) return;

//   const slot_ids = [
//     "helmet","chest","pants","gloves","shoes","cape","ring",
//     "earring","amulet","belt","orb","weapon","shield",
//     "offhand","elixir","pot","scroll","material","exchange",""
//   ];
//   const categories = [
//     ["Helmets", []], ["Armors", []], ["Underarmors", []],
//     ["Gloves", []], ["Shoes", []], ["Capes", []],
//     ["Rings", []], ["Earrings", []], ["Amulets", []],
//     ["Belts", []], ["Orbs", []], ["Weapons", []],
//     ["Shields", []], ["Offhands", []], ["Elixirs", []],
//     ["Potions", []], ["Scrolls", []],
//     ["Crafting and Collecting", []],
//     ["Exchangeables", []], ["Others", []]
//   ];

//   function itm_cmp(a, b) {
//     return (a == null) - (b == null)
//       || (a && (a.name < b.name ? -1 : +(a.name > b.name)))
//       || (a && b.level - a.level);
//   }

//   object_sort(G.items, "gold_value").forEach(([id, def]) => {
//     if (def.ignore) return;
//     for (let ci = 0; ci < categories.length; ci++) {
//       let type = slot_ids[ci];
//       if (
//         !type || def.type === type ||
//         (type === "offhand" && ["source", "quiver", "misc_offhand"].includes(def.type)) ||
//         (type === "scroll" && ["cscroll", "uscroll", "pscroll", "offering"].includes(def.type)) ||
//         (type === "exchange" && def.e)
//       ) {
//         let slice = [];
//         for (let pack in bankData) {
//           let arr = bankData[pack];
//           if (!Array.isArray(arr)) continue;
//           arr.forEach(it => { if (it && it.name === id) slice.push(it); });
//         }
//         slice.sort(itm_cmp);
//         categories[ci][1].push(slice);
//         break;
//       }
//     }
//   });

//   // Stack or flatten
//   categories.forEach(cat => {
//     const flat = cat[1].flat();
//     if (stackBankItems) {
//       const map = new Map();
//       flat.forEach(item => {
//         const key = `${item.name}:${item.level}:${item.p || ""}`;
//         if (!map.has(key)) map.set(key, { ...item, q: item.q || 1 });
//         else map.get(key).q += item.q || 1;
//       });
//       cat[1] = Array.from(map.values()).map(it => ({ ...it, q: pretty3(it.q) }));
//     } else {
//       cat[1] = flat.map(it => ({ ...it, q: it.q != null ? pretty3(it.q) : undefined }));
//     }
//     cat[1].sort((a, b) => (a.name > b.name ? 1 : -1));
//   });

//   let used = 0, total = 0;
//   Object.values(bankData).forEach(arr => {
//     if (Array.isArray(arr)) {
//       total += arr.length;
//       used += arr.filter(x => !!x).length;
//     }
//   });

//   render_items(categories, used, total);
//   saveBankLocal()
// }

// function add_bank_buttons() {
//   const $ = parent.$;
//   const trc = $("#toprightcorner");
//   if (!trc.length) return setTimeout(add_bank_buttons, 500);

//   $("#bankbutton,#saveBankButton").remove();

//   const bankBtn = $(`
//     <div id="bankbutton" class="gamebutton"
//          onclick="parent.$('#maincode')[0].contentWindow.render_bank_items()">
//       🏧
//     </div>`);
//   const saveBtn = $((`
//     <div id="saveBankButton" class="gamebutton"
//          onclick="parent.$('#maincode')[0].contentWindow.saveBankLocal()">
//       💾
//     </div>`));

//   trc.children().first().after(saveBtn).after(bankBtn);
// }

// // Make sure your async withdraw_item() is defined in maincode BEFORE you click 🏧!
