// --------------------------------------------------------------------------------------------------------------------------------- //
// ERROR LOG — persistent, cross-character error recorder.
//
// A flight recorder, not an alarm: it answers "what happened at 9:05?" after the fact. It will not
// wake anyone up. Deliberately hooks-only — every capture point below is a wrapper around
// something that already exists, so there are no diag_record() calls sprinkled through the
// codebase. That call-site cost is what made the previous diagnostics system not worth keeping.
//
// Records land in localStorage under AL_errors_<character>, which is shared across all four
// characters' tabs (same origin), so one read gets the whole party.
//
// Read it with al_errors() in the console; al_errors_clear() wipes it.
// --------------------------------------------------------------------------------------------------------------------------------- //

const ERRLOG_KEY = "AL_errors_";
const ERRLOG_MAX = 200;        // distinct signatures per character; least-recently-seen is evicted
const ERRLOG_FLUSH_MS = 2000;
const ERRLOG_MSG_CAP = 400;

let _errlog = {};
let _errlog_dirty = false;
let _errlog_recording = false; // re-entry guard: recording must never trigger recording

function _errlog_key() {
	return ERRLOG_KEY + (character && character.name ? character.name : "unknown");
}

function _errlog_fmt(e) {
	if (e === null || e === undefined) return String(e);
	if (typeof e === "string") return e;
	if (e.message) return e.stack || e.message;
	try { return JSON.stringify(e); } catch (x) { return String(e); }
}

// Digits are normalised so "cooldown 4999ms" and "cooldown 3021ms" collapse into one row. Without
// this a 40ms loop erroring for an hour writes ~90,000 near-identical entries and the log is
// useless exactly when it matters.
function _errlog_signature(ctx, msg) {
	return ctx + "|" + msg.replace(/\d+/g, "#").slice(0, 200);
}

// The commit actually running. "Which character, on which build" was unanswerable during the
// incident this file exists because of — one character sat on a months-old build for hours.
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
			x: Math.round(character.x),
			y: Math.round(character.y),
			hp: character.hp,
			max_hp: character.max_hp,
			rip: !!character.rip,
			panicking: (typeof panicking !== "undefined") ? !!panicking : null
		};
	} catch (e) { return null; }
}

function _errlog_load() {
	try {
		const raw = localStorage.getItem(_errlog_key());
		if (raw) _errlog = JSON.parse(raw) || {};
	} catch (e) { _errlog = {}; }
}

function _errlog_flush() {
	if (!_errlog_dirty) return;
	_errlog_dirty = false;
	try {
		const keys = Object.keys(_errlog);
		if (keys.length > ERRLOG_MAX) {
			keys.sort((a, b) => _errlog[a].last - _errlog[b].last)
				.slice(0, keys.length - ERRLOG_MAX)
				.forEach(k => delete _errlog[k]);
		}
		localStorage.setItem(_errlog_key(), JSON.stringify(_errlog));
	} catch (e) {
		// Storage full or blocked — dropping the record is correct; never let logging break the bot.
	}
}

function errlog_record(ctx, raw_msg) {
	if (_errlog_recording) return;
	_errlog_recording = true;
	try {
		const msg = _errlog_fmt(raw_msg).slice(0, ERRLOG_MSG_CAP);
		const sig = _errlog_signature(ctx, msg);
		const now = Date.now();
		const existing = _errlog[sig];
		if (existing) {
			existing.count++;
			existing.last = now;
		} else {
			_errlog[sig] = {
				ctx, msg, count: 1, first: now, last: now,
				build: _errlog_build(),
				where: _errlog_context()   // snapshot of the FIRST occurrence only
			};
		}
		_errlog_dirty = true;
	} catch (e) {
		// Never throw out of the recorder.
	} finally {
		_errlog_recording = false;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CAPTURE POINTS — four hooks, no call sites elsewhere
// --------------------------------------------------------------------------------------------------------------------------------- //

_errlog_load();

// 1. Uncaught exceptions. Cross-origin script failures arrive here as a bare "Script error." with
//    lineno 0 and no detail, because getScript builds a <script> tag without crossorigin. Recorded
//    anyway: knowing a script died at all is worth more than nothing, which is what we had.
window.addEventListener("error", ev => {
	const at = ev.filename ? ` @${ev.filename}:${ev.lineno}` : "";
	errlog_record("uncaught", (ev.message || "unknown error") + at);
});

// 2. The Uncaught (in promise) family — rejected game promises nobody awaited.
window.addEventListener("unhandledrejection", ev => {
	errlog_record("unhandled_rejection", ev.reason);
});

// 3. console.error — catches the "skill_loop error:" / "handle_party_heal error:" family, which
//    goes to the browser console and never touches the in-game log.
const _errlog_console_error = console.error.bind(console);
console.error = function (...args) {
	errlog_record("console", args.map(a => _errlog_fmt(a)).join(" "));
	return _errlog_console_error(...args);
};

// 4. The in-game Errors tab. catcher() funnels every handled error through log(..., "Errors"), and
//    the direct [PANIC] messages use it too, so this one hook covers both.
//
//    Wrapped on a timer rather than immediately: log() lives in UI/Custom_Log.js, which the
//    Bootstrapper loads in PARALLEL with this file, so it may not exist yet at this point.
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOCAL SINK — pushes records to tools/error_sink.py so they land in the repo as errors.json.
//
// The page cannot write to disk, so this is the only way the log reaches a file. The sink is
// optional: when it isn't running the POST just fails, and after 3 consecutive failures we back
// off to one attempt every 5 minutes so a missing sink costs essentially nothing. Failures are
// swallowed rather than logged — a sink error that got recorded would feed itself.
//
// 127.0.0.1 is treated as a trustworthy origin, so an https page is allowed to POST to it.
// --------------------------------------------------------------------------------------------------------------------------------- //

const ERRLOG_SINK_URL = "http://127.0.0.1:8787/errors";
const ERRLOG_PUSH_MS = 30000;
const ERRLOG_PUSH_BACKOFF_MS = 300000;

let _errlog_last_push = 0;
let _errlog_push_fails = 0;

function _errlog_push() {
	const wait = _errlog_push_fails >= 3 ? ERRLOG_PUSH_BACKOFF_MS : ERRLOG_PUSH_MS;
	if (Date.now() - _errlog_last_push < wait) return;
	if (!Object.keys(_errlog).length) return;
	_errlog_last_push = Date.now();

	try {
		fetch(ERRLOG_SINK_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				character: (character && character.name) || "unknown",
				build: _errlog_build(),
				records: _errlog
			})
		}).then(
			() => { _errlog_push_fails = 0; },
			() => { _errlog_push_fails++; }
		);
	} catch (e) {
		_errlog_push_fails++;
	}
}

setInterval(() => {
	_errlog_try_wrap_log();
	_errlog_flush();
	_errlog_push();
}, ERRLOG_FLUSH_MS);

// --------------------------------------------------------------------------------------------------------------------------------- //
// READOUT
// --------------------------------------------------------------------------------------------------------------------------------- //

// al_errors()      -> this character's records, most recent first
// al_errors(true)  -> every character's records (localStorage is shared across the four tabs)
function al_errors(all) {
	_errlog_flush();
	const out = {};
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k || k.indexOf(ERRLOG_KEY) !== 0) continue;
			if (!all && k !== _errlog_key()) continue;
			const rows = Object.values(JSON.parse(localStorage.getItem(k)) || {});
			rows.sort((a, b) => b.last - a.last);
			out[k.slice(ERRLOG_KEY.length)] = rows.map(r => ({
				...r,
				first: new Date(r.first).toISOString(),
				last: new Date(r.last).toISOString()
			}));
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
		_errlog = {};
		return "cleared " + doomed.length + " key(s)";
	} catch (e) { return "clear failed: " + _errlog_fmt(e); }
}
