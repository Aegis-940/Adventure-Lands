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

// Tight whenever the leader has somewhere to be, not merely while she is moving. Going slack the
// moment she stops is what put followers out of range at the exact instant the party had to act.
// Farming and combat are the only times a follower should spread out.
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

	const limit = _cohesion_holding ? COHESION_REGROUP : COHESION_RANGE;
	_cohesion_holding = COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.rip) return false;
		// A follower on the same visit is not a straggler: we are both converging on the featured
		// player, not on each other. Counting it stalls us short of the target while we wait for
		// someone walking to the same place.
		if (owed && s.anniv_pending) return false;
		return s.map !== character.map || Math.hypot(s.x - character.x, s.y - character.y) > limit;
	});
	if (_cohesion_holding) return true;

	// Distance alone cannot express "wait for their kiss": they are standing next to us precisely
	// because they are following us. While we still owe a visit we lead instead, or nobody ever
	// reaches the featured player. anniv_pending clears on the buff, a spent or expired ticket, a
	// death, or the round ending, so this cannot outlast the round.
	if (owed) return false;
	return COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		return !!s && !s.rip && !!s.anniv_pending;
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
	return approach(pos, {
		label: "follow",
		arrive: pos.formation ? fd : (_cohesion_closing ? COHESION_REGROUP : COHESION_RANGE),
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

	// Leader only. anniversary_tick() casts from its own loop the moment the target is in range,
	// so a follower reaches it by staying in formation — it needs no goal of its own, and giving
	// it one made it indistinguishable from a straggler.
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
