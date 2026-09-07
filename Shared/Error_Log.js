// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR LOG — persistent, cross-character recorder.
//
// A flight recorder, not an alarm: it answers "what happened at 21:45?" after the fact. It will not
// wake anyone up. Hooks only — every capture point wraps something that already exists, so there
// are no record() calls scattered through the codebase. That call-site cost is what made the
// previous diagnostics system not worth keeping.
//
// Five things are stored, because they answer different questions:
//   records   deduped aggregate — "what is chronically wrong"
//   counts    bare integers for high-volume outcomes — "how often does heal actually land"
//   timeline  ordered ring of recent events — "what happened just before it broke"
//   deaths    vitals, loop beats and every heal attempt before it — "why did it die"
//   session   when this build loaded — makes "died 60s after load" visible
//
// records vs counts is the important split: records carry context and feed the timeline, so they
// must stay rare. Anything that can fire ten times a second goes to counts instead, or it flushes
// the timeline and destroys the evidence it was added to gather.
//
// Written to localStorage (shared across all four tabs) and POSTed to tools/error_sink.py, which
// merges it into errors.json in the repo. Read with al_errors(true).
// --------------------------------------------------------------------------------------------------------------------------------- //

const ERRLOG_KEY = "AL_errors_";
const ERRLOG_MAX_RECORDS = 200;
const ERRLOG_MAX_TIMELINE = 80;
const ERRLOG_MAX_DEATHS = 20;
const ERRLOG_VITALS_SAMPLES = 10;   // at 1s each, so a death carries the preceding 10s
const ERRLOG_VITALS_MS = 1000;
const ERRLOG_FLUSH_MS = 5000;       // localStorage.setItem is synchronous; don't do it every 2s
const ERRLOG_MSG_CAP = 400;

const ERRLOG_MAX_HEALS = 30;        // heal attempts kept in full detail, attached to a death

let _errlog = { session: null, records: {}, timeline: [], deaths: [], counts: {} };
let _errlog_dirty = false;
let _errlog_recording = false;      // recording must never be able to trigger recording
let _errlog_vitals = [];
let _errlog_was_rip = false;
let _errlog_heals = [];             // ring of recent heal attempts, frozen into each death record
const _errlog_beats = {};           // loop name -> total iterations since load
const _errlog_beats_last = {};      // same, snapshotted at the previous vitals sample

function _errlog_key() {
	return ERRLOG_KEY + ((character && character.name) || "unknown");
}

function _errlog_fmt(e) {
	if (e === null || e === undefined) return String(e);
	if (typeof e === "string") return e;
	if (e.message) return e.stack || e.message;
	try { return JSON.stringify(e); } catch (x) { return String(e); }
}

// Digits normalised so "cooldown 4999ms" and "cooldown 3021ms" collapse. Without this a 40ms loop
// erroring for an hour writes ~90,000 near-identical rows and the log is useless exactly when it
// matters most.
function _errlog_signature(ctx, msg) {
	return ctx + "|" + msg.replace(/\d+/g, "#").slice(0, 200);
}

function _errlog_build() {
	try {
		const m = (window.__AL_BASE__ || "").match(/@([0-9a-f]{7,40})\//);
		return m ? m[1].slice(0, 7) : "main";
	} catch (e) { return "?"; }
}

// cc is here because "did we get disconnected for code-cost overload?" has been an open question
// for a long time and nothing was recording it. mp is here because a no_mp rejection on scare
// turned out to be why the warrior could never escape.
function _errlog_context() {
	try {
		return {
			map: character.map,
			x: Math.round(character.x), y: Math.round(character.y),
			hp: character.hp, max_hp: character.max_hp,
			mp: character.mp, max_mp: character.max_mp,
			cc: Math.round(character.cc || 0),
			rip: !!character.rip,
			panicking: (typeof panicking !== "undefined") ? !!panicking : null
		};
	} catch (e) { return null; }
}

// What was actually on us. Monster mix and how many had us targeted is the difference between
// "died to a boss" and "died to a pack nobody dumped".
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
		if (prev && prev.records) {
			_errlog = {
				session: prev.session || null,
				records: prev.records || {},
				timeline: prev.timeline || [],
				deaths: prev.deaths || [],
				counts: prev.counts || {}
			};
		}
	} catch (e) { /* corrupt or blocked — start clean */ }
}

function _errlog_flush() {
	if (!_errlog_dirty) return;
	_errlog_dirty = false;
	try {
		const keys = Object.keys(_errlog.records);
		if (keys.length > ERRLOG_MAX_RECORDS) {
			keys.sort((a, b) => _errlog.records[a].last - _errlog.records[b].last)
				.slice(0, keys.length - ERRLOG_MAX_RECORDS)
				.forEach(k => delete _errlog.records[k]);
		}
		localStorage.setItem(_errlog_key(), JSON.stringify(_errlog));
	} catch (e) {
		// Full or blocked — dropping the record is correct; logging must never break the bot.
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
				where: _errlog_context()   // first occurrence only
			};
		}

		// Ordered ring alongside the aggregate: dedupe answers "what is chronically wrong", this
		// answers "what happened in the seconds before it broke", and they are different questions.
		_errlog.timeline.push({ t: now, ctx, msg: msg.slice(0, 160) });
		if (_errlog.timeline.length > ERRLOG_MAX_TIMELINE) _errlog.timeline.shift();

		_errlog_dirty = true;
	} catch (e) {
		// Never throw out of the recorder.
	} finally {
		_errlog_recording = false;
	}
}

// COUNTERS — for outcomes that happen too often to record.
//
// errlog_record() pushes to the 80-entry timeline, so calling it for something that fires ten times
// a second flushes the timeline and destroys the one structure that shows what happened just before
// a failure. Volume needs a different shape: one integer per outcome, no ordering, no timeline
// pressure, unbounded in time. "How many heals succeeded today" and "what happened at 19:58" are
// different questions and want different storage.
function errlog_count(bucket) {
	try {
		_errlog.counts[bucket] = (_errlog.counts[bucket] || 0) + 1;
		_errlog_dirty = true;
	} catch (e) { /* never throw out of the recorder */ }
}

// LOOP LIVENESS. "It took no action at all" is the most expensive failure to diagnose because it
// looks identical to "it decided not to act" — both produce silence. Counting iterations separates
// them: the vitals sampler turns this into iterations-per-second, so a death record shows whether
// the loop was still running while the character stood there dying.
function errlog_beat(name) {
	try { _errlog_beats[name] = (_errlog_beats[name] || 0) + 1; } catch (e) { /* never throw */ }
}

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

// 1. Uncaught exceptions. Cross-origin script failures arrive as a bare "Script error." with
//    lineno 0, because getScript builds <script> tags without crossorigin. Recorded regardless:
//    knowing a script died at all beats knowing nothing, which is what we had.
window.addEventListener("error", ev => {
	const at = ev.filename ? ` @${ev.filename}:${ev.lineno}` : "";
	errlog_record("uncaught", (ev.message || "unknown error") + at);
});

// 2. Rejected game promises nobody awaited.
window.addEventListener("unhandledrejection", ev => {
	errlog_record("unhandled_rejection", ev.reason);
});

// 3. console.error — the "skill_loop error:" family, which never reaches the in-game log. This is
//    where the no_mp rejections that were killing the warrior had been hiding all along.
const _errlog_console_error = console.error.bind(console);
console.error = function (...args) {
	errlog_record("console", args.map(a => _errlog_fmt(a)).join(" "));
	return _errlog_console_error(...args);
};

// 4. The in-game Errors tab. catcher() funnels every handled error through log(..., "Errors") and
//    the [PANIC] messages use it directly, so one hook covers both.
//
//    Wrapped on a timer, not immediately: log() lives in UI/Custom_Log.js, which the Bootstrapper
//    loads in PARALLEL with this file, so it may not exist yet at this point.
// 4b. game_log — warn_missing_item() and the Bootstrapper report through it, and nothing was
//     watching. That is how a panic orb that never equipped stayed invisible. Only ⚠️/❌ lines are
//     taken, so ordinary game chatter does not flood the log.
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
		} catch (e) { /* never break game_log */ }
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

// 4b. Heal and skill attempts. Wrapping the API functions catches every call AND its outcome with
//     no call sites, including the successes — which is the half we never had. A rejected heal
//     costs no mana and sets no cooldown, so "healed a corpse 4000 times" and "never called heal"
//     look identical from the outside: same flat mana, same absent cooldown rejections. That
//     ambiguity is what made the 09-07 death loop take an afternoon to pin down.
//
//     Outcomes go to counters (unbounded, no timeline pressure); the last ERRLOG_MAX_HEALS attempts
//     are kept in full detail and frozen into each death record, which is where detail is worth
//     paying for.
function _errlog_heal_outcome(snap, outcome) {
	try {
		snap.outcome = outcome;
		snap.ms = Date.now() - snap.t;
		_errlog_heals.push(snap);
		if (_errlog_heals.length > ERRLOG_MAX_HEALS) _errlog_heals.shift();
		errlog_count("heal:" + outcome + (snap.self ? ":self" : ":ally"));
	} catch (e) { /* never break healing */ }
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
	} catch (e) { /* heal not reassignable here; skip rather than break */ }
}

// Same treatment for use_skill, counters only. The rejections were already captured by the
// callers' own catch blocks; what was missing is how often each skill actually LANDS, which is the
// difference between "scare is failing" and "scare is never being reached".
let _errlog_skill_wrapped = false;
function _errlog_try_wrap_use_skill() {
	if (_errlog_skill_wrapped || typeof use_skill !== "function") return;
	try {
		const original_use_skill = use_skill;
		use_skill = function (name, target, extra) {
			let p;
			try {
				p = original_use_skill(name, target, extra);
			} catch (e) {
				errlog_count("skill:" + name + ":threw");
				throw e;
			}
			return Promise.resolve(p).then(
				r => { errlog_count("skill:" + name + ":ok"); return r; },
				e => { errlog_count("skill:" + name + ":" + _errlog_reason(e)); throw e; }
			);
		};
		_errlog_skill_wrapped = true;
	} catch (e) { /* not reassignable; skip */ }
}

// 5. Socket disconnects — the symptom we have never once captured, only inferred.
try {
	if (parent && parent.socket && typeof parent.socket.on === "function") {
		parent.socket.on("disconnect", () => errlog_record("disconnect", "socket disconnected"));
	}
} catch (e) { /* no socket access; skip */ }

// 6. Death. Detected on the rising edge of character.rip in the vitals sampler rather than through
//    a game event, so it does not depend on event semantics that vary. The vitals ring means the
//    record carries the ten seconds BEFORE the death, which is the part that explains it — hp/mp
//    after you are already dead tells you nothing.
function _errlog_sample_vitals() {
	const v = _errlog_context();
	if (!v) return;
	v.t = Date.now();

	// Iterations of each loop since the previous sample, i.e. per second. A row of zeroes here is
	// the difference between a loop that died and a loop that ran and chose to do nothing.
	try {
		const beats = {};
		for (const k in _errlog_beats) {
			beats[k] = _errlog_beats[k] - (_errlog_beats_last[k] || 0);
			_errlog_beats_last[k] = _errlog_beats[k];
		}
		v.beats = beats;
	} catch (e) { /* never break sampling */ }

	// Healer only: the inputs to the heal decision. "She stood there and healed nobody" produces no
	// error of any kind, so the only way to settle why is to record what the decision saw.
	try {
		if (typeof cache !== "undefined" && cache && cache.heal_target) {
			const ht = cache.heal_target;
			v.heal_stat = character.heal;
			v.heal_target = ht.name;
			v.heal_thr = Math.round(Math.max(ht.max_hp * 0.5, ht.max_hp - character.heal / 1.33));
			v.heal_tgt_hp = ht.hp;
			// What a single-target heal actually costs, so partyheal (a flat 400) can be compared
			// against it rather than assumed cheaper.
			v.mp_cost = character.mp_cost;
			// How many allies are actually below the partyheal threshold. partyheal is an AoE heal
			// cast on the FIRST one found, so if this is usually 1 the AoE is being paid for
			// nothing.
			try {
				const thr = (typeof CONFIG !== "undefined" && CONFIG.healing)
					? CONFIG.healing.party_heal_threshold : 0.4;
				v.hurt = (cache.party_members || []).filter(n => {
					const a = get_player(n);
					return a && !a.rip && a.hp < a.max_hp * thr;
				}).length;
			} catch (e) { /* party not resolvable */ }
		}
	} catch (e) { /* not a healer, or cache not built yet */ }
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
			// Every heal this character attempted before dying, with its outcome. "Died at full mana"
			// is ambiguous until you can see whether the heals were never issued or were all rejected.
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
//
// The page cannot write to disk, so this is the only route to a file. Optional: when the sink is
// not running the POST simply fails, and after 3 consecutive failures we back off to one attempt
// every 5 minutes. Failures are swallowed rather than logged — a sink error that got recorded
// would feed itself. 127.0.0.1 counts as a trustworthy origin, so an https page may POST to it.
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
		fetch(ERRLOG_SINK_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				character: (character && character.name) || "unknown",
				build: _errlog_build(),
				session: _errlog.session,
				records: _errlog.records,
				counts: _errlog.counts,
				timeline: _errlog.timeline,
				deaths: _errlog.deaths
			})
		}).then(() => { _errlog_push_fails = 0; }, () => { _errlog_push_fails++; });
	} catch (e) {
		_errlog_push_fails++;
	}
}

setInterval(() => {
	_errlog_try_wrap_log();
	_errlog_try_wrap_game_log();
	_errlog_try_wrap_heal();
	_errlog_try_wrap_use_skill();
	_errlog_flush();
	_errlog_push();
}, ERRLOG_FLUSH_MS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// READOUT
// --------------------------------------------------------------------------------------------------------------------------------- //

// al_errors()     -> this character
// al_errors(true) -> all four (localStorage is shared across the tabs)
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
		_errlog = { session: _errlog.session, records: {}, timeline: [], deaths: [] };
		return "cleared " + doomed.length + " key(s)";
	} catch (e) { return "clear failed: " + _errlog_fmt(e); }
}
