// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER MOVEMENT — the runner hooks and the circle walk
// --------------------------------------------------------------------------------------------------------------------------------- //

function healer_on_disabled() {
	if (!panicking) return;
	set_panic(false, "healer disabled — releasing the party", false);
	send_cm(PANIC_BROADCAST_TARGETS, { type: "panic", state: false });
}

function healer_skip_panic_check() {
	if (typeof is_travelling === "function" && is_travelling()) return false;
	if (panicking) return false;
	if (character.hp < character.max_hp * PANIC_THRESHOLDS.low_hp) return false;
	if (character.mp < character.max_mp * PANIC_THRESHOLDS.low_mp) return false;
	return HEALER_TARGET === "fireroamer" || HEALER_TARGET === "giantspider";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CLUSTER SAMPLING — how tightly the monsters are packed, which is what splash actually pays for
// --------------------------------------------------------------------------------------------------------------------------------- //

var CLUSTER_WINDOW_MS = 15000;
var CLUSTER_RADII = [12, 14, 30, 60];
var CLUSTER_MIN_TICKS = 5;

var _circle_arm = null;

function circle_arm_index() {
	const cfg = CONFIG.movement;
	return Math.floor(Date.now() / cfg.circle_experiment_ms) % cfg.circle_experiment_radii.length;
}

function effective_circle_speed() {
	const cfg = CONFIG.movement;
	return cfg.circle_experiment ? cfg.circle_experiment_rate : cfg.circle_speed;
}

function effective_circle_radius() {
	const cfg = CONFIG.movement;
	if (!cfg.circle_experiment) return cfg.circle_radius;

	const index = circle_arm_index();
	const radius = cfg.circle_experiment_radii[index];

	if (_circle_arm !== index) {
		_circle_arm = index;
		discard_cluster_window();
		log(`[CIRCLE] arm ${index + 1}/${cfg.circle_experiment_radii.length} — radius ${radius}`, "#66ccff");
	}
	return radius;
}

function discard_cluster_window() {
	const w = _cluster_window;
	if (!w) return;
	if (w.ticks >= CLUSTER_MIN_TICKS) emit_cluster_window(w);
	_cluster_window = null;
}

var _cluster_window = null;
var _cluster_tick = 0;
var _cluster_angle = null;

function circle_centre() {
	return HEALER_TARGET === "giantspider" ? { x: character.x, y: character.y } : locations[home][0];
}

function engaged_monsters() {
	const party = CONFIG.party.group_members;
	const out = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead || !e.visible) continue;
		if (!e.target || !party.includes(e.target)) continue;
		out.push(e);
	}
	return out;
}

function cluster_window() {
	if (!_cluster_window) {
		_cluster_window = {
			at: Date.now(), ticks: 0, rate_ticks: 0,
			mobs: 0, speed: 0, fear: 0, moving: 0, radius: 0,
			radius_err: 0, commanded: 0, achieved: 0,
			near: {}
		};
		for (const r of CLUSTER_RADII) _cluster_window.near[r] = 0;
	}
	return _cluster_window;
}

function flush_cluster_window() {
	const w = _cluster_window;
	if (!w || Date.now() - w.at < CLUSTER_WINDOW_MS) return;
	_cluster_window = null;
	emit_cluster_window(w);
}

function emit_cluster_window(w) {
	if (!w.ticks || typeof errlog_sample !== "function") return;

	const payload = {
		secs: +((Date.now() - w.at) / 1000).toFixed(1),
		mobs: +(w.mobs / w.ticks).toFixed(1),
		speed: Math.round(w.speed / w.ticks),
		fear: +(w.fear / w.ticks).toFixed(2),
		moving_pct: +(w.moving / w.ticks).toFixed(2),
		radius: Math.round(w.radius / w.ticks),
		radius_err: Math.round(w.radius_err / w.ticks),
		commanded_rate: w.rate_ticks ? +(w.commanded / w.rate_ticks).toFixed(2) : 0,
		achieved_rate: w.rate_ticks ? +(w.achieved / w.rate_ticks).toFixed(2) : 0
	};
	for (const r of CLUSTER_RADII) payload["r" + r] = +(w.near[r] / w.ticks).toFixed(2);

	errlog_sample("cluster", payload);
}

function tick_cluster_window() {
	if (!CONFIG.combat.sample_cluster) return;

	const now = Date.now();
	if (now - _cluster_tick < 1000) return;
	const dt = _cluster_tick ? (now - _cluster_tick) / 1000 : 0;
	_cluster_tick = now;

	const w = cluster_window();
	const mobs = engaged_monsters();

	w.ticks++;
	w.mobs += mobs.length;
	w.speed += character.speed || 0;
	w.fear += character.fear || 0;
	if (character.moving) w.moving++;

	for (const r of CLUSTER_RADII) {
		let total = 0;
		for (const m of mobs) total += count_neighbours(m, r);
		w.near[r] += mobs.length ? total / mobs.length : 0;
	}

	const centre = circle_centre();
	const radius = effective_circle_radius();
	const angle = Math.atan2(character.y - centre.y, character.x - centre.x);
	w.radius += radius;
	w.radius_err += Math.abs(Math.hypot(character.x - centre.x, character.y - centre.y) - radius);

	if (_cluster_angle !== null && dt > 0) {
		let delta = angle - _cluster_angle;
		while (delta > Math.PI) delta -= 2 * Math.PI;
		while (delta < -Math.PI) delta += 2 * Math.PI;
		w.achieved += Math.abs(delta) / dt;
		w.commanded += effective_circle_speed();
		w.rate_ticks++;
	}
	_cluster_angle = angle;

	flush_cluster_window();
}

async function healer_local(goal) {
	movement_local(goal, () => {
		if (CONFIG.movement.circle_walk && get_nearest_monster({ type: home })) walk_in_circle();
	});
}

async function walk_in_circle() {
	if (smart.moving) return;
	if (HEALER_TARGET === "bscorpion") return;

	const center = HEALER_TARGET === "giantspider"
		? { x: character.x, y: character.y }
		: locations[home][0];
	const radius = effective_circle_radius();

	const current_time = performance.now();
	const delta_time = current_time - state.last_angle_update;
	state.last_angle_update = current_time;

	const delta_angle = effective_circle_speed() * (delta_time / 1000);
	state.angle = (state.angle + delta_angle) % (2 * Math.PI);

	const offset_x = Math.cos(state.angle) * radius;
	const offset_y = Math.sin(state.angle) * radius;
	const target_x = center.x + offset_x;
	const target_y = center.y + offset_y;

	if (!character.moving) local_move(target_x, target_y);
}
