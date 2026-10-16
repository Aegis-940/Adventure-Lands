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
	log_msg("warn", `batch_equip: no ${item_name} (lvl ${level}) in inventory for ${slot}`);
}

function level_fits(item_level, wanted) {
	return wanted === undefined || (item_level ?? 0) === wanted;
}

function is_doublehand(item_name) {
	const def = item_name && G.items[item_name];
	const class_def = G.classes[character.ctype];
	return !!(def && class_def && class_def.doublehand && class_def.doublehand[def.wtype]);
}

function clear_offhand_for_doublehand(valid_items, view) {
	if (!view.slots.offhand) return false;
	if (valid_items.some(v => v.slot === "offhand")) return false;

	const two_hander = valid_items.some(v =>
		v.slot === "mainhand" && is_doublehand(view.items[v.num].name)
	);
	if (!two_hander) return false;

	parent.socket.emit("unequip", { slot: "offhand" });
	note_slot_flight("offhand", null);
	note_sent("unequip", { slot: "offhand" });
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

function mainhand_intent() {
	return slot_intent("mainhand");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SENT VIEW — the inventory the server will hold once every swap we have sent lands, so no swap is planned from a stale one
// --------------------------------------------------------------------------------------------------------------------------------- //

var _equip_sent = null;
var _unequip_landings = [];

function replies_outstanding(sent) {
	return sent.due.equip_batch + sent.due.unequip + sent.due.imove;
}

function equip_pending() {
	if (_equip_sent && (replies_outstanding(_equip_sent) <= 0 || Date.now() > _equip_sent.until)) _equip_sent = null;
	return !!_equip_sent;
}

function equip_view() {
	if (!equip_pending()) return shadow_inventory();
	return { items: _equip_sent.shadow.items.slice(), slots: Object.assign({}, _equip_sent.shadow.slots) };
}

function note_sent(event, payload) {
	if (!equip_pending()) _unequip_landings = [];
	const shadow = equip_view();

	if (event === "unequip") {
		_unequip_landings.push(shadow_unequip(shadow, payload.slot));
	} else if (event === "imove") {
		const moved = shadow.items[payload.a];
		shadow.items[payload.a] = shadow.items[payload.b];
		shadow.items[payload.b] = moved;
	} else {
		for (const p of payload) shadow_equip(shadow, p.num, p.slot);
	}

	const due = _equip_sent ? Object.assign({}, _equip_sent.due) : { equip_batch: 0, unequip: 0, imove: 0 };
	due[event]++;
	_equip_sent = { shadow, due, until: Date.now() + SLOT_FLIGHT_MS };
}


function live_matches_sent(slot) {
	const sent = _equip_sent.shadow.slots[slot];
	const live = parent.character.slots[slot];
	return (sent ? sent.name : null) === (live ? live.name : null);
}

function settle_landing(num, failed) {
	if (num === undefined || num === -1 || failed) return;
	const guessed = _equip_sent.shadow.items[num];
	if (!guessed || !guessed.guess) return;
	const live = parent.character.items[num];
	if (live && live.name === guessed.name && (live.level ?? 0) === guessed.level) {
		_equip_sent.shadow.items[num] = shadow_item(live);
	} else {
		errlog_count(`unequip landed elsewhere: ${guessed.name}`);
	}
}

function reply_event(data) {
	if (data.place === "equip") return data.failed ? "equip_batch" : null;
	return data.place;
}

function equip_reply_counter(data) {
	if (!data || !data.place) return;
	if (data.place === "equip_batch" && Array.isArray(data.slots)) {
		for (const result of data.slots) {
			if (typeof result === "string") errlog_count(`equip_batch item ${result}`);
		}
	}
	if (!_equip_sent) return;

	const event = reply_event(data);
	if (!_equip_sent.due[event]) return;

	_equip_sent.due[event]--;
	if (event === "unequip") settle_landing(_unequip_landings.shift(), data.failed);
	if (replies_outstanding(_equip_sent) === 0) {
		const current = live_matches_sent("mainhand") && live_matches_sent("offhand");
		errlog_count(current ? "equip reply: live current" : "equip reply: live behind");
	}
	if (event === "unequip" && !_equip_sent.due.unequip && _parked_restore) finish_parked_restore(_parked_restore);
}

function inventory_move(a, b) {
	parent.push_deferred("imove").catch(() => { });
	parent.socket.emit("imove", { a, b });
	note_sent("imove", { a, b });
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
	const view = equip_view();

	for (let i = 0; i < data.length; i++) {
		let item_name = data[i].item_name;
		let slot = data[i].slot;
		let level = data[i].level;
		let l = data[i].l;

		if (!item_name) continue;

		const slot_item = view.slots[slot];
		if (slot_item && slot_item.name === item_name && level_fits(slot_item.level, level)) continue;
		if (slot_in_flight(slot) === item_name) continue;

		const idx = best_copy(view.items, item_name, level, l, claimed_slots);
		if (idx === -1) {
			if (!copy_landing(view.items, item_name)) warn_missing_item(item_name, level, slot);
			continue;
		}
		if (!level_fits(view.items[idx].level, level)) {
			log_msg("warn", `${item_name} for ${slot}: set says lvl ${level}, bag has lvl `
				+ `${view.items[idx].level ?? 0} — equipping it anyway. Fix the set definition.`);
		}

		valid_items.push({ num: idx, slot: slot });
		claimed_slots.add(idx);
	}

	if (valid_items.length === 0) return 0;

	clear_offhand_for_doublehand(valid_items, view);

	for (const v of valid_items) note_slot_flight(v.slot, view.items[v.num].name);
	note_sent("equip_batch", valid_items);

	const ack = parent.push_deferred("equip_batch").then(() => true, () => true);
	parent.socket.emit("equip_batch", valid_items);
	const acked = await Promise.race([ack, delay(EQUIP_ACK_TIMEOUT_MS).then(() => false)]);
	if (!acked) errlog_count(`equip ack timeout ${set_name || "slots"}`);
	return valid_items.length;
}

const _worn_level_warned = {};

function warn_worn_level(set_name, item, worn) {
	const key = `${set_name}:${item.slot}`;
	const now = Date.now();
	if (now - (_worn_level_warned[key] || 0) < MISSING_ITEM_WARN_INTERVAL) return;
	_worn_level_warned[key] = now;
	log_msg("warn", `set ${set_name}: ${item.item_name} in ${item.slot} is worn at lvl ${worn.level ?? 0}, `
		+ `set says lvl ${item.level ?? 0} — treating it as equipped. Fix the set definition.`);
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
		log_msg("error", `Set "${set_name}" not found.`);
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

function equip_claimable(priority) {
	if (_equip_holder && Date.now() - _equip_holder.at > EQUIP_CLAIM_MAX_MS) _equip_holder = null;
	return !_equip_holder || _equip_holder.priority < priority;
}

function equip_claim(owner, priority) {
	if (!equip_claimable(priority)) return null;
	_equip_holder = { owner, priority, token: ++_equip_seq, at: Date.now() };
	return _equip_holder.token;
}

function equip_holds(token) {
	return !!token && !!_equip_holder && _equip_holder.token === token;
}

function equip_release(token) {
	if (equip_holds(token)) _equip_holder = null;
}

function equip_transient() {
	if (!_equip_holder || Date.now() - _equip_holder.at > EQUIP_CLAIM_MAX_MS) return false;
	return _equip_holder.priority > EQUIP_PRIORITY.rules;
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

function copy_rank(item, level, l) {
	const lvl = item.level ?? 0;
	if (level === undefined) return [lvl, item.l === l ? 1 : 0];
	return [lvl === level ? 1 : 0, item.l === l ? 1 : 0, -lvl];
}

function rank_beats(a, b) {
	for (let k = 0; k < a.length; k++) {
		if (a[k] !== b[k]) return a[k] > b[k];
	}
	return false;
}

function best_copy(items, item_name, level, l, taken) {
	let best = -1;
	let best_rank = null;
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (!it || it.guess || it.name !== item_name || (taken && taken.has(i))) continue;
		if (level !== undefined && (it.level ?? 0) < level) continue;
		const rank = copy_rank(it, level, l);
		if (best === -1 || rank_beats(rank, best_rank)) {
			best = i;
			best_rank = rank;
		}
	}
	return best;
}

function copy_landing(items, item_name) {
	return items.some(it => it && it.guess && it.name === item_name);
}

function shadow_find(shadow, item_name, level, l) {
	return best_copy(shadow.items, item_name, level, l, null);
}

function shadow_equip(shadow, num, slot) {
	const incoming = shadow.items[num];
	shadow.items[num] = shadow.slots[slot] || null;
	shadow.slots[slot] = incoming;
}

function shadow_unequip(shadow, slot) {
	if (!shadow.slots[slot]) return -1;
	const num = shadow.items.findIndex(it => !it);
	if (num === -1) return -1;
	shadow.items[num] = Object.assign({ guess: true }, shadow.slots[slot]);
	shadow.slots[slot] = null;
	return num;
}

function plan_set_equip(plan, set_name) {
	const set = equipment_sets[set_name];
	if (!set || !set.length) return;

	const shadow = plan.shadow;
	const mainhand = set.find(e => e.slot === "mainhand");
	const keeps_offhand = set.some(e => e.slot === "offhand");

	if (mainhand && !keeps_offhand && shadow.slots.offhand && is_doublehand(mainhand.item_name)) {
		if (shadow_unequip(shadow, "offhand") !== -1) plan.ops.push({ event: "unequip", payload: { slot: "offhand" } });
	}

	const items = [];
	for (const entry of set) {
		const worn = shadow.slots[entry.slot];
		if (worn && worn.name === entry.item_name && level_fits(worn.level, entry.level)) continue;

		const num = shadow_find(shadow, entry.item_name, entry.level, entry.l);
		if (num === -1) {
			if (copy_landing(shadow.items, entry.item_name)) plan.landing = true;
			else warn_missing_item(entry.item_name, entry.level, entry.slot);
			continue;
		}

		items.push({ num, slot: entry.slot });
		shadow_equip(shadow, num, entry.slot);
	}

	if (items.length) plan.ops.push({ event: "equip_batch", payload: items });
}

function rules_set_for_slot(slot) {
	for (const group in EQUIPMENT_RULES) {
		const resolved = EQUIPMENT_RULES[group].resolve();
		for (const name of Array.isArray(resolved) ? resolved : [resolved]) {
			if (name && equipment_sets[name] && equipment_sets[name].some(entry => entry.slot === slot)) return name;
		}
	}
	return null;
}

function equip_plan(set_names, shadow) {
	const plan = { ops: [], shadow: shadow || equip_view(), landing: false };
	const names = Array.isArray(set_names) ? set_names : [set_names];

	for (const name of names) plan_set_equip(plan, name);
	return plan;
}

const EQUIP_PENALTY_MS = 120;

function ops_penalty(ops) {
	let items = 0;
	for (const op of ops) {
		if (op.event === "equip_batch") items += op.payload.length;
	}
	return items * EQUIP_PENALTY_MS;
}

function penalty_left() {
	return character.s.penalty_cd ? character.s.penalty_cd.ms : 0;
}

function emit_equip_ops(ops, shadow) {
	for (const op of ops) {
		parent.push_deferred(op.event).catch(() => { });
		parent.socket.emit(op.event, op.payload);
		note_sent(op.event, op.payload);
		const slots = op.event === "equip_batch" ? op.payload.map(p => p.slot) : [op.payload.slot];
		for (const slot of slots) note_slot_flight(slot, shadow.slots[slot] ? shadow.slots[slot].name : null);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BURSTS — arm, act, restore in one go: the only way a skill borrows equipment
// --------------------------------------------------------------------------------------------------------------------------------- //

function equip_burst(burst) {
	const token = equip_claim(burst.owner, burst.priority || EQUIP_PRIORITY.skill);
	if (!token) return null;

	const armed = equip_plan(burst.arm);
	emit_equip_ops(armed.ops, armed.shadow);
	record_burst(burst.owner, armed.ops.length);
	if (burst.between) burst.between(armed);
	if (burst.then) {
		const then = equip_plan(burst.then, armed.shadow);
		emit_equip_ops(then.ops, armed.shadow);
	}

	if (!burst.restore) equip_release(token);
	else if (burst.hold) setTimeout(() => restore_burst(token, burst.restore), burst.hold);
	else restore_burst(token, burst.restore);
	return armed;
}

var _parked_restore = null;

function restore_burst(token, restore) {
	const back = equip_plan(restore() || []);
	if (back.landing && equip_holds(token)) {
		const parked = { token, restore };
		_parked_restore = parked;
		setTimeout(() => finish_parked_restore(parked), SLOT_FLIGHT_MS);
		errlog_count("burst restore waited on landing");
		return;
	}
	send_restore(token, back);
}

function finish_parked_restore(parked) {
	if (_parked_restore !== parked) return;
	_parked_restore = null;
	send_restore(parked.token, equip_plan(parked.restore() || []));
}

function send_restore(token, back) {
	emit_equip_ops(back.ops, back.shadow);
	equip_release(token);
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
	record_gear(group, sets);
	await equip_apply(token, sets);
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

function equipment_manager_loop() {
	every("equipment_manager_loop", { ms: TICK_RATE.equipment, kind: "combat" }, async () => {
		if (dungeon_bailing()) return 250;
		await resolve_equipment();
		return TICK_RATE.equipment;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Equipment Manager", () => {
	on_socket("game_response", "equip_reply_counter", equip_reply_counter);
});
