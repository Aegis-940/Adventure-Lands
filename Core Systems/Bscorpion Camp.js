// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION / PRIMLING FARM — content-specific positioning for the desertland camp
// --------------------------------------------------------------------------------------------------------------------------------- //

const PRIM_FARM_LOC = { map: "desertland", x: -409, y: -1236 };
const PRIM_FARM_RADIUS = 105;
const SAFETY_DISTANCE = 100;

function bscorpion_start() {
	if (home !== "bscorpion") return;

	prim_farm_loop();
	if (character.name === "Myras") prim_orbit_loop();
	if (character.name === "Ulric") bscorpion_kill_logger_loop();
}

function is_at_bscorpion_farm() {
	return character.map === PRIM_FARM_LOC.map &&
		Math.hypot(character.x - PRIM_FARM_LOC.x, character.y - PRIM_FARM_LOC.y) < PRIM_FARM_RADIUS + 30;
}

let cached_bscorpion_id = null;

function find_nearest_bscorpion() {
	let nearest = null;
	let min_dist = Infinity;

	if (cached_bscorpion_id && parent.entities[cached_bscorpion_id]) {
		const ent = parent.entities[cached_bscorpion_id];
		if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
			nearest = ent;
			min_dist = Math.hypot(ent.x - character.x, ent.y - character.y);
		} else {
			cached_bscorpion_id = null;
		}
	}

	if (!nearest) {
		for (const id in parent.entities) {
			const ent = parent.entities[id];
			if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
				const dist = Math.hypot(ent.x - character.x, ent.y - character.y);
				if (dist < min_dist) {
					min_dist = dist;
					nearest = ent;
					cached_bscorpion_id = id;
				}
			}
		}
	}

	if (!nearest) return null;
	return { entity: nearest, distance: min_dist, x: nearest.x, y: nearest.y, id: nearest.id };
}

function is_bscorpion_targeting_myras() {
	for (const id in parent.entities) {
	const ent = parent.entities[id];
	if (ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead) {
		if (ent.target === "Myras") return true;
	}
	}
	return false;
}

function bscorpion_worth_buffing() {
	const info = find_nearest_bscorpion();
	if (!info) return false;
	return info.entity.hp / info.entity.max_hp >= 0.05;
}

async function move_distance_from_bscorpion(desired = 40, tolerance = 0.75) {
	const info = find_nearest_bscorpion();
	if (!info) return false;

	if (Math.abs(info.distance - desired) > tolerance) {
		if (!character.moving || Math.hypot(character.x - info.x, character.y - info.y) > tolerance) {
			const angle = Math.atan2(character.y - info.y, character.x - info.x);
			const new_x = info.x + Math.cos(angle) * desired;
			const new_y = info.y + Math.sin(angle) * desired;
			move(new_x, new_y);
		}
		return true;
	}
	return false;
}

async function prim_farm_loop() {
	while (true) {
		if (!is_at_bscorpion_farm()) {
			await delay(100);
			continue;
		}

		if (character.name === "Ulric") move_distance_from_bscorpion();
		if (character.name === "Riva") move_distance_from_bscorpion(50, 0);

		if (character.name === "Myras") {
			const bscorp_info = find_nearest_bscorpion();
			const too_close = !!bscorp_info
				&& Math.hypot(character.x - bscorp_info.x, character.y - bscorp_info.y) < SAFETY_DISTANCE;

			if (!is_bscorpion_targeting_myras() && !too_close) {
				const bscorp = Object.values(parent.entities).find(ent =>
					ent && ent.type === "monster" && ent.mtype === "bscorpion" && !ent.dead
				);
				if (bscorp && can_use("absorb")) {
					parent.socket.emit("ability", { name: "absorb", id: bscorp.id });
				}
			}
		}

		await delay(100);
	}
}

async function prim_orbit_loop() {


	const RADIUS_TOL = 2;
	const ROTATE_STEP_DEG = 10;

	while (true) {
		if (!is_at_bscorpion_farm()) {
			await delay(100);
			continue;
		}

		const bscorp = find_nearest_bscorpion();
		if (!bscorp) { await delay(500); continue; }

		const sx = bscorp.x, sy = bscorp.y;
		const fx = character.x - PRIM_FARM_LOC.x;
		const fy = character.y - PRIM_FARM_LOC.y;

		if (Math.abs(Math.hypot(fx, fy) - PRIM_FARM_RADIUS) > RADIUS_TOL) {
			const away = Math.atan2(character.y - sy, character.x - sx);
			await move(PRIM_FARM_LOC.x + Math.cos(away) * PRIM_FARM_RADIUS,
				PRIM_FARM_LOC.y + Math.sin(away) * PRIM_FARM_RADIUS);
			await delay(80);
			continue;
		}

		const step = ROTATE_STEP_DEG * Math.PI / 180;
		const my_angle = Math.atan2(fy, fx);
		const spot = a => ({
			x: PRIM_FARM_LOC.x + Math.cos(a) * PRIM_FARM_RADIUS,
			y: PRIM_FARM_LOC.y + Math.sin(a) * PRIM_FARM_RADIUS,
		});
		const cw = spot(my_angle - step);
		const ccw = spot(my_angle + step);
		const away_from_scorpion = Math.hypot(cw.x - sx, cw.y - sy) > Math.hypot(ccw.x - sx, ccw.y - sy) ? cw : ccw;

		await move(away_from_scorpion.x, away_from_scorpion.y);
		await delay(100);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// KILL LOGGER — kill detection and the rolling seconds-per-kill average
// --------------------------------------------------------------------------------------------------------------------------------- //

let counted_bscorpion_deaths = new Set();
let bscorpion_kill_count = 0;
let bscorpion_kill_times = [];

function log_bscorpion_kill() {
	const now = Date.now();
	bscorpion_kill_count++;
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
		log(`Bscorpion kill #${bscorpion_kill_count}: ${new Date(now).toLocaleTimeString()} (first recorded)`, "#ffb347", "Bscorpion");
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
