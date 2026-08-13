// --------------------------------------------------------------------------------------------------------------------------------- //
// MESSAGING — CM (character message) handlers and the localStorage-backed state cache
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CM HANDLERS
// --------------------------------------------------------------------------------------------------------------------------------- //

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
		panicking = data.state;
		if (data.state) log("⚠️ Healer panicking — holding fire!", "#ffcc00", "Alerts");
		else            log("✅ Healer panic over — resuming.", "#00ff00", "Alerts");
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

// Started by every character — keeps this character's own state cache fresh.
async function state_cache_loop() {
	STATE_CACHE_LOOP_ENABLED = true;
	while (true) {
		if (!STATE_CACHE_LOOP_ENABLED) {
			await delay(100);
			continue;
		}
		write_state_cache();
		await delay(100);
	}
}

