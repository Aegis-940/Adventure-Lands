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

function set_profile_stale(set_name, max_age_ms) {
	const profile = get_set_profile(set_name);
	if (!profile) return true;
	if (profile.gear && profile.gear !== set_gear_signature(set_name)) return true;
	return Date.now() - (profile.at || 0) > (max_age_ms || SET_PROFILE_REPROBE_MS);
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
// WEAPON CHOICE — probe unprofiled sets while they are worn, then hold the best-valued set with hysteresis and a margin
// --------------------------------------------------------------------------------------------------------------------------------- //

const WEAPON_PROBE_MS = 20000;
const WEAPON_HYSTERESIS_MS = 3000;
const WEAPON_SWITCH_MARGIN = 1.1;

var _weapon_choice = { worn: null, since: 0, probe: {}, probing: null, proposed: null };

function equipped_set_among(sets) {
	return sets.find(name => is_set_equipped(name)) || null;
}

function first_available_set(sets) {
	return sets.find(name => set_available(name)) || null;
}

function observe_worn_set(sets, now, choice) {
	const worn = equipped_set_among(sets);
	if (worn && worn !== choice.worn) {
		choice.worn = worn;
		choice.since = now;
	}
	return choice.worn;
}

function probe_weapon_set(sets, now, choice, stale) {
	for (const name of sets) {
		if (!set_available(name) || !stale(name)) {
			delete choice.probe[name];
			continue;
		}

		let probe = choice.probe[name];
		if (!probe || now - probe.started > WEAPON_PROBE_MS + SET_PROFILE_REPROBE_MS) {
			probe = choice.probe[name] = { started: now, worn_ms: 0, last: 0 };
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

function sample_weapon_choice(sets, value_of, from, to, now, context, choice, label) {
	if (!CONFIG.combat || !CONFIG.combat.sample_hits || typeof errlog_sample !== "function") return;

	const values = {};
	for (const name of sets) {
		const value = set_available(name) ? value_of(name) : null;
		values[name] = value === null || value === undefined ? null : Math.round(value);
	}

	errlog_sample(label, Object.assign({
		from, to, values,
		held_ms: choice.since ? now - choice.since : 0,
		mp_pct: +(character.mp / character.max_mp).toFixed(2)
	}, typeof context === "function" ? context() : {}));
}

function resolve_weapon_by_value(value_of, context, options) {
	const opts = options || {};
	const sets = opts.sets || CONFIG.equipment.weapon_sets;
	const choice = opts.choice || _weapon_choice;
	const label = opts.label || "weapon_choice";
	const stale = opts.stale || (name => set_profile_stale(name, SET_PROFILE_REPROBE_MS));
	const now = Date.now();

	const worn = observe_worn_set(sets, now, choice);

	choice.probing = probe_weapon_set(sets, now, choice, stale);
	if (choice.probing) return choice.probing;

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

	if (worn && worn !== best && set_available(worn)) {
		const hysteresis_ms = opts.hysteresis_ms ?? CONFIG.equipment.weapon_hysteresis_ms ?? WEAPON_HYSTERESIS_MS;
		const margin = opts.margin ?? CONFIG.equipment.weapon_switch_margin ?? WEAPON_SWITCH_MARGIN;
		if (now - choice.since < hysteresis_ms) return worn;
		const holding = value_of(worn);
		if (holding !== null && holding !== undefined && best_value < holding * margin) return worn;
	}

	if (best !== choice.proposed) {
		choice.proposed = best;
		if (best !== worn) sample_weapon_choice(sets, value_of, worn, best, now, context, choice, label);
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
