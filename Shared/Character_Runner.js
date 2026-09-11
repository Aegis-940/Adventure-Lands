// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER RUNNER — the tick and the loop set every combat character shares.
// --------------------------------------------------------------------------------------------------------------------------------- //

let _current_goal = null;

function current_goal() {
	return _current_goal;
}

function current_goal_label() {
	return _current_goal ? _current_goal.label : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SHARED LOOPS — the pieces each combat character used to keep its own copy of
// --------------------------------------------------------------------------------------------------------------------------------- //

function make_cache(fields) {
	return Object.assign({
		last_update: 0,
		is_valid() { return performance.now() - this.last_update < CACHE_TTL; },
		invalidate() { this.last_update = 0; },
	}, fields);
}

const ACTION_DELAY_MAX_MS = 200;

function next_action_delay(ms, max) {
	const ceiling = max === undefined ? ACTION_DELAY_MAX_MS : max;
	return Math.max(1, Math.min(ms, ceiling));
}

const REPOSITION_INTERVAL_MS = 250;

function orbit_reposition(make_score) {
	if (smart.moving || character.moving) return;
	if (home === "bscorpion") return;

	const now = performance.now();
	if (now - (state.last_reposition || 0) < REPOSITION_INTERVAL_MS) return;
	state.last_reposition = now;

	const center = reposition_center();
	if (!center) return;

	const score = make_score();
	if (!score) return;

	const spot = best_orbit_spot(center, CONFIG.movement.circle_radius, score);
	if (!spot) return;
	if (Math.hypot(character.x - spot.x, character.y - spot.y) <= CONFIG.movement.move_threshold) return;

	move(spot.x, spot.y);
}

function default_farm_step() {
	if (CONFIG.movement.reposition && get_nearest_monster({ type: home })) reposition();
}

function elixir_usage() {
	const cfg = CONFIG.elixir;
	if (!cfg || !cfg.name) return;

	if (character.slots.elixir?.name !== cfg.name) {
		const slot = locate_item(cfg.name);
		if (slot !== -1) use(slot);
	}

	if (cfg.min_stock) {
		const held = quantity(cfg.name);
		if (held < cfg.min_stock) buy(cfg.name, cfg.min_stock - held);
	}
}

async function maintenance_loop() {
	try {
		if (CONFIG.potions.auto_buy) auto_buy_potions();
		if (CONFIG.party.auto_manage) party_manager();

		clear_inventory();
		inventory_sorter();
		elixir_usage();

		if (character.rip) respawn();
	} catch (e) {
		catcher(e, "maintenance_loop");
	}

	setTimeout(maintenance_loop, TICK_RATE.maintenance);
}

function run_character(spec) {
	const s = spec || {};

	async function main_tick() {
		if (typeof errlog_beat === "function") errlog_beat("main_loop");
		try {
			if (is_disabled(character)) {
				if (typeof s.on_disabled === "function") s.on_disabled();
				return setTimeout(main_tick, 250);
			}

			if (typeof s.update_cache === "function") s.update_cache();
			if (typeof s.skip_panic_check !== "function" || !s.skip_panic_check()) panic_check();

			if (!automation_enabled()) {
				_current_goal = null;
				travel_arbiter(null);
				return setTimeout(main_tick, TICK_RATE.main);
			}

			stuck_escape_check();

			if (typeof s.pre_move === "function") await s.pre_move();

			const goal = movement_goal();
			_current_goal = goal;
			if (!travel_arbiter(goal)) {
				if (should_loot()) await handle_looting();
				else if (typeof s.local === "function") await s.local(goal);
				else movement_local(goal, s.farm_step);
			}
		} catch (e) {
			console.error("main_tick error:", e);
		}
		setTimeout(main_tick, TICK_RATE.main);
	}

	main_tick();

	for (const fn of (s.loops || [])) {
		try {
			fn();
		} catch (e) {
			try { catcher(e, "run_character: " + (fn.name || "loop")); } catch (x) { }
		}
	}

	for (const entry of (s.intervals || [])) {
		setInterval(entry[0], entry[1]);
	}
}
