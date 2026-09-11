// --------------------------------------------------------------------------------------------------------------------------------- //
// OPPORTUNISTIC SIDE-DECISIONS — potions, loot collection and buffing, on their own loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_buy_potions() {
	const shop = CONFIG.locations.POTION_SHOP;
	return character.map === shop.map && Math.hypot(character.x - shop.x, character.y - shop.y) < 300;
}

async function handle_buy_potions() {
	const MAX_POTS = 1000;
	const MIN_BUY = 100;
	try {
		for (const pot of ["mpot1", "hpot1"]) {
			let total = 0;
			for (const item of character.items) {
				if (item && item.name === pot) total += item.q || 1;
			}
			const to_buy = MAX_POTS - total;
			if (to_buy > MIN_BUY) {
				log(`🧪 Buying ${to_buy} x ${pot} (you have ${total})`);
				buy(pot, to_buy);
			}
		}
	} catch (e) {
		catcher(e, "handle_buy_potions");
	}
}

const LOOT_COLLECTION_COOLDOWN = 60000;
let last_loot_time = 0;

function should_collect_loot() {
	if (free_inventory_slots() <= CONFIG.min_free_inventory_slots) return false;
	return Date.now() - last_loot_time >= LOOT_COLLECTION_COOLDOWN && any_party_within_range();
}

async function handle_collect_loot() {
	try {
		for (const name of PARTY) {
			const player = get_player(name);
			if (
				!player || player.rip || character.map !== player.map ||
				Math.hypot(character.x - player.x, character.y - player.y) > CONFIG.party.action_range
			) {
				continue;
			}
			send_cm(name, { type: "send_loot" });
			await delay(200);
		}
		log("Requested loot from nearby party members.", "limegreen");
		last_loot_time = Date.now();
	} catch (e) {
		catcher(e, "handle_collect_loot");
	}
}

function should_buff_party() {
	return any_party_within_range();
}

async function handle_buff_party() {
	try {
		await buff_nearby_party();
	} catch (e) {
		catcher(e, "handle_buff_party");
	}
}

async function decide_opportunistic_actions() {
	if (should_buy_potions()) await handle_buy_potions();
	if (should_collect_loot()) await handle_collect_loot();
	if (should_buff_party()) await handle_buff_party();
}

async function opportunistic_actions_loop() {
	while (true) {
		try {
			await decide_opportunistic_actions();
		} catch (e) {
			catcher(e, "opportunistic_actions_loop");
		}
		await delay(1000);
	}
}
