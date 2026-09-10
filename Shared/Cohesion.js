// --------------------------------------------------------------------------------------------------------------------------------- //
// COHESION & MOVEMENT GOAL — the fighters walk with the leader; one priority list
// --------------------------------------------------------------------------------------------------------------------------------- //

const COHESION_RANGE = 250;
const COHESION_REGROUP = 120;
const COHESION_FOLLOWERS = ["Ulric", "Riva"];

// Both sides run the same band off the same two constants. The leader waits past COHESION_RANGE
// and only resumes at COHESION_REGROUP, so a follower that stops closing at COHESION_RANGE leaves
// a gap it will never cross while she waits forever inside it.
let _cohesion_holding = false;
let _cohesion_closing = false;

function leader_position() {
	if (character.name === MOVEMENT_LEADER) return null;
	const c = read_state_cache(MOVEMENT_LEADER);
	const live = get_player(MOVEMENT_LEADER);
	if (live) return { map: character.map, x: live.x, y: live.y, rip: !!live.rip, travelling: !!(c && c.travelling) };
	return c ? { map: c.map, x: c.x, y: c.y, rip: !!c.rip, travelling: !!c.travelling } : null;
}

function follow_has_leader() {
	const pos = leader_position();
	return !!pos && !pos.rip;
}

function party_cohesion_hold() {
	if (character.name !== MOVEMENT_LEADER) return false;
	if (typeof panicking !== "undefined" && panicking) { _cohesion_holding = false; return false; }

	const limit = _cohesion_holding ? COHESION_REGROUP : COHESION_RANGE;
	_cohesion_holding = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip) return false;
		return s.map !== character.map || Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});
	return _cohesion_holding;
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
	return approach(pos, {
		label: "follow",
		arrive: pos.travelling ? fd : (_cohesion_closing ? COHESION_REGROUP : COHESION_RANGE),
		radius: fd + 30,
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

	const anniv = anniversary_destination();
	if (anniv) {
		const here = !!anniv.local || !!anniv.hold;
		if (!follow_has_leader() || (here && follow && follow.on_station)) return anniv;
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
			map: destination.map || character.map,
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
