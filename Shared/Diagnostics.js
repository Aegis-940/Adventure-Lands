// --------------------------------------------------------------------------------------------------------------------------------- //
// DIAGNOSTICS — durable, deduplicated record of errors and stalled loops
// (real <script> tag, same global scope, no eval boundary — loaded first so it can catch
// failures thrown while the role files are still being eval'd)
// --------------------------------------------------------------------------------------------------------------------------------- //

// Why this exists: catcher() only ever sees what code deliberately hands it, and only paints
// it on screen, so it dies with the tab. The failures that actually cost real debugging time
// reached it in none of these cases:
//   - an uncaught ReferenceError that killed a loop's setTimeout chain outright
//   - unawaited promise rejections (a fire-and-forget use_skill/equip_set)
//   - a syntax error, where the file never ran at all
//   - silent no-ops, where nothing threw in the first place
// So: hook the global throw surfaces, persist across reloads, and heartbeat the loops so a
// loop that stops ticking is noticed regardless of why.

const DIAG_KEY_PREFIX = "AL_diag_";
const DIAG_MAX_RECORDS = 200;          // deduped signatures retained per character
const DIAG_FLUSH_MS = 2000;            // batch writes; a 25ms loop erroring must not thrash localStorage
const DIAG_HEARTBEAT_STALE_MS = 20000; // a loop silent this long is treated as dead
const DIAG_HEARTBEAT_CHECK_MS = 5000;

let _diag = { records: {}, heartbeats: {} };
let _diag_dirty = false;

// Collapses varying numbers so "cooldown 812ms" and "cooldown 47ms" are one record with a
// count, rather than hundreds of near-identical rows crowding out everything else.
function diag_signature(kind, context, message) {
	const normalized = String(message).replace(/\d+/g, "#").slice(0, 200);
	return `${kind}|${context}|${normalized}`;
}

// Captured on every record: this is what turns "it's broken" into something actionable —
// above all the commit SHA, which settles whether the running code is even the fixed version.
function diag_snapshot() {
	const s = {};
	const put = (k, f) => { try { s[k] = f(); } catch (e) { /* never let logging throw */ } };
	put("commit", () => (window.__AL_BASE__ || "").split("@").pop().replace("/", "").slice(0, 7));
	put("char", () => character.name);
	put("map", () => character.map);
	put("pos", () => [Math.round(character.x), Math.round(character.y)]);
	put("hp_pct", () => Math.round((character.hp / character.max_hp) * 100));
	put("mp_pct", () => Math.round((character.mp / character.max_mp) * 100));
	put("rip", () => !!character.rip);
	put("target", () => character.target || null);
	put("panicking", () => typeof panicking !== "undefined" ? panicking : null);
	put("gear_locked", () => typeof state !== "undefined" ? state.gear_locked : null);
	put("task", () => typeof merchant_task !== "undefined" ? merchant_task : null);
	put("mainhand", () => character.slots?.mainhand?.name || null);
	return s;
}

function diag_record(kind, context, message, extra) {
	try {
		const sig = diag_signature(kind, context, message);
		const now = Date.now();
		const existing = _diag.records[sig];

		if (existing) {
			existing.count++;
			existing.last_seen = now;
			existing.snapshot = diag_snapshot(); // keep the most recent context
			if (extra) existing.extra = extra;
		} else {
			_diag.records[sig] = {
				kind, context, count: 1,
				message: String(message).slice(0, 500),
				first_seen: now, last_seen: now,
				snapshot: diag_snapshot(),
				...(extra ? { extra } : {}),
			};
			// Evict least-recently-seen rather than oldest-created: a long-running nuisance
			// stays, a one-off from an hour ago goes.
			const keys = Object.keys(_diag.records);
			if (keys.length > DIAG_MAX_RECORDS) {
				keys.sort((a, b) => _diag.records[a].last_seen - _diag.records[b].last_seen);
				delete _diag.records[keys[0]];
			}
		}
		_diag_dirty = true;
	} catch (e) {
		// Diagnostics must never be the thing that breaks the bot.
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SUSTAINED CONDITIONS — "this should have resolved itself by now" (nothing throws)
// --------------------------------------------------------------------------------------------------------------------------------- //

// For the failure class that produces no error at all: a decision that keeps being made and
// never takes effect, or a guard that keeps blocking. Callers pass the condition every tick;
// it only records once the condition has held continuously for `ms`, then re-arms — so a
// persistent problem increments count once per window rather than once per tick.
const _diag_sustained = {};

function diag_sustained(key, active, ms, describe) {
	if (!active) { delete _diag_sustained[key]; return; }

	const now = Date.now();
	const entry = _diag_sustained[key];
	if (!entry) { _diag_sustained[key] = { since: now }; return; }

	const held = now - entry.since;
	if (held < ms) return;
	diag_record("sustained", key, describe ? describe(held) : `held for ${Math.round(held / 1000)}s`);
	entry.since = now;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HEARTBEATS — catch a loop that stops ticking, whatever killed it
// --------------------------------------------------------------------------------------------------------------------------------- //

// Called at the top of each loop, before any early return, so a loop that bails every tick
// still counts as alive and only a genuinely dead chain is flagged.
function heartbeat(name) {
	_diag.heartbeats[name] = Date.now();
}

function diag_heartbeat_check() {
	const now = Date.now();
	for (const name in _diag.heartbeats) {
		const age = now - _diag.heartbeats[name];
		if (age < DIAG_HEARTBEAT_STALE_MS) continue;
		diag_record("loop_stalled", name, `no heartbeat for ${Math.round(age / 1000)}s`);
		// Re-stamp so it reports once per stall window instead of every check.
		_diag.heartbeats[name] = now;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PERSISTENCE — per character, so four tabs sharing one origin can't clobber each other
// --------------------------------------------------------------------------------------------------------------------------------- //

function diag_key() {
	return DIAG_KEY_PREFIX + (character?.name || "unknown");
}

function diag_flush() {
	if (!_diag_dirty) return;
	_diag_dirty = false;
	try {
		localStorage.setItem(diag_key(), JSON.stringify({
			character: character?.name, updated: Date.now(), records: _diag.records,
		}));
	} catch (e) { /* quota or serialisation — dropping the log is preferable to throwing */ }
}

function diag_load() {
	try {
		const raw = localStorage.getItem(diag_key());
		if (raw) _diag.records = JSON.parse(raw).records || {};
	} catch (e) { _diag.records = {}; }
}

function clear_diagnostics() {
	_diag.records = {};
	_diag_dirty = true;
	diag_flush();
	log("🩺 Diagnostics cleared.", "limegreen");
}

// Merges every character's log into one file, so a single export covers the whole party.
function export_diagnostics() {
	const all = {};
	for (const name of ["Ulric", "Myras", "Riva", "Riff"]) {
		try {
			const raw = localStorage.getItem(DIAG_KEY_PREFIX + name);
			if (raw) all[name] = JSON.parse(raw);
		} catch (e) { /* skip unreadable */ }
	}
	const payload = JSON.stringify({ exported: new Date().toISOString(), characters: all }, null, 1);
	const a = parent.document.createElement("a");
	a.href = (parent.URL || URL).createObjectURL(new Blob([payload], { type: "application/json" }));
	a.download = "al_diagnostics.json";
	parent.document.body.appendChild(a);
	a.click();
	a.remove();

	const n = Object.values(all).reduce((t, c) => t + Object.keys(c.records || {}).length, 0);
	log(`🩺 Exported ${n} diagnostic records across ${Object.keys(all).length} characters.`, "limegreen");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL HOOKS — the surfaces nothing was watching
// --------------------------------------------------------------------------------------------------------------------------------- //

// addEventListener rather than assigning window.onerror, so we don't clobber any handler the
// game client already installed.
window.addEventListener("error", (ev) => {
	const where = ev.filename ? `${ev.filename.split("/").pop()}:${ev.lineno}` : "unknown";
	diag_record("uncaught", where, ev.message || String(ev.error));
});

// One hook covers every character. Records what was around at the moment of death, which is
// the context that's gone by the time anyone looks at a respawned character.
try {
	character.on("death", () => {
		const nearby = {};
		try {
			for (const id in parent.entities) {
				const e = parent.entities[id];
				if (e?.type !== "monster" || e.dead) continue;
				if (distance(character, e) > 400) continue;
				nearby[e.mtype] = (nearby[e.mtype] || 0) + 1;
			}
		} catch (e) { /* best effort */ }
		diag_record("death", character.map || "?", `died on ${character.map}`, {
			nearby_monsters: nearby,
			targeting_me: typeof get_num_targets === "function" ? get_num_targets(character.name) : null,
		});
	});
} catch (e) { /* character.on unavailable — skip rather than break loading */ }

window.addEventListener("unhandledrejection", (ev) => {
	const r = ev.reason;
	const msg = r?.message || r?.reason || (typeof r === "string" ? r : JSON.stringify(r));
	diag_record("unhandled_rejection", r?.reason || "promise", msg);
});

diag_load();
setInterval(diag_flush, DIAG_FLUSH_MS);
setInterval(diag_heartbeat_check, DIAG_HEARTBEAT_CHECK_MS);
