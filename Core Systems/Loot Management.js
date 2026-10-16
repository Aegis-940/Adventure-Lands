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
	tracker: 0,
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

function same_item(a, b) {
	return !!a && !!b && a.name === b.name && (a.level || 0) === (b.level || 0);
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

function chest_gold(data) {
	return Math.round(data.gold / (parent.party[character.name]?.share || 1));
}

function gold_gear_wanted() {
	return CONFIG.looting.equip_gold_gear && _looting;
}

function looting_blocked() {
	if (!encounter_home_setting("looting", CONFIG.looting.enabled)) return "disabled";
	if (character.cc > COOLDOWNS.cc) return "cc";
	if (character.s.penalty_cd?.ms > 0) return "penalty_cd";
	return null;
}

function should_loot() {
	if (looting_blocked() || _looting) return false;

	const now = performance.now();
	const stored_chest_count = get_num_chests();
	const draining = boss_field_draining();

	return (
		stored_chest_count >= (draining ? 1 : encounter_home_setting("chest_threshold", CONFIG.looting.chest_threshold)) &&
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

const OPEN_CHEST_CALL_COST = 1.2;

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
		const max_loots = Math.min(CONFIG.looting.max_chests, Math.floor((COOLDOWNS.cc - character.cc) / OPEN_CHEST_CALL_COST));

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

function wait_for_bank(map) {
	return wait_until(() => character.bank && character.map === map, 3000, 50);
}

async function go_to_bank_floor(map) {
	const BANK_LOC1 = { map: "bank", x: 0, y: -37 };
	const BANK_LOC2 = { map: "bank_b", x: -265, y: -344 };
	if (character.map === map) return;
	if (map === "bank") {
		log_msg("info", "Moving to Bank");
		await smarter_move(BANK_LOC1);
	} else if (map === "bank_b") {
		log_msg("info", "Moving to Bank Basement");
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
			log_msg("warn", "No bank data available. Open your bank or save it first.");
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
		log_msg("warn", `No "${item_name}"${level != null ? ` level ${level}` : ""} found in bank.`);
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
			log_msg("warn", `withdraw_item: ${item_name} not in ${picks[k].pack_key} slot ${picks[k].slot} `
				+ `(${(e && (e.reason || e.message)) || e})`);
		});
		refresh_bank_snapshot();
	}

	if (total != null && got < total) {
		log_msg("warn", `Only retrieved ${got}/${total} of ${item_name}.`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HAND-OFF — vendor what is approved and ship the rest to Riff, from any bag index no swap in flight touches
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = [
	"hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap",
	"cclaw", "crabclaw", "slimestaff", "stinger", "pstem", "coat1", "helmet1",
	"gloves1", "pants1", "shoes1", "wbreeches", "vitring", "helmet", "shoes", "gloves",
	"pmace", "throwingstars", "t2bow", "spear", "dagger", "rapier", "sword", "mushroomstaff",
	"rfangs", "gphelmet", "phelmet", "vitscroll", "hhelmet", "harmor", "hpants",
	"hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring",
	"warmscarf", "snowball", "santasbelt", "pclaw", "broom", "skullamulet",
	"iceskates", "carrot", "xmace", "candycanesword", "pmaceofthedead", "ornamentstaff",
	"merry", "rednose", "xmashat", "xmasshoes", "xmassweater", "xmaspants", "mittens",
	"angelwings", "snowflakes", "epyjamas", "ecape", "eears", "eslippers", "carrotsword",
	"pinkie", "oozingterror", "quiver", "fieldgen0", "confetti", "cake", "partyhat", "poker", "ftrinket",
	"intamulet", "dexamulet", "stramulet", "strbelt", "dexbelt", "intbelt", "glolipop", "broom", "frankypants"
];

function vendorable(item) {
	return SELLABLE_ITEMS.includes(item.name) && (item.level || 0) < 1 && !phoenix_keeps(item.name);
}

const HANDOFF_MS = 100;
const HANDOFF_BURST = 4;
const HANDOFF_RETRY_MS = 2000;
const MERCHANT_FULL_MS = 5000;
const MERCHANT_SEND_RANGE = 400;
const MERCHANT_AUTO_SEND_RANGE = 250;
const SEND_WINDOW_MS = 15000;

let _handoff_sent = {};
let _gold_sent_until = 0;
let _merchant_full_until = 0;
let _send_range_until = 0;

function shippable_loot() {
	return loose_loot(LOOT_THRESHOLD).filter(({ item }) => !vendorable(item));
}

function merchant_in_reach(range) {
	const merchant = get_player("Riff");
	if (!merchant || merchant.rip || merchant.map !== character.map) return null;
	return distance(character, merchant) <= range ? merchant : null;
}

function handoff_waiting(i, item) {
	const sent = _handoff_sent[i];
	if (sent && Date.now() < sent.until && same_item(sent, item)) return true;
	delete _handoff_sent[i];
	return false;
}

function handoff_failed(e) {
	const reason = (e && (e.reason || e.response)) || "unknown";
	if (reason === "send_no_space") _merchant_full_until = Date.now() + MERCHANT_FULL_MS;
	errlog_count(`hand-off failed: ${reason}`);
}

function hand_off(i, item, send) {
	_handoff_sent[i] = { name: item.name, level: item.level, until: Date.now() + HANDOFF_RETRY_MS };
	send().catch(handoff_failed);
}

function handoff_tick() {
	const now = Date.now();
	const merchant = merchant_in_reach(now < _send_range_until ? MERCHANT_SEND_RANGE : MERCHANT_AUTO_SEND_RANGE);
	const can_ship = !!merchant && now >= _merchant_full_until;

	if (merchant && character.gold > LOOT_GOLD_RESERVE && now >= _gold_sent_until && character.cc < COOLDOWNS.cc) {
		_gold_sent_until = now + HANDOFF_RETRY_MS;
		send_gold("Riff", character.gold - LOOT_GOLD_RESERVE).catch(handoff_failed);
	}

	const view = equip_view().items;
	let burst = HANDOFF_BURST;
	for (const { i, item } of loose_loot(0)) {
		if (!burst || character.cc >= COOLDOWNS.cc) return;
		if (!same_item(view[i], item) || handoff_waiting(i, item)) continue;
		if (vendorable(item)) hand_off(i, item, () => sell(i, item.q || 1));
		else if (can_ship && i >= LOOT_THRESHOLD) hand_off(i, item, () => send_item("Riff", i, item.q || 1));
		else continue;
		burst--;
	}
}

function handoff_loop() {
	every("handoff_loop", { ms: HANDOFF_MS, kind: "automation" }, handoff_tick);
}

async function send_to_merchant() {
	const merchant = get_player("Riff");
	if (!merchant || merchant.rip) return log_msg("error", "Merchant not found or dead");
	if (!merchant_in_reach(MERCHANT_SEND_RANGE)) return log_msg("error", "Merchant not nearby");

	_send_range_until = Date.now() + SEND_WINDOW_MS;
	await wait_until(() => !shippable_loot().length, SEND_WINDOW_MS, HANDOFF_MS);
}
