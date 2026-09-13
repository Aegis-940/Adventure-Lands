// --------------------------------------------------------------------------------------------------------------------------------- //
// COHESION & MOVEMENT GOAL — the fighters walk with the leader; one priority list
// --------------------------------------------------------------------------------------------------------------------------------- //

const COHESION_RANGE = 250;
const COHESION_REGROUP = 120;
const COHESION_FOLLOWERS = ["Ulric", "Riva"];
const COHESION_DANGER_HP = 0.5;
const XP_LAG_LEVELS = 0.05;
const XP_LAG_CLEAR = 0.02;

let _xp_lagging = false;

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
	return !!g && g.local !== "farm" && g.local !== "event";
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

	if (typeof panicking !== "undefined" && panicking) { _cohesion_holding = false; return false; }

	const owed = typeof anniversary_should_travel === "function" && anniversary_should_travel();
	const endangered = party_member_in_danger();

	const limit = (endangered || _cohesion_holding) ? COHESION_REGROUP : COHESION_RANGE;
	_cohesion_holding = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip || s.paused) return false;
		if (owed && s.anniv_pending && !endangered) return false;
		return s.map !== character.map || Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});
	if (_cohesion_holding) return true;

	if (owed) return false;
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
	if (d > COHESION_RANGE) _cohesion_closing = true;
	else if (d <= COHESION_REGROUP) _cohesion_closing = false;

	const fd = CONFIG.movement.follow_distance;
	const arrive = pos.formation ? fd : (_cohesion_closing ? COHESION_REGROUP : COHESION_RANGE);
	return approach(pos, {
		label: "follow",
		arrive,
		radius: Math.min(fd + 30, arrive),
		ring: fd,
		chasing: true,
		arrived: { local: "farm", label: "with-leader", on_station: true },
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT GOAL — the one priority list for the three combat characters.
// --------------------------------------------------------------------------------------------------------------------------------- //

function approach(pos, o) {
	const map = pos.map || character.map;
	const travel = { label: o.label, map, x: pos.x, y: pos.y, radius: o.radius || o.arrive, chasing: o.chasing };
	if (map !== character.map) return travel;

	const d = Math.hypot(character.x - pos.x, character.y - pos.y);
	if (d <= o.arrive) return o.arrived;

	const a = Math.atan2(character.y - pos.y, character.x - pos.x);
	const step = { x: pos.x + Math.cos(a) * o.ring, y: pos.y + Math.sin(a) * o.ring };
	if (!smart.moving && can_move_to(step.x, step.y)) {
		return { local: "step", label: o.label + "-close", on_station: d <= COHESION_RANGE, step, chasing: o.chasing };
	}
	return travel;
}

function local_step(goal) {
	if (goal && goal.step) move(goal.step.x, goal.step.y);
}

function movement_goal() {
	if (!CONFIG.movement.enabled) return null;

	if (home === "giantspider" && character.name === MOVEMENT_LEADER) return null;

	if (party_cohesion_hold()) return { hold: true, label: "cohesion" };

	const follow = follow_goal();
	if (follow && !follow.local) return follow;

	const event = event_goal();
	if (follow && follow.on_station && event && event.local === "event") return event;

	if (!follow_has_leader()) {
		const anniv = anniversary_destination();
		if (anniv) return anniv;
	}

	if (follow) return follow;
	if (event) return event;

	if (home === "bscorpion") {
		return is_at_bscorpion_farm()
			? null
			: { label: "bscorpion", map: PRIM_FARM_LOC.map, x: PRIM_FARM_LOC.x, y: PRIM_FARM_LOC.y, radius: PRIM_FARM_RADIUS };
	}

	if (is_away_from_home()) {
		return {
			label: "home",
			map: destination.map,
			x: destination.x,
			y: destination.y,
			radius: home_radius(),
		};
	}

	return null;
}

function movement_local(goal, farm_step) {
	if (smart.moving) {
		log("🧭 local movement skipped — a journey is still in flight", "#FFA500", "Alerts");
		return;
	}
	if (goal && goal.local === "step") return local_step(goal);
	if (goal && goal.local === "event") return event_step(goal.event);
	if (typeof farm_step === "function") farm_step();
}
