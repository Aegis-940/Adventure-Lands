// --------------------------------------------------------------------------------------------------------------------------------- //
// ENCOUNTER REGISTRY — everything specific to one monster, spawn or boss answers from its own file in Encounters/
// --------------------------------------------------------------------------------------------------------------------------------- //

const ENCOUNTER_TIERS = ["situation", "hazard", "spawn"];
const ENCOUNTER_ROLES = ["warrior", "priest", "ranger", "merchant", "all"];
const ENCOUNTER_KEYS = ["tier", "homes", "mtypes", "active", "goal", "steps", "gear", "settings", "home_settings", "allows", "rank",
	"traits", "enter", "leave"];
const ENCOUNTER_RADIUS = 600;

const _encounters = {};
const _encounters_by_mtype = {};
const _encounter_why = {};
const _encounter_conflicts = new Set();
let _encounter_ctx = null;
let _encounters_live = [];

function encounter(name, spec) {
	const enc = Object.assign({ name }, spec);
	_encounters[name] = enc;
	for (const mtype of spec.mtypes || []) {
		if (!_encounters_by_mtype[mtype]) _encounters_by_mtype[mtype] = [];
		_encounters_by_mtype[mtype].push(enc);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONTEXT AND ACTIVITY — rebuilt at most once per CACHE_TTL; spawn encounters follow home, the others decide for themselves
// --------------------------------------------------------------------------------------------------------------------------------- //

function encounter_context() {
	const now = performance.now();
	if (_encounter_ctx && now - _encounter_ctx.at < CACHE_TTL) return _encounter_ctx;

	const all = [];
	const by_type = {};
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.visible) continue;
		if (distance(character, e) > ENCOUNTER_RADIUS) continue;
		all.push(e);
		if (!by_type[e.mtype]) by_type[e.mtype] = [];
		by_type[e.mtype].push(e);
	}

	_encounter_ctx = {
		at: now,
		me: character,
		mobs: { all, by_type, of: type => by_type[type] || [] },
		home,
		destination,
	};
	encounters_refresh(_encounter_ctx);
	return _encounter_ctx;
}

function encounter_live(enc, ctx) {
	if (enc.tier === "spawn") return enc.homes.includes(ctx.home) && !!ctx.destination && character.map === ctx.destination.map;
	return !!enc.active(ctx);
}

function encounters_refresh(ctx) {
	const live = Object.keys(_encounters).sort()
		.map(name => _encounters[name])
		.filter(enc => enc.tier && encounter_live(enc, ctx))
		.sort((a, b) => ENCOUNTER_TIERS.indexOf(a.tier) - ENCOUNTER_TIERS.indexOf(b.tier));

	for (const enc of live) {
		if (_encounters_live.includes(enc)) continue;
		if (enc.enter) enc.enter(ctx);
		bus_emit("encounter_enter", enc.name);
	}
	for (const enc of _encounters_live) {
		if (live.includes(enc)) continue;
		if (enc.leave) enc.leave(ctx);
		bus_emit("encounter_leave", enc.name);
	}
	_encounters_live = live;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// QUESTIONS — context answers come from live encounters, highest tier first; mob answers apply wherever the mob is met
// --------------------------------------------------------------------------------------------------------------------------------- //

function encounter_answers(enc, section) {
	const by_role = enc[section];
	if (!by_role) return [];
	return [by_role[character.ctype], by_role.all].filter(Boolean);
}

function encounter_resolve(value, ...args) {
	return typeof value === "function" ? value(...args) : value;
}

function encounter_context_answer(section, key) {
	const ctx = encounter_context();
	let found = null;
	for (const enc of _encounters_live) {
		if (found && enc.tier !== found.enc.tier) break;
		for (const answers of encounter_answers(enc, section)) {
			if (!(key in answers)) continue;
			const value = encounter_resolve(answers[key], ctx);
			if (value === null || value === undefined) continue;
			if (found) encounter_conflict(section + "." + key, found.enc, enc);
			else found = { enc, value };
			break;
		}
	}
	if (!found) return null;
	encounter_attribute(section + "." + key, found.enc.name, found.value);
	return found;
}

function encounter_conflict(key, a, b) {
	const signature = `${key}: ${a.name} / ${b.name}`;
	if (_encounter_conflicts.has(signature)) return;
	_encounter_conflicts.add(signature);
	errlog_count(`encounter conflict ${signature}`);
}

function encounter_gear(group) {
	const found = encounter_context_answer("gear", group);
	return found ? found.value : null;
}

function encounter_setting(name, fallback) {
	const found = encounter_context_answer("settings", name);
	return found ? found.value : fallback;
}

function encounters_of_home() {
	return Object.keys(_encounters).sort()
		.map(name => _encounters[name])
		.filter(enc => enc.tier === "spawn" && enc.homes.includes(home));
}

function encounter_home_setting(name, fallback) {
	for (const enc of encounters_of_home()) {
		for (const answers of encounter_answers(enc, "home_settings")) {
			if (!(name in answers)) continue;
			const value = encounter_resolve(answers[name], encounter_context());
			if (value === null || value === undefined) continue;
			encounter_attribute("home_settings." + name, enc.name, value);
			return value;
		}
	}
	return fallback;
}

function encounter_goal() {
	for (const enc of encounters_of_home()) {
		if (!enc.goal) continue;
		const goal = enc.goal(encounter_context());
		if (!goal) continue;
		encounter_attribute("goal", enc.name, goal.label || goal.local);
		return goal;
	}
	return null;
}

function encounter_step(local) {
	for (const name of Object.keys(_encounters).sort()) {
		const steps = _encounters[name].steps;
		if (steps && steps[local]) return steps[local];
	}
	return null;
}

function encounter_allows(action, mob) {
	for (const enc of _encounters_by_mtype[mob.mtype] || []) {
		for (const rules of encounter_answers(enc, "allows")) {
			if (!(action in rules)) continue;
			if (encounter_resolve(rules[action], mob, encounter_context())) continue;
			encounter_attribute("allows." + action, enc.name, false);
			return false;
		}
	}
	return true;
}

function encounter_trait(name, mob) {
	for (const enc of _encounters_by_mtype[mob.mtype] || []) {
		for (const traits of encounter_answers(enc, "traits")) {
			if (name in traits) return traits[name];
		}
	}
	return null;
}

function encounter_mtypes(trait) {
	const out = [];
	for (const name of Object.keys(_encounters).sort()) {
		const enc = _encounters[name];
		if (encounter_answers(enc, "traits").some(traits => traits[trait])) out.push(...enc.mtypes);
	}
	return out;
}

function encounter_rank(mob) {
	let rank = 0;
	for (const enc of _encounters_by_mtype[mob.mtype] || []) {
		for (const value of encounter_answers(enc, "rank")) rank += encounter_resolve(value, mob, encounter_context());
	}
	return rank;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTRIBUTION AND CHECKS — which encounter answered, and whether every spec is well formed
// --------------------------------------------------------------------------------------------------------------------------------- //

function encounter_attribute(key, name, value) {
	_encounter_why[key] = { encounter: name, value, at: Date.now() };
}

function why(key) {
	return key ? _encounter_why[key] || null : _encounter_why;
}

function encounters_live_names() {
	return _encounters_live.map(enc => enc.name);
}

function encounters_active() {
	encounter_context();
	return _encounters_live.map(enc => `${enc.name} (${enc.tier})`);
}

function encounter_problems() {
	const problems = [];
	for (const name in _encounters) {
		const enc = _encounters[name];
		const say = text => problems.push(`${name}: ${text}`);
		for (const key in enc) if (key !== "name" && !ENCOUNTER_KEYS.includes(key)) say(`unknown key ${key}`);
		if ("tier" in enc && !ENCOUNTER_TIERS.includes(enc.tier)) say(`unknown tier ${enc.tier}`);
		if ((enc.gear || enc.settings || enc.enter || enc.leave) && !enc.tier) say("gear, settings, enter and leave need a tier");
		if (!enc.tier && !(enc.mtypes || []).length) say("an encounter needs a tier or mtypes");
		if (enc.tier === "spawn" && !Array.isArray(enc.homes)) say("a spawn encounter needs homes");
		if ((enc.home_settings || enc.goal) && enc.tier !== "spawn") say("home_settings and goal belong to a spawn encounter");
		if (enc.goal && typeof enc.goal !== "function") say("goal must be a function of ctx");
		for (const local in enc.steps || {}) if (typeof enc.steps[local] !== "function") say(`steps.${local} must be a function of the goal`);
		if (enc.tier && enc.tier !== "spawn" && typeof enc.active !== "function") say(`a ${enc.tier} encounter needs active(ctx)`);
		if ((enc.allows || enc.rank || enc.traits) && !(enc.mtypes || []).length) say("allows, rank and traits need mtypes");
		for (const section of ["gear", "settings", "home_settings", "allows", "rank", "traits"]) {
			for (const role in enc[section] || {}) if (!ENCOUNTER_ROLES.includes(role)) say(`${section} has unknown role ${role}`);
		}
		const gear = (enc.gear || {})[character.ctype] || {};
		for (const group in gear) {
			if (typeof gear[group] === "string" && !equipment_sets[gear[group]]) say(`gear.${character.ctype}.${group} names unknown set ${gear[group]}`);
		}
	}
	return problems;
}

console_api({
	why: "which encounter gave an answer: why(\"gear.weapon\"), or why() for all",
	encounters_active: "the live encounters, highest tier first",
	encounter_problems: "spec errors in the registered encounters",
});
