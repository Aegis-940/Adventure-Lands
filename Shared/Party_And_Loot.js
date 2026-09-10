// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY & LOOT — party invite/accept management, shared loot/inventory/panic/equipment behaviors
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// GAME EVENT CALLBACKS (event-driven, replaces parent.S polling where possible)
// --------------------------------------------------------------------------------------------------------------------------------- //

const LIVE_EVENTS = {};

on_game_event = function(data) {
	if (!data?.name) return;
	LIVE_EVENTS[data.name] = data;
	log(`[Event] ${data.name} spawned`, "#FF8800");
};

let combined_damage_flag = false;
let combined_damage_time = 0;

on_combined_damage = function() {
	combined_damage_flag = true;
	combined_damage_time = Date.now();
};

function should_spread() {
	if (!combined_damage_flag) return false;
	if (Date.now() - combined_damage_time > 2000) {
		combined_damage_flag = false;
		return false;
	}
	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER MODE — one owner of the panic flags, one name for what the character is doing.
// --------------------------------------------------------------------------------------------------------------------------------- //

// panicking and panic_external were assigned from six places across three files. That is how one
// got left set with nobody able to say who set it, and why the fix was a timeout rather than a
// cause. Writes go through here now; every transition logs its reason, so a stuck flag names its
// owner instead of needing to be reasoned about.
//
// Deliberately NOT derived from HP. Panic is latched with hysteresis on purpose — it arms at
// low_hp and only clears at high_hp — and a pure function of current HP would flap across that
// boundary, which is the orb churn that drove cc to 77.
function set_panic(on, reason, external) {
	const ext = external === undefined ? panic_external : !!external;
	if (panicking === on && panic_external === ext) return;

	if (on && !panicking) last_panic_time = 0;   // act this tick, not after the cooldown
	panicking = !!on;
	panic_external = ext;
	panic_external_since = ext && on ? Date.now() : 0;

	log(on ? `⚠️ Panic: ${reason}` : `✅ Panic over: ${reason}`,
		on ? "#ffcc00" : "#00ff00", "Alerts");
}

// What the character is doing, as one value rather than three booleans read in eight files.
// Read-only: every branch here is owned elsewhere.
function character_mode() {
	if (character.rip) return "dead";
	if (typeof panicking !== "undefined" && panicking) return "panic";
	if (typeof anniversary_travel !== "undefined" && anniversary_travel) return "anniversary";
	if (smart && smart.moving) return "travelling";
	return "farming";
}

function home_radius() {
	return (CONFIG.movement.circle_radius || 75) + 20;
}

function is_away_from_home() {
	if (typeof destination === "undefined" || !destination) return false;
	if (destination.map && character.map !== destination.map) return true;
	return Math.hypot(character.x - destination.x, character.y - destination.y) > home_radius();
}


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

function find_booster_slot() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && ["xpbooster", "goldbooster", "luckbooster"].includes(item.name)) {
			return i;
		}
	}
	return null;
}

const MISSING_ITEM_WARN_INTERVAL = 30000;
const _missing_item_warned = {};

function warn_missing_item(item_name, level, slot) {
	const key = `${item_name}:${level}:${slot}`;
	const now = Date.now();
	if (now - (_missing_item_warned[key] || 0) < MISSING_ITEM_WARN_INTERVAL) return;
	_missing_item_warned[key] = now;
	game_log(`⚠️ batch_equip: no ${item_name} (lvl ${level}) in inventory for ${slot}`, "#FFA500");
}

async function batch_equip(data, set_name) {
	if (!Array.isArray(data)) {
		return Promise.reject({ reason: "invalid", message: "Not an array" });
	}
	if (data.length > 15) {
		return Promise.reject({ reason: "invalid", message: "Too many items" });
	}

	let valid_items = [];
	let claimed_slots = new Set();

	for (let i = 0; i < data.length; i++) {
		let item_name = data[i].item_name;
		let slot = data[i].slot;
		let level = data[i].level;
		let l = data[i].l;

		if (!item_name) continue;

		const slot_item = parent.character.slots[slot];
		if (slot_item && slot_item.name === item_name && (slot_item.level ?? 0) === (level ?? 0)) continue;

		let idx = parent.character.items.findIndex((item, j) =>
			item && item.name === item_name && (item.level ?? 0) === (level ?? 0) && item.l === l && !claimed_slots.has(j)
		);
		if (idx === -1) {
			idx = parent.character.items.findIndex((item, j) =>
				item && item.name === item_name && (item.level ?? 0) === (level ?? 0) && !claimed_slots.has(j)
			);
		}

		if (idx === -1) {
			idx = parent.character.items.findIndex((item, j) =>
				item && item.name === item_name && !claimed_slots.has(j)
			);
			if (idx !== -1) {
				const found = parent.character.items[idx];
				log(`⚠️ ${item_name} for ${slot}: set says lvl ${level ?? 0}, bag has lvl `
					+ `${found.level ?? 0} — equipping it anyway. Fix the set definition.`,
					"#FFA500", "Errors");
			}
		}

		if (idx === -1) {
			warn_missing_item(item_name, level, slot);
			continue;
		}

		valid_items.push({ num: idx, slot: slot });
		claimed_slots.add(idx);
	}

	if (valid_items.length === 0) return 0;

	try {
		parent.socket.emit("equip_batch", valid_items);
		await parent.push_deferred("equip_batch");
	} catch (error) {
		console.error("batch_equip error:", error);
		return Promise.reject({ reason: "invalid", message: "Failed to equip" });
	}
	return valid_items.length;
}

function is_set_equipped(set_name) {
	const set = equipment_sets[set_name];
	if (!set) return false;

	return set.every(item =>
		character.slots[item.slot]?.name === item.item_name &&
		(character.slots[item.slot]?.level ?? 0) === (item.level ?? 0)
	);
}

// Renamed from equip_set: this is the raw emit and must only ever be reached through
// equip_apply(), which checks the claim. A bare equip_set() call site is now a grep-able bug.
async function equip_set_raw(set_name) {
	const set = equipment_sets[set_name];
	if (!set) {
		console.error(`Set "${set_name}" not found.`);
		return;
	}

	try {
		if (set.some(i => i.slot === "orb") && typeof errlog_record === "function") {
			errlog_record("orb_equip", `${set_name} -> orb`
				+ ` (panicking=${typeof panicking !== "undefined" && !!panicking})`);
		}
	} catch (e) { /* recorder absent */ }

	return batch_equip(set, set_name);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT ARBITER — one owner of the equipment slots.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Slots used to be written by four or five independent deciders per character — the rules
// resolver, panic, transient combat swaps, the status swap trick, looting gear — coordinated by a
// hand-rolled protocol of gear_locked, panic_owns_orb() and per-group cooldowns. That protocol
// cannot work: resolve_equipment() checked its bail once and then awaited a server round trip, so
// an invocation already in flight sailed past it and emitted over the jacko. Intermittent, and
// proportional to ping.
//
// A claim is not advisory. Higher priority PREEMPTS lower and revokes its token mid-sequence, so
// panic no longer waits for a cleave swap to finish being polite.
const EQUIP_PRIORITY = {
	panic: 100,   // jacko for scare; must beat everything
	skill: 80,    // transient combat swaps — basher, bataxe, zap, temporal
	trick: 70,    // status swap trick
	loot: 60,     // gold/luck gear while opening chests
	rules: 20,    // steady-state EQUIPMENT_RULES
	resting: 10,  // merchant default gear
};

// A holder that never releases — an exception on a path without a finally — must not wedge the
// slots forever.
const EQUIP_CLAIM_MAX_MS = 5000;

let _equip_holder = null;
let _equip_seq = 0;

function equip_claim(owner, priority) {
	if (_equip_holder && Date.now() - _equip_holder.at > EQUIP_CLAIM_MAX_MS) _equip_holder = null;
	if (_equip_holder && _equip_holder.priority > priority) return null;
	_equip_holder = { owner, priority, token: ++_equip_seq, at: Date.now() };
	return _equip_holder.token;
}

function equip_holds(token) {
	return !!token && !!_equip_holder && _equip_holder.token === token;
}

function equip_release(token) {
	if (equip_holds(token)) _equip_holder = null;
}

function equip_holder_name() {
	return _equip_holder ? _equip_holder.owner : null;
}

// THE ONLY EMITTER. Everything that wants gear on goes through here, so "who can write to the
// slots" is answerable with grep rather than by reading every loop.
async function equip_apply(token, sets) {
	if (!equip_holds(token)) return false;
	const list = Array.isArray(sets) ? sets : [sets];
	for (const s of list) {
		if (!equip_holds(token)) return false;   // preempted mid-sequence
		if (is_set_equipped(s)) continue;
		await equip_set_raw(s);
	}
	return equip_holds(token);
}

// Same, for the trick's hand-built slot lists rather than a named set.
async function equip_apply_slots(token, slots) {
	if (!equip_holds(token)) return false;
	await batch_equip(slots);
	return equip_holds(token);
}

// Convenience for the common "claim, apply, release" with no sequence in between.
async function equip_once(owner, priority, sets) {
	const token = equip_claim(owner, priority);
	if (!token) return false;
	try {
		return await equip_apply(token, sets);
	} finally {
		equip_release(token);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIFIED EQUIPMENT RESOLVER — Warrior/Ranger/Healer each declare their own EQUIPMENT_RULES
// --------------------------------------------------------------------------------------------------------------------------------- //

async function apply_equipment_rule(token, group, resolved) {
	if (!resolved) return;
	const sets = Array.isArray(resolved) ? resolved : [resolved];

	if (sets.every(s => is_set_equipped(s))) return;

	const now = performance.now();
	const cooldown = CONFIG.equipment.swap_cooldown ?? 500;
	if (!state.equip_cooldowns) state.equip_cooldowns = {};
	if (now - (state.equip_cooldowns[group] || 0) < cooldown) return;
	state.equip_cooldowns[group] = now;

	await equip_apply(token, sets);
}

async function apply_booster_rule(group, desired_booster) {
	if (!desired_booster) return;
	if (locate_item(desired_booster) !== -1) return;

	const now = performance.now();
	const cooldown = CONFIG.equipment.swap_cooldown ?? 500;
	if (!state.equip_cooldowns) state.equip_cooldowns = {};
	if (now - (state.equip_cooldowns[group] || 0) < cooldown) return;

	const other_slot = find_booster_slot();
	if (other_slot === null) return;

	state.equip_cooldowns[group] = now;
	shift(other_slot, desired_booster);
}

// The `panicking` and `gear_locked` clauses are gone: those were this resolver trying to stay out
// of other writers' way, which the claim now does properly. What is left is genuinely about
// whether the rules should run at all.
function resolve_equipment_bail_reason() {
	if (typeof EQUIPMENT_RULES === "undefined") return "EQUIPMENT_RULES undefined";
	if (CONFIG.equipment?.auto_swap_sets === false) return "auto_swap_sets disabled";
	if (character.cc > COOLDOWNS.cc) return "cc above threshold";
	if (typeof should_pause_equipment_resolve === "function" && should_pause_equipment_resolve()) return "special weapon equipped";
	return null;
}

async function resolve_equipment() {
	if (resolve_equipment_bail_reason()) return;

	// Lowest priority in the table, so anything more urgent simply refuses the claim and this
	// returns — no bail flag to check, no window between checking it and acting on it.
	const token = equip_claim("rules", EQUIP_PRIORITY.rules);
	if (!token) return;

	try {
		const overrides = (typeof MONSTER_GEAR_OVERRIDES !== "undefined" && MONSTER_GEAR_OVERRIDES[home]) || {};

		for (const group in EQUIPMENT_RULES) {
			if (!equip_holds(token)) return;
			const rule = EQUIPMENT_RULES[group];
			const resolved = group in overrides ? overrides[group] : rule.resolve();
			if (rule.kind === "booster") {
				await apply_booster_rule(group, resolved);
			} else {
				await apply_equipment_rule(token, group, resolved);
			}
		}
	} finally {
		equip_release(token);
	}
}

async function equipment_manager_loop() {
	while (true) {
		try {
			await resolve_equipment();
		} catch (e) {
			catcher(e, "equipment_manager_loop");
		}
		await delay(TICK_RATE.equipment ?? 25);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY MANAGER
// --------------------------------------------------------------------------------------------------------------------------------- //

function is_in_party(name) {
	return !!(parent.party && parent.party[name] !== undefined);
}

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

function on_party_request(name) {
	if (typeof CONFIG === "undefined") return;
	if (CONFIG.party.group_members.includes(name)) {
		console.log("Accepting party request from " + name);
		accept_party_request(name);
	}
}

function on_party_invite(name) {
	if (typeof CONFIG === "undefined") return;
	if (CONFIG.party.group_members.includes(name)) {
		console.log("Accepting party invite from " + name);
		accept_party_invite(name);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT & INVENTORY
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOT_GOLD_RESERVE = 10000000;

async function send_to_merchant() {
	const merchant_name = "Riff";
	const merchant = get_player(merchant_name);

	if (!merchant || merchant.rip) {
		return game_log("❌ Merchant not found or dead");
	}
	if (merchant.map !== character.map || distance(character, merchant) > 400) {
		return game_log("❌ Merchant not nearby");
	}

	const items_to_keep = typeof ITEMS_TO_KEEP !== "undefined" ? ITEMS_TO_KEEP : [];

	for (let i = LOOT_THRESHOLD; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !item.l && !items_to_keep.includes(item.name)) {
			await delay(150);
			try {
				send_item(merchant_name, i, item.q || 1);
			} catch (e) {
				game_log(`⚠️ Could not send item in slot ${i}: ${item.name}`);
			}
		}
	}

	const gold_to_send = character.gold - LOOT_GOLD_RESERVE;
	if (gold_to_send > 0) {
		await delay(10);
		try {
			await send_gold(merchant_name, gold_to_send);
		} catch (e) {
			game_log("⚠️ Could not send gold");
		}
	}
}

function clear_inventory() {
	const loot_mule = get_player("Riff");
	if (!loot_mule) return;

	const dist = distance(character, loot_mule);

	if (dist < 250 && character.gold > LOOT_GOLD_RESERVE) {
		send_gold(loot_mule, character.gold - LOOT_GOLD_RESERVE);
	}

	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !ITEMS_TO_KEEP.includes(item.name) && !item.l && !item.s) {
			if (dist < 250) {
				send_item(loot_mule.id, i, item.q ?? 1);
			}
		}
	}
}

async function wait_until_equipped(set_name, timeout_ms = 1000, interval_ms = 100) {
	let waited = 0;
	while (!is_set_equipped(set_name)) {
		if (waited >= timeout_ms) {
			throw { reason: "timeout", message: `wait_until_equipped("${set_name}"): still not equipped after ${timeout_ms}ms` };
		}
		await delay(interval_ms);
		waited += interval_ms;
	}
}

const EXTERNAL_PANIC_MAX_MS = 60000;

let _panic_check_running = false;

let _travel_panic_latched = false;

let _orb_owner = { at: 0, value: false };

function loadout_manages_orb() {
	const now = Date.now();
	if (now - _orb_owner.at < 1000) return _orb_owner.value;
	_orb_owner.at = now;
	_orb_owner.value = _loadout_manages_orb_uncached();
	return _orb_owner.value;
}

function _loadout_manages_orb_uncached() {
	try {
		for (const group in EQUIPMENT_RULES) {
			const rule = EQUIPMENT_RULES[group];
			if (!rule || rule.kind !== "set" || typeof rule.resolve !== "function") continue;
			const resolved = rule.resolve();
			if (!resolved) continue;
			const sets = Array.isArray(resolved) ? resolved : [resolved];
			if (sets.some(n => (equipment_sets[n] || []).some(i => i.slot === "orb"))) return true;
		}
	} catch (e) { /* rules not loaded */ }
	return false;
}

function set_available(set_name) {
	try {
		const set = equipment_sets[set_name];
		if (!set || !set.length) return false;
		return set.every(i => {
			const worn = character.slots[i.slot];
			if (worn && worn.name === i.item_name) return true;
			return character.items.some(it => it && it.name === i.item_name);
		});
	} catch (e) { return false; }
}

let _panic_last_emit = -1;

async function panic_check() {
	if (_panic_check_running) return;
	_panic_check_running = true;
	try {
		await _panic_check_body();
	} finally {
		_panic_check_running = false;
	}
}

function fmt_err(e) {
	if (e && e.message) return e.message;
	try { return JSON.stringify(e); } catch (x) { return String(e); }
}

async function _panic_check_body() {
	const t = PANIC_THRESHOLDS;

	const LOW_HEALTH = character.hp < character.max_hp * t.low_hp;
	const LOW_MANA = character.mp < character.max_mp * t.low_mp;
	const HIGH_HEALTH = character.hp >= character.max_hp * t.high_hp;
	const HIGH_MANA = character.mp >= character.max_mp * t.high_mp;

	const MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
		e => e.type === "monster" && e.target === character.name && !e.dead
	).length;

	const TRAVEL_AGGRO = t.travel_aggro ?? 1;
	if (!smart.moving) _travel_panic_latched = false;
	else if (MONSTERS_TARGETING_ME >= TRAVEL_AGGRO) _travel_panic_latched = true;
	const TRAPPED_TRAVELLING = _travel_panic_latched;

	if (typeof SMART_USE_TOWN !== "undefined" && SMART_USE_TOWN) {
		try {
			const want_town = MONSTERS_TARGETING_ME === 0;
			if (smart.use_town !== want_town && !smart.searching) smart.use_town = want_town;
		} catch (e) { /* runner not up */ }
	}
	const HARD_REASON = LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= t.aggro;

	if (HARD_REASON || TRAPPED_TRAVELLING) {
		if (!panicking) {
			let reason = [];
			if (LOW_HEALTH) reason.push("low health");
			if (LOW_MANA) reason.push("low mana");
			if (MONSTERS_TARGETING_ME >= t.aggro) reason.push("high aggro");
			if (TRAPPED_TRAVELLING) reason.push(`${MONSTERS_TARGETING_ME} on us while travelling`);
			set_panic(true, reason.join(", "), false);
			if (HARD_REASON && typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
			}
		}
	}

	if (panicking && (Date.now() - last_panic_time > t.cooldown)) {
		last_panic_time = Date.now();
		if (!is_set_equipped("panic")) {
			try {
				// Top of EQUIP_PRIORITY, so this preempts a transient combat swap already in
				// flight and revokes its token rather than queueing behind it. gear_locked could
				// only ever block, never preempt, which is why the jacko sometimes lost the race.
				const token = equip_claim("panic", EQUIP_PRIORITY.panic);
				const emitted = await equip_apply(token, "panic");
				equip_release(token);
				_panic_last_emit = emitted;
				await wait_until_equipped("panic");
			} catch (e) {
				const orb = character.slots.orb;
				const in_bags = character.items
					.filter(i => i && i.name === "jacko")
					.map(i => "lvl" + (i.level ?? 0)).join(",") || "none";
				log(`[PANIC] Failed to equip panic orb: ${fmt_err(e)} `
					+ `(orb slot: ${orb ? orb.name + " lvl" + (orb.level ?? 0) : "empty"}, `
					+ `jacko in bags: ${in_bags}, items emitted: ${_panic_last_emit}, cc: ${Math.round(character.cc || 0)})`,
					"#ff4444", "Errors");
			}
		}

		if (!is_on_cooldown("scare") && can_use("scare")) {
			try {
				log("Using Scare!", "#ffcc00", "Alerts");
				await use_skill("scare");
				await delay(200);
			} catch (e) {
				log(`[PANIC] Error using scare: ${fmt_err(e)}`, "#ff4444", "Errors");
			}
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

			if (!loadout_manages_orb() && is_set_equipped("panic") && !is_set_equipped("orb")) {
				try {
					await equip_once("panic-restore", EQUIP_PRIORITY.panic, "orb");
					await wait_until_equipped("orb");
				} catch (e) {
					log(`[PANIC] Failed to equip normal orb: ${fmt_err(e)}`, "#ff4444", "Errors");
				}
			}

			set_panic(false, "recovered", false);
			if (typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
			}
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY-COHERENT MOVEMENT — the fighters walk with MOVEMENT_LEADER
// --------------------------------------------------------------------------------------------------------------------------------- //


let _leader_pos_cache = { at: 0, pos: null };

function leader_position() {
	if (character.name === MOVEMENT_LEADER) return null;

	const now = Date.now();
	if (now - _leader_pos_cache.at >= 200) {
		_leader_pos_cache.at = now;
		let snap = null;
		try {
			const c = read_state_cache(MOVEMENT_LEADER);
			if (c) snap = { map: c.map, x: c.x, y: c.y, rip: !!c.rip, travelling: !!c.travelling, moving: !!c.moving };
		} catch (e) { /* storage unavailable */ }
		_leader_pos_cache.pos = snap;
	}
	const snap = _leader_pos_cache.pos;

	const live = get_player(MOVEMENT_LEADER);
	if (live) {
		return {
			map: character.map, x: live.x, y: live.y, rip: !!live.rip,
			travelling: !!(snap && snap.travelling),
			moving: !!live.moving,
		};
	}
	if (snap) return snap;

	if (typeof _healer_last_known !== "undefined" && _healer_last_known) {
		return { ..._healer_last_known, rip: false, travelling: false, moving: false };
	}
	return null;
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// LEADER-SIDE COHESION — the leader waits for stragglers.
// --------------------------------------------------------------------------------------------------------------------------------- //

// They follow at follow_distance (15), so a 300-unit gap essentially never happened and she
// essentially never waited — which is why cohesion looked broken when the real problem was
// followers lagging with nobody stopping for them. 150 is a gap they should not be able to open
// unless something has genuinely gone wrong; 60 is close enough to set off again.
const COHESION_RADIUS = 150;
const COHESION_RELEASE = 60;
const COHESION_MAX_WAIT_MS = 60000;
const COHESION_FOLLOWERS = ["Ulric", "Riva"];

let _hold_since = 0;
let _hold_at = 0;
let _hold = false;

function party_cohesion_hold() {
	if (character.name !== MOVEMENT_LEADER) return false;
	if (typeof panicking !== "undefined" && panicking) { _hold_since = 0; _hold = false; return false; }

	// Memoised. read_state_cache() is a synchronous localStorage read and this runs at 10Hz on the
	// healer, whose action loop is the most latency-sensitive thing in the party — the same reason
	// healer_is_down() caches. Dropping the memo when this was simplified was a regression.
	const now = Date.now();
	if (now - _hold_at < 250) return _hold;
	_hold_at = now;

	const owed = typeof anniversary_should_travel === "function" && anniversary_should_travel();
	const limit = _hold_since ? COHESION_RELEASE : COHESION_RADIUS;

	const behind = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip) return false;
		if (!owed && s.anniv_pending && !s.has_kiss) return true;
		return s.map !== character.map
			|| Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});

	if (!behind) _hold_since = 0;
	else if (!_hold_since) _hold_since = now;

	// Never wait forever on someone who cannot reach us.
	_hold = behind && now - _hold_since < COHESION_MAX_WAIT_MS;
	return _hold;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT GOAL — the one priority list for the three combat characters.
// --------------------------------------------------------------------------------------------------------------------------------- //

function movement_goal() {
	if (!CONFIG.movement.enabled) return null;

	if (home === "giantspider" && character.name === MOVEMENT_LEADER) return null;

	if (party_cohesion_hold()) return { hold: true, label: "cohesion" };

	const follow = follow_goal();
	if (follow && !follow.local) return follow;

	const anniv = anniversary_destination();
	if (anniv) {
		const anniv_is_local = anniv.local === "anniversary" || anniv.label === "anniversary-kiss";
		const may_take_it = !follow_has_leader() || (anniv_is_local && follow && follow.on_station);
		if (may_take_it) return anniv;
	}

	const event = event_goal();

	if (follow && follow.on_station && event && event.local === "event") return event;
	if (follow) return follow;
	if (event) return event;

	if (follow_has_leader()) return null;

	if (home === "bscorpion") {
		return is_at_bscorpion_farm()
			? null
			: { label: "bscorpion", map: PRIM_FARM_LOC.map, x: PRIM_FARM_LOC.x, y: PRIM_FARM_LOC.y, radius: PRIM_FARM_RADIUS };
	}

	if (is_away_from_home()) {
		return {
			label: "home",
			map: destination.map || character.map,
			x: destination.x,
			y: destination.y,
			radius: home_radius(),
		};
	}

	return null;
}

// Everything below raw-moves, which is only safe because travel_arbiter() guarantees no journey is
// running when it returns false. Asserted rather than assumed: a smart_move still walking its plot
// while these issue move() is two movers on one character, and the character oscillates between
// them. If this ever fires, the arbiter's release path has a hole in it.
function movement_local(goal, farm_step) {
	if (smart.moving) {
		log("🧭 local movement skipped — a journey is still in flight", "#FFA500", "Alerts");
		return;
	}
	if (goal && goal.local === "follow") return follow_step(goal);
	if (goal && goal.local === "event") return event_step(goal.event);
	if (goal && goal.local === "anniversary") return anniversary_close_step();
	if (typeof anniversary_travel !== "undefined" && anniversary_travel) return;
	if (typeof farm_step === "function") farm_step();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// FOLLOW THE LEADER — walk at her; pathfind only when the line is blocked.
// --------------------------------------------------------------------------------------------------------------------------------- //

const FOLLOW_STATION_RANGE = 220;
// This far behind, close up whatever she is doing — that is not combat spread, that is lost.
const FOLLOW_CATCHUP_RANGE = 200;
// smart.moving drops false for a tick between BFS waypoint recalcs, so an unlatched read of it
// makes the followers break off mid-journey. Keep following for a moment after it clears.
const FOLLOW_TRAVEL_LATCH_MS = 1500;

let _leader_travel_seen = 0;

// Travelling means a JOURNEY — smart_move or an anniversary trip — not merely taking a step. Her
// farm orbit sets character.moving constantly and must not drag the party onto her heels.
function leader_is_travelling(pos) {
	if (pos.travelling) {
		_leader_travel_seen = Date.now();
		return true;
	}
	return _leader_travel_seen > 0 && Date.now() - _leader_travel_seen < FOLLOW_TRAVEL_LATCH_MS;
}

function follow_has_leader() {
	if (character.name === MOVEMENT_LEADER) return false;
	const pos = leader_position();
	return !!pos && !pos.rip;
}

// Minimum time between switching how we follow. can_move_to() is a per-tick geometry test and it
// flickers at any obstacle edge — most of all at long range, which is exactly when a character has
// fallen behind. Switching mode cancels whatever the last one started, so an unlatched flicker
// alternates between binning a half-computed route and binning a walk. Now the arbiter's release
// is unconditional, that would be a stall generator; before it, it was the doubling back.
const FOLLOW_MODE_DWELL_MS = 1200;
let _follow_mode = null;
let _follow_mode_at = 0;

function follow_mode(line_clear) {
	const want = line_clear ? "direct" : "path";
	const now = Date.now();
	if (_follow_mode === want) return want;
	if (_follow_mode && now - _follow_mode_at < FOLLOW_MODE_DWELL_MS) return _follow_mode;
	_follow_mode = want;
	_follow_mode_at = now;
	return want;
}

function follow_ring_point(pos) {
	const fd = CONFIG.movement.follow_distance;
	const angle = Math.atan2(character.y - pos.y, character.x - pos.x);
	return { x: pos.x + Math.cos(angle) * fd, y: pos.y + Math.sin(angle) * fd };
}

function follow_goal() {
	const pos = character.name === MOVEMENT_LEADER ? null : leader_position();
	if (!pos || pos.rip) return null;

	const fd = CONFIG.movement.follow_distance;
	if (pos.map !== character.map) return { label: "follow", map: pos.map, x: pos.x, y: pos.y, radius: fd + 30 };

	const d = Math.hypot(character.x - pos.x, character.y - pos.y);

	// She is not going anywhere and we are with her: stop shadowing and fight. reposition() is
	// centred on her, so this still holds the party together while letting them spread for cleave
	// and 5shot instead of stacking on her at follow_distance.
	if (!leader_is_travelling(pos) && d <= FOLLOW_CATCHUP_RANGE) {
		return { local: "farm", label: "with-leader", on_station: true };
	}
	if (d <= fd) return { local: "farm", label: "with-leader", on_station: true };

	const ring = follow_ring_point(pos);
	if (follow_mode(can_move_to(ring.x, ring.y)) === "direct") {
		return { local: "follow", label: "follow-ring", on_station: d <= FOLLOW_STATION_RANGE };
	}
	return { label: "follow", map: pos.map, x: pos.x, y: pos.y, radius: fd + 30 };
}

function follow_step() {
	const pos = leader_position();
	if (!pos || pos.rip || pos.map !== character.map) return;
	if (Math.hypot(character.x - pos.x, character.y - pos.y) <= CONFIG.movement.follow_distance) return;
	const ring = follow_ring_point(pos);
	if (can_move_to(ring.x, ring.y)) move(ring.x, ring.y);
}



function inventory_sorter() {
	const claimed = {};

	character.items.forEach((item, i) => {
		if (!item) return;
		const spec = item_order[item.name];
		if (spec === undefined) return;

		if (Array.isArray(spec)) {
			const next = claimed[item.name] || 0;
			if (next >= spec.length) return;
			claimed[item.name] = next + 1;
			const target = spec[next];
			if (i !== target) swap(i, target);
		} else if (i !== spec) {
			swap(i, spec);
		}
	});
}

let bank_inventory = [];

/**
 * Scans all available bank tabs using `parent.bank`, if available.
 * Fills `bank_inventory` with metadata: name, level, quantity, tab, slot.
 */
function scan_bank_inventory() {
	if (!parent.bank || !Array.isArray(parent.bank)) {
		game_log("❌ Bank data not available. Open the bank first.");
		return;
	}

	bank_inventory = [];

	for (let tab = 0; tab < parent.bank.length; tab++) {
		const tab_items = parent.bank[tab];
		if (!Array.isArray(tab_items)) continue;

		for (let slot = 0; slot < tab_items.length; slot++) {
			const item = tab_items[slot];
			if (!item) continue;

			bank_inventory.push({
				name: item.name,
				level: item.level ?? 0,
				q: item.q ?? 1,
				tab: tab,
				slot: slot
			});
		}
	}

	game_log(`📦 Bank scan complete: ${bank_inventory.length} items recorded`);
}

function refresh_bank_snapshot() {
	try {
		if (character.bank && Object.keys(character.bank).length) {
			localStorage.setItem("savedBank", JSON.stringify(character.bank));
		}
	} catch (e) { /* storage full or blocked — a stale snapshot is better than a thrown loop */ }
}

/**
 * Withdraws items from your bank using the native `bank_retrieve` call.
 * Call this while standing at your bank.
 *
 * @param {string} item_name         – The name of the item to withdraw.
 * @param {number|null} level       – (optional) Only withdraw items at this exact level.
 * @param {number|null} total       – (optional) Max total quantity to withdraw; omit to take all.
 */
async function withdraw_item(item_name, level = null, total = null) {

	const BANK_LOC1 = { map: "bank", x: 0, y: -37 };
	const BANK_LOC2 = { map: "bank_b", x: -265, y: -344 };

	await delay(200);

	let bank_data = character.bank;
	if (!bank_data || Object.keys(bank_data).length === 0) {
		bank_data = load_bank_from_local_storage();
		if (!bank_data) {
			game_log("⚠️ No bank data available. Open your bank or save it first.");
			return;
		}
	}

	let remaining = (total != null ? total : Infinity);
	let found_any  = false;

	for (const pack_key of Object.keys(bank_data)) {
		if (!pack_key.startsWith("items")) continue;
		const slot_arr = bank_data[pack_key];
		if (!Array.isArray(slot_arr)) continue;

		for (let slot = 0; slot < slot_arr.length && remaining > 0; slot++) {
			const itm = slot_arr[slot];
			if (!itm || itm.name !== item_name) continue;
			if (level != null && (itm.level || 0) !== level) continue;

			found_any = true;

			const pack_num = parseInt(pack_key.replace("items", ""), 10);
			if (!isNaN(pack_num)) {
				if (pack_num >= 0 && pack_num <= 7 && character.map !== "bank") {
					log(`Moving to Bank for pack ${pack_key}`);
					await smarter_move(BANK_LOC1);
					await delay(200);
				} else if (pack_num >= 8 && pack_num <= 14 && character.map !== "bank_b") {
					log(`Moving to Bank Basement for pack ${pack_key}`);
					await smarter_move(BANK_LOC1);
					await smarter_move(BANK_LOC2);
					await delay(200);
				}
			}

			try {
				await bank_retrieve(pack_key, slot, -1);
			} catch (e) {
				game_log(`⚠️ withdraw_item: ${item_name} not in ${pack_key} slot ${slot} `
					+ `(${(e && (e.reason || e.message)) || e})`, "#FFA500");
				continue;
			}
			await delay(100);
			refresh_bank_snapshot();
			remaining -= (itm.q || 1);
		}

		if (remaining <= 0) break;
	}

	if (!found_any) {
		game_log(`⚠️ No "${item_name}"${level != null ? ` level ${level}` : ""} found in bank.`);
	} else if (total != null && remaining > 0) {
		const got = total - remaining;
		game_log(`⚠️ Only retrieved ${got}/${total} of ${item_name}.`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// REMOTE SELLING (background auto-sell loop each fighter runs via setInterval(remote_sell_items, ...))
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = [
	"hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap",
	"cclaw", "crabclaw", "slimestaff", "stinger", "pstem", "gslime", "coat1", "helmet1",
	"gloves1", "pants1", "shoes1", "wbreeches", "vitring", "helmet", "shoes", "gloves",
	"pmace", "throwingstars", "t2bow", "spear", "dagger", "rapier", "sword", "mushroomstaff",
	"rfangs", "gphelmet", "phelmet", "vitearring", "vitscroll", "hhelmet", "harmor", "hpants",
	"hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring",
	"warmscarf", "snowball", "santasbelt", "pclaw", "broom", "skullamulet",
	"iceskates", "carrot", "xmace", "candycanesword", "pmaceofthedead", "ornamentstaff",
	"merry", "rednose", "xmashat", "xmasshoes", "xmassweater", "xmaspants", "mittens",
	"angelwings", "snowflakes", "epyjamas", "ecape", "eears", "eslippers", "carrotsword",
	"pinkie", "oozingterror", "harbringer",
];

function remote_sell_items() {
	for (let i = 0; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item) continue;
		if (item.l === "l" || item.p !== undefined) continue;
		if (SELLABLE_ITEMS.includes(item.name)) {
			sell(i, item.q || 1);
		}
	}
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// ANNIVERSARY EVENT — "I Kiss You"
// --------------------------------------------------------------------------------------------------------------------------------- //

var anniversary_travel = false;

const ANNIVERSARY_TICK_MS = 2000;
const ANNIVERSARY_TICK_ACTIVE_MS = 400;
// Cast only from a range that actually succeeds. The skill's range is 80, but a FAILED cast is not
// free: the client stamps its 10s cooldown optimistically, so a speculative attempt from the edge
// costs ten seconds whether or not the server accepts it. A few of those in a row is the 30-60s
// delay before the kiss finally lands. Closing the extra 25 units first takes under a second.
const ANNIVERSARY_CAST_RANGE = 50;
const ANNIVERSARY_HOLD_RANGE = 35;
const ANNIVERSARY_REFRESH_MS = 5 * 60 * 1000;
const ANNIVERSARY_KISS_RETRY_MS = 2500;
// The buff lands within a server round trip, so this only needs to cover that. At 6s it compounded
// the cooldown penalty above every time a cast was acknowledged without granting anything.
const ANNIVERSARY_ACK_GRACE_MS = 2000;
const ANNIVERSARY_SEEK_RADIUS = 30;


let _anniv_last_kiss = 0;
let _anniv_kiss_acked = 0;
let _anniv_host_round = null;
let _anniv_travel_since = 0;
let _anniv_died_round = null;

const ANNIVERSARY_TRAVEL_MAX_MS = 6 * 60 * 1000;
let _anniv_done_round = null;
let _anniv_had_buff = false;

function anniversary_event() {
	try {
		const s = parent.S && parent.S.anniversary;
		if (!s || !s.active || !s.live || !s.id) return null;
		return Date.now() < s.expires ? s : null;
	} catch (e) { return null; }
}

function anniversary_ticket_problem() {
	try {
		const s = anniversary_event();
		if (!s) return "no live round";
		const ticket = character.s && character.s.anniversary_visit;
		if (!ticket) return "no ticket issued to us";
		if (!(ticket.ms > 0)) return "ticket already spent";
		if (ticket.round !== s.round) return `ticket is for round ${ticket.round}, live round is ${s.round}`;
		if (Date.now() >= ticket.expires) return "ticket expired";

		const region = parent.server_region, ident = parent.server_identifier;
		if (region !== undefined && ident !== undefined && ticket.realm !== region + " " + ident) {
			return `ticket realm "${ticket.realm}" != "${region} ${ident}"`;
		}
		return null;
	} catch (e) { return "ticket check threw: " + fmt_err(e); }
}

function anniversary_is_host() {
	try {
		const s = anniversary_event();
		if (!s) return false;
		return String(character.id) === String(s.id) || character.name === s.target;
	} catch (e) { return false; }
}

function anniversary_block_reason() {
	const s = anniversary_event();
	if (!s) return "no live round";
	if (character.rip) return "dead";
	if (_anniv_died_round === s.round) return "died during this round";

	const kiss = character.s && character.s.anniversary_kiss;
	if (kiss && (kiss.ms === undefined || kiss.ms > ANNIVERSARY_REFRESH_MS)) return "already buffed";
	if (anniversary_is_host()) return "we are the featured player";
	if (_anniv_done_round === s.round) return "already collected this round";
	const ticket_problem = anniversary_ticket_problem();
	if (ticket_problem) return ticket_problem;
	try {
		if (!G.maps[s.map] || !isFinite(s.x) || !isFinite(s.y)) return "no usable destination";
	} catch (e) { return "no usable destination"; }
	return null;
}

function anniversary_should_travel() {
	return anniversary_block_reason() === null;
}

function anniversary_stand_down(why) {
	anniversary_travel = false;
	_anniv_travel_since = 0;
	try {
		if (typeof errlog_record === "function") errlog_record("anniversary", "stand down: " + why);
	} catch (e) { /* recorder absent */ }
	log(`🎂 Anniversary: ${why}.`, "#F0B742", "Alerts");
}

async function anniversary_tick() {
	const ev = anniversary_event();
	if (ev && anniversary_is_host() && _anniv_host_round !== ev.round) {
		_anniv_host_round = ev.round;
		log(`🎂 Anniversary: WE are the featured player (${character.name}) — staying put for visitors.`, "#F0B742", "Alerts");
	}

	if (character.rip) {
		if (anniversary_travel) {
			if (ev) _anniv_died_round = ev.round;
			anniversary_stand_down("died during the visit — sitting this round out");
		}
		return false;
	}

	const blocked = anniversary_block_reason();
	if (blocked) {
		if (anniversary_travel) anniversary_stand_down(blocked);
		return false;
	}

	const s = anniversary_event();

	if (!anniversary_travel) {
		anniversary_travel = true;
		_anniv_travel_since = Date.now();
		_anniv_kiss_acked = 0;
		_anniv_had_buff = !!(character.s && character.s.anniversary_kiss);
		log(`🎂 Anniversary: visiting ${s.target} on ${s.map}.`, "#F0B742", "Alerts");
	}

	if (!_anniv_had_buff && character.s && character.s.anniversary_kiss) {
		_anniv_done_round = s.round;
		anniversary_stand_down("buff received, back to work");
		return false;
	}

	if (s.available === false) return true;

	const them = get_player(s.target);

	const in_kiss_range = !!them && distance(character, them) <= ANNIVERSARY_CAST_RANGE;

	const awaiting_ack = _anniv_kiss_acked > 0 && Date.now() - _anniv_kiss_acked < ANNIVERSARY_ACK_GRACE_MS;

	let off_cooldown = true;
	try {
		if (typeof is_on_cooldown === "function" && is_on_cooldown("ikissyou")) off_cooldown = false;
	} catch (e) { /* unknown skill name — assume ready */ }

	if (in_kiss_range && off_cooldown && !awaiting_ack
		&& Date.now() - _anniv_last_kiss > ANNIVERSARY_KISS_RETRY_MS) {
		_anniv_last_kiss = Date.now();

		Promise.resolve(use_skill("ikissyou", them.id || s.id)).then(
			() => {
				_anniv_kiss_acked = Date.now();
				const got_buff = !!(character.s && character.s.anniversary_kiss);
				const ticket_spent = !(character.s && character.s.anniversary_visit
					&& character.s.anniversary_visit.ms > 0);
				if (got_buff || ticket_spent) {
					_anniv_done_round = s.round;
					log(`🎂 Kissed ${s.target}.`, "#F0B742", "Alerts");
					anniversary_stand_down("collected, back to work");
				}
			},
			e => {
				_anniv_kiss_acked = 0;
				log(`🎂 Anniversary kiss failed: ${fmt_err(e)}`, "#FFA500", "Alerts");
			}
		);

		return true;
	}

	return true;
}

function anniversary_destination() {
	if (!anniversary_travel) return null;
	const s = anniversary_event();
	if (!s) return null;

	const them = get_player(s.target);

	if (them) {
		if (distance(character, them) <= ANNIVERSARY_HOLD_RANGE) {
			return { hold: true, label: "anniversary-kiss" };
		}
		const spot = anniversary_close_point(them);
		if (can_move_to(spot.x, spot.y)) return { local: "anniversary", label: "anniversary-close" };
		return { label: "anniversary", map: them.map || s.map, x: them.x, y: them.y, radius: ANNIVERSARY_HOLD_RANGE };
	}

	const at_snapshot = character.map === s.map
		&& isFinite(s.x) && isFinite(s.y)
		&& Math.hypot(character.x - s.x, character.y - s.y) <= ANNIVERSARY_SEEK_RADIUS;

	if (at_snapshot || !(isFinite(s.x) && isFinite(s.y))) {
		return { hold: true, label: s.available === false ? "anniversary-wait" : "anniversary-seek" };
	}
	return { label: "anniversary", map: s.map, x: s.x, y: s.y, radius: ANNIVERSARY_SEEK_RADIUS };
}

function anniversary_close_point(them) {
	const want = ANNIVERSARY_HOLD_RANGE * 0.6;
	const angle = Math.atan2(character.y - them.y, character.x - them.x);
	return { x: them.x + Math.cos(angle) * want, y: them.y + Math.sin(angle) * want };
}

function anniversary_close_step() {
	const s = anniversary_event();
	if (!s) return;
	const them = get_player(s.target);
	if (!them) return;
	if (distance(character, them) <= ANNIVERSARY_HOLD_RANGE) return;
	const spot = anniversary_close_point(them);
	if (can_move_to(spot.x, spot.y)) move(spot.x, spot.y);
}

setInterval(() => {
	try {
		if (anniversary_travel && _anniv_travel_since
			&& Date.now() - _anniv_travel_since > ANNIVERSARY_TRAVEL_MAX_MS) {
			anniversary_stand_down("travel exceeded " + (ANNIVERSARY_TRAVEL_MAX_MS / 60000) + " min, forcing resume");
		}
	} catch (e) { /* a watchdog that can throw is not a watchdog */ }
}, 5000);

async function anniversary_loop() {
	try {
		await anniversary_tick();
	} catch (e) {
		try { catcher(e, "anniversary_loop"); } catch (x) { /* logging must never kill the loop */ }
	}
	setTimeout(anniversary_loop, anniversary_travel ? ANNIVERSARY_TICK_ACTIVE_MS : ANNIVERSARY_TICK_MS);
}
