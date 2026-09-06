// --------------------------------------------------------------------------------------------------------------------------------- //
// MESSAGING — CM (character message) handlers and the localStorage-backed state cache
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CM HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUILD CONSISTENCY
//
// Every character reports the commit it actually loaded, and one that finds itself on a different
// build than the party leader reloads once to catch up. A split party is not cosmetic: this CM
// protocol — panic leases, instance handshakes — is only coherent within a single build, and a
// mismatch is otherwise completely invisible until something behaves inexplicably.
// --------------------------------------------------------------------------------------------------------------------------------- //

const BUILD_REF = "Ulric";               // the reference build; only this character announces
const BUILD_ANNOUNCE_DELAY_MS = 15000;   // let every character finish loading before comparing
const BUILD_REANNOUNCE_MS = 60000;       // repeat, so a character that loaded late still hears it
const BUILD_RELOAD_KEY_PREFIX = "AL_build_reload_at_";
const BUILD_RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

// "main-fallback" rather than "unknown" when there is no @<sha> in the base: that is the raw/@main
// path, which is exactly the case worth flagging rather than skipping.
function my_build_sha() {
	const base = window.__AL_BASE__ || "";
	const m = base.match(/@([0-9a-f]{7,40})\//);
	if (m) return m[1];
	return base ? "main-fallback" : "unknown";
}

function announce_build() {
	const others = ["Ulric", "Riva", "Myras", "Riff"].filter(n => n !== character.name);
	send_cm(others, { type: "build", sha: my_build_sha() });
}

const _cmListeners = []; // unified naming

function add_cm_listener(fn) {
	if (!_cmListeners.includes(fn)) _cmListeners.push(fn);
}

function remove_cm_listener(fn) {
	const index = _cmListeners.indexOf(fn);
	if (index !== -1) _cmListeners.splice(index, 1);
}

// Preserve existing handler
const original_on_cm = typeof on_cm === "function" ? on_cm : () => {};

on_cm = function (name, data) {
	_cmListeners.forEach(fn => {
		try {
			fn(name, data);
		} catch (e) {
			console.error("CM listener error:", e);
		}
	});
	original_on_cm(name, data);
};

const location_responses = {};

// Central CM message handlers
const CM_HANDLERS = {
	// _healer_last_known/panicking are only declared on characters that read them — no-op elsewhere.
	"my_location": (name, data) => {
		location_responses[name] = { map: data.map, x: data.x, y: data.y };
		if (name === "Myras") {
			_healer_last_known = { map: data.map, x: data.x, y: data.y };
		}
	},

	"panic": (name, data) => {
		if (name !== "Myras") return;
		// Each broadcast extends a lease rather than latching a flag: the healer renews while she
		// is panicking, and panic_check() releases us once the lease lapses. A dead healer simply
		// stops renewing, instead of freezing us waiting on an all-clear she can no longer send.
		const was_held = (typeof panic_external !== "undefined") && panic_external;
		panicking = data.state;
		// Marks this as someone else's panic so panic_check() won't clear it the moment we're
		// personally healthy — otherwise "hold fire" lasted about one tick on the warrior.
		panic_external = data.state;
		panic_hold_until = data.state ? Date.now() + (data.lease_ms || PANIC_LEASE_MS) : 0;
		// Only on the edges — renewals arrive every few seconds and would otherwise spam.
		if (data.state && !was_held) log("⚠️ Healer panicking — holding fire!", "#ffcc00", "Alerts");
		else if (!data.state)        log("✅ Healer panic over — resuming.", "#00ff00", "Alerts");
	},

	// Only Ulric announces (BUILD_REF), so there is exactly one reference build and no
	// ping-pong where two characters each reload to chase the other.
	"build": (name, data) => {
		if (name !== BUILD_REF || character.name === BUILD_REF) return;

		const mine = my_build_sha();
		if (mine === "unknown" || !data.sha || data.sha === "unknown") return;
		if (mine === data.sha) return;

		game_log(`⚠️ Build mismatch: ${character.name} on ${mine.slice(0, 7)}, `
			+ `${BUILD_REF} on ${String(data.sha).slice(0, 7)}`, "#FF4444");

		// Per character, not shared: localStorage is common to all four tabs, so a single key
		// would let the first reloader block the other three.
		const key = BUILD_RELOAD_KEY_PREFIX + character.name;
		let last = 0;
		try { last = parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { /* storage blocked */ }
		if (Date.now() - last < BUILD_RELOAD_COOLDOWN_MS) {
			game_log("Mismatch persists, but this character already reloaded recently — staying put.", "#FFA500");
			return;
		}
		try { localStorage.setItem(key, String(Date.now())); } catch (e) { /* storage blocked */ }

		game_log("Reloading to match the party build...", "#FFA500");
		setTimeout(() => parent.window.location.reload(), 2000);
	},

	"suppress_reset": () => set_suppress_reset(true),

	"enter_instance": (name, data) => {
		const instance_id = data.in;
		const join_interval = setInterval(() => {
			if (character.map === "spider_instance") {
				clearInterval(join_interval);
				send_cm("Myras", { type: "instance_ready" });
			} else {
				enter("spider_instance", instance_id);
			}
		}, 2000);
	},

	"where_are_you": (name) => {
		send_cm(name, {
			type: "my_location",
			map: character.map,
			x: character.x,
			y: character.y
		});
	},

	"what_potions": (name) => {
		const counts = {};
		for (const pot of POTION_TYPES) {
			counts[pot] = character.items.reduce((sum, item) =>
				item?.name === pot ? sum + (item.q || 1) : sum, 0);
		}
		send_cm(name, { type: "my_potions", ...counts });
	},

	"do_you_have_loot": (name) => {
		const count = character.items.slice(6).filter(Boolean).length;
		if (count > 0) {
			send_cm(name, { type: "yes_i_have_loot", count });
		}
	},

	"send_loot": async (name) => {
			await send_to_merchant();
	},

	// status_update/status_update_request removed — replaced by the localStorage state cache below.

	"reload": () => {
		setTimeout(() => parent.window.location.reload(), 500);
	}
};

function send_updates() {
	parent.socket.emit("send_updates", {});
}

add_cm_listener((name, data) => {
	if (!["Ulric", "Riva", "Myras", "Riff"].includes(name)) {
		game_log("❌ Unauthorized CM from " + name);
		return;
	}

	const handler = CM_HANDLERS[data.type] || CM_HANDLERS["default"];
	if (handler) {
		if (handler.constructor.name === "AsyncFunction") {
			handler(name, data).catch(e => console.error("CM async handler error:", e));
		} else {
			try {
				handler(name, data);
			} catch (e) {
				console.error("CM handler error:", e);
			}
		}
	}
});


// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE CACHE (localStorage — shared across all characters' browser tabs on this origin)
// --------------------------------------------------------------------------------------------------------------------------------- //

// localStorage is shared across all 4 characters' tabs (same origin). Each writes its own
// snapshot every cycle; others read it synchronously via read_state_cache(name) — no CM round trip.
const STATE_CACHE_KEY_PREFIX = "AL_char_state_";
const STATE_CACHE_STALE_MS = 15000; // a cache older than this is treated as unknown/offline

function get_full_character_state() {
	return {
		name: character.name,
		hp: character.hp,
		max_hp: character.max_hp,
		mp: character.mp,
		max_mp: character.max_mp,
		xp: character.xp,
		max_xp: character.max_xp,
		gold: character.gold,
		map: character.map,
		x: character.x,
		y: character.y,
		rip: character.rip,
		moving: character.moving,
		free_slots: character.items.filter(it => !it).length,
		conditions: character.s || {}, // stunned, mluck, poisoned, etc. — see character.s
		last_seen: Date.now(),
	};
}

function write_state_cache() {
	try {
		localStorage.setItem(STATE_CACHE_KEY_PREFIX + character.name, JSON.stringify(get_full_character_state()));
	} catch (e) {
		catcher(e, "write_state_cache");
	}
}

// Returns null if never written, corrupt, or stale (> STATE_CACHE_STALE_MS) — treat as unknown/offline.
function read_state_cache(name) {
	try {
		const raw = localStorage.getItem(STATE_CACHE_KEY_PREFIX + name);
		if (!raw) return null;
		const state = JSON.parse(raw);
		if (Date.now() - state.last_seen > STATE_CACHE_STALE_MS) return null;
		return state;
	} catch (e) {
		return null;
	}
}

function is_character_online(name) {
	return read_state_cache(name) !== null;
}

// Plain setTimeout, not al_timeout: Shared/*.js load in parallel, so Game_Config.js may not have
// defined the generation helpers yet at this file's top level. By the time this fires everything
// has loaded, so the repeating announce below can be guarded normally.
if (character.name === BUILD_REF) {
	setTimeout(() => {
		announce_build();
		al_interval(announce_build, BUILD_REANNOUNCE_MS);
	}, BUILD_ANNOUNCE_DELAY_MS);
}

// Started by every character — keeps this character's own state cache fresh.
async function state_cache_loop() {
	STATE_CACHE_LOOP_ENABLED = true;
	const gen = al_generation();
	while (true) {
		// Stop when a newer load has superseded this chain (see Shared/Game_Config.js).
		if (loop_superseded(gen)) return;

		if (!STATE_CACHE_LOOP_ENABLED) {
			await delay(100);
			continue;
		}
		write_state_cache();
		await delay(100);
	}
}

