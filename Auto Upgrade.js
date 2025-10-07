
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_INTERVAL = 75;

const upgradeProfile = {
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

const combineProfile = {
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
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.level !== level) continue;

		const profile = upgradeProfile[item.name];
		if (!profile || item.level >= profile.max_level) continue;

		let scrollname = item.level < profile.scroll0_until ? "scroll0"
			: item.level < profile.scroll1_until ? "scroll1"
				: "scroll2";

		const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
		if (!scroll) {
			parent.buy(scrollname);
			return "wait";
		}

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

	character.items.forEach((item, idx) => {
		if (!item || item.level !== level) return;

		const profile = combineProfile[item.name];
		if (!profile || item.level >= profile.max_level) return;

		const key = `${item.name}:${item.level}`;
		if (!buckets.has(key)) {
			buckets.set(key, [item.level, item_grade(item), [idx]]);
		} else {
			buckets.get(key)[2].push(idx);
		}
	});

	for (const [key, entries] of buckets) {
		const [lvl, grade, slots] = entries;
		if (slots.length < 3) continue;

		const itemName = key.split(":")[0];
		const profile = combineProfile[itemName];
		if (!profile) continue;

		let scrollname = lvl < profile.scroll0_until ? "cscroll0"
			: lvl < profile.scroll1_until ? "cscroll1"
				: "cscroll2";

		const [scroll_slot, scroll] = find_item(it => it.name === scrollname);
		if (!scroll) {
			parent.buy(scrollname);
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

let auto_upgrade = false;

async function run_auto_upgrade() {
	if (auto_upgrade) return;
	auto_upgrade = true;

	const max_upgrade_level = 10;
	const max_compound_level = 5;
	let current_level = 0;

	(async function loop() {
		if (current_level > max_upgrade_level && current_level > max_compound_level) {
			auto_upgrade = false;
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

let timeout = 5000;

async function schedule_upgrade() {
    // === BANKING ===
    await smart_move(BANK_LOCATION);
    await delay(1000);

    let bank_data = character.bank || load_bank_from_local_storage();
    if (!bank_data) {
        game_log("No bank data available. Please open the bank or save bank data first.");
        return;
    }

    function count_empty_inventory() {
        return character.items.filter(it => !it).length;
    }

    function count_inventory_items() {
        return character.items.filter(it => !!it).length;
    }

    let any_withdrawn = false;
    let free_slots = count_empty_inventory();

    // Track inventory for timeout logic
    let last_inventory_count = count_inventory_items();
    let last_change_time = Date.now();

    // Helper to check for timeout
    function timed_out() {
        return (Date.now() - last_change_time) > timeout;
    }

    // --- UPGRADE: Withdraw by item, only below max_level ---
    for (const itemName in upgradeProfile) {
        if (free_slots <= 0 || timed_out()) break;
        const maxLevel = upgradeProfile[itemName].max_level;

        // Gather all items of this name and below maxLevel
        let items = [];
        for (const pack in bank_data) {
            if (!Array.isArray(bank_data[pack])) continue;
            for (const item of bank_data[pack]) {
                if (
                    item &&
                    item.name === itemName
                ) {
                    const lvl = typeof item.level === "number" ? item.level : 0;
                    if (lvl < maxLevel) {
                        let qty = item.q || 1;
                        for (let i = 0; i < qty; i++) {
                            items.push({ level: lvl });
                        }
                    }
                }
            }
        }

        const to_withdraw = Math.min(items.length, free_slots);
        if (to_withdraw >= 1) {
            game_log(`[Bank] Withdrawing ${to_withdraw} ${itemName}(s) for upgrade (any level below ${maxLevel}).`);
            await withdraw_item(itemName, null, to_withdraw);
            any_withdrawn = true;
            free_slots -= to_withdraw;
        }
    }

    // --- COMBINE: Withdraw by item+level, only below max_level, in multiples of 3 ---
    for (const itemName in combineProfile) {
        if (free_slots <= 0 || timed_out()) break;
        const maxLevel = combineProfile[itemName].max_level;

        let levelMap = {};
        for (const pack in bank_data) {
            if (!Array.isArray(bank_data[pack])) continue;
            for (const item of bank_data[pack]) {
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

        for (const levelStr of Object.keys(levelMap).sort((a, b) => a - b)) {
            if (free_slots < 3 || timed_out()) break;
            const level = Number(levelStr);
            let count = levelMap[level];
            let to_withdraw = Math.floor(count / 3) * 3;
            to_withdraw = Math.min(to_withdraw, Math.floor(free_slots / 3) * 3);
            if (to_withdraw >= 3) {
                game_log(`[Bank] Withdrawing ${to_withdraw} ${itemName}(s) at level ${level} for compounding (below level ${maxLevel}).`);
                await withdraw_item(itemName, level, to_withdraw);
                // Check if inventory changed
                let current_count = count_inventory_items();
                if (current_count !== last_inventory_count) {
                    last_inventory_count = current_count;
                    last_change_time = Date.now();
                }
                any_withdrawn = true;
                free_slots -= to_withdraw;
            }
        }
    }

    if (timed_out()) {
        game_log("⏱️ Withdrawal timed out: inventory did not change for 5 seconds.");
    }

	if (any_withdrawn) {
		game_log("Items withdrawn from bank. Starting auto upgrade/compound process...");
		await smart_move(HOME);
		await run_auto_upgrade();
	} else {
        game_log("No items withdrawn from bank. Nothing to upgrade or compound.");
		await smart_move(HOME);
    }
}