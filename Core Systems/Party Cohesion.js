// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY COHESION — the fighters walk with the leader, and wait when one falls behind
// --------------------------------------------------------------------------------------------------------------------------------- //

const COHESION_RANGE = 250;
const COHESION_REGROUP = 120;
const COHESION_FOLLOWERS = ["Ulric", "Riva"];
const COHESION_DANGER_HP = 0.5;
const XP_LAG_LEVELS = 0.05;
const XP_LAG_CLEAR = 0.02;

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
	if (typeof destination === "undefined" || !destination) return false;
	if (!destination.map || !isFinite(destination.x) || !isFinite(destination.y)) return false;
	if (character.map !== destination.map) return true;
	return Math.hypot(character.x - destination.x, character.y - destination.y) > home_radius();
}

function party_in_formation() {
	if (typeof is_travelling === "function" && is_travelling()) return true;
	const g = typeof current_goal === "function" ? current_goal() : null;
	return !!g && g.local !== "farm" && g.local !== "event" && g.local !== "loot";
}

function leader_position() {
	if (character.name === MOVEMENT_LEADER) return null;
	const c = read_state_cache(MOVEMENT_LEADER);
	const live = get_player(MOVEMENT_LEADER);
	if (live) return { map: character.map, x: live.x, y: live.y, rip: !!live.rip, formation: !!(c && c.formation) };
	return c ? { map: c.map, x: c.x, y: c.y, rip: !!c.rip, formation: !!c.formation } : null;
}

function follow_has_leader() {
	const pos = leader_position();
	return !!pos && !pos.rip;
}

function party_cohesion_hold() {
	if (character.name !== MOVEMENT_LEADER) return false;

	const owed = !dungeon_flag("ignore_events")
		&& typeof anniversary_should_travel === "function" && anniversary_should_travel();
	const endangered = party_member_in_danger();

	const limit = (endangered || _cohesion_holding) ? cohesion_regroup() : cohesion_range();
	const travelling = typeof is_travelling === "function" && is_travelling();
	_cohesion_holding = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip || s.paused) return false;
		if (owed && s.anniv_pending && !endangered) return false;
		if (s.map !== character.map) return !travelling;
		return Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});
	if (_cohesion_holding) return true;

	if (owed || dungeon_flag("ignore_events")) return false;
	return COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		return !!s && !s.rip && !s.paused && !!s.anniv_pending;
	});
}

function follow_goal() {
	const pos = leader_position();
	if (!pos || pos.rip) return null;

	const d = pos.map === character.map
		? Math.hypot(character.x - pos.x, character.y - pos.y)
		: Infinity;
	if (d > cohesion_range()) _cohesion_closing = true;
	else if (d <= cohesion_regroup()) _cohesion_closing = false;

	const fd = CONFIG.movement.follow_distance;
	const arrive = pos.formation ? fd : (_cohesion_closing ? cohesion_regroup() : cohesion_range());
	return approach(pos, {
		label: "follow",
		arrive,
		radius: Math.min(fd + 30, arrive),
		ring: fd,
		chasing: true,
		arrived: { local: "farm", label: "with-leader", on_station: true },
	});
}
