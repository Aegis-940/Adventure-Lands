// --------------------------------------------------------------------------------------------------------------------------------- //
// MAINTENANCE — potions, restocking, and the periodic tab reload
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potion_loop() {
	if (character.c && (character.c.fishing || character.c.mining)) {
		return setTimeout(potion_loop, 200);
	}

	const HP_MISSING = character.max_hp - character.hp;
	const MP_MISSING = character.max_mp - character.mp;

	let used_potion = false;

	const prefer_mp = CONFIG.potions.prefer_mp === true;
	const hp_first = !prefer_mp && character.hp < character.max_hp * 0.5;

	const drink_mp = () => {
		if (MP_MISSING >= CONFIG.potions.mp_threshold) { use("mp"); used_potion = true; }
	};
	const drink_hp = () => {
		if (HP_MISSING >= CONFIG.potions.hp_threshold) { use("hp"); used_potion = true; }
	};

	if (hp_first) { drink_hp(); drink_mp(); }
	else { drink_mp(); drink_hp(); }

	setTimeout(potion_loop, used_potion ? 2050 : 10);
}

// function suicide() {
// 	if (!character.rip && character.hp < 2000) {
// 		parent.socket.emit("harakiri");
// 		game_log("Harakiri");
// 	}

// 	if (character.rip) {
// 		respawn();
// 	}
// }

function auto_buy_potions() {
	if (quantity("hpot1") < CONFIG.potions.min_stock) buy("hpot1", CONFIG.potions.min_stock);
	if (quantity("mpot1") < CONFIG.potions.min_stock) buy("mpot1", CONFIG.potions.min_stock);
	if (quantity("xptome") < 1) buy("xptome", 1);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOSTERS — everyone keeps one pointed at xp; luck and gold belong to the looting cycle and are never borrowed from
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOOSTER_NAMES = ["xpbooster", "goldbooster", "luckbooster"];
const FORTUNE_BOOSTERS = ["luckbooster", "goldbooster"];
const BOOSTER_CHECK_MS = 3600000;
const BOOSTER_FOLLOWUP_MS = 10000;

let _booster_next = 0;

function booster_running(item) {
	if (!item) return false;
	const until = Date.parse(item.expires);
	return isFinite(until) && until > Date.now();
}

function fortune_booster_slot() {
	if (!CONFIG.looting || !CONFIG.looting.equip_gold_gear) return null;
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && FORTUNE_BOOSTERS.includes(item.name)) return i;
	}
	return null;
}

function xp_booster_slot() {
	const reserved = fortune_booster_slot();
	for (let i = 0; i < character.items.length; i++) {
		if (i === reserved) continue;
		const item = character.items[i];
		if (item && BOOSTER_NAMES.includes(item.name)) return i;
	}
	return null;
}

function maintain_xp_booster() {
	const now = Date.now();
	if (now < _booster_next) return;
	_booster_next = now + BOOSTER_FOLLOWUP_MS;

	const slot = xp_booster_slot();
	if (slot === null) {
		log("🧪 No xp booster held — buying one", "#66ccff", "Alerts");
		buy("xpbooster", 1);
		return;
	}

	const item = character.items[slot];
	if (item.name !== "xpbooster") {
		log(`🧪 Shifting the spare booster in slot ${slot} to xp`, "#66ccff", "Alerts");
		shift(slot, "xpbooster");
		return;
	}

	_booster_next = now + BOOSTER_CHECK_MS;
	if (booster_running(item)) return;

	log(`🧪 Activating the xp booster in slot ${slot}`, "#66ccff", "Alerts");
	activate(slot);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PERIODIC RESET - Reload the game tab every N hours, on the hour
// --------------------------------------------------------------------------------------------------------------------------------- //

const RESET_INTERVAL_HOURS = 2;
const RESET_WINDOW_MINUTES = 2;
let _last_reset_bucket = null;
let _reset_due_bucket = null;
let _suppress_periodic_reset = false;

function set_suppress_reset(val) { _suppress_periodic_reset = val; }

function schedule_periodic_reset() {
	const boot = new Date();
	if (boot.getHours() % RESET_INTERVAL_HOURS === 0 && boot.getMinutes() < RESET_WINDOW_MINUTES) {
		_last_reset_bucket = `${boot.toDateString()}-${boot.getHours()}`;
	}

	setInterval(() => {
		if (_suppress_periodic_reset) return;

		const now = new Date();
		const hour = now.getHours();
		const bucket = `${now.toDateString()}-${hour}`;

		if (hour % RESET_INTERVAL_HOURS === 0 && now.getMinutes() < RESET_WINDOW_MINUTES
			&& _last_reset_bucket !== bucket) {
			_reset_due_bucket = bucket;
		}
		if (!_reset_due_bucket || _last_reset_bucket === _reset_due_bucket) return;

		if (typeof anniversary_block_reason === "function" && anniversary_block_reason() === null) return;

		_last_reset_bucket = _reset_due_bucket;
		_reset_due_bucket = null;

		game_log(`[reset] Periodic reload at ${hour}:00`, "#FFAA00");
		setTimeout(() => parent.window.location.reload(), 1000);
	}, 60000);
}

schedule_periodic_reset();
