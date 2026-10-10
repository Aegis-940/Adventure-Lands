
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

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
	pants:        { scroll0_until: 4, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 10 },
	ololipop:     { scroll0_until: 1, scroll1_until: 8, scroll2_until: 9, primling_from: 5, max_level: 8 },
	glolipop:     { scroll0_until: 1, scroll1_until: 8, scroll2_until: 9, primling_from: 5, max_level: 8 },
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
	frankypants:  { scroll0_until: 0, scroll1_until: 0, scroll2_until: 10, primling_from: 3, max_level: 7 },
	djinncrown:   { scroll0_until: 0, scroll1_until: 2, scroll2_until: 10, primling_from: 4, max_level: 7 },
	covemantle:   { scroll0_until: 0, scroll1_until: 2, scroll2_until: 10, primling_from: 4, max_level: 4 },
	cave_mothsteps: { scroll0_until: 3, scroll1_until: 6, scroll2_until: 10, primling_from: 4, max_level: 6 },
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

function bank_level_counts(bank_data, item_name, max_level) {
	const counts = {};
	for (const item of bank_contents(bank_data)) {
		if (item.name !== item_name || !below_max_level(item, max_level)) continue;
		const lvl = item.level || 0;
		counts[lvl] = (counts[lvl] || 0) + (item.q || 1);
	}
	return counts;
}

function scroll_for(profile, level, prefix) {
	return level < profile.scroll0_until ? `${prefix}0`
		: level < profile.scroll1_until ? `${prefix}1`
		: `${prefix}2`;
}

function use_mass_production(level) {
	if (level >= 2 && can_use("massproductionpp") && character.mp >= 400) {
		use_skill("massproductionpp");
	} else if (can_use("massproduction")) {
		use_skill("massproduction");
	}
}

async function buy_scrolls(scrollname, count, context) {
	const n = Math.min(count, Math.floor(character.gold / G.items[scrollname].g));
	if (n <= 0) {
		game_log(`❌ Not enough gold to buy ${scrollname} for ${context}.`);
		return false;
	}
	game_log(`Buying ${n}x ${scrollname} for ${context}`);
	try {
		await buy(scrollname, n);
	} catch (e) {
		catcher(e, "buy_scrolls: " + scrollname);
		return false;
	}
	return true;
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

		use_mass_production(character.items[item_slot].level);

		try {
			await upgrade(item_slot, null, offering_slot, false);
		} catch (e) {
			catcher(e, "add_grace_to_cap: upgrade");
			return { grace: previous_grace, capped: false };
		}

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
// ROOM — loot the fighters hand over mid-run is sold or banked; the upgrade stock stays
// --------------------------------------------------------------------------------------------------------------------------------- //

var UPGRADE_SCROLLS = ["scroll0", "scroll1", "scroll2", "cscroll0", "cscroll1", "cscroll2"];

function upgrade_job_item(item) {
	if (UPGRADE_SCROLLS.includes(item.name) || item.name === "offeringp") return true;
	const profile = UPGRADE_PROFILE[item.name] || COMBINE_PROFILE[item.name];
	return !!profile && below_max_level(item, profile.max_level);
}

async function make_upgrade_room() {
	if (free_inventory_slots() > UPGRADE_BUY_RESERVE_SLOTS) return;

	if (has_sellable_items(upgrade_job_item)) {
		sell_sellable_items(upgrade_job_item);
		return;
	}

	if (!has_bankable_items(upgrade_job_item)) return;
	game_log(`🎒 Down to ${free_inventory_slots()} free slots mid-upgrade — banking handed-over loot.`, "#888");
	await bank_items(upgrade_job_item);
	await smarter_move(HOME);
	task_heartbeat();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO UPGRADE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function withdraw_upgrade_scrolls() {

	refresh_bank_snapshot();

	const empty_slots = free_inventory_slots();
	if (empty_slots < 10) {
		game_log(`❌ Not enough inventory space to withdraw scrolls. Need at least 10 free slots, have ${empty_slots}.`);
		return;
	}

	for (const item of UPGRADE_SCROLLS) {
		try {
			await withdraw_item(item);
		} catch (e) {
			catcher(e, "withdraw_upgrade_scrolls: " + item);
		}
	}

	game_log("✅ Scroll withdrawal check complete.");
}

async function withdraw_offering() {

	game_log("Withdrawing offeringp for upgrades that require it.");

	try {
		await withdraw_item("offeringp");
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

	if (free_inventory_slots() <= 3) {
		game_log("❌ Not enough inventory space to withdraw upgrade items.");
		return;
	}

	for (const item_name in UPGRADE_PROFILE) {
		const level_counts = bank_level_counts(bank_data, item_name, UPGRADE_PROFILE[item_name].max_level);
		for (const level of Object.keys(level_counts).map(Number).sort((a, b) => a - b)) {
			const to_withdraw = Math.min(level_counts[level], free_inventory_slots() - 3);
			if (to_withdraw <= 0) break;
			await withdraw_item(item_name, level, to_withdraw);
		}
		if (free_inventory_slots() <= 3) break;
	}

	for (const item_name in COMBINE_PROFILE) {
		const level_counts = bank_level_counts(bank_data, item_name, COMBINE_PROFILE[item_name].max_level);
		for (const level of Object.keys(level_counts).map(Number).sort((a, b) => a - b)) {
			const sets = Math.min(Math.floor(level_counts[level] / 3), Math.floor((free_inventory_slots() - 3) / 3));
			if (sets > 0) await withdraw_item(item_name, level, sets * 3);
		}
		if (free_inventory_slots() <= 3) break;
	}

	game_log("✅ Finished withdrawing upgrade and compound items, leaving at least 3 inventory slots free.");
}

function has_upgradeable_items(packs) {
	for (const item_name in UPGRADE_PROFILE) {
		if (Object.keys(bank_level_counts(packs, item_name, UPGRADE_PROFILE[item_name].max_level)).length) return true;
	}

	for (const item_name in COMBINE_PROFILE) {
		if (Object.values(bank_level_counts(packs, item_name, COMBINE_PROFILE[item_name].max_level)).some(q => q >= 3)) return true;
	}

	return false;
}

function bank_has_upgradeable_items() {
	const bank_data = character.bank || load_bank_from_local_storage();
	return !!bank_data && has_upgradeable_items(bank_data);
}

function inventory_has_upgradeable_items() {
	return has_upgradeable_items({ items: character.items });
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

		const scrollname = scroll_for(profile, item.level, "scroll");
		const scroll_slot = inventory_slot(scrollname);

		if (scroll_slot === null) {
			const needed = character.items.filter((it, j) => {
				const it_profile = it && UPGRADE_PROFILE[it.name];
				return it_profile && it.level === level && it.level < it_profile.max_level
					&& !upgrade_failed_slots.has(j) && scroll_for(it_profile, level, "scroll") === scrollname;
			}).length;
			return await buy_scrolls(scrollname, needed, `upgrading ${item.name} (level ${item.level})`) ? "wait" : "end";
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

		let slot = i;
		if (!character.q.upgrade) {
			slot = upgrade_slot_for(i);
			use_mass_production(item.level);
			game_log(`Upgrading ${item.name} (level ${item.level}) with ${scrollname} in slot ${slot}`);
			try {
				if (slot !== i) await swap(i, slot);
				await upgrade(slot, inventory_slot(scrollname), offering_slot === null ? null : inventory_slot("offeringp"));
			} catch (e) {
				catcher(e, `auto_upgrade_item: ${item.name} (level ${item.level})`);
				upgrade_failed_slots.add(i);
				upgrade_failed_slots.add(slot);
				continue;
			}
		}

		while (character.q.upgrade) {
			await delay(50);
		}

		if (slot !== i && (character.items[slot] || character.items[i])) {
			await swap(slot, i).catch(e => catcher(e, `auto_upgrade_item: swap back ${slot} -> ${i}`));
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
		const scrollname = scroll_for(profile, lvl, "cscroll");
		if (inventory_slot(scrollname) !== null) continue;

		if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
			const has_primling = character.items.some(inv_item => inv_item && inv_item.name === "offeringp");
			if (!has_primling) {
				game_log(`Skipping combine for ${item_name} (level ${lvl}): No offeringp found for combine requiring it.`);
				continue;
			}
		}

		let needed = 0;
		for (const [other_key, [, other_entries]] of buckets) {
			if (scroll_for(COMBINE_PROFILE[other_key.split(":")[0]], lvl, "cscroll") === scrollname) {
				needed += Math.floor(total_qty(other_entries) / 3);
			}
		}
		return await buy_scrolls(scrollname, needed, `combining ${item_name} (level ${lvl})`) ? "wait" : "end";
	}

	for (const [key, [lvl, entries]] of buckets) {
		if (total_qty(entries) < 3) continue;

		const item_name = key.split(":")[0];
		const profile = COMBINE_PROFILE[item_name];

		const scrollname = scroll_for(profile, lvl, "cscroll");
		const scroll_slot = inventory_slot(scrollname);
		if (scroll_slot === null) continue;
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

		use_mass_production(lvl);

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
	if (!CONFIG.enabled.buying) return 0;
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
		const purchases = Array.from({ length: upgrade_buy_count(item_name) }, () =>
			buy(item_name).then(() => true, e => {
				catcher(e, "buy_for_upgrade: " + item_name);
				return false;
			})
		);
		const bought = (await Promise.all(purchases)).filter(Boolean).length;
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
			await make_upgrade_room();
			const result = await auto_upgrade_item(level);
			if (result === "done") {
				progressed = true;
				task_heartbeat();
			}
			if (result === "end") {
				game_log("❌ Ending auto-upgrade early due to insufficient gold or resources.");
			}
			if (result !== "done" && result !== "wait") break;
		}
	}

	return progressed;
}

async function auto_upgrade() {

	merchant_task = "Upgrading";
	const my_generation = merchant_task_generation;
	const abandoned = () => my_generation !== merchant_task_generation;

	try {
		await sell_items(upgrade_job_item);
		await bank_items(upgrade_job_item);
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
				await make_upgrade_room();
				const result = await auto_combine_item(level);
				if (result === "done") progressed = true;
				if (result === "end") {
					game_log("❌ Ending auto-combine early due to insufficient gold or resources.");
				}
				if (result !== "done" && result !== "wait") break;
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
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "auto_upgrade");
	} finally {
		if (!abandoned()) merchant_task = "Idle";
	}
}