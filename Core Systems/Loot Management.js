// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT MANAGEMENT — what we keep, what we ship to the merchant, what we vendor
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT & INVENTORY
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOT_GOLD_RESERVE = 100000000;

const ITEMS_TO_KEEP_BASE = ["hpot1", "mpot1", "luckbooster", "goldbooster", "xpbooster",
	"pumpkinspice", "xptome", "tracker", "tracktrix", "jacko", "talkingskull", "computer"];

const ITEM_ORDER_BASE = {
	tracker: 0,
	tracktrix: 0,
	computer: 1,
	hpot1: 2,
	mpot1: 3,
	xptome: 4,
	pumpkinspice: 5,
	xpbooster: 6,
	jacko: 7,
	elixirluck: [5, 8],
};

let _set_item_slots = null;

function equipment_set_item_slots() {
	if (_set_item_slots) return _set_item_slots;
	const found = {};
	try {
		for (const name in equipment_sets) {
			for (const entry of equipment_sets[name] || []) {
				if (!entry || !entry.item_name || !entry.slot) continue;
				if (!found[entry.item_name]) found[entry.item_name] = new Set();
				found[entry.item_name].add(entry.slot);
			}
		}
	} catch (e) { return found; }
	if (Object.keys(found).length) _set_item_slots = found;
	return found;
}

function reserved_gear_slots() {
	const set_slots = equipment_set_item_slots();
	const copies = {};
	const add = (name, i, item) => {
		if (!copies[name]) copies[name] = [];
		copies[name].push({ i, level: item.level || 0, locked: !!item.l });
	};

	for (const slot in character.slots) {
		const worn = character.slots[slot];
		if (worn && set_slots[worn.name]) add(worn.name, -1, worn);
	}
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !item.s && set_slots[item.name]) add(item.name, i, item);
	}

	const reserved = new Set();
	for (const name in copies) {
		copies[name].sort((a, b) => (b.locked - a.locked) || (b.level - a.level));
		for (const entry of copies[name].slice(0, set_slots[name].size)) {
			if (entry.i !== -1) reserved.add(entry.i);
		}
	}
	return reserved;
}

function loose_loot(start) {
	const keep = ITEMS_TO_KEEP;
	const reserved = reserved_gear_slots();
	const dungeon_keys = dungeon_protected_keys();
	const out = [];
	for (let i = start; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.l || item.s) continue;
		if (keep.includes(item.name) || reserved.has(i)) continue;
		if (dungeon_keys.includes(item.name)) continue;
		out.push({ i, item });
	}
	return out;
}

function swap_in_flight() {
	return equip_transient() || equip_pending();
}

function still_loose(i, item) {
	if (swap_in_flight()) return false;
	const now = character.items[i];
	if (!now || now.name !== item.name || (now.level || 0) !== (item.level || 0)) return false;
	return loose_loot(i).some(entry => entry.i === i);
}

const MERCHANT_SEND_RANGE = 400;
const MERCHANT_AUTO_SEND_RANGE = 250;

let _sending_to_merchant = false;

async function send_to_merchant() {
	if (_sending_to_merchant) return;
	const merchant = get_player("Riff");
	if (!merchant || merchant.rip) return game_log("❌ Merchant not found or dead");
	if (merchant.map !== character.map || distance(character, merchant) > MERCHANT_SEND_RANGE) {
		return game_log("❌ Merchant not nearby");
	}

	_sending_to_merchant = true;
	try {
		for (const { i, item } of loose_loot(LOOT_THRESHOLD)) {
			await delay(150);
			if (!still_loose(i, item)) continue;
			try {
				await send_item("Riff", i, character.items[i].q || 1);
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
	} finally {
		_sending_to_merchant = false;
	}
}

function clear_inventory() {
	if (_sending_to_merchant) return;
	const mule = get_player("Riff");
	if (!mule || mule.rip || distance(character, mule) >= MERCHANT_AUTO_SEND_RANGE) return;
	if (character.gold <= LOOT_GOLD_RESERVE && !loose_loot(LOOT_THRESHOLD).length) return;

	send_to_merchant().catch(e => catcher(e, "clear_inventory"));
}

function inventory_sorter() {
	if (swap_in_flight()) return;

	const items = character.items.slice();

	for (const name in item_order) {
		const spec = item_order[name];
		const slots = Array.isArray(spec) ? spec : [spec];
		const placed = new Set(slots.filter(s => items[s] && items[s].name === name));

		for (const slot of slots) {
			if (placed.has(slot)) continue;
			const from = items.findIndex((item, i) => item && item.name === name && !placed.has(i));
			if (from === -1) break;

			inventory_move(from, slot);
			const moved = items[from];
			items[from] = items[slot];
			items[slot] = moved;
			placed.add(slot);
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHEST LOOTING — opened in place of a farm step, with the gold loadout on for the duration
// --------------------------------------------------------------------------------------------------------------------------------- //

let _loot_last = 0;
let _looting = false;

function gold_gear_wanted() {
	return !!CONFIG.looting?.equip_gold_gear && _looting;
}

function looting_blocked() {
	if (!CONFIG.looting?.enabled) return "disabled";
	if (character.cc > COOLDOWNS.cc) return "cc";
	if ((character.s?.penalty_cd?.ms || 0) > 0) return "penalty_cd";
	if (kited_boss()) return "kiting";
	return null;
}

function should_loot() {
	if (looting_blocked() || _looting) return false;

	const now = performance.now();
	const stored_chest_count = get_num_chests();
	const draining = boss_field_draining();

	return (
		stored_chest_count >= (draining ? 1 : CONFIG.looting.chest_threshold) &&
		character.targets < CONFIG.looting.target_count &&
		now - _loot_last > CONFIG.looting.loot_cooldown
	);
}

async function shift_booster(slot, target) {
	if (slot === -1) return;
	try {
		await shift(slot, target);
	} catch (e) {
		catcher(e, "shift_booster");
	}
}

async function handle_looting() {
	const blocked = looting_blocked();
	if (blocked) {
		errlog_count("looting blocked " + blocked);
		return;
	}
	if (_looting) return;

	_loot_last = performance.now();
	_looting = true;
	let booster_slot = -1;

	try {
		if (CONFIG.looting.equip_gold_gear) {
			booster_slot = locate_item("luckbooster");
			await shift_booster(booster_slot, "goldbooster");
		}

		let looted = 0;
		const max_loots = CONFIG.looting.chest_threshold * 5;

		const stored_chests = get_chests();
		for (const chest_id in stored_chests) {
			if (looted >= max_loots) break;
			parent.open_chest(chest_id);
			looted++;
		}

		if (CONFIG.looting.equip_gold_gear) {
			await shift_booster(booster_slot !== -1 ? booster_slot : locate_item("goldbooster"), "luckbooster");
		}
	} catch (e) {
		catcher(e, "handle_looting");
	} finally {
		_looting = false;
	}
}

const SAVED_BANK_KEY = "savedBank";

function refresh_bank_snapshot() {
	if (!character.bank || !Object.keys(character.bank).length) return false;
	return storage_write(SAVED_BANK_KEY, character.bank);
}

function load_bank_from_local_storage() {
	return storage_read(SAVED_BANK_KEY);
}

async function wait_for_bank(map) {
	for (let waited = 0; waited < 3000 && !(character.bank && character.map === map); waited += 50) {
		await delay(50);
	}
}

async function go_to_bank_floor(map) {
	const BANK_LOC1 = { map: "bank", x: 0, y: -37 };
	const BANK_LOC2 = { map: "bank_b", x: -265, y: -344 };
	if (character.map === map) return;
	if (map === "bank") {
		game_log("Moving to Bank");
		await smarter_move(BANK_LOC1);
	} else if (map === "bank_b") {
		game_log("Moving to Bank Basement");
		await smarter_move(BANK_LOC1);
		await smarter_move(BANK_LOC2);
	}
	await wait_for_bank(map);
}

async function withdraw_item(item_name, level = null, total = null) {
	let bank_data = character.bank;
	if (!bank_data || Object.keys(bank_data).length === 0) {
		bank_data = load_bank_from_local_storage();
		if (!bank_data) {
			game_log("⚠️ No bank data available. Open your bank or save it first.");
			return;
		}
	}

	let wanted = total != null ? total : Infinity;
	const floors = {};
	for (const pack_key of Object.keys(bank_data)) {
		if (!pack_key.startsWith("items") || !Array.isArray(bank_data[pack_key])) continue;
		bank_data[pack_key].forEach((itm, slot) => {
			if (wanted <= 0 || !itm || itm.name !== item_name || (level != null && (itm.level || 0) !== level)) return;
			const floor = parent.bank_packs[pack_key][0];
			if (!floors[floor]) floors[floor] = [];
			floors[floor].push({ pack_key, slot, q: itm.q || 1 });
			wanted -= itm.q || 1;
		});
	}

	if (!Object.keys(floors).length) {
		game_log(`⚠️ No "${item_name}"${level != null ? ` level ${level}` : ""} found in bank.`);
		return;
	}

	let got = 0;
	for (const floor of Object.keys(floors)) {
		await go_to_bank_floor(floor);
		const picks = floors[floor];
		const results = await Promise.allSettled(picks.map(pick => bank_retrieve(pick.pack_key, pick.slot, -1)));
		results.forEach((result, k) => {
			if (result.status === "fulfilled") {
				got += picks[k].q;
				return;
			}
			const e = result.reason;
			game_log(`⚠️ withdraw_item: ${item_name} not in ${picks[k].pack_key} slot ${picks[k].slot} `
				+ `(${(e && (e.reason || e.message)) || e})`, "#FFA500");
		});
		refresh_bank_snapshot();
	}

	if (total != null && got < total) {
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
	"pinkie", "oozingterror", "harbringer", "quiver", "fieldgen0", "confetti", "cake", "partyhat", "poker", "ftrinket",
	"intamulet", "dexamulet", "stramulet", "strbelt", "dexbelt", "intbelt",
];

function remote_sell_items() {
	if (swap_in_flight()) return;
	for (const { i, item } of loose_loot(0)) {
		if (item.p === undefined && SELLABLE_ITEMS.includes(item.name)) sell(i, item.q || 1);
	}
}
