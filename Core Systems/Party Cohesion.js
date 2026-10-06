// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY COHESION — the fighters walk with the leader, and wait when one falls behind
// --------------------------------------------------------------------------------------------------------------------------------- //

const COHESION_RANGE = 250;
const COHESION_REGROUP = 120;
const COHESION_FOLLOWERS = ["Ulric", "Riva"];
const COHESION_DANGER_HP = 0.5;
const XP_LAG_LEVELS = 0.05;
const XP_LAG_CLEAR = 0.02;
const FOLLOW_LEASH = 80;
const FOLLOW_RING = 0.8;
const TRAIL_SPACING = 25;
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
	const heading = c ? c.heading : null;
	if (live) return { map: character.map, x: live.x, y: live.y, rip: !!live.rip, formation: !!(c && c.formation), disengaging, heading };
	return c ? { map: c.map, x: c.x, y: c.y, rip: !!c.rip, formation: !!c.formation, disengaging, heading } : null;
}

function travel_heading() {
	const g = current_goal();
	if (!g || g.local || g.hold || !isFinite(g.x) || !isFinite(g.y)) return null;
	return { map: g.map || character.map, x: g.x, y: g.y, radius: g.radius || TRAVEL_ARRIVE };
}

function follow_has_leader() {
	const pos = leader_position();
	return !!pos && !pos.rip;
}

function party_cohesion_hold() {
	if (character.name !== MOVEMENT_LEADER) return false;

	const owed = !dungeon_ignores_events()
		&& anniversary_should_travel();
	const endangered = party_member_in_danger();

	const limit = (endangered || _cohesion_holding) ? cohesion_regroup() : cohesion_range();
	const travelling = is_travelling();
	_cohesion_holding = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip || s.paused) return false;
		if (owed && s.anniv_pending && !endangered) return false;
		if (s.map !== character.map) return !travelling;
		return Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});
	if (_cohesion_holding) return true;

	if (owed || dungeon_ignores_events()) return false;
	return COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		return !!s && !s.rip && !s.paused && !!s.anniv_pending;
	});
}

let _trail = { map: null, crumbs: [] };

function record_leader_trail() {
	if (_trail.map !== character.map) _trail = { map: character.map, crumbs: [] };
	const live = get_player(MOVEMENT_LEADER);
	if (!live) return;
	if (live.rip) {
		_trail.crumbs = [];
		return;
	}
	const last = _trail.crumbs[_trail.crumbs.length - 1];
	if (last) {
		const d = Math.hypot(live.x - last.x, live.y - last.y);
		if (d < TRAIL_SPACING) return;
		if (d > TRAIL_JUMP) _trail.crumbs = [];
	}
	_trail.crumbs.push({ x: live.x, y: live.y });
	if (_trail.crumbs.length > TRAIL_MAX) _trail.crumbs.shift();
}

function trail_point() {
	for (let i = _trail.crumbs.length - 1; i >= 0; i--) {
		const c = _trail.crumbs[i];
		if (!can_move_to(c.x, c.y)) continue;
		return Math.hypot(character.x - c.x, character.y - c.y) > TRAIL_SPACING ? c : null;
	}
	return null;
}

function trail_step(goal) {
	const p = goal.point;
	if (character.moving && Math.hypot(character.going_x - p.x, character.going_y - p.y) < LOCAL_MOVE_SLOP) return;
	move(p.x, p.y);
}

function follow_goal() {
	record_leader_trail();
	const pos = leader_position();
	if (!pos || pos.rip) return null;

	const d = pos.map === character.map
		? Math.hypot(character.x - pos.x, character.y - pos.y)
		: Infinity;
	if (d > cohesion_range()) _cohesion_closing = true;
	else if (d <= cohesion_regroup()) _cohesion_closing = false;

	const fd = CONFIG.movement.follow_distance;
	const arrive = pos.formation ? fd : (_cohesion_closing ? cohesion_regroup() : cohesion_range());
	const near = approach(pos, {
		label: "follow",
		arrive,
		radius: Math.min(fd + 30, arrive),
		ring: fd * FOLLOW_RING,
		chasing: true,
		disengage: pos.disengaging,
		arrived: { local: "farm", label: "with-leader", disengage: pos.disengaging },
	});
	if (near.local) return near;
	if (pos.map === character.map) {
		const point = trail_point();
		if (point) return { local: "trail", label: "follow-trail", point, chasing: true, disengage: pos.disengaging };
	}
	if (!pos.heading || in_dungeon()) return near;
	return follow_heading(pos, pos.heading, pos.disengaging);
}

function follow_heading(pos, h, disengage) {
	const there = character.map === h.map && Math.hypot(character.x - h.x, character.y - h.y) <= h.radius;
	if (there || ahead_of_leader(pos, h)) return { local: "wait", label: "follow-wait", chasing: true, disengage };
	return { label: "follow-heading", map: h.map, x: h.x, y: h.y, radius: h.radius, chasing: true, disengage };
}

function ahead_of_leader(pos, h) {
	if (pos.map !== character.map) return character.map === h.map;
	if (Math.hypot(character.x - pos.x, character.y - pos.y) <= FOLLOW_LEASH) return false;

	const live = get_player(MOVEMENT_LEADER);
	if (live && live.moving) {
		return (character.x - live.x) * (live.going_x - live.x) + (character.y - live.y) * (live.going_y - live.y) > 0;
	}
	if (character.map !== h.map) return false;
	return Math.hypot(character.x - h.x, character.y - h.y) < Math.hypot(pos.x - h.x, pos.y - h.y);
}
