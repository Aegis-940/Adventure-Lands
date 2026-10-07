// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION / PRIMLING FARM — content-specific positioning for the desertland camp
// --------------------------------------------------------------------------------------------------------------------------------- //

const PRIM_FARM_MAP = "desertland";
const PRIM_FARM_FALLBACK = { map: PRIM_FARM_MAP, x: -409, y: -1236 };
const PRIM_FARM_RADIUS = 105;
const SAFETY_DISTANCE = 100;

let _prim_farm_loc = null;

function prim_farm_loc() {
	if (_prim_farm_loc) return _prim_farm_loc;

	const spawn = (G.maps[PRIM_FARM_MAP]?.monsters || []).find(m => m.type === "bscorpion");
	const box = spawn?.boundary || (spawn?.boundaries || [])[0];

	if (!box || box.length < 4) {
		_prim_farm_loc = PRIM_FARM_FALLBACK;
		game_log(`Bscorpion camp: no spawn boundary in G.maps.${PRIM_FARM_MAP}, using ${PRIM_FARM_FALLBACK.x}, ${PRIM_FARM_FALLBACK.y}`, "#ffb347");
		return _prim_farm_loc;
	}

	const [x1, y1, x2, y2] = box.length > 4 ? box.slice(1) : box;
	_prim_farm_loc = { map: PRIM_FARM_MAP, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
	game_log(`Bscorpion camp centre: ${Math.round(_prim_farm_loc.x)}, ${Math.round(_prim_farm_loc.y)}`, "#ffb347");
	return _prim_farm_loc;
}

function bscorpion_start() {
	if (home !== "bscorpion") return;
	if (character.name === "Ulric") bscorpion_kill_logger_loop();
}

function at_bscorpion_farm(pos) {
	const loc = prim_farm_loc();
	return pos.map === loc.map &&
		Math.hypot(pos.x - loc.x, pos.y - loc.y) < camp_hold_radius();
}

function is_at_bscorpion_farm() {
	return home === "bscorpion" && at_bscorpion_farm(character);
}

function party_camped(event) {
	if (home !== "bscorpion" || event) return false;
	if (character.name === MOVEMENT_LEADER) return is_at_bscorpion_farm();
	const pos = leader_position();
	return !pos || at_bscorpion_farm(pos);
}

function find_nearest_bscorpion() {
	let nearest = null;
	let min_dist = Infinity;

	for (const id in parent.entities) {
		const ent = parent.entities[id];
		if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
			const dist = Math.hypot(ent.x - character.x, ent.y - character.y);
			if (dist < min_dist) {
				min_dist = dist;
				nearest = ent;
			}
		}
	}

	if (!nearest) return null;
	return { entity: nearest, distance: min_dist, x: nearest.x, y: nearest.y };
}

const CAMP_BUFF_MIN_HP = 0.25;

function bscorpion_worth_buffing() {
	if (!is_at_bscorpion_farm()) return true;

	const info = find_nearest_bscorpion();
	if (!info) return false;
	return info.entity.hp / info.entity.max_hp >= CAMP_BUFF_MIN_HP;
}

const CAMP_MOVE_TOLERANCE = 3;
const CAMP_STAGING_TOLERANCE = 15;
const CAMP_HOLD_MARGIN = 40;
const CAMP_RANGE_CAP = 0.80;
const CAMP_STATION = { Ulric: 34 };
const CAMP_EDGE_GAP = { Ulric: 6 };
const CAMP_GAP_SEARCH_PX = 200;

const CAMP_RAIL = {
	Riva: { x: -390, y: -1250, angle: 215 * Math.PI / 180, length: 360, wait: 150 },
};
const CAMP_RAIL_STEP = 5;
const CAMP_AURA_CLEARANCE = 130;

function camp_engage_distance() {
	const preferred = CAMP_STATION[character.name];
	if (!preferred) return 0;
	return Math.min(preferred, (character.range || 0) * CAMP_RANGE_CAP);
}

function camp_hold_radius() {
	const rail = CAMP_RAIL[character.name];
	if (rail) {
		const loc = prim_farm_loc();
		const end = rail_point(rail, rail.length);
		return Math.hypot(end.x - loc.x, end.y - loc.y) + CAMP_HOLD_MARGIN;
	}
	return PRIM_FARM_RADIUS + camp_engage_distance() + CAMP_HOLD_MARGIN;
}

function camp_loop_parked() {
	return !is_at_bscorpion_farm() || !automation_enabled() || is_travelling() || character.rip;
}

function centre_distance_for_gap(info, angle, gap) {
	const probe = { x: 0, y: 0, awidth: get_width(character), aheight: get_height(character) };
	let near = 0;
	let far = CAMP_GAP_SEARCH_PX;
	for (let i = 0; i < 16; i++) {
		const r = (near + far) / 2;
		probe.x = info.x + Math.cos(angle) * r;
		probe.y = info.y + Math.sin(angle) * r;
		if (distance(probe, info.entity) < gap) near = r;
		else far = r;
	}
	return far;
}

function station_distance(info, angle) {
	const gap = CAMP_EDGE_GAP[character.name];
	if (gap === undefined) return camp_engage_distance();
	return centre_distance_for_gap(info, angle, gap);
}

function move_distance_from_bscorpion(info) {
	const angle = Math.atan2(character.y - info.y, character.x - info.x);
	const desired = station_distance(info, angle);
	const new_x = info.x + Math.cos(angle) * desired;
	const new_y = info.y + Math.sin(angle) * desired;

	if (Math.hypot(character.x - new_x, character.y - new_y) <= CAMP_MOVE_TOLERANCE) return;
	if (character.moving && Math.hypot(character.going_x - new_x, character.going_y - new_y) <= CAMP_MOVE_TOLERANCE) return;

	local_move(new_x, new_y);
}

function move_to_camp_station(desired) {
	const loc = prim_farm_loc();
	if (character.map !== loc.map) return;

	const angle = Math.atan2(character.y - loc.y, character.x - loc.x);
	const new_x = loc.x + Math.cos(angle) * desired;
	const new_y = loc.y + Math.sin(angle) * desired;

	if (Math.hypot(character.x - new_x, character.y - new_y) <= CAMP_STAGING_TOLERANCE) return;
	if (character.moving && Math.hypot(character.going_x - new_x, character.going_y - new_y) <= CAMP_STAGING_TOLERANCE) return;

	local_move(new_x, new_y);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CAMP RAIL — a wall-free line out of the camp; Riva stands on it as close to the scorpion as the weakness aura allows
// --------------------------------------------------------------------------------------------------------------------------------- //

function rail_point(rail, t) {
	return { x: rail.x + Math.cos(rail.angle) * t, y: rail.y + Math.sin(rail.angle) * t };
}

function rail_nearest(rail) {
	const along = (character.x - rail.x) * Math.cos(rail.angle) + (character.y - rail.y) * Math.sin(rail.angle);
	return rail_point(rail, Math.max(0, Math.min(rail.length, along)));
}

function rail_station(rail, bscorp) {
	const probe = { x: 0, y: 0, awidth: get_width(character), aheight: get_height(character) };
	for (let t = 0; t <= rail.length; t += CAMP_RAIL_STEP) {
		const spot = rail_point(rail, t);
		probe.x = spot.x;
		probe.y = spot.y;
		if (distance(probe, bscorp) >= CAMP_AURA_CLEARANCE) return spot;
	}
	return rail_point(rail, rail.length);
}

function rail_step(rail) {
	const info = find_nearest_bscorpion();
	const spot = info ? rail_station(rail, info.entity) : rail_point(rail, rail.wait);

	if (Math.hypot(character.x - spot.x, character.y - spot.y) <= CAMP_MOVE_TOLERANCE) return;
	if (character.moving && Math.hypot(character.going_x - spot.x, character.going_y - spot.y) <= CAMP_MOVE_TOLERANCE) return;
	if (local_move(spot.x, spot.y)) return;

	const join = rail_nearest(rail);
	local_move(join.x, join.y);
}

function hold_camp_station() {
	const rail = CAMP_RAIL[character.name];
	if (rail) return rail_step(rail);

	const desired = camp_engage_distance();
	if (!desired) return;

	const info = find_nearest_bscorpion();
	if (info) move_distance_from_bscorpion(info);
	else move_to_camp_station(desired);
}

function camp_absorb_target() {
	if (camp_loop_parked()) return null;

	const info = find_nearest_bscorpion();
	if (!info) return null;
	const bscorp = info.entity;
	if (!bscorp.target || bscorp.target === character.name) return null;
	if (info.distance < SAFETY_DISTANCE) return null;

	const ally = get_player(bscorp.target);
	if (!ally || ally.rip || !is_in_range(ally, "absorb")) return null;
	return ally.name;
}

const ORBIT_RADIUS_TOL = 2;
const ORBIT_STEP_DEG = 10;

function camp_orbit_step() {
	if (character.moving) return;

	const bscorp = find_nearest_bscorpion();
	if (!bscorp) return;

	const loc = prim_farm_loc();
	const sx = bscorp.x, sy = bscorp.y;
	const fx = character.x - loc.x;
	const fy = character.y - loc.y;

	if (Math.abs(Math.hypot(fx, fy) - PRIM_FARM_RADIUS) > ORBIT_RADIUS_TOL) {
		const away = Math.atan2(character.y - sy, character.x - sx);
		move(loc.x + Math.cos(away) * PRIM_FARM_RADIUS, loc.y + Math.sin(away) * PRIM_FARM_RADIUS);
		return;
	}

	const step = ORBIT_STEP_DEG * Math.PI / 180;
	const my_angle = Math.atan2(fy, fx);
	const spot = a => ({
		x: loc.x + Math.cos(a) * PRIM_FARM_RADIUS,
		y: loc.y + Math.sin(a) * PRIM_FARM_RADIUS,
	});
	const cw = spot(my_angle - step);
	const ccw = spot(my_angle + step);
	const away_from_scorpion = Math.hypot(cw.x - sx, cw.y - sy) > Math.hypot(ccw.x - sx, ccw.y - sy) ? cw : ccw;

	move(away_from_scorpion.x, away_from_scorpion.y);
}

function camp_step() {
	if (character.name === MOVEMENT_LEADER) camp_orbit_step();
	else hold_camp_station();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TEMPORAL SURGE — cast the moment the bscorpion dies to hasten its respawn; Riva takes the deaths Myras's cooldown misses
// --------------------------------------------------------------------------------------------------------------------------------- //

const SURGE_PRIORITY = ["Myras", "Riva"];
const SURGE_WINDOW_MS = 6000;
const SURGE_REACH_PX = 160;
const SURGE_YIELD_MS = 800;
const SURGE_CLOCK_SLACK_MS = 2000;

var surge_cast_at = 0;
let _surge_watch = null;

function surge_pending_respawn() {
	const info = find_nearest_bscorpion();
	if (info) {
		_surge_watch = { entity: info.entity, died_at: 0 };
		return null;
	}
	if (!_surge_watch) return null;
	if (!_surge_watch.died_at) _surge_watch.died_at = Date.now();
	if (Date.now() - _surge_watch.died_at > SURGE_WINDOW_MS) return null;
	return _surge_watch;
}

function surge_left_to_another(pending) {
	const rank = SURGE_PRIORITY.indexOf(character.name);
	if (rank <= 0) return false;
	if (Date.now() - pending.died_at < SURGE_YIELD_MS) return true;
	return SURGE_PRIORITY.slice(0, rank).some(name => {
		const state = read_state_cache(name);
		return !!state && state.surge_at >= pending.died_at - SURGE_CLOCK_SLACK_MS;
	});
}

function camp_temporal_surge() {
	if (!CONFIG.equipment.temporal_surge_enabled || !is_at_bscorpion_farm()) {
		_surge_watch = null;
		return false;
	}

	const pending = surge_pending_respawn();
	if (!pending) return false;
	if (is_on_cooldown("temporalsurge") || character.mp < skill_mp_cost("temporalsurge")) return false;
	if (distance(character, pending.entity) >= SURGE_REACH_PX) return false;
	if (!set_available("temporal")) return false;
	if (surge_left_to_another(pending)) return false;

	// const nearby = Object.values(parent.entities).some(
	// 	e => e.type === "monster" && !e.dead
	// );
	// if (nearby) return false;

	const token = equip_claim("temporal", EQUIP_PRIORITY.skill);
	if (!token) return false;

	const arm = equip_plan("temporal");
	emit_equip_ops(arm.ops, arm.shadow);
	use_skill("temporalsurge").catch(e => catcher(e, "temporalsurge"));
	const back = equip_plan(EQUIPMENT_RULES.orb.resolve(), arm.shadow);
	emit_equip_ops(back.ops, arm.shadow);
	equip_release(token);

	surge_cast_at = Date.now();
	_surge_watch = null;
	errlog_count("temporal surge on respawn");
	game_log("Temporal Surge on the bscorpion respawn", "#FFAA00");
	return true;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// KILL LOGGER — kill detection and the rolling seconds-per-kill average
// --------------------------------------------------------------------------------------------------------------------------------- //

const KILL_INTERVAL_SAMPLES = 50;

let live_bscorpion_ids = new Set();
let bscorpion_kill_count = 0;
let bscorpion_kill_intervals = [];
let last_bscorpion_kill_at = 0;

function log_bscorpion_kill() {
	const now = Date.now();
	const previous = last_bscorpion_kill_at;
	last_bscorpion_kill_at = now;
	bscorpion_kill_count++;

	if (!previous) {
		game_log(`Bscorpion kill #${bscorpion_kill_count} at ${new Date(now).toLocaleTimeString()} — timing from here`, "#ffb347");
		return;
	}

	const interval = now - previous;
	bscorpion_kill_intervals.push(interval);
	if (bscorpion_kill_intervals.length > KILL_INTERVAL_SAMPLES) bscorpion_kill_intervals.shift();

	const avg = bscorpion_kill_intervals.reduce((a, b) => a + b, 0) / bscorpion_kill_intervals.length;
	errlog_timeline("bscorpion_kill", `${(interval / 1000).toFixed(1)}s avg ${(avg / 1000).toFixed(1)}s/${bscorpion_kill_intervals.length}`);
	game_log(`Bscorpion kill #${bscorpion_kill_count}: ${(interval / 1000).toFixed(1)}s `
		+ `(avg ${(avg / 1000).toFixed(1)}s over ${bscorpion_kill_intervals.length})`, "#ffb347");
}

async function bscorpion_kill_logger_loop() {
	while (true) {
		try {
			if (camp_loop_parked()) {
				live_bscorpion_ids = new Set();
				last_bscorpion_kill_at = 0;
			} else {
				const alive = new Set();
				for (const id in parent.entities) {
					const e = parent.entities[id];
					if (e?.type === "monster" && e.mtype === "bscorpion" && !e.dead) alive.add(e.id);
				}

				for (const id of live_bscorpion_ids) {
					if (!alive.has(id)) log_bscorpion_kill();
				}

				live_bscorpion_ids = alive;
			}
		} catch (e) {
			catcher(e, "bscorpion_kill_logger_loop");
		}
		await delay(250);
	}
}
