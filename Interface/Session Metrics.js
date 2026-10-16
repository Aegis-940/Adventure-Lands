// --------------------------------------------------------------------------------------------------------------------------------- //
// SESSION METRICS — this session's gold, XP, kills, loot and per-member damage, and the live feed of them to the status page
// --------------------------------------------------------------------------------------------------------------------------------- //

const METRICS_START = performance.now();
const METRICS_SAMPLE_MS = 5000;
const METRICS_MAX_SAMPLES = 60;
const METRICS_INCLUDE_OVERHEAL = false;
const METRICS_INCLUDE_OVER_MANA = false;

const METRICS_DAMAGE_TYPES = {
	DPS: { label: "Total DPS", button: "Total", color: "#E53935" },
	Base: { label: "Base Damage", button: "Base", color: "#6D1B7B" },
	Cleave: { label: "Cleave Damage", button: "Cleave", color: "#8D6E63" },
	Blast: { label: "Blast Damage", button: "Blast", color: "#FB8C00" },
	Burn: { label: "Burn Damage", button: "Burn", color: "#FDD835" },
	HPS: { label: "Healing", button: "Heal", color: "#43A047" },
	MPS: { label: "Mana Steal", button: "Mana", color: "#1E88E5" },
	DR: { label: "Damage Return", button: "Return", color: "#546E7A" },
	Reflect: { label: "Reflection", button: "Reflect", color: "#26A69A" },
};

const metrics = {
	gold: 0,
	largest_gold: 0,
	xp: 0,
	xp_level: character.level,
	xp_last: character.xp,
	kills: 0,
	mob_kills: {},
	items: {},
	damage: {},
	gold_history: [],
	xp_history: [],
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// COLLECTION
// --------------------------------------------------------------------------------------------------------------------------------- //

function metrics_elapsed_s() {
	return (performance.now() - METRICS_START) / 1000;
}

function metrics_damage_entry(id) {
	if (!metrics.damage[id]) {
		metrics.damage[id] = { start: performance.now(), DPS: 0, Base: 0, Cleave: 0, Blast: 0, Burn: 0, HPS: 0, MPS: 0, DR: 0, Reflect: 0 };
	}
	return metrics.damage[id];
}

function metrics_damage_rate(id, type) {
	const entry = metrics.damage[id];
	if (!entry) return 0;
	const elapsed = performance.now() - entry.start;
	return elapsed > 0 ? Math.floor(entry[type] * 1000 / elapsed) : 0;
}

function metrics_damage_kind(data) {
	if (data.source === "burn") return "Burn";
	if (data.splash) return "Blast";
	if (data.source === "cleave") return "Cleave";
	return "Base";
}

function metrics_record_hit(data) {
	const in_party = id => parent.party_list.includes(id);
	const attacker = get_player(data.hid);
	const target = get_player(data.id);

	if (target && !attacker && in_party(data.id)) {
		const e = metrics_damage_entry(data.id);
		if (data.dreturn) {
			e.DR += data.dreturn;
			e.DPS += data.dreturn;
		}
		if (data.reflect) {
			e.Reflect += data.reflect;
			e.DPS += data.reflect;
		}
	}

	if (!attacker || !in_party(data.hid)) return;
	const e = metrics_damage_entry(data.hid);

	if (data.heal || data.lifesteal) {
		const heal = data.heal || 0;
		const lifesteal = data.lifesteal || 0;
		e.HPS += METRICS_INCLUDE_OVERHEAL
			? heal + lifesteal
			: Math.min(heal, target ? target.max_hp - target.hp : 0) + Math.min(lifesteal, attacker.max_hp - attacker.hp);
	}
	if (data.manasteal) {
		e.MPS += METRICS_INCLUDE_OVER_MANA ? data.manasteal : Math.min(data.manasteal, attacker.max_mp - attacker.mp);
	}
	if (data.damage) {
		e.DPS += data.damage;
		e[metrics_damage_kind(data)] += data.damage;
	}
}

function metrics_track_xp() {
	if (character.level !== metrics.xp_level) {
		metrics.xp += parent.G.levels[metrics.xp_level] - metrics.xp_last + character.xp;
	} else {
		metrics.xp += character.xp - metrics.xp_last;
	}
	metrics.xp_level = character.level;
	metrics.xp_last = character.xp;
}

function metrics_push_sample(history, value) {
	history.push({ t: performance.now(), v: value });
	if (history.length > METRICS_MAX_SAMPLES) history.shift();
}

function metrics_sample() {
	metrics_track_xp();
	const elapsed = metrics_elapsed_s();
	metrics_push_sample(metrics.gold_history, metrics.gold / elapsed);
	metrics_push_sample(metrics.xp_history, metrics.xp / elapsed);
}

function metrics_record_kill(data) {
	metrics.kills++;
	metrics.mob_kills[data.mtype] = (metrics.mob_kills[data.mtype] || 0) + 1;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LIVE FEED — the same numbers, once a second, to the sink's status page
// --------------------------------------------------------------------------------------------------------------------------------- //

const METRICS_LIVE_URL = "http://127.0.0.1:8787/live";
const METRICS_LIVE_MS = 1000;
const METRICS_LIVE_BACKOFF_MS = 30000;
const METRICS_LIVE_COOP_ROWS = 12;

let _metrics_live_busy = false;
let _metrics_live_paused_until = 0;

function metrics_damage_snapshot() {
	return Object.keys(metrics.damage).map(id => {
		const player = get_player(id);
		const rates = {};
		for (const type in METRICS_DAMAGE_TYPES) rates[type] = metrics_damage_rate(id, type);
		return { name: player ? player.name : id, ctype: player ? player.ctype : null, rates };
	}).sort((a, b) => b.rates.DPS - a.rates.DPS);
}

function metrics_coop_snapshot() {
	const entries = coop_contributors();
	const total_weight = coop_total_weight(entries);
	const party = entries.filter(e => parent.party_list.includes(e.name));
	return {
		party_points: party.reduce((sum, e) => sum + e.points, 0),
		party_share: entries.length ? party.reduce((sum, e) => sum + coop_share_weight(e.points), 0) / total_weight : 0,
		entries: entries.slice(0, METRICS_LIVE_COOP_ROWS).map(e => ({
			name: e.name, ctype: e.ctype, points: e.points, share: coop_share_weight(e.points) / total_weight,
			party: parent.party_list.includes(e.name),
		})),
	};
}

function metrics_snapshot() {
	metrics_track_xp();
	const target = parent.entities[character.target];
	const own_state = read_state_cache(character.name);
	return {
		character: character.name,
		t: Date.now(),
		session_s: Math.round(metrics_elapsed_s()),
		vitals: {
			ctype: character.ctype, level: character.level, xp: character.xp, max_xp: parent.G.levels[character.level],
			hp: character.hp, max_hp: character.max_hp, mp: character.mp, max_mp: character.max_mp,
			map: character.map, x: Math.round(character.x), y: Math.round(character.y), rip: !!character.rip,
			goal: own_state ? own_state.goal : null, panicking: !!panicking, wallet: character.gold, cc: Math.round(character.cc || 0),
			target: target ? (target.mtype || target.name) : null,
		},
		gold: { total: metrics.gold, largest: metrics.largest_gold },
		xp: { total: metrics.xp },
		kills: { total: metrics.kills, by_mob: metrics.mob_kills },
		items: metrics.items,
		damage: metrics_damage_snapshot(),
		coop: metrics_coop_snapshot(),
		history: {
			gold: metrics.gold_history.map(s => s.v),
			xp: metrics.xp_history.map(s => s.v),
			sample_s: METRICS_SAMPLE_MS / 1000,
		},
	};
}

function metrics_publish() {
	if (_metrics_live_busy || Date.now() < _metrics_live_paused_until) return;
	_metrics_live_busy = true;
	fetch(METRICS_LIVE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(metrics_snapshot()) })
		.catch(() => { _metrics_live_paused_until = Date.now() + METRICS_LIVE_BACKOFF_MS; })
		.finally(() => { _metrics_live_busy = false; });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("Session Metrics", () => {
	on_socket("hit", "metrics_hit_handler", metrics_record_hit);
	on_socket("kill_credit", "metrics_kill_handler", metrics_record_kill);
	on_character("loot", "metrics", data => {
		if (data.gold) {
			const chest_total = Math.round(data.gold / (parent.party[character.name]?.share || 1));
			metrics.gold += chest_total;
			if (chest_total > metrics.largest_gold) metrics.largest_gold = chest_total;
		}
		for (const item of data.items || []) {
			metrics.items[item.name] = (metrics.items[item.name] || 0) + (item.q || 1);
		}
	});
	every("metrics sample", { ms: METRICS_SAMPLE_MS, kind: "ui", fixed: true }, metrics_sample);
	every("metrics live feed", { ms: METRICS_LIVE_MS, kind: "telemetry", fixed: true }, metrics_publish);
});
