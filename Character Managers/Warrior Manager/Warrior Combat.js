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
// WEAPON BURST — swing, cleave on the axe, hold the candy canes while the hits land, then the chosen set
// --------------------------------------------------------------------------------------------------------------------------------- //

var SUGAR_RUSH = {
	status: "sugarrush",
	set: "candycane",
	hold_ms: 50,
	label: "Sugar Rush",
	color: "#ff69b4",
};

var CLEAVE_SET = "bataxe";
var SWAP_TRICK_HIT_TICK_MS = 7;

var swap_trick_attempts = 0;
var swap_trick_history = [];

function swap_trick_flight_ms(gap) {
	return (1000 * gap) / G.projectiles[G.classes[character.ctype].projectile].speed;
}

function swing_possible(target) {
	return !!target && !travel_blocks_combat() && is_in_range(target);
}

function chosen_weapon_set() {
	return resolve_warrior_weapon() || weapon_set_to_restore();
}

function sugar_rush_wanted() {
	if (!CONFIG.combat.swap_trick_enabled) return false;
	if (character.s[SUGAR_RUSH.status] === undefined) return true;
	if (swap_trick_attempts) record_swap_trick();
	return false;
}

function swing_lands_in_hold(target) {
	const gap = distance(character, target);
	if (gap <= 0) {
		errlog_count("swap trick skipped: hitboxes overlap");
		return false;
	}

	const flight = swap_trick_flight_ms(gap);
	errlog_time("swap trick flight", flight);
	if (flight + SWAP_TRICK_HIT_TICK_MS < SUGAR_RUSH.hold_ms) return true;

	errlog_count("swap trick skipped: too far");
	return false;
}

function swing_swaps(target) {
	const cleave = cleave_ready();
	const sugar_rush = sugar_rush_wanted() && (cleave || swing_lands_in_hold(target));
	if (cleave || sugar_rush) weapon_burst(cleave, sugar_rush);
}

function restore_weapon_set(token, fallback) {
	const back = equip_plan(chosen_weapon_set() || fallback);
	emit_equip_ops(back.ops, back.shadow);
	equip_release(token);
}

function weapon_burst(cleave, sugar_rush) {
	const restore = chosen_weapon_set();
	if (!restore) return false;

	const token = equip_claim("weapon-burst", EQUIP_PRIORITY.skill);
	if (!token) return false;

	const axe = equip_plan(cleave ? CLEAVE_SET : []);
	const shadow = axe.shadow;
	const axe_worn = !!shadow.slots.mainhand && shadow.slots.mainhand.name === CLEAVE_SET;
	const candy = equip_plan(sugar_rush ? SUGAR_RUSH.set : [], shadow);
	const back = equip_plan(restore, shadow);

	const will_cleave = cleave && axe_worn;
	const will_rush = sugar_rush && candy.ops.length > 0;
	const armed = axe.ops.length + candy.ops.length > 0;
	if ((!will_cleave && !will_rush) || (armed && !back.ops.length)) {
		equip_release(token);
		return false;
	}

	emit_equip_ops(axe.ops, shadow);
	if (will_cleave) fire_cleave();
	emit_equip_ops(candy.ops, shadow);

	if (!will_rush) {
		restore_weapon_set(token, restore);
		return true;
	}

	swap_trick_attempts++;
	errlog_count("swap trick fired");
	setTimeout(() => restore_weapon_set(token, restore), SUGAR_RUSH.hold_ms);
	return true;
}

function swap_penalty_logger() {
	if (parent.socket._swap_penalty_logger) {
		parent.socket.off("skill_timeout", parent.socket._swap_penalty_logger);
	}

	parent.socket._swap_penalty_logger = data => {
		if (!data || data.penalty === undefined) return;
		if (data.name !== "attack" && data.name !== "cleave") return;
		const rush = character.s.sugarrush !== undefined ? " rush" : "";
		errlog_time(`penalty ${data.name}${rush}`, data.penalty);
	};

	parent.socket.on("skill_timeout", parent.socket._swap_penalty_logger);
}

function record_swap_trick() {
	swap_trick_history.push(swap_trick_attempts);
	if (swap_trick_history.length > 30) swap_trick_history.shift();
	const avg = swap_trick_history.reduce((a, b) => a + b, 0) / swap_trick_history.length;
	game_log(`${SUGAR_RUSH.label} activated after ${swap_trick_attempts}! Avg attempts: ${avg.toFixed(1)}`, SUGAR_RUSH.color);
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

		if (ms === 0 && swing_possible(target)) {
			if (!basic_action_busy()) {
				run_basic_action(attack(target), "attack");
				swing_swaps(target);
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
