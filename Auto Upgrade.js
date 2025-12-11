
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_INTERVAL = 75;

const UPGRADE_PROFILE = {
  pouchbow:    { scroll0_until: 3, scroll1_until: 8, scroll2_until: 9, primling_from: 7, max_level: 9 },
  fireblade:   { scroll0_until: 0, scroll1_until: 4, scroll2_until: 7, primling_from: 7, max_level: 7 },
  firebow:     { scroll0_until: 0, scroll1_until: 4, scroll2_until: 7, primling_from: 7, max_level: 7 },
  firestaff:   { scroll0_until: 0, scroll1_until: 4, scroll2_until: 7, primling_from: 7, max_level: 7 },
  hbow:        { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 7 },
  wingedboots: { scroll0_until: 2, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 6 },
  basher:      { scroll0_until: 0, scroll1_until: 3, scroll2_until: 6, primling_from: 5, max_level: 6 },
  cape:        { scroll0_until: 0, scroll1_until: 5, scroll2_until: 6, primling_from: 5, max_level: 5 },
  coat:        { scroll0_until: 4, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 9 },
  ololipop:    { scroll0_until: 2, scroll1_until: 8, scroll2_until: 9, primling_from: 7, max_level: 9 },
  glolipop:    { scroll0_until: 2, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 9 },
  quiver:      { scroll0_until: 3, scroll1_until: 6, scroll2_until: 9, primling_from: 7, max_level: 6 },
  crossbow:    { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 6, max_level: 4 },
  basher:      { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 6, max_level: 5 },
  broom:       { scroll0_until: 2, scroll1_until: 7, scroll2_until: 9, primling_from: 7, max_level: 7 },
  harbringer:  { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 4, max_level: 4 },
  // Add more items as needed
};

const COMBINE_PROFILE = {
  wbook0:      { scroll0_until: 2, scroll1_until: 4, scroll2_until: 6, primling_from: 4, max_level: 3 },
  dexring:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  strring:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  intring:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  dexbelt:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  strbelt:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  intbelt:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  dexamulet:   { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  stramulet:   { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  intamulet:   { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  dexearring:  { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  strearring:  { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  intearring:  { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  skullamulet: { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
  talkingskull:{ scroll0_until: 1, scroll1_until: 2, scroll2_until: 6, primling_from: 2, max_level: 3 },
  // Add more items as needed
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// SIMPLE GRACE UPGRADE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function simple_grace_upgrade() {
    let response = await upgrade(7, null, 8, true);
    game_log("Upgrade response: " + JSON.stringify(response));
    return response;
}

//simple_grace_upgrade().then(r => game_log("Returned: " + JSON.stringify(r)));

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO UPGRADE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function withdraw_upgrade_scrolls() {

    await parent.$('#maincode')[0].contentWindow.render_bank_items();
    await delay(1000);
    await parent.hide_modal();

    // 1. Build a list of possible scroll types
    const scrollTypes = ["scroll0", "scroll1", "scroll2", "cscroll0", "cscroll1", "cscroll2"];

    // 2. Count empty inventory slots, if < 10, end and announce
    const emptySlots = character.items.filter(it => !it).length;
    if (emptySlots < 10) {
        game_log(`❌ Not enough inventory space to withdraw scrolls. Need at least 10 free slots, have ${emptySlots}.`);
        return;
    }

    for (const item of scrollTypes) {
        try {
            withdraw_item(item);
            await delay(200); // Small delay for UI/bank sync
        } catch (e) {
        game_log("⚠️ Withdraw Scroll error:", "#FF0000");
        game_log(e);
        }
    }

    game_log("✅ Scroll withdrawal check complete.");
}

async function withdraw_offering() {

    try {
        await withdraw_item("offeringp");
        await delay(50);
    } catch (e) {
        game_log("⚠️ Withdraw Offering error:", "#FF0000");
        game_log(e);
    }   

}

async function withdraw_upgradeable_items() {
    // 1. If not at BANK_LOCATION, smart move to BANK_LOCATION
    if (character.map !== BANK_LOCATION.map || character.x !== BANK_LOCATION.x || character.y !== BANK_LOCATION.y) {
        await smarter_move(BANK_LOCATION);
        await delay(500);
    }

    function count_empty_inventory() {
        return character.items.filter(it => !it).length;
    }

    let bank_data = character.bank || load_bank_from_local_storage();
    if (!bank_data) {
        game_log("No bank data available. Please open the bank or save bank data first.");
        return;
    }

    // --- Withdraw UPGRADE_PROFILE items (leave at least 3 empty slots) ---
    let free_slots = count_empty_inventory();
    if (free_slots <= 3) {
        game_log("❌ Not enough inventory space to withdraw upgrade items.");
        return;
    }

    for (const itemName in UPGRADE_PROFILE) {
        const maxLevel = UPGRADE_PROFILE[itemName].max_level;

        for (const pack in bank_data) {
            if (!Array.isArray(bank_data[pack])) continue;
            for (let slot = 0; slot < bank_data[pack].length; slot++) {
                const item = bank_data[pack][slot];
                if (
                    item &&
                    item.name === itemName &&
                    (typeof item.level !== "number" || item.level < maxLevel)
                ) {
                    free_slots = count_empty_inventory();
                    if (free_slots <= 3) break;
                    const max_withdrawable = free_slots - 3;
                    const to_withdraw = Math.min(item.q || 1, max_withdrawable);
                    if (to_withdraw > 0) {
                        await withdraw_item(itemName, item.level, to_withdraw);
                        await delay(200);
                    }
                }
                free_slots = count_empty_inventory();
                if (free_slots <= 3) break;
            }
            free_slots = count_empty_inventory();
            if (free_slots <= 3) break;
        }
        free_slots = count_empty_inventory();
        if (free_slots <= 3) break;
    }

    // --- Withdraw COMBINE_PROFILE items (multiples of 3, leave at least 3 empty slots) ---
    free_slots = count_empty_inventory();
    for (const itemName in COMBINE_PROFILE) {
        const maxLevel = COMBINE_PROFILE[itemName].max_level;

        // Gather all items of this type and below maxLevel in the bank, grouped by level
        let levelMap = {};
        for (const pack in bank_data) {
            if (!Array.isArray(bank_data[pack])) continue;
            for (let slot = 0; slot < bank_data[pack].length; slot++) {
                const item = bank_data[pack][slot];
                if (
                    item &&
                    item.name === itemName &&
                    (typeof item.level !== "number" || item.level < maxLevel)
                ) {
                    const lvl = item.level || 0;
                    if (!levelMap[lvl]) levelMap[lvl] = 0;
                    levelMap[lvl] += item.q || 1;
                }
            }
        }

        // Withdraw in multiples of 3, but always leave at least 3 free slots
        for (const levelStr of Object.keys(levelMap).sort((a, b) => a - b)) {
            let level = Number(levelStr);
            let count = levelMap[level];

            while (count >= 3) {
                free_slots = count_empty_inventory();
                let max_withdrawable = Math.floor((free_slots - 3) / 3) * 3;
                if (max_withdrawable < 3) break;
                let to_withdraw = Math.min(Math.floor(count / 3) * 3, max_withdrawable);
                if (to_withdraw < 3) break;

                let remaining = to_withdraw;
                for (const pack in bank_data) {
                    if (!Array.isArray(bank_data[pack])) continue;
                    for (let slot = 0; slot < bank_data[pack].length; slot++) {
                        const item = bank_data[pack][slot];
                        if (
                            item &&
                            item.name === itemName &&
                            (item.level || 0) === level
                        ) {
                            free_slots = count_empty_inventory();
                            if (free_slots <= 3) break;
                            const withdraw_count = Math.min(item.q || 1, remaining, free_slots - 3);
                            if (withdraw_count > 0) {
                                await withdraw_item(itemName, level, withdraw_count);
                                remaining -= withdraw_count;
                                count -= withdraw_count;
                                await delay(50);
                            }
                            if (remaining <= 0 || count_empty_inventory() <= 3) break;
                        }
                    }
                    if (remaining <= 0 || count_empty_inventory() <= 3) break;
                }
                if (count_empty_inventory() <= 3 || count < 3) break;
            }
            if (count_empty_inventory() <= 3) break;
        }
        if (count_empty_inventory() <= 3) break;
    }

    game_log("✅ Finished withdrawing upgrade and compound items, leaving at least 3 inventory slots free.");
}

async function auto_upgrade_item(level) {
    for (let i = 0; i < character.items.length; i++) {
        const item = character.items[i];
        if (!item || item.level !== level) continue;

        const profile = UPGRADE_PROFILE[item.name];
        if (!profile || item.level >= profile.max_level) continue;

        // Determine the correct scroll for this item's level
        let scrollname =
            item.level < profile.scroll0_until ? "scroll0"
            : item.level < profile.scroll1_until ? "scroll1"
            : "scroll2";

        // Find the scroll in inventory
        let scroll_slot = null;
        let scroll = null;
        for (let j = 0; j < character.items.length; j++) {
            const inv_item = character.items[j];
            if (inv_item && inv_item.name === scrollname) {
                scroll_slot = j;
                scroll = inv_item;
                break;
            }
        }

        if (!scroll) {
            // Check if character has enough gold before buying
            const scroll_cost = G.items[scrollname]?.g || 0;
            if (character.gold < scroll_cost) {
                game_log(`❌ Not enough gold to buy ${scrollname} for upgrading ${item.name} (level ${item.level}). Ending auto-upgrade.`);
                return "end";
            }
            else {
                parent.buy(scrollname);
                game_log(`Buying ${scrollname} for upgrading ${item.name} (level ${item.level})`);
                // Only buy one scroll, then return immediately
                return "wait";
            }
        }

        // Check for offering if needed
        let offering_slot = null;
        if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
            for (let j = 0; j < character.items.length; j++) {
                const inv_item = character.items[j];
                if (inv_item && inv_item.name === "offeringp") {
                    offering_slot = j;
                    break;
                }
            }
            // If no offering is found, skip this item and continue to the next
            if (offering_slot === null) {
                game_log(`Skipping ${item.name} (level ${item.level}): No offeringp found for upgrade requiring it.`);
                continue;
            }
        }

        // // Use massproduction if available
        // if (can_use("massproduction")) {
        //     await use_skill("massproduction");
        // }

        // Upgrade the item
        if (!character.q.upgrade) {
            if (item.level <= 6 && can_use("massproduction")) {
                use_skill("massproduction");
                await delay(10);
            }
            if (item.level >= 7 && can_use("massproductionpp")) {
                use_skill("massproductionpp");
                await delay(10);
            }
            parent.socket.emit("upgrade", {
                item_num: i,
                scroll_num: scroll_slot,
                offering_num: offering_slot,
                clevel: item.level,
            });
            game_log(`Upgrading ${item.name} (level ${item.level}) with ${scrollname}`);
        }

        return "done";
    }
    game_log("No valid items found for upgrade.");
    return "none";
}

async function auto_combine_item(level) {
    // Build a map of combinable items by name and level
    const buckets = new Map();

    for (let i = 0; i < character.items.length; i++) {
        const item = character.items[i];
        if (!item) continue;

        const profile = COMBINE_PROFILE[item.name];
        if (!profile) continue;
        if (typeof item.level !== "number" || item.level !== level || item.level >= profile.max_level) continue;

        const key = `${item.name}:${item.level}`;
        if (!buckets.has(key)) {
            buckets.set(key, [item.level, [i]]);
        } else {
            buckets.get(key)[1].push(i);
        }
    }

    // First, check if any group needs a scroll and buy only one scroll per call
    for (const [key, [lvl, slots]] of buckets) {
        if (slots.length < 3) continue;

        const itemName = key.split(":")[0];
        const profile = COMBINE_PROFILE[itemName];

        // Determine the correct scroll for this item's level
        let scrollname =
            lvl < profile.scroll0_until ? "cscroll0"
            : lvl < profile.scroll1_until ? "cscroll1"
            : "cscroll2";

        // Find the scroll in inventory (since find_item is deleted)
        let scroll_slot = null;
        let scroll = null;
        for (let j = 0; j < character.items.length; j++) {
            const inv_item = character.items[j];
            if (inv_item && inv_item.name === scrollname) {
                scroll_slot = j;
                scroll = inv_item;
                break;
            }
        }

        // Check for primling requirement and skip if not present
        if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
            const has_primling = character.items.some(inv_item => inv_item && inv_item.name === "primling");
            if (!has_primling) {
                game_log(`Skipping combine for ${itemName} (level ${lvl}): No primling found for combine requiring it.`);
                continue;
            }
        }

        if (!scroll) {
            // Check if character has enough gold before buying
            const scroll_cost = G.items[scrollname]?.g || 0;
            if (character.gold < scroll_cost) {
                game_log(`❌ Not enough gold to buy ${scrollname} for combining ${itemName} (level ${lvl}). Ending auto-combine.`);
                return "end";
            }
            else {
                parent.buy(scrollname);
                game_log(`Buying ${scrollname} for combining ${itemName} (level ${lvl})`);
                // Only buy one scroll, then return immediately
                return "wait";
            }
        }
    }

    // Try to combine the first valid group of 3 (only if scroll is present)
    for (const [key, [lvl, slots]] of buckets) {
        if (slots.length < 3) continue;

        const itemName = key.split(":")[0];
        const profile = COMBINE_PROFILE[itemName];

        let scrollname =
            lvl < profile.scroll0_until ? "cscroll0"
            : lvl < profile.scroll1_until ? "cscroll1"
            : "cscroll2";

        // Find the scroll in inventory
        let scroll_slot = null;
        let scroll = null;
        for (let j = 0; j < character.items.length; j++) {
            const inv_item = character.items[j];
            if (inv_item && inv_item.name === scrollname) {
                scroll_slot = j;
                scroll = inv_item;
                break;
            }
        }
        if (!scroll) continue;

        // Check for primling requirement and skip if not present
        if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
            const has_primling = character.items.some(inv_item => inv_item && inv_item.name === "primling");
            if (!has_primling) {
                game_log(`Skipping combine for ${itemName} (level ${lvl}): No primling found for combine requiring it.`);
                continue;
            }
        }

        // Check for offering if needed
        let offering_slot = null;
        if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
            for (let j = 0; j < character.items.length; j++) {
                const inv_item = character.items[j];
                if (inv_item && inv_item.name === "offeringp") {
                    offering_slot = j;
                    break;
                }
            }
            if (offering_slot === null) {
                game_log("No offeringp found for combine requiring it.");
                return "wait";
            }
        }

        // Use massproduction if available
        if (can_use("massproduction")) {
            await use_skill("massproduction");
        }

        // Combine the items
        parent.socket.emit("compound", {
            items: slots.slice(0, 3),
            scroll_num: scroll_slot,
            offering_num: offering_slot,
            clevel: lvl,
        });

        game_log(`Combining 3x ${itemName} (level ${lvl}) with ${scrollname}`);
        return "done";
    }
    game_log("No valid items found for combine.");
    return "none";
}

async function auto_upgrade() {

    merchant_task = "Upgrading";

    await smarter_move(BANK_LOCATION);

    await withdraw_upgrade_scrolls();
    await withdraw_offering();
    await withdraw_upgradeable_items();

    await smarter_move(HOME);

    // --- Upgrade all items level-by-level ---
    let upgraded = true;
    for (let level = 0; level <= 10; level++) {
        upgraded = false;
        while (true) {
            const result = await auto_upgrade_item(level);
            if (result === "done" || result === "wait") {
                upgraded = true;
                await delay(UPGRADE_INTERVAL);
            } else if (result === "end") {
                // Stop all upgrading if "end" is returned (e.g., not enough gold)
                game_log("❌ Ending auto-upgrade early due to insufficient gold or resources.");
                break;
            } else {
                break;
            }
        }
    }

    // --- Combine all items level-by-level ---
    let combined = true;
    for (let level = 0; level <= 5; level++) {
        combined = false;
        while (true) {
            const result = await auto_combine_item(level);
            if (result === "done" || result === "wait") {
                combined = true;
                await delay(UPGRADE_INTERVAL);
            } else if (result === "end") {
                // Stop all combining if "end" is returned (e.g., not enough gold)
                game_log("❌ Ending auto-combine early due to insufficient gold or resources.");
                break;
            } else {
                break;
            }
        }
    }

    game_log("✅ Auto upgrade and combine complete.");
    await delay(5000);
    await sell_and_bank();
    merchant_task = "Idle";
}