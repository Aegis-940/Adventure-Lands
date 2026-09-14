// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON TELEMETRY — a flight recorder for dungeon runs, pushed to the local sink as errlog samples
// --------------------------------------------------------------------------------------------------------------------------------- //

const TELEMETRY_TICK_MS = 2000;
const TELEMETRY_NEARBY_RADIUS = 600;
const TELEMETRY_STUCK_EPS = 15;
const TELEMETRY_ENGAGED_RADIUS = 200;

let _telemetry_last = null;
let _telemetry_was_rip = false;
let _telemetry_still_since = 0;
let _telemetry_free_since = 0;

function dungeon_telemetry_on() {
	if (typeof active_dungeon !== "function") return false;
	return !!active_dungeon() && typeof errlog_sample === "function";
}

function telemetry_nearby() {
	const counts = {};
	let nearest = null;
	let nearest_d = Infinity;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		const d = Math.hypot(character.x - e.x, character.y - e.y);
		if (d > TELEMETRY_NEARBY_RADIUS) continue;
		counts[e.mtype] = (counts[e.mtype] || 0) + 1;
		if (d < nearest_d) {
			nearest_d = d;
			nearest = e;
		}
	}

	return {
		counts,
		nearest: nearest ? nearest.mtype : null,
		nearest_d: nearest ? Math.round(nearest_d) : null,
		nearest_target: nearest ? (nearest.target || null) : null,
	};
}

function telemetry_aggro() {
	let on_me = 0;
	let on_party = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.target) continue;
		if (e.target === character.name) on_me++;
		else if (DUNGEON_PARTY.includes(e.target)) on_party++;
	}
	return { on_me, on_party };
}

function dungeon_telemetry_tick() {
	try {
		if (!dungeon_telemetry_on()) {
			_telemetry_last = null;
			return;
		}

		const d = active_dungeon();
		const near = telemetry_nearby();
		const aggro = telemetry_aggro();
		const focus = typeof dungeon_focus_target === "function" ? dungeon_focus_target() : null;

		const moved = _telemetry_last
			? Math.round(Math.hypot(character.x - _telemetry_last.x, character.y - _telemetry_last.y))
			: 0;

		const now = Date.now();
		if (moved > TELEMETRY_STUCK_EPS) _telemetry_still_since = now;
		else if (!_telemetry_still_since) _telemetry_still_since = now;

		const engaged = near.nearest_d !== null && near.nearest_d <= TELEMETRY_ENGAGED_RADIUS;
		if (moved > TELEMETRY_STUCK_EPS || engaged) _telemetry_free_since = now;
		else if (!_telemetry_free_since) _telemetry_free_since = now;

		if (character.rip && !_telemetry_was_rip) {
			dungeon_telemetry_event("death", {
				nearest: near.nearest,
				nearest_d: near.nearest_d,
				aggro_on_me: aggro.on_me,
				counts: near.counts,
			});
		}
		_telemetry_was_rip = !!character.rip;

		errlog_sample("dungeon", {
			dungeon: d.name,
			map: character.map,
			x: Math.round(character.x),
			y: Math.round(character.y),
			moved,
			still_ms: now - _telemetry_still_since,
			stuck_ms: now - _telemetry_free_since,
			gold: character.gold,
			esize: character.esize,
			chests: Object.keys(get_chests()).length,
			hp_pct: character.max_hp ? +(character.hp / character.max_hp).toFixed(2) : 0,
			mp_pct: character.max_mp ? +(character.mp / character.max_mp).toFixed(2) : 0,
			rip: !!character.rip,
			target: character.target || null,
			aggro_on_me: aggro.on_me,
			aggro_on_party: aggro.on_party,
			actions: typeof take_basic_action_count === "function" ? take_basic_action_count() : null,
			focus: focus ? focus.mtype : null,
			focus_hp: focus ? focus.hp : null,
			focus_d: focus ? Math.round(Math.hypot(character.x - focus.x, character.y - focus.y)) : null,
			nearest: near.nearest,
			nearest_d: near.nearest_d,
			nearest_target: near.nearest_target,
			counts: near.counts,
			smart_moving: !!smart.moving,
			goal: typeof current_goal_label === "function" ? current_goal_label() : null,
			bailing: typeof dungeon_bailing === "function" && dungeon_bailing(),
			channelling: !!(character.c && character.c.town),
			kills: Object.assign({}, _dungeon_kills),
		});

		_telemetry_last = { x: character.x, y: character.y };
	} catch (e) {
		console.error("dungeon telemetry error", e);
	}
}

setInterval(dungeon_telemetry_tick, TELEMETRY_TICK_MS);
