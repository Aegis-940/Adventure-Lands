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
const CAMP_STATION = { Ulric: 34, Riva: 50 };
const CAMP_EDGE_GAP = { Ulric: 6 };
const CAMP_GAP_SEARCH_PX = 200;

function camp_engage_distance() {
	const preferred = CAMP_STATION[character.name];
	if (!preferred) return 0;
	return Math.min(preferred, (character.range || 0) * CAMP_RANGE_CAP);
}

function camp_hold_radius() {
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
	if (Math.abs(info.distance - desired) <= CAMP_MOVE_TOLERANCE) return;

	const new_x = info.x + Math.cos(angle) * desired;
	const new_y = info.y + Math.sin(angle) * desired;

	if (character.moving && Math.hypot(character.going_x - new_x, character.going_y - new_y) <= CAMP_MOVE_TOLERANCE) return;

	local_move(new_x, new_y);
}

function move_to_camp_station(desired) {
	const loc = prim_farm_loc();
	if (character.map !== loc.map) return;

	const current = Math.hypot(character.x - loc.x, character.y - loc.y);
	if (Math.abs(current - desired) <= CAMP_STAGING_TOLERANCE) return;

	const angle = current > 0 ? Math.atan2(character.y - loc.y, character.x - loc.x) : 0;
	const new_x = loc.x + Math.cos(angle) * desired;
	const new_y = loc.y + Math.sin(angle) * desired;

	if (character.moving && Math.hypot(character.going_x - new_x, character.going_y - new_y) <= CAMP_STAGING_TOLERANCE) return;

	local_move(new_x, new_y);
}

function hold_camp_station() {
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
