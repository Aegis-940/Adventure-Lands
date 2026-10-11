// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVEMENT POSITIONING — scoring candidate spots around a centre, and where that centre is
// --------------------------------------------------------------------------------------------------------------------------------- //



const ORBIT_ANGLE_SAMPLES = 16;
const ORBIT_RADIUS_FRACTIONS = [1.0, 0.66, 0.33];

const ORBIT_TRAVEL_WEIGHT = 0.35;
const ORBIT_MIN_GAIN = 20;

function best_orbit_spot(center, radius, score, options) {
	const min_gain = options?.min_gain ?? ORBIT_MIN_GAIN;
	const travel_weight = options?.travel_weight ?? ORBIT_TRAVEL_WEIGHT;

	const here = score(character.x, character.y);
	const incumbent = (here === null || here === undefined) ? -Infinity : here;

	let best = null;
	let best_value = -Infinity;
	let best_raw = -Infinity;

	function consider(x, y) {
		if (!can_move_to(x, y)) return;
		const s = score(x, y);
		if (s === null || s === undefined) return;
		const value = s - Math.hypot(x - character.x, y - character.y) * travel_weight;
		if (value > best_value) {
			best_value = value;
			best_raw = s;
			best = { x, y };
		}
	}

	consider(center.x, center.y);

	for (const frac of ORBIT_RADIUS_FRACTIONS) {
		const r = radius * frac;
		for (let i = 0; i < ORBIT_ANGLE_SAMPLES; i++) {
			const angle = (i / ORBIT_ANGLE_SAMPLES) * 2 * Math.PI;
			consider(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r);
		}
	}

	if (!best) return null;

	if (best_raw < incumbent + min_gain) return { x: character.x, y: character.y };
	return best;
}

function make_distance_from_monsters_scorer() {
	const monsters = Object.values(parent.entities).filter(e => e?.type === "monster" && !e.dead);
	if (!monsters.length) return null;

	return (x, y) => {
		let nearest = Infinity;
		for (const e of monsters) {
			const d = Math.hypot(e.x - x, e.y - y);
			if (d < nearest) nearest = d;
		}
		return nearest;
	};
}

function reposition_center() {
	if (dungeon_flag("center_on_tank")) {
		const healer = get_player("Myras");
		if (!healer || healer.rip || healer.map !== character.map) return null;
		return { x: healer.x, y: healer.y };
	}
	if (character.name !== MOVEMENT_LEADER) {
		const lead = get_player(MOVEMENT_LEADER);
		if (lead && !lead.rip) return { x: lead.x, y: lead.y };
	}
	return LOCATIONS[home][0];
}

const REPOSITION_INTERVAL_MS = 250;
const REPOSITION_MOVE_THRESHOLD = 10;

function orbit_reposition(make_score, options) {
	if (smart.moving || character.moving) return;

	const now = performance.now();
	if (now - (state.last_reposition || 0) < REPOSITION_INTERVAL_MS) return;
	state.last_reposition = now;

	const center = reposition_center();
	if (!center) return;

	const threshold = CONFIG.movement.move_threshold ?? REPOSITION_MOVE_THRESHOLD;

	if (dungeon_flag("stack_on_center")) {
		if (Math.hypot(character.x - center.x, character.y - center.y) <= threshold) return;
		if (!can_move_to(center.x, center.y)) return;
		return move(center.x, center.y);
	}

	const score = make_score();
	if (!score) return;

	const spot = best_orbit_spot(center, CONFIG.movement.circle_radius, score, options);
	if (!spot) return;
	if (Math.hypot(character.x - spot.x, character.y - spot.y) <= threshold) return;

	move(spot.x, spot.y);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ORBIT AWAY — walk a fixed ring, always stepping the way that leaves the chaser behind
// --------------------------------------------------------------------------------------------------------------------------------- //

const ORBIT_RADIUS_TOL = 2;
const ORBIT_STEP_DEG = 10;

function orbit_away(ring, threat) {
	if (character.moving) return;

	const fx = character.x - ring.x;
	const fy = character.y - ring.y;

	if (Math.abs(Math.hypot(fx, fy) - ring.radius) > ORBIT_RADIUS_TOL) {
		const away = Math.atan2(character.y - threat.y, character.x - threat.x);
		move(ring.x + Math.cos(away) * ring.radius, ring.y + Math.sin(away) * ring.radius);
		return;
	}

	const step = ORBIT_STEP_DEG * Math.PI / 180;
	const my_angle = Math.atan2(fy, fx);
	const spot = a => ({
		x: ring.x + Math.cos(a) * ring.radius,
		y: ring.y + Math.sin(a) * ring.radius,
	});
	const cw = spot(my_angle - step);
	const ccw = spot(my_angle + step);
	const away_from_threat = Math.hypot(cw.x - threat.x, cw.y - threat.y) > Math.hypot(ccw.x - threat.x, ccw.y - threat.y) ? cw : ccw;

	move(away_from_threat.x, away_from_threat.y);
}
