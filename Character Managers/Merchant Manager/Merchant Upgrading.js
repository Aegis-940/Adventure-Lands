
// --------------------------------------------------------------------------------------------------------------------------------- //
// CONFIG
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_INTERVAL = 75;
const BANK_POSITION_TOLERANCE = 10;

const UPGRADE_PROFILE = {
	pouchbow:     { scroll0_until: 3, scroll1_until: 8, scroll2_until: 9, primling_from: 7, max_level: 9 },
	fireblade:    { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, grace_from: 8, max_level: 9 },
	firebow:      { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 6, max_level: 8 },
	firestaff:    { scroll0_until: 0, scroll1_until: 6, scroll2_until: 10, primling_from: 7, max_level: 8 },
	hbow:         { scroll0_until: 3, scroll1_until: 6, scroll2_until: 8, primling_from: 7, max_level: 7 },
	wingedboots:  { scroll0_until: 2, scroll1_until: 6, scroll2_until: 10, primling_from: 5, max_level: 9 },
	cape:         { scroll0_until: 0, scroll1_until: 5, scroll2_until: 6, primling_from: 5, max_level: 5 },
	coat:         { scroll0_until: 4, scroll1_until: 8, scroll2_until: 9, primling_from: 8, max_level: 9 },
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

const COMBINE_PROFILE = {
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
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// GRACE
// --------------------------------------------------------------------------------------------------------------------------------- //

const GRACE_MAX_OFFERINGS = 5;

const GRACE_MAX = 5;

async function check_grace(item_slot) {
	const offering_slot = character.items.findIndex(it => it && it.name === "offeringp");
	if (offering_slot === -1) return null;

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
		log(`✅ Grace already at ${previous_grace} (>= GRACE_MAX ${GRACE_MAX}) for slot ${item_slot} — skipping.`, "limegreen");
		return { grace: previous_grace, capped: true };
	}

	for (let attempt = 0; attempt < GRACE_MAX_OFFERINGS; attempt++) {
		const offering_slot = character.items.findIndex(it => it && it.name === "offeringp");
		if (offering_slot === -1) {
			log(`⚠️ Ran out of offeringp before grace capped (at ${previous_grace}) for slot ${item_slot}.`, "#FFA500");
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
			log(`⚠️ Ran out of offeringp (or no grace field) re-checking grace (at ${previous_grace}) for slot ${item_slot}.`, "#FFA500");
			return { grace: previous_grace, capped: false };
		}

		if (current_grace <= previous_grace) {
			log(`✅ Grace capped at ${current_grace} for slot ${item_slot}.`, "limegreen");
			return { grace: current_grace, capped: true };
		}

		log(`Grace: ${previous_grace} -> ${current_grace}`);
		previous_grace = current_grace;

		if (previous_grace >= GRACE_MAX) {
			log(`✅ Grace reached ${previous_grace} (>= GRACE_MAX ${GRACE_MAX}) for slot ${item_slot} — stopping.`, "limegreen");
			return { grace: previous_grace, capped: true };
		}
	}

	log(`⚠️ Grace still rising after ${GRACE_MAX_OFFERINGS} offerings (at ${previous_grace}) for slot ${item_slot} — stopping as a safety backstop.`, "#FFA500");
	return { grace: previous_grace, capped: false };
}

const grace_capped_slots = new Set();

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

	await parent.$("#maincode")[0].contentWindow.render_bank_items();
	await delay(1000);
	await parent.hide_modal();

	const SCROLL_TYPES = ["scroll0", "scroll1", "scroll2", "cscroll0", "cscroll1", "cscroll2"];

	const empty_slots = character.items.filter(it => !it).length;
	if (empty_slots < 10) {
		game_log(`❌ Not enough inventory space to withdraw scrolls. Need at least 10 free slots, have ${empty_slots}.`);
		return;
	}

	for (const item of SCROLL_TYPES) {
		try {
			withdraw_item(item);
			await delay(400);
		} catch (e) {
		game_log("⚠️ Withdraw Scroll error:", "#FF0000");
		game_log(e);
		}
	}

	game_log("✅ Scroll withdrawal check complete.");
}

async function withdraw_offering() {

	log("Withdrawing offeringp for upgrades that require it.");

	try {
		
		withdraw_item("offeringp");
		await delay(400);
	} catch (e) {
		game_log("⚠️ Withdraw Offering error:", "#FF0000");
		game_log(e);
	}   

}

async function withdraw_upgradeable_items() {
	if (character.map !== BANK_LOCATION.map || Math.hypot(character.x - BANK_LOCATION.x, character.y - BANK_LOCATION.y) > BANK_POSITION_TOLERANCE) {
		await smarter_move(BANK_LOCATION, null, { radius: BANK_POSITION_TOLERANCE });
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

	let free_slots = count_empty_inventory();
	if (free_slots <= 3) {
		game_log("❌ Not enough inventory space to withdraw upgrade items.");
		return;
	}

	for (const item_name in UPGRADE_PROFILE) {
		const max_level = UPGRADE_PROFILE[item_name].max_level;

		for (const pack in bank_data) {
			if (!Array.isArray(bank_data[pack])) continue;
			for (let slot = 0; slot < bank_data[pack].length; slot++) {
				const item = bank_data[pack][slot];
				if (
					item &&
					item.name === item_name &&
					(typeof item.level !== "number" || item.level < max_level)
				) {
					free_slots = count_empty_inventory();
					if (free_slots <= 3) break;
					const max_withdrawable = free_slots - 3;
					const to_withdraw = Math.min(item.q || 1, max_withdrawable);
					if (to_withdraw > 0) {
						withdraw_item(item_name, item.level, to_withdraw);
						await delay(400);
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

	free_slots = count_empty_inventory();
	for (const item_name in COMBINE_PROFILE) {
		const max_level = COMBINE_PROFILE[item_name].max_level;

		let level_map = {};
		for (const pack in bank_data) {
			if (!Array.isArray(bank_data[pack])) continue;
			for (let slot = 0; slot < bank_data[pack].length; slot++) {
				const item = bank_data[pack][slot];
				if (
					item &&
					item.name === item_name &&
					(typeof item.level !== "number" || item.level < max_level)
				) {
					const lvl = item.level || 0;
					if (!level_map[lvl]) level_map[lvl] = 0;
					level_map[lvl] += item.q || 1;
				}
			}
		}

		for (const level_str of Object.keys(level_map).sort((a, b) => a - b)) {
			let level = Number(level_str);
			let count = level_map[level];

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
							item.name === item_name &&
							(item.level || 0) === level
						) {
							free_slots = count_empty_inventory();
							if (free_slots <= 3) break;
							const withdraw_count = Math.min(item.q || 1, remaining);
							if (withdraw_count > 0) {
								withdraw_item(item_name, level, withdraw_count);
								remaining -= withdraw_count;
								count -= withdraw_count;
								await delay(400);
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

function bank_has_upgradeable_items() {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return false;

	for (const item_name in UPGRADE_PROFILE) {
		const max_level = UPGRADE_PROFILE[item_name].max_level;
		for (const pack in bank_data) {
			if (!Array.isArray(bank_data[pack])) continue;
			for (const item of bank_data[pack]) {
				if (item && item.name === item_name && (typeof item.level !== "number" || item.level < max_level)) {
					return true;
				}
			}
		}
	}

	for (const item_name in COMBINE_PROFILE) {
		const max_level = COMBINE_PROFILE[item_name].max_level;
		const level_counts = {};
		for (const pack in bank_data) {
			if (!Array.isArray(bank_data[pack])) continue;
			for (const item of bank_data[pack]) {
				if (item && item.name === item_name && (typeof item.level !== "number" || item.level < max_level)) {
					const lvl = item.level || 0;
					level_counts[lvl] = (level_counts[lvl] || 0) + (item.q || 1);
					if (level_counts[lvl] >= 3) return true;
				}
			}
		}
	}

	return false;
}

async function auto_upgrade_item(level) {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.level !== level) continue;

		const profile = UPGRADE_PROFILE[item.name];
		if (!profile || item.level >= profile.max_level) continue;

		let scrollname =
			item.level < profile.scroll0_until ? "scroll0"
			: item.level < profile.scroll1_until ? "scroll1"
			: "scroll2";

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
			const scroll_cost = G.items[scrollname]?.g || 0;
			if (character.gold < scroll_cost) {
				log(`❌ Not enough gold to buy ${scrollname} for upgrading ${item.name} (level ${item.level}). Ending auto-upgrade.`);
				return "end";
			}
			else {
				parent.buy(scrollname);
				log(`Buying ${scrollname} for upgrading ${item.name} (level ${item.level})`);
				return "wait";
			}
		}

		if (profile.grace_from !== undefined && item.level >= profile.grace_from && !grace_capped_slots.has(i)) {
			log(`${item.name} (level ${item.level}): proceeding with best-effort grace (not confirmed capped).`, "#FFA500");
		}

		let offering_slot = null;
		if (profile.primling_from !== undefined && item.level >= profile.primling_from) {
			for (let j = 0; j < character.items.length; j++) {
				const inv_item = character.items[j];
				if (inv_item && inv_item.name === "offeringp") {
					offering_slot = j;
					break;
				}
			}
			if (offering_slot === null) {
				log(`Skipping ${item.name} (level ${item.level}): No offeringp found for upgrade requiring it.`);
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
			parent.socket.emit("upgrade", {
				item_num: i,
				scroll_num: scroll_slot,
				offering_num: offering_slot,
				clevel: item.level,
			});
			await delay(200);
			game_log(`Upgrading ${item.name} (level ${item.level}) with ${scrollname}`);
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
			else {
				parent.buy(scrollname);
				game_log(`Buying ${scrollname} for combining ${item_name} (level ${lvl})`);
				return "wait";
			}
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

		if (profile.primling_from !== undefined && lvl >= profile.primling_from) {
			const has_primling = character.items.some(inv_item => inv_item && inv_item.name === "offeringp");
			if (!has_primling) {
				game_log(`Skipping combine for ${item_name} (level ${lvl}): No offeringp found for combine requiring it.`);
				continue;
			}
		}

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

		if (can_use("massproduction")) {
			use_skill("massproduction");
			await delay(20);
		}

		parent.socket.emit("compound", {
			items: pick_three_slots(entries),
			scroll_num: scroll_slot,
			offering_num: offering_slot,
			clevel: lvl,
		});
		await delay(200);
		game_log(`Combining 3x ${item_name} (level ${lvl}) with ${scrollname}`);
		return "done";
	}
	game_log("No valid items found for combine.");
	return "none";
}

async function auto_upgrade() {

	merchant_task = "Upgrading";

	try {
		if (character.map !== "bank") {
			await smarter_move(BANK_LOCATION);
		}

		await withdraw_upgrade_scrolls();
		await withdraw_offering();
		await withdraw_upgradeable_items();

		await smarter_move(HOME);

		await auto_grace_pass();

		let upgraded = true;
		for (let level = 0; level <= 10; level++) {
			upgraded = false;
			while (true) {
				const result = await auto_upgrade_item(level);
				if (result === "done" || result === "wait") {
					upgraded = true;
					await delay(UPGRADE_INTERVAL);
				} else if (result === "end") {
					game_log("❌ Ending auto-upgrade early due to insufficient gold or resources.");
					break;
				} else {
					break;
				}
			}
		}

		let combined = true;
		for (let level = 0; level <= 5; level++) {
			combined = false;
			while (true) {
				const result = await auto_combine_item(level);
				if (result === "done" || result === "wait") {
					combined = true;
					await delay(UPGRADE_INTERVAL);
				} else if (result === "end") {
					game_log("❌ Ending auto-combine early due to insufficient gold or resources.");
					break;
				} else {
					break;
				}
			}
		}

		game_log("✅ Auto upgrade and combine complete.");
		await delay(5000);
		await sell_items();
		await bank_items();
	} catch (e) {
		catcher(e, "auto_upgrade");
	} finally {
		merchant_task = "Idle";
	}
}