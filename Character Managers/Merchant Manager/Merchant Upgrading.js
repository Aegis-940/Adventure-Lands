
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

var BANK_POSITION_TOLERANCE = 10;

var UPGRADE_PROFILE = {
	pouchbow:     { scroll0_until: 0, scroll1_until: 8, scroll2_until: 9, primling_from: 6, max_level: 9 },
	fireblade:    { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, grace_from: 8, max_level: 9 },
	firebow:      { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, max_level: 8 },
	firestaff:    { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 7, max_level: 8 },
	hbow:         { scroll0_until: 0, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 7 },
	wingedboots:  { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 5, max_level: 9 },
	cape:         { scroll0_until: 0, scroll1_until: 5, scroll2_until: 6, primling_from: 5, max_level: 5 },
	coat:         { scroll0_until: 0, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 10 },
	pants:        { scroll0_until: 0, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 10 },
	ololipop:     { scroll0_until: 0, scroll1_until: 8, scroll2_until: 9, primling_from: 5, max_level: 8 },
	quiver:       { scroll0_until: 0, scroll1_until: 6, scroll2_until: 9, primling_from: 7, max_level: 6 },
	crossbow:     { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 6, max_level: 7 },
	basher:       { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 6, max_level: 8 },
	broom:        { scroll0_until: 0, scroll1_until: 7, scroll2_until: 9, primling_from: 7, max_level: 7 },
	harbringer:   { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 4, max_level: 7 },
	t2quiver:     { scroll0_until: 0, scroll1_until: 4, scroll2_until: 9, primling_from: 4, max_level: 7 },
	mshield:      { scroll0_until: 0, scroll1_until: 0, scroll2_until: 9, primling_from: 3, max_level: 8 },
	supermittens: { scroll0_until: 0, scroll1_until: 0, scroll2_until: 9, primling_from: 3, max_level: 4 },
	lmace:        { scroll0_until: 0, scroll1_until: 0, scroll2_until: 9, primling_from: 3, max_level: 5 },
	bataxe:       { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, max_level: 9 },
	djinncrown:   { scroll0_until: 0, scroll1_until: 2, scroll2_until: 10, primling_from: 4, max_level: 7 },
	covemantle:   { scroll0_until: 0, scroll1_until: 2, scroll2_until: 10, primling_from: 4, max_level: 4 },
	cave_mothsteps: { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 4, max_level: 6 },
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
	const slot = locate_item(item_name);
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
		log_msg("error", `Not enough gold to buy ${scrollname} for ${context}.`);
		return false;
	}
	log_msg("info", `Buying ${n}x ${scrollname} for ${context}`);
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
		log_msg("info", `✅ Grace already at ${previous_grace} (>= GRACE_MAX ${GRACE_MAX}) for slot ${item_slot} — skipping.`);
		return { grace: previous_grace, capped: true };
	}

	for (let attempt = 0; attempt < GRACE_MAX_OFFERINGS; attempt++) {
		const offering_slot = inventory_slot("offeringp");
		if (offering_slot === null) {
			log_msg("warn", `Ran out of offeringp before grace capped (at ${previous_grace}) for slot ${item_slot}.`);
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
			log_msg("warn", `Ran out of offeringp (or no grace field) re-checking grace (at ${previous_grace}) for slot ${item_slot}.`);
			return { grace: previous_grace, capped: false };
		}

		if (current_grace <= previous_grace) {
			log_msg("info", `✅ Grace capped at ${current_grace} for slot ${item_slot}.`);
			return { grace: current_grace, capped: true };
		}

		log_msg("info", `Grace: ${previous_grace} -> ${current_grace}`);
		previous_grace = current_grace;

		if (previous_grace >= GRACE_MAX) {
			log_msg("info", `✅ Grace reached ${previous_grace} (>= GRACE_MAX ${GRACE_MAX}) for slot ${item_slot} — stopping.`);
			return { grace: previous_grace, capped: true };
		}
	}

	log_msg("warn", `Grace still rising after ${GRACE_MAX_OFFERINGS} offerings (at ${previous_grace}) for slot ${item_slot} — stopping as a safety backstop.`);
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
	const target = upgrade_target();
	if (item.name === target.name) return below_max_level(item, target.level);
	const profile = UPGRADE_PROFILE[item.name] || COMBINE_PROFILE[item.name];
	return !!profile && below_max_level(item, profile.max_level);
}

async function make_upgrade_room() {
	if (character.esize > UPGRADE_BUY_RESERVE_SLOTS) return;

	if (has_sellable_items(upgrade_job_item)) {
		sell_sellable_items(upgrade_job_item);
		return;
	}

	if (!has_bankable_items(upgrade_job_item)) return;
	log_msg("debug", `🎒 Down to ${character.esize} free slots mid-upgrade — banking handed-over loot.`);
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
	const target = upgrade_target();
	return !!target.name && held_items(target.name).filter(it => (it.level || 0) >= target.level).length < target.count;
}

function target_profile(name) {
	const grades = G.items[name].grades;
	return UPGRADE_PROFILE[name] || { scroll0_until: 0, scroll1_until: grades[0] };
}

function npc_sells(name) {
	return Object.values(G.npcs).some(npc => (npc.items || []).includes(name));
}

function target_plan() {
	const target = upgrade_target();
	const profile = target_profile(target.name);
	return item => item.name === target.name && (item.level || 0) < target.level ? profile : null;
}

function profile_plan() {
	const target = upgrade_target_open() ? upgrade_target().name : null;
	return item => {
		const profile = UPGRADE_PROFILE[item.name];
		return profile && item.name !== target && (item.level || 0) < profile.max_level ? profile : null;
	};
}

async function upgrade_target_pass(abandoned) {
	if (!upgrade_target_open()) return false;
	const progressed = await upgrade_pass(abandoned, target_plan());

	if (progressed && !upgrade_target_open()) {
		const target = upgrade_target();
		log_msg("event", `🎯 Upgrade target reached: ${target.count}x ${target.name} +${target.level}.`);
	}
	return progressed;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// AUTO UPGRADE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function withdraw_upgrade_scrolls() {

	refresh_bank_snapshot();

	const empty_slots = character.esize;
	if (empty_slots < 10) {
		log_msg("error", `Not enough inventory space to withdraw scrolls. Need at least 10 free slots, have ${empty_slots}.`);
		return;
	}

	for (const item of UPGRADE_SCROLLS) {
		try {
			await withdraw_item(item);
		} catch (e) {
			catcher(e, "withdraw_upgrade_scrolls: " + item);
		}
	}

	log_msg("info", "✅ Scroll withdrawal check complete.");
}

async function withdraw_offering() {

	log_msg("info", "Withdrawing offeringp for upgrades that require it.");

	try {
		await withdraw_item("offeringp");
	} catch (e) {
		catcher(e, "withdraw_offering");
	}
}

async function withdraw_upgradeable_items() {
	if (character.map !== BANK_LOCATION.map || Math.hypot(character.x - BANK_LOCATION.x, character.y - BANK_LOCATION.y) > BANK_POSITION_TOLERANCE) {
		await smarter_move(BANK_LOCATION, null, { radius: BANK_POSITION_TOLERANCE });
		await sleep(500);
	}

	let bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) {
		log_msg("info", "No bank data available. Please open the bank or save bank data first.");
		return;
	}

	if (character.esize <= 3) {
		log_msg("error", "Not enough inventory space to withdraw upgrade items.");
		return;
	}

	const target = upgrade_target_open() ? upgrade_target() : null;
	if (target) {
		const level_counts = bank_level_counts(bank_data, target.name, target.level);
		for (const level of Object.keys(level_counts).map(Number).sort((a, b) => b - a)) {
			const to_withdraw = Math.min(level_counts[level], character.esize - 3);
			if (to_withdraw <= 0) break;
			await withdraw_item(target.name, level, to_withdraw);
		}
	}

	for (const item_name in UPGRADE_PROFILE) {
		if (target && item_name === target.name) continue;
		const level_counts = bank_level_counts(bank_data, item_name, UPGRADE_PROFILE[item_name].max_level);
		for (const level of Object.keys(level_counts).map(Number).sort((a, b) => a - b)) {
			const to_withdraw = Math.min(level_counts[level], character.esize - 3);
			if (to_withdraw <= 0) break;
			await withdraw_item(item_name, level, to_withdraw);
		}
		if (character.esize <= 3) break;
	}

	for (const item_name in COMBINE_PROFILE) {
		const level_counts = bank_level_counts(bank_data, item_name, COMBINE_PROFILE[item_name].max_level);
		for (const level of Object.keys(level_counts).map(Number).sort((a, b) => a - b)) {
			const sets = Math.min(Math.floor(level_counts[level] / 3), Math.floor((character.esize - 3) / 3));
			if (sets > 0) await withdraw_item(item_name, level, sets * 3);
		}
		if (character.esize <= 3) break;
	}

	log_msg("info", "✅ Finished withdrawing upgrade and compound items, leaving at least 3 inventory slots free.");
}

function has_upgradeable_items(packs) {
	const target = upgrade_target();
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
		log_msg("warn", `${item.name} (level ${item.level}): proceeding with best-effort grace (not confirmed capped).`);
	}

	let offering_slot = null;
	if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
		offering_slot = inventory_slot("offeringp");
		if (offering_slot === null) {
			log_msg("info", `Skipping ${item.name} (level ${item.level}): No offeringp found for upgrade requiring it.`);
			return "skip";
		}
	}

	if (!character.q.upgrade) {
		use_mass_production(item.level);
		try {
			await upgrade_in_lucky_slot(i, inventory_slot(scrollname), offering_slot === null ? null : inventory_slot("offeringp"));
		} catch (e) {
			catcher(e, `upgrade_slot: ${item.name} (level ${item.level})`);
			upgrade_failed_slots.add(i);
			return "failed";
		}
	}

	while (character.q.upgrade) {
		await sleep(50);
	}

	return "done";
}

var _lucky_parked = null;

function swapped_index(slot, a, b) {
	return slot === a ? b : slot === b ? a : slot;
}

async function upgrade_in_lucky_slot(i, scroll, offering) {
	const item = character.items[i];
	const lucky = upgrade_slot_for(i);
	if (_lucky_parked && _lucky_parked.lucky !== lucky) await restore_lucky_slot();

	log_msg("info", `Upgrading ${item.name} (level ${item.level || 0}) in slot ${lucky}`);
	const moved = [];
	if (i !== lucky) {
		if (!_lucky_parked) _lucky_parked = { lucky, parked: i };
		else if (_lucky_parked.parked === i) _lucky_parked = null;
		moved.push(swap(i, lucky));
	}

	parent.socket.emit("upgrade", {
		item_num: lucky,
		scroll_num: swapped_index(scroll, i, lucky),
		offering_num: offering === null ? null : swapped_index(offering, i, lucky),
		clevel: item.level || 0,
	});
	const [result] = await Promise.all([parent.push_deferred("upgrade"), ...moved]);
	return result;
}

async function restore_lucky_slot() {
	if (!_lucky_parked) return;
	const { lucky, parked } = _lucky_parked;
	_lucky_parked = null;
	if (character.items[lucky] || character.items[parked]) {
		await swap(lucky, parked).catch(e => catcher(e, `restore_lucky_slot: ${lucky} <-> ${parked}`));
	}
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
	log_msg("info", "No valid items found for upgrade.");
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
				log_msg("info", `Skipping combine for ${item_name} (level ${lvl}): No offeringp found for combine requiring it.`);
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

		let offering_slot = null;
		if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
			offering_slot = inventory_slot("offeringp");
			if (offering_slot === null) {
				log_msg("info", `Skipping combine for ${item_name} (level ${lvl}): No offeringp found for combine requiring it.`);
				continue;
			}
		}

		use_mass_production(lvl);

		const picks = pick_three_slots(entries);
		log_msg("info", `Combining 3x ${item_name} (level ${lvl}) with ${scrollname}`);
		try {
			await compound(picks[0], picks[1], picks[2], scroll_slot, offering_slot);
		} catch (e) {
			catcher(e, `auto_combine_item: ${item_name} (level ${lvl})`);
			combine_failed_keys.add(key);
			continue;
		}
		return "done";
	}
	log_msg("info", "No valid items found for combine.");
	return "none";
}

var UPGRADE_BUY_RESERVE_SLOTS = 5;

function target_base_odds(target) {
	const igrade = calculate_item_grade(G.items[target.name], { level: 0 });
	let odds = 1;
	for (let level = 1; level <= target.level; level++) odds *= G.upgrades[igrade][level];
	return odds;
}

function upgrade_buy_count() {
	const target = upgrade_target();
	if (!upgrade_target_open() || !npc_sells(target.name)) return 0;
	const held = held_items(target.name);
	if (held.some(it => (it.level || 0) < target.level)) return 0;
	const missing = target.count - held.filter(it => (it.level || 0) >= target.level).length;
	const spare_gold = character.gold - CONFIG.upgrade_gold_threshold;
	return Math.max(0, Math.min(
		Math.ceil(missing / target_base_odds(target)),
		character.esize - UPGRADE_BUY_RESERVE_SLOTS,
		Math.floor(spare_gold / parent.G.items[target.name].g)
	));
}

function can_buy_for_upgrade() {
	return upgrade_buy_count() > 0;
}

async function buy_for_upgrade() {
	const item_name = upgrade_target().name;
	const purchases = Array.from({ length: upgrade_buy_count() }, () =>
		buy(item_name).then(() => true, e => {
			catcher(e, "buy_for_upgrade: " + item_name);
			return false;
		})
	);
	const bought = (await Promise.all(purchases)).filter(Boolean).length;
	if (bought > 0) {
		log_msg("info", `🛒 Bought ${bought}x ${item_name} to upgrade.`);
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
				log_msg("error", "Ending auto-upgrade early due to insufficient gold or resources.");
			}
			if (result !== "done" && result !== "wait") break;
		}
	}

	await restore_lucky_slot();
	return progressed;
}

async function auto_upgrade(abandoned) {
	log_msg("info", "Starting auto-upgrade process...");
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
				log_msg("error", "Ending auto-combine early due to insufficient gold or resources.");
			}
			if (result !== "done" && result !== "wait") break;
		}
	}

	if (abandoned()) {
		log_msg("warn", "Upgrading was force-reset by the watchdog — abandoning this run.");
		return;
	}

	if (!progressed) {
		_upgrade_retry_at = Date.now() + UPGRADE_RETRY_MS;
		log_msg("warn", `Upgrade run made no progress — not retrying for ${UPGRADE_RETRY_MS / 60000} min.`);
	}

	log_msg("info", "✅ Auto upgrade and combine complete.");
	await sell_items();
	await bank_items();
}
