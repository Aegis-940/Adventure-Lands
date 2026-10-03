
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

var UPGRADE_INTERVAL = 75;
var BANK_POSITION_TOLERANCE = 10;

var UPGRADE_PROFILE = {
	pouchbow:     { scroll0_until: 3, scroll1_until: 8, scroll2_until: 9, primling_from: 7, max_level: 9 },
	fireblade:    { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, grace_from: 8, max_level: 9 },
	firebow:      { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, max_level: 8 },
	firestaff:    { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 7, max_level: 8 },
	hbow:         { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 7 },
	wingedboots:  { scroll0_until: 2, scroll1_until: 6, scroll2_until: 10, primling_from: 5, max_level: 9 },
	cape:         { scroll0_until: 0, scroll1_until: 5, scroll2_until: 6, primling_from: 5, max_level: 5 },
	coat:         { scroll0_until: 4, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 10 },
	pants:        { scroll0_until: 4, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 9 },
	ololipop:     { scroll0_until: 2, scroll1_until: 8, scroll2_until: 9, primling_from: 7, max_level: 9 },
	glolipop:     { scroll0_until: 2, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 9 },
	quiver:       { scroll0_until: 3, scroll1_until: 6, scroll2_until: 9, primling_from: 7, max_level: 6 },
	crossbow:     { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 6, max_level: 7 },
	basher:       { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 6, max_level: 8 },
	broom:        { scroll0_until: 2, scroll1_until: 7, scroll2_until: 9, primling_from: 7, max_level: 7 },
	harbringer:   { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 4, max_level: 7 },
	t2quiver:     { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 4, max_level: 7 },
	mshield:      { scroll0_until: 0, scroll1_until: 0, scroll2_until: 9, primling_from: 3, max_level: 8 },
	supermittens: { scroll0_until: 0, scroll1_until: 0, scroll2_until: 9, primling_from: 3, max_level: 4 },
	lmace:        { scroll0_until: 0, scroll1_until: 0, scroll2_until: 9, primling_from: 3, max_level: 5 },
	bataxe:       { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, max_level: 9 },
	frankypants:  { scroll0_until: 0, scroll1_until: 0, scroll2_until: 10, primling_from: 3, max_level: 6 },
};

var COMBINE_PROFILE = {
	wbook0:      { scroll0_until: 2, scroll1_until: 4, scroll2_until: 6, primling_from: 4, max_level: 3 },
	dexring:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	strring:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	intring:     { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	dexbelt:     { scroll0_until: 1, scroll1_until: 2, scroll2_until: 6, primling_from: 2, max_level: 4 },
	strbelt:     { scroll0_until: 1, scroll1_until: 2, scroll2_until: 6, primling_from: 2, max_level: 4 },
	intbelt:     { scroll0_until: 1, scroll1_until: 2, scroll2_until: 6, primling_from: 2, max_level: 4 },
	dexamulet:   { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	stramulet:   { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	intamulet:   { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	dexearring:  { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	strearring:  { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	intearring:  { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	skullamulet: { scroll0_until: 1, scroll1_until: 3, scroll2_until: 6, primling_from: 3, max_level: 3 },
	talkingskull:{ scroll0_until: 1, scroll1_until: 2, scroll2_until: 6, primling_from: 2, max_level: 3 },
	orbofdex:    { scroll0_until: 0, scroll1_until: 3, scroll2_until: 6, primling_from: 1, max_level: 3 },
	orbofstr:    { scroll0_until: 0, scroll1_until: 3, scroll2_until: 6, primling_from: 1, max_level: 3 },
	lantern:     { scroll0_until: 0, scroll1_until: 0, scroll2_until: 6, primling_from: 0, max_level: 1 },
	molesteeth:  { scroll0_until: 0, scroll1_until: 1, scroll2_until: 6, primling_from: 0, max_level: 1 },
	cearring:    { scroll0_until: 0, scroll1_until: 2, scroll2_until: 6, primling_from: 0, max_level: 3 },
	cring:    	 { scroll0_until: 0, scroll1_until: 2, scroll2_until: 6, primling_from: 0, max_level: 3 },
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// GRACE
// --------------------------------------------------------------------------------------------------------------------------------- //

var GRACE_MAX_OFFERINGS = 5;

var GRACE_MAX = 5;

function inventory_slot(item_name) {
	const slot = character.items.findIndex(it => it && it.name === item_name);
	return slot === -1 ? null : slot;
}

function bank_contents(bank_data) {
	const found = [];
	for (const pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		for (const item of bank_data[pack]) {
			if (item) found.push(item);
		}
	}
	return found;
}

function below_max_level(item, max_level) {
	return typeof item.level !== "number" || item.level < max_level;
}

async function check_grace(item_slot) {
	const offering_slot = inventory_slot("offeringp");
	if (offering_slot === null) return null;

	try {
		const response = await upgrade(item_slot, null, offering_slot, true);
		return response?.grace ?? null;
	} catch (e) {
		catcher(e, "check_grace");
		return null;
	}
}

async function add_grace_to_cap(item_slot) {
	let previous_grace = await check_grace(item_slot);
	if (previous_grace == null) {
		return { grace: null, capped: false };
	}

	if (previous_grace >= GRACE_MAX) {
		game_log(`✅ Grace already at ${previous_grace} (>= GRACE_MAX ${GRACE_MAX}) for slot ${item_slot} — skipping.`, "limegreen");
		return { grace: previous_grace, capped: true };
	}

	for (let attempt = 0; attempt < GRACE_MAX_OFFERINGS; attempt++) {
		const offering_slot = inventory_slot("offeringp");
		if (offering_slot === null) {
			game_log(`⚠️ Ran out of offeringp before grace capped (at ${previous_grace}) for slot ${item_slot}.`, "#FFA500");
			return { grace: previous_grace, capped: false };
		}

		if (can_use("massproductionpp") && character.mp >= 400) {
			use_skill("massproductionpp");
			await delay(20);
		}

		try {
			await upgrade(item_slot, null, offering_slot, false);
		} catch (e) {
			catcher(e, "add_grace_to_cap: upgrade");
			return { grace: previous_grace, capped: false };
		}
		await delay(300);

		const current_grace = await check_grace(item_slot);
		if (current_grace == null) {
			game_log(`⚠️ Ran out of offeringp (or no grace field) re-checking grace (at ${previous_grace}) for slot ${item_slot}.`, "#FFA500");
			return { grace: previous_grace, capped: false };
		}

		if (current_grace <= previous_grace) {
			game_log(`✅ Grace capped at ${current_grace} for slot ${item_slot}.`, "limegreen");
			return { grace: current_grace, capped: true };
		}

		game_log(`Grace: ${previous_grace} -> ${current_grace}`);
		previous_grace = current_grace;

		if (previous_grace >= GRACE_MAX) {
			game_log(`✅ Grace reached ${previous_grace} (>= GRACE_MAX ${GRACE_MAX}) for slot ${item_slot} — stopping.`, "limegreen");
			return { grace: previous_grace, capped: true };
		}
	}

	game_log(`⚠️ Grace still rising after ${GRACE_MAX_OFFERINGS} offerings (at ${previous_grace}) for slot ${item_slot} — stopping as a safety backstop.`, "#FFA500");
	return { grace: previous_grace, capped: false };
}

var grace_capped_slots = new Set();

async function auto_grace_pass() {
	grace_capped_slots.clear();

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;

		const profile = UPGRADE_PROFILE[item.name];
		if (!profile || profile.grace_from === undefined) continue;
		if (item.level < profile.grace_from || item.level >= profile.max_level) continue;

		const { capped } = await add_grace_to_cap(i);
		if (capped) grace_capped_slots.add(i);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO UPGRADE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function withdraw_upgrade_scrolls() {

	refresh_bank_snapshot();

	const SCROLL_TYPES = ["scroll0", "scroll1", "scroll2", "cscroll0", "cscroll1", "cscroll2"];

	const empty_slots = free_inventory_slots();
	if (empty_slots < 10) {
		game_log(`❌ Not enough inventory space to withdraw scrolls. Need at least 10 free slots, have ${empty_slots}.`);
		return;
	}

	for (const item of SCROLL_TYPES) {
		try {
			withdraw_item(item);
			await delay(400);
		} catch (e) {
			catcher(e, "withdraw_upgrade_scrolls: " + item);
		}
	}

	game_log("✅ Scroll withdrawal check complete.");
}

async function withdraw_offering() {

	game_log("Withdrawing offeringp for upgrades that require it.");

	try {
		withdraw_item("offeringp");
		await delay(400);
	} catch (e) {
		catcher(e, "withdraw_offering");
	}
}

async function withdraw_upgradeable_items() {
	if (character.map !== BANK_LOCATION.map || Math.hypot(character.x - BANK_LOCATION.x, character.y - BANK_LOCATION.y) > BANK_POSITION_TOLERANCE) {
		await smarter_move(BANK_LOCATION, null, { radius: BANK_POSITION_TOLERANCE });
		await delay(500);
	}

	let bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) {
		game_log("No bank data available. Please open the bank or save bank data first.");
		return;
	}

	let free_slots = free_inventory_slots();
	if (free_slots <= 3) {
		game_log("❌ Not enough inventory space to withdraw upgrade items.");
		return;
	}

	for (const item_name in UPGRADE_PROFILE) {
		const max_level = UPGRADE_PROFILE[item_name].max_level;

		for (const item of bank_contents(bank_data)) {
			free_slots = free_inventory_slots();
			if (free_slots <= 3) break;
			if (item.name !== item_name || !below_max_level(item, max_level)) continue;

			const to_withdraw = Math.min(item.q || 1, free_slots - 3);
			if (to_withdraw > 0) {
				withdraw_item(item_name, item.level, to_withdraw);
				await delay(400);
			}
		}

		if (free_inventory_slots() <= 3) break;
	}

	for (const item_name in COMBINE_PROFILE) {
		const max_level = COMBINE_PROFILE[item_name].max_level;

		let level_map = {};
		for (const item of bank_contents(bank_data)) {
			if (item.name !== item_name || !below_max_level(item, max_level)) continue;
			const lvl = item.level || 0;
			level_map[lvl] = (level_map[lvl] || 0) + (item.q || 1);
		}

		for (const level_str of Object.keys(level_map).sort((a, b) => a - b)) {
			let level = Number(level_str);
			let count = level_map[level];

			while (count >= 3) {
				free_slots = free_inventory_slots();
				let max_withdrawable = Math.floor((free_slots - 3) / 3) * 3;
				if (max_withdrawable < 3) break;
				let to_withdraw = Math.min(Math.floor(count / 3) * 3, max_withdrawable);
				if (to_withdraw < 3) break;

				let remaining = to_withdraw;
				for (const item of bank_contents(bank_data)) {
					if (remaining <= 0 || free_inventory_slots() <= 3) break;
					if (item.name !== item_name || (item.level || 0) !== level) continue;

					const withdraw_count = Math.min(item.q || 1, remaining);
					if (withdraw_count > 0) {
						withdraw_item(item_name, level, withdraw_count);
						remaining -= withdraw_count;
						count -= withdraw_count;
						await delay(400);
					}
				}
				if (free_inventory_slots() <= 3 || count < 3) break;
			}
			if (free_inventory_slots() <= 3) break;
		}
		if (free_inventory_slots() <= 3) break;
	}

	game_log("✅ Finished withdrawing upgrade and compound items, leaving at least 3 inventory slots free.");
}

function bank_has_upgradeable_items() {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return false;

	for (const item_name in UPGRADE_PROFILE) {
		const max_level = UPGRADE_PROFILE[item_name].max_level;
		for (const item of bank_contents(bank_data)) {
			if (item.name === item_name && below_max_level(item, max_level)) return true;
		}
	}

	for (const item_name in COMBINE_PROFILE) {
		const max_level = COMBINE_PROFILE[item_name].max_level;
		const level_counts = {};
		for (const item of bank_contents(bank_data)) {
			if (item.name !== item_name || !below_max_level(item, max_level)) continue;
			const lvl = item.level || 0;
			level_counts[lvl] = (level_counts[lvl] || 0) + (item.q || 1);
			if (level_counts[lvl] >= 3) return true;
		}
	}

	return false;
}

var upgrade_failed_slots = new Set();
var combine_failed_keys = new Set();

var UPGRADE_RETRY_MS = 10 * 60 * 1000;
var _upgrade_retry_at = 0;

function upgrade_run_blocked() {
	return Date.now() < _upgrade_retry_at;
}

async function auto_upgrade_item(level) {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.level !== level || upgrade_failed_slots.has(i)) continue;

		const profile = UPGRADE_PROFILE[item.name];
		if (!profile || item.level >= profile.max_level) continue;

		let scrollname =
			item.level < profile.scroll0_until ? "scroll0"
			: item.level < profile.scroll1_until ? "scroll1"
			: "scroll2";

		const scroll_slot = inventory_slot(scrollname);
		const scroll = scroll_slot === null ? null : character.items[scroll_slot];

		if (!scroll) {
			const scroll_cost = G.items[scrollname]?.g || 0;
			if (character.gold < scroll_cost) {
				game_log(`❌ Not enough gold to buy ${scrollname} for upgrading ${item.name} (level ${item.level}). Ending auto-upgrade.`);
				return "end";
			}
			game_log(`Buying ${scrollname} for upgrading ${item.name} (level ${item.level})`);
			try {
				await buy(scrollname);
			} catch (e) {
				catcher(e, "auto_upgrade_item: buy " + scrollname);
				return "end";
			}
			return "wait";
		}

		if (profile.grace_from !== undefined && item.level >= profile.grace_from && !grace_capped_slots.has(i)) {
			game_log(`${item.name} (level ${item.level}): proceeding with best-effort grace (not confirmed capped).`, "#FFA500");
		}

		let offering_slot = null;
		if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
			offering_slot = inventory_slot("offeringp");
			if (offering_slot === null) {
				game_log(`Skipping ${item.name} (level ${item.level}): No offeringp found for upgrade requiring it.`);
				continue;
			}
		}

		if (!character.q.upgrade) {
			if (item.level <= 2 && can_use("massproduction")) {
				use_skill("massproduction");
				await delay(20);
			}
			if (item.level >= 3 && can_use("massproductionpp") && character.mp >= 400) {
				use_skill("massproductionpp");
				await delay(20);
			}
			game_log(`Upgrading ${item.name} (level ${item.level}) with ${scrollname}`);
			try {
				await upgrade(i, scroll_slot, offering_slot);
			} catch (e) {
				catcher(e, `auto_upgrade_item: ${item.name} (level ${item.level})`);
				upgrade_failed_slots.add(i);
				continue;
			}
		}

		while (character.q.upgrade) {
			await delay(100);
		}

		return "done";
	}
	game_log("No valid items found for upgrade.");
	return "none";
}

async function auto_combine_item(level) {
	const buckets = new Map();

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;

		const profile = COMBINE_PROFILE[item.name];
		if (!profile) continue;
		if (typeof item.level !== "number" || item.level !== level || item.level >= profile.max_level) continue;

		const key = `${item.name}:${item.level}`;
		const entry = { slot: i, qty: item.q || 1 };
		if (!buckets.has(key)) {
			buckets.set(key, [item.level, [entry]]);
		} else {
			buckets.get(key)[1].push(entry);
		}
	}

	function total_qty(entries) {
		return entries.reduce((sum, e) => sum + e.qty, 0);
	}

	function pick_three_slots(entries) {
		const picks = [];
		for (const entry of entries) {
			let remaining = entry.qty;
			while (remaining > 0 && picks.length < 3) {
				picks.push(entry.slot);
				remaining--;
			}
			if (picks.length >= 3) break;
		}
		return picks;
	}

	for (const [key, [lvl, entries]] of buckets) {
		if (total_qty(entries) < 3) continue;

		const item_name = key.split(":")[0];
		const profile = COMBINE_PROFILE[item_name];

		let scrollname =
			lvl < profile.scroll0_until ? "cscroll0"
			: lvl < profile.scroll1_until ? "cscroll1"
			: "cscroll2";

		const scroll_slot = inventory_slot(scrollname);
		const scroll = scroll_slot === null ? null : character.items[scroll_slot];

		if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
			const has_primling = character.items.some(inv_item => inv_item && inv_item.name === "offeringp");
			if (!has_primling) {
				game_log(`Skipping combine for ${item_name} (level ${lvl}): No offeringp found for combine requiring it.`);
				continue;
			}
		}

		if (!scroll) {
			const scroll_cost = G.items[scrollname]?.g || 0;
			if (character.gold < scroll_cost) {
				game_log(`❌ Not enough gold to buy ${scrollname} for combining ${item_name} (level ${lvl}). Ending auto-combine.`);
				return "end";
			}
			game_log(`Buying ${scrollname} for combining ${item_name} (level ${lvl})`);
			try {
				await buy(scrollname);
			} catch (e) {
				catcher(e, "auto_combine_item: buy " + scrollname);
				return "end";
			}
			return "wait";
		}
	}

	for (const [key, [lvl, entries]] of buckets) {
		if (total_qty(entries) < 3) continue;

		const item_name = key.split(":")[0];
		const profile = COMBINE_PROFILE[item_name];

		let scrollname =
			lvl < profile.scroll0_until ? "cscroll0"
			: lvl < profile.scroll1_until ? "cscroll1"
			: "cscroll2";

		const scroll_slot = inventory_slot(scrollname);
		const scroll = scroll_slot === null ? null : character.items[scroll_slot];
		if (!scroll) continue;
		if (combine_failed_keys.has(key)) continue;

		if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
			const has_primling = character.items.some(inv_item => inv_item && inv_item.name === "offeringp");
			if (!has_primling) {
				game_log(`Skipping combine for ${item_name} (level ${lvl}): No offeringp found for combine requiring it.`);
				continue;
			}
		}

		let offering_slot = null;
		if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
			offering_slot = inventory_slot("offeringp");
			if (offering_slot === null) {
				game_log("No offeringp found for combine requiring it.");
				return "wait";
			}
		}

		if (can_use("massproduction")) {
			use_skill("massproduction");
			await delay(20);
		}

		const picks = pick_three_slots(entries);
		game_log(`Combining 3x ${item_name} (level ${lvl}) with ${scrollname}`);
		try {
			await compound(picks[0], picks[1], picks[2], scroll_slot, offering_slot);
		} catch (e) {
			catcher(e, `auto_combine_item: ${item_name} (level ${lvl})`);
			combine_failed_keys.add(key);
			continue;
		}
		return "done";
	}
	game_log("No valid items found for combine.");
	return "none";
}

var UPGRADE_BUY_RESERVE_SLOTS = 5;

function upgrade_buy_count(item_name) {
	const spare_gold = character.gold - CONFIG.upgrade_gold_threshold;
	return Math.max(0, Math.min(
		free_inventory_slots() - UPGRADE_BUY_RESERVE_SLOTS,
		Math.floor(spare_gold / parent.G.items[item_name].g)
	));
}

function can_buy_for_upgrade() {
	return CONFIG.upgrade_buy.some(item_name => upgrade_buy_count(item_name) > 0);
}

async function buy_for_upgrade() {
	for (const item_name of CONFIG.upgrade_buy) {
		const count = upgrade_buy_count(item_name);
		let bought = 0;
		while (bought < count) {
			try {
				await buy(item_name);
			} catch (e) {
				catcher(e, "buy_for_upgrade: " + item_name);
				break;
			}
			bought++;
		}
		if (bought > 0) {
			game_log(`🛒 Bought ${bought}x ${item_name} to upgrade.`);
			task_heartbeat();
		}
	}
}

async function upgrade_pass(abandoned) {
	upgrade_failed_slots.clear();
	let progressed = false;

	for (let level = 0; level <= 10 && !abandoned(); level++) {
		while (!abandoned()) {
			const result = await auto_upgrade_item(level);
			if (result === "done") {
				progressed = true;
				task_heartbeat();
			}
			if (result === "done" || result === "wait") {
				await delay(UPGRADE_INTERVAL);
			} else if (result === "end") {
				game_log("❌ Ending auto-upgrade early due to insufficient gold or resources.");
				break;
			} else {
				break;
			}
		}
	}

	return progressed;
}

async function auto_upgrade() {

	merchant_task = "Upgrading";
	const my_generation = merchant_task_generation;
	const abandoned = () => my_generation !== merchant_task_generation;

	try {
		if (character.map !== "bank") {
			await smarter_move(BANK_LOCATION);
		}

		await withdraw_upgrade_scrolls();
		await withdraw_offering();
		await withdraw_upgradeable_items();

		await smarter_move(HOME);

		await auto_grace_pass();

		combine_failed_keys.clear();
		let progressed = false;
		let pass_progressed = false;

		do {
			await buy_for_upgrade();
			pass_progressed = await upgrade_pass(abandoned);
			if (pass_progressed) progressed = true;
		} while (pass_progressed && !abandoned());

		for (let level = 0; level <= 5 && !abandoned(); level++) {
			while (!abandoned()) {
				const result = await auto_combine_item(level);
				if (result === "done") progressed = true;
				if (result === "done" || result === "wait") {
					await delay(UPGRADE_INTERVAL);
				} else if (result === "end") {
					game_log("❌ Ending auto-combine early due to insufficient gold or resources.");
					break;
				} else {
					break;
				}
			}
		}

		if (abandoned()) {
			game_log("⚠️ Upgrading was force-reset by the watchdog — abandoning this run.", "#FFA500");
			return;
		}

		if (!progressed) {
			_upgrade_retry_at = Date.now() + UPGRADE_RETRY_MS;
			game_log(`⚠️ Upgrade run made no progress — not retrying for ${UPGRADE_RETRY_MS / 60000} min.`, "#FFA500");
		}

		game_log("✅ Auto upgrade and combine complete.");
		await delay(5000);
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "auto_upgrade");
	} finally {
		if (!abandoned()) merchant_task = "Idle";
	}
}