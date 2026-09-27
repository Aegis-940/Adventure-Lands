// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MANAGEMENT — panic and its broadcast, party invites, where home is
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER MODE — one owner of the panic flags, one name for where home is
// --------------------------------------------------------------------------------------------------------------------------------- //

var panicking = false;
var last_panic_time = 0;
var panic_external = false;
var panic_external_since = 0;
var panic_since = 0;

function set_panic(on, reason, external) {
	const ext = external === undefined ? panic_external : !!external;
	if (panicking === on && panic_external === ext) return;

	if (on && !panicking) last_panic_time = 0;
	if (on && !panicking) panic_since = Date.now();
	if (!on) panic_since = 0;
	panicking = !!on;
	panic_external = ext;
	panic_external_since = ext && on ? Date.now() : 0;

	game_log(on ? `⚠️ Panic: ${reason}` : `✅ Panic over: ${reason}`,
		on ? "#ffcc00" : "#00ff00");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC — binary. A threat latches it on; it stays on through the orb and the scare, and only an all-clear releases it.
// --------------------------------------------------------------------------------------------------------------------------------- //

const PANIC_EQUIP_WAIT_MS = 3000;
const PANIC_MIN_HOLD_MS = 3000;
const PANIC_ORB_LINGER_MS = 5000;
const EXTERNAL_PANIC_MAX_MS = 60000;
const SELF_PANIC_MAX_MS = 60000;

let _panic_check_running = false;
let _panic_cleared_at = 0;

function panic_orb_wanted() {
	return panicking || Date.now() - _panic_cleared_at < PANIC_ORB_LINGER_MS;
}

function monsters_targeting_me() {
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && e.target === character.name && !e.dead) count++;
	}
	return count;
}

function panic_threat() {
	const t = PANIC_THRESHOLDS;
	const on_me = monsters_targeting_me();
	const aggro_limit = (t.aggro_by_home && t.aggro_by_home[home]) || t.aggro;
	const low_health = character.hp < character.max_hp * t.low_hp;
	const low_mana = character.mp < character.max_mp * t.low_mp;
	const high_aggro = on_me >= aggro_limit;
	const trapped = !dungeon_flag("ignore_travel_panic") && is_travelling() && on_me >= (t.travel_aggro ?? 1);

	return {
		on_me, aggro_limit, low_health, trapped,
		hard: low_health || low_mana || high_aggro,
		reasons: [
			low_health && "low health",
			low_mana && "low mana",
			high_aggro && "high aggro",
			trapped && `${on_me} on us while travelling`,
		].filter(Boolean),
	};
}

function panic_clear(threat) {
	const t = PANIC_THRESHOLDS;
	return character.hp >= character.max_hp * t.high_hp
		&& character.mp >= character.max_mp * t.high_mp
		&& threat.on_me < threat.aggro_limit
		&& !threat.trapped;
}

function release_panic(reason, broadcast) {
	set_panic(false, reason, false);
	_panic_cleared_at = Date.now();
	if (broadcast) send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
}

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
	if (dungeon_bailing()) return;

	const threat = panic_threat();

	if (!panicking) {
		if (!threat.reasons.length) return;
		set_panic(true, threat.reasons.join(", "), false);
		if (threat.hard) send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
		return;
	}

	await panic_response();

	if (panic_external) {
		if (Date.now() - panic_external_since > EXTERNAL_PANIC_MAX_MS) {
			release_panic("healer's hold expired without an all-clear", false);
		}
		return;
	}

	const held = Date.now() - panic_since;
	if (held < PANIC_MIN_HOLD_MS) return;

	if (panic_clear(threat)) return release_panic("recovered", true);

	if (held > SELF_PANIC_MAX_MS && !threat.low_health && !threat.trapped) {
		errlog_count("panic released on timeout");
		release_panic("held too long with health intact — releasing to recover", true);
	}
}

async function panic_response() {
	if (Date.now() - last_panic_time < PANIC_THRESHOLDS.cooldown) return;
	last_panic_time = Date.now();

	if (!is_set_equipped("panic")) {
		try {
			await wait_until_equipped("panic", PANIC_EQUIP_WAIT_MS);
		} catch (e) {
			const orb = character.slots.orb;
			const in_bags = character.items
				.filter(i => i && i.name === "jacko")
				.map(i => "lvl" + (i.level ?? 0)).join(",") || "none";
			game_log(`[PANIC] Panic orb never arrived: ${fmt_err(e)} `
				+ `(orb slot: ${orb ? orb.name + " lvl" + (orb.level ?? 0) : "empty"}, `
				+ `item cd: ${item_cooldown_ms()}ms, `
				+ `jacko in bags: ${in_bags}, cc: ${Math.round(character.cc || 0)})`,
				"#ff4444");
			return;
		}
	}

	if (is_on_cooldown("scare") || !can_use("scare")) {
		errlog_count(`scare blocked cd=${is_on_cooldown("scare")}`
			+ ` can_use=${can_use("scare")} jacko=${is_set_equipped("panic")}`
			+ ` orb=${character.slots.orb ? character.slots.orb.name : "empty"}`);
		return;
	}

	try {
		game_log("Using Scare!", "#ffcc00");
		errlog_count("scare fired");
		await use_skill("scare");
	} catch (e) {
		game_log(`[PANIC] Error using scare: ${fmt_err(e)}`, "#ff4444");
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
