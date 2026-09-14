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
		log(`Bscorpion camp: no spawn boundary in G.maps.${PRIM_FARM_MAP}, using ${PRIM_FARM_FALLBACK.x}, ${PRIM_FARM_FALLBACK.y}`, "#ffb347", "Bscorpion");
		return _prim_farm_loc;
	}

	const [x1, y1, x2, y2] = box.length > 4 ? box.slice(1) : box;
	_prim_farm_loc = { map: PRIM_FARM_MAP, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
	log(`Bscorpion camp centre: ${Math.round(_prim_farm_loc.x)}, ${Math.round(_prim_farm_loc.y)}`, "#ffb347", "Bscorpion");
	return _prim_farm_loc;
}

function bscorpion_start() {
	if (home !== "bscorpion") return;

	prim_farm_loop();
	if (character.name === "Myras") prim_orbit_loop();
	if (character.name === "Ulric") bscorpion_kill_logger_loop();
}

function is_at_bscorpion_farm() {
	const loc = prim_farm_loc();
	return character.map === loc.map &&
		Math.hypot(character.x - loc.x, character.y - loc.y) < PRIM_FARM_RADIUS + 30;
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

function bscorpion_worth_buffing() {
	const info = find_nearest_bscorpion();
	if (!info) return false;
	return info.entity.hp / info.entity.max_hp >= BOSS_NEARLY_DEAD_HP;
}

const CAMP_MOVE_TOLERANCE = 3;
const CAMP_STAGING_TOLERANCE = 15;
const CAMP_RANGE_FRACTION = { Ulric: 0.80, Riva: 0.70 };

function camp_engage_distance() {
	const fraction = CAMP_RANGE_FRACTION[character.name];
	if (!fraction) return 0;
	return (character.range || 0) * fraction;
}

function camp_loop_parked() {
	return !is_at_bscorpion_farm() || !automation_enabled() || is_travelling() || character.rip;
}

function move_distance_from_bscorpion(desired) {
	const info = find_nearest_bscorpion();
	if (!info) return;
	if (Math.abs(info.distance - desired) <= CAMP_MOVE_TOLERANCE) return;

	const angle = Math.atan2(character.y - info.y, character.x - info.x);
	const new_x = info.x + Math.cos(angle) * desired;
	const new_y = info.y + Math.sin(angle) * desired;

	if (character.moving && Math.hypot(character.going_x - new_x, character.going_y - new_y) <= CAMP_MOVE_TOLERANCE) return;

	move(new_x, new_y);
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

	if (find_nearest_bscorpion()) move_distance_from_bscorpion(desired);
	else move_to_camp_station(desired);
}

function absorb_from_ally_at_camp() {
	const info = find_nearest_bscorpion();
	if (!info) return;
	const bscorp = info.entity;
	if (!bscorp.target || bscorp.target === character.name) return;
	if (info.distance < SAFETY_DISTANCE) return;

	const ally = get_player(bscorp.target);
	if (!ally || ally.rip || !is_in_range(ally, "absorb")) return;
	if (!can_use("absorb")) return;

	Promise.resolve(use_skill("absorb", bscorp.target)).catch(e => catcher(e, "prim_farm_loop: absorb"));
}

async function prim_farm_loop() {
	while (true) {
		try {
			if (camp_loop_parked()) {
				await delay(100);
				continue;
			}

			if (!panicking) hold_camp_station();
			if (character.name === "Myras") absorb_from_ally_at_camp();
		} catch (e) {
			catcher(e, "prim_farm_loop");
		}

		await delay(100);
	}
}

async function prim_orbit_loop() {

	const RADIUS_TOL = 2;
	const ROTATE_STEP_DEG = 10;

	while (true) {
		try {
			if (camp_loop_parked()) {
				await delay(100);
				continue;
			}

			const bscorp = find_nearest_bscorpion();
			if (!bscorp) { await delay(500); continue; }

			const loc = prim_farm_loc();
			const sx = bscorp.x, sy = bscorp.y;
			const fx = character.x - loc.x;
			const fy = character.y - loc.y;

			if (Math.abs(Math.hypot(fx, fy) - PRIM_FARM_RADIUS) > RADIUS_TOL) {
				const away = Math.atan2(character.y - sy, character.x - sx);
				await move(loc.x + Math.cos(away) * PRIM_FARM_RADIUS,
					loc.y + Math.sin(away) * PRIM_FARM_RADIUS);
				await delay(80);
				continue;
			}

			const step = ROTATE_STEP_DEG * Math.PI / 180;
			const my_angle = Math.atan2(fy, fx);
			const spot = a => ({
				x: loc.x + Math.cos(a) * PRIM_FARM_RADIUS,
				y: loc.y + Math.sin(a) * PRIM_FARM_RADIUS,
			});
			const cw = spot(my_angle - step);
			const ccw = spot(my_angle + step);
			const away_from_scorpion = Math.hypot(cw.x - sx, cw.y - sy) > Math.hypot(ccw.x - sx, ccw.y - sy) ? cw : ccw;

			await move(away_from_scorpion.x, away_from_scorpion.y);
		} catch (e) {
			catcher(e, "prim_orbit_loop");
		}
		await delay(100);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// KILL LOGGER — kill detection and the rolling seconds-per-kill average
// --------------------------------------------------------------------------------------------------------------------------------- //

let counted_bscorpion_deaths = new Set();
let bscorpion_kill_times = [];

function log_bscorpion_kill() {
	const now = Date.now();
	bscorpion_kill_times.push(now);
	if (bscorpion_kill_times.length > 50) bscorpion_kill_times.shift();

	if (bscorpion_kill_times.length > 1) {
		let total = 0;
		for (let i = 1; i < bscorpion_kill_times.length; i++) {
			total += bscorpion_kill_times[i] - bscorpion_kill_times[i - 1];
		}
		const avg = total / (bscorpion_kill_times.length - 1);
		log(`Seconds / Kill (Avg): ${(avg / 1000).toFixed(1)}s`, "#ffb347", "Bscorpion");
	} else {
		log(`Bscorpion kill: ${new Date(now).toLocaleTimeString()} (first recorded)`, "#ffb347", "Bscorpion");
	}
}

async function bscorpion_kill_logger_loop() {
	while (true) {
		try {
			const present = new Set();
			for (const id in parent.entities) {
				const e = parent.entities[id];
				if (e?.type !== "monster" || e.mtype !== "bscorpion") continue;
				present.add(e.id);
				if (!e.dead || counted_bscorpion_deaths.has(e.id)) continue;
				counted_bscorpion_deaths.add(e.id);
				log_bscorpion_kill();
			}
			for (const id of counted_bscorpion_deaths) {
				if (!present.has(id)) counted_bscorpion_deaths.delete(id);
			}
		} catch (e) {
			catcher(e, "bscorpion_kill_logger_loop");
		}
		await delay(250);
	}
}
