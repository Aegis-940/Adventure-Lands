// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT MANAGEMENT — what we keep, what we ship to the merchant, what we vendor
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT & INVENTORY
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOT_GOLD_RESERVE = 100000000;

const ITEMS_TO_KEEP_BASE = ["hpot1", "mpot1", "luckbooster", "goldbooster", "xpbooster",
	"pumpkinspice", "xptome", "tracker", "jacko", "talkingskull", "computer"];

const ITEM_ORDER_BASE = {
	tracktrix: 0,
	computer: 1,
	hpot1: 2,
	mpot1: 3,
	xptome: 4,
	pumpkinspice: 5,
	xpbooster: 6,
	jacko: 7,
};

let _set_item_names = null;

function equipment_set_item_names() {
	if (_set_item_names) return _set_item_names;
	const found = new Set();
	try {
		for (const name in equipment_sets) {
			for (const entry of equipment_sets[name] || []) {
				if (entry && entry.item_name) found.add(entry.item_name);
			}
		}
	} catch (e) { return found; }
	if (found.size) _set_item_names = found;
	return found;
}

function loose_loot(start) {
	const keep = typeof ITEMS_TO_KEEP !== "undefined" ? ITEMS_TO_KEEP : [];
	const gear = equipment_set_item_names();
	const out = [];
	for (let i = start; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.l || item.s) continue;
		if (keep.includes(item.name) || gear.has(item.name)) continue;
		out.push({ i, item });
	}
	return out;
}

async function send_to_merchant() {
	const merchant = get_player("Riff");
	if (!merchant || merchant.rip) return game_log("❌ Merchant not found or dead");
	if (merchant.map !== character.map || distance(character, merchant) > 400) {
		return game_log("❌ Merchant not nearby");
	}

	for (const { i, item } of loose_loot(LOOT_THRESHOLD)) {
		await delay(150);
		try {
			send_item("Riff", i, item.q || 1);
		} catch (e) {
			game_log(`⚠️ Could not send item in slot ${i}: ${item.name}`);
		}
	}

	const gold_to_send = character.gold - LOOT_GOLD_RESERVE;
	if (gold_to_send > 0) {
		await delay(10);
		try {
			await send_gold("Riff", gold_to_send);
		} catch (e) {
			game_log("⚠️ Could not send gold");
		}
	}
}

function clear_inventory() {
	const mule = get_player("Riff");
	if (!mule || distance(character, mule) >= 250) return;

	if (character.gold > LOOT_GOLD_RESERVE) send_gold(mule, character.gold - LOOT_GOLD_RESERVE);
	for (const { i, item } of loose_loot(0)) send_item(mule.id, i, item.q ?? 1);
}

function inventory_sorter() {
	const claimed = {};

	character.items.forEach((item, i) => {
		if (!item) return;
		const spec = item_order[item.name];
		if (spec === undefined) return;

		if (Array.isArray(spec)) {
			const next = claimed[item.name] || 0;
			if (next >= spec.length) return;
			claimed[item.name] = next + 1;
			const target = spec[next];
			if (i !== target) swap(i, target);
		} else if (i !== spec) {
			swap(i, spec);
		}
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHEST LOOTING — opened in place of a farm step, with the gold loadout on for the duration
// --------------------------------------------------------------------------------------------------------------------------------- //

let _loot_last = 0;
let _loot_gold_swap = 0;
let _looting = false;

function should_loot() {
	if (!CONFIG.looting?.enabled || character.cc > COOLDOWNS.cc) return false;
	if (_looting) return false;

	const now = performance.now();
	const stored_chest_count = Object.keys(get_chests()).length;
	const penalty = character.s?.penalty_cd?.ms || 0;

	return (
		stored_chest_count >= CONFIG.looting.chest_threshold &&
		character.targets < CONFIG.looting.target_count &&
		now - _loot_last > CONFIG.looting.loot_cooldown &&
		penalty === 0
	);
}

async function swap_booster(current, target) {
	const slot = locate_item(current);
	if (slot !== -1) shift(slot, target);
}

async function handle_looting() {
	_loot_last = performance.now();
	_looting = true;
	const token = equip_claim("looting", EQUIP_PRIORITY.loot);

	try {
		if (token && CONFIG.looting.equip_gold_gear && !is_set_equipped("gold")
			&& performance.now() - _loot_gold_swap > 1000) {
			await equip_apply(token, "gold");
			_loot_gold_swap = performance.now();
			await swap_booster("luckbooster", "goldbooster");
			await delay(200);
		}

		let looted = 0;
		const max_loots = CONFIG.looting.chest_threshold * 5;

		const stored_chests = get_chests();
		for (const chest_id in stored_chests) {
			if (looted >= max_loots) break;
			parent.open_chest(chest_id);
			looted++;
		}

		await delay(150);

		if (CONFIG.looting.equip_gold_gear) {
			await swap_booster("goldbooster", "luckbooster");
			await delay(200);
		}
	} catch (e) {
		catcher(e, "handle_looting");
	} finally {
		_looting = false;
		equip_release(token);
	}
}

function refresh_bank_snapshot() {
	try {
		if (character.bank && Object.keys(character.bank).length) {
			localStorage.setItem("savedBank", JSON.stringify(character.bank));
		}
	} catch (e) { }
}

async function withdraw_item(item_name, level = null, total = null) {

	const BANK_LOC1 = { map: "bank", x: 0, y: -37 };
	const BANK_LOC2 = { map: "bank_b", x: -265, y: -344 };

	await delay(200);

	let bank_data = character.bank;
	if (!bank_data || Object.keys(bank_data).length === 0) {
		bank_data = load_bank_from_local_storage();
		if (!bank_data) {
			game_log("⚠️ No bank data available. Open your bank or save it first.");
			return;
		}
	}

	let remaining = (total != null ? total : Infinity);
	let found_any  = false;

	for (const pack_key of Object.keys(bank_data)) {
		if (!pack_key.startsWith("items")) continue;
		const slot_arr = bank_data[pack_key];
		if (!Array.isArray(slot_arr)) continue;

		for (let slot = 0; slot < slot_arr.length && remaining > 0; slot++) {
			const itm = slot_arr[slot];
			if (!itm || itm.name !== item_name) continue;
			if (level != null && (itm.level || 0) !== level) continue;

			found_any = true;

			const pack_num = parseInt(pack_key.replace("items", ""), 10);
			if (!isNaN(pack_num)) {
				if (pack_num >= 0 && pack_num <= 7 && character.map !== "bank") {
					log(`Moving to Bank for pack ${pack_key}`);
					await smarter_move(BANK_LOC1);
					await delay(200);
				} else if (pack_num >= 8 && pack_num <= 14 && character.map !== "bank_b") {
					log(`Moving to Bank Basement for pack ${pack_key}`);
					await smarter_move(BANK_LOC1);
					await smarter_move(BANK_LOC2);
					await delay(200);
				}
			}

			try {
				await bank_retrieve(pack_key, slot, -1);
			} catch (e) {
				game_log(`⚠️ withdraw_item: ${item_name} not in ${pack_key} slot ${slot} `
					+ `(${(e && (e.reason || e.message)) || e})`, "#FFA500");
				continue;
			}
			await delay(100);
			refresh_bank_snapshot();
			remaining -= (itm.q || 1);
		}

		if (remaining <= 0) break;
	}

	if (!found_any) {
		game_log(`⚠️ No "${item_name}"${level != null ? ` level ${level}` : ""} found in bank.`);
	} else if (total != null && remaining > 0) {
		const got = total - remaining;
		game_log(`⚠️ Only retrieved ${got}/${total} of ${item_name}.`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// REMOTE SELLING (background auto-sell loop each fighter runs via setInterval(remote_sell_items, ...))
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = [
	"hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap",
	"cclaw", "crabclaw", "slimestaff", "stinger", "pstem", "gslime", "coat1", "helmet1",
	"gloves1", "pants1", "shoes1", "wbreeches", "vitring", "helmet", "shoes", "gloves",
	"pmace", "throwingstars", "t2bow", "spear", "dagger", "rapier", "sword", "mushroomstaff",
	"rfangs", "gphelmet", "phelmet", "vitearring", "vitscroll", "hhelmet", "harmor", "hpants",
	"hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring",
	"warmscarf", "snowball", "santasbelt", "pclaw", "broom", "skullamulet",
	"iceskates", "carrot", "xmace", "candycanesword", "pmaceofthedead", "ornamentstaff",
	"merry", "rednose", "xmashat", "xmasshoes", "xmassweater", "xmaspants", "mittens",
	"angelwings", "snowflakes", "epyjamas", "ecape", "eears", "eslippers", "carrotsword",
	"pinkie", "oozingterror", "harbringer", "quiver",
];

function remote_sell_items() {
	for (const { i, item } of loose_loot(0)) {
		if (item.p === undefined && SELLABLE_ITEMS.includes(item.name)) sell(i, item.q || 1);
	}
}
