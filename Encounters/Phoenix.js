// --------------------------------------------------------------------------------------------------------------------------------- //
// PHOENIX — the on-demand hunt: each fighter watches its own beat of the five spawn boxes, the party gathers on a sighting and splits
// again after the kill; while it runs the vitality earrings are kept for Riff to compound and craft into clover studs
// --------------------------------------------------------------------------------------------------------------------------------- //

const PHOENIX = "phoenix";
const PHOENIX_HUNT_KEY = "AL_phoenix_hunt";
const PHOENIX_WATCH_PREFIX = "AL_phoenix_watch_";

const PHOENIX_POSTS = {
	east:       { map: "main", x: 1188, y: -193 },
	south:      { map: "main", x: 641, y: 1803 },
	west_north: { map: "main", x: -1184, y: 320 },
	west_south: { map: "main", x: -1184, y: 1190 },
	halloween:  { map: "halloween", x: 8, y: 630 },
	cave:       { map: "cave", x: -180, y: -1164 },
};

const PHOENIX_BEATS = {
	Ulric: ["east", "halloween"],
	Myras: ["south", "cave"],
	Riva: ["west_north", "west_south"],
};

const PHOENIX_KEEP = ["vitearring"];
const PHOENIX_CRAFT = "cloverstud";

const PHOENIX_TICK_MS = 250;
const PHOENIX_WRITE_MS = 500;
const PHOENIX_SIGHTING_MS = 4000;
const PHOENIX_RESPAWN_MARGIN_MS = 2000;
const PHOENIX_LOOT_MS = 5000;
const PHOENIX_POST_REACH = 60;
const PHOENIX_GATHER_REACH = 100;
const PHOENIX_OTHER_MAP = 1e6;

let _phoenix_mine = { seen: null, dead: null, checked: {} };
let _phoenix_view = null;
let _phoenix_written_at = 0;

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE HUNT — on while a fighter's farm target is the phoenix; each fighter switches home in and out of it live
// --------------------------------------------------------------------------------------------------------------------------------- //

function phoenix_hunting() {
	return home === PHOENIX;
}

function phoenix_hunt_on() {
	return Object.keys(PHOENIX_BEATS).some(name => farm_target_setting(name) === PHOENIX);
}

function phoenix_keeps(name) {
	return PHOENIX_KEEP.includes(name) && phoenix_hunt_on();
}

function phoenix_follow_target() {
	const chosen = farm_target_for(character.name);
	if (chosen !== home && (chosen === PHOENIX || home === PHOENIX)) switch_home(chosen);
}

function phoenix_respawn_ms() {
	return G.monsters[PHOENIX].respawn * 1000;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WATCH — what this fighter sees, shared through localStorage; every fighter merges all three records
// --------------------------------------------------------------------------------------------------------------------------------- //

function phoenix_in_sight() {
	return get_nearest_monster({ type: PHOENIX });
}

function phoenix_at(place, reach) {
	return character.map === place.map && Math.hypot(character.x - place.x, character.y - place.y) <= reach;
}

function phoenix_post_of(spot) {
	let best = null;
	let best_d = Infinity;
	for (const name in PHOENIX_POSTS) {
		const post = PHOENIX_POSTS[name];
		if (post.map !== spot.map) continue;
		const d = Math.hypot(spot.x - post.x, spot.y - post.y);
		if (d < best_d) {
			best = name;
			best_d = d;
		}
	}
	return best;
}

function phoenix_found_s(now) {
	const dead_at = phoenix_view().dead_at;
	if (!dead_at) return null;
	return Math.round((now - dead_at - phoenix_respawn_ms()) / 100) / 10;
}

function phoenix_watch(now) {
	const bird = phoenix_in_sight();
	if (bird) {
		const seen = _phoenix_mine.seen && _phoenix_mine.seen.id === bird.id ? _phoenix_mine.seen : null;
		_phoenix_mine.seen = {
			id: bird.id, map: character.map, x: Math.round(bird.x), y: Math.round(bird.y), at: now,
			first: seen ? seen.first : now,
			found_s: seen ? seen.found_s : phoenix_found_s(now),
		};
		return;
	}
	for (const name in PHOENIX_POSTS) {
		if (phoenix_at(PHOENIX_POSTS[name], PHOENIX_POST_REACH)) _phoenix_mine.checked[name] = now;
	}
}

function phoenix_write(now) {
	if (now - _phoenix_written_at < PHOENIX_WRITE_MS) return;
	_phoenix_written_at = now;
	storage_write(PHOENIX_WATCH_PREFIX + character.name, _phoenix_mine);
}

function phoenix_merge(now) {
	const view = { at: now, seen: null, dead_at: 0, dead_id: null, checked: {}, first: {} };
	const sightings = [];
	for (const name in PHOENIX_BEATS) {
		const r = storage_read(PHOENIX_WATCH_PREFIX + name);
		if (!r) continue;
		if (r.dead && r.dead.at > view.dead_at) {
			view.dead_at = r.dead.at;
			view.dead_id = r.dead.id;
		}
		for (const post in r.checked) view.checked[post] = Math.max(view.checked[post] || 0, r.checked[post]);
		if (r.seen) sightings.push(Object.assign({ by: name }, r.seen));
	}
	for (const s of sightings) {
		if (s.id === view.dead_id || now - s.at > PHOENIX_SIGHTING_MS) continue;
		view.first[s.id] = Math.min(view.first[s.id] || Infinity, s.first);
		if (!view.seen || s.at > view.seen.at) view.seen = s;
	}
	return view;
}

function phoenix_view() {
	const now = Date.now();
	if (!_phoenix_view || now - _phoenix_view.at >= PHOENIX_TICK_MS) _phoenix_view = phoenix_merge(now);
	return _phoenix_view;
}

function phoenix_died(id) {
	const seen = _phoenix_mine.seen;
	if (!seen || seen.id !== id) return;
	const now = Date.now();
	const first = Math.min(phoenix_view().first[id] || Infinity, seen.first);
	const kill_s = Math.round((now - first) / 100) / 10;
	errlog_archive("phoenix", { id, post: phoenix_post_of(seen), found_s: seen.found_s, kill_s });
	log_msg("event", `🔥 Phoenix down at ${phoenix_post_of(seen)} after ${kill_s}s${seen.found_s === null ? "" : `, found ${seen.found_s}s after it could respawn`}`);
	_phoenix_mine.dead = { id, at: now };
	_phoenix_mine.seen = null;
	_phoenix_written_at = 0;
	phoenix_write(now);
	_phoenix_view = null;
}

function phoenix_tick() {
	phoenix_follow_target();
	if (!phoenix_hunting()) return;
	const now = Date.now();
	phoenix_watch(now);
	phoenix_write(now);
}

function phoenix_hunt_start() {
	_phoenix_mine = storage_read(PHOENIX_WATCH_PREFIX + character.name) || _phoenix_mine;
	on_socket("death", "phoenix_death", data => phoenix_died(data.id));
	on_socket("kill_credit", "phoenix_credit", data => {
		if (data.mtype === PHOENIX && _phoenix_mine.seen) phoenix_died(_phoenix_mine.seen.id);
	});
	every("phoenix_tick", { ms: PHOENIX_TICK_MS, kind: "automation", fixed: true }, phoenix_tick);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// GOAL — fight it in sight, loot the kill, gather on a sighting, otherwise walk the beat to the post checked longest ago
// --------------------------------------------------------------------------------------------------------------------------------- //

function phoenix_post_away(name) {
	const post = PHOENIX_POSTS[name];
	return post.map === character.map ? Math.hypot(character.x - post.x, character.y - post.y) : PHOENIX_OTHER_MAP;
}

function phoenix_next_post(view) {
	const spawn = view.dead_at ? view.dead_at + phoenix_respawn_ms() + PHOENIX_RESPAWN_MARGIN_MS : 0;
	const checked = name => (view.checked[name] || 0) >= spawn ? view.checked[name] || 0 : 0;
	return PHOENIX_BEATS[character.name].slice()
		.sort((a, b) => checked(a) - checked(b) || phoenix_post_away(a) - phoenix_post_away(b))[0];
}

function phoenix_trip(label, place, reach) {
	if (phoenix_at(place, reach)) return { local: "keep", label };
	return { label, map: place.map, x: place.x, y: place.y, radius: reach / 2 };
}

function phoenix_fight_goal(bird) {
	const stand = engage_point(bird);
	if (is_in_range(bird, "attack") || can_move_to(stand.x, stand.y)) {
		return { local: PHOENIX, pursuit: true, event: PHOENIX, label: "phoenix-fight" };
	}
	return { pursuit: true, event: PHOENIX, label: "phoenix-fight", map: character.map, x: bird.x, y: bird.y, radius: PHOENIX_GATHER_REACH / 2 };
}

function phoenix_goal() {
	const bird = phoenix_in_sight();
	if (bird) return phoenix_fight_goal(bird);

	const view = phoenix_view();
	if (get_num_chests() > 0 && Date.now() - view.dead_at < PHOENIX_LOOT_MS) {
		return { local: "loot", label: "phoenix-loot", passive: true };
	}
	if (view.seen) return phoenix_trip("phoenix-gather", view.seen, PHOENIX_GATHER_REACH);

	const post = phoenix_next_post(view);
	return phoenix_trip("phoenix-" + post, PHOENIX_POSTS[post], PHOENIX_POST_REACH);
}

function phoenix_step(goal, engage_step) {
	const bird = phoenix_in_sight();
	if (!bird) return;
	if (engage_step) return engage_step(bird);
	if (is_in_range(bird, "attack")) return;
	const stand = engage_point(bird);
	local_move(stand.x, stand.y);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ENCOUNTERS — the hunt as the party's home (its goal and the settings that follow it onto every map), and the bird itself
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("phoenix hunt", {
	tier: "spawn",
	homes: [PHOENIX],
	goal: () => phoenix_goal(),
	steps: {
		phoenix: phoenix_step,
	},
	home_settings: {
		all: { cohesion: false, events: false, looting: true, chest_threshold: 1 },
		priest: { aggro_cap: 0 },
	},
});

encounter(PHOENIX, {
	tier: "situation",
	mtypes: [PHOENIX],
	active: ctx => ctx.mobs.of(PHOENIX).length > 0,
	gear: {
		warrior: { weapon: "single" },
		ranger: { weapon: "single" },
		priest: { loadout: "luck" },
	},
	allows: {
		warrior: { pull: false },
	},
	rank: {
		ranger: 1,
	},
});

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONSOLE
// --------------------------------------------------------------------------------------------------------------------------------- //

function phoenix_hunt() {
	if (storage_read(PHOENIX_HUNT_KEY)) return "already hunting: phoenix_status() shows where everyone is";
	const before = {};
	for (const name in PHOENIX_BEATS) {
		before[name] = farm_target_setting(name);
		save_setting("farm_" + name, PHOENIX);
	}
	storage_write(PHOENIX_HUNT_KEY, { started: Date.now(), before });
	return "hunting the phoenix: " + Object.keys(PHOENIX_BEATS).map(name => `${name} ${PHOENIX_BEATS[name].join(" + ")}`).join(", ")
		+ "; phoenix_hunt_stop() puts the farm targets back";
}

function phoenix_hunt_stop() {
	const hunt = storage_read(PHOENIX_HUNT_KEY);
	const back = {};
	for (const name in PHOENIX_BEATS) {
		const was = hunt && hunt.before[name];
		back[name] = was && was !== PHOENIX ? was : DEFAULT_FARM_TARGET;
		save_setting("farm_" + name, back[name]);
	}
	storage_remove(PHOENIX_HUNT_KEY);
	return "hunt over: " + Object.keys(back).map(name => `${name} → ${back[name]}`).join(", ");
}

function phoenix_status() {
	const now = Date.now();
	const view = phoenix_merge(now);
	const ago = t => t ? Math.round((now - t) / 1000) + "s ago" : "never";
	const hunt = storage_read(PHOENIX_HUNT_KEY);
	const lines = [`hunt ${phoenix_hunt_on() ? "on" : "off"}${hunt ? ", started " + ago(hunt.started) : ""}`];
	for (const name in PHOENIX_BEATS) {
		const s = read_state_cache(name);
		lines.push(`${name.padEnd(6)} ${String(farm_target_setting(name)).padEnd(10)} ${s ? `${s.map} ${s.goal || "-"}` : "no state"}`
			+ ` (beat ${PHOENIX_BEATS[name].join(" + ")})`);
	}
	lines.push(view.seen ? `in sight of ${view.seen.by} on ${view.seen.map} ${view.seen.x},${view.seen.y}` : "not in sight");
	lines.push("last kill " + ago(view.dead_at));
	lines.push("posts checked: " + Object.keys(PHOENIX_POSTS).map(name => `${name} ${ago(view.checked[name])}`).join(", "));
	return lines.join("\n");
}

console_api({
	phoenix_hunt: "send Ulric, Myras and Riva to hunt the phoenix: each watches its own spawn boxes, all gather on a sighting",
	phoenix_hunt_stop: "end the phoenix hunt and put each fighter's farm target back",
	phoenix_status: "the phoenix hunt: who is where, the last sighting and kill, and when each post was last checked",
});
