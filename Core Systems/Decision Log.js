// --------------------------------------------------------------------------------------------------------------------------------- //
// DECISION LOG — what this character chose and what came of it, summed per ledger window and archived beside the ledger
// --------------------------------------------------------------------------------------------------------------------------------- //

const DECISION_RING = 50;
const DECISION_RING_MS = 10000;
const DECISION_SAMPLE_MS = 1000;
const DECISION_PULL_AGGRO_CAP = 10;

let _decisions = null;
const _decision_ring = [];
let _decision_goal = null;

function decision_window(now) {
	return {
		started: now,
		casts: {},
		values: {},
		actions: {},
		pulls: {},
		bursts: {},
		gear: {},
		panics: {},
		outcomes: {},
		taken: { damage: 0, hits: 0, biggest: 0, by_mtype: {} },
		worn_s: {},
		goal_s: {},
		panic_s: 0,
	};
}

function decision_add(map, key, field, amount) {
	const entry = map[key] || (map[key] = {});
	entry[field] = (entry[field] || 0) + amount;
	return entry;
}

function decision_ring_push(kind, name, detail) {
	_decision_ring.push(Object.assign({ t: Date.now(), kind, name }, detail));
	if (_decision_ring.length > DECISION_RING) _decision_ring.shift();
}

function recent_decisions() {
	const now = Date.now();
	return _decision_ring.filter(d => now - d.t <= DECISION_RING_MS).map(d => Object.assign({}, d, { t: undefined, ms_ago: now - d.t }));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RECORDERS — called from the choke points; like errlog_*, they never throw into their caller
// --------------------------------------------------------------------------------------------------------------------------------- //

function record_cast_value(name, value) {
	try {
		decision_add(_decisions.values, name, "n", 1);
		decision_add(_decisions.values, name, "predicted", Math.round(value));
	} catch (e) { }
}

function record_action(label, target) {
	try {
		const entry = decision_add(_decisions.actions, label, "n", 1);
		const pull = !!target && target.type === "monster" && !target.target;
		if (!pull) return;
		const aggro = Math.min(monsters_targeting_me(), DECISION_PULL_AGGRO_CAP);
		entry.pulls = (entry.pulls || 0) + 1;
		_decisions.pulls[aggro] = (_decisions.pulls[aggro] || 0) + 1;
		decision_ring_push("pull", label, { mob: target.mtype, aggro });
	} catch (e) { }
}

function record_burst(owner, ops) {
	try {
		decision_add(_decisions.bursts, owner, "n", 1);
		decision_add(_decisions.bursts, owner, "ops", ops);
		decision_ring_push("burst", owner, { ops });
	} catch (e) { }
}

function record_gear(group, sets) {
	try {
		const name = group + ":" + sets.join("+");
		decision_add(_decisions.gear, name, "n", 1);
		decision_ring_push("gear", name);
	} catch (e) { }
}

function record_panic(reason) {
	try {
		decision_add(_decisions.panics, reason, "n", 1);
		decision_ring_push("panic", reason);
	} catch (e) { }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// OUTCOMES — every cast the server confirms, and every hit by or on this character
// --------------------------------------------------------------------------------------------------------------------------------- //

function decision_on_skill_timeout(data) {
	if (!data || !data.name || data.reason === "attack_ms" || !G.skills[data.name]) return;
	const entry = decision_add(_decisions.casts, data.name, "n", 1);
	entry.mana = (entry.mana || 0) + skill_mp_cost(data.name);
	entry.penalty_ms = (entry.penalty_ms || 0) + (data.penalty || 0);
	if (data.name !== "attack") decision_ring_push("cast", data.name);
}

function is_me(id) {
	return id === character.id || id === character.name;
}

function normalise_hit(data) {
	const attacker = parent.entities[data.hid];
	return {
		by_me: is_me(data.hid),
		on_me: is_me(data.id),
		source: data.source || "attack",
		damage: data.damage || 0,
		kill: !!data.kill,
		miss: !!(data.miss || data.evade),
		from: attacker ? attacker.mtype || attacker.name : data.hid,
	};
}

function decision_on_hit(data) {
	if (!data || data.heal) return;
	const hit = normalise_hit(data);
	if (hit.by_me) {
		const entry = decision_add(_decisions.outcomes, hit.source, "hits", 1);
		entry.damage = (entry.damage || 0) + hit.damage;
		if (hit.kill) entry.kills = (entry.kills || 0) + 1;
		if (hit.miss) entry.misses = (entry.misses || 0) + 1;
	}
	if (hit.on_me && hit.damage) {
		const taken = _decisions.taken;
		taken.damage += hit.damage;
		taken.hits++;
		taken.biggest = Math.max(taken.biggest, hit.damage);
		taken.by_mtype[hit.from] = (taken.by_mtype[hit.from] || 0) + hit.damage;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TIME — where each second went: the weapon worn, the goal, panic
// --------------------------------------------------------------------------------------------------------------------------------- //

function decision_sample() {
	const seconds = DECISION_SAMPLE_MS / 1000;
	const goal = current_goal_label() || "none";
	decision_add(_decisions, "worn_s", weapon_label(), seconds);
	decision_add(_decisions, "goal_s", goal, seconds);
	if (panicking) _decisions.panic_s += seconds;
	if (goal !== _decision_goal) {
		_decision_goal = goal;
		decision_ring_push("goal", goal);
	}
}

function decision_window_close(data) {
	const w = _decisions;
	_decisions = decision_window(data.now);
	errlog_archive("decisions", Object.assign({}, w, { started: undefined, window_s: Math.round((data.now - w.started) / 1000) }));
}

function decision_log_start() {
	_decisions = decision_window(Date.now());
	on_socket("skill_timeout", "decision_casts", decision_on_skill_timeout);
	on_socket("hit", "decision_outcomes", decision_on_hit);
	bus_on("ledger_window", "decision_window", decision_window_close);
	every("decision sample", { ms: DECISION_SAMPLE_MS, kind: "telemetry", fixed: true }, decision_sample);
}
