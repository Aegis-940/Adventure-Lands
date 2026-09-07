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

// main_loop() calls handle_return_home() every 100ms. When the pathfind fails outright — a
// destination on another map it can't route to — smart.moving drops straight back to false and the
// next tick re-issues it, so a single unreachable home becomes a permanent 10/second retry storm
// (visible as endless "smart_move: tunnel 14 -1072" lines). Rate-limit the re-issue; nothing is
// lost, because a move that was going to succeed is still in flight and gated by smart.moving.
const HOME_MOVE_RETRY_MS = 3000;
let _last_home_move = 0;

function handle_return_home() {
	const dx = character.x - destination.x;
	const dy = character.y - destination.y;
	const dist = Math.hypot(dx, dy);
	const home_radius = (CONFIG.movement.circle_radius || 75) + 20;

	if (dist <= home_radius) return;

	if (dist < 200 && character.map === destination.map) {
		// Short drift: raw move() keeps smart.moving false (xmove falls back to smart_move on obstacles)
		if (!character.moving && !smart.moving) move(destination.x, destination.y);
	} else if (!smart.moving && Date.now() - _last_home_move > HOME_MOVE_RETRY_MS) {
		_last_home_move = Date.now();
		fire_and_forget_move(destination); // Shared/Movement.js
	}
}

async function potion_loop() {
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

		if (now.getMinutes() >= RESET_WINDOW_MINUTES) return;
		if (hour % RESET_INTERVAL_HOURS !== 0) return;

		const bucket = `${now.toDateString()}-${hour}`;
		if (_last_reset_bucket === bucket) return;
		_last_reset_bucket = bucket;

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

// Panic owns the orb slot whenever it is panicking or armed. This is an interlock, not a timing
// guess: resolve_equipment() checks its bail once at entry and then awaits a full server round
// trip, and equipment_manager_loop re-enters it every 25ms, so an invocation already in flight
// sails past the bail and emits the loadout's orb straight over the jacko. That is why the panic
// orb usually works and occasionally does not -- it only bites when a loadout equip happens to be
// mid-round-trip as the panic starts, which makes it scale with latency.
function panic_owns_orb() {
	return (typeof panicking !== "undefined" && !!panicking)
		|| (typeof panic_armed !== "undefined" && !!panic_armed);
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
				+ ` (panicking=${typeof panicking !== "undefined" && !!panicking}`
				+ `, armed=${typeof panic_armed !== "undefined" && !!panic_armed})`);
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
	if (panic_armed) return "panic armed"; // ...and while armed, or it swaps the jacko straight back out
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
async function wait_until_equipped(set_name, timeout_ms, interval_ms = 100) {
	// Scaled to the connection rather than fixed. A flat 1000ms times out on a slow round trip
	// while the equip is still in flight, and the caller then acts as though it failed -- which is
	// how scare ends up firing with the old orb still on and getting skill_cant_slot back.
	if (timeout_ms === undefined) {
		const ping = (parent.pings && parent.pings.length) ? Math.max(...parent.pings) : 200;
		timeout_ms = Math.min(3000, Math.max(1000, Math.round(ping * 5)));
	}
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

// Armed = the jacko is already on, waiting. Measured from a real death: once panic fired at 40% the
// healer had 1.4s of life left, and wait_until_equipped() alone polls for up to 1000ms, so the equip
// consumed the budget and scare was attempted three seconds after she was already dead. Arming
// early takes the equip off the critical path; at the panic threshold the orb is on and scare goes
// straight out. Costs luck only while below the arm threshold, which is when luck is not the point.
// TIME TO DEATH. A fixed hp percentage is the wrong trigger when incoming damage varies: 40% is
// generous against one mole and fatal against five. Measured from two real deaths, 40% bought the
// healer 1.4s and 35% bought the warrior 1.2s — less than the panic sequence takes to run.
//
// So trigger on "can I survive the next few seconds at the rate I am actually losing hp", which
// scales itself. Replaying both captured deaths through this fires the panic a second earlier and
// arms the orb two seconds earlier, while staying silent through the calm stretches before them
// (TTD 16-65s there, nowhere near the thresholds).
//
// Observed rate, not projected damage: no modelling of attack stats, courage caps or frequencies to
// get wrong, and it picks up anything that hurts including burn and effects we do not model.
const PANIC_HP_SAMPLE_MS = 200;
const PANIC_HP_SAMPLES = 10;      // ~2s of history
const PANIC_TTD_MIN_MS = 1200;    // too little history to trust a rate

let _hp_history = [];

function sample_hp() {
	const now = Date.now();
	const last = _hp_history[_hp_history.length - 1];
	if (last && now - last.t < PANIC_HP_SAMPLE_MS) return;
	_hp_history.push({ t: now, hp: character.hp });
	while (_hp_history.length > PANIC_HP_SAMPLES) _hp_history.shift();
}

// Seconds until death at the rate observed across the window, or Infinity when not losing hp.
// Whole window rather than the last pair, so one big hit or one heal cannot swing it.
function seconds_to_death() {
	if (_hp_history.length < 2) return Infinity;
	const first = _hp_history[0];
	const last = _hp_history[_hp_history.length - 1];
	const ms = last.t - first.t;
	if (ms < PANIC_TTD_MIN_MS) return Infinity;
	const lost = first.hp - last.hp;
	if (lost <= 0) return Infinity;
	return last.hp / (lost / (ms / 1000));
}

// PROJECTED DPS. The observed rate above is lagging by construction: when the warrior gathers
// eight moles at once, nothing has hit yet, so the measured rate is still low for a second or two —
// exactly the window where reacting matters. Modelling what is already targeting us knows the
// ceiling the instant they aggro, before a single hit lands.
//
// The two are complementary and used as min(): modelling leads, observation catches everything we
// do not model (burn, effects, anything mis-specified in G). Neither can suppress the other.
//
// Deliberately NOT modelled: courage/mcourage/pcourage caps, which change damage taken once you
// are over them. The mechanic is not documented well enough here to get right, and a wrong
// multiplier in a survival trigger is worse than an absent one.
const PANIC_THREAT_RADIUS = 400;   // targeting us and close enough to matter shortly

function _dmg_mult(defense) {
	// Use the client's own curve when it is exposed; the fallback matches the documented
	// "100 defense is roughly 10% reduction" and is only a rough stand-in.
	try {
		if (typeof damage_multiplier === "function") return damage_multiplier(defense);
	} catch (e) { /* not available */ }
	return Math.max(0.2, 1 - Math.min(0.8, Math.max(0, defense) / 1000));
}

// Walks every entity, and panic_check() runs on each 100ms main_loop tick, so the raw version was
// re-scanning the map ten times a second for a number feeding a 3-second threshold. Cached.
let _pdps = { at: 0, value: 0 };

function projected_dps() {
	const now = Date.now();
	if (now - _pdps.at < 250) return _pdps.value;
	_pdps.at = now;
	_pdps.value = _projected_dps_uncached();
	return _pdps.value;
}

function _projected_dps_uncached() {
	let dps = 0;
	try {
		for (const id in parent.entities) {
			const e = parent.entities[id];
			if (!e || e.type !== "monster" || e.dead) continue;
			if (e.target !== character.name) continue;
			if (distance(character, e) > PANIC_THREAT_RADIUS) continue;

			const g = (G.monsters && G.monsters[e.mtype]) || {};
			const magical = g.damage_type === "magical";
			// Entity stats, not G, so per-instance scaling (difficulty, rage) is included.
			const defense = magical
				? Math.max(0, (character.resistance || 0) - (e.rpiercing || 0))
				: Math.max(0, (character.armor || 0) - (e.apiercing || 0));
			dps += (e.attack || 0) * _dmg_mult(defense) * (g.frequency || 1);
		}
	} catch (e) { return 0; }
	return dps;
}

// Seconds until death from what is currently on us, before any of it lands.
function projected_seconds_to_death() {
	const dps = projected_dps();
	if (dps <= 0) return Infinity;
	return character.hp / dps;
}

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
// panicking or armed, resolve_equipment otherwise.
let _orb_owner = { at: 0, value: false };

function loadout_manages_orb() {
	const now = Date.now();
	if (now - _orb_owner.at < 1000) return _orb_owner.value;
	_orb_owner.at = now;
	_orb_owner.value = _loadout_manages_orb_uncached();
	return _orb_owner.value;
}

// resolve() can be expensive -- the warrior's counts nearby mobs -- and the answer only changes
// when the loadout does.
function _loadout_manages_orb_uncached() {
	try {
		const rule = EQUIPMENT_RULES.loadout;
		if (!rule || rule.kind !== "set" || typeof rule.resolve !== "function") return false;
		const resolved = rule.resolve();
		if (!resolved) return false;
		const sets = Array.isArray(resolved) ? resolved : [resolved];
		return sets.some(n => (equipment_sets[n] || []).some(i => i.slot === "orb"));
	} catch (e) { return false; }
}

// How many items the last panic equip_batch actually sent. "never emitted" and "emitted but the
// slot did not change" look identical from the outside otherwise.
let _panic_last_emit = -1;

let panic_armed = false;
let panic_armed_since = 0;
let last_panic_gear = 0;
const PANIC_GEAR_RETRY_MS = 1000;

// Minimum time armed once armed. In combat her hp crosses the 65/80 band constantly, and every
// crossing costs two equip_batch emits (jacko on, loadout back). The orb_equip counter caught it:
// 220 arm equips and 770 loadout restores in 38 minutes, all of it churn.
const PANIC_ARM_MIN_MS = 8000;

async function panic_check() {
	sample_hp(); // before the re-entrancy guard: the rate must keep updating even mid-panic
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

	// PANIC CONDITION
	const observed_ttd = seconds_to_death();
	const modelled_ttd = projected_seconds_to_death();
	const ttd = Math.min(observed_ttd, modelled_ttd);
	const DYING_FAST = ttd < (t.ttd_s ?? 3);

	if (LOW_HEALTH || LOW_MANA || DYING_FAST || MONSTERS_TARGETING_ME >= t.aggro) {
		if (!panicking) {
			panicking = true;
			// Act on this tick, not up to t.cooldown later. The cooldown below exists to throttle
			// REPEATS, but it was also delaying the first response by however long was left on it:
			// panic triggered at 9:11:18 and scare was not attempted until 9:11:20, by which point
			// the healer was dead and the server rejected it as "disabled". Two seconds is a long
			// time below 30% HP.
			last_panic_time = 0;
			if (typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
			}
			let reason = [];
			if (LOW_HEALTH) reason.push("low health");
			if (LOW_MANA) reason.push("low mana");
			if (MONSTERS_TARGETING_ME >= t.aggro) reason.push("high aggro");
			if (DYING_FAST) {
				reason.push(`dying in ${ttd.toFixed(1)}s`
					+ ` (observed ${observed_ttd === Infinity ? "-" : observed_ttd.toFixed(1) + "s"},`
					+ ` projected ${modelled_ttd === Infinity ? "-" : modelled_ttd.toFixed(1) + "s"}`
					+ ` @ ${Math.round(projected_dps())}dps)`);
			}
			log(`⚠️ Panic triggered: ${reason.join(", ")}!`, "#ffcc00", "Alerts");
		}
	}

	// ARM / DISARM. Hysteresis between the two thresholds so a character sitting near the arm point
	// does not flap the orb slot. Never disarms while panicking — the SAFE branch below owns that.
	const hp_pct = character.max_hp ? character.hp / character.max_hp : 1;
	const arm_at = t.arm_hp ?? 0.65;
	const disarm_at = t.disarm_hp ?? 0.80;
	if (!panicking) {
		if (hp_pct < arm_at || ttd < (t.arm_ttd_s ?? 6)) {
			if (!panic_armed) panic_armed_since = Date.now();
			panic_armed = true;
		} else if (hp_pct >= disarm_at && Date.now() - panic_armed_since > PANIC_ARM_MIN_MS) {
			panic_armed = false;
		}
	}

	if (Date.now() - last_panic_gear > PANIC_GEAR_RETRY_MS) {
		if (panic_armed && !panicking && !is_set_equipped("panic")) {
			// Not awaited on purpose: there is no hurry yet, and blocking here would just move the
			// stall earlier. By the time panic fires the orb is on and scare is immediate.
			last_panic_gear = Date.now();
			Promise.resolve(equip_set("panic")).catch(() => {});
		} else if (!panic_armed && !panicking && !loadout_manages_orb()
			&& is_set_equipped("panic") && !is_set_equipped("orb")) {
			last_panic_gear = Date.now();
			Promise.resolve(equip_set("orb")).catch(() => {});
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
	if (HIGH_HEALTH && HIGH_MANA && MONSTERS_TARGETING_ME < t.aggro && panicking && !external_hold) {
		if (Date.now() - last_safe_time > t.cooldown) {
			last_safe_time = Date.now();

			if (!panic_armed && !loadout_manages_orb() && is_set_equipped("panic") && !is_set_equipped("orb")) {
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

// Orbits Myras when close, smart_moves to her when far/on a different map, falling back to
// _healer_last_known when she's off-map and invisible. Reads CONFIG.movement.follow_distance.
function follow_healer() {
	const healer = get_player("Myras");

	if (healer && !healer.rip) {
		_healer_last_known = { map: character.map, x: healer.x, y: healer.y };
	}

	// Ping for fresh location whenever healer is not visible
	if (!healer) {
		const now = Date.now();
		if (now - _last_healer_ping > 2000) {
			_last_healer_ping = now;
			send_cm("Myras", { type: "where_are_you" });
		}
	}

	const healer_pos = healer || _healer_last_known;
	if (!healer_pos || (healer && healer.rip)) return;

	if (healer_pos.map !== character.map) {
		if (smart.moving) smart._interrupt?.("follow_healer");
		if (!smart.moving) fire_and_forget_move({ map: healer_pos.map, x: healer_pos.x, y: healer_pos.y });
		return;
	}

	// Same map but not yet visible — smart_move toward cached position
	if (!healer) {
		if (!smart.moving) fire_and_forget_move({ x: healer_pos.x, y: healer_pos.y });
		return;
	}

	// Healer visible — ring positioning
	const dist = Math.hypot(character.x - healer.x, character.y - healer.y);
	const fd = CONFIG.movement.follow_distance;
	if (Math.abs(dist - fd) <= 3) return;

	// Cancel stale pathfinding if our distance from the ring has shifted significantly
	if (smart.moving) {
		if (Math.abs(dist - fd) > 40) smart._interrupt?.("follow_healer");
		return;
	}

	// Target a point exactly follow_distance units from the healer along our current angle (approach or push-away).
	const angle = Math.atan2(character.y - healer.y, character.x - healer.x);
	const target_x = healer.x + Math.cos(angle) * fd;
	const target_y = healer.y + Math.sin(angle) * fd;

	if (!can_move_to(target_x, target_y)) {
		fire_and_forget_move({ x: target_x, y: target_y });
	} else {
		move(target_x, target_y);
	}
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
			if (level != null && itm.level !== level) continue;

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
			await bank_retrieve(pack_key, slot, -1);
			await delay(100);
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

