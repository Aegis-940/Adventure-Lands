// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER COMBAT — who to heal, what to hold aggro on, and the action loop
// --------------------------------------------------------------------------------------------------------------------------------- //

var TARGET_BROADCAST_MS = 400;

var _broadcast_target_id = null;
var _broadcast_target_at = 0;

function broadcast_target(target) {
	if (!dungeon_flag("follow_focus")) return;

	const id = target && target.type === "monster" ? target.id : null;
	if (id === _broadcast_target_id) return;

	const now = Date.now();
	if (now - _broadcast_target_at < TARGET_BROADCAST_MS) return;

	_broadcast_target_at = now;
	_broadcast_target_id = id;
	send_cm(DUNGEON_FOLLOWERS, { type: "dungeon_focus", id });
}

function update_cache() {
	if (cache.is_valid()) return;
	cache.target = find_best_target();
	broadcast_target(cache.target);
	cache.party_members = get_party_members();
	cache.heal_target = find_heal_target();
	sample_set_profiles(HEALER_PROFILE_SETS);
	cache.last_update = performance.now();
}

function healer_target_context() {
	return {
		explosion: character.explosion || 0,
		party_factor: CONFIG.combat.party_dps_factor,
		protect: CONFIG.combat.target_priority
	};
}

function find_best_target() {
	const forced = dungeon_focus_target();
	if (forced) return forced;

	const max_dist = dungeon_engage_radius();
	const context = healer_target_context();

	const boss = best_target({ type: CONFIG.combat.all_bosses, max_distance: max_dist }, { close: 1 }, context);
	if (boss) return boss;

	if (dungeon_flag("defensive_targeting")) {
		return best_target({ target: [character.name], max_distance: max_dist }, { close: 1 }, context);
	}

	if (CONFIG.combat.aggro && count_my_aggro() < effective_aggro_cap()) {
		const untargeted = best_target(
			{ no_target: true, max_distance: character.range },
			dungeon_target_weights(CONFIG.combat.target_weights), context
		);
		if (untargeted) return untargeted;
	}

	for (const name of CONFIG.combat.target_priority) {
		const target = best_target(
			{ target: [name], max_distance: character.range },
			CONFIG.combat.protect_weights, context
		);
		if (target) return target;
	}

	return best_target({ max_distance: character.range }, dungeon_target_weights(CONFIG.combat.target_weights), context);
}

function count_my_aggro() {
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && !e.dead && e.target === character.name) count++;
	}
	return count;
}

function effective_aggro_cap() {
	if (dungeon_aggro_suppressed()) return 0;

	const fixed = dungeon_setting("aggro_cap_fixed", null);
	if (fixed !== null) return fixed;

	const mp_pct = character.max_mp > 0 ? character.mp / character.max_mp : 0;
	const scaled = Math.max(0, Math.min(1, (mp_pct - 0.2) / 0.6));
	return Math.floor(dungeon_setting("aggro_cap", CONFIG.combat.aggro_cap) * scaled);
}

function find_heal_target() {
	const party_names = Object.keys(get_party() || {});
	let lowest = character;
	let lowest_pct = character.hp / character.max_hp;

	for (const name of party_names) {
		const ally = get_player(name);
		if (!ally || ally.rip) continue;

		if (!ally.hp || !ally.max_hp) continue;
		if (name !== character.name && !is_in_range(ally, "heal")) continue;

		const pct = ally.hp / ally.max_hp;
		if (pct < lowest_pct) {
			lowest_pct = pct;
			lowest = ally;
		}
	}

	return lowest;
}

function find_zap_targets() {
	if (!CONFIG.combat.zapper_enabled) return [];

	return Object.values(parent.entities).filter(e =>
		e &&
		e.type === "monster" &&
		!e.target &&
		CONFIG.combat.zapper_mobs.includes(e.mtype) &&
		is_in_range(e, "zapperzap") &&
		e.visible &&
		!e.dead
	);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

var _heal_cast = false;

function heal_wanted() {
	const heal_target = cache.heal_target;
	if (!heal_target) return false;

	const delivered = heal_delivered(heal_target, character.heal);

	const heal_threshold = Math.max(
		heal_target.max_hp * 0.5,
		heal_target.max_hp - delivered / 1.33
	);

	const is_self = heal_target === character || heal_target.name === character.name;

	return heal_target.hp < heal_threshold && (is_self || is_in_range(heal_target, "heal"));
}

async function try_heal() {
	_heal_cast = false;
	const heal_target = cache.heal_target;
	if (!heal_target) return false;

	if (heal_wanted()) {
		// game_log(`Healing → ${heal_target.name} (${Math.round((heal_target.hp / heal_target.max_hp) * 100)}%)`, "#33AAFF");
		if (basic_action_busy()) return true;
		run_basic_action(heal(heal_target), "heal");
		_heal_cast = true;
		state.last_heal_cast = Date.now();
		return true;
	}

	return false;
}

async function action_loop() {
	loop_tick("action_loop");
	let next_delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, loop_next("action_loop", 50));

		update_cache();

		if (await check_temporal_surge()) return setTimeout(action_loop, loop_next("action_loop", 100));

		const ms = ms_to_next_skill("attack");

		if (ms === 0) {
			let acted = false;

			const healed = await try_heal();
			if (_heal_cast) acted = true;

			if (panicking) return setTimeout(action_loop, loop_next("action_loop", 100));

			const my_heal_threshold = Math.max(
				character.max_hp * 0.5,
				character.max_hp - character.heal / 1.33
			);
			const i_need_the_timer = character.hp < my_heal_threshold;

			const travelling = travel_blocks_combat();

			if (!healed && !travelling && !dungeon_flag("no_attack") && !dungeon_bailing() && !i_need_the_timer) {
				const target = cache.target;
				if (target && is_in_range(target) && !basic_action_busy()) {
					run_basic_action(attack(target), "attack");
					acted = true;
				}
			}

			if (!acted) next_delay = 40;
		} else {
			next_delay = next_action_delay(ms);
		}

	} catch (e) {
		catcher(e, "action_loop");
		next_delay = TICK_RATE.retry;
	}

	setTimeout(action_loop, loop_next("action_loop", next_delay));
}
