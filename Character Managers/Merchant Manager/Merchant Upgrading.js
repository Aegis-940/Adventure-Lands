
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
	if (item.name === CONFIG.upgrade_target.name) return below_max_level(item, CONFIG.upgrade_target.level);
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
// UPGRADE TARGET — n copies of one item at +m, batch-upgraded level by level before the profile items
// --------------------------------------------------------------------------------------------------------------------------------- //

function held_items(name) {
	const bank_data = character.bank || load_bank_from_local_storage() || {};
	return character.items.concat(bank_contents(bank_data)).filter(it => it && it.name === name);
}

function upgrade_target_open() {
	const target = CONFIG.upgrade_target;
	return !!target.name && held_items(target.name).filter(it => (it.level || 0) >= target.level).length < target.count;
}

function target_profile(name) {
	const grades = G.items[name].grades;
	return UPGRADE_PROFILE[name] || { scroll0_until: grades[0], scroll1_until: grades[1] };
}

function npc_sells(name) {
	return Object.values(G.npcs).some(npc => (npc.items || []).includes(name));
}

function target_plan() {
	const target = CONFIG.upgrade_target;
	const profile = target_profile(target.name);
	return item => item.name === target.name && (item.level || 0) < target.level ? profile : null;
}

function profile_plan() {
	const target = upgrade_target_open() ? CONFIG.upgrade_target.name : null;
	return item => {
		const profile = UPGRADE_PROFILE[item.name];
		return profile && item.name !== target && (item.level || 0) < profile.max_level ? profile : null;
	};
}

async function upgrade_target_pass(abandoned) {
	if (!upgrade_target_open()) return false;
	const progressed = await upgrade_pass(abandoned, target_plan());

	if (progressed && !upgrade_target_open()) {
		const target = CONFIG.upgrade_target;
		game_log(`🎯 Upgrade target reached: ${target.count}x ${target.name} +${target.level}.`, "limegreen");
	}
	return progressed;
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

	const target = upgrade_target_open() ? CONFIG.upgrade_target : null;
	if (target) {
		const level_counts = bank_level_counts(bank_data, target.name, target.level);
		for (const level of Object.keys(level_counts).map(Number).sort((a, b) => b - a)) {
			const to_withdraw = Math.min(level_counts[level], free_inventory_slots() - 3);
			if (to_withdraw <= 0) break;
			await withdraw_item(target.name, level, to_withdraw);
		}
	}

	for (const item_name in UPGRADE_PROFILE) {
		if (target && item_name === target.name) continue;
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
	const target = CONFIG.upgrade_target;
	if (upgrade_target_open() && Object.keys(bank_level_counts(packs, target.name, target.level)).length) return true;

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

async function upgrade_slot(i, profile, needed) {
	const item = character.items[i];
	const scrollname = scroll_for(profile, item.level, "scroll");

	if (inventory_slot(scrollname) === null) {
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
			return "skip";
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
			catcher(e, `upgrade_slot: ${item.name} (level ${item.level})`);
			upgrade_failed_slots.add(i);
			upgrade_failed_slots.add(slot);
			return "failed";
		}
	}

	while (character.q.upgrade) {
		await delay(50);
	}

	if (slot !== i && (character.items[slot] || character.items[i])) {
		await swap(slot, i).catch(e => catcher(e, `upgrade_slot: swap back ${slot} -> ${i}`));
	}

	return "done";
}

async function auto_upgrade_item(level, plan) {
	const eligible = (it, j) => !!it && (it.level || 0) === level && !upgrade_failed_slots.has(j) && !!plan(it);

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!eligible(item, i)) continue;

		const profile = plan(item);
		const scrollname = scroll_for(profile, level, "scroll");
		const needed = character.items.filter((it, j) => eligible(it, j) && scroll_for(plan(it), level, "scroll") === scrollname).length;

		const result = await upgrade_slot(i, profile, needed);
		if (result === "skip" || result === "failed") continue;
		return result;
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

function target_base_odds(target) {
	const igrade = upgrade_grade(G.items[target.name], 0);
	let odds = 1;
	for (let level = 1; level <= target.level; level++) odds *= G.upgrades[igrade][level];
	return odds;
}

function upgrade_buy_count() {
	const target = CONFIG.upgrade_target;
	if (!upgrade_target_open() || !npc_sells(target.name)) return 0;
	const held = held_items(target.name);
	if (held.some(it => (it.level || 0) < target.level)) return 0;
	const missing = target.count - held.filter(it => (it.level || 0) >= target.level).length;
	const spare_gold = character.gold - CONFIG.upgrade_gold_threshold;
	return Math.max(0, Math.min(
		Math.ceil(missing / target_base_odds(target)),
		free_inventory_slots() - UPGRADE_BUY_RESERVE_SLOTS,
		Math.floor(spare_gold / parent.G.items[target.name].g)
	));
}

function can_buy_for_upgrade() {
	return upgrade_buy_count() > 0;
}

async function buy_for_upgrade() {
	const item_name = CONFIG.upgrade_target.name;
	const purchases = Array.from({ length: upgrade_buy_count() }, () =>
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

async function upgrade_pass(abandoned, plan) {
	upgrade_failed_slots.clear();
	let progressed = false;

	for (let level = 0; level < 12 && !abandoned(); level++) {
		while (!abandoned()) {
			await make_upgrade_room();
			const result = await auto_upgrade_item(level, plan);
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
			const target_progressed = await upgrade_target_pass(abandoned);
			pass_progressed = await upgrade_pass(abandoned, profile_plan()) || target_progressed;
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOLIPOP PUSH — ololipops +8 → +10 on demand: glolipop fails stack the odds, primlings grace every roll to its cap
// --------------------------------------------------------------------------------------------------------------------------------- //

var LOLIPOP_PUSH = {
	target: "ololipop",
	sacrifice: "glolipop",
	sacrifice_scroll: "scroll1",
	sacrifices_per_reset: 2,
	sacrifice_batch: 6,
	grace: "offeringp",
	stages: {
		8: { scroll: "scroll2", offering: "offeringp" },
		9: { scroll: "scroll3", offering: "offering" },
	},
	buyable: ["scroll1", "scroll2"],
	free_slots: 5,
};

var LOLIPOP_RUN_KEY = "AL_lolipop_push";

var lolipop_run = storage_read(LOLIPOP_RUN_KEY) || { active: false };

function save_lolipop_run() {
	storage_write(LOLIPOP_RUN_KEY, lolipop_run);
}

function lolipop_push() {
	if (lolipop_run.active) {
		game_log("🍭 Lolipop push is already running.", "#FF69B4");
		return;
	}
	lolipop_run = { active: true, due: LOLIPOP_PUSH.sacrifices_per_reset, rolls: { 8: 0, 9: 0 }, wins: { 8: 0, 9: 0 }, sacrificed: 0, graced: 0 };
	save_lolipop_run();
	game_log(`🍭 Lolipop push started: ${stock_of(LOLIPOP_PUSH.target, 8)} ololipops at +8, ${stock_of(LOLIPOP_PUSH.target, 9)} at +9, `
		+ `${stock_of(LOLIPOP_PUSH.sacrifice, 8)} glolipops at +8 to fail.`, "#FF69B4");
}

function lolipop_push_stop() {
	stop_lolipop_push("stopped by hand");
}

function stop_lolipop_push(reason) {
	lolipop_run.active = false;
	save_lolipop_run();
	game_log(`🍭 Lolipop push ended (${reason}). +8 rolls: ${lolipop_run.rolls[8]} → ${lolipop_run.wins[8]} at +9. `
		+ `+9 rolls: ${lolipop_run.rolls[9]} → ${lolipop_run.wins[9]} at +10. `
		+ `${lolipop_run.sacrificed} glolipops failed, ${lolipop_run.graced} primlings graced.`, "#FF69B4");
}

function stock_of(name, level) {
	return held_items(name)
		.filter(it => level === undefined || (it.level || 0) === level)
		.reduce((n, it) => n + (it.q || 1), 0);
}

function bag_slot(name, level) {
	const slot = character.items.findIndex(it => it && it.name === name && (level === undefined || (it.level || 0) === level));
	return slot === -1 ? null : slot;
}

function lolipop_stage() {
	if (stock_of(LOLIPOP_PUSH.target, 8) > 0) return 8;
	if (stock_of(LOLIPOP_PUSH.target, 9) > 0) return 9;
	return null;
}

function lolipop_kit_item(item) {
	if (item.name === LOLIPOP_PUSH.target) return item.level === 8 || item.level === 9;
	if (item.name === LOLIPOP_PUSH.sacrifice) return item.level === 8;
	return item.name === LOLIPOP_PUSH.grace || item.name === LOLIPOP_PUSH.sacrifice_scroll
		|| Object.values(LOLIPOP_PUSH.stages).some(kit => kit.scroll === item.name || kit.offering === item.name);
}

function lolipop_kit(stage) {
	const kit = LOLIPOP_PUSH.stages[stage];
	const items = [{ name: LOLIPOP_PUSH.grace }, { name: kit.scroll }, { name: kit.offering }];
	if (stage === 8 && lolipop_run.due > 0 && stock_of(LOLIPOP_PUSH.sacrifice, 8) > 0) {
		items.push({ name: LOLIPOP_PUSH.sacrifice_scroll }, { name: LOLIPOP_PUSH.sacrifice, level: 8, total: LOLIPOP_PUSH.sacrifice_batch });
	}
	items.push({ name: LOLIPOP_PUSH.target, level: stage, fill: true });
	return items;
}

async function stock_lolipop_kit(stage) {
	const in_bank = lolipop_kit(stage).filter(it => bag_slot(it.name, it.level) === null && stock_of(it.name, it.level) > 0);
	if (in_bank.length) {
		await bank_items(lolipop_kit_item);
		for (const it of in_bank) {
			await withdraw_item(it.name, it.level, it.fill ? Math.max(1, free_inventory_slots() - LOLIPOP_PUSH.free_slots) : it.total);
		}
		task_heartbeat();
	}

	if (character.map !== HOME.map || Math.hypot(character.x - HOME.x, character.y - HOME.y) > 10) {
		await smarter_move(HOME);
	}

	const kit = LOLIPOP_PUSH.stages[stage];
	const held = (name, level) => character.items.filter(it => it && it.name === name && it.level === level).length;
	const wanted = {
		[kit.scroll]: held(LOLIPOP_PUSH.target, stage),
		[LOLIPOP_PUSH.sacrifice_scroll]: stage === 8 ? Math.min(lolipop_run.due, held(LOLIPOP_PUSH.sacrifice, 8)) : 0,
	};
	for (const scroll of LOLIPOP_PUSH.buyable) {
		if (wanted[scroll] > 0 && bag_slot(scroll) === null) await buy_scrolls(scroll, wanted[scroll], "the lolipop push");
	}

	const short = [[LOLIPOP_PUSH.target, stage], [kit.scroll], [kit.offering]].filter(([name, level]) => bag_slot(name, level) === null);
	if (short.length) {
		stop_lolipop_push(`out of ${short.map(([name, level]) => G.items[name].name + (level ? ` +${level}` : "")).join(", ")}`);
		return false;
	}
	return true;
}

function upgrade_grade(def, level) {
	return def.grades.filter(g => level >= g).length;
}

function upgrade_chance_cap(item, kit) {
	const def = G.items[item.name];
	const grade = upgrade_grade(def, item.level);
	const base = G.upgrades[upgrade_grade(def, 0)][item.level + 1];
	const high = G.items[kit.scroll].grade > grade || G.items[kit.offering].grade > grade;
	return high ? Math.min(base + 0.36, base * 3) : Math.min(base + 0.24, base * 2);
}

async function upgrade_chance(slot, kit) {
	const reply = await upgrade(slot, inventory_slot(kit.scroll), inventory_slot(kit.offering), true);
	return reply.chance;
}

async function offer_grace(slot) {
	const offered = upgrade(slot, null, inventory_slot(LOLIPOP_PUSH.grace));
	const echo = parent.push_deferred("upgrade");
	try {
		await offered;
	} catch (e) {
		parent.resolve_deferred("upgrade");
		throw e;
	}
	await echo;
	task_heartbeat();
}

function spare_primlings(kit) {
	const held = character.items.filter(it => it && it.name === LOLIPOP_PUSH.grace).reduce((n, it) => n + (it.q || 1), 0);
	return held - (kit.offering === LOLIPOP_PUSH.grace ? 1 : 0);
}

async function grace_to_cap(slot, kit) {
	const cap = upgrade_chance_cap(character.items[slot], kit);
	let chance = await upgrade_chance(slot, kit);
	while (lolipop_run.active && chance < cap - 1e-9 && spare_primlings(kit) > 0) {
		await offer_grace(slot);
		lolipop_run.graced++;
		const next = await upgrade_chance(slot, kit);
		if (next <= chance) break;
		chance = next;
	}
	save_lolipop_run();
	return chance;
}

async function scroll_roll(slot, scroll, offering) {
	use_mass_production(character.items[slot].level);
	const result = await upgrade(slot, scroll, offering);
	task_heartbeat();
	return result.success;
}

async function lolipop_sacrifices() {
	while (lolipop_run.active && lolipop_run.due > 0) {
		let slot = bag_slot(LOLIPOP_PUSH.sacrifice, 8);
		const scroll = inventory_slot(LOLIPOP_PUSH.sacrifice_scroll);
		if (slot === null || scroll === null) return;

		const lucky = upgrade_slot_for(slot);
		if (slot === lucky) {
			const spare = character.items.findIndex((it, i) => !it && i !== lucky);
			await swap(slot, spare);
			slot = spare;
		}

		if (await scroll_roll(slot, scroll, null)) {
			lolipop_run.due = LOLIPOP_PUSH.sacrifices_per_reset;
			game_log(`🍭 A glolipop reached +9, which resets the stack — failing ${lolipop_run.due} more.`, "#FF69B4");
		} else {
			lolipop_run.due--;
			lolipop_run.sacrificed++;
			game_log(`🍭 Glolipop failed (stack +1). ${lolipop_run.due} more before the next ololipop.`, "#FF69B4");
		}
		save_lolipop_run();
	}
}

async function lolipop_roll(stage) {
	const kit = LOLIPOP_PUSH.stages[stage];
	const home = bag_slot(LOLIPOP_PUSH.target, stage);
	const chance = await grace_to_cap(home, kit);
	if (!lolipop_run.active) return;

	const slot = upgrade_slot_for(home);
	if (slot !== home) await swap(home, slot);

	game_log(`🍭 Rolling ololipop +${stage} → +${stage + 1} at ${(chance * 100).toFixed(2)}% (grace ${(character.items[slot].grace || 0).toFixed(1)}).`, "#FF69B4");
	const won = await scroll_roll(slot, inventory_slot(kit.scroll), inventory_slot(kit.offering));
	lolipop_run.rolls[stage]++;
	if (won) {
		lolipop_run.wins[stage]++;
		if (stage === 8) lolipop_run.due = LOLIPOP_PUSH.sacrifices_per_reset;
		game_log(stage === 9 ? "🎉 OLOLIPOP +10!" : `✅ Ololipop +9 (${lolipop_run.wins[8]} so far).`, "limegreen");
	} else {
		game_log(`❌ Ololipop +${stage} lost.`, "#FFA500");
	}
	save_lolipop_run();

	if (slot !== home && (character.items[slot] || character.items[home])) {
		await swap(slot, home).catch(e => catcher(e, `lolipop_roll: swap back ${slot} -> ${home}`));
	}
}

async function lolipop_push_step() {
	const stage = lolipop_stage();
	if (stage === null) {
		stop_lolipop_push("no ololipops left at +8 or +9");
		return;
	}
	if (!await stock_lolipop_kit(stage)) return;
	if (stage === 8) await lolipop_sacrifices();
	if (lolipop_run.active) await lolipop_roll(stage);
}