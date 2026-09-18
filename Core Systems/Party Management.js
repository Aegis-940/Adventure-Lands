// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MANAGEMENT — panic and its broadcast, party invites, where home is
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER MODE — one owner of the panic flags, one name for where home is
// --------------------------------------------------------------------------------------------------------------------------------- //

var panicking = false;
var last_panic_time = 0;
var last_safe_time = 0;
var panic_external = false;
var panic_external_since = 0;

function set_panic(on, reason, external) {
	const ext = external === undefined ? panic_external : !!external;
	if (panicking === on && panic_external === ext) return;

	if (on && !panicking) last_panic_time = 0;
	panicking = !!on;
	panic_external = ext;
	panic_external_since = ext && on ? Date.now() : 0;

	game_log(on ? `⚠️ Panic: ${reason}` : `✅ Panic over: ${reason}`,
		on ? "#ffcc00" : "#00ff00");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC — threat detection, the aggro dump, and the all-clear
// --------------------------------------------------------------------------------------------------------------------------------- //

const EXTERNAL_PANIC_MAX_MS = 60000;

let _panic_check_running = false;

async function panic_check() {
	if (_panic_check_running) return;
	_panic_check_running = true;
	try {
		await _panic_check_body();
	} finally {
		_panic_check_running = false;
	}
}

async function _panic_check_body() {
	if (typeof dungeon_bailing === "function" && dungeon_bailing()) return;

	const t = PANIC_THRESHOLDS;

	const LOW_HEALTH = character.hp < character.max_hp * t.low_hp;
	const LOW_MANA = character.mp < character.max_mp * t.low_mp;
	const HIGH_HEALTH = character.hp >= character.max_hp * t.high_hp;
	const HIGH_MANA = character.mp >= character.max_mp * t.high_mp;

	const MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
		e => e.type === "monster" && e.target === character.name && !e.dead
	).length;

	const TRAPPED_TRAVELLING = !dungeon_flag("ignore_travel_panic")
		&& is_travelling() && MONSTERS_TARGETING_ME >= (t.travel_aggro ?? 1);

	const aggro_limit = (t.aggro_by_home && t.aggro_by_home[home]) || t.aggro;
	const HARD_REASON = LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= aggro_limit;

	if ((HARD_REASON || TRAPPED_TRAVELLING) && !panicking) {
		set_panic(true, [
			LOW_HEALTH && "low health",
			LOW_MANA && "low mana",
			MONSTERS_TARGETING_ME >= aggro_limit && "high aggro",
			TRAPPED_TRAVELLING && `${MONSTERS_TARGETING_ME} on us while travelling`,
		].filter(Boolean).join(", "), false);

		if (HARD_REASON && typeof PANIC_BROADCAST_TARGETS !== "undefined") {
			send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
		}
	}

	if (panicking && (Date.now() - last_panic_time > t.cooldown)) {
		last_panic_time = Date.now();
		if (!is_set_equipped("panic")) {
			try {
				await wait_until_equipped("panic");
			} catch (e) {
				const orb = character.slots.orb;
				const in_bags = character.items
					.filter(i => i && i.name === "jacko")
					.map(i => "lvl" + (i.level ?? 0)).join(",") || "none";
				game_log(`[PANIC] Panic orb never arrived: ${fmt_err(e)} `
					+ `(orb slot: ${orb ? orb.name + " lvl" + (orb.level ?? 0) : "empty"}, `
					+ `jacko in bags: ${in_bags}, cc: ${Math.round(character.cc || 0)})`,
					"#ff4444");
			}
		}

		if (!is_on_cooldown("scare") && can_use("scare")) {
			try {
				game_log("Using Scare!", "#ffcc00");
				if (typeof errlog_count === "function") errlog_count("scare fired");
				await use_skill("scare");
				await delay(200);
			} catch (e) {
				game_log(`[PANIC] Error using scare: ${fmt_err(e)}`, "#ff4444");
			}
		} else if (typeof errlog_count === "function") {
			errlog_count(`scare blocked cd=${is_on_cooldown("scare")}`
				+ ` can_use=${can_use("scare")} jacko=${is_set_equipped("panic")}`
				+ ` orb=${character.slots.orb ? character.slots.orb.name : "empty"}`);
		}
	}

	let external_hold = typeof panic_external !== "undefined" && panic_external;
	if (external_hold && Date.now() - panic_external_since > EXTERNAL_PANIC_MAX_MS) {
		external_hold = false;
		set_panic(false, "healer's hold expired without an all-clear", false);
	}

	if (HIGH_HEALTH && HIGH_MANA && MONSTERS_TARGETING_ME < t.aggro
		&& !TRAPPED_TRAVELLING && panicking && !external_hold) {
		if (Date.now() - last_safe_time > t.cooldown) {
			last_safe_time = Date.now();

			set_panic(false, "recovered", false);
			if (typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
			}
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MANAGER
// --------------------------------------------------------------------------------------------------------------------------------- //

function party_manager() {
	const am_leader = character.name === PARTY_LEADER;
	const am_member = PARTY_MEMBERS.includes(character.name);
	const current_party = Object.keys(parent.party || {});

	if (am_leader) {
		PARTY_MEMBERS.forEach(name => {
			if (name === character.name) return;
			if (!current_party.includes(name)) {
				send_party_invite(name);
				accept_party_request(name);
			}
		});
	} else if (am_member) {
		if (!current_party.includes(PARTY_LEADER)) {
			send_party_request(PARTY_LEADER);
			accept_party_invite(PARTY_LEADER);
		}
	}
}

function accept_if_party(name, accept) {
	if (name === PARTY_LEADER || PARTY_MEMBERS.includes(name)) accept(name);
}

function on_party_request(name) { accept_if_party(name, accept_party_request); }
function on_party_invite(name) { accept_if_party(name, accept_party_invite); }
