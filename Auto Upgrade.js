
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_INTERVAL = 75;

const UPGRADE_PROFILE = {
  pouchbow:    { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 8 },
  fireblade:   { scroll0_until: 0, scroll1_until: 4, scroll2_until: 7, primling_from: 6, max_level: 6 },
  firebow:     { scroll0_until: 0, scroll1_until: 4, scroll2_until: 7, primling_from: 6, max_level: 6 },
  firestaff:   { scroll0_until: 0, scroll1_until: 4, scroll2_until: 7, primling_from: 6, max_level: 6 },
  hbow:        { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 7 },
  wingedboots: { scroll0_until: 2, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 6 },
  basher:      { scroll0_until: 0, scroll1_until: 3, scroll2_until: 6, primling_from: 5, max_level: 3 },
  cape:        { scroll0_until: 0, scroll1_until: 5, scroll2_until: 6, primling_from: 5, max_level: 5 },
  coat:        { scroll0_until: 4, scroll1_until: 7, scroll2_until: 9, primling_from: 8, max_level: 7 },
  ololipop:    { scroll0_until: 3, scroll1_until: 6, scroll2_until: 9, primling_from: 6, max_level: 6 },
  glolipop:    { scroll0_until: 3, scroll1_until: 6, scroll2_until: 9, primling_from: 6, max_level: 6 },
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
  // Add more items as needed
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADE / COMPOUND LOGIC
// --------------------------------------------------------------------------------------------------------------------------------- //

async function upgrade_once_by_level(level) {
    // First, determine how many upgrades at this level need a scroll
    let needed = 0;
    let scrollname = null;

    for (let i = 0; i < character.items.length; i++) {
        const item = character.items[i];
        if (!item || item.level !== level) continue;

        const profile = UPGRADE_PROFILE[item.name];
        if (!profile || item.level >= profile.max_level) continue;

        scrollname = item.level < profile.scroll0_until ? "scroll0"
            : item.level < profile.scroll1_until ? "scroll1"
                : "scroll2";

        // Check if we have a scroll for this upgrade
        const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
        if (!scroll) needed++;
    }

    // Count how many scrolls we already have
    let have = 0;
    if (scrollname) {
        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (item && item.name === scrollname) have += item.q || 1;
        }
    }

    // Buy only one scroll if needed
    if (needed > have) {
        if (scrollname) parent.buy(scrollname);
        return "wait";
    }

    // Now proceed with upgrades as before
    for (let i = 0; i < character.items.length; i++) {
        const item = character.items[i];
        if (!item || item.level !== level) continue;

        const profile = UPGRADE_PROFILE[item.name];
        if (!profile || item.level >= profile.max_level) continue;

        scrollname = item.level < profile.scroll0_until ? "scroll0"
            : item.level < profile.scroll1_until ? "scroll1"
                : "scroll2";

        const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
        if (!scroll) continue;

        let offering_slot = null;
        if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
            const [pSlot, prim] = find_item(it => it.name === "offeringp");
            if (!prim) return "wait";
            offering_slot = pSlot;
        }

        if (can_use("massproduction")) {
            await use_skill("massproduction");
        }

        parent.socket.emit("upgrade", {
            item_num: i,
            scroll_num: scroll_slot,
            offering_num: offering_slot,
            clevel: item.level,
        });

        return "done";
    }
    return "none";
}

async function compound_once_by_level(level) {
    const buckets = new Map();

    // Group items by name and level
    character.items.forEach((item, idx) => {
        if (!item || item.level !== level) return;

        const profile = COMBINE_PROFILE[item.name];
        if (!profile || item.level >= profile.max_level) return;

        const key = `${item.name}:${item.level}`;
        if (!buckets.has(key)) {
            buckets.set(key, [item.level, item_grade(item), [idx]]);
        } else {
            buckets.get(key)[2].push(idx);
        }
    });

    // Find the first group that can be compounded
    for (const [key, entries] of buckets) {
        const [lvl, grade, slots] = entries;
        if (slots.length < 3) continue;

        const itemName = key.split(":")[0];
        const profile = COMBINE_PROFILE[itemName];
        if (!profile) continue;

        // Determine which scroll is needed
        const scrollname = lvl < profile.scroll0_until ? "cscroll0"
            : lvl < profile.scroll1_until ? "cscroll1"
                : "cscroll2";

        // Check if we have a scroll for this compound
        const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
        if (!scroll) {
            parent.buy(scrollname); // Only buy one scroll at a time
            return "wait";
        }

        let offering_slot = null;
        if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
            const [pSlot, prim] = find_item(it => it.name === "offeringp");
            if (!prim) return "wait";
            offering_slot = pSlot;
        }

        parent.socket.emit("compound", {
            items: slots.slice(0, 3),
            scroll_num: scroll_slot,
            offering_num: offering_slot,
            clevel: lvl,
        });

        return "done";
    }

    return "none";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP — LEVEL-BY-LEVEL
// --------------------------------------------------------------------------------------------------------------------------------- //

let auto_upgrading = false;

async function run_auto_upgrade() {
	if (auto_upgrading) return;
	auto_upgrading = true;

	const max_upgrade_level = 10;
	const max_compound_level = 5;
	let current_level = 0;

	(async function loop() {
		if (current_level > max_upgrade_level && current_level > max_compound_level) {
			auto_upgrading = false;
			game_log("✅ All upgrades/compounds finished.");
			return;
		}

		const resultU = await upgrade_once_by_level(current_level);
		const resultC = await compound_once_by_level(current_level);

		if (resultU === "done" || resultC === "done" || resultU === "wait" || resultC === "wait") {
			setTimeout(loop, UPGRADE_INTERVAL);
		} else {
			current_level++;
			setTimeout(loop, UPGRADE_INTERVAL);
		}
	})();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function find_item(filter) {
	for (let i = 0; i < character.items.length; i++) {
		const it = character.items[i];
		if (it && filter(it)) return [i, it];
	}
	return [-1, null];
}

function get_grade(item) {
  return parent.G.items[item.name].grades;
}

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

async function upgrade_scroll_withdraw() {

    await smart_move(BANK_LOCATION);

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
            await withdraw_item(item);
            await delay(200); // Small delay for UI/bank sync
        } catch (e) {
            game_log(`Error withdrawing ${item}: ${e.message}`);
        }
    }

    game_log("✅ Scroll withdrawal check complete.");
}

async function upgrade_item_withdraw() {
    // 1. If not at BANK_LOCATION, smart move to BANK_LOCATION
    if (character.map !== BANK_LOCATION.map || character.x !== BANK_LOCATION.x || character.y !== BANK_LOCATION.y) {
        await smart_move(BANK_LOCATION);
        await delay(500);
    }

    // Helper functions
    function count_empty_inventory() {
        return character.items.filter(it => !it).length;
    }

    // 2. Withdraw all items in UPGRADE_PROFILE from the bank that are less than max_level for that item
    let free_slots = count_empty_inventory() - 3;
    if (free_slots <= 0) {
        game_log("❌ Not enough inventory space to withdraw upgrade items.");
        return;
    }

    let bank_data = character.bank || load_bank_from_local_storage();
    if (!bank_data) {
        game_log("No bank data available. Please open the bank or save bank data first.");
        return;
    }

    // Withdraw upgrade items (one by one, up to free_slots)
    for (const itemName in UPGRADE_PROFILE) {
        if (free_slots <= 0) break;
        const maxLevel = UPGRADE_PROFILE[itemName].max_level;

        // Find all items of this type and below maxLevel in the bank
        for (const pack in bank_data) {
            if (!Array.isArray(bank_data[pack])) continue;
            for (let slot = 0; slot < bank_data[pack].length; slot++) {
                const item = bank_data[pack][slot];
                if (
                    item &&
                    item.name === itemName &&
                    (typeof item.level !== "number" || item.level < maxLevel)
                ) {
                    // Withdraw as many as will fit, but only up to free_slots
                    const to_withdraw = Math.min(item.q || 1, free_slots);
                    if (to_withdraw > 0) {
                        await withdraw_item(itemName, item.level, to_withdraw);
                        free_slots -= to_withdraw;
                        await delay(50);
                    }
                    if (free_slots <= 0) break;
                }
            }
            if (free_slots <= 0) break;
        }
    }

    // 3. Withdraw all items in COMBINE_PROFILE from the bank that are less than max_level for that item, in multiples of 3
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

        // Withdraw in multiples of 3, up to available free slots (in multiples of 3)
        for (const levelStr of Object.keys(levelMap).sort((a, b) => a - b)) {
            let level = Number(levelStr);
            let count = levelMap[level];

            // Withdraw as many full batches of 3 as possible
            while (count >= 3 && free_slots >= 3) {
                let to_withdraw = Math.min(Math.floor(count / 3) * 3, Math.floor(free_slots / 3) * 3);
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
                            const withdraw_count = Math.min(item.q || 1, remaining);
                            if (withdraw_count > 0) {
                                await withdraw_item(itemName, level, withdraw_count);
                                free_slots -= withdraw_count;
                                remaining -= withdraw_count;
                                count -= withdraw_count;
                                await delay(50);
                            }
                            if (remaining <= 0 || free_slots < 3) break;
                        }
                    }
                    if (remaining <= 0 || free_slots < 3) break;
                }
                // If we can't withdraw another batch, break
                if (free_slots < 3 || count < 3) break;
            }
            if (free_slots < 4) break;
        }
        if (free_slots < 4) break;
    }

    game_log("✅ Finished withdrawing upgrade and compound items, leaving at least 3 inventory slots free.");
}

async function upgrade_item() {
    for (let i = 0; i < character.items.length; i++) {
        const item = character.items[i];
        if (!item) continue;

        const profile = UPGRADE_PROFILE[item.name];
        if (!profile) continue;
        if (typeof item.level !== "number" || item.level >= profile.max_level) continue;

        // Determine the correct scroll for this item's level
        let scrollname =
            item.level < profile.scroll0_until ? "scroll0"
            : item.level < profile.scroll1_until ? "scroll1"
            : "scroll2";

        // Check if we have the scroll in inventory
        let [scroll_slot, scroll] = find_item(it => it.name === scrollname);
        if (!scroll) {
            parent.buy(scrollname);
            game_log(`Buying ${scrollname} for upgrading ${item.name} (level ${item.level})`);
            // Wait for the scroll to arrive in inventory
            for (let tries = 0; tries < 10; tries++) {
                await delay(300);
                [scroll_slot, scroll] = find_item(it => it.name === scrollname);
                if (scroll) break;
            }
            if (!scroll) {
                game_log(`Scroll ${scrollname} not found after purchase, try again later.`);
                return "wait";
            }
        }

        // Check for offering if needed
        let offering_slot = null;
        if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
            const [pSlot, prim] = find_item(it => it.name === "offeringp");
            if (!prim) {
                game_log("No offeringp found for upgrade requiring it.");
                return "wait";
            }
            offering_slot = pSlot;
        }

        // Use massproduction if available
        if (can_use("massproduction")) {
            await use_skill("massproduction");
        }

        // Upgrade the item
        parent.socket.emit("upgrade", {
            item_num: i,
            scroll_num: scroll_slot,
            offering_num: offering_slot,
            clevel: item.level,
        });

        game_log(`Upgrading ${item.name} (level ${item.level}) with ${scrollname}`);
        return "done";
    }
    game_log("No valid items found for upgrade.");
    return "none";
}

async function combine_item() {
    // Build a map of combinable items by name and level
    const buckets = new Map();

    for (let i = 0; i < character.items.length; i++) {
        const item = character.items[i];
        if (!item) continue;

        const profile = COMBINE_PROFILE[item.name];
        if (!profile) continue;
        if (typeof item.level !== "number" || item.level >= profile.max_level) continue;

        const key = `${item.name}:${item.level}`;
        if (!buckets.has(key)) {
            buckets.set(key, [item.level, [i]]);
        } else {
            buckets.get(key)[1].push(i);
        }
    }

    // Try to combine the first valid group of 3
    for (const [key, [lvl, slots]] of buckets) {
        if (slots.length < 3) continue;

        const itemName = key.split(":")[0];
        const profile = COMBINE_PROFILE[itemName];

        // Determine the correct scroll for this item's level
        let scrollname =
            lvl < profile.scroll0_until ? "cscroll0"
            : lvl < profile.scroll1_until ? "cscroll1"
            : "cscroll2";

        // Check if we have the scroll in inventory
        let [scroll_slot, scroll] = find_item(it => it.name === scrollname);
        if (!scroll) {
            parent.buy(scrollname);
            game_log(`Buying ${scrollname} for combining ${itemName} (level ${lvl})`);
            // Wait for the scroll to arrive in inventory
            for (let tries = 0; tries < 10; tries++) {
                await delay(300);
                [scroll_slot, scroll] = find_item(it => it.name === scrollname);
                if (scroll) break;
            }
            if (!scroll) {
                game_log(`Scroll ${scrollname} not found after purchase, try again later.`);
                return "wait";
            }
        }

        // Check for offering if needed
        let offering_slot = null;
        if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
            const [pSlot, prim] = find_item(it => it.name === "offeringp");
            if (!prim) {
                game_log("No offeringp found for combine requiring it.");
                return "wait";
            }
            offering_slot = pSlot;
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
    await upgrade_item_checker();
    await upgrade_item_withdraw();

    await smart_move(HOME);

    // --- Upgrade all items level-by-level ---
    let upgraded = true;
    for (let level = 0; level <= 10; level++) {
        upgraded = false;
        while (true) {
            const result = await upgrade_once_by_level(level);
            if (result === "done" || result === "wait") {
                upgraded = true;
                await delay(UPGRADE_INTERVAL);
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
            const result = await compound_once_by_level(level);
            if (result === "done" || result === "wait") {
                combined = true;
                await delay(UPGRADE_INTERVAL);
            } else {
                break;
            }
        }
    }

    game_log("✅ Auto upgrade and combine complete.");
}