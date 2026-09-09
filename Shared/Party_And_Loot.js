// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY & LOOT — party invite/accept management, shared loot/inventory/panic/equipment behaviors
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// GAME EVENT CALLBACKS (event-driven, replaces parent.S polling where possible)
// --------------------------------------------------------------------------------------------------------------------------------- //

// Tracks live game events pushed by the server; scripts check LIVE_EVENTS[name] instead of polling parent.S
const LIVE_EVENTS = {};

on_game_event = function(data) {
	if (!data?.name) return;
	LIVE_EVENTS[data.name] = data;
	log(`[Event] ${data.name} spawned`, "#FF8800");
};

// Fires on AoE damage to co-located characters; movement loops check this flag to trigger spread behavior.
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

function home_radius() {
	return (CONFIG.movement.circle_radius || 75) + 20;
}

// Every map shares one coordinate origin, so a cross-map distance is meaningless — the bank at
// (0,-37) reads as ~100 units from a farm spot on main. The map has to be checked first or a
// character standing on another map can read as "already home".
function is_away_from_home() {
	if (typeof destination === "undefined" || !destination) return false;
	if (destination.map && character.map !== destination.map) return true;
	return Math.hypot(character.x - destination.x, character.y - destination.y) > home_radius();
}

// handle_return_home() lived here. It is gone: going home is now the last entry in
// movement_goal()'s priority list and the arbiter walks it, with the same rate limit every other
// goal gets. Its private HOME_MOVE_RETRY_MS throttle went with it.

async function potion_loop() {
	// Never drink mid-gather. fishing and mining each cost 120mp and channel for 5-15 seconds, so
	// the merchant crosses the 500mp potion threshold about four casts into a run — and using an
	// item cancels the channel. No fishing_*/mining_* event then arrives, so use_skill() waits out
	// its full 20s timeout and reports skill_failed, which ends the whole gathering run. That is
	// the "fishes a couple of times then stops without catching anything" symptom.
	//
	// Scoped to these two channels rather than character.c generally: a fighter must never be
	// stopped from drinking, and only the merchant ever has these.
	if (character.c && (character.c.fishing || character.c.mining)) {
		return setTimeout(potion_loop, 200);
	}

	const HP_MISSING = character.max_hp - character.hp;
	const MP_MISSING = character.max_mp - character.mp;

	let used_potion = false;

	// Potions share a cooldown, so the second use() in a tick is a no-op -- nothing is consumed, it
	// simply does nothing. Which one goes first therefore depends on what the character can do with
	// it, and that is role-specific:
	//
	//   healer   an mp potion (~500mp) funds a heal of ~2900hp, against ~400hp from a health
	//            potion -- roughly 7x more healing off the same cooldown. mp always goes first
	//            while she can cast; a health potion is close to a waste of the cooldown for her.
	//   fighters no mana-to-health conversion, so health first once they are actually hurt.
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
let _reset_due_bucket = null;   // a reset that is owed but has been held back, not skipped
let _suppress_periodic_reset = false;

function set_suppress_reset(val) { _suppress_periodic_reset = val; }

function schedule_periodic_reset() {
	// Boot-seed prevents a reload loop if we come back up inside an active reset window.
	const boot = new Date();
	if (boot.getHours() % RESET_INTERVAL_HOURS === 0 && boot.getMinutes() < RESET_WINDOW_MINUTES) {
		_last_reset_bucket = `${boot.toDateString()}-${boot.getHours()}`;
	}

	setInterval(() => {
		if (_suppress_periodic_reset) return;

		const now = new Date();
		const hour = now.getHours();
		const bucket = `${now.toDateString()}-${hour}`;

		// A reset becomes DUE inside the window and stays due until it actually happens. Previously
		// the window check was also the trigger, so anything that blocked the reload during those
		// two minutes skipped that cycle entirely rather than delaying it.
		if (hour % RESET_INTERVAL_HOURS === 0 && now.getMinutes() < RESET_WINDOW_MINUTES
			&& _last_reset_bucket !== bucket) {
			_reset_due_bucket = bucket;
		}
		if (!_reset_due_bucket || _last_reset_bucket === _reset_due_bucket) return;

		// Never reload out from under a live anniversary visit. Rounds open on the hour and the
		// half hour — the same moment this fires — and a reload mid-trip loses the travel state
		// while the five-minute ticket keeps running, so the round is simply gone. Deferred, not
		// cancelled: the block clears within five minutes at the latest, either by collecting or by
		// the ticket expiring, and the reload then happens on the next tick.
		//
		// Checked directly rather than through set_suppress_reset(), which already has two other
		// owners; a third writer to one boolean is how these clobber each other.
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

// Throttles the missing-item warning below: resolve_equipment() retries every
// swap_cooldown (500ms), so an item that's genuinely gone would otherwise flood the log.
const MISSING_ITEM_WARN_INTERVAL = 30000;
const _missing_item_warned = {};

function warn_missing_item(item_name, level, slot) {
	const key = `${item_name}:${level}:${slot}`;
	const now = Date.now();
	if (now - (_missing_item_warned[key] || 0) < MISSING_ITEM_WARN_INTERVAL) return;
	_missing_item_warned[key] = now;
	game_log(`⚠️ batch_equip: no ${item_name} (lvl ${level}) in inventory for ${slot}`, "#FFA500");
}

// Panic owns the orb slot while it is panicking. This is an interlock, not a timing guess:
// resolve_equipment() checks its bail once at entry and then awaits a full server round trip, and
// equipment_manager_loop re-enters it every 25ms, so an invocation already in flight sails past the
// bail and emits the loadout's orb straight over the jacko. That is why the panic orb usually works
// and occasionally does not -- it only bites when a loadout equip happens to be mid-round-trip as
// the panic starts, which makes it scale with latency.
function panic_owns_orb() {
	return typeof panicking !== "undefined" && !!panicking;
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

		// Drop, do not race. The panic set itself is exempt.
		// Both `panic` (jacko) and `orb` (resting) belong to panic_check, so both are exempt: the
		// SAFE branch restores the resting orb while `panicking` is still true, on purpose. Only
		// loadout sets are locked out.
		if (slot === "orb" && set_name !== "panic" && set_name !== "orb" && panic_owns_orb()) continue;

		// character.slots[slot] IS the item object ({name, level, l, ...} or null) per the
		// game API, not an index into .items -- indexing .items with it would always miss.
		// Matched on name+level only, same as is_set_equipped(), so the two agree.
		const slot_item = parent.character.slots[slot];
		if (slot_item && slot_item.name === item_name && (slot_item.level ?? 0) === (level ?? 0)) continue;

		// Exact pass first (l included): equipment_sets uses l to tell apart two copies of the
		// same item+level destined for different slots, e.g. Warrior's cearring l:"l"/l:"u".
		// Then a loose pass ignoring l, since a stale/guessed l in a set definition would
		// otherwise make the equip silently do nothing forever with no error anywhere.
		let idx = parent.character.items.findIndex((item, j) =>
			item && item.name === item_name && (item.level ?? 0) === (level ?? 0) && item.l === l && !claimed_slots.has(j)
		);
		if (idx === -1) {
			idx = parent.character.items.findIndex((item, j) =>
				item && item.name === item_name && (item.level ?? 0) === (level ?? 0) && !claimed_slots.has(j)
			);
		}

		if (idx === -1) {
			// Last resort: name alone. A stale `level` in a set definition silently disabled the
			// panic orb for hours — the jacko sat in the bag the whole time while both passes above
			// matched on name AND level, and the miss was reported through game_log, which nothing
			// was recording. For a survival-critical swap, equipping a same-named variant beats not
			// equipping at all; the mismatch is reported so the set can be corrected.
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
			// Genuinely absent. Routed through log(..., "Errors") rather than game_log so the
			// recorder actually sees it.
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

// Shared by Warrior/Healer/Ranger — each reads its own file-local `equipment_sets` global at call time.
function is_set_equipped(set_name) {
	const set = equipment_sets[set_name];
	if (!set) return false;

	// Level compared with ?? 0 on both sides: non-upgradable items (jacko) report no `level`
	// at all on character.slots, so a strict === against a set's `level: 0` was never true —
	// which made is_set_equipped("panic") permanently false and blocked the scare below it.
	return set.every(item =>
		character.slots[item.slot]?.name === item.item_name &&
		(character.slots[item.slot]?.level ?? 0) === (item.level ?? 0)
	);
}

async function equip_set(set_name) {
	const set = equipment_sets[set_name];
	if (!set) {
		console.error(`Set "${set_name}" not found.`);
		return;
	}

	// The orb slot is contested and the panic orb has never once stayed on. batch_equip finds the
	// jacko, matches its level, emits one item, gets no rejection — and a second later the slot
	// still reads rabbitsfoot. Either nothing acts on the emit, or something re-equips over it.
	// Recording every requester with the panic state settles which: a `luck requested orb` line
	// carrying panicking=true is resolve_equipment finishing an in-flight call it entered before
	// the bail, and is the whole answer. The recorder dedupes these, so it is a handful of rows.
	try {
		if (set.some(i => i.slot === "orb") && typeof errlog_record === "function") {
			errlog_record("orb_equip", `${set_name} -> orb`
				+ ` (panicking=${typeof panicking !== "undefined" && !!panicking})`);
		}
	} catch (e) { /* recorder absent */ }

	return batch_equip(set, set_name);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIFIED EQUIPMENT RESOLVER — Warrior/Ranger/Healer each declare their own EQUIPMENT_RULES
// (an object of named groups, one gear decision each) and optionally MONSTER_GEAR_OVERRIDES
// (keyed by that character's own farm target, i.e. its `home` var — short-circuits a named
// group to a specific set/sets for that target, generalizing what was previously a one-off
// HEALER_TARGET check). One resolver, one driving loop per character, replacing each file's
// separately-timed equip loop — so there is exactly one writer per character deciding gear,
// instead of several independent loops that can race each other over the same slot.
//
// A group is { kind: "set", resolve } or { kind: "booster", resolve }. resolve() returns
// null/undefined (no opinion this tick), a set name, an array of set names (applied together,
// e.g. Warrior's home-map accessories + weapon), or for a booster group the desired booster
// item name. Orb is deliberately never a group here — panic_check() owns that slot exclusively.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Counter, not a boolean: Warrior has three lock users (status_swap_trick_check in
// action_loop, handle_stomp/handle_cleave in skill_loop) across two concurrently-running
// loops. With a boolean, whichever finished first unlocked while the other was still
// mid-swap. Always pair lock_gear() with unlock_gear() in a finally.
function lock_gear() {
	state.gear_locked = (state.gear_locked || 0) + 1;
}

function unlock_gear() {
	state.gear_locked = Math.max(0, (state.gear_locked || 0) - 1);
}

async function apply_equipment_rule(group, resolved) {
	if (!resolved) return;
	const sets = Array.isArray(resolved) ? resolved : [resolved];

	if (sets.every(s => is_set_equipped(s))) return;

	const now = performance.now();
	const cooldown = CONFIG.equipment.swap_cooldown ?? 500;
	if (!state.equip_cooldowns) state.equip_cooldowns = {};
	if (now - (state.equip_cooldowns[group] || 0) < cooldown) return;
	state.equip_cooldowns[group] = now;

	for (const s of sets) {
		if (resolve_equipment_bail_reason()) return;
		if (!is_set_equipped(s)) await equip_set(s);
	}
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

// Returns null when the resolver may run, otherwise why it may not. Split out so a guard
// that silently blocks gear management forever becomes visible: EQUIPMENT_RULES being
// invisible across the eval boundary did exactly that, and nothing threw to reveal it.
function resolve_equipment_bail_reason() {
	if (typeof EQUIPMENT_RULES === "undefined") return "EQUIPMENT_RULES undefined";
	// Some characters (Ranger) never declared this toggle at all — absent means enabled,
	// same as before this file had one gate. Only an explicit false disables it.
	if (CONFIG.equipment?.auto_swap_sets === false) return "auto_swap_sets disabled";
	if (panicking) return "panicking"; // panic_check() owns gear exclusively while active
	if (state.gear_locked) return "gear_locked"; // e.g. a manual swap-trick sequence mid-flight
	if (character.cc > COOLDOWNS.cc) return "cc above threshold";
	if (typeof should_pause_equipment_resolve === "function" && should_pause_equipment_resolve()) return "special weapon equipped";
	return null;
}

async function resolve_equipment() {
	if (resolve_equipment_bail_reason()) return;

	const overrides = (typeof MONSTER_GEAR_OVERRIDES !== "undefined" && MONSTER_GEAR_OVERRIDES[home]) || {};

	for (const group in EQUIPMENT_RULES) {
		// Re-checked per group: the check above happened before the awaits below, and a panic can
		// begin during any of them.
		if (resolve_equipment_bail_reason()) return;
		const rule = EQUIPMENT_RULES[group];
		const resolved = group in overrides ? overrides[group] : rule.resolve();
		if (rule.kind === "booster") {
			await apply_booster_rule(group, resolved);
		} else {
			await apply_equipment_rule(group, resolved);
		}
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
				accept_party_request(name); // Optional, in case of mutual sending
			}
		});
	} else if (am_member) {
		if (!current_party.includes(PARTY_LEADER)) {
			send_party_request(PARTY_LEADER);
			accept_party_invite(PARTY_LEADER);
		}
	}
}

// Game-engine-invoked callbacks — each file's own CONFIG supplies party.group_members.
// typeof-guarded: these can fire before this character's role file (which declares CONFIG) has
// finished loading; an early no-op is fine since party_manager() keeps retrying every tick.
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

// Keep at least this much gold on hand when a merchant-requested loot pull fires.
// Shared so it stays in sync with each fighter's own clear_inventory() threshold.
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

	// Each fighter file defines its own var ITEMS_TO_KEEP (items it needs on hand and
	// must never auto-send) — fall back to nothing excluded if a file doesn't define one.
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

// Self-triggered counterpart to send_to_merchant() (which fires when Riff requests loot) — runs on
// the fighter's own schedule; reads this file's own ITEMS_TO_KEEP global at call time.
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

// Polls is_set_equipped() instead of trusting a flat delay to guess when the client's own
// state has caught up with an equip request — resolves as soon as it's actually equipped,
// so scare/use_skill can't race gear that isn't on yet, and the common case (equip lands
// fast) doesn't eat a needless fixed wait. Throws on timeout rather than returning false,
// so a caller can't silently ignore a failed equip by forgetting to check the result.
// Timeout is a survival budget, not a patience setting: panic awaits this before it can cast scare,
// so every ms spent here is spent not acting. A death at 14:23:41 waited the full 3000ms and the
// character died one second after it returned. 1000ms is the ceiling.
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

// Ceiling on how long a healer-broadcast panic can hold us before we resume anyway, in case
// her all-clear never arrives (disconnect, dropped CM). Without it a missed message would
// leave a fighter holding fire indefinitely.
const EXTERNAL_PANIC_MAX_MS = 60000;

// Reads this file's own PANIC_THRESHOLDS global. If PANIC_BROADCAST_TARGETS is also defined
// (currently only Healer), panic state changes are broadcast via send_cm to those targets.
// panic_check() is async and every fighter's main_loop() calls it every 100ms WITHOUT awaiting.
// The cooldown below is stamped on entry, but the body outlives it: wait_until_equipped() alone
// polls for up to 1000ms against a 1000ms cooldown. So a second invocation cleared the guard and
// ran concurrently with the first -- both calling equip_set("panic") and racing over the orb slot,
// both casting scare. That is the doubled "Using Scare!" in the same second, the timed-out panic
// orb equip, and the scare rejections. One at a time.
let _panic_check_running = false;

// Latched while a journey is in trouble; cleared on arrival. See the travel-panic block below.
let _travel_panic_latched = false;

// The orb slot had TWO owners. Party_And_Loot's own comment says panic_check() owns it
// exclusively, but the healer's `luck` loadout claims rabbitsfoot and the warrior's
// `dps_accessories` claims orbofstr — so resolve_equipment() re-equipped the loadout every 500ms
// (apply_equipment_rule never returns early, because the set can never be fully equipped while the
// orb holds something else) and panic_check's SAFE branch forced the `orb` set back. They fought
// continuously, the jacko could not stay on, and scare failed with skill_cant_slot.
//
// The ranger is the only one whose loadout does not claim the orb, and the only one whose panic
// has been working. That is the whole asymmetry.
//
// Fix without changing anyone's gear: when the loadout already manages the orb, let it do the
// restoring and do not force the `orb` set on top. One owner at a time — panic_check while
// panicking, resolve_equipment otherwise.
let _orb_owner = { at: 0, value: false };

function loadout_manages_orb() {
	const now = Date.now();
	if (now - _orb_owner.at < 1000) return _orb_owner.value;
	_orb_owner.at = now;
	_orb_owner.value = _loadout_manages_orb_uncached();
	return _orb_owner.value;
}

// resolve() can be expensive -- the warrior's counts nearby mobs -- and the answer only changes
// when the loadout does. Scans EVERY group, not just `loadout`: the orb is now a first-class group
// in its own right, so whichever group claims it, panic_check must defer the restore to it.
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

// Can this set be worn -- every item either already in its slot, or sitting in the bag? Name only;
// level is batch_equip's problem. Lets a resolver fall back instead of asking for something that
// cannot be equipped: the warrior requested orbofstr 5,993 times against 71,170 "not in inventory
// at all" warnings.
//
// The already-equipped half is essential, not a nicety. Equipping moves an item OUT of
// character.items and into character.slots, so a bag-only check reports a set as unavailable the
// moment it is worn -- which made the healer oscillate: rabbitsfoot on, therefore "unavailable",
// therefore fall back to talkingskull, therefore rabbitsfoot back in the bag and available again.
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

// How many items the last panic equip_batch actually sent. "never emitted" and "emitted but the
// slot did not change" look identical from the outside otherwise.
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

// AL rejects with plain objects like {reason, response, place, failed} that have no .message, so
// the old `e.message ? e.message : e` printed "[object Object]" and told us nothing.
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

	// Aggro picked up on the road. An aggressive monster follows across the whole map and there is
	// nothing to kill it with while travelling — combat is disengaged — so it has to be shed with
	// scare or it escorts us to the destination and every other one it wakes on the way.
	// Reuses the panic path rather than duplicating it: the panic set IS the jacko, and scare is
	// unusable without it.
	//
	// LATCHED for the journey rather than tracking aggro tick by tick. A pack loses and re-acquires
	// a target constantly, so an unlatched test stands down on the first quiet tick, swaps the jacko
	// back out, and then the next re-aggro finds can_use("scare") false and has to pay another equip
	// round trip to get it back — during which she is being hit and cannot scare. The healer holds
	// all the aggro by design, so she is the one this happens to. One swap in when the trouble
	// starts, one out on arrival.
	const TRAVEL_AGGRO = t.travel_aggro ?? 1;
	if (!smart.moving) _travel_panic_latched = false;
	else if (MONSTERS_TARGETING_ME >= TRAVEL_AGGRO) _travel_panic_latched = true;
	const TRAPPED_TRAVELLING = _travel_panic_latched;

	// Do not let the pathfinder plan a teleport we cannot finish. The town channel runs 3s and the
	// server cancels it when we are hit, so a character standing in a pack starts the cast, takes a
	// hit, loses it, and repeats — which is how the teleport gets "interrupted endlessly". Once
	// scare has cleared the aggro the next path recompute can use it again. Per-character: each
	// character has its own `smart`.
	// Only meaningful while the town edge is enabled at all — it is not; see SMART_USE_TOWN in
	// Shared/Movement.js. Kept behind that switch rather than deleted so re-enabling is one flag.
	//
	// Written on CHANGE only, and never mid-search. smart.use_town is read inside the BFS at every
	// node expansion, not once when the search starts, so writing it on every 100ms tick mutated
	// the graph underneath a search already in progress — a route could be computed half with town
	// edges available and half without. Deferring to the next search is the point: whatever graph a
	// search began on, it should finish on.
	if (typeof SMART_USE_TOWN !== "undefined" && SMART_USE_TOWN) {
		try {
			const want_town = MONSTERS_TARGETING_ME === 0;
			if (smart.use_town !== want_town && !smart.searching) smart.use_town = want_town;
		} catch (e) { /* runner not up */ }
	}
	const HARD_REASON = LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= t.aggro;

	// PANIC CONDITION
	if (HARD_REASON || TRAPPED_TRAVELLING) {
		if (!panicking) {
			panicking = true;
			// Act on this tick, not up to t.cooldown later. The cooldown below exists to throttle
			// REPEATS, but it was also delaying the first response by however long was left on it:
			// panic triggered at 9:11:18 and scare was not attempted until 9:11:20, by which point
			// the healer was dead and the server rejected it as "disabled". Two seconds is a long
			// time below 30% HP.
			last_panic_time = 0;
			// A travel-only panic does NOT broadcast. One mole latching onto someone walking across
			// a map must not make the rest of the party hold fire where they are; the broadcast is
			// for "the healer is in trouble", not "somebody is being followed".
			if (HARD_REASON && typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
			}
			let reason = [];
			if (LOW_HEALTH) reason.push("low health");
			if (LOW_MANA) reason.push("low mana");
			if (MONSTERS_TARGETING_ME >= t.aggro) reason.push("high aggro");
			if (TRAPPED_TRAVELLING) reason.push(`${MONSTERS_TARGETING_ME} on us while travelling`);
			log(`⚠️ Panic triggered: ${reason.join(", ")}!`, "#ffcc00", "Alerts");
		}
	}

	if (panicking && (Date.now() - last_panic_time > t.cooldown)) {
		last_panic_time = Date.now();
		if (!is_set_equipped("panic")) {
			try {
				const emitted = await equip_set("panic");
				_panic_last_emit = emitted;
				await wait_until_equipped("panic");
			} catch (e) {
				// Say WHY. "still not equipped after 1000ms" on its own cost hours of guessing at
				// whether the jacko was missing, mis-levelled, or just slow to land.
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

		// Deliberately NOT gated on is_set_equipped("panic") any more. That gate has already been
		// observed reading false while the orb was on, which skipped the scare silently and left
		// the whole party holding aggro. can_use() already checks the skill's own requirements, and
		// a genuine rejection is now logged with a real reason rather than swallowed.
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

	// A panic the healer broadcast isn't ours to stand down from — only her all-clear ends it.
	// Bounded so a missed/dropped all-clear can't leave a fighter permanently holding fire.
	let external_hold = typeof panic_external !== "undefined" && panic_external;
	if (external_hold && Date.now() - panic_external_since > EXTERNAL_PANIC_MAX_MS) {
		panic_external = false;
		external_hold = false;
		// Must clear `panicking` too, not just the external flag. The SAFE branch below is
		// gated on HIGH_HEALTH && HIGH_MANA, which a fighter being chewed on by the pack it
		// stopped fighting will never reach — so leaving `panicking` set here kept
		// should_pause_combat_loop() returning true forever and the timeout freed nothing.
		panicking = false;
		log("⚠️ Healer panic hold expired without an all-clear — resuming.", "#FFA500", "Alerts");
	}

	// SAFE CONDITION. Restore the resting orb BEFORE clearing `panicking` — resolve_equipment()'s
	// only guard against racing this restore is `if (panicking) return`, so flipping it early
	// (before the orb swap lands) lets resolve_equipment() fight over the orb slot mid-restore on
	// characters whose other equipment sets also touch orb (e.g. Warrior's dps_accessories).
	// !TRAPPED_TRAVELLING matters as much as the health gates. A healthy character shedding a
	// chaser is HIGH_HEALTH and HIGH_MANA with aggro well under t.aggro, so without it the panic
	// clears on the very next tick, the orb swaps straight back, and the next tick re-triggers —
	// which is the orb churn that drove cc to 77 and got equips silently dropped by the server.
	// Hold the jacko on until the chase is actually over.
	if (HIGH_HEALTH && HIGH_MANA && MONSTERS_TARGETING_ME < t.aggro
		&& !TRAPPED_TRAVELLING && panicking && !external_hold) {
		if (Date.now() - last_safe_time > t.cooldown) {
			last_safe_time = Date.now();

			if (!loadout_manages_orb() && is_set_equipped("panic") && !is_set_equipped("orb")) {
				try {
					await equip_set("orb");
					await wait_until_equipped("orb");
				} catch (e) {
					log(`[PANIC] Failed to equip normal orb: ${fmt_err(e)}`, "#ff4444", "Errors");
				}
			}

			panicking = false;
			if (typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
			}
			log("✅ Panic over.", "#00ff00", "Alerts");
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY-COHERENT MOVEMENT — the fighters walk with MOVEMENT_LEADER (Myras) rather than
// each holding its own farm spot.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Following is scoped to TRAVEL, not to farming. Once she is standing on the spot the fighters
// go back to reposition(), which is what actually aims cleave/5shot at a cluster — orbiting her
// full-time would cost real damage for no coherence gain, since they're already beside her.
const FOLLOW_SLACK = 60; // past the farm radius before she counts as having left; stops branch flapping

let _leader_pos_cache = { at: 0, pos: null };

// Live entity first (exact), then her own state cache (she rewrites it every 100ms and it
// carries map/x/y, so it works across maps with no round trip), then the CM-ping cache.
// read_state_cache() is a synchronous localStorage read and main_loop runs 10x/second, so the
// miss path is memoised — the same reason healer_is_down() caches.
function leader_position() {
	if (character.name === MOVEMENT_LEADER) return null;

	const now = Date.now();
	if (now - _leader_pos_cache.at >= 200) {
		_leader_pos_cache.at = now;
		let snap = null;
		try {
			const c = read_state_cache(MOVEMENT_LEADER); // Shared/Messaging.js
			if (c) snap = { map: c.map, x: c.x, y: c.y, rip: !!c.rip, travelling: !!c.travelling };
		} catch (e) { /* storage unavailable */ }
		_leader_pos_cache.pos = snap;
	}
	const snap = _leader_pos_cache.pos;

	// The live entity wins for coordinates — exact and current — but only her own snapshot knows
	// whether she is on a journey, and that is the flag that gets the fighters moving on time.
	const live = get_player(MOVEMENT_LEADER);
	if (live) {
		return { map: character.map, x: live.x, y: live.y, rip: !!live.rip, travelling: !!(snap && snap.travelling) };
	}
	if (snap) return snap;

	// _healer_last_known only exists on the characters that follow her.
	if (typeof _healer_last_known !== "undefined" && _healer_last_known) {
		return { ..._healer_last_known, rip: false, travelling: false };
	}
	return null;
}

// True when she has left the farm spot — travelling to an event, walking back from a death,
// heading for the anniversary target, or simply relocated by the settings window.
function party_should_follow() {
	if (character.name === MOVEMENT_LEADER) return false;
	if (typeof destination === "undefined" || !destination) return false;

	const pos = leader_position();
	// Unknown (offline/never seen) or dead: there is nothing to walk with, so hold the spot and
	// let the normal chain run. She returns to it herself on respawn.
	if (!pos || pos.rip) return false;

	// Leave WITH her. Waiting for her to clear the farm radius handed her a head start, and the
	// seconds spent closing it are exactly when a fighter gets caught alone on the road.
	if (pos.travelling) return true;

	// Several `locations` entries omit `map` (cgoo, ent) — without this fallback their
	// destination.map is undefined and the comparison below would follow her forever.
	const home_map = destination.map || character.map;
	if (pos.map !== home_map) return true;

	const radius = (CONFIG.movement.circle_radius || 75) + FOLLOW_SLACK;
	return Math.hypot(pos.x - destination.x, pos.y - destination.y) > radius;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LEADER-SIDE COHESION — the leader waits for stragglers.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Following her only closes half the gap. The fighters die on the road because she disengages,
// they fall behind, something aggros them and there is no tank within reach — so she also has to
// stop. This is the half that was missing, and the one that actually prevents the deaths.
const COHESION_RADIUS = 300;   // beyond this (or off-map) a member counts as left behind
const COHESION_RELEASE = 200;  // must close back to here before she moves off again

// Giving up used to be a flat 20s from the start of the hold, which is shorter than a map
// transit: walk to the door, cross, walk back to us. So the one case that most needs her to wait
// — a fighter still on the map behind her — was the case she reliably abandoned. The stall clock
// now resets whenever the straggler is closing, and while off-map their own `travelling` flag
// counts as closing, because their distance to us is not measurable from here.
const COHESION_STALL_MS = 20000;      // no progress for this long — they are stuck, move on
const COHESION_MAX_WAIT_MS = 180000;  // absolute ceiling, however busy they look
const COHESION_PROGRESS_EPS = 30;     // distance that has to close to count as progress

const COHESION_FOLLOWERS = ["Ulric", "Riva"]; // combat only — Riff runs his own errands

// A visit is minutes, not seconds, so this is generous — but finite, which is the point.
const COHESION_ANNIV_MAX_MS = 120000;

let _cohesion_holding = false;
let _cohesion_gave_up = false;
let _cohesion_anniv_since = 0;
let _cohesion_anniv_gave_up = false;
let _cohesion_since = 0;
let _cohesion_progress_at = 0;
let _cohesion_best = { name: null, map: null, dist: Infinity };
let _cohesion_cache = { at: 0, straggler: null, anniv: null, map: null, dist: Infinity, travelling: false };

// True when the leader should stand still this tick. Also stops a journey already in flight —
// declining to re-issue is not enough once smart_move owns the character.
function party_cohesion_hold() {
	if (character.name !== MOVEMENT_LEADER) return false;

	// Running for her life outranks cohesion. Standing in a pack to wait is how she dies, and the
	// fighters are told to hold fire during her panic anyway.
	if (typeof panicking !== "undefined" && panicking) {
		_cohesion_holding = false;
		return false;
	}

	// Nothing to wait for once she is standing on the farm spot. The point of the hold is to stop
	// her walking away from the party, and the local orbit never leaves circle_radius — without
	// this the much longer ceiling below would freeze her circle-walk for minutes at a time.
	if (!is_away_from_home()) {
		if (_cohesion_holding) log("▶️ Home — resuming.", "#00ff00", "Alerts");
		_cohesion_holding = false;
		_cohesion_gave_up = false;
		return false;
	}

	const now = Date.now();
	// Hysteresis: once holding, they have to close well inside the leash before she sets off
	// again, otherwise she stutters forward a step at a time on the boundary.
	const limit = _cohesion_holding ? COHESION_RELEASE : COHESION_RADIUS;

	if (now - _cohesion_cache.at >= 200) {
		_cohesion_cache.at = now;
		_cohesion_cache.straggler = null;
		_cohesion_cache.anniv = null;
		const we_still_owe_a_visit = typeof anniversary_should_travel === "function"
			&& anniversary_should_travel();
		for (const name of COHESION_FOLLOWERS) {
			const s = read_state_cache(name); // Shared/Messaging.js
			// Stale cache means offline; a corpse closes no distance and respawns in town. Neither
			// is something to wait on.
			if (!s || s.rip) continue;
			// Tested for EVERY member, not just the first straggler: the whole point is that this
			// one is true while they are standing next to us.
			//
			// Only once WE are done, though. Everyone being pending is simply what a round in
			// progress looks like, so waiting on it while we still owe the visit ourselves would
			// mean nobody ever sets off — a deadlock, now that cohesion outranks the anniversary.
			// This wait means "do not walk home without them", not "do not start".
			//
			// has_kiss overrides pending. The buff is the objective and comes from the server, so a
			// member who has it is done however confused their own state machine is — which is the
			// difference between "we all have it, leave together" and one stuck flag parking the
			// party for two minutes.
			if (!we_still_owe_a_visit && s.anniv_pending && !s.has_kiss && !_cohesion_cache.anniv) {
				_cohesion_cache.anniv = name;
			}
			if (_cohesion_cache.straggler) continue;
			const off_map = s.map !== character.map;
			// Not measurable across a map boundary — Infinity keeps the distance comparison honest
			// and the map/travelling checks below carry the progress test instead.
			const dist = off_map ? Infinity : Math.hypot(s.x - character.x, s.y - character.y);
			if (!off_map && dist <= limit) continue;
			_cohesion_cache.straggler = name;
			_cohesion_cache.map = s.map;
			_cohesion_cache.dist = dist;
			_cohesion_cache.travelling = !!s.travelling;
		}
	}

	// The anniversary hold, and it deliberately gets NO stall or ceiling clock. Those exist to
	// break a wait on someone who might be stuck; this one is bounded by the game itself — a visit
	// ticket lasts five minutes and anniv_pending goes false the moment it is spent or expires.
	//
	// Without it the round split the party every half hour. She reaches the featured player first,
	// kisses, stands down, and the distance test sees the other two standing right beside her — no
	// straggler, no hold — so she walks home mid-round. They finish, see her travelling, and trail
	// her across the map one at a time, alone, which is the case that gets them killed.
	if (_cohesion_cache.anniv) {
		if (!_cohesion_anniv_since) _cohesion_anniv_since = now;

		// Finite after all. "Bounded by the game's five-minute ticket" was too clever: a member who
		// dies and respawns re-arms anniv_pending every time, and the next round re-arms it again,
		// so the wait chained and the whole party sat parked. Its own timer, kept off the straggler
		// clocks, so neither wait can poison the other.
		if (now - _cohesion_anniv_since <= COHESION_ANNIV_MAX_MS) {
			if (!_cohesion_holding) {
				_cohesion_holding = true;
				_cohesion_gave_up = false;
				log(`⏸️ Waiting out ${_cohesion_cache.anniv}'s anniversary visit.`, "#66ccff", "Alerts");
			}
			// Park the straggler clocks so a long visit is not already counted against a distance
			// hold the instant the round ends and everyone sets off home together.
			_cohesion_since = now;
			_cohesion_progress_at = now;
			if (smart.moving) stop_movement("party_cohesion"); // Shared/Movement.js
			return true;
		}

		if (!_cohesion_anniv_gave_up) {
			_cohesion_anniv_gave_up = true;
			log(`⚠️ ${_cohesion_cache.anniv}'s visit is taking too long — moving on.`, "#FFA500", "Alerts");
		}
		// Fall through and treat them as an ordinary distance straggler from here.
	} else {
		_cohesion_anniv_since = 0;
		_cohesion_anniv_gave_up = false;
	}

	const straggler = _cohesion_cache.straggler;

	if (!straggler) {
		if (_cohesion_holding) log("▶️ Party together — moving on.", "#00ff00", "Alerts");
		_cohesion_holding = false;
		_cohesion_gave_up = false;
		return false;
	}

	if (!_cohesion_holding) {
		_cohesion_holding = true;
		_cohesion_gave_up = false;
		_cohesion_since = now;
		_cohesion_progress_at = now;
		_cohesion_best = { name: null, map: null, dist: Infinity };
		log(`⏸️ Holding for ${straggler}.`, "#66ccff", "Alerts");
	}

	// Progress = a different member, a map change (they made the transition), measurably less
	// distance, or — while we cannot measure them at all — that they are on a journey. Anything
	// that counts restarts the stall clock, so an honest catch-up is never cut short.
	const closing = _cohesion_best.name !== straggler
		|| _cohesion_best.map !== _cohesion_cache.map
		|| _cohesion_cache.dist < _cohesion_best.dist - COHESION_PROGRESS_EPS
		|| _cohesion_cache.travelling;

	if (closing) {
		_cohesion_progress_at = now;
		_cohesion_best = {
			name: straggler,
			map: _cohesion_cache.map,
			dist: Math.min(_cohesion_cache.dist, _cohesion_best.name === straggler ? _cohesion_best.dist : Infinity),
		};
	}

	// Two ways out: they stopped making progress, or they have had long enough regardless. The
	// ceiling matters because a follower whose pathfind is stuck in a retry loop keeps reporting
	// `travelling`, which would otherwise reset the stall clock forever.
	const stalled = now - _cohesion_progress_at > COHESION_STALL_MS;
	const out_of_time = now - _cohesion_since > COHESION_MAX_WAIT_MS;
	if (stalled || out_of_time) {
		if (!_cohesion_gave_up) {
			_cohesion_gave_up = true;
			log(`⚠️ ${straggler} ${stalled ? "stopped closing" : "took too long"} — moving on without them.`, "#FFA500", "Alerts");
		}
		return false;
	}

	if (smart.moving) stop_movement("party_cohesion"); // Shared/Movement.js
	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT GOAL — the one priority list for the three combat characters.
// --------------------------------------------------------------------------------------------------------------------------------- //

// Everything that wants a fighter somewhere appears here, in order, and nothing outside this
// function decides where to go. main_loop hands the winner to travel_arbiter(), which is the only
// code that issues a journey. Adding a behaviour means adding one line here.
function movement_goal() {
	if (!CONFIG.movement.enabled) return null;

	// 1. giantspider: the leader stands still and is guided by hand; the others follow her.
	if (home === "giantspider" && character.name === MOVEMENT_LEADER) return null;

	// 2. The leader waiting for the party. Only ever true on her.
	//
	// The anniversary USED to sit above this, so the one trip that most needs the party together
	// was the one trip with no cohesion at all: three characters pathing independently across the
	// map to the same point, which is exactly where they got separated, lost and stuck.
	if (party_cohesion_hold()) return { hold: true, label: "cohesion" };

	// 3. Walking with the leader. Above events AND above the anniversary: she decides where the
	//    party goes, and this branch is how that decision reaches the followers. They escort her
	//    the whole way and only pursue their own objective once they are standing with her.
	const follow = follow_goal();
	// Anything but station-keeping wins outright — we are still closing on her, or holding for her.
	if (follow && follow.local !== "follow") return follow;

	// 4. The anniversary visit, for the leader and for a follower already on station. Every
	//    character still has to close the last stretch and cast for themselves — following her only
	//    gets them to within follow_distance, and the skill needs 80.
	const anniv = anniversary_destination();
	if (anniv) return anniv;

	// 5. Events. Reached by the leader, by anyone whose leader is dead or offline, and by a
	//    follower already standing with her — see below.
	const event = event_goal(); // Shared/Combat_Utilities.js

	// A follower ON STATION does not need the ring step when there is a fight to close into.
	// Being with her is already satisfied at that point, and orbiting at follow_distance leaves a
	// melee character short of a boss she is healing from her own, much longer, range. Only for a
	// monster already visible: a travel goal here would be them setting off on their own again,
	// which is the split this ordering exists to prevent.
	//
	// on_station, not merely "walking rather than pathfinding" — a straight-line follow now covers
	// the whole distance, so without this a follower still 600 units behind would break off toward
	// a visible boss instead of closing on her first.
	if (follow && follow.on_station && event && event.local === "event") return event;
	if (follow) return follow;
	if (event) return event;

	// 6. The bscorpion farm has its own approach geometry.
	if (home === "bscorpion") {
		return is_at_bscorpion_farm() // Shared/Movement.js
			? null
			: { label: "bscorpion", map: PRIM_FARM_LOC.map, x: PRIM_FARM_LOC.x, y: PRIM_FARM_LOC.y, radius: PRIM_FARM_RADIUS };
	}

	// 7. Back to the farm spot. Distance first, monsters second: standing outside the radius means
	//    walking back regardless of what happens to be on screen from here.
	if (is_away_from_home()) {
		return {
			label: "home",
			map: destination.map || character.map,
			x: destination.x,
			y: destination.y,
			radius: home_radius(),
		};
	}

	return null; // where we should be — the caller's local movement takes over
}

// Runs the local behaviour a goal asked for. Everything in here is a raw move()/xmove() that
// starts no pathfind, so none of it can compete with the arbiter for `smart`.
function movement_local(goal, farm_step) {
	if (goal && goal.local === "follow") return follow_step();
	if (goal && goal.local === "event") return event_step(goal.event); // Shared/Combat_Utilities.js
	if (goal && goal.local === "anniversary") return anniversary_close_step();
	// Farm movement must NEVER run while committed to a visit. The arbiter releases the moment we
	// reach the goal coordinates, and if the target has walked off, those coordinates are an empty
	// patch of town — wandering back into the farm orbit from there is how the round was lost after
	// actually arriving. Belt and braces alongside the holds in anniversary_destination().
	if (typeof anniversary_travel !== "undefined" && anniversary_travel) return;
	if (typeof farm_step === "function") farm_step();
}

// Inside this we count as keeping station on her, which is what lets a visible event monster take
// priority over the ring step. It is NOT the walk/pathfind boundary — line of sight is.
const FOLLOW_STATION_RANGE = 220;

// Where we want to stand: exactly follow_distance from her along our current bearing, whether we
// are closing on her or being crowded off.
function follow_ring_point(pos) {
	const fd = CONFIG.movement.follow_distance;
	const angle = Math.atan2(character.y - pos.y, character.x - pos.x);
	return { x: pos.x + Math.cos(angle) * fd, y: pos.y + Math.sin(angle) * fd };
}

// Returns a goal or null; issues nothing.
function follow_goal() {
	if (character.name === MOVEMENT_LEADER) return null; // she does not follow herself
	// giantspider follows her permanently — she leads the instance run and there is no farm spot
	// to hold. Otherwise only while she is off it.
	if (home !== "giantspider" && !party_should_follow()) return null;

	const pos = leader_position();
	if (!pos) {
		// Cannot place her at all. Ping and stand still rather than walk off somewhere arbitrary.
		const now = Date.now();
		if (now - _last_healer_ping > 2000) {
			_last_healer_ping = now;
			send_cm(MOVEMENT_LEADER, { type: "where_are_you" });
		}
		return { hold: true, label: "follow-lost" };
	}

	// A different map is always a pathfind: there is no straight line through a door.
	if (pos.map !== character.map) {
		return { label: "follow", map: pos.map, x: pos.x, y: pos.y, radius: 80 };
	}

	// STRAIGHT LINE FIRST, pathfinder only when geometry genuinely blocks it.
	//
	// This used to switch on distance alone — anything past 220 units got a smart_move. That made
	// the ordinary case (same map, open ground, a few hundred units apart) pay for a BFS on a
	// 40ms-per-80ms budget, re-planned every time she moved, when a raw move() would have walked
	// straight to her. It was both the slowest path and the one most likely to stall, for a
	// journey that needed no planning at all.
	//
	// Re-tested every tick, so a walk that runs into geometry falls through to the pathfinder on
	// the next tick, and a pathfind that clears the obstacle drops back to walking.
	const ring = follow_ring_point(pos);
	if (can_move_to(ring.x, ring.y)) {
		const d = Math.hypot(character.x - pos.x, character.y - pos.y);
		return { local: "follow", label: "follow-ring", on_station: d <= FOLLOW_STATION_RANGE };
	}

	return { label: "follow", map: pos.map, x: pos.x, y: pos.y, radius: CONFIG.movement.follow_distance + 30 };
}

// The LOCAL half: one raw move() onto the follow ring. Starts no pathfind, so it is safe to run
// every tick — and re-aiming at her every tick is what makes a straight-line follow track a moving
// leader better than a planned route to where she used to be.
function follow_step() {
	// leader_position(), not get_player(). The entity is only available inside render range, so
	// keying on it meant a leader on our own map but off-screen produced no movement at all — a
	// non-issue while this only ran at close quarters, a stall now that it does the whole walk.
	const pos = leader_position();
	if (!pos || pos.rip || pos.map !== character.map) return;

	const live = get_player(MOVEMENT_LEADER);
	if (live && !live.rip) _healer_last_known = { map: character.map, x: live.x, y: live.y };

	// CLOSE THE GAP ONLY — never back away to restore an exact spacing.
	//
	// This used to hold follow_distance in both directions, so every time she walked toward a
	// follower it reversed to re-open the gap. That is the visible doubling back: two characters
	// shuffling against each other, neither making progress, and the move() budget spent on it.
	// Being closer than follow_distance costs nothing. Falling behind is the entire problem.
	const dist = Math.hypot(character.x - pos.x, character.y - pos.y);
	if (dist <= CONFIG.movement.follow_distance) return;

	// follow_goal() already proved the line is clear this tick; re-checked because the cost is
	// nothing and walking into geometry is not recoverable from down here. If it has closed, the
	// goal falls through to the pathfinder on the next tick.
	const ring = follow_ring_point(pos);
	if (can_move_to(ring.x, ring.y)) move(ring.x, ring.y);
}


// Reads this file's own `item_order` global. A plain number reserves one slot for that item; an array
// reserves one slot per intentionally-kept duplicate (Warrior uses this for a dual-wielded weapon) —
// extra copies beyond the reserved slots are left wherever they land.
function inventory_sorter() {
	const claimed = {}; // item name -> how many of its reserved slots are already assigned this pass

	character.items.forEach((item, i) => {
		if (!item) return;
		const spec = item_order[item.name];
		if (spec === undefined) return;

		if (Array.isArray(spec)) {
			const next = claimed[item.name] || 0;
			if (next >= spec.length) return; // no reserved slot left for extra copies
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

// character.bank is only populated while standing at the bank, and everything that reads the bank
// away from it falls back to the localStorage snapshot. That snapshot goes stale the instant
// anything moves in or out, which is what sent the merchant back to the bank for an item that was
// no longer there. Re-save it after every withdrawal and deposit, while the live data is in hand.
// Quiet on purpose: save_bank_local() logs on every call and this fires per item.
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

	// 1) Grab live bank data
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

	// 2) Iterate each "items<N>" pack
	for (const pack_key of Object.keys(bank_data)) {
		if (!pack_key.startsWith("items")) continue;
		const slot_arr = bank_data[pack_key];
		if (!Array.isArray(slot_arr)) continue;

		// 3) Scan slots in this pack
		for (let slot = 0; slot < slot_arr.length && remaining > 0; slot++) {
			const itm = slot_arr[slot];
			if (!itm || itm.name !== item_name) continue;
			// An unupgraded item carries no `level` property at all, so a raw `itm.level !== 0`
			// rejected every unlevelled item whenever level 0 was asked for — a ukey could be seen
			// in the bank by callers that normalise, and then never withdrawn by this one.
			// Absent means +0, which is what the rest of the codebase assumes.
			if (level != null && (itm.level || 0) !== level) continue;

			found_any = true;

			// Determine which bank location to move to based on pack_key
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

			// bank_retrieve always pulls the ENTIRE stack from a slot — no partial-quantity retrieval.
			// Must not loop this per-unit; that emptied the slot on the first call while still
			// decrementing `remaining` per call, under-counting what actually arrived.
			//
			// Guarded: bank_data may be the localStorage snapshot rather than live data, so a slot
			// it lists can be empty or hold something else by now and bank_retrieve rejects with
			// no_item. Skip that slot and keep going — other slots may still hold the item — rather
			// than letting one stale entry abort the whole withdrawal.
			try {
				await bank_retrieve(pack_key, slot, -1);
			} catch (e) {
				game_log(`⚠️ withdraw_item: ${item_name} not in ${pack_key} slot ${slot} `
					+ `(${(e && (e.reason || e.message)) || e})`, "#FFA500");
				continue;
			}
			await delay(100);
			refresh_bank_snapshot();   // live data is in hand right now; take a fresh copy
			remaining -= (itm.q || 1);
		}

		if (remaining <= 0) break;
	}

	// 4) Summarize
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
//
// Every 30 minutes the server features one player. Everyone online gets an `anniversary_visit`
// ticket good for 5 minutes and one use; spending it on the featured player yields a cake slice, an
// Anniversary Gift, and `anniversary_kiss` (+10 frequency, +6 output, 20 minutes).
//
// The skill has range 80, so this is a travel behaviour, not a cast. Field shapes and the client's
// own validity test are in GAME_API_REFERENCE.md — read out of the live client, none of it guessed.
//
// Every character travels independently and starts the moment a round goes live. The combat three
// disengage while travelling: no attacks, no offensive skills, no debuffs. Healing and defensive
// behaviour continue, because the walk is exactly when something can go wrong.
// --------------------------------------------------------------------------------------------------------------------------------- //

// var, not const: read as a bare global by should_pause_combat_loop() and by each character's
// main_loop across the eval boundary.
var anniversary_travel = false;

const ANNIVERSARY_TICK_MS = 2000;
const ANNIVERSARY_RANGE = 65;        // skill range is 80; margin for them moving as we arrive
// Gap between kiss attempts. Long enough that a normal reply lands before a second cast can go out
// (a second cast at a spent visit is what the server answers with "exception"), short enough to
// retry promptly while still closing the last few units of distance.
const ANNIVERSARY_KISS_RETRY_MS = 2500;
// Grace after the server acknowledges a cast, before we are willing to cast again.
const ANNIVERSARY_ACK_GRACE_MS = 6000;
// How close to the last-known spot counts as "we are where they were" when they are not in sight.
const ANNIVERSARY_SEEK_RADIUS = 30;

// The re-issue cadences, the drift threshold and the in-flight move identity that used to live
// here are gone: this module no longer moves anything. It decides, anniversary_destination()
// reports where, and the travel arbiter owns the journey along with every other goal.

let _anniv_last_kiss = 0;
let _anniv_kiss_acked = 0;
let _anniv_host_round = null;   // so the host notice prints once per round, not every tick
let _anniv_travel_since = 0;
let _anniv_died_round = null;   // round we died in; that round's visit is written off

// anniversary_travel gates combat for ALL FOUR characters — should_pause_combat_loop() plus every
// main_loop's movement branch. Nothing else can clear it, so if it is ever left set the whole party
// disengages and does not recover without a manual reload. A ticket lasts 5 minutes and a round 30,
// so travel lasting longer than this is impossible by the game's own rules and can only mean we are
// stuck. The ceiling is enforced in the loop, outside the step's own error handling, so it still
// fires when the step throws every tick.
const ANNIVERSARY_TRAVEL_MAX_MS = 6 * 60 * 1000;
let _anniv_done_round = null;   // round we already collected in; scoped per round, not global
let _anniv_had_buff = false;    // whether anniversary_kiss was already up when this trip started

// Mirrors the client's own anniversary_live_event().
function anniversary_event() {
	try {
		const s = parent.S && parent.S.anniversary;
		if (!s || !s.active || !s.live || !s.id) return null;
		return Date.now() < s.expires ? s : null;
	} catch (e) { return null; }
}

// The client's anniversary_can_visit(), split into its individual checks. Returns null when the
// ticket is usable, otherwise which one failed.
//
// As a single boolean these were indistinguishable, and they mean completely different things: a
// ticket the server never issued (nothing we can do about it) read identically to a realm string we
// are comparing wrongly (entirely our own bug, and one that would silently disable every visit
// forever). The realm comparison is still skipped when those globals are unreachable rather than
// guessed at, for the same reason.
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

// One of ours can be the featured player. ikissyou is no_self, so the host must never try to visit
// themselves — there is nowhere to walk to and every cast would reject. They carry on as normal and
// let the other three come to them. Same test the client uses to decide it is showing the host view:
// id OR name, because only one of the two is reliable depending on how the round was announced.
function anniversary_is_host() {
	try {
		const s = anniversary_event();
		if (!s) return false;
		return String(character.id) === String(s.id) || character.name === s.target;
	} catch (e) { return false; }
}

// Returns null when we should be committed to this round, otherwise WHY not — a string rather than
// a boolean so a stand-down names which of six quite different things happened. "The round ended"
// and "our five-minute ticket ran out while we walked" want opposite responses and were being
// logged identically as "done, resuming".
//
// Note what is deliberately NOT a block: s.available === false. The client is explicit that it
// means "waiting for them to return to a reachable spot; their place is reserved; the five-minute
// timer keeps running" — a pause, not a cancellation. Treating it as a block abandoned the trip,
// re-engaged combat, and restarted from wherever we happened to be standing once they reappeared,
// spending the ticket a slice at a time and often never arriving.
function anniversary_block_reason() {
	const s = anniversary_event();
	if (!s) return "no live round";
	// A corpse owes nobody a visit. This is what anniversary_should_travel() — and therefore the
	// anniv_pending flag the leader's cohesion hold waits on — is derived from, so leaving it out
	// let a dead character hold the party still.
	if (character.rip) return "dead";
	if (_anniv_died_round === s.round) return "died during this round";
	if (anniversary_is_host()) return "we are the featured player";
	// Scoped to the round number rather than testing for the buff: anniversary_kiss lasts 20
	// minutes against a 30 minute cycle, so a bare buff check would sometimes still be true when
	// the next round opened and would skip it.
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

// Clearing the flag is all this has to do now. anniversary_destination() goes null on the next
// tick, movement_goal() picks whatever should happen instead, and the arbiter releases the journey
// it owns. The identity-tracked interrupt that used to live here existed only to avoid cancelling
// somebody else's move — with one owner there is no somebody else.
function anniversary_stand_down(why) {
	anniversary_travel = false;
	_anniv_travel_since = 0;
	// Recorded, not just logged: "the party stopped and I had to reload" needs to be answerable
	// after the fact, and log() only reaches the in-game window.
	try {
		if (typeof errlog_record === "function") errlog_record("anniversary", "stand down: " + why);
	} catch (e) { /* recorder absent */ }
	log(`🎂 Anniversary: ${why}.`, "#F0B742", "Alerts");
}

// One iteration of the visit's DECISIONS: whether a round is ours to join, whether the buff has
// landed, and casting the kiss. It moves nothing — anniversary_destination() reports where the
// visit wants to be and the arbiter takes it from there. The merchant drives this from his own
// state machine rather than running a second loop.
async function anniversary_tick() {
	// Say it once per round rather than every tick: a host that silently does nothing looks
	// identical to the behaviour being broken.
	const ev = anniversary_event();
	if (ev && anniversary_is_host() && _anniv_host_round !== ev.round) {
		_anniv_host_round = ev.round;
		log(`🎂 Anniversary: WE are the featured player (${character.name}) — staying put for visitors.`, "#F0B742", "Alerts");
	}

	// Dying during a visit forfeits that round, checked before anything else so the round number is
	// still to hand.
	//
	// Without this the corpse kept claiming the visit: anniversary_travel stayed set, the state
	// cache kept publishing anniv_pending, and the moment the character respawned in town the
	// leader's anniversary hold latched onto them again while they walked back across the map
	// alone with combat disabled — which is how one death during a round parked the whole party.
	// The buff is not worth a corpse run, and there is another round in thirty minutes.
	if (character.rip) {
		if (anniversary_travel) {
			if (ev) _anniv_died_round = ev.round;
			anniversary_stand_down("died during the visit — sitting this round out");
		}
		return false;
	}

	// Names the actual cause rather than a generic "done, resuming", which covered six of them and
	// so said nothing about which one kept costing us the round.
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
		// Snapshot the buff now: it runs 20 minutes, so it can still be up from the previous round
		// when this one opens. Only a buff that appears DURING the trip means we just collected.
		_anniv_had_buff = !!(character.s && character.s.anniversary_kiss);
		log(`🎂 Anniversary: visiting ${s.target} on ${s.map}.`, "#F0B742", "Alerts");
	}

	// The buff landing IS the reward arriving, and it beats waiting for the ticket to clear
	// server-side by a full round trip. Stand down the moment it shows up.
	if (!_anniv_had_buff && character.s && character.s.anniversary_kiss) {
		_anniv_done_round = s.round;
		anniversary_stand_down("buff received, back to work");
		return false;
	}

	// Reserved but temporarily unreachable. Hold position and stay committed — combat stays
	// disengaged and the trip is NOT abandoned, because their slot is still ours and the round
	// timer keeps running. Standing down here and restarting when they reappeared is what spent the
	// five-minute ticket in pieces without ever arriving.
	if (s.available === false) return true;

	// Prefer the live entity when we can see them — S.x/S.y is a periodic snapshot and they move.
	const them = get_player(s.target);

	// The KISS requires the live entity; the MOVE below is happy to aim at the snapshot. Being
	// within range of where they WERE is not being within range of them, and casting on the
	// snapshot is what completed rounds from across the map. If we cannot see them we are not close
	// enough, whatever the coordinates say — and at range 80 they would be on screen if we were.
	const in_kiss_range = !!them && distance(character, them) <= ANNIVERSARY_RANGE;

	// A cast the server acknowledged but whose effect has not shown up yet. Casting again into that
	// window is what the server answers with game_response "exception" — the bare red ERROR! — so
	// hold off and let the buff or the spent ticket confirm it. If neither does, the cast genuinely
	// did not take and the window expires into a normal retry.
	const awaiting_ack = _anniv_kiss_acked > 0 && Date.now() - _anniv_kiss_acked < ANNIVERSARY_ACK_GRACE_MS;

	if (in_kiss_range && !awaiting_ack && Date.now() - _anniv_last_kiss > ANNIVERSARY_KISS_RETRY_MS) {
		// Throttle, not a one-shot: a cast that is simply out of range has to be retried, and this
		// expires, so a reply that never arrives cannot wedge the round.
		_anniv_last_kiss = Date.now();

		// NOT awaited. use_skill() settles on the server's reply and anniversary_loop() awaits this
		// function, so a reply that never came would stop the loop, strand anniversary_travel at
		// true, and leave all four characters disengaged until a manual reload.
		Promise.resolve(use_skill("ikissyou", s.id)).then(
			() => {
				// Trust the game state, not the reply. use_skill() settles on the server's
				// response and a response is not proof the visit was granted — standing down on
				// the resolve alone is the "attempted, then treated as complete" symptom, and it
				// costs the whole round because _anniv_done_round blocks every retry.
				_anniv_kiss_acked = Date.now();
				const got_buff = !!(character.s && character.s.anniversary_kiss);
				const ticket_spent = !(character.s && character.s.anniversary_visit
					&& character.s.anniversary_visit.ms > 0);
				if (got_buff || ticket_spent) {
					_anniv_done_round = s.round;
					log(`🎂 Kissed ${s.target}.`, "#F0B742", "Alerts");
					anniversary_stand_down("collected, back to work");
				}
				// Otherwise: say nothing and keep closing. The buff check at the top of this
				// function and the ticket check in anniversary_block_reason() both end the trip
				// properly the moment it is genuinely done.
			},
			e => {
				_anniv_kiss_acked = 0; // rejected outright — resume the normal retry cadence
				log(`🎂 Anniversary kiss failed: ${fmt_err(e)}`, "#FFA500", "Alerts");
			}
		);

		return true;   // keep closing in; a failed cast must not end the trip
	}

	return true;
}

// Where the visit wants the character to be, for movement_goal() to weigh against everything else.
// Pure: no moves, no state changes — it is read on every 100ms main_loop tick, while the decisions
// above run on anniversary_loop's 2s beat.
function anniversary_destination() {
	if (!anniversary_travel) return null;
	const s = anniversary_event();
	if (!s) return null;

	// THE LIVE ENTITY IS AUTHORITATIVE. The objective is proximity to a PERSON, and the arbiter can
	// only judge arrival at COORDINATES — so aiming at the S snapshot let it declare success at an
	// empty patch of town the target had already walked away from. It then released, farm movement
	// took over, and the character stood there until the ticket expired and walked home. That is
	// "made it to town, never got the kiss, then just left".
	const them = get_player(s.target);

	if (them) {
		if (distance(character, them) <= ANNIVERSARY_RANGE) {
			// Hold, so nothing wanders us back out of range between the 2s ticks that do the casting.
			return { hold: true, label: "anniversary-kiss" };
		}
		// Straight line first, pathfinder only when geometry blocks it — the same rule as following,
		// and for the same reason: this is a short hop to someone in sight, not a route to plan.
		const spot = anniversary_close_point(them);
		if (can_move_to(spot.x, spot.y)) return { local: "anniversary", label: "anniversary-close" };
		return { label: "anniversary", map: them.map || s.map, x: them.x, y: them.y, radius: ANNIVERSARY_RANGE - 15 };
	}

	// Not visible. Walk to the snapshot — but once there, HOLD rather than hand back to farm
	// movement. Standing where they were last seen is the best play: they are reserved to us, the
	// round timer is still running, and they may well walk back into range.
	const at_snapshot = character.map === s.map
		&& isFinite(s.x) && isFinite(s.y)
		&& Math.hypot(character.x - s.x, character.y - s.y) <= ANNIVERSARY_SEEK_RADIUS;

	if (at_snapshot || !(isFinite(s.x) && isFinite(s.y))) {
		return { hold: true, label: s.available === false ? "anniversary-wait" : "anniversary-seek" };
	}
	return { label: "anniversary", map: s.map, x: s.x, y: s.y, radius: ANNIVERSARY_SEEK_RADIUS };
}

// Aim well inside range rather than at its edge, so a step or two from either of us does not put
// us straight back out of it.
function anniversary_close_point(them) {
	const want = ANNIVERSARY_RANGE * 0.5;
	const angle = Math.atan2(character.y - them.y, character.x - them.x);
	return { x: them.x + Math.cos(angle) * want, y: them.y + Math.sin(angle) * want };
}

// The LOCAL half: one raw move() toward a target we can already see. No pathfind.
function anniversary_close_step() {
	const s = anniversary_event();
	if (!s) return;
	const them = get_player(s.target);
	if (!them) return; // nothing in sight — standing still beats farm-walking out of the area
	if (distance(character, them) <= ANNIVERSARY_RANGE) return;
	const spot = anniversary_close_point(them);
	if (can_move_to(spot.x, spot.y)) move(spot.x, spot.y);
}

// The watchdog runs on its OWN timer, deliberately not inside anniversary_loop(). The loop awaits
// anniversary_step(), so anything that blocks in there — a use_skill whose reply never arrives —
// stops the loop entirely, and a watchdog living inside it would be stopped at precisely the moment
// it was needed. setInterval keeps firing regardless of what the loop is doing.
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
		// catcher() has itself been the thing that killed a loop before now — a missing comma made
		// it undefined and the catch block threw, taking action_loop with it. Nothing in here is
		// allowed to prevent the reschedule below.
		try { catcher(e, "anniversary_loop"); } catch (x) { /* logging must never kill the loop */ }
	}
	setTimeout(anniversary_loop, ANNIVERSARY_TICK_MS);
}
