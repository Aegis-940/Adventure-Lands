// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT CIPHER — the Witch's Cipher, played as a sniper: Riff waits at the Witch while other players narrow the realm's board, and
// brews in one burst the moment his own picks would crack it with the mixes he has left; in the UTC day's last round he spends what is
// left just before the cauldron closes, so no mix of the day goes unbrewed. Each pick is the mix whose clue would tell the most
// --------------------------------------------------------------------------------------------------------------------------------- //

var CIPHER_WITCH = { map: "halloween", x: 858, y: -120 };
var CIPHER_REACH = 40;
var CIPHER_RECIPES = 1024;
var CIPHER_RETRY_MS = 5 * 60 * 1000;
var CIPHER_DAY_MS = 24 * 60 * 60 * 1000;
var CIPHER_WATCH_MS = 100;
var CIPHER_SNIPE_ODDS = 0.9;
var CIPHER_SNIPE_MAX = 128;
var CIPHER_DEADLINE_MS = 45 * 1000;
var CIPHER_LOG_MS = 5000;
var CIPHER_SYNC_MS = 5000;

var _cipher_retry_at = 0;
var _cipher_odds = { key: null, odds: 0 };
var _cipher_seen = { at: 0, cracks: null, possible: null, mixes: null };

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

function cipher_spend(have, mix) {
	const left = Object.assign({}, have);
	for (const name of mix) left[name]--;
	return left;
}

function cipher_narrow(fitting, mix, right) {
	return fitting.filter(secret => cipher_right(mix, secret) === right && secret.join() !== mix.join());
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE PICK — among the mixes he can make, the one whose 0–5 clue would split the recipes left most evenly, then the most slots likely
// right, then the one that leaves the most of his scarcest ingredient
// --------------------------------------------------------------------------------------------------------------------------------- //

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

function cipher_last_round_today() {
	const midnight = (Math.floor(Date.now() / CIPHER_DAY_MS) + 1) * CIPHER_DAY_MS;
	return !parent.S.schedule.events.some(e => e.event === "witchcipher" && e.status === "scheduled" && e.at < midnight);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE ODDS — his own picks played out against every recipe still possible: the share he would crack within the mixes he has left
// --------------------------------------------------------------------------------------------------------------------------------- //

function cipher_crack_odds(fitting, mixes, have) {
	let cracked = 0;
	for (const secret of fitting) {
		let left = fitting;
		let bag = have;
		for (let k = 0; k < mixes; k++) {
			const pick = cipher_best(left, left, bag);
			if (!pick) break;
			if (pick.mix.join() === secret.join()) {
				cracked++;
				break;
			}
			left = cipher_narrow(left, pick.mix, cipher_right(pick.mix, secret));
			bag = cipher_spend(bag, pick.mix);
		}
	}
	return cracked / fitting.length;
}

function cipher_snipe_odds(cipher) {
	if (cipher.possible > CIPHER_SNIPE_MAX) return 0;
	const have = cipher_bag();
	const key = [cipher.id, cipher.cracks, cipher.mixes, cipher_mixes_left(), JSON.stringify(have)].join("|");
	if (_cipher_odds.key !== key) {
		_cipher_odds = { key, odds: cipher_crack_odds(cipher_recipes(cipher).fitting, cipher_mixes_left(), have) };
	}
	return _cipher_odds.odds;
}

function cipher_deadline(cipher) {
	return cipher_last_round_today() && cipher.end - Date.now() <= CIPHER_DEADLINE_MS;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE BOARD LOG — how the realm plays: recipes left and mixes over the round, and every crack, who made it and from how many
// --------------------------------------------------------------------------------------------------------------------------------- //

function cipher_board_log(cipher) {
	const seen = _cipher_seen;
	if (seen.cracks !== null && cipher.cracks > seen.cracks) {
		const by = cipher.cracked ? cipher.cracked.by : "?";
		log_msg("event", `🧪 ${by} cracked the recipe from ${seen.possible} possible, after ${seen.mixes} mixes on that board`);
		errlog_sample("witch_crack", { round: cipher.id, by, from_possible: seen.possible, board_mixes: seen.mixes, phase: cipher.phase,
			left_s: Math.round((cipher.end - Date.now()) / 1000) });
	}
	if (Date.now() - seen.at >= CIPHER_LOG_MS || cipher.cracks !== seen.cracks) {
		errlog_timeline("cipher_board", `${cipher.id.slice(-15)} ${cipher.phase} ${cipher.possible} possible, ${cipher.mixes} mixes, `
			+ `${cipher.cracks} cracks, ${Math.round((cipher.end - Date.now()) / 1000)}s left, us ${cipher_mixes_left()}`);
		seen.at = Date.now();
	}
	seen.cracks = cipher.cracks;
	seen.possible = cipher.possible;
	seen.mixes = cipher.mixes;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE BURST — mix after mix with no wait for the board: each reply narrows his own copy of it; it stops when he cracks it, when
// someone else does, or when nothing he can make is left to brew, then waits for the board to show it before anything is decided again
// --------------------------------------------------------------------------------------------------------------------------------- //

function cipher_board_shows(start, brewed, cracked) {
	const now = cipher_round();
	if (!now) return true;
	if (cracked) return now.cracks !== start.cracks;
	return now.cracks !== start.cracks || now.mixes >= start.mixes + brewed;
}

async function cipher_burst(abandoned, reason, ruled_out_ok) {
	const start = cipher_round();
	const result = await cipher_burst_mixes(start, abandoned, reason, ruled_out_ok);
	await wait_until(() => cipher_board_shows(start, result.brewed, result.cracked), CIPHER_SYNC_MS, CIPHER_WATCH_MS);
}

async function cipher_burst_mixes(start, abandoned, reason, ruled_out_ok) {
	let { fitting, ruled_out } = cipher_recipes(start);
	let have = cipher_bag();
	let mixes = cipher_mixes_left();
	let brewed = 0;
	log_msg("event", `🧪 ${reason}: ${fitting.length} possible, ${mixes} mixes`);

	while (!abandoned() && mixes > 0) {
		const now = cipher_round();
		if (!now || now.cracks !== start.cracks) return { brewed, cracked: false };
		let pick = cipher_best(fitting, fitting, have);
		let fits = true;
		if (!pick && ruled_out_ok) {
			pick = cipher_best(ruled_out, fitting, have);
			fits = false;
		}
		if (!pick) return { brewed, cracked: false };

		let reply;
		try {
			reply = await brew(pick.mix);
		} catch (e) {
			log_msg("warn", `🧪 The Witch refused the mix: ${e.reason}${e.item ? " (" + e.item + ")" : ""}`);
			return { brewed, cracked: false };
		}
		brewed++;
		log_msg("event", `🧪 Brewed ${pick.mix.join(", ")}: ${reply.right} right${reply.cracked ? ", cracked it" : ""}, `
			+ `+${reply.parcels} Witch's Parcels, ${reply.mixes_left} mixes left`
			+ (fits ? ` (1 of ${fitting.length} recipes)` : ` (ruled out by the board, ${fitting.length} recipes fit)`));
		errlog_sample("witch_cipher", { mix: pick.mix, right: reply.right, cracked: !!reply.cracked, parcels: reply.parcels,
			fits, server_fits: reply.fits, possible: fitting.length, expected: pick.expected, information: pick.information,
			reason, phase: now.phase });
		if (reply.cracked) return { brewed, cracked: true };

		mixes = reply.mixes_left;
		have = cipher_spend(have, pick.mix);
		fitting = cipher_narrow(fitting, pick.mix, reply.right);
		ruled_out = ruled_out.filter(mix => mix.join() !== pick.mix.join());
	}
	return { brewed, cracked: false };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE TASK — at the Witch from the brewing phase (or earlier, if the board is already a snipe), watching every 100ms
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_run_cipher() {
	if (!setting("merchant_cipher") || merchant_task !== "Idle" || Date.now() < _cipher_retry_at) return false;
	const cipher = cipher_round();
	if (!cipher || cipher_mixes_left() <= 0 || !cipher_can_brew(cipher, cipher_bag(), cipher_last_round_today())) return false;
	return cipher.phase === "brewing" || cipher_snipe_odds(cipher) >= CIPHER_SNIPE_ODDS;
}

function handle_cipher_state() {
	return run_task("Witch's Cipher", async abandoned => {
		_cipher_retry_at = Date.now() + CIPHER_RETRY_MS;
		await smarter_move(CIPHER_WITCH, null, { radius: CIPHER_REACH });
		log_msg("info", "🧪 At the Witch, watching the board");
		while (!abandoned() && cipher_mixes_left() > 0) {
			const cipher = cipher_round();
			if (!cipher || Date.now() >= cipher.end) return;
			task_heartbeat();
			cipher_board_log(cipher);
			const odds = cipher_snipe_odds(cipher);
			if (odds >= CIPHER_SNIPE_ODDS) await cipher_burst(abandoned, `Sniping at ${Math.round(odds * 100)}% to crack`, false);
			else if (cipher_deadline(cipher)) {
				await cipher_burst(abandoned, `Last ${CIPHER_DEADLINE_MS / 1000}s of the day's last round`, true);
				return;
			} else await sleep(CIPHER_WATCH_MS);
		}
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// INGREDIENTS — kept in the bag (CONFIG.do_not_bank) and reach him with the party's loot; also bought from stands in view while idle
// at home, one listing at a time
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
