// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR COMBAT — target selection, the cache refresh, and the attack loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	if (cache.is_valid()) return;
	cache.tank_entity = get_entity("Myras");
	sample_set_profiles(CONFIG.equipment.weapon_sets.concat("bataxe"));
	cache.monsters_in_cleave_range = find_monsters_in_cleave_range();
	cache.target = find_best_target();
	cache.party_members = get_party_members();
	sample_burn_state(cache.target);
	cache.last_update = performance.now();
}

var BURN_PROBE_MS = 1000;
var _burn_probe_at = 0;

function sample_burn_state(target) {
	if (!CONFIG.combat.sample_hits) return;
	if (!target || target.mtype !== home) return;

	const now = Date.now();
	if (now - _burn_probe_at < BURN_PROBE_MS) return;
	_burn_probe_at = now;

	const burned = target.s && target.s.burned;
	errlog_sample("burn_state", {
		hp_pct: +(target.hp / target.max_hp).toFixed(3),
		burned: burned ? Object.assign({}, burned) : null,
		attack: character.attack,
		marked: !!(target.s && target.s.marked),
		cursed: !!(target.s && target.s.cursed),
		buffs: Object.keys(character.s || {}).filter(b => BUFFS_WORTH_LOGGING.includes(b)).join("+")
	});
}

function cooperative_luck_logger() {
	game.on("death", data => {
		const mob = parent.entities[data.id];
		if (!mob || !mob.cooperative) return;

		const party_members = Object.keys(get_party() || {});
		if (mob.target !== character.name && !party_members.includes(mob.target)) return;

		game_log(`${mob.mtype} died with ${character.luckm} luck`, "#96a4ff");
	});
}

function find_best_target() {
	const forced = dungeon_focus_target();
	if (forced) return forced;

	const pursued = pursued_boss();
	if (pursued) return pursued;

	const max_dist = dungeon_setting("melee_engage_radius", dungeon_engage_radius());

	const context = {
		explosion: character.explosion || 0,
		party_factor: CONFIG.combat.party_dps_factor,
		protect: CONFIG.combat.target_priority
	};

	const boss = best_target({ type: CONFIG.combat.all_bosses, max_distance: max_dist }, { close: 1 }, context);
	if (boss) return boss;

	const guard = typeof porcupine_guard_allows === "function" ? porcupine_guard_allows : undefined;
	const where = mob => warrior_may_engage(mob) && (!guard || guard(mob));

	return best_target({ max_distance: max_dist, where }, dungeon_target_weights(), context);
}

function warrior_may_engage(mob) {
	if (!dungeon_setting("melee_engage_radius", null)) return true;
	return !!mob.target || is_in_range(mob);
}

function find_monsters_in_cleave_range() {
	return monsters_matching({ max_distance: G.skills.cleave.range, point_for_distance_check: [character.x, character.y] });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATUS SWAP TRICK
// --------------------------------------------------------------------------------------------------------------------------------- //

var STATUS_SWAP_TRICKS = {
	bscorpion: {
		status: "sugarrush",
		set: "candycane",
		hold_ms: 50,
		label: "Sugar Rush",
		color: "#ff69b4",
	},
};

var SWAP_TRICK_HIT_TICK_MS = 7;
var WEAPON_SWAP_SETTLE_MS = 250;

var swap_trick_attempts = 0;
var swap_trick_history = {};

function swap_trick_flight_ms(gap) {
	return (1000 * gap) / G.projectiles[G.classes[character.ctype].projectile].speed;
}

function status_swap_trick(target) {
	if (!CONFIG.combat.swap_trick_enabled) return;

	const trick = STATUS_SWAP_TRICKS[target.mtype];
	if (!trick) return;

	if (character.s[trick.status] !== undefined) {
		if (swap_trick_attempts) record_swap_trick(target.mtype, trick);
		return;
	}

	const now = performance.now();
	if (now < state.weapon_swap_busy_until) return;

	const gap = distance(character, target);
	if (gap <= 0) {
		errlog_count("swap trick skipped: hitboxes overlap");
		return;
	}

	const flight = swap_trick_flight_ms(gap);
	errlog_time("swap trick flight", flight);
	if (flight + SWAP_TRICK_HIT_TICK_MS >= trick.hold_ms) {
		errlog_count("swap trick skipped: too far");
		return;
	}

	const restore = weapon_set_to_restore();
	if (!restore) return;

	const arm = equip_plan(trick.set);
	if (!arm.ops.length) return;

	const back = equip_plan(restore, arm.shadow);
	if (!back.ops.length) return;

	const token = equip_claim("swap-trick", EQUIP_PRIORITY.skill);
	if (!token) return;

	state.weapon_swap_busy_until = now + trick.hold_ms + WEAPON_SWAP_SETTLE_MS;
	swap_trick_attempts++;
	emit_equip_ops(arm.ops, back.shadow);
	setTimeout(() => emit_equip_ops(back.ops, back.shadow), trick.hold_ms);
	setTimeout(() => equip_release(token), trick.hold_ms + WEAPON_SWAP_SETTLE_MS);
	errlog_count("swap trick fired");
}

function record_swap_trick(mtype, trick) {
	if (!swap_trick_history[mtype]) swap_trick_history[mtype] = [];
	const history = swap_trick_history[mtype];
	history.push(swap_trick_attempts);
	if (history.length > 30) history.shift();
	const avg = history.reduce((a, b) => a + b, 0) / history.length;
	game_log(`${trick.label} activated after ${swap_trick_attempts}! Avg attempts: ${avg.toFixed(1)}`, trick.color);
	swap_trick_attempts = 0;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function action_loop() {
	loop_tick("action_loop");
	if (should_pause_combat_loop()) return setTimeout(action_loop, loop_next("action_loop", 100));
	let next_delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, loop_next("action_loop", 50));

		update_cache();

		const target = cache.target;
		const ms = ms_to_next_skill("attack");

		if (ms === 0 && !travel_blocks_combat() && target && is_in_range(target)) {
			if (!basic_action_busy()) {
				run_basic_action(attack(target), "attack");
				status_swap_trick(target);
			}
		} else {
			next_delay = next_action_delay(ms);
		}

	} catch (e) {
		catcher(e, "action_loop");
		next_delay = TICK_RATE.retry;
	}

	setTimeout(action_loop, loop_next("action_loop", next_delay));
}
