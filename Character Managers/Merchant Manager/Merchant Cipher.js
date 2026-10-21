// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT CIPHER — the Witch's Cipher: Riff brews, late in each round, the recipe that still fits every clue on the realm's board
// and has the most slots likely right, from the ingredients in his bag
// --------------------------------------------------------------------------------------------------------------------------------- //

var CIPHER_WITCH = { map: "halloween", x: 858, y: -120 };
var CIPHER_REACH = 40;
var CIPHER_RECIPES = 1024;
var CIPHER_EARLY_POSSIBLE = 3;
var CIPHER_RETRY_MS = 5 * 60 * 1000;
var CIPHER_BOARD_WAIT_MS = 5000;

var _cipher_retry_at = 0;

function cipher_ingredients() {
	return G.events.witchcipher.ingredients.map(entry => entry[0]);
}

function cipher_round() {
	const cipher = parent.S.witchcipher;
	return cipher && cipher.live ? cipher : null;
}

function cipher_mixes_left() {
	return character.witchcipher ? character.witchcipher.mixes_left : 0;
}

function cipher_recipe(n) {
	const names = cipher_ingredients();
	return [0, 1, 2, 3, 4].map(slot => names[Math.floor(n / Math.pow(4, slot)) % 4]);
}

function cipher_fits(cipher, n) {
	return (parseInt(cipher.fit[n >> 2], 16) >> (n & 3)) & 1;
}

function cipher_stock() {
	const have = {};
	for (const name of cipher_ingredients()) have[name] = quantity(name);
	return have;
}

function cipher_affordable(mix, have) {
	return cipher_ingredients().every(name => mix.filter(m => m === name).length <= have[name]);
}

function cipher_choice(cipher, have) {
	const candidates = [];
	for (let n = 0; n < CIPHER_RECIPES; n++) {
		if (cipher_fits(cipher, n)) candidates.push(cipher_recipe(n));
	}

	const share = [0, 1, 2, 3, 4].map(() => ({}));
	for (const mix of candidates) {
		mix.forEach((name, slot) => { share[slot][name] = (share[slot][name] || 0) + 1; });
	}

	let best = null;
	let best_score = -1;
	for (const mix of candidates) {
		if (!cipher_affordable(mix, have)) continue;
		const score = mix.reduce((sum, name, slot) => sum + share[slot][name], 0);
		if (score > best_score) {
			best = mix;
			best_score = score;
		}
	}
	return best && { mix: best, expected: best_score / candidates.length, possible: candidates.length };
}

function cipher_time_to_brew(cipher) {
	return cipher.phase === "brewing" || cipher.possible <= CIPHER_EARLY_POSSIBLE;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE TASK — one mix at a time, each chosen from the board as the last one left it
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_run_cipher() {
	if (!setting("merchant_cipher") || merchant_task !== "Idle" || Date.now() < _cipher_retry_at) return false;
	const cipher = cipher_round();
	return !!cipher && cipher_time_to_brew(cipher) && cipher_mixes_left() > 0 && !!cipher_choice(cipher, cipher_stock());
}

async function brew_one(choice) {
	const before = cipher_round();
	try {
		const reply = await brew(choice.mix);
		log_msg("event", `🧪 Brewed ${choice.mix.join(", ")}: ${reply.right} right${reply.cracked ? ", cracked it" : ""}, `
			+ `+${reply.parcels} Witch's Parcels, ${reply.mixes_left} mixes left (1 of ${choice.possible} recipes)`);
		errlog_sample("witch_cipher", { mix: choice.mix, right: reply.right, cracked: !!reply.cracked, parcels: reply.parcels,
			possible: choice.possible, expected: choice.expected, phase: before.phase });
	} catch (e) {
		log_msg("warn", `🧪 The Witch refused the mix: ${e.reason}${e.item ? " (" + e.item + ")" : ""}`);
		return false;
	}
	return await wait_until(() => {
		const now = cipher_round();
		return !now || now.mixes !== before.mixes || now.cracks !== before.cracks;
	}, CIPHER_BOARD_WAIT_MS, 250);
}

function handle_cipher_state() {
	return run_task("Witch's Cipher", async abandoned => {
		_cipher_retry_at = Date.now() + CIPHER_RETRY_MS;
		await smarter_move(CIPHER_WITCH, null, { radius: CIPHER_REACH });
		while (!abandoned() && cipher_mixes_left() > 0) {
			const cipher = cipher_round();
			const choice = cipher && cipher_choice(cipher, cipher_stock());
			if (!choice || !await brew_one(choice)) return;
		}
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// INGREDIENTS — kept in the bag (CONFIG.do_not_bank); bought from stands in view while idle at home, one listing at a time
// --------------------------------------------------------------------------------------------------------------------------------- //

var CIPHER_BUY_MAX_PRICE = 25000;
var CIPHER_BUY_STOCK = 50;
var CIPHER_BUY_EVERY_MS = 15000;
var _cipher_buy_at = 0;

function buy_cipher_ingredients() {
	if (!setting("merchant_cipher") || Date.now() - _cipher_buy_at < CIPHER_BUY_EVERY_MS) return;
	_cipher_buy_at = Date.now();

	const names = cipher_ingredients();
	for (const id in parent.entities) {
		const seller = parent.entities[id];
		if (seller.type !== "character" || !seller.stand) continue;
		for (const slot in seller.slots) {
			const item = seller.slots[slot];
			if (!slot.startsWith("trade") || !item || item.b || !names.includes(item.name) || item.price > CIPHER_BUY_MAX_PRICE) continue;
			const q = Math.min(CIPHER_BUY_STOCK - quantity(item.name), item.q || 1, Math.floor(character.gold / item.price));
			if (q <= 0) continue;
			log_msg("info", `🧪 Buying ${q} ${item.name} from ${seller.name} at ${item.price} each`);
			trade_buy(seller, slot, q).catch(e => catcher(e, "buy_cipher_ingredients"));
			return;
		}
	}
}
