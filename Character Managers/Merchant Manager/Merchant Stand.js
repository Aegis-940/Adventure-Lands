// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT STAND — open while idle, closed whenever we need to move.
// --------------------------------------------------------------------------------------------------------------------------------- //

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// IDLE — stand up at HOME, selling junk and exchanging while he waits
// --------------------------------------------------------------------------------------------------------------------------------- //

async function handle_idle_state() {
	if (character.map === HOME.map && Math.hypot(character.x - HOME.x, character.y - HOME.y) <= 10) {
		await open_merchant_stand();
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
