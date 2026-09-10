// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER RUNNER — the tick and the loop set every combat character shares.
// --------------------------------------------------------------------------------------------------------------------------------- //

// The warrior, ranger and healer each carried their own copy of this loop. They had drifted: one
// used `async function`, one an arrow const, one called errlog_beat and the others did not, and
// the disabled-path behaviour differed for reasons that were correct in one file and missing from
// the others. Three copies of a heartbeat is three places for a fix to be applied twice and
// forgotten once.
//
// They differ in exactly four places, so those are hooks and the rest is shared:
//
//   update_cache()       the role's own cache refresh
//   skip_panic_check()   true to suppress panic for this target (healer, fireroamer/giantspider)
//   pre_move()           anything before movement is decided (ranger's licence)
//   local(goal)          what to do when the arbiter is not travelling; defaults to
//                        movement_local(goal, farm_step)
//
// Movement itself is not a hook. movement_goal() and travel_arbiter() are shared by construction —
// that is the point of the arbiter — and a role that wants different movement adds a goal to the
// priority list rather than its own loop.

// The goal chosen on the most recent tick. should_pause_combat_loop() reads it: what a character
// is trying to DO is the thing that decides whether it may stop and fight, and only the runner
// knows that. Exposed as a function so the eval-loaded character files can reach it.
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

	// Each loop reschedules itself, so a throw at startup must not take the rest with it.
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
