// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT INVENTORY — counting slots, vendoring junk, and emptying the pack into the bank
// --------------------------------------------------------------------------------------------------------------------------------- //

function bank_free_space() {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return 0;

	let free = 0;
	for (const pack in bank_data) {
		if (!Array.isArray(bank_data[pack])) continue;
		free += bank_data[pack].filter(it => !it).length;
	}
	return free;
}

function has_enough_bank_space() {
	return bank_free_space() >= CONFIG.min_bank_free_space;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// VENDORING — SELLABLE_ITEMS, minus anything the merchant wears
// --------------------------------------------------------------------------------------------------------------------------------- //

function keep_nothing() {
	return false;
}

function sellable(item, keep) {
	return item && vendorable(item) && item.name !== upgrade_target().name && !is_default_gear(item) && !keep(item);
}

function has_sellable_items(keep = keep_nothing) {
	return character.items.some(item => sellable(item, keep));
}

function sell_sellable_items(keep = keep_nothing) {
	let sold_any = false;
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!sellable(item, keep)) continue;
		try {
			sell(i, item.q || 1).catch(e => catcher(e, "sell: " + item.name));
			log_msg("info", `💰 Sold ${item.name} x${item.q || 1}`);
			sold_any = true;
		} catch (e) {
			catcher(e, "sell: " + item.name);
		}
	}
	return sold_any;
}

var IDLE_SELL_SETTLE_MS = 1500;
var _idle_sell_at = 0;

function sell_while_idle() {
	if (Date.now() - _idle_sell_at < IDLE_SELL_SETTLE_MS) return;
	if (!has_sellable_items()) return;
	_idle_sell_at = Date.now();
	sell_sellable_items();
}

function bankable(item, keep) {
	return item && !CONFIG.do_not_bank.includes(item.name) && !keep(item);
}

function has_bankable_items(keep = keep_nothing) {
	return character.items.some(item => bankable(item, keep));
}

async function wait_for_movement_to_settle(caller_label) {
	if (!await wait_until(() => !character.moving, 5000, 250)) {
		log_msg("warn", `${caller_label}: still moving after waiting, proceeding anyway.`);
	}
}

var sell_items_running = false;

async function sell_items(keep = keep_nothing) {
	if (!has_sellable_items(keep)) return false;
	if (sell_items_running) {
		log_msg("warn", "sell_items already running, skipping duplicate call.");
		return false;
	}

	await wait_for_movement_to_settle("sell_items");

	sell_items_running = true;
	let sold_any = false;
	try {
		await smarter_move(HOME);
		await sleep(3000);

		sold_any = sell_sellable_items(keep);
	} catch (e) {
		catcher(e, "sell_items");
	} finally {
		sell_items_running = false;
	}
	return sold_any;
}

function plan_bank_stores(keep) {
	const packs = Object.keys(character.bank)
		.filter(pack => pack.startsWith("items") && Array.isArray(character.bank[pack]) && parent.bank_packs[pack][0] === character.map);
	const free = {};
	for (const pack of packs) free[pack] = character.bank[pack].filter(it => !it).length;

	const stores = [];
	character.items.forEach((item, slot) => {
		if (!bankable(item, keep)) return;
		const stack = packs.find(pack => character.bank[pack].some(it => parent.can_stack(it, item, null, { ignore_pvp: true })));
		const pack = stack || packs.find(p => free[p] > 0);
		if (!pack) {
			log_msg("warn", `No bank space on this floor for ${item.name}.`);
			return;
		}
		if (!stack) free[pack]--;
		stores.push({ slot, pack, item });
	});
	return stores;
}

var bank_items_running = false;

async function bank_items(keep = keep_nothing) {
	if (!has_bankable_items(keep)) return false;
	if (bank_items_running) {
		log_msg("warn", "bank_items already running, skipping duplicate call.");
		return false;
	}

	await wait_for_movement_to_settle("bank_items");

	bank_items_running = true;
	let banked_any = false;
	try {
		await smarter_move(BANK_LOCATION);
		await wait_for_bank(BANK_LOCATION.map);

		const stores = plan_bank_stores(keep);
		const results = await Promise.allSettled(stores.map(store => bank_store(store.slot, store.pack)));
		results.forEach((result, k) => {
			const item = stores[k].item;
			if (result.status === "rejected") {
				catcher(result.reason, "bank_items: bank_store " + item.name);
				return;
			}
			log_msg("info", `🏦 Deposited ${item.name} x${item.q || 1} to bank`);
			banked_any = true;
		});

		if (banked_any) refresh_bank_snapshot();
	} catch (e) {
		catcher(e, "bank_items");
	} finally {
		bank_items_running = false;
	}
	return banked_any;
}

var BANKING_RETRY_MS = 60000;
var _bank_retry_at = 0;

function should_run_banking() {
	return merchant_task === "Idle"
		&& Date.now() >= _bank_retry_at
		&& character.esize <= CONFIG.min_free_inventory_slots
		&& has_bankable_items();
}

async function handle_banking_state() {
	if (merchant_task !== "Idle") return;
	const generation = begin_task("Banking");
	try {
		log_msg("debug", `🎒 Down to ${character.esize} free slots — emptying the pack.`);
		await sell_items();
		const banked = await bank_items();
		if (!banked) _bank_retry_at = Date.now() + BANKING_RETRY_MS;
	} catch (e) {
		catcher(e, "handle_banking_state");
	} finally {
		end_task(generation);
	}
}
