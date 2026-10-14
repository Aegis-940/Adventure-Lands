// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY COHESION — the fighters walk with the leader, and wait when one falls behind
// --------------------------------------------------------------------------------------------------------------------------------- //

const COHESION_RANGE = 250;
const COHESION_REGROUP = 120;
const COHESION_FOLLOWERS = ["Ulric", "Riva"];
const COHESION_DANGER_HP = 0.5;
const XP_LAG_LEVELS = 0.05;
const XP_LAG_CLEAR = 0.02;
const FOLLOW_RING = 0.8;
const TRAIL_CORNER = 20;
const TRAIL_MAX = 60;
const TRAIL_JUMP = 120;

let _xp_lagging = false;

function cohesion_range() {
	return dungeon_setting("cohesion_range", COHESION_RANGE);
}

function cohesion_regroup() {
	return dungeon_setting("cohesion_regroup", COHESION_REGROUP);
}

function xp_progress(state) {
	if (!state || !state.level) return null;
	const max_xp = state.max_xp || 0;
	return state.level + (max_xp > 0 ? (state.xp || 0) / max_xp : 0);
}

function behind_on_xp() {
	const mine = xp_progress(character);
	if (mine === null) return false;

	let best = mine;
	for (const name of COHESION_FOLLOWERS.concat([MOVEMENT_LEADER])) {
		if (name === character.name) continue;
		const theirs = xp_progress(read_state_cache(name));
		if (theirs !== null && theirs > best) best = theirs;
	}

	const gap = best - mine;
	_xp_lagging = _xp_lagging ? gap > XP_LAG_CLEAR : gap > XP_LAG_LEVELS;
	return _xp_lagging;
}

function party_member_in_danger() {
	if (character.max_hp && !character.rip && character.hp / character.max_hp <= COHESION_DANGER_HP) return character.name;

	for (const name of COHESION_FOLLOWERS.concat([MOVEMENT_LEADER])) {
		if (name === character.name) continue;
		const s = read_state_cache(name);
		if (!s || s.rip || s.paused || !s.max_hp) continue;
		if (s.hp / s.max_hp <= COHESION_DANGER_HP) return name;
	}
	return null;
}

let _cohesion_holding = false;
let _cohesion_closing = false;

function home_radius() {
	return (CONFIG.movement.circle_radius || 75) + 20;
}

function is_away_from_home() {
	if (!destination) return false;
	if (!destination.map || !isFinite(destination.x) || !isFinite(destination.y)) return false;
	if (character.map !== destination.map) return true;
	return Math.hypot(character.x - destination.x, character.y - destination.y) > home_radius();
}

function party_in_formation() {
	if (is_travelling()) return true;
	const g = current_goal();
	return !!g && g.local !== "farm" && g.local !== "event" && g.local !== "loot" && g.local !== "camp";
}

function leader_position() {
	if (character.name === MOVEMENT_LEADER) return null;
	const c = read_state_cache(MOVEMENT_LEADER);
	const live = get_player(MOVEMENT_LEADER);
	const disengaging = !!(c && c.disengaging);
	if (live) {
		const going = live.moving ? { x: live.going_x, y: live.going_y } : null;
		return { map: character.map, x: live.x, y: live.y, going, speed: live.speed, town: !!live.c.town, rip: !!live.rip, formation: !!(c && c.formation), disengaging };
	}
	return c ? { map: c.map, x: c.x, y: c.y, going: null, speed: c.speed, town: !!c.town, rip: !!c.rip, formation: !!c.formation, disengaging } : null;
}

const PACE_MATCH_PX = 25;
const PACE_FREE_PX = 60;
const PACE_FREE = 500;
const PACE_SEND_MS = 1000;
let _pace = { sent: PACE_FREE, at: 0, matched: false };

function follow_pace(pos, d) {
	if (!pos.formation || !pos.speed) return null;
	if (_pace.matched ? d >= PACE_FREE_PX : d > PACE_MATCH_PX) {
		_pace.matched = false;
		return null;
	}
	_pace.matched = true;
	return Math.round(pos.speed);
}

function convoy_pace(goal) {
	const cap = goal && goal.pace ? goal.pace : PACE_FREE;
	if (!goal || !goal.pace) _pace.matched = false;
	if (cap === _pace.sent) return;
	const now = Date.now();
	if (cap !== PACE_FREE && now - _pace.at < PACE_SEND_MS) return;
	_pace.sent = cap;
	_pace.at = now;
	Promise.resolve(cruise(cap)).catch(() => { });
}

function follow_goal() {
	record_leader_trail();
	const pos = leader_position();
	if (!pos || pos.rip) return null;

	const d = pos.map === character.map
		? Math.hypot(character.x - pos.x, character.y - pos.y)
		: Infinity;
	const closing = cohesion_closing(d);
	const pace = follow_pace(pos, d);

	if (pos.town && pos.map === character.map && town_near_spawn()) {
		return { local: "keep", label: "await-town", passive: true, disengage: pos.disengaging };
	}

	if (pos.map !== character.map) {
		const passage = leader_passage(pos);
		if (passage) {
			if (passage_usable(passage)) {
				return { local: "passage", label: "follow-door", passage, chasing: true, disengage: pos.disengaging };
			}
			const at = passage_point(passage);
			if (can_move_to(at.x, at.y)) {
				return { local: "step", label: "follow-door", step: at, chasing: true, disengage: pos.disengaging };
			}
		}
	}

	const fd = CONFIG.movement.follow_distance;
	const arrive = pos.formation ? fd : (closing ? cohesion_regroup() : cohesion_range());
	const near = approach(pos, {
		label: "follow",
		arrive,
		radius: Math.min(fd + 30, arrive),
		ring: fd * FOLLOW_RING,
		aim: pos.formation ? pos.going : null,
		chasing: true,
		disengage: pos.disengaging,
		arrived: { local: pos.formation ? "keep" : "farm", label: "with-leader", pace, disengage: pos.disengaging },
	});
	if (near.local) {
		near.pace = pace;
		return near;
	}
	const point = trail_point();
	return point ? { local: "trail", label: "follow-trail", point, pace, chasing: true, disengage: pos.disengaging } : near;
}
