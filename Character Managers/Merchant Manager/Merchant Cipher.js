// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT CIPHER — the Witch's Cipher: Riff brews, late in each round, the recipe that still fits every clue on the realm's board and
// whose clue would split the recipes left most evenly (the most it can tell), from the ingredients in his bag; in the UTC day's last
// round, once none of those can be made, the new mix that would tell the most, so no mix of the day goes unbrewed
// --------------------------------------------------------------------------------------------------------------------------------- //

var CIPHER_WITCH = { map: "halloween", x: 858, y: -120 };
var CIPHER_REACH = 40;
var CIPHER_RECIPES = 1024;
var CIPHER_EARLY_POSSIBLE = 3;
var CIPHER_RETRY_MS = 5 * 60 * 1000;
var CIPHER_BOARD_WAIT_MS = 5000;
var CIPHER_DAY_MS = 24 * 60 * 60 * 1000;

var _cipher_retry_at = 0;

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

function cipher_affordable(mix, have) {
	return cipher_ingredients().every(name => mix.filter(m => m === name).length <= have[name]);
}

function cipher_spare(mix, have) {
	return Math.min(...cipher_ingredients().map(name => have[name] - mix.filter(m => m === name).length));
}

function cipher_right(a, b) {
	let right = 0;
	for (let slot = 0; slot < a.length; slot++) if (a[slot] === b[slot]) right++;
	return right;
}

function cipher_option(mix, fitting, have) {
	const clues = [0, 0, 0, 0, 0, 0];
	for (const secret of fitting) clues[cipher_right(mix, secret)]++;
	let information = 0;
	let expected = 0;
	clues.forEach((count, right) => {
		if (!count) return;
		const p = count / fitting.length;
		information -= p * Math.log2(p);
		expected += p * right;
	});
	return { mix, information, expected, spare: cipher_spare(mix, have) };
}

function cipher_better(a, b) {
	if (Math.abs(a.information - b.information) > 1e-9) return a.information > b.information;
	if (Math.abs(a.expected - b.expected) > 1e-9) return a.expected > b.expected;
	return a.spare > b.spare;
}

function cipher_best(mixes, fitting, have) {
	let best = null;
	for (const mix of mixes) {
		if (!cipher_affordable(mix, have)) continue;
		const option = cipher_option(mix, fitting, have);
		if (!best || cipher_better(option, best)) best = option;
	}
	return best;
}

function cipher_recipes(cipher) {
	const fitting = [];
	const ruled_out = [];
	const tried = new Set(cipher.board.map(entry => entry.mix.join()));
	for (let n = 0; n < CIPHER_RECIPES; n++) {
		const mix = cipher_recipe(n);
		if (cipher_fits(cipher, n)) fitting.push(mix);
		else if (!tried.has(mix.join())) ruled_out.push(mix);
	}
	return { fitting, ruled_out };
}

function cipher_can_brew(cipher, have, ruled_out_ok) {
	const { fitting, ruled_out } = cipher_recipes(cipher);
	return fitting.some(mix => cipher_affordable(mix, have)) || (ruled_out_ok && ruled_out.some(mix => cipher_affordable(mix, have)));
}

function cipher_choice(cipher, have, ruled_out_ok) {
	const { fitting, ruled_out } = cipher_recipes(cipher);
	let best = cipher_best(fitting, fitting, have);
	let fits = true;
	if (!best && ruled_out_ok) {
		best = cipher_best(ruled_out, fitting, have);
		fits = false;
	}
	return best && { mix: best.mix, expected: best.expected, information: best.information, possible: fitting.length, fits };
}

function cipher_last_round_today() {
	const midnight = (Math.floor(Date.now() / CIPHER_DAY_MS) + 1) * CIPHER_DAY_MS;
	return !parent.S.schedule.events.some(e => e.event === "witchcipher" && e.status === "scheduled" && e.at < midnight);
}

function cipher_time_to_brew(cipher) {
	return cipher.phase === "brewing" || cipher.possible <= Math.max(CIPHER_EARLY_POSSIBLE, cipher_mixes_left());
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE TASK — one mix at a time, each chosen from the board as the last one left it
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_run_cipher() {
	if (!setting("merchant_cipher") || merchant_task !== "Idle" || Date.now() < _cipher_retry_at) return false;
	const cipher = cipher_round();
	return !!cipher && cipher_time_to_brew(cipher) && cipher_mixes_left() > 0
		&& cipher_can_brew(cipher, cipher_bag(), cipher.phase === "brewing" && cipher_last_round_today());
}

function should_run_cipher_meet() {
	return setting("merchant_cipher") && merchant_task === "Idle" && cipher_meet_pending();
}

function handle_cipher_meet_state() {
	return run_task("Cipher meet", async abandoned => {
		log_msg("info", "🧪 Waiting at home for the party's Cipher ingredients");
		if (simple_distance(character, HOME) > 10) await smarter_move(HOME);
		await wait_until(() => abandoned() || !cipher_meet_pending(), CIPHER_MEET_WAIT_MS * 2, 500);
	});
}

async function brew_one(choice) {
	const before = cipher_round();
	try {
		const reply = await brew(choice.mix);
		log_msg("event", `🧪 Brewed ${choice.mix.join(", ")}: ${reply.right} right${reply.cracked ? ", cracked it" : ""}, `
			+ `+${reply.parcels} Witch's Parcels, ${reply.mixes_left} mixes left`
			+ (choice.fits ? ` (1 of ${choice.possible} recipes)` : ` (ruled out by the board, ${choice.possible} recipes fit)`));
		errlog_sample("witch_cipher", { mix: choice.mix, right: reply.right, cracked: !!reply.cracked, parcels: reply.parcels,
			fits: choice.fits, server_fits: reply.fits, possible: choice.possible, expected: choice.expected,
			information: choice.information, phase: before.phase });
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
			const choice = cipher && cipher_choice(cipher, cipher_bag(), cipher.phase === "brewing" && cipher_last_round_today());
			if (!choice || !await brew_one(choice)) return;
		}
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// INGREDIENTS — kept in the bag (CONFIG.do_not_bank); handed over by the fighters at home after the gathering (Cipher Gathering.js),
// and bought from stands in view while idle at home, one listing at a time
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
