// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT MANAGER — sets, the batch emitter, the slot arbiter, and the rules resolver
// --------------------------------------------------------------------------------------------------------------------------------- //

const MISSING_ITEM_WARN_INTERVAL = 30000;
const _missing_item_warned = {};

function warn_missing_item(item_name, level, slot) {
	const key = `${item_name}:${level}:${slot}`;
	const now = Date.now();
	if (now - (_missing_item_warned[key] || 0) < MISSING_ITEM_WARN_INTERVAL) return;
	_missing_item_warned[key] = now;
	game_log(`⚠️ batch_equip: no ${item_name} (lvl ${level}) in inventory for ${slot}`, "#FFA500");
}

function is_doublehand(item_name) {
	const def = item_name && G.items[item_name];
	const class_def = G.classes[character.ctype];
	return !!(def && class_def && class_def.doublehand && class_def.doublehand[def.wtype]);
}

function clear_offhand_for_doublehand(valid_items) {
	if (!parent.character.slots.offhand) return false;
	if (valid_items.some(v => v.slot === "offhand")) return false;

	const two_hander = valid_items.some(v =>
		v.slot === "mainhand" && is_doublehand(parent.character.items[v.num]?.name)
	);
	if (!two_hander) return false;

	parent.socket.emit("unequip", { slot: "offhand" });
	return true;
}

const MAINHAND_FLIGHT_MS = 1500;

var _mainhand_flight = { pending: null, until: 0 };

function mainhand_in_flight() {
	if (!_mainhand_flight.pending) return null;
	if (Date.now() > _mainhand_flight.until) _mainhand_flight.pending = null;
	else if (character.slots?.mainhand?.name === _mainhand_flight.pending) _mainhand_flight.pending = null;
	return _mainhand_flight.pending;
}

function mainhand_intent() {
	return mainhand_in_flight() || character.slots?.mainhand?.name || null;
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
				game_log(`⚠️ ${item_name} for ${slot}: set says lvl ${level ?? 0}, bag has lvl `
					+ `${found.level ?? 0} — equipping it anyway. Fix the set definition.`,
					"#FFA500");
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

	clear_offhand_for_doublehand(valid_items);

	const mainhand_swap = valid_items.find(v => v.slot === "mainhand");
	if (mainhand_swap) {
		_mainhand_flight.pending = parent.character.items[mainhand_swap.num]?.name || null;
		_mainhand_flight.until = Date.now() + MAINHAND_FLIGHT_MS;
	}

	try {
		parent.socket.emit("equip_batch", valid_items);
		await parent.push_deferred("equip_batch");
	} catch (error) {
		console.error("batch_equip error:", error);
		return Promise.reject({ reason: "invalid", message: "Failed to equip" });
	}
	return valid_items.length;
}

const _worn_level_warned = {};

function warn_worn_level(set_name, item, worn) {
	const key = `${set_name}:${item.slot}`;
	const now = Date.now();
	if (now - (_worn_level_warned[key] || 0) < MISSING_ITEM_WARN_INTERVAL) return;
	_worn_level_warned[key] = now;
	game_log(`⚠️ set ${set_name}: ${item.item_name} in ${item.slot} is worn at lvl ${worn.level ?? 0}, `
		+ `set says lvl ${item.level ?? 0} — treating it as equipped. Fix the set definition.`, "#FFA500");
}

function is_set_equipped(set_name) {
	const set = equipment_sets[set_name];
	if (!set) return false;

	return set.every(item => {
		const worn = character.slots[item.slot];
		if (!worn || worn.name !== item.item_name) return false;
		if ((worn.level ?? 0) !== (item.level ?? 0)) warn_worn_level(set_name, item, worn);
		return true;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SET AVAILABILITY — what can be worn right now, and waiting for a swap to land
// --------------------------------------------------------------------------------------------------------------------------------- //

function preferred_orb(preferred, allow_xp) {
	if (allow_xp !== false && typeof behind_on_xp === "function" && behind_on_xp() && set_available("orb_exp")) {
		return "orb_exp";
	}
	if (preferred && set_available(preferred)) return preferred;
	return set_available("orb") ? "orb" : null;
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
	} catch (e) { }

	return batch_equip(set, set_name);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT ARBITER — one owner of the equipment slots.
// --------------------------------------------------------------------------------------------------------------------------------- //

const EQUIP_PRIORITY = {
	panic: 100,
	skill: 80,
	trick: 70,
	rules: 20,
	resting: 10,
};

const EQUIP_CLAIM_MAX_MS = 5000;

let _equip_holder = null;
let _equip_seq = 0;

function equip_claim(owner, priority) {
	if (_equip_holder && Date.now() - _equip_holder.at > EQUIP_CLAIM_MAX_MS) _equip_holder = null;
	if (_equip_holder && _equip_holder.priority >= priority) return null;
	_equip_holder = { owner, priority, token: ++_equip_seq, at: Date.now() };
	return _equip_holder.token;
}

function equip_holds(token) {
	return !!token && !!_equip_holder && _equip_holder.token === token;
}

function equip_release(token) {
	if (equip_holds(token)) _equip_holder = null;
}

function equip_refresh(token) {
	if (equip_holds(token)) _equip_holder.at = Date.now();
}

async function equip_apply(token, sets) {
	if (!equip_holds(token)) return false;
	const list = Array.isArray(sets) ? sets : [sets];
	for (const s of list) {
		if (!equip_holds(token)) return false;
		if (is_set_equipped(s)) continue;
		await equip_set_raw(s);
	}
	return equip_holds(token);
}

function resolve_swap_slots(items) {
	const claimed = new Set();
	const slots = [];

	for (const item of items) {
		const num = parent.character.items.findIndex((held, i) =>
			held && held.name === item.item_name && !claimed.has(i)
		);
		if (num === -1) {
			warn_missing_item(item.item_name, item.level ?? null, item.slot);
			continue;
		}
		claimed.add(num);
		slots.push({ num, slot: item.slot });
	}

	return slots.length ? slots : null;
}

let _swap_slots_warned = 0;

async function equip_apply_slots(token, slots) {
	if (!equip_holds(token)) return false;
	if (!slots || !slots.length) return false;

	try {
		await equip_batch(slots);
	} catch (e) {
		const now = Date.now();
		if (now - _swap_slots_warned >= MISSING_ITEM_WARN_INTERVAL) {
			_swap_slots_warned = now;
			game_log(`⚠️ equip_apply_slots: ${fmt_err(e)}`, "#FFA500");
		}
		return false;
	}

	return equip_holds(token);
}

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
// PLANNED SWAPS — resolve a chain of sets against the inventory the server will have, not the one we can see yet
// --------------------------------------------------------------------------------------------------------------------------------- //

function shadow_item(source) {
	return source ? { name: source.name, level: source.level ?? 0, l: source.l } : null;
}

function shadow_inventory() {
	const slots = {};
	for (const slot in parent.character.slots) slots[slot] = shadow_item(parent.character.slots[slot]);

	return { items: parent.character.items.map(shadow_item), slots };
}

function shadow_find(shadow, item_name, level, l) {
	let num = shadow.items.findIndex(it => it && it.name === item_name && it.level === (level ?? 0) && it.l === l);
	if (num === -1) num = shadow.items.findIndex(it => it && it.name === item_name && it.level === (level ?? 0));
	if (num === -1) num = shadow.items.findIndex(it => it && it.name === item_name);
	return num;
}

function shadow_equip(shadow, num, slot) {
	const incoming = shadow.items[num];
	shadow.items[num] = shadow.slots[slot] || null;
	shadow.slots[slot] = incoming;
}

function shadow_unequip(shadow, slot) {
	if (!shadow.slots[slot]) return false;
	const num = shadow.items.findIndex(it => !it);
	if (num === -1) return false;
	shadow.items[num] = shadow.slots[slot];
	shadow.slots[slot] = null;
	return true;
}

function plan_set_equip(shadow, set_name) {
	const set = equipment_sets[set_name];
	if (!set || !set.length) return [];

	const ops = [];
	const mainhand = set.find(e => e.slot === "mainhand");
	const keeps_offhand = set.some(e => e.slot === "offhand");

	if (mainhand && !keeps_offhand && shadow.slots.offhand && is_doublehand(mainhand.item_name)) {
		if (shadow_unequip(shadow, "offhand")) ops.push({ event: "unequip", payload: { slot: "offhand" } });
	}

	const items = [];
	for (const entry of set) {
		const worn = shadow.slots[entry.slot];
		if (worn && worn.name === entry.item_name && worn.level === (entry.level ?? 0)) continue;

		const num = shadow_find(shadow, entry.item_name, entry.level, entry.l);
		if (num === -1) {
			warn_missing_item(entry.item_name, entry.level, entry.slot);
			continue;
		}

		items.push({ num, slot: entry.slot });
		shadow_equip(shadow, num, entry.slot);
	}

	if (items.length) ops.push({ event: "equip_batch", payload: items });
	return ops;
}

function equip_plan(set_names, shadow) {
	const inventory = shadow || shadow_inventory();
	const names = Array.isArray(set_names) ? set_names : [set_names];

	let ops = [];
	for (const name of names) ops = ops.concat(plan_set_equip(inventory, name));

	return { ops, shadow: inventory };
}

function emit_equip_ops(ops) {
	for (const op of ops) parent.socket.emit(op.event, op.payload);
}

async function wait_for_set(set_name, timeout_ms) {
	const deadline = Date.now() + (timeout_ms || 1000);
	while (!is_set_equipped(set_name)) {
		if (Date.now() >= deadline) return false;
		await delay(20);
	}
	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIFIED EQUIPMENT RESOLVER — Warrior/Ranger/Healer each declare their own EQUIPMENT_RULES
// --------------------------------------------------------------------------------------------------------------------------------- //

function equip_group_ready(group, key) {
	if (!state.equip_cooldowns) state.equip_cooldowns = {};
	const last = state.equip_cooldowns[group];
	const now = performance.now();
	if (last && last.key === key
		&& now - last.at < (CONFIG.equipment.swap_cooldown ?? COOLDOWNS.equip_swap)) return false;
	state.equip_cooldowns[group] = { key, at: now };
	return true;
}

async function apply_equipment_rule(token, group, resolved) {
	if (!resolved) return;
	const sets = Array.isArray(resolved) ? resolved : [resolved];
	if (sets.every(s => is_set_equipped(s))) return;
	if (!sets.every(s => set_available(s))) {
		if (typeof errlog_count === "function") errlog_count(`equip unavailable ${group}`);
		return;
	}
	if (!equip_group_ready(group, sets.join("+"))) return;
	await equip_apply(token, sets);
}

function gear_override(group) {
	const at_home = typeof destination !== "undefined" && destination && character.map === destination.map;
	if (!at_home) return null;
	const overrides = (typeof MONSTER_GEAR_OVERRIDES !== "undefined" && MONSTER_GEAR_OVERRIDES[home]) || {};
	return group in overrides ? overrides[group] : null;
}

function resolve_equipment_bail_reason() {
	if (typeof EQUIPMENT_RULES === "undefined") return "EQUIPMENT_RULES undefined";
	if (CONFIG.equipment?.auto_swap_sets === false) return "auto_swap_sets disabled";
	if (character.cc > COOLDOWNS.cc) return "cc above threshold";
	return null;
}

async function resolve_equipment() {
	if (resolve_equipment_bail_reason()) return;

	const token = equip_claim("rules", EQUIP_PRIORITY.rules);
	if (!token) return;

	try {
		for (const group in EQUIPMENT_RULES) {
			if (!equip_holds(token)) return;
			await apply_equipment_rule(token, group, EQUIPMENT_RULES[group].resolve());
		}
	} finally {
		equip_release(token);
	}
}

async function equipment_manager_loop() {
	while (true) {
		try {
			if (typeof dungeon_bailing === "function" && dungeon_bailing()) {
				await delay(250);
				continue;
			}
			await resolve_equipment();
		} catch (e) {
			catcher(e, "equipment_manager_loop");
		}
		await delay(TICK_RATE.equipment ?? 25);
	}
}
