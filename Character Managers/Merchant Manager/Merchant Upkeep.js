// --------------------------------------------------------------------------------------------------------------------------------- //
// OPPORTUNISTIC SIDE-DECISIONS — potions, loot collection and buffing, on their own loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_buy_potions() {
	const shop = CONFIG.locations.POTION_SHOP;
	return simple_distance(character, shop) < 300;
}

async function handle_buy_potions() {
	const MAX_POTS = 1000;
	const MIN_BUY = 100;
	try {
		for (const pot of ["mpot1", "hpot1"]) {
			const total = quantity(pot);
			const to_buy = MAX_POTS - total;
			if (to_buy > MIN_BUY) {
				log_msg("info", `🧪 Buying ${to_buy} x ${pot} (you have ${total})`);
				buy(pot, to_buy);
			}
		}
	} catch (e) {
		catcher(e, "handle_buy_potions");
	}
}

var LOOT_COLLECTION_COOLDOWN = 60000;
var last_loot_time = 0;

function should_collect_loot() {
	if (character.esize <= CONFIG.min_free_inventory_slots) return false;
	return Date.now() - last_loot_time >= LOOT_COLLECTION_COOLDOWN && any_party_within_range();
}

async function handle_collect_loot() {
	try {
		for (const name of PARTY) {
			const player = get_player(name);
			if (
				!player || player.rip ||
				Math.hypot(character.x - player.x, character.y - player.y) > CONFIG.party.action_range
			) {
				continue;
			}
			send_cm(name, { type: "send_loot" });
			await sleep(200);
		}
		log_msg("info", "Requested loot from nearby party members.");
		last_loot_time = Date.now();
	} catch (e) {
		catcher(e, "handle_collect_loot");
	}
}

function should_buff_players() {
	return players_wanting_mluck().length > 0;
}

async function handle_buff_players() {
	try {
		await buff_nearby_players();
	} catch (e) {
		catcher(e, "handle_buff_players");
	}
}

async function decide_opportunistic_actions() {
	if (should_buy_potions()) await handle_buy_potions();
	if (should_collect_loot()) await handle_collect_loot();
	if (should_buff_players()) await handle_buff_players();
}

function opportunistic_actions_loop() {
	every("opportunistic_actions_loop", { ms: 1000, kind: "automation" }, async () => {
		await decide_opportunistic_actions();
	});
}
