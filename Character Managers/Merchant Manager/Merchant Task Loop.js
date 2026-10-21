// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT TASKS — the priority list, the dispatcher, and the loop that drives them
// --------------------------------------------------------------------------------------------------------------------------------- //

var MERCHANT_STATES = {
	DEAD: "dead",
	DELIVERING: "delivering",
	BANKING: "banking",
	CIPHER_MEET: "cipher_meet",
	CIPHER: "cipher",
	TRICK_OR_TREAT: "trick_or_treat",
	LOLIPOPS: "lolipops",
	UPGRADING: "upgrading",
	CRAFTING: "crafting",
	EXCHANGING: "exchanging",
	FISHING: "fishing",
	MINING: "mining",
	IDLE: "idle",
};

async function handle_dead_state() {
	try {
		if (character.rip) await respawn();
	} catch (e) {
		catcher(e, "handle_dead_state");
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADING & CRAFTING — thin wrappers over Merchant Upgrading.js / Merchant Crafting.js
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_run_upgrade() {
	return setting("merchant_upgrading")
		&& merchant_task === "Idle"
		&& !upgrade_run_blocked()
		&& character.gold >= CONFIG.upgrade_gold_threshold
		&& (inventory_has_upgradeable_items() || bank_has_upgradeable_items() || can_buy_for_upgrade());
}

function handle_upgrading_state() {
	return run_task("Upgrading", auto_upgrade);
}

function should_run_lolipop_push() {
	return lolipop_run.active && merchant_task === "Idle";
}

function handle_lolipop_state() {
	return run_task("Lolipops", lolipop_push_step, () => stop_lolipop_push("an upgrade call failed, see the error above"));
}

function should_run_craft() {
	return setting("merchant_crafting")
		&& merchant_task === "Idle"
		&& !craft_run_blocked()
		&& has_enough_bank_space()
		&& can_afford_any_craft();
}

function handle_crafting_state() {
	return run_task("Crafting", try_craft);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TRICK OR TREAT — a thin wrapper over Core Systems/Trick or Treat.js; a round that leaves doors unknocked waits before the next
// --------------------------------------------------------------------------------------------------------------------------------- //

var TRICK_OR_TREAT_RETRY_MS = 30 * 60 * 1000;
var _trick_or_treat_retry_at = 0;

function should_run_trick_or_treat() {
	return merchant_task === "Idle"
		&& Date.now() >= _trick_or_treat_retry_at
		&& doors_to_knock().length > 0;
}

function handle_trick_or_treat_state() {
	return run_task("Trick or Treat", async abandoned => {
		_trick_or_treat_retry_at = Date.now() + TRICK_OR_TREAT_RETRY_MS;
		await trick_or_treat_round(abandoned);
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PRIORITY LIST — first match in CONFIG.priorities wins
// --------------------------------------------------------------------------------------------------------------------------------- //

var PRIORITY_CHECKS = {
	dead:        { state: MERCHANT_STATES.DEAD,       should_run: () => character.rip },
	delivering:  { state: MERCHANT_STATES.DELIVERING, should_run: should_run_delivery },
	banking:     { state: MERCHANT_STATES.BANKING,    should_run: should_run_banking },
	cipher_meet: { state: MERCHANT_STATES.CIPHER_MEET, should_run: should_run_cipher_meet },
	cipher:      { state: MERCHANT_STATES.CIPHER,     should_run: should_run_cipher },
	trick_or_treat: { state: MERCHANT_STATES.TRICK_OR_TREAT, should_run: should_run_trick_or_treat },
	lolipops:    { state: MERCHANT_STATES.LOLIPOPS,   should_run: should_run_lolipop_push },
	upgrading:   { state: MERCHANT_STATES.UPGRADING,  should_run: should_run_upgrade },
	crafting:    { state: MERCHANT_STATES.CRAFTING,   should_run: should_run_craft },
	exchanging:  { state: MERCHANT_STATES.EXCHANGING, should_run: should_run_exchange },
	fishing:     { state: MERCHANT_STATES.FISHING,    should_run: should_run_fishing },
	mining:      { state: MERCHANT_STATES.MINING,     should_run: should_run_mining },
};

function get_character_state() {
	for (const key of CONFIG.priorities) {
		const check = PRIORITY_CHECKS[key];
		if (check && check.should_run()) return check.state;
	}
	return MERCHANT_STATES.IDLE;
}

async function set_state(state) {
	switch (state) {
		case MERCHANT_STATES.DEAD:       await handle_dead_state(); break;
		case MERCHANT_STATES.DELIVERING: await handle_delivering_state(); break;
		case MERCHANT_STATES.BANKING:    await handle_banking_state(); break;
		case MERCHANT_STATES.CIPHER_MEET: await handle_cipher_meet_state(); break;
		case MERCHANT_STATES.CIPHER:     await handle_cipher_state(); break;
		case MERCHANT_STATES.TRICK_OR_TREAT: await handle_trick_or_treat_state(); break;
		case MERCHANT_STATES.LOLIPOPS:   await handle_lolipop_state(); break;
		case MERCHANT_STATES.UPGRADING:  await handle_upgrading_state(); break;
		case MERCHANT_STATES.CRAFTING:   await handle_crafting_state(); break;
		case MERCHANT_STATES.EXCHANGING: await handle_exchanging_state(); break;
		case MERCHANT_STATES.FISHING:    await handle_fishing_state(); break;
		case MERCHANT_STATES.MINING:     await handle_mining_state(); break;
		case MERCHANT_STATES.IDLE: await handle_idle_state(); break;
		default: break;
	}
}

var MERCHANT_TASK_WATCHDOG_MS = 5 * 60 * 1000;
var watchdog_task = merchant_task;
var watchdog_since = Date.now();
var _party_manager_at = 0;

function task_heartbeat() {
	watchdog_since = Date.now();
}

function loop_controller() {
	every("loop_controller", { ms: 250, kind: "automation" }, async () => {
		if (Date.now() - _party_manager_at >= TICK_RATE.maintenance) {
			_party_manager_at = Date.now();
			party_manager();
		}

		if (!automation_enabled()) {
			set_task("Idle");
			watchdog_task = "Idle";
			watchdog_since = Date.now();
			return 250;
		}

		if (merchant_task !== watchdog_task) {
			watchdog_task = merchant_task;
			watchdog_since = Date.now();
		} else if (merchant_task !== "Idle" && Date.now() - watchdog_since > MERCHANT_TASK_WATCHDOG_MS) {
			log_msg("warn", `Merchant stuck on "${merchant_task}" for over ${MERCHANT_TASK_WATCHDOG_MS / 60000} minutes — forcing back to Idle.`);
			abandon_task();
			watchdog_task = "Idle";
			watchdog_since = Date.now();
		}

		const next_state = get_character_state();
		await set_state(next_state);
		return 250;
	});
}
