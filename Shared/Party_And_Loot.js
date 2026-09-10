// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY & LOOT — panic, potions, party invites, loot/inventory, selling, the anniversary visit
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
// SHARED HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

function fmt_err(e) {
	if (e && e.message) return e.message;
	try { return JSON.stringify(e); } catch (x) { return String(e); }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER MODE — one owner of the panic flags, one name for where home is
// --------------------------------------------------------------------------------------------------------------------------------- //

function set_panic(on, reason, external) {
	const ext = external === undefined ? panic_external : !!external;
	if (panicking === on && panic_external === ext) return;

	if (on && !panicking) last_panic_time = 0;
	if (!on) panic_equip_free();
	panicking = !!on;
	panic_external = ext;
	panic_external_since = ext && on ? Date.now() : 0;

	log(on ? `⚠️ Panic: ${reason}` : `✅ Panic over: ${reason}`,
		on ? "#ffcc00" : "#00ff00", "Alerts");
}

function home_radius() {
	return (CONFIG.movement.circle_radius || 75) + 20;
}

function is_away_from_home() {
	if (typeof destination === "undefined" || !destination) return false;
	if (destination.map && character.map !== destination.map) return true;
	return Math.hypot(character.x - destination.x, character.y - destination.y) > home_radius();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC — threat detection, the panic loadout, and the all-clear
// --------------------------------------------------------------------------------------------------------------------------------- //

const EXTERNAL_PANIC_MAX_MS = 60000;

let _panic_check_running = false;

let _panic_equip_token = null;

function panic_equip_hold() {
	if (equip_holds(_panic_equip_token)) {
		equip_refresh(_panic_equip_token);
		return _panic_equip_token;
	}
	_panic_equip_token = equip_claim("panic", EQUIP_PRIORITY.panic);
	return _panic_equip_token;
}

function panic_equip_free() {
	equip_release(_panic_equip_token);
	_panic_equip_token = null;
}

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

async function _panic_check_body() {
	const t = PANIC_THRESHOLDS;

	const LOW_HEALTH = character.hp < character.max_hp * t.low_hp;
	const LOW_MANA = character.mp < character.max_mp * t.low_mp;
	const HIGH_HEALTH = character.hp >= character.max_hp * t.high_hp;
	const HIGH_MANA = character.mp >= character.max_mp * t.high_mp;

	const MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
		e => e.type === "monster" && e.target === character.name && !e.dead
	).length;

	const TRAPPED_TRAVELLING = is_travelling() && MONSTERS_TARGETING_ME >= (t.travel_aggro ?? 1);

	if (typeof SMART_USE_TOWN !== "undefined" && SMART_USE_TOWN) {
		try {
			const want_town = MONSTERS_TARGETING_ME === 0;
			if (smart.use_town !== want_town && !smart.searching) smart.use_town = want_town;
		} catch (e) { /* runner not up */ }
	}
	const HARD_REASON = LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= t.aggro;

	if ((HARD_REASON || TRAPPED_TRAVELLING) && !panicking) {
		set_panic(true, [
			LOW_HEALTH && "low health",
			LOW_MANA && "low mana",
			MONSTERS_TARGETING_ME >= t.aggro && "high aggro",
			TRAPPED_TRAVELLING && `${MONSTERS_TARGETING_ME} on us while travelling`,
		].filter(Boolean).join(", "), false);

		if (HARD_REASON && typeof PANIC_BROADCAST_TARGETS !== "undefined") {
			send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
		}
	}

	if (panicking) panic_equip_hold();

	if (panicking && (Date.now() - last_panic_time > t.cooldown)) {
		last_panic_time = Date.now();
		if (!is_set_equipped("panic")) {
			try {
				const emitted = await equip_apply(panic_equip_hold(), "panic");
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
					await equip_apply(panic_equip_hold(), "orb");
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
	if (typeof CONFIG === "undefined") return;
	if (CONFIG.party.group_members.includes(name)) accept(name);
}

function on_party_request(name) { accept_if_party(name, accept_party_request); }
function on_party_invite(name) { accept_if_party(name, accept_party_invite); }

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT & INVENTORY
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOT_GOLD_RESERVE = 10000000;

let _set_item_names = null;

function equipment_set_item_names() {
	if (_set_item_names) return _set_item_names;
	const found = new Set();
	try {
		for (const name in equipment_sets) {
			for (const entry of equipment_sets[name] || []) {
				if (entry && entry.item_name) found.add(entry.item_name);
			}
		}
	} catch (e) { return found; }
	if (found.size) _set_item_names = found;
	return found;
}

function loose_loot(start) {
	const keep = typeof ITEMS_TO_KEEP !== "undefined" ? ITEMS_TO_KEEP : [];
	const gear = equipment_set_item_names();
	const out = [];
	for (let i = start; i < character.items.length; i++) {
		const item = character.items[i];
		if (!item || item.l || item.s) continue;
		if (keep.includes(item.name) || gear.has(item.name)) continue;
		out.push({ i, item });
	}
	return out;
}

async function send_to_merchant() {
	const merchant = get_player("Riff");
	if (!merchant || merchant.rip) return game_log("❌ Merchant not found or dead");
	if (merchant.map !== character.map || distance(character, merchant) > 400) {
		return game_log("❌ Merchant not nearby");
	}

	for (const { i, item } of loose_loot(LOOT_THRESHOLD)) {
		await delay(150);
		try {
			send_item("Riff", i, item.q || 1);
		} catch (e) {
			game_log(`⚠️ Could not send item in slot ${i}: ${item.name}`);
		}
	}

	const gold_to_send = character.gold - LOOT_GOLD_RESERVE;
	if (gold_to_send > 0) {
		await delay(10);
		try {
			await send_gold("Riff", gold_to_send);
		} catch (e) {
			game_log("⚠️ Could not send gold");
		}
	}
}

function clear_inventory() {
	const mule = get_player("Riff");
	if (!mule || distance(character, mule) >= 250) return;

	if (character.gold > LOOT_GOLD_RESERVE) send_gold(mule, character.gold - LOOT_GOLD_RESERVE);
	for (const { i, item } of loose_loot(0)) send_item(mule.id, i, item.q ?? 1);
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
	for (const { i, item } of loose_loot(0)) {
		if (item.p === undefined && SELLABLE_ITEMS.includes(item.name)) sell(i, item.q || 1);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ANNIVERSARY EVENT — "I Kiss You"
// --------------------------------------------------------------------------------------------------------------------------------- //

var anniversary_travel = false;

const ANNIVERSARY_RANGE = 40;
const ANNIVERSARY_REFRESH_MS = 5 * 60 * 1000;
const ANNIVERSARY_TICK_MS = 2000;
const ANNIVERSARY_TICK_ACTIVE_MS = 400;

let _anniv_died_round = null;
let _anniv_reason = null;

function anniversary_event() {
	try {
		const s = parent.S && parent.S.anniversary;
		if (!s || !s.active || !s.live || !s.id) return null;
		return Date.now() < s.expires ? s : null;
	} catch (e) { return null; }
}

function anniversary_is_host() {
	const s = anniversary_event();
	return !!s && (String(character.id) === String(s.id) || character.name === s.target);
}

function anniversary_block_reason() {
	const s = anniversary_event();
	if (!s) return "no live round";
	if (character.rip) return "dead";
	if (_anniv_died_round === s.round) return "died during this round";
	if (s.available === false) return "host is not taking visitors";
	if (anniversary_is_host()) return "we are the featured player";

	const kiss = character.s && character.s.anniversary_kiss;
	if (kiss && (kiss.ms === undefined || kiss.ms > ANNIVERSARY_REFRESH_MS)) return "already buffed";

	if (character.ctype !== "merchant"
		&& typeof best_event_target === "function" && best_event_target()) {
		return "a boss is up — bossing first";
	}

	const ticket = character.s && character.s.anniversary_visit;
	if (!ticket) return "no ticket issued to us";
	if (!(ticket.ms > 0)) return "ticket already spent";
	if (ticket.round !== s.round) return `ticket is for round ${ticket.round}, live round is ${s.round}`;
	if (Date.now() >= ticket.expires) return "ticket expired";
	if (parent.server_region !== undefined && parent.server_identifier !== undefined) {
		const realm = parent.server_region + " " + parent.server_identifier;
		if (ticket.realm !== realm) return `ticket realm "${ticket.realm}" != "${realm}"`;
	}

	try {
		if (!G.maps[s.map] || !isFinite(s.x) || !isFinite(s.y)) return "no usable destination";
	} catch (e) { return "no usable destination"; }
	return null;
}

function anniversary_should_travel() {
	return anniversary_block_reason() === null;
}

function anniversary_destination() {
	if (!anniversary_travel) return null;
	const s = anniversary_event();
	if (!s) return null;

	const them = get_player(s.target);
	if (!them) return { label: "anniversary", map: s.map, x: s.x, y: s.y, radius: ANNIVERSARY_RANGE };
	return approach(them, {
		label: "anniversary",
		arrive: ANNIVERSARY_RANGE,
		ring: ANNIVERSARY_RANGE * 0.6,
		arrived: { hold: true, label: "anniversary-kiss" },
	});
}

async function anniversary_tick() {
	const s = anniversary_event();
	if (character.rip && anniversary_travel && s) _anniv_died_round = s.round;

	const reason = anniversary_block_reason();
	if (reason !== _anniv_reason) {
		_anniv_reason = reason;
		log(reason ? `🎂 Anniversary: ${reason}.` : `🎂 Anniversary: visiting ${s.target} on ${s.map}.`,
			"#F0B742", "Alerts");
	}
	anniversary_travel = !reason;
	if (!anniversary_travel) return false;

	let ready = true;
	try { ready = !is_on_cooldown("ikissyou"); } catch (e) { /* skill unknown outside the event */ }

	const them = get_player(s.target);
	if (ready && them && distance(character, them) <= ANNIVERSARY_RANGE) {
		Promise.resolve(use_skill("ikissyou", them.id)).catch(
			e => log(`🎂 Anniversary kiss failed: ${fmt_err(e)}`, "#FFA500", "Alerts"));
	}
	return true;
}

async function anniversary_loop() {
	try {
		await anniversary_tick();
	} catch (e) {
		try { catcher(e, "anniversary_loop"); } catch (x) { /* logging must never kill the loop */ }
	}
	setTimeout(anniversary_loop, anniversary_travel ? ANNIVERSARY_TICK_ACTIVE_MS : ANNIVERSARY_TICK_MS);
}
