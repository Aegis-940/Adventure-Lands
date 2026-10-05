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

function level_fits(item_level, wanted) {
	return wanted === undefined || (item_level ?? 0) === wanted;
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
		v.slot === "mainhand" && is_doublehand(parent.character.items[v.num].name)
	);
	if (!two_hander) return false;

	parent.socket.emit("unequip", { slot: "offhand" });
	note_slot_flight("offhand", null);
	return true;
}

const SLOT_FLIGHT_MS = 1500;
const EQUIP_ACK_TIMEOUT_MS = 1000;

var _slot_flight = {};

function note_slot_flight(slot, name) {
	_slot_flight[slot] = { name, until: Date.now() + SLOT_FLIGHT_MS };
}

function slot_in_flight(slot) {
	const flight = _slot_flight[slot];
	if (!flight) return undefined;
	const worn = character.slots[slot];
	const landed = flight.name ? !!worn && worn.name === flight.name : !worn;
	if (landed || Date.now() > flight.until) {
		delete _slot_flight[slot];
		return undefined;
	}
	return flight.name;
}

function slot_intent(slot) {
	const flight = slot_in_flight(slot);
	if (flight !== undefined) return flight;
	return character.slots[slot] ? character.slots[slot].name : null;
}

function mainhand_in_flight() {
	return slot_in_flight("mainhand") || null;
}

function mainhand_intent() {
	return slot_intent("mainhand");
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
		if (slot_item && slot_item.name === item_name && level_fits(slot_item.level, level)) continue;
		if (slot_in_flight(slot) === item_name) continue;

		let idx = parent.character.items.findIndex((item, j) =>
			item && item.name === item_name && level_fits(item.level, level) && item.l === l && !claimed_slots.has(j)
		);
		if (idx === -1) {
			idx = parent.character.items.findIndex((item, j) =>
				item && item.name === item_name && level_fits(item.level, level) && !claimed_slots.has(j)
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

	for (const v of valid_items) note_slot_flight(v.slot, parent.character.items[v.num].name);

	try {
		const ack = parent.push_deferred("equip_batch").then(() => true, () => true);
		parent.socket.emit("equip_batch", valid_items);
		const acked = await Promise.race([ack, delay(EQUIP_ACK_TIMEOUT_MS).then(() => false)]);
		if (!acked) errlog_count(`equip ack timeout ${set_name || "slots"}`);
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
		if (slot_intent(item.slot) !== item.item_name) return false;
		const worn = character.slots[item.slot];
		if (worn && worn.name === item.item_name && !level_fits(worn.level, item.level)) warn_worn_level(set_name, item, worn);
		return true;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SET AVAILABILITY — what can be worn right now, and waiting for a swap to land
// --------------------------------------------------------------------------------------------------------------------------------- //

function preferred_orb(preferred, allow_xp) {
	if (allow_xp !== false && behind_on_xp() && set_available("orb_exp")) {
		return "orb_exp";
	}
	if (preferred && set_available(preferred)) return preferred;
	return set_available("orb") ? "orb" : null;
}

function set_available(set_name) {
	const set = equipment_sets[set_name];
	if (!set || !set.length) return false;
	return set.every(i => {
		const worn = character.slots[i.slot];
		if (worn && worn.name === i.item_name) return true;
		return character.items.some(it => it && it.name === i.item_name);
	});
}

async function equip_set_raw(set_name) {
	const set = equipment_sets[set_name];
	if (!set) {
		console.error(`Set "${set_name}" not found.`);
		return;
	}

	if (set.some(i => i.slot === "orb")) {
		errlog_record("orb_equip", `${set_name} -> orb (panicking=${panicking})`);
	}

	return batch_equip(set, set_name);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT ARBITER — one owner of the equipment slots.
// --------------------------------------------------------------------------------------------------------------------------------- //

const EQUIP_PRIORITY = {
	panic: 100,
	skill: 80,
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
		if (worn && worn.name === entry.item_name && level_fits(worn.level, entry.level)) continue;

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

function emit_equip_ops(ops, shadow) {
	for (const op of ops) {
		parent.push_deferred(op.event).catch(() => { });
		parent.socket.emit(op.event, op.payload);
		const slots = op.event === "equip_batch" ? op.payload.map(p => p.slot) : [op.payload.slot];
		for (const slot of slots) note_slot_flight(slot, shadow.slots[slot] ? shadow.slots[slot].name : null);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIFIED EQUIPMENT RESOLVER — Warrior/Ranger/Healer each declare their own EQUIPMENT_RULES
// --------------------------------------------------------------------------------------------------------------------------------- //

async function apply_equipment_rule(token, group, resolved) {
	if (!resolved) return;
	const sets = Array.isArray(resolved) ? resolved : [resolved];
	if (sets.every(s => is_set_equipped(s))) return;
	if (!sets.every(s => set_available(s))) {
		errlog_count(`equip unavailable ${group}`);
		return;
	}
	await equip_apply(token, sets);
}

function gear_override(group) {
	const at_home = destination && character.map === destination.map;
	if (!at_home) return null;
	const overrides = MONSTER_GEAR_OVERRIDES[home] || {};
	return group in overrides ? overrides[group] : null;
}

function resolve_equipment_bail_reason() {
	if (CONFIG.equipment.auto_swap_sets === false) return "auto_swap_sets disabled";
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
			if (dungeon_bailing()) {
				await delay(250);
				continue;
			}
			await resolve_equipment();
		} catch (e) {
			catcher(e, "equipment_manager_loop");
		}
		await delay(TICK_RATE.equipment);
	}
}
