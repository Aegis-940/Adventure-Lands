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
				if (typeof s.local === "function") await s.local(goal);
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
