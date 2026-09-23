// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT VALUATION — what each set is worth; returns names and numbers, equips nothing
// --------------------------------------------------------------------------------------------------------------------------------- //

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
	return set.reduce((sum, i) => sum + item_ability_chance(i.item_name, set_entry_level(i) ?? i.level, ability), 0);
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

const SET_PROFILE_KEY = "AL_set_profile2_";
const SET_PROFILE_FIELDS = ["attack", "explosion", "frequency", "heal", "int", "rpiercing", "apiercing", "mp_cost"];
const SET_PROFILE_MIN_INTERVAL_MS = 15000;
const SET_PROFILE_REPROBE_MS = 600000;
const SET_PROFILE_SETTLE_MS = 600;
const SET_PROFILE_FIRST_SETTLE_MS = 150;
const SET_PROFILE_EPSILON = 0.02;
const PROFILE_EXCLUDED_BUFFS = ["darkblessing", "warcry", "power", "xpower", "sugarrush", "energized", "anniversary_kiss"];

const _profile_pending = {};
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

function save_set_profiles(profiles) {
	try {
		localStorage.setItem(SET_PROFILE_KEY + character.name, JSON.stringify(profiles));
	} catch (e) { }
}

function set_entry_level(entry) {
	const worn = character.slots[entry.slot];
	if (worn && worn.name === entry.item_name) return worn.level ?? 0;

	const exact = character.items.find(it =>
		it && it.name === entry.item_name && (it.level ?? 0) === (entry.level ?? 0));
	if (exact) return exact.level ?? 0;

	const any = character.items.find(it => it && it.name === entry.item_name);
	return any ? (any.level ?? 0) : null;
}

function set_gear_signature(set_name) {
	const set = equipment_sets[set_name];
	if (!set) return "";
	return set.map(entry => `${entry.item_name}:${set_entry_level(entry) ?? "?"}`).join("|");
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

	const profile = { at: Date.now(), gear: set_gear_signature(set_name) };
	for (const field of SET_PROFILE_FIELDS) profile[field] = character[field] || 0;

	const pending = _profile_pending[set_name];
	if (!pending || pending.profile.gear !== profile.gear || profile_materially_differs(pending.profile, profile)) {
		_profile_pending[set_name] = { profile, at: Date.now() };
		return false;
	}

	const profiles = load_set_profiles();
	const previous = profiles[set_name];
	const settle = previous ? SET_PROFILE_SETTLE_MS : SET_PROFILE_FIRST_SETTLE_MS;
	if (Date.now() - pending.at < settle) return false;
	const since = previous ? Date.now() - (previous.at || 0) : Infinity;

	if (previous && !profile_materially_differs(previous, profile)) {
		if (since >= SET_PROFILE_MIN_INTERVAL_MS || previous.gear !== profile.gear) {
			previous.at = Date.now();
			previous.gear = profile.gear;
			save_set_profiles(profiles);
		}
		return false;
	}
	if (since < SET_PROFILE_MIN_INTERVAL_MS) return false;

	profiles[set_name] = profile;
	save_set_profiles(profiles);
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

function profile_apiercing(profile) {
	return profile.apiercing === undefined ? (character.apiercing || 0) : profile.apiercing;
}

function hit_against(mob, attack, apiercing) {
	if (!mob) return 0;
	const piercing = apiercing === undefined ? (character.apiercing || 0) : apiercing;
	return (attack || 0) * defense_reduction((mob.armor || 0) - piercing);
}

function mean_of_best(values, count) {
	if (!values.length) return 0;
	const take = Math.min(count, values.length);
	values.sort((a, b) => b - a);

	let total = 0;
	for (let i = 0; i < take; i++) total += values[i];
	return total / take;
}

function set_damage_value(set_name, pool, width) {
	const profile = get_set_profile(set_name);
	if (!profile || !profile.attack) return null;
	if (!pool || !pool.length) return null;

	const dps = set_dps(profile);
	const chance = set_ability_chance(set_name, "burn");
	const piercing = profile_apiercing(profile);
	const party_factor = (CONFIG.combat && CONFIG.combat.party_dps_factor) || 1;

	const each = pool.map(mob => {
		const burn = burn_multiplier_at_dps(mob, chance, dps, party_factor,
			{ frequency: profile.frequency, hp: mob.hp, apiercing: piercing });
		const splash = profile.explosion > 0
			? splash_bonus(mob, profile.explosion, hit_against(mob, profile.attack, piercing))
			: 0;
		return burn + splash;
	});

	return dps * mean_of_best(each, width || 1);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WEAPON CHOICE — probe only sets we cannot value yet, then wear the best-valued set
// --------------------------------------------------------------------------------------------------------------------------------- //

const WEAPON_PROBE_MS = 20000;
const WEAPON_HYSTERESIS_MS = 3000;
const WEAPON_SWITCH_MARGIN = 1.1;
const WEAPON_SMOOTHING_MS = 300;

var _weapon_choice = { worn: null, since: 0, probe: {}, probing: null, proposed: null, values: {} };

function equipped_set_among(sets) {
	return sets.find(name => is_set_equipped(name)) || null;
}

function first_available_set(sets) {
	return sets.find(name => set_available(name)) || null;
}

function observe_worn_set(sets, now) {
	const worn = equipped_set_among(sets);
	if (worn && worn !== _weapon_choice.worn) {
		_weapon_choice.worn = worn;
		_weapon_choice.since = now;
	}
	return _weapon_choice.worn;
}

function set_profile_unusable(set_name) {
	const profile = get_set_profile(set_name);
	if (!profile || !profile.attack) return true;
	return !!profile.gear && profile.gear !== set_gear_signature(set_name);
}

function probe_weapon_set(sets, now) {
	for (const name of sets) {
		if (!set_available(name) || !set_profile_unusable(name)) {
			delete _weapon_choice.probe[name];
			continue;
		}

		let probe = _weapon_choice.probe[name];
		if (!probe || now - probe.started > WEAPON_PROBE_MS + SET_PROFILE_REPROBE_MS) {
			probe = _weapon_choice.probe[name] = { started: now, worn_ms: 0, last: 0 };
		}
		if (probe.worn_ms >= WEAPON_PROBE_MS) continue;

		if (is_set_equipped(name)) {
			if (probe.last) probe.worn_ms += now - probe.last;
			probe.last = now;
		} else {
			probe.last = 0;
		}
		return name;
	}
	return null;
}

function smoothed_set_value(set_name, raw, now) {
	if (raw === null || raw === undefined) {
		delete _weapon_choice.values[set_name];
		return raw;
	}

	const window_ms = CONFIG.equipment.weapon_smoothing_ms ?? WEAPON_SMOOTHING_MS;
	const previous = _weapon_choice.values[set_name];

	if (window_ms <= 0 || !previous || now - previous.at > window_ms * 4) {
		_weapon_choice.values[set_name] = { value: raw, at: now };
		return raw;
	}

	const alpha = Math.min(1, (now - previous.at) / window_ms);
	const value = previous.value + (raw - previous.value) * alpha;
	_weapon_choice.values[set_name] = { value, at: now };
	return value;
}

function min_swap_interval_ms() {
	const attacks = CONFIG.equipment.weapon_min_swap_attacks ?? 0;
	if (!attacks) return 0;
	return (attacks * 1000) / (character.frequency || 1);
}

function sample_weapon_choice(sets, value_of, valued, from, to, now, context) {
	if (!CONFIG.combat || !CONFIG.combat.sample_hits || typeof errlog_sample !== "function") return;

	const values = {};
	const raw = {};
	for (const name of sets) {
		const value = valued[name];
		values[name] = value === null || value === undefined ? null : Math.round(value);

		const unsmoothed = set_available(name) ? value_of(name) : null;
		raw[name] = unsmoothed === null || unsmoothed === undefined ? null : Math.round(unsmoothed);
	}

	errlog_sample("weapon_choice", Object.assign({
		from, to, values, raw,
		held_ms: _weapon_choice.since ? now - _weapon_choice.since : 0,
		mp_pct: +(character.mp / character.max_mp).toFixed(2)
	}, typeof context === "function" ? context() : {}));
}

function resolve_weapon_by_value(value_of, context) {
	const sets = CONFIG.equipment.weapon_sets;
	const now = Date.now();

	const worn = observe_worn_set(sets, now);

	_weapon_choice.probing = probe_weapon_set(sets, now);
	if (_weapon_choice.probing) return _weapon_choice.probing;

	const valued = {};
	let best = null;
	let best_value = -Infinity;
	for (const name of sets) {
		if (!set_available(name)) {
			delete _weapon_choice.values[name];
			continue;
		}
		const value = smoothed_set_value(name, value_of(name), now);
		valued[name] = value;
		if (value === null || value === undefined || value <= best_value) continue;
		best_value = value;
		best = name;
	}
	if (!best) return null;

	const hysteresis_ms = CONFIG.equipment.weapon_hysteresis_ms ?? WEAPON_HYSTERESIS_MS;
	const margin = CONFIG.equipment.weapon_switch_margin ?? WEAPON_SWITCH_MARGIN;

	if (worn && worn !== best && set_available(worn)) {
		if (hysteresis_ms > 0 && now - _weapon_choice.since < hysteresis_ms) return worn;

		const min_swap_ms = min_swap_interval_ms();
		if (min_swap_ms > 0 && now - _weapon_choice.since < min_swap_ms) return worn;

		if (margin > 1) {
			const holding = valued[worn];
			if (holding !== null && holding !== undefined && best_value < holding * margin) return worn;
		}
	}

	if (best !== _weapon_choice.proposed) {
		_weapon_choice.proposed = best;
		if (best !== worn) sample_weapon_choice(sets, value_of, valued, worn, best, now, context);
	}
	return best;
}

function weapon_set_to_restore() {
	const sets = CONFIG.equipment.weapon_sets;
	return equipped_set_among(sets) || _weapon_choice.probing || _weapon_choice.worn || first_available_set(sets);
}

function resolve_weapon_set(args) {
	const a = args || {};
	const sets = CONFIG.equipment.weapon_sets;

	if (CONFIG.equipment.weapon_swap_enabled === false) return null;
	if (a.forced) return a.forced;
	if (typeof dungeon_flag === "function" && dungeon_flag("single_weapon")) return sets[0];

	const chosen = resolve_weapon_by_value(name => set_damage_value(name, a.pool, a.width), a.context);
	if (chosen || !a.pool || !a.pool.length) return chosen;
	return first_available_set(sets);
}
