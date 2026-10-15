// --------------------------------------------------------------------------------------------------------------------------------- //
// DANGER LOG — every death and close call: when, who, against what, and the state around it, archived to danger.jsonl
// --------------------------------------------------------------------------------------------------------------------------------- //

const DANGER_TICK_MS = 250;
const CLOSE_CALL_PCT = 0.30;
const CLOSE_CALL_CLEAR_PCT = 0.60;
const DANGER_HIT_WINDOW_MS = 10000;
const DANGER_HITS_KEPT = 80;
const DANGER_NEARBY_PX = 300;
const DANGER_SOURCES_KEPT = 5;
const BOSS_SNAPSHOT_MS = 60000;
const BOSS_SNAPSHOT_RANGE = 400;

let _danger_hits = [];
let _boss_snapshot = { id: null, at: 0 };
let _danger_episode = null;
let _danger_rip = false;

function danger_source(id) {
	const e = parent.entities[id] || (id === character.id ? character : null);
	if (!e) return { name: String(id), kind: "gone" };
	return e.type === "monster" ? { name: e.mtype, kind: "monster" } : { name: e.name, kind: "player" };
}

function danger_on_hit(data) {
	if (data.id !== character.id || !data.damage) return;
	const from = danger_source(data.hid);
	_danger_hits.push({ t: Date.now(), from: from.name, kind: from.kind, damage: data.damage, source: data.source || null, crit: !!data.crit });
	if (_danger_hits.length > DANGER_HITS_KEPT) _danger_hits.shift();
}

function danger_party() {
	const out = {};
	for (const name of COHESION_FOLLOWERS.concat([MOVEMENT_LEADER])) {
		if (name === character.name) continue;
		const s = read_state_cache(name);
		out[name] = s ? (s.rip ? "dead" : Math.round(100 * s.hp / s.max_hp)) : null;
	}
	return out;
}

function danger_context() {
	const now = Date.now();
	const recent = _danger_hits.filter(h => now - h.t <= DANGER_HIT_WINDOW_MS);
	const by_source = {};
	for (const h of recent) {
		const b = by_source[h.from] = by_source[h.from] || { name: h.from, kind: h.kind, damage: 0, hits: 0 };
		b.damage += h.damage;
		b.hits++;
	}
	const biggest = recent.reduce((top, h) => (!top || h.damage > top.damage ? h : top), null);
	const last = recent[recent.length - 1] || null;

	let targeting = 0;
	const nearby = {};
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (e.target === character.name) targeting++;
		if (distance(character, e) <= DANGER_NEARBY_PX) nearby[e.mtype] = (nearby[e.mtype] || 0) + 1;
	}

	return {
		map: character.map, x: Math.round(character.x), y: Math.round(character.y),
		home, goal: current_goal_label(), panicking: !!panicking,
		hp_pct: character.max_hp ? Math.round(100 * character.hp / character.max_hp) : 0, max_hp: character.max_hp,
		mp_pct: character.max_mp ? Math.round(100 * character.mp / character.max_mp) : 0,
		damage_10s: recent.reduce((sum, h) => sum + h.damage, 0),
		sources: Object.values(by_source).sort((a, b) => b.damage - a.damage).slice(0, DANGER_SOURCES_KEPT),
		biggest: biggest && { from: biggest.from, damage: biggest.damage, source: biggest.source, crit: biggest.crit },
		last_hit: last && { from: last.from, damage: last.damage, source: last.source, ms_ago: now - last.t },
		targeting, nearby,
		debuffs: Object.keys(character.s || {}).filter(k => G.conditions[k] && G.conditions[k].debuff),
		party: danger_party(),
		potions: { hp: quantity("hpot1"), mp: quantity("mpot1") },
		decisions: recent_decisions(),
	};
}

function danger_record(event, extra) {
	errlog_archive("danger", Object.assign({ event }, extra));
	errlog_count("danger " + event);
}

function danger_tick() {
	const now = Date.now();
	const rip = !!character.rip;
	const hp_pct = character.max_hp ? character.hp / character.max_hp : 1;

	if (rip && !_danger_rip) {
		const ctx = danger_context();
		danger_record("death", Object.assign(ctx, {
			killer: ctx.last_hit ? ctx.last_hit.from : null,
			low_for_s: _danger_episode ? Math.round((now - _danger_episode.started) / 1000) : null,
		}));
		errlog_snapshot("death");
		_danger_episode = null;
	} else if (!rip) {
		if (!_danger_episode && hp_pct < CLOSE_CALL_PCT) {
			_danger_episode = { started: now, min_pct: hp_pct, at_min: danger_context() };
			errlog_snapshot("close_call");
		} else if (_danger_episode) {
			if (hp_pct < _danger_episode.min_pct) {
				_danger_episode.min_pct = hp_pct;
				_danger_episode.at_min = danger_context();
			}
			if (hp_pct >= CLOSE_CALL_CLEAR_PCT) {
				danger_record("close_call", Object.assign(_danger_episode.at_min, {
					min_hp_pct: Math.round(100 * _danger_episode.min_pct),
					low_for_s: Math.round((now - _danger_episode.started) / 1000),
				}));
				_danger_episode = null;
			}
		}
	}
	_danger_rip = rip;
	boss_snapshot_check(now);
}

function boss_snapshot_check(now) {
	let boss = null;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !ALL_BOSSES.includes(e.mtype) || e.hp >= e.max_hp) continue;
		if (distance(character, e) <= BOSS_SNAPSHOT_RANGE) {
			boss = e;
			break;
		}
	}
	if (!boss) return;
	if (boss.id === _boss_snapshot.id && now - _boss_snapshot.at < BOSS_SNAPSHOT_MS) return;
	_boss_snapshot = { id: boss.id, at: now };
	errlog_snapshot("boss " + boss.mtype);
}

function danger_log_start() {
	on_socket("hit", "danger_hit_handler", danger_on_hit);
	every("danger_tick", { ms: DANGER_TICK_MS, kind: "telemetry", fixed: true }, danger_tick);
}
