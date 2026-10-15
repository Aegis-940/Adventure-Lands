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
	}, fields);
}

function next_action_delay(ms) {
	return ms > 200 ? 200 : ms > 50 ? 50 : 10;
}

let _basic_action_until = 0;
let _basic_action_count = 0;

function basic_action_busy() {
	return Date.now() < _basic_action_until;
}

function take_basic_action_count() {
	const n = _basic_action_count;
	_basic_action_count = 0;
	return n;
}

function basic_action_retry_at(e) {
	if (!e || e.reason !== "cooldown" || !(e.ms > 0)) return 0;
	return Date.now() + e.ms - min_ping();
}

function run_basic_action(p, label, target) {
	record_action(label, target);
	_basic_action_count++;
	const freq = character.frequency > 0 ? character.frequency : 1.1;
	const until = Date.now() + 1000 / freq;
	_basic_action_until = until;
	const t0 = Date.now();
	Promise.resolve(p).then(
		() => { errlog_time("await " + label, Date.now() - t0); },
		e => {
			if (_basic_action_until === until) _basic_action_until = basic_action_retry_at(e);
			catcher(e, label);
		}
	);
}

function start_action_loop(action) {
	every("action_loop", { ms: action.ms, kind: "combat", beat: true }, () => run_action(action));
}

async function run_action(action) {
	if (action.gate === "combat" && should_pause_combat_loop()) return 100;
	try {
		if (is_disabled(character)) return 50;
		update_cache();
		if (action.before && action.before()) return 100;
		const next = action.act(ms_to_next_skill("attack"));
		return next === undefined ? action.ms : next;
	} catch (e) {
		catcher(e, "action_loop");
		return TICK_RATE.retry;
	}
}

function default_farm_step() {
	if (CONFIG.movement.reposition && get_nearest_monster({ type: home })) reposition();
}

function elixir_usage() {
	const cfg = CONFIG.elixir;
	if (!cfg || !cfg.name) return;
	if (character.c && character.c.town) return;

	if (character.slots.elixir?.name !== cfg.name) {
		const slot = locate_item(cfg.name);
		if (slot !== -1) use(slot);
	}

	if (cfg.min_stock) {
		const held = quantity(cfg.name);
		if (held < cfg.min_stock) buy(cfg.name, cfg.min_stock - held);
	}
}

function maintenance_loop() {
	every("maintenance_loop", { ms: TICK_RATE.maintenance, kind: "safety" }, maintenance_tick);
}

async function maintenance_tick() {
	try {
		if (CONFIG.potions.auto_buy) auto_buy_potions();
		maintain_xp_booster();
		if (CONFIG.party.auto_manage) party_manager();

		clear_inventory();
		inventory_sorter();
		elixir_usage();

		if (character.rip) respawn();
	} catch (e) {
		catcher(e, "maintenance_loop");
	}

	return TICK_RATE.maintenance;
}

function run_character(spec) {
	if (window.__al_runner_started) {
		log_msg("warn", "run_character called twice — ignoring the second start. Reload the tab to restart.");
		return;
	}
	window.__al_runner_started = true;
	const s = spec || {};

	cruise(500).catch(() => { });
	performance_trick();
	add_bank_buttons();
	state_cache_loop();
	on_character("new_map", "town_landed", town_landed);
	on_character("new_map", "map_changed", map_changed);

	async function main_tick() {
		errlog_beat("main_loop");
		main_beat();
		try {
			if (is_disabled(character)) {
				if (typeof s.on_disabled === "function") s.on_disabled();
				return 250;
			}

			if (typeof s.update_cache === "function") s.update_cache();
			if (typeof s.skip_panic_check !== "function" || !s.skip_panic_check()) panic_check();

			if (!automation_enabled()) {
				_current_goal = null;
				travel_arbiter(null);
				return TICK_RATE.main;
			}

			stuck_escape_check();
			channel_walk();
			town_shortcut_check();

			if (typeof s.pre_move === "function") await s.pre_move();

			const goal = movement_goal();
			_current_goal = goal;
			convoy_pace(goal);
			disengage_check();
			if (dungeon_moving()) return TICK_RATE.main;

			const travelling = travel_arbiter(goal);
			if (!travelling || goal.hold || goal.passive) {
				if (goal && goal.local === "kite") {
					if (should_loot()) handle_looting();
					movement_local(goal, s.farm_step, s.engage_step);
				} else if (should_loot()) await handle_looting();
				else movement_local(goal, s.farm_step, s.engage_step);
			}
		} catch (e) {
			console.error("main_tick error:", e);
		}
		return TICK_RATE.main;
	}

	every("main_loop", { ms: TICK_RATE.main, kind: "automation" }, main_tick);

	for (const fn of (s.loops || [])) {
		try {
			fn();
		} catch (e) {
			try { catcher(e, "run_character: " + (fn.name || "loop")); } catch (x) { }
		}
	}

	for (const entry of (s.intervals || [])) {
		every(entry[0].name, { ms: entry[1], kind: "automation", fixed: true }, entry[0]);
	}

	bscorpion_start();
	farm_ledger_start();
	farm_survey_start();
	danger_log_start();
	decision_log_start();
}
