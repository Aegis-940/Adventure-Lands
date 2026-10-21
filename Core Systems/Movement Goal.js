// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT GOAL — the one priority list for the three combat characters, and the local steps that place them
// --------------------------------------------------------------------------------------------------------------------------------- //

function approach(pos, o) {
	const map = pos.map || character.map;
	const travel = { label: o.label, map, x: pos.x, y: pos.y, radius: o.radius || o.arrive, chasing: o.chasing, disengage: o.disengage };
	if (map !== character.map) return travel;

	const d = Math.hypot(character.x - pos.x, character.y - pos.y);
	if (d <= o.arrive && !o.aim) return o.arrived;

	let step = standoff_point(o.aim || pos, o.ring);
	if (o.aim && !can_move_to(step.x, step.y)) step = standoff_point(pos, o.ring);
	if (can_move_to(step.x, step.y)) {
		return { local: "step", label: o.label + "-close", step, chasing: o.chasing, disengage: o.disengage };
	}
	if (d <= o.arrive) return o.arrived;
	return travel;
}

const LOCAL_MOVE_SLOP = 15;

function local_step(goal) {
	if (!goal || !goal.step) return;
	if (character.moving && Math.hypot(character.going_x - goal.step.x, character.going_y - goal.step.y) < LOCAL_MOVE_SLOP) return;
	walk(goal.step.x, goal.step.y);
}

function local_wait() {
	if (character.moving) walk(character.real_x, character.real_y);
}

const EVADE_STEP = 150;
const EVADE_TURNS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];
const EVADE_HEADING_TOLERANCE = 0.6;

function angle_apart(a, b) {
	return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function evade_point(threat) {
	const away = Math.atan2(character.y - threat.y, character.x - threat.x);
	for (const turn of EVADE_TURNS) {
		const angle = away + turn;
		const point = { x: character.x + Math.cos(angle) * EVADE_STEP, y: character.y + Math.sin(angle) * EVADE_STEP };
		if (can_move_to(point.x, point.y)) return point;
	}
	return null;
}

function evade_step(threat) {
	scare_off();
	if (character.moving) {
		const heading = Math.atan2(character.going_y - character.y, character.going_x - character.x);
		const away = Math.atan2(character.y - threat.y, character.x - threat.x);
		if (angle_apart(heading, away) < EVADE_HEADING_TOLERANCE) return;
	}
	const point = evade_point(threat);
	if (point) walk(point.x, point.y);
}

function movement_goal() {
	const threat = lethal_pursuer();
	if (threat) return { local: "evade", label: "evade-" + threat.mtype, threat };

	const dreams = dreams_goal();
	if (dreams) return dreams;

	if (dungeon_flag("leader_manual") && character.name === MOVEMENT_LEADER) return null;

	const ignoring_events = dungeon_ignores_events();

	const event = ignoring_events || !encounter_home_setting("events", true) ? null : event_goal();
	if (event && event.local === "kite") return event;
	if (!event && !ignoring_events) {
		const knock = trick_or_treat_goal();
		if (knock) return knock;
	}
	const scripted_camp = party_camped(event);
	const cohesion_hold = !scripted_camp && party_cohesion_hold(event);

	if (event && event.pursuit) {
		if (cohesion_hold) return { hold: true, label: "cohesion", disengage: false };
		if (!follower_holds_back(event)) return event;
	}

	if (cohesion_hold) {
		return { hold: true, label: "cohesion", disengage: !!(event && event.disengage) };
	}

	const follow = scripted_camp ? null : follow_goal();
	if (follow) return follow;
	if (event) return event;

	if (ignoring_events) return null;

	const spawn_goal = encounter_goal();
	if (spawn_goal) return spawn_goal;

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

const LOCAL_STEPS = {
	step: goal => local_step(goal),
	trail: goal => trail_step(goal),
	passage: goal => passage_step(goal),
	wait: () => local_wait(),
	evade: goal => evade_step(goal.threat),
	kite: goal => kite_step(goal.event),
	event: (goal, engage_step) => event_step(goal.event, engage_step),
	loot: () => loot_step(),
	keep: () => { },
};

function movement_local(goal, farm_step, engage_step) {
	if (smart.moving) {
		if (!goal || !goal.passive) log_msg("warn", "local movement skipped — a journey is still in flight");
		return;
	}
	const step = goal && (LOCAL_STEPS[goal.local] || encounter_step(goal.local));
	if (step) return step(goal, engage_step);
	if (goal && goal.disengage) return;
	if (typeof farm_step === "function") farm_step();
}
