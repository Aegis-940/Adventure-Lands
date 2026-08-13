// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY & LOOT — party invite/accept management, shared loot/inventory/panic/equipment behaviors
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// GAME EVENT CALLBACKS (event-driven, replaces parent.S polling where possible)
// --------------------------------------------------------------------------------------------------------------------------------- //

// Tracks live game events pushed by the server (boss spawns, special mobs, etc.)
// Character scripts can check LIVE_EVENTS[name] instead of polling parent.S
const LIVE_EVENTS = {};

on_game_event = function(data) {
	if (!data?.name) return;
	LIVE_EVENTS[data.name] = data;
	log(`[Event] ${data.name} spawned`, "#FF8800");
};

// Fires when monsters deal AoE damage to co-located characters.
// Sets a flag that movement loops can check to trigger spread behavior.
let combined_damage_flag = false;
let combined_damage_time = 0;

on_combined_damage = function() {
	combined_damage_flag = true;
	combined_damage_time = Date.now();
};

function should_spread() {
	if (!combined_damage_flag) return false;
	// Auto-clear after 2 seconds
	if (Date.now() - combined_damage_time > 2000) {
		combined_damage_flag = false;
		return false;
	}
	return true;
}

function handle_return_home() {
	const dx = character.x - destination.x;
	const dy = character.y - destination.y;
	const dist = Math.hypot(dx, dy);
	const home_radius = (CONFIG.movement.circle_radius || 75) + 20;

	if (dist <= home_radius) return;

	if (dist < 200 && character.map === destination.map) {
		// Short drift: raw move() keeps smart.moving false (xmove falls back to smart_move on obstacles)
		if (!character.moving && !smart.moving) move(destination.x, destination.y);
	} else if (!smart.moving) {
		smart_move(destination);
	}
}

async function potion_loop() {
	const HP_MISSING = character.max_hp - character.hp;
	const MP_MISSING = character.max_mp - character.mp;

	let used_potion = false;

	// Use MP potion if needed
	if (MP_MISSING >= CONFIG.potions.mp_threshold) {
		use("mp");
		used_potion = true;
	}

	// Use HP potion if needed
	if (HP_MISSING >= CONFIG.potions.hp_threshold) {
		use("hp");
		used_potion = true;
	}

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
	// Module-level state is per-iframe/tab, so each character decides
	// independently. Boot-seed prevents a reload loop if we come back up
	// inside an active reset window.
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

async function batch_equip(data) {
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

		let found = false;
		if (parent.character.slots[slot]) {
			let slot_item = parent.character.items[parent.character.slots[slot]];
			if (slot_item && slot_item.name === item_name && slot_item.level === level && slot_item.l === l) {
				found = true;
			}
		}

		if (found) continue;

		for (let j = 0; j < parent.character.items.length; j++) {
			const item = parent.character.items[j];
			if (item && item.name === item_name && item.level === level && item.l === l && !claimed_slots.has(j)) {
				valid_items.push({ num: j, slot: slot });
				claimed_slots.add(j);
				break;
			}
		}
	}

	if (valid_items.length === 0) return;

	try {
		parent.socket.emit("equip_batch", valid_items);
		await parent.push_deferred("equip_batch");
	} catch (error) {
		console.error("batch_equip error:", error);
		return Promise.reject({ reason: "invalid", message: "Failed to equip" });
	}
}

// Shared by Warrior/Healer/Ranger (was duplicated identically across all three) — each
// reads its own file-local `equipment_sets` global at call time, same as CONFIG/HOME/etc.
function is_set_equipped(set_name) {
	const set = equipment_sets[set_name];
	if (!set) return false;

	return set.every(item =>
		character.slots[item.slot]?.name === item.item_name &&
		character.slots[item.slot]?.level === item.level
	);
}

async function equip_set(set_name) {
	const set = equipment_sets[set_name];
	if (!set) {
		console.error(`Set "${set_name}" not found.`);
		return;
	}
	return batch_equip(set);
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT & INVENTORY
// --------------------------------------------------------------------------------------------------------------------------------- //

// Keep at least this much gold on hand when a merchant-requested loot pull fires.
// Shared so it stays in sync with each fighter's own clear_inventory() threshold.
const LOOT_GOLD_RESERVE = 10000000;

async function send_to_merchant() {
	const merchant_name = "Riff";          // e.g., "Riff"
	const merchant = get_player(merchant_name);   // use get_player for live info

	if (!merchant || merchant.rip) {
		return game_log("❌ Merchant not found or dead");
	}
	if (merchant.map !== character.map || distance(character, merchant) > 400) {
		return game_log("❌ Merchant not nearby");
	}

	// Each fighter file defines its own var ITEMS_TO_KEEP (items it needs on hand and
	// must never auto-send) — fall back to nothing excluded if a file doesn't define one.
	const items_to_keep = typeof ITEMS_TO_KEEP !== "undefined" ? ITEMS_TO_KEEP : [];

	// Send every unlocked, non-reserved item in slots ≥ LOOT_THRESHOLD
	for (let i = LOOT_THRESHOLD; i < character.items.length; i++) {
		const item = character.items[i];
		if (item && !item.l && !items_to_keep.includes(item.name)) { // Skip locked/reserved items
			await delay(150);
			try {
				send_item(merchant_name, i, item.q || 1);
			} catch (e) {
				game_log(`⚠️ Could not send item in slot ${i}: ${item.name}`);
			}
		}
	}

	// Send gold above the reserve
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

// Shared by Warrior/Healer/Ranger (was duplicated identically across all three) — each
// reads its own file-local ITEMS_TO_KEEP global at call time, same as CONFIG/HOME/etc.
// Self-triggered counterpart to send_to_merchant() above (which fires when Riff
// actively requests loot) — this one runs on the fighter's own schedule.
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

// Shared by Warrior/Healer/Ranger (was duplicated identically across all three, only
// thresholds differed) — reads this file's own PANIC_THRESHOLDS global at call time.
// If a file also defines PANIC_BROADCAST_TARGETS (currently only Healer does), panic
// state changes are broadcast via send_cm to those targets.
async function panic_check() {
	const t = PANIC_THRESHOLDS;

	const LOW_HEALTH = character.hp < character.max_hp * t.low_hp;
	const LOW_MANA = character.mp < character.max_mp * t.low_mp;
	const HIGH_HEALTH = character.hp >= character.max_hp * t.high_hp;
	const HIGH_MANA = character.mp >= character.max_mp * t.high_mp;

	const panic_slot = character.items.findIndex(i => i?.name === "jacko");

	// Aggro check: monsters targeting me
	const MONSTERS_TARGETING_ME = Object.values(parent.entities).filter(
		e => e.type === "monster" && e.target === character.name && !e.dead
	).length;

	// PANIC CONDITION
	if (LOW_HEALTH || LOW_MANA || MONSTERS_TARGETING_ME >= t.aggro) {
		if (!panicking) {
			panicking = true;
			if (typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: true });
			}
			let reason = [];
			if (LOW_HEALTH) reason.push("low health");
			if (LOW_MANA) reason.push("low mana");
			if (MONSTERS_TARGETING_ME >= t.aggro) reason.push("high aggro");
			log(`⚠️ Panic triggered: ${reason.join(", ")}!`, "#ffcc00", "Alerts");
		}
	}

	if (panicking && (Date.now() - last_panic_time > t.cooldown)) {
		last_panic_time = Date.now();
		// Equip panic orb if needed
		if (character.slots.orb?.name !== "jacko" && panic_slot !== -1) {
			try {
				await equip(panic_slot);
				await delay(200);
				if (character.slots.orb?.name !== "jacko") {
					log("[PANIC] Failed to equip panic orb!", "#ff4444", "Errors");
				}
			} catch (e) {
				log(`[PANIC] Error equipping panic orb: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
			}
		}

		// Try to cast scare if possible
		if (!is_on_cooldown("scare") && can_use("scare") && character.slots.orb?.name === "jacko") {
			try {
				log("Using Scare!", "#ffcc00", "Alerts");
				await use_skill("scare");
				await delay(200);
			} catch (e) {
				log(`[PANIC] Error using scare: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
			}
		}
	}

	const safe_slot = character.items.findIndex(i => i?.name === "orbg");

	// SAFE CONDITION
	if (HIGH_HEALTH && HIGH_MANA && MONSTERS_TARGETING_ME < t.aggro) {
		if (panicking) {
			panicking = false;
			if (typeof PANIC_BROADCAST_TARGETS !== "undefined") {
				send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
			}
			log("✅ Panic over.", "#00ff00", "Alerts");
		}
	}

	if (!panicking && (Date.now() - last_safe_time > t.cooldown)) {
		last_safe_time = Date.now();
		// Equip normal orb if needed
		if (character.slots.orb?.name === "jacko" && safe_slot !== -1) {
			try {
				await equip(safe_slot);
				await delay(200);
				if (character.slots.orb?.name === "jacko") {
					log("[PANIC] Failed to equip normal orb!", "#ff4444", "Errors");
				}
			} catch (e) {
				log(`[PANIC] Error equipping normal orb: ${e && e.message ? e.message : e}`, "#ff4444", "Errors");
			}
		}
	}
}

// Shared by Warrior/Ranger (was duplicated identically) — orbits Myras when close,
// smart_moves to her when far or on a different map, falling back to
// _healer_last_known when she's off-map and invisible. Reads this file's own
// CONFIG.movement.follow_distance and writes/reads _healer_last_known/
// _last_healer_ping as true globals.
function follow_healer() {
	const healer = get_player("Myras");

	// Keep cache fresh from live data whenever healer is visible
	if (healer && !healer.rip) {
		_healer_last_known = { map: character.map, x: healer.x, y: healer.y };
	}

	// Ping for fresh location whenever healer is not visible (regardless of cached map)
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
		if (!smart.moving) smart_move({ map: healer_pos.map, x: healer_pos.x, y: healer_pos.y });
		return;
	}

	// Same map but not yet visible — smart_move toward cached position
	if (!healer) {
		if (!smart.moving) smart_move({ x: healer_pos.x, y: healer_pos.y });
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

	// Target a point exactly follow_distance units from the healer along our current angle.
	// Works for both approach (dist > fd) and push-away (dist < fd).
	const angle = Math.atan2(character.y - healer.y, character.x - healer.x);
	const target_x = healer.x + Math.cos(angle) * fd;
	const target_y = healer.y + Math.sin(angle) * fd;

	if (!can_move_to(target_x, target_y)) {
		smart_move({ x: target_x, y: target_y });
	} else {
		move(target_x, target_y);
	}
}

// Shared by Warrior/Healer/Ranger (was duplicated, and Healer/Ranger's copies didn't
// support reserved-slot arrays) — reads this file's own `item_order` global. A plain
// number reserves one slot for that item; an array reserves one slot per intentionally-
// kept duplicate (only Warrior currently uses this, for a dual-wielded weapon) — extra
// copies beyond the reserved slots are left wherever they land.
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

			// bank_retrieve pulls the ENTIRE stack from a bank slot in a single call — there's
			// no partial-quantity retrieval. Looping it per-unit (the old behavior) emptied the
			// slot on the first call, then wasted further calls on the now-empty slot while
			// still decrementing `remaining` once per call — so whenever a caller wanted fewer
			// than the full stack (e.g. withdrawing combine items in capped multiples of 3),
			// the real call over-delivered the whole stack while `remaining`'s bookkeeping
			// assumed only part of it arrived, throwing off every later slot/round and dropping
			// the last item or two short of what the caller expected to see in inventory.
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
// REMOTE SELLING (moved out of the now-removed Shared/Buttons.js — not UI, just a
// background auto-sell loop each fighter runs via setInterval(remote_sell_items, ...))
// --------------------------------------------------------------------------------------------------------------------------------- //

const SELLABLE_ITEMS = [
	"hpbelt", "hpamulet", "wattire", "ringsj", "wgloves", "wbook0", "wshoes", "wcap",
	"cclaw", "crabclaw", "slimestaff", "stinger", "pstem", "gslime", "coat1", "helmet1",
	"gloves1", "pants1", "shoes1", "wbreeches", "vitring", "helmet", "shoes", "gloves",
	"pmace", "throwingstars", "t2bow", "spear", "dagger", "rapier", "sword", "mushroomstaff",
	"rfangs", "gphelmet", "phelmet", "vitearring", "vitscroll", "hhelmet", "harmor", "hpants",
	"hgloves", "hboots", "strring", "dexring", "intring", "strearring", "dexearring", "intearring",
	"warmscarf", "snowball", "santasbelt", "lantern", "pclaw", "broom", "skullamulet",
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

