// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR LOG — persistent, cross-character recorder.
// --------------------------------------------------------------------------------------------------------------------------------- //

const ERRLOG_KEY = "AL_errors_";
const ERRLOG_MAX_RECORDS = 200;
const ERRLOG_MAX_TIMELINE = 80;
const ERRLOG_MAX_DEATHS = 6;
const ERRLOG_MAX_SAMPLES = 400;
const ERRLOG_VITALS_SAMPLES = 10;
const ERRLOG_VITALS_MS = 1000;
const ERRLOG_FLUSH_MS = 5000;
const ERRLOG_MSG_CAP = 400;

const ERRLOG_MAX_HEALS = 15;

const ERRLOG_SCHEMA = 2;

let _errlog = { session: null, schema: ERRLOG_SCHEMA, records: {}, timeline: [], deaths: [], counts: {}, samples: [] };
let _errlog_dirty = false;
let _errlog_recording = false;
let _errlog_vitals = [];
let _errlog_was_rip = false;
let _errlog_heals = [];
const _errlog_beats = {};
const _errlog_beats_last = {};

function _errlog_key() {
	return ERRLOG_KEY + ((character && character.name) || "unknown");
}

function _errlog_fmt(e) {
	if (e === null || e === undefined) return String(e);
	if (typeof e === "string") return e;
	if (e.message) return e.stack || e.message;
	try { return JSON.stringify(e); } catch (x) { return String(e); }
}

function _errlog_signature(ctx, msg) {
	return ctx + "|" + msg.replace(/\d+/g, "#").slice(0, 200);
}

function _errlog_build() {
	try {
		const m = (window.__AL_BASE__ || "").match(/@([0-9a-f]{7,40})\//);
		return m ? m[1].slice(0, 7) : "main";
	} catch (e) { return "?"; }
}

function _errlog_context() {
	try {
		return {
			map: character.map,
			x: Math.round(character.x), y: Math.round(character.y),
			hp: character.hp, max_hp: character.max_hp,
			mp: character.mp, max_mp: character.max_mp,
			cc: Math.round(character.cc || 0),
			rip: !!character.rip,
			ping: (parent.pings && parent.pings.length) ? Math.round(Math.min(...parent.pings)) : null,
			panicking: (typeof panicking !== "undefined") ? !!panicking : null
		};
	} catch (e) { return null; }
}

function _errlog_threat() {
	try {
		const near = {};
		let targeting = 0;
		for (const id in parent.entities) {
			const e = parent.entities[id];
			if (!e || e.type !== "monster" || e.dead) continue;
			if (distance(character, e) > 300) continue;
			near[e.mtype] = (near[e.mtype] || 0) + 1;
			if (e.target === character.name) targeting++;
		}
		return { near, targeting };
	} catch (e) { return null; }
}

function _errlog_load() {
	try {
		const raw = localStorage.getItem(_errlog_key());
		const prev = raw ? JSON.parse(raw) : null;
		if (prev && prev.records && prev.schema === ERRLOG_SCHEMA) {
			_errlog = {
				session: prev.session || null,
				schema: ERRLOG_SCHEMA,
				records: prev.records || {},
				timeline: prev.timeline || [],
				deaths: prev.deaths || [],
				counts: prev.counts || {},
				samples: prev.samples || []
			};
		}
	} catch (e) { }
}

function _errlog_flush() {
	if (!_errlog_dirty) return;
	_errlog_dirty = false;
	const t0 = Date.now();
	try {
		const keys = Object.keys(_errlog.records);
		if (keys.length > ERRLOG_MAX_RECORDS) {
			keys.sort((a, b) => _errlog.records[a].last - _errlog.records[b].last)
				.slice(0, keys.length - ERRLOG_MAX_RECORDS)
				.forEach(k => delete _errlog.records[k]);
		}
		const blob = JSON.stringify(_errlog);
		errlog_time("io flush stringify", Date.now() - t0);
		const t1 = Date.now();
		localStorage.setItem(_errlog_key(), blob);
		errlog_time("io flush setItem", Date.now() - t1);
		errlog_count("io flush kb " + Math.round(blob.length / 1024));
	} catch (e) {
	}
}

function errlog_record(ctx, raw_msg) {
	if (_errlog_recording) return;
	_errlog_recording = true;
	try {
		const msg = _errlog_fmt(raw_msg).slice(0, ERRLOG_MSG_CAP);
		const sig = _errlog_signature(ctx, msg);
		const now = Date.now();

		const existing = _errlog.records[sig];
		if (existing) {
			existing.count++;
			existing.last = now;
		} else {
			_errlog.records[sig] = {
				ctx, msg, count: 1, first: now, last: now,
				build: _errlog_build(),
				where: _errlog_context()
			};
		}

		_errlog.timeline.push({ t: now, ctx, msg: msg.slice(0, 160) });
		if (_errlog.timeline.length > ERRLOG_MAX_TIMELINE) _errlog.timeline.shift();

		_errlog_dirty = true;
	} catch (e) {
	} finally {
		_errlog_recording = false;
	}
}

function errlog_sample(kind, data) {
	try {
		if (!_errlog.samples) _errlog.samples = [];
		_errlog.samples.push(Object.assign({ t: Date.now(), kind }, data));
		if (_errlog.samples.length > ERRLOG_MAX_SAMPLES) _errlog.samples.shift();
		_errlog_dirty = true;
	} catch (e) { }
}

function errlog_count(bucket) {
	try {
		_errlog.counts[bucket] = (_errlog.counts[bucket] || 0) + 1;
	} catch (e) { }
}

function errlog_beat(name) {
	try { _errlog_beats[name] = (_errlog_beats[name] || 0) + 1; } catch (e) { }
}

const ERRLOG_TIME_BUCKETS = [5, 20, 50, 100, 250, 500, 1000];

function errlog_time(bucket, ms) {
	try {
		let label = "1000+";
		for (const b of ERRLOG_TIME_BUCKETS) {
			if (ms < b) { label = "<" + b; break; }
		}
		errlog_count(bucket + " " + label);
	} catch (e) { }
}

let _errlog_lag_due = 0;

function _errlog_lag_probe() {
	const now = Date.now();
	if (_errlog_lag_due) errlog_time("lag eventloop", now - _errlog_lag_due);
	try {
		if (parent.pings && parent.pings.length) errlog_time("net ping", Math.min(...parent.pings));
	} catch (e) { }
	_errlog_lag_due = now + 100;
	setTimeout(_errlog_lag_probe, 100);
}
setTimeout(_errlog_lag_probe, 100);

// --------------------------------------------------------------------------------------------------------------------------------- //
// CAPTURE POINTS — hooks only, no call sites elsewhere
// --------------------------------------------------------------------------------------------------------------------------------- //

_errlog_load();

_errlog.session = {
	started: Date.now(),
	build: _errlog_build(),
	character: (character && character.name) || "unknown"
};
_errlog_dirty = true;

window.addEventListener("error", ev => {
	const at = ev.filename ? ` @${ev.filename}:${ev.lineno}` : "";
	errlog_record("uncaught", (ev.message || "unknown error") + at);
});

window.addEventListener("unhandledrejection", ev => {
	errlog_record("unhandled_rejection", ev.reason);
});

const _errlog_console_error = console.error.bind(console);
console.error = function (...args) {
	errlog_record("console", args.map(a => _errlog_fmt(a)).join(" "));
	return _errlog_console_error(...args);
};

let _errlog_gamelog_wrapped = false;
function _errlog_try_wrap_game_log() {
	if (_errlog_gamelog_wrapped || typeof game_log !== "function") return;
	_errlog_gamelog_wrapped = true;
	const original_game_log = game_log;
	game_log = function (msg, color) {
		try {
			const text = String(msg);
			if (text.indexOf("⚠️") === 0 || text.indexOf("❌") === 0 || text.indexOf("🛑") === 0) {
				errlog_record("game_log", text);
			}
		} catch (e) { }
		return original_game_log(msg, color);
	};
}

let _errlog_log_wrapped = false;
function _errlog_try_wrap_log() {
	if (_errlog_log_wrapped || typeof log !== "function") return;
	_errlog_log_wrapped = true;
	const original_log = log;
	log = function (msg, color, type) {
		if (type === "Errors") errlog_record("ingame", msg);
		return original_log(msg, color, type);
	};
}

function _errlog_heal_outcome(snap, outcome) {
	try {
		snap.outcome = outcome;
		snap.ms = Date.now() - snap.t;
		_errlog_heals.push(snap);
		if (_errlog_heals.length > ERRLOG_MAX_HEALS) _errlog_heals.shift();
		errlog_count("heal:" + outcome + (snap.self ? ":self" : ":ally"));
	} catch (e) { }
}

function _errlog_reason(e) {
	if (!e) return "unknown";
	return e.reason || e.response || (e.message ? String(e.message).slice(0, 60) : _errlog_fmt(e).slice(0, 60));
}

let _errlog_heal_wrapped = false;
function _errlog_try_wrap_heal() {
	if (_errlog_heal_wrapped || typeof heal !== "function") return;
	try {
		const original_heal = heal;
		heal = function (target) {
			let snap;
			try {
				snap = {
					t: Date.now(),
					target: (target && target.name) || "?",
					self: !!(target && character && target.name === character.name),
					tgt_hp: target && target.hp, tgt_max: target && target.max_hp,
					my_hp: character.hp, my_mp: character.mp
				};
			} catch (e) { snap = { t: Date.now(), target: "?" }; }

			let p;
			try {
				p = original_heal(target);
			} catch (e) {
				_errlog_heal_outcome(snap, "threw:" + _errlog_reason(e));
				throw e;
			}
			return Promise.resolve(p).then(
				r => { _errlog_heal_outcome(snap, "ok"); return r; },
				e => { _errlog_heal_outcome(snap, _errlog_reason(e)); throw e; }
			);
		};
		_errlog_heal_wrapped = true;
	} catch (e) { }
}

try {
	if (parent && parent.socket && typeof parent.socket.on === "function") {
		parent.socket.on("game_response", data => {
			try {
				const r = (data && (data.response || data)) || "";
				if (r === "exception" || r === "cant" || r === "not_ready") {
					errlog_record("game_response", _errlog_fmt(data));
				}
			} catch (e) { }
		});
	}
} catch (e) { }

try {
	if (parent && parent.socket && typeof parent.socket.on === "function") {
		parent.socket.on("disconnect", () => errlog_record("disconnect", "socket disconnected"));
	}
} catch (e) { }

function _errlog_sample_vitals() {
	const v = _errlog_context();
	if (!v) return;
	v.t = Date.now();

	try {
		const beats = {};
		for (const k in _errlog_beats) {
			beats[k] = _errlog_beats[k] - (_errlog_beats_last[k] || 0);
			_errlog_beats_last[k] = _errlog_beats[k];
		}
		v.beats = beats;
	} catch (e) { }

	try {
		if (typeof cache !== "undefined" && cache && cache.heal_target) {
			const ht = cache.heal_target;
			v.heal_stat = character.heal;
			v.heal_target = ht.name;
			v.heal_thr = Math.round(Math.max(ht.max_hp * 0.5, ht.max_hp - character.heal / 1.33));
			v.heal_tgt_hp = ht.hp;
			v.mp_cost = character.mp_cost;
			try {
				const thr = (typeof CONFIG !== "undefined" && CONFIG.healing)
					? CONFIG.healing.party_heal_threshold : 0.4;
				v.hurt = (cache.party_members || []).filter(n => {
					const a = get_player(n);
					return a && !a.rip && a.hp < a.max_hp * thr;
				}).length;
			} catch (e) { }
		}
	} catch (e) { }
	_errlog_vitals.push(v);
	if (_errlog_vitals.length > ERRLOG_VITALS_SAMPLES) _errlog_vitals.shift();

	const rip = !!v.rip;
	if (rip && !_errlog_was_rip) {
		_errlog.deaths.push({
			t: v.t,
			build: _errlog_build(),
			threat: _errlog_threat(),
			status: (() => { try { return Object.keys(character.s || {}); } catch (e) { return null; } })(),
			leading_up_to_it: _errlog_vitals.slice(),
			recent_heals: _errlog_heals.slice()
		});
		if (_errlog.deaths.length > ERRLOG_MAX_DEATHS) _errlog.deaths.shift();
		_errlog_dirty = true;
		errlog_record("death", "died on " + v.map + " hp=" + v.hp + " mp=" + v.mp + " cc=" + v.cc);
	}
	_errlog_was_rip = rip;
}

setInterval(_errlog_sample_vitals, ERRLOG_VITALS_MS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOCAL SINK — pushes to tools/error_sink.py so records land in the repo as errors.json.
// --------------------------------------------------------------------------------------------------------------------------------- //

const ERRLOG_SINK_URL = "http://127.0.0.1:8787/errors";
const ERRLOG_PUSH_MS = 30000;
const ERRLOG_PUSH_BACKOFF_MS = 300000;

let _errlog_last_push = 0;
let _errlog_push_fails = 0;

function _errlog_push() {
	const wait = _errlog_push_fails >= 3 ? ERRLOG_PUSH_BACKOFF_MS : ERRLOG_PUSH_MS;
	if (Date.now() - _errlog_last_push < wait) return;
	_errlog_last_push = Date.now();

	try {
		const _tp = Date.now();
		const _body = JSON.stringify({
				character: (character && character.name) || "unknown",
				build: _errlog_build(),
				session: _errlog.session,
				records: _errlog.records,
				counts: _errlog.counts,
				timeline: _errlog.timeline,
				deaths: _errlog.deaths,
				samples: _errlog.samples
		});
		errlog_time("io push stringify", Date.now() - _tp);
		fetch(ERRLOG_SINK_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: _body
		}).then(() => { _errlog_push_fails = 0; }, () => { _errlog_push_fails++; });
	} catch (e) {
		_errlog_push_fails++;
	}
}

setInterval(() => {
	_errlog_try_wrap_log();
	_errlog_try_wrap_game_log();
	_errlog_try_wrap_heal();
	_errlog_flush();
	_errlog_push();
}, ERRLOG_FLUSH_MS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// READOUT
// --------------------------------------------------------------------------------------------------------------------------------- //

function al_errors(all) {
	_errlog_flush();
	const out = {};
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k || k.indexOf(ERRLOG_KEY) !== 0) continue;
			if (!all && k !== _errlog_key()) continue;
			const blob = JSON.parse(localStorage.getItem(k)) || {};
			const rows = Object.values(blob.records || {}).sort((a, b) => b.last - a.last);
			out[k.slice(ERRLOG_KEY.length)] = {
				session: blob.session,
				counts: blob.counts || {},
				deaths: blob.deaths || [],
				records: rows.map(r => ({
					...r,
					first: new Date(r.first).toISOString(),
					last: new Date(r.last).toISOString()
				})),
				timeline: blob.timeline || []
			};
		}
	} catch (e) { return "error log unreadable: " + _errlog_fmt(e); }
	return out;
}

function al_errors_clear(all) {
	try {
		const doomed = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.indexOf(ERRLOG_KEY) === 0 && (all || k === _errlog_key())) doomed.push(k);
		}
		doomed.forEach(k => localStorage.removeItem(k));
		_errlog = { session: _errlog.session, schema: ERRLOG_SCHEMA, records: {}, timeline: [], deaths: [], counts: {} };
		_errlog_heals = [];
		_errlog_vitals = [];
		_errlog_was_rip = false;
		for (const k in _errlog_beats) delete _errlog_beats[k];
		for (const k in _errlog_beats_last) delete _errlog_beats_last[k];
		return "cleared " + doomed.length + " key(s)";
	} catch (e) { return "clear failed: " + _errlog_fmt(e); }
}
