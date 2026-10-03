// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT STAND — open whenever he is standing still, closed the moment he moves
// --------------------------------------------------------------------------------------------------------------------------------- //

var STAND_SETTLE_MS = 2000;
var STAND_TICK_MS = 100;
var _still_since = 0;
var _stand_retry_at = 0;

function standing_still() {
	return !character.moving && !smart.moving && !is_teleporting() && !character.rip;
}

function stand_wanted() {
	if (!standing_still()) {
		_still_since = 0;
		return false;
	}
	if (!_still_since) _still_since = Date.now();
	return automation_enabled() && Date.now() - _still_since >= STAND_SETTLE_MS;
}

async function stand_loop() {
	while (true) {
		try {
			const want = stand_wanted();
			if (want && !character.stand && Date.now() >= _stand_retry_at) {
				_stand_retry_at = Date.now() + STAND_SETTLE_MS;
				await open_stand();
			} else if (!want && character.stand) {
				await close_stand();
			}
		} catch (e) {
			catcher(e, "stand_loop");
		}
		await delay(STAND_TICK_MS);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// IDLE — wait at HOME, selling junk and exchanging
// --------------------------------------------------------------------------------------------------------------------------------- //

async function handle_idle_state() {
	if (character.map === HOME.map && Math.hypot(character.x - HOME.x, character.y - HOME.y) <= 10) {
		sell_while_idle();
		if (CONFIG.enabled.exchanging) await exchange_bag_items();
		return;
	}
	try {
		await smarter_move(HOME);
	} catch (e) {
		catcher(e, "handle_idle_state: smarter_move(HOME)");
	}
}
