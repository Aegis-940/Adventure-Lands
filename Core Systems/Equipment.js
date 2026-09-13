// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT — sets, the batch emitter, the slot arbiter, and the rules resolver
// --------------------------------------------------------------------------------------------------------------------------------- //

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

	clear_offhand_for_doublehand(valid_items);

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// ITEM ABILITIES — proc chances scaled to the item's upgrade level
// --------------------------------------------------------------------------------------------------------------------------------- //

const UPGRADE_LEVEL_MULTIPLIERS = { 7: 1.25, 8: 1.5, 9: 2, 10: 3, 11: 1.25, 12: 1.25 };

function upgrade_multiplier_sum(level) {
	let sum = 0;
	for (let i = 1; i <= (level || 0); i++) sum += UPGRADE_LEVEL_MULTIPLIERS[i] || 1;
	return sum;
}

function item_ability_chance(item_name, level, ability) {
	const def = G.items[item_name];
	if (!def || def.ability !== ability) return 0;

	const scaling = def.upgrade || def.compound;
	const per_level = (scaling && scaling.attr0) || 0;
	return (def.attr0 || 0) + per_level * upgrade_multiplier_sum(level);
}

function set_ability_chance(set_name, ability) {
	const set = equipment_sets[set_name];
	if (!set) return 0;
	return set.reduce((sum, i) => sum + item_ability_chance(i.item_name, i.level, ability), 0);
}

function worn_ability_chance(ability) {
	let sum = 0;
	for (const slot in character.slots) {
		const worn = character.slots[slot];
		if (worn) sum += item_ability_chance(worn.name, worn.level, ability);
	}
	return sum;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SET PROFILES — what each equipment set is actually worth, measured while it is worn
// --------------------------------------------------------------------------------------------------------------------------------- //

const WEAPON_PROBE_MS = 20000;
const SET_PROFILE_KEY = "AL_set_profile2_";
const SET_PROFILE_FIELDS = ["attack", "explosion", "frequency", "heal", "int", "rpiercing", "mp_cost"];
const SET_PROFILE_MIN_INTERVAL_MS = 15000;
const SET_PROFILE_SETTLE_MS = 600;
const PROFILE_EXCLUDED_BUFFS = ["darkblessing", "warcry", "power", "xpower"];

const _profile_pending = {};
const SET_PROFILE_EPSILON = 0.02;

let _set_profiles = null;

function load_set_profiles() {
	if (_set_profiles) return _set_profiles;
	try {
		_set_profiles = JSON.parse(localStorage.getItem(SET_PROFILE_KEY + character.name)) || {};
	} catch (e) {
		_set_profiles = {};
	}
	return _set_profiles;
}

function get_set_profile(set_name) {
	return load_set_profiles()[set_name] || null;
}

function profile_materially_differs(previous, profile) {
	return SET_PROFILE_FIELDS.some(field => {
		const a = previous[field] || 0;
		const b = profile[field] || 0;
		if (a === b) return false;
		return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) > SET_PROFILE_EPSILON;
	});
}

function profile_conditions_ok() {
	if (character.fear) return false;
	const active = character.s || {};
	return !PROFILE_EXCLUDED_BUFFS.some(buff => active[buff]);
}

function record_set_profile(set_name) {
	if (!is_set_equipped(set_name) || !profile_conditions_ok()) {
		delete _profile_pending[set_name];
		return false;
	}

	const profile = { at: Date.now() };
	for (const field of SET_PROFILE_FIELDS) profile[field] = character[field] || 0;

	const pending = _profile_pending[set_name];
	if (!pending || profile_materially_differs(pending.profile, profile)) {
		_profile_pending[set_name] = { profile, at: Date.now() };
		return false;
	}
	if (Date.now() - pending.at < SET_PROFILE_SETTLE_MS) return false;

	const profiles = load_set_profiles();
	const previous = profiles[set_name];
	if (previous && Date.now() - (previous.at || 0) < SET_PROFILE_MIN_INTERVAL_MS) return false;
	if (previous && !profile_materially_differs(previous, profile)) return false;

	profiles[set_name] = profile;
	try {
		localStorage.setItem(SET_PROFILE_KEY + character.name, JSON.stringify(profiles));
	} catch (e) { }
	return true;
}

function sample_set_profiles(set_names) {
	let changed = false;
	for (const name of set_names) {
		if (record_set_profile(name)) changed = true;
	}
	return changed;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SHARED RESOLVER HELPERS — the decisions every fighter makes the same way
// --------------------------------------------------------------------------------------------------------------------------------- //

function set_dps(profile) {
	return (profile.attack || 0) * (profile.frequency || 1);
}

function hit_against(mob, attack) {
	if (!mob) return 0;
	return (attack || 0) * defense_reduction((mob.armor || 0) - (character.apiercing || 0));
}

function boss_gear_phase() {
	const boss = typeof find_active_boss === "function" && find_active_boss();
	if (!boss) return null;

	const threshold = CONFIG.equipment?.boss_hp_thresholds?.[boss.name];
	if (threshold === undefined) return null;

	return boss.data.hp > threshold ? "fight" : "loot";
}

function make_weapon_choice() {
	return { name: null, at: 0, probe: {} };
}

function best_weapon_set(choice, sets, value_of, opts) {
	const o = opts || {};
	const now = Date.now();

	for (const name of sets) {
		if (!set_available(name) || get_set_profile(name)) {
			delete choice.probe[name];
			continue;
		}
		if (!choice.probe[name]) choice.probe[name] = now;
		if (now - choice.probe[name] <= (o.probe_ms || WEAPON_PROBE_MS)) {
			if (choice.name !== name) { choice.name = name; choice.at = now; }
			return name;
		}
	}

	let best = null;
	let best_value = -Infinity;
	for (const name of sets) {
		if (!set_available(name)) continue;
		const value = value_of(name);
		if (value === null || value === undefined || value <= best_value) continue;
		best_value = value;
		best = name;
	}
	if (!best) return null;

	if (choice.name && choice.name !== best) {
		if (now - choice.at < (o.hysteresis_ms || 0)) return choice.name;
		const holding = value_of(choice.name);
		if (holding !== null && holding !== undefined && best_value < holding * (o.margin || 1)) return choice.name;
	}

	if (choice.name !== best) {
		if (typeof o.on_change === "function") o.on_change(choice.name, best, now);
		choice.name = best;
		choice.at = now;
	}
	return best;
}

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
	} catch (e) { }
	return false;
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
	loot: 60,
	rules: 20,
	resting: 10,
};

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

async function equip_apply_slots(token, slots) {
	if (!equip_holds(token)) return false;
	await batch_equip(slots);
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
// UNIFIED EQUIPMENT RESOLVER — Warrior/Ranger/Healer each declare their own EQUIPMENT_RULES
// --------------------------------------------------------------------------------------------------------------------------------- //

function equip_group_ready(group) {
	if (!state.equip_cooldowns) state.equip_cooldowns = {};
	const now = performance.now();
	if (now - (state.equip_cooldowns[group] || 0) < (CONFIG.equipment.swap_cooldown ?? 500)) return false;
	state.equip_cooldowns[group] = now;
	return true;
}

async function apply_equipment_rule(token, group, resolved) {
	if (!resolved) return;
	const sets = Array.isArray(resolved) ? resolved : [resolved];
	if (sets.every(s => is_set_equipped(s))) return;
	if (!equip_group_ready(group)) return;
	await equip_apply(token, sets);
}

async function apply_booster_rule(group, desired_booster) {
	if (!desired_booster) return;
	if (locate_item(desired_booster) !== -1) return;

	const other_slot = find_booster_slot();
	if (other_slot === null) return;
	if (!equip_group_ready(group)) return;

	shift(other_slot, desired_booster);
}

function resolve_equipment_bail_reason() {
	if (typeof EQUIPMENT_RULES === "undefined") return "EQUIPMENT_RULES undefined";
	if (CONFIG.equipment?.auto_swap_sets === false) return "auto_swap_sets disabled";
	if (character.cc > COOLDOWNS.cc) return "cc above threshold";
	if (typeof should_pause_equipment_resolve === "function" && should_pause_equipment_resolve()) return "special weapon equipped";
	return null;
}

async function resolve_equipment() {
	if (resolve_equipment_bail_reason()) return;

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
