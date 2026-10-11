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
	return item && SELLABLE_ITEMS.includes(item.name) && item.name !== CONFIG.upgrade_target.name && !is_default_gear(item) && !keep(item);
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
			const sale = sell(i, item.q || 1);
			if (sale && typeof sale.catch === "function") sale.catch(e => catcher(e, "sell: " + item.name));
			game_log(`💰 Sold ${item.name} x${item.q || 1}`);
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
	let move_wait = 0;
	while (character.moving && move_wait < 20) {
		await delay(250);
		move_wait++;
	}
	if (character.moving) {
		game_log(`⚠️ ${caller_label}: still moving after waiting, proceeding anyway.`);
	}
}

var sell_items_running = false;

async function sell_items(keep = keep_nothing) {
	if (!has_sellable_items(keep)) return false;
	if (sell_items_running) {
		game_log("⚠️ sell_items already running, skipping duplicate call.");
		return false;
	}

	await wait_for_movement_to_settle("sell_items");

	sell_items_running = true;
	let sold_any = false;
	try {
		await smarter_move(HOME);
		await delay(3000);

		sold_any = sell_sellable_items(keep);
	} catch (e) {
		catcher(e, "sell_items");
	} finally {
		sell_items_running = false;
	}
	return sold_any;
}

var bank_items_running = false;

async function bank_items(keep = keep_nothing) {
	if (!has_bankable_items(keep)) return false;
	if (bank_items_running) {
		game_log("⚠️ bank_items already running, skipping duplicate call.");
		return false;
	}

	await wait_for_movement_to_settle("bank_items");

	bank_items_running = true;
	let banked_any = false;
	try {
		await smarter_move(BANK_LOCATION);
		await delay(1000);

		for (let i = 0; i < character.items.length; i++) {
			const item = character.items[i];
			if (!bankable(item, keep)) continue;
			try {
				await bank_store(i);
				refresh_bank_snapshot();
				game_log(`🏦 Deposited ${item.name} x${item.q || 1} to bank`);
				banked_any = true;
			} catch (e) {
				catcher(e, "bank_items: bank_store " + item.name);
			}
		}

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
		&& free_inventory_slots() <= CONFIG.min_free_inventory_slots
		&& has_bankable_items();
}

async function handle_banking_state() {
	if (merchant_task !== "Idle") return;
	const generation = begin_task("Banking");
	try {
		game_log(`🎒 Down to ${free_inventory_slots()} free slots — emptying the pack.`, "#888");
		await sell_items();
		const banked = await bank_items();
		if (!banked) _bank_retry_at = Date.now() + BANKING_RETRY_MS;
	} catch (e) {
		catcher(e, "handle_banking_state");
	} finally {
		end_task(generation);
	}
}
