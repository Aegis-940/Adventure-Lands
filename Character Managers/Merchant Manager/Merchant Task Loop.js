// --------------------------------------------------------------------------------------------------------------------------------- //
// MERCHANT TASKS — the priority list, the dispatcher, and the loop that drives them
// --------------------------------------------------------------------------------------------------------------------------------- //

const MERCHANT_STATES = {
	DEAD: "dead",
	ANNIVERSARY: "anniversary",
	RESTOCKING: "restocking",
	DELIVERING: "delivering",
	BANKING: "banking",
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

async function handle_anniversary_state() {
	merchant_task = "Anniversary";
	try {
		await anniversary_tick();
		const goal = anniversary_destination();
		if (!travel_arbiter(goal)) local_step(goal);
	} catch (e) {
		catcher(e, "handle_anniversary_state");
	} finally {
		merchant_task = "Idle";
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UPGRADING & CRAFTING — thin wrappers over Merchant Upgrading.js / Merchant Crafting.js
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_run_upgrade() {
	return CONFIG.enabled.upgrading
		&& merchant_task === "Idle"
		&& character.gold >= CONFIG.upgrade_gold_threshold
		&& bank_has_upgradeable_items();
}

async function handle_upgrading_state() {
	if (merchant_task !== "Idle") return;
	try {
		log("Starting auto-upgrade process...");
		await auto_upgrade();
	} catch (e) {
		catcher(e, "handle_upgrading_state");
		merchant_task = "Idle";
	}
}

function should_run_craft() {
	return CONFIG.enabled.crafting
		&& merchant_task === "Idle"
		&& has_enough_bank_space()
		&& can_afford_any_craft();
}

async function handle_crafting_state() {
	if (merchant_task !== "Idle") return;
	merchant_task = "Crafting";
	try {
		await try_craft();
	} catch (e) {
		catcher(e, "handle_crafting_state");
	} finally {
		merchant_task = "Idle";
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PRIORITY LIST — first match in CONFIG.priorities wins
// --------------------------------------------------------------------------------------------------------------------------------- //

const PRIORITY_CHECKS = {
	dead:        { state: MERCHANT_STATES.DEAD,       should_run: () => character.rip },
	anniversary: { state: MERCHANT_STATES.ANNIVERSARY, should_run: () => typeof anniversary_should_travel === "function" && anniversary_should_travel() },
	delivering:  { state: MERCHANT_STATES.DELIVERING, should_run: should_run_delivery },
	banking:     { state: MERCHANT_STATES.BANKING,    should_run: should_run_banking },
	upgrading:   { state: MERCHANT_STATES.UPGRADING,  should_run: should_run_upgrade },
	crafting:    { state: MERCHANT_STATES.CRAFTING,   should_run: should_run_craft },
	exchanging:  { state: MERCHANT_STATES.EXCHANGING, should_run: should_run_exchange },
	fishing:     { state: MERCHANT_STATES.FISHING,    should_run: should_run_fishing },
	mining:      { state: MERCHANT_STATES.MINING,     should_run: should_run_mining },
	restocking:  { state: MERCHANT_STATES.RESTOCKING, should_run: should_run_restock },
};

function get_character_state() {
	for (const key of CONFIG.priorities) {
		const check = PRIORITY_CHECKS[key];
		if (check && check.should_run()) return check.state;
	}
	return MERCHANT_STATES.IDLE;
}

async function set_state(state) {
	try {
		if (state !== MERCHANT_STATES.IDLE && stand_is_open()) await close_merchant_stand();

		switch (state) {
			case MERCHANT_STATES.DEAD:       await handle_dead_state(); break;
			case MERCHANT_STATES.ANNIVERSARY: await handle_anniversary_state(); break;
			case MERCHANT_STATES.DELIVERING: await handle_delivering_state(); break;
			case MERCHANT_STATES.BANKING:    await handle_banking_state(); break;
			case MERCHANT_STATES.UPGRADING:  await handle_upgrading_state(); break;
			case MERCHANT_STATES.CRAFTING:   await handle_crafting_state(); break;
			case MERCHANT_STATES.EXCHANGING: await handle_exchanging_state(); break;
			case MERCHANT_STATES.FISHING:    await handle_fishing_state(); break;
			case MERCHANT_STATES.MINING:     await handle_mining_state(); break;
			case MERCHANT_STATES.RESTOCKING: await handle_restocking_state(); break;
			case MERCHANT_STATES.IDLE: await handle_idle_state(); break;
			default: break;
		}
	} catch (e) {
		catcher(e, "set_state: unhandled error");
	}
}

const MERCHANT_TASK_WATCHDOG_MS = 5 * 60 * 1000;
let watchdog_task = merchant_task;
let watchdog_since = Date.now();

async function loop_controller() {
	while (true) {
		try {
			party_manager();

			if (!automation_enabled()) {
				if (stand_is_open()) await close_merchant_stand();
				merchant_task = "Idle";
				watchdog_task = "Idle";
				watchdog_since = Date.now();
				await delay(250);
				continue;
			}

			if (merchant_task !== watchdog_task) {
				watchdog_task = merchant_task;
				watchdog_since = Date.now();
			} else if (merchant_task !== "Idle" && Date.now() - watchdog_since > MERCHANT_TASK_WATCHDOG_MS) {
				game_log(`⚠️ Merchant stuck on "${merchant_task}" for over ${MERCHANT_TASK_WATCHDOG_MS / 60000} minutes — forcing back to Idle.`, "#FF3333");
				merchant_task = "Idle";
				merchant_task_generation++;
				watchdog_task = "Idle";
				watchdog_since = Date.now();
			}

			const state = get_character_state();
			await set_state(state);
		} catch (e) {
			catcher(e, "loop_controller");
		}
		await delay(250);
	}
}
