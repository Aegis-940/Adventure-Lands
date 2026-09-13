// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT EXCHANGE — the bank fetch is a task, the exchanging itself happens while idle
// --------------------------------------------------------------------------------------------------------------------------------- //

let exchange_items_running = false;

function has_bank_exchangeables() {
	const bank_data = character.bank || load_bank_from_local_storage();
	if (!bank_data) return false;

	for (const target of CONFIG.exchange.targets) {
		let count = 0;
		for (const pack in bank_data) {
			if (!Array.isArray(bank_data[pack])) continue;
			for (const item of bank_data[pack]) {
				if (item && item.name === target.name) count += item.q || 1;
			}
		}
		if (count >= target.min) return true;
	}

	return false;
}

function find_bag_exchangeable() {
	for (const config of CONFIG.exchange.targets) {
		const min_count = config.min ?? 1;
		for (let i = 0; i < character.items.length; i++) {
			const itm = character.items[i];
			if (itm && itm.name === config.name && (itm.q || 1) >= min_count) {
				return { slot: i, name: config.name };
			}
		}
	}
	return null;
}

const EXCHANGE_SKILLS = ["massexchangepp", "massexchange"];

async function begin_mass_exchange() {
	for (const name of EXCHANGE_SKILLS) {
		if (character.s?.[name]) return;
		if (!can_use(name)) continue;
		if (character.mp < (G.skills[name]?.mp ?? Infinity)) continue;
		try {
			await use_skill(name);
			return;
		} catch (e) {
			catcher(e, "begin_mass_exchange: " + name);
		}
	}
}

async function exchange_bag_items() {
	if (exchange_items_running) return;
	exchange_items_running = true;

	try {
		while (free_inventory_slots() > CONFIG.min_free_inventory_slots) {
			const found = find_bag_exchangeable();
			if (!found) break;

			log(`🔁 Exchanging ${found.name} (slot ${found.slot})`);
			if (!character.q.exchange) await begin_mass_exchange();
			await exchange(found.slot);
		}
	} catch (e) {
		catcher(e, "exchange_bag_items");
	} finally {
		exchange_items_running = false;
	}
}

async function withdraw_exchangeables() {
	log("🏦 Fetching exchangeables from the bank...", "#888");
	await close_merchant_stand();
	await smarter_move(BANK_LOCATION);
	await delay(500);
	refresh_bank_snapshot();

	for (const target of CONFIG.exchange.targets) {
		try {
			await withdraw_item(target.name, null, 9999);
		} catch (e) {
			catcher(e, "withdraw_exchangeables: " + target.name);
		}
		if (find_bag_exchangeable()) return true;
	}

	log("🏦 Nothing exchangeable came out of the bank.", "#FFA500");
	return false;
}

function should_run_exchange() {
	return CONFIG.enabled.exchanging
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& !find_bag_exchangeable()
		&& has_bank_exchangeables();
}

async function handle_exchanging_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Exchanging";
	try {
		await withdraw_exchangeables();
	} catch (e) {
		catcher(e, "handle_exchanging_state");
	} finally {
		merchant_task = "Idle";
	}
}
