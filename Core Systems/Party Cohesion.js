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

const PACE_MATCH_PX = 1;
const PACE_GAIN = 0.4;
const PACE_FREE_PX = 100;
const PACE_FREE = 500;
const PACE_SEND_MS = 250;
let _pace = { sent: PACE_FREE, at: 0 };

function follow_pace(pos, d) {
	if (!pos.formation || !pos.speed || d >= PACE_FREE_PX) return null;
	return Math.round(pos.speed + Math.max(0, d - PACE_MATCH_PX) * PACE_GAIN);
}

function convoy_pace(goal) {
	const cap = goal && goal.pace ? goal.pace : PACE_FREE;
	if (cap === _pace.sent) return;
	const now = Date.now();
	if (cap !== PACE_FREE && now - _pace.at < PACE_SEND_MS) return;
	_pace.sent = cap;
	_pace.at = now;
	Promise.resolve(cruise(cap)).catch(() => { });
}

function follow_has_leader() {
	const pos = leader_position();
	return !!pos && !pos.rip;
}

function party_cohesion_hold(event) {
	if (character.name !== MOVEMENT_LEADER) return false;

	const limit = (party_member_in_danger() || _cohesion_holding) ? cohesion_regroup() : cohesion_range();
	const travelling = is_travelling();
	_cohesion_holding = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip || s.paused) return false;
		if (event && s.goal === event.label) return false;
		if (s.map !== character.map) return !travelling;
		return Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});
	return _cohesion_holding;
}

function cohesion_closing(d) {
	if (d > cohesion_range()) _cohesion_closing = true;
	else if (d <= cohesion_regroup()) _cohesion_closing = false;
	return _cohesion_closing;
}

function follower_holds_back(event) {
	if (character.name === MOVEMENT_LEADER) return false;
	const pos = leader_position();
	if (!pos || pos.rip || pos.map !== character.map) return false;
	if (!cohesion_closing(Math.hypot(character.x - pos.x, character.y - pos.y))) return false;
	const c = read_state_cache(MOVEMENT_LEADER);
	return !c || c.goal !== event.label;
}

let _trail = { map: null, crumbs: [], seen: null, leg: null };

function record_leader_trail() {
	const live = get_player(MOVEMENT_LEADER);
	if (!live) return;
	const here = { x: live.x, y: live.y };
	if (_trail.map !== character.map || !_trail.seen || Math.hypot(here.x - _trail.seen.x, here.y - _trail.seen.y) > TRAIL_JUMP) {
		_trail = { map: character.map, crumbs: [], seen: here, leg: null };
	}
	_trail.seen = here;
	const leg = live.moving ? { x: live.going_x, y: live.going_y } : here;
	if (_trail.leg && Math.hypot(leg.x - _trail.leg.x, leg.y - _trail.leg.y) < 1) return;
	const turned_at_end = _trail.leg && Math.hypot(here.x - _trail.leg.x, here.y - _trail.leg.y) < TRAIL_CORNER;
	_trail.crumbs.push(turned_at_end ? _trail.leg : here);
	_trail.leg = leg;
	if (_trail.crumbs.length > TRAIL_MAX) _trail.crumbs.shift();
}

function trail_point() {
	if (_trail.map !== character.map) return null;
	const live = get_player(MOVEMENT_LEADER);
	const last = live ? { x: live.x, y: live.y, live: true } : _trail.seen;
	const points = last ? _trail.crumbs.concat([last]) : _trail.crumbs;
	for (let i = points.length - 1; i >= 0; i--) {
		const p = points[i];
		if (!can_move_to(p.x, p.y)) continue;
		if (Math.hypot(character.x - p.x, character.y - p.y) > LOCAL_MOVE_SLOP) return p;
		return p.live ? p : null;
	}
	return null;
}

const PASSAGE_RETRY_MS = 1000;
const TRANSPORTER_REACH = 75;
let _passage_sent_at = 0;

function leader_passage(pos) {
	if (_trail.map !== character.map || !_trail.seen) return null;
	const seen = _trail.seen;
	for (const door of G.maps[character.map].doors) {
		if (door[4] !== pos.map) continue;
		if (is_door_close(character.map, door, seen.x, seen.y)) return { to: door[4], s: door[5] || 0, door };
	}
	const place = G.npcs.transporter.places[pos.map];
	if (place === undefined) return null;
	for (const npc of G.maps[character.map].npcs) {
		if (npc.id !== "transporter") continue;
		const at = { x: npc.position[0], y: npc.position[1] };
		if (Math.hypot(at.x - seen.x, at.y - seen.y) < TRANSPORTER_REACH) return { to: pos.map, s: place, at };
	}
	return null;
}

function passage_usable(p) {
	if (p.door) {
		return is_door_close(character.map, p.door, character.real_x, character.real_y)
			&& can_use_door(character.map, p.door, character.real_x, character.real_y);
	}
	return Math.hypot(p.at.x - character.real_x, p.at.y - character.real_y) < TRANSPORTER_REACH;
}

function passage_step(goal) {
	const now = Date.now();
	if (now - _passage_sent_at < PASSAGE_RETRY_MS) return;
	_passage_sent_at = now;
	parent.socket.emit("transport", { to: goal.passage.to, s: goal.passage.s });
	Promise.resolve(parent.push_deferred("transport")).catch(() => { });
}

function trail_step(goal) {
	const p = goal.point;
	if (Math.hypot(character.x - p.x, character.y - p.y) < LOCAL_MOVE_SLOP) return;
	if (character.moving && Math.hypot(character.going_x - p.x, character.going_y - p.y) < LOCAL_MOVE_SLOP) return;
	walk(p.x, p.y);
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
		if (passage && passage_usable(passage)) {
			return { local: "passage", label: "follow-door", passage, chasing: true, disengage: pos.disengaging };
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
