// 1) Withdraw function (must be defined before you open the ATM)
async function withdraw_item(itemName, level = null, total = null) {
  const BANK_LOC = { map: "bank", x: 0, y: -37 };
  await smart_move(BANK_LOC);
  await delay(500);

  // 1) Grab live bank data
  let bankData = character.bank;
  if (!bankData || Object.keys(bankData).length === 0) {
    bankData = load_bank_from_local_storage();
    if (!bankData) {
      game_log("⚠️ No bank data available. Open your bank or save it first.");
      return;
    }
  }

  let remaining = total != null ? total : Infinity;
  let foundAny  = false;

  // 2) Iterate each "items<N>" pack
  for (const packKey of Object.keys(bankData)) {
    if (!packKey.startsWith("items")) continue;
    const slotArr = bankData[packKey];
    if (!Array.isArray(slotArr)) continue;

    // 3) Scan slots in this pack
    for (let slot = 0; slot < slotArr.length && remaining > 0; slot++) {
      const itm = slotArr[slot];
      if (!itm || itm.name !== itemName) continue;
      if (level != null && itm.level !== level) continue;

      foundAny = true;
      const takeCount = Math.min(itm.q || 1, remaining);

      for (let i = 0; i < takeCount; i++) {
        await bank_retrieve(packKey, slot, -1);
        await delay(100);
        remaining--;
        if (remaining <= 0) break;
      }
    }
    if (remaining <= 0) break;
  }

  // 4) Summarize
  if (!foundAny) {
    game_log(`⚠️ No "${itemName}"${level!=null?` level ${level}`:''} found in bank.`);
  } else if (total != null && remaining > 0) {
    const got = total - remaining;
    game_log(`⚠️ Only retrieved ${got}/${total} of ${itemName}.`);
  }

  // 🚀 NEW: refresh the ATM window to reflect your new bank contents
  await delay(200);
  render_bank_items();
}

// 2) Bank Viewer + Saver Script (unchanged except click handlers)
const stackBankItems = true;

function pretty3(q) {
  if (q < 10_000) return `${q}`;
  if (q >= 1_000_000) return q >= 100_000_000
    ? `${Math.floor(q/1_000_000)}m`
    : `${strip(q/1_000_000)}m`;
  return q >= 100_000
    ? `${Math.floor(q/1_000)}k`
    : `${strip(q/1_000)}k`;
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
  categories = categories.filter(([, items]) => items.length>0);
  let html = `
    <div style='position:relative; border:5px solid gray; background:black; padding:10px; width:90%; height:90%;'>
      <div style="position:absolute; top:5px; right:10px; font-size:24px; color:white; z-index:10;">
        ${used}/${total}
      </div>
  `;

  categories.forEach(([label, items]) => {
    html += `
      <div style='float:left; margin-left:5px;'>
        <div class='gamebutton gamebutton-small' style='margin-bottom:5px'>${label}</div>
        <div style='margin-bottom:10px'>
    `;

    items.forEach(item => {
      const lvlArg = item.level!=null ? item.level : null;
      // click now invokes withdraw_item in this same iframe:
      const onclick = `
        withdraw_item(
          '${item.name}',
          ${lvlArg},
          ${item.q && Number(item.q.replace(/[mk]/, '')) || 'null'}
        )
      `;
      let opts = { skin: G.items[item.name].skin, onclick, title: `Withdraw ${item.name}${lvlArg!=null? ' (lvl '+lvlArg+')':''}` };
      let itemDiv = parent.item_container(opts, item);

      if (item.p) {
        const tagColors = {
          festive:"#79ff7e", firehazard:"#f79b11", glitched:"grey",
          gooped:"#64B867", legacy:"white", lucky:"#00f3ff",
          shiny:"#99b2d8", superfast:"#c681dc"
        };
        const tag = item.p[0]?.toUpperCase()||"?";
        const color = tagColors[item.p]||"grey";
        const tagDiv = `<div class='trruui imu' style='border-color:black;color:${color}'>${tag}</div>`;
        itemDiv = itemDiv.replace('</div></div>', `</div>${tagDiv}</div>`);
      }

      html += itemDiv;
    });

    html += `</div></div>`;
  });

  html += `<div style='clear:both;'></div></div>`;
  parent.show_modal(html, {
    wrap: false, hideinbackground: true, url: "/docs/guide/all/items"
  });
}

function render_bank_items() {
  const bankData = character.bank || load_bank_from_local_storage();
  if (!bankData) return;

  const slot_ids = [/* ... */,""];
  const categories = [
    ["Helmets",[]],["Armors",[]],["Underarmors",[]],
    ["Gloves",[]],["Shoes",[]],["Capes",[]],
    ["Rings",[]],["Earrings",[]],["Amulets",[]],
    ["Belts",[]],["Orbs",[]],["Weapons",[]],
    ["Shields",[]],["Offhands",[]],["Elixirs",[]],
    ["Potions",[]],["Scrolls",[]],
    ["Crafting and Collecting",[]],
    ["Exchangeables",[]],["Others",[]]
  ];

  function itm_cmp(a,b){/* ... */}
  object_sort(G.items,"gold_value").forEach(([id,def])=>{/* ... */});
  categories.forEach(cat=>{/* ... */});

  let used=0, total=0;
  Object.values(bankData).forEach(arr=>{
    if(Array.isArray(arr)){
      total += arr.length;
      used  += arr.filter(x=>!!x).length;
    }
  });

  render_items(categories, used, total);
}

function add_bank_buttons() {
  const $=parent.$, trc=$("#toprightcorner");
  if (!trc.length) return setTimeout(add_bank_buttons,500);
  $("#bankbutton,#saveBankButton").remove();

  const bankBtn = $(`
    <div id="bankbutton" class="gamebutton"
         onclick="render_bank_items()">
      🏧
    </div>`);
  const saveBtn = $(`
    <div id="saveBankButton" class="gamebutton"
         onclick="saveBankLocal()">
      💾
    </div>`);

  trc.children().first().after(saveBtn).after(bankBtn);
}
