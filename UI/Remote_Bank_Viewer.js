// Bank Viewer + Saver Script for Adventure Land

const stackBankItems = true; // Set to false to list all items individually

function pretty3(q) {
  if (q < 10_000) return `${q}`;
  if (q >= 1_000_000) return q >= 100_000_000 ? `${Math.floor(q / 1_000_000)}m` : `${strip(q / 1_000_000)}m`;
  return q >= 100_000 ? `${Math.floor(q / 1_000)}k` : `${strip(q / 1_000)}k`;
}

function strip(num) {
  let fixed = num.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

function saveBankLocal() {
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
      const lvlArg = item.level != null ? item.level : null;
      const onclick = `
        parent.$('#maincode')[0].contentWindow
          .withdraw_item('${item.name}', ${lvlArg}, ${1})
          .then(() => {
            parent.hide_modal();
            parent.$('#maincode')[0].contentWindow.render_bank_items();
          });
      `;
      let opts = {
        skin: G.items[item.name].skin,
        onclick,
        title: `Withdraw ${item.name}${lvlArg !== null ? ' (lvl ' + lvlArg + ')' : ''}`
      };

      let itemDiv = parent.item_container(opts, item);

      if (item.p) {
        const tagColors = {
          festive: "#79ff7e", firehazard: "#f79b11", glitched: "grey",
          gooped: "#64B867", legacy: "white", lucky: "#00f3ff",
          shiny: "#99b2d8", superfast: "#c681dc"
        };
        const tag = item.p[0]?.toUpperCase() || "?";
        const color = tagColors[item.p] || "grey";
        const tagDiv = `<div class="trruui imu" style="border-color:black;color:${color};">${tag}</div>`;
        itemDiv = itemDiv.replace("</div></div>", `</div>${tagDiv}</div>`);
      }

      html += itemDiv;
    });

    html += `</div></div>`;
  });

  html += `<div style="clear:both;"></div></div>`;

  parent.show_modal(html, {
    wrap: false,
    hideinbackground: true,
    url: "/docs/guide/all/items"
  });
}

function render_bank_items() {
  const bankData = character.bank || load_bank_from_local_storage();
  if (!bankData) return;

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
    return (a == null) - (b == null)
      || (a && (a.name < b.name ? -1 : +(a.name > b.name)))
      || (a && b.level - a.level);
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
        for (let pack in bankData) {
          let arr = bankData[pack];
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
    if (stackBankItems) {
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
    cat[1].sort((a, b) => (a.name > b.name ? 1 : -1));
  });

  let used = 0, total = 0;
  Object.values(bankData).forEach(arr => {
    if (Array.isArray(arr)) {
      total += arr.length;
      used += arr.filter(x => !!x).length;
    }
  });

  render_items(categories, used, total);
}

function add_bank_buttons() {
  const $ = parent.$;
  const trc = $("#toprightcorner");
  if (!trc.length) return setTimeout(add_bank_buttons, 500);

  $("#bankbutton,#saveBankButton").remove();

  const bankBtn = $(`
    <div id="bankbutton" class="gamebutton"
         onclick="parent.$('#maincode')[0].contentWindow.render_bank_items()">
      🏧
    </div>`);
  const saveBtn = $((`
    <div id="saveBankButton" class="gamebutton"
         onclick="parent.$('#maincode')[0].contentWindow.saveBankLocal()">
      💾
    </div>`));

  trc.children().first().after(saveBtn).after(bankBtn);
}

// Make sure your async withdraw_item() is defined in maincode BEFORE you click 🏧!
