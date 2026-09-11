// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT STAND — open while idle, closed whenever we need to move.
// --------------------------------------------------------------------------------------------------------------------------------- //

const SLICE_FLAVOURS = ["slice_strawberry", "slice_citrus", "slice_honey",
	"slice_mint", "slice_blueberry", "slice_nightberry"];
const TRADE_SLOTS = 16;
const WISHLIST_REFRESH_MS = 15000;

let _last_wishlist_refresh = 0;

function stand_is_open() {
	return !!character.stand;
}

async function open_merchant_stand() {
	if (stand_is_open()) return;
	try {
		await open_stand();
	} catch (e) {
		catcher(e, "open_merchant_stand");
	}
}

async function close_merchant_stand() {
	if (!stand_is_open()) return;
	try {
		await close_stand();
	} catch (e) {
		catcher(e, "close_merchant_stand");
	}
}

function slice_count(name) {
	let q = 0;
	for (const item of character.items) {
		if (item && item.name === name) q += item.q || 1;
	}
	return q;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STAND STOCK — items listed for sale from CONFIG.sell_profile
// --------------------------------------------------------------------------------------------------------------------------------- //

function level_matches(item, entry) {
	return entry.level === undefined || (item.level || 0) === entry.level;
}

function is_stand_stock(item) {
	if (!CONFIG.trading.enabled || !item) return false;
	return CONFIG.sell_profile.some(entry => entry.name === item.name && level_matches(item, entry));
}

function stock_bag_reserve(entry) {
	return Math.max(0, (entry.quantity || 1) - stock_listed_count(entry));
}

function make_stand_stock_keeper() {
	if (!CONFIG.trading.enabled) return () => false;
	const budget = CONFIG.sell_profile.map(stock_bag_reserve);
	return item => {
		if (!item) return false;
		const ei = CONFIG.sell_profile.findIndex(e => e.name === item.name && level_matches(item, e));
		if (ei < 0 || budget[ei] <= 0) return false;
		budget[ei] -= (item.q || 1);
		return true;
	};
}

function stock_inventory_index(entry) {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && item.name === entry.name && level_matches(item, entry)) return i;
	}
	return -1;
}

function stock_inventory_count(entry) {
	let q = 0;
	for (const item of character.items) {
		if (item && item.name === entry.name && level_matches(item, entry)) q += item.q || 1;
	}
	return q;
}

function stock_listed_count(entry) {
	let q = 0;
	for (let sn = 1; sn <= TRADE_SLOTS; sn++) {
		const slot = character.slots["trade" + sn];
		if (!slot || slot.b) continue;
		if (slot.name === entry.name && level_matches(slot, entry)) {
			q += (slot.q === undefined ? 1 : slot.q);
		}
	}
	return q;
}

function stock_held_count(entry) {
	return stock_inventory_count(entry) + stock_listed_count(entry);
}

function stock_bank_count(entry) {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return 0;
	let q = 0;
	for (const pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		for (const item of bank_data[pack]) {
			if (item && item.name === entry.name && level_matches(item, entry)) q += item.q || 1;
		}
	}
	return q;
}

function sell_slot_for(index) {
	return TRADE_SLOTS - index;
}

let _last_sell_refresh = 0;

async function refresh_sell_offers() {
	if (!CONFIG.trading.enabled || !stand_is_open()) return;
	if (Date.now() - _last_sell_refresh < WISHLIST_REFRESH_MS) return;
	_last_sell_refresh = Date.now();

	const buy_slots = missing_slice_flavours().length;

	const listed = CONFIG.sell_profile.map(() => 0);
	for (let sn = 1; sn <= TRADE_SLOTS; sn++) {
		const slot = character.slots["trade" + sn];
		if (!slot || slot.b) continue;
		const ei = CONFIG.sell_profile.findIndex(e =>
			e.name === slot.name && level_matches(slot, e) && slot.price === e.price);
		if (ei >= 0) listed[ei] += (slot.q === undefined ? 1 : slot.q);
	}

	const free = [];
	for (let i = 0; i < TRADE_SLOTS; i++) {
		const sn = sell_slot_for(i);
		if (sn <= buy_slots) break;
		if (!character.slots["trade" + sn]) free.push(sn);
	}

	for (let ei = 0; ei < CONFIG.sell_profile.length; ei++) {
		const entry = CONFIG.sell_profile[ei];
		const label = entry.name + (entry.level === undefined ? "" : " +" + entry.level);
		let short = (entry.quantity || 1) - listed[ei];

		while (short > 0 && free.length) {
			const num = stock_inventory_index(entry);
			if (num < 0) break;

			const take = Math.min(short, character.items[num].q || 1);
			const slot_no = free.shift();
			try {
				await trade(num, slot_no, entry.price, take);
				game_log(`🏷️ WTS ${label} x${take} @ ${entry.price}g (slot ${slot_no})`, "#F0B742");
			} catch (e) {
				catcher(e, "refresh_sell_offers: " + label);
				break;
			}
			short -= take;
		}
	}
}

function missing_slice_flavours() {
	return SLICE_FLAVOURS.filter(name =>
		name !== CONFIG.trading.own_flavour && slice_count(name) < CONFIG.trading.target_each);
}

async function refresh_slice_buy_orders() {
	if (!CONFIG.trading.enabled || !stand_is_open()) return;
	if (Date.now() - _last_wishlist_refresh < WISHLIST_REFRESH_MS) return;
	_last_wishlist_refresh = Date.now();

	const want = missing_slice_flavours();
	for (let i = 0; i < want.length && i < TRADE_SLOTS; i++) {
		const slot = character.slots["trade" + (i + 1)];
		if (slot && slot.b && slot.name === want[i] && (slot.q || 0) > 0) continue;
		try {
			await wishlist(i + 1, want[i], CONFIG.trading.price, 0, CONFIG.trading.quantity);
			game_log(`🎂 WTB ${want[i]} x${CONFIG.trading.quantity} @ ${CONFIG.trading.price}g`, "#F0B742");
		} catch (e) {
			catcher(e, "refresh_slice_buy_orders");
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RESTOCKING — pulling listed stock back out of the bank
// --------------------------------------------------------------------------------------------------------------------------------- //

const RESTOCK_RETRY_MS = 10 * 60 * 1000;
const _restock_blocked = {};

function restock_key(entry) {
	return entry.name + "@" + (entry.level === undefined ? "any" : entry.level);
}

function restock_blocked(entry) {
	return Date.now() < (_restock_blocked[restock_key(entry)] || 0);
}

function should_run_restock() {
	if (!CONFIG.trading.enabled) return false;
	if (merchant_task !== "Idle") return false;
	if (free_inventory_slots() <= CONFIG.min_free_inventory_slots) return false;
	for (const entry of CONFIG.sell_profile) {
		if (restock_blocked(entry)) continue;
		if (stock_held_count(entry) >= (entry.quantity || 1)) continue;
		if (stock_bank_count(entry) > 0) return true;
	}
	return false;
}

async function handle_restocking_state() {
	merchant_task = "Restocking";
	try {
		for (const entry of CONFIG.sell_profile) {
			const want = entry.quantity || 1;
			const held = stock_held_count(entry);
			if (held >= want) continue;
			if (restock_blocked(entry)) continue;
			const in_bag = stock_inventory_count(entry);

			const in_bank = stock_bank_count(entry);
			if (in_bank <= 0) continue;

			try {
				await withdraw_item(entry.name, entry.level === undefined ? null : entry.level,
					Math.min(want - held, in_bank));
			} catch (e) {
				catcher(e, "handle_restocking_state: " + restock_key(entry));
			}

			if (stock_inventory_count(entry) <= in_bag) {
				_restock_blocked[restock_key(entry)] = Date.now() + RESTOCK_RETRY_MS;
				game_log(`⚠️ Restock: ${restock_key(entry)} is not in the bank as listed — `
					+ `pausing that entry for ${RESTOCK_RETRY_MS / 60000} min`, "#FFA500");
			}
		}
	} catch (e) {
		catcher(e, "handle_restocking_state");
	} finally {
		merchant_task = "Idle";
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// IDLE — stand up at HOME, vending, selling junk and exchanging while he waits
// --------------------------------------------------------------------------------------------------------------------------------- //

async function handle_idle_state() {
	if (character.map === HOME.map && Math.hypot(character.x - HOME.x, character.y - HOME.y) <= 10) {
		await open_merchant_stand();
		await refresh_slice_buy_orders();
		await refresh_sell_offers();
		sell_while_idle();
		if (CONFIG.enabled.exchanging) await exchange_bag_items();
		return;
	}
	await close_merchant_stand();
	try {
		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_idle_state: smarter_move(HOME)");
	}
}
