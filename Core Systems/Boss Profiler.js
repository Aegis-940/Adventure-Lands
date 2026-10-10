// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS PROFILER — what every player on a cooperative boss does with it: swings, skills, crits, burn, buffs, gear and coop points
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSS_PROFILE_TICK_MS = 1000;
const BOSS_PROFILE_GONE_MS = 15000;
const BOSS_PROFILE_KILL_GRACE_MS = 3000;
const BOSS_PROFILE_MIN_SECS = 10;
const BOSS_PROFILE_HISTORY = 10;
const BOSS_PROFILE_TANK_MULT = 0.25;
const BOSS_PROFILE_MP_LOW = 0.2;

const _boss_fights = {};
const _boss_fights_done = {};
const _boss_profile_history = [];

function new_boss_fight(boss) {
	return {
		id: boss.id,
		mtype: boss.mtype,
		max_hp: boss.max_hp,
		first: Date.now(),
		last_seen: Date.now(),
		killed_at: 0,
		ticks: 0,
		conditions: {},
		players: {}
	};
}

function fight_player(fight, name) {
	let p = fight.players[name];
	if (!p) {
		p = fight.players[name] = {
			first_act: 0, last_act: 0,
			actions: {}, hits: {},
			boss_dmg: 0, other_dmg: 0,
			kills: 0, sugarrush: 0, lifesteal: 0, burn_procs: 0, heal: 0,
			tanked_raw: 0, tanked: 0, tanked_hits: 0,
			ticks: 0, dead: 0, targeted: 0, dist_sum: 0, mp_low: 0,
			attack_sum: 0, freq_sum: 0, pdps_sum: 0,
			buffs: {}, weapons: {},
			coop_first: null, coop_last: null,
			ctype: null, level: null, range: null, speed: null, armor: null, resistance: null, max_hp: null,
			gear: null
		};
	}
	return p;
}

function profiled_player_name(id) {
	if (id === character.id || id === character.name) return character.name;
	const e = parent.entities[id];
	return e && e.type === "character" && !e.npc ? e.name : null;
}

function fight_for(target_id) {
	if (_boss_fights[target_id]) return _boss_fights[target_id];
	for (const id in _boss_fights) return _boss_fights[id];
	return null;
}

function profile_bucket(bucket, key, fields) {
	if (!bucket[key]) bucket[key] = Object.assign({}, fields);
	return bucket[key];
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SOCKET EVENTS
// --------------------------------------------------------------------------------------------------------------------------------- //

function profile_action(data) {
	if (!data || !data.attacker) return;

	const boss_fight = _boss_fights[data.attacker];
	if (boss_fight) {
		const victim = profiled_player_name(data.target);
		if (victim && data.damage) fight_player(boss_fight, victim).tanked_raw += data.damage;
		return;
	}

	const name = profiled_player_name(data.attacker);
	if (!name) return;
	const fight = fight_for(data.target);
	if (!fight) return;

	const p = fight_player(fight, name);
	const now = Date.now();
	if (!p.first_act) p.first_act = now;
	p.last_act = now;

	const a = profile_bucket(p.actions, data.type || data.source || "?", { n: 0, dmg: 0, boss: 0 });
	a.n++;
	a.dmg += data.damage || 0;
	if (data.target === fight.id) a.boss++;
	if (data.conditions && data.conditions.includes("burned")) p.burn_procs++;
}

function profile_hit(data) {
	if (!data || !data.hid) return;

	const boss_fight = _boss_fights[data.hid];
	if (boss_fight) {
		const victim = profiled_player_name(data.id);
		if (!victim || !data.damage) return;
		const v = fight_player(boss_fight, victim);
		v.tanked += data.damage;
		v.tanked_hits++;
		return;
	}

	const name = profiled_player_name(data.hid);
	if (!name) return;
	const fight = fight_for(data.id);
	if (!fight) return;

	const p = fight_player(fight, name);
	if (data.heal) {
		p.heal += data.heal;
		return;
	}

	const key = data.source === "burn" ? "burn" : data.splash ? "splash" : (data.source || "?");
	const h = profile_bucket(p.hits, key, { n: 0, dmg: 0, boss_dmg: 0, crits: 0, crit_mult: 0, miss: 0 });
	if (data.miss || data.evade || data.avoid) {
		h.miss++;
		return;
	}

	const damage = data.damage || 0;
	h.n++;
	h.dmg += damage;
	if (data.id === fight.id) {
		h.boss_dmg += damage;
		p.boss_dmg += damage;
	} else {
		p.other_dmg += damage;
	}
	if (data.crit) {
		h.crits++;
		h.crit_mult += data.crit;
	}
	if (data.trigger === "sugarrush") p.sugarrush++;
	if (data.lifesteal) p.lifesteal += data.lifesteal;
	if (data.kill) {
		p.kills++;
		if (data.id === fight.id && !fight.killed_at) fight.killed_at = Date.now();
	}
}

if (parent.socket._boss_profile_action) {
	parent.socket.off("action", parent.socket._boss_profile_action);
}
parent.socket._boss_profile_action = data => {
	try { profile_action(data); } catch (e) { }
};
parent.socket.on("action", parent.socket._boss_profile_action);

if (parent.socket._boss_profile_hit) {
	parent.socket.off("hit", parent.socket._boss_profile_hit);
}
parent.socket._boss_profile_hit = data => {
	try { profile_hit(data); } catch (e) { }
};
parent.socket.on("hit", parent.socket._boss_profile_hit);

// --------------------------------------------------------------------------------------------------------------------------------- //
// SAMPLING
// --------------------------------------------------------------------------------------------------------------------------------- //

function gear_snapshot(slots) {
	const out = {};
	for (const slot in slots || {}) {
		const item = slots[slot];
		if (!item || slot.indexOf("trade") === 0) continue;
		out[slot] = item;
	}
	return out;
}

function sample_fight_player(fight, boss, pl) {
	const coop = pl.s && pl.s.coop;
	const on_boss = coop && coop.id === fight.id;
	if (!on_boss && !fight.players[pl.name]) return;

	const p = fight_player(fight, pl.name);
	p.ticks++;
	if (pl.rip) p.dead++;
	if (boss.target === pl.name) p.targeted++;
	if (pl.max_mp && pl.mp < pl.max_mp * BOSS_PROFILE_MP_LOW) p.mp_low++;
	p.dist_sum += distance(pl, boss);
	p.attack_sum += pl.attack || 0;
	p.freq_sum += pl.frequency || 0;
	p.pdps_sum += pl.pdps || 0;

	for (const key in pl.s || {}) {
		if (key !== "coop") p.buffs[key] = (p.buffs[key] || 0) + 1;
	}

	const mainhand = pl.slots && pl.slots.mainhand ? pl.slots.mainhand.name : "none";
	const offhand = pl.slots && pl.slots.offhand ? pl.slots.offhand.name : "none";
	const weapon = `${mainhand}/${offhand}`;
	p.weapons[weapon] = (p.weapons[weapon] || 0) + 1;

	if (on_boss) {
		if (p.coop_first === null) p.coop_first = coop.p;
		p.coop_last = coop.p;
	}

	p.ctype = pl.ctype;
	p.level = pl.level;
	p.range = pl.range;
	p.speed = pl.speed;
	p.armor = pl.armor;
	p.resistance = pl.resistance;
	p.max_hp = pl.max_hp;
	if (!pl.rip) p.gear = gear_snapshot(pl.slots);
}

function boss_profile_tick() {
	const now = Date.now();
	const players = [character].concat(Object.values(parent.entities).filter(e => e.type === "character" && !e.npc));

	for (const id in parent.entities) {
		const boss = parent.entities[id];
		if (boss.type !== "monster" || !is_coop_boss(boss) || boss.dead || _boss_fights_done[id]) continue;
		if (!_boss_fights[id]) _boss_fights[id] = new_boss_fight(boss);
		const fight = _boss_fights[id];
		fight.last_seen = now;
		fight.hp_last = boss.hp;
		fight.ticks++;
		for (const key in boss.s || {}) fight.conditions[key] = (fight.conditions[key] || 0) + 1;
		for (const pl of players) sample_fight_player(fight, boss, pl);
	}

	for (const id in _boss_fights) {
		const fight = _boss_fights[id];
		const over = fight.killed_at
			? now - fight.killed_at > BOSS_PROFILE_KILL_GRACE_MS
			: now - fight.last_seen > BOSS_PROFILE_GONE_MS;
		if (!over) continue;
		delete _boss_fights[id];
		_boss_fights_done[id] = true;
		emit_boss_profile(fight);
	}
}

setInterval(() => { try { boss_profile_tick(); } catch (e) { } }, BOSS_PROFILE_TICK_MS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// REPORT
// --------------------------------------------------------------------------------------------------------------------------------- //

function profile_ratio(a, b, digits) {
	return b ? +(a / b).toFixed(digits) : null;
}

function player_profile(p) {
	const engaged = p.last_act > p.first_act ? (p.last_act - p.first_act) / 1000 : 0;
	const coop_gain = p.coop_first !== null ? p.coop_last - p.coop_first : null;
	const explained = p.boss_dmg + BOSS_PROFILE_TANK_MULT * p.tanked_raw;
	const direct = Object.keys(p.hits).filter(k => k !== "burn" && k !== "splash")
		.reduce((s, k) => ({ n: s.n + p.hits[k].n, crits: s.crits + p.hits[k].crits, mult: s.mult + p.hits[k].crit_mult }), { n: 0, crits: 0, mult: 0 });
	const procs = Object.keys(p.actions).reduce((s, k) => s + (p.actions[k].dmg > 0 ? p.actions[k].n : 0), 0);
	const pct = counts => {
		const out = {};
		for (const k in counts) out[k] = profile_ratio(counts[k], p.ticks, 2);
		return out;
	};

	return {
		ctype: p.ctype, level: p.level,
		attack: p.ticks ? Math.round(p.attack_sum / p.ticks) : null,
		frequency: profile_ratio(p.freq_sum, p.ticks, 3),
		range: p.range, speed: p.speed, armor: p.armor, resistance: p.resistance, max_hp: p.max_hp,
		engaged_secs: +engaged.toFixed(1),
		boss_dmg: Math.round(p.boss_dmg),
		boss_dps: engaged ? Math.round(p.boss_dmg / engaged) : null,
		other_dmg: Math.round(p.other_dmg),
		coop_first: p.coop_first, coop_last: p.coop_last, coop_gain,
		tanked_raw: Math.round(p.tanked_raw), tanked: Math.round(p.tanked), tanked_hits: p.tanked_hits,
		coop_per_explained: coop_gain !== null ? profile_ratio(coop_gain, explained, 3) : null,
		crit_rate: profile_ratio(direct.crits, direct.n, 3),
		crit_mult: profile_ratio(direct.mult, direct.crits, 3),
		burn_procs: p.burn_procs,
		burn_proc_rate: profile_ratio(p.burn_procs, procs, 3),
		actions_per_sec: engaged ? +(procs / engaged).toFixed(2) : null,
		kills: p.kills, sugarrush: p.sugarrush, lifesteal: p.lifesteal, heal: Math.round(p.heal),
		pdps: p.ticks ? Math.round(p.pdps_sum / p.ticks) : null,
		dist_avg: p.ticks ? Math.round(p.dist_sum / p.ticks) : null,
		targeted_pct: profile_ratio(p.targeted, p.ticks, 2),
		dead_pct: profile_ratio(p.dead, p.ticks, 2),
		mp_low_pct: profile_ratio(p.mp_low, p.ticks, 2),
		ticks: p.ticks,
		actions: p.actions,
		hits: p.hits,
		buffs: pct(p.buffs),
		weapons: pct(p.weapons),
		gear: p.gear
	};
}

function emit_boss_profile(fight) {
	const secs = (fight.last_seen - fight.first) / 1000;
	if (secs < BOSS_PROFILE_MIN_SECS) return;

	const players = {};
	for (const name in fight.players) {
		const p = fight.players[name];
		if (!p.boss_dmg && p.coop_last === null && !p.tanked) continue;
		players[name] = player_profile(p);
	}
	if (!Object.keys(players).length) return;

	const conditions = {};
	for (const key in fight.conditions) conditions[key] = profile_ratio(fight.conditions[key], fight.ticks, 2);

	const report = {
		boss: fight.mtype,
		boss_id: fight.id,
		boss_max_hp: fight.max_hp,
		killed: !!fight.killed_at,
		hp_left: fight.killed_at ? 0 : fight.hp_last,
		fight_secs: +secs.toFixed(1),
		boss_conditions: conditions,
		observer: character.name,
		server: parent.server_region + parent.server_identifier,
		home: character.home || null,
		players
	};

	errlog_sample("boss_profile", report);
	_boss_profile_history.push(report);
	if (_boss_profile_history.length > BOSS_PROFILE_HISTORY) _boss_profile_history.shift();

	const top = Object.keys(players)
		.filter(n => players[n].boss_dps)
		.sort((a, b) => players[b].boss_dps - players[a].boss_dps)
		.slice(0, 5)
		.map(n => `${n} ${commas(players[n].boss_dps)}`);
	game_log(`📊 ${fight.mtype} boss dps: ${top.join(", ")}`, "#96a4ff");
}

function al_boss_profiles(name) {
	if (!name) return _boss_profile_history;
	return _boss_profile_history.map(r => Object.assign({ boss: r.boss, fight_secs: r.fight_secs }, r.players[name] || {}));
}
