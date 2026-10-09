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

	const touchable = m => safe_to_touch(m, character.explosion || 0);

	const pursued = pursued_boss();
	if (pursued && touchable(pursued)) return pursued;

	const max_dist = dungeon_engage_radius();
	const context = healer_target_context();

	const boss = best_target({ type: CONFIG.combat.all_bosses, max_distance: max_dist, where: touchable }, { close: 1 }, context);
	if (boss) return boss;

	if (dungeon_flag("defensive_targeting")) {
		return best_target({ target: [character.name], max_distance: max_dist }, { close: 1 }, context);
	}

	if (CONFIG.combat.aggro && count_my_aggro() < effective_aggro_cap()) {
		const untargeted = best_target(
			{ no_target: true, max_distance: character.range, where: m => touchable(m) && tank_can_take(monster_dps_on(m, character)) },
			dungeon_target_weights(), context
		);
		if (untargeted) return untargeted;
	}

	for (const name of CONFIG.combat.target_priority) {
		const target = best_target(
			{ target: [name], max_distance: character.range, where: touchable },
			CONFIG.combat.protect_weights, context
		);
		if (target) return target;
	}

	return best_target({ max_distance: character.range, where: touchable }, dungeon_target_weights(), context);
}

function count_my_aggro() {
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && !e.dead && e.target === character.name) count++;
	}
	return count;
}

function self_heal_rate() {
	return heal_delivered(character, character.heal) * (character.frequency || 0);
}

function tank_can_take(added_dps) {
	return projected_hp(character, added_dps, self_heal_rate()) > character.max_hp * ENDANGER_FLOOR_PCT;
}

function fighter_down() {
	return COHESION_FOLLOWERS.some(name => {
		const s = read_state_cache(name);
		if (!s || s.paused) return false;
		return s.rip || (s.map !== character.map && !is_travelling());
	});
}

function effective_aggro_cap() {
	if (dungeon_aggro_suppressed()) return 0;
	if (fighter_down()) return 0;

	const fixed = dungeon_setting("aggro_cap_fixed", null);
	if (fixed !== null) return fixed;

	const mp_pct = character.max_mp > 0 ? character.mp / character.max_mp : 0;
	const scaled = Math.max(0, Math.min(1, (mp_pct - 0.2) / 0.6));
	return Math.floor(dungeon_setting("aggro_cap", CONFIG.combat.aggro_cap) * scaled);
}

function party_allies() {
	const allies = [];
	for (const name of cache.party_members) {
		const ally = name === character.name ? character : get_player(name);
		if (ally && !ally.rip) allies.push(ally);
	}
	return allies;
}

function find_heal_target() {
	let lowest = character;
	let lowest_pct = character.hp / character.max_hp;

	for (const ally of party_allies()) {
		if (ally !== character && !is_in_range(ally, "heal")) continue;

		const pct = ally.hp / ally.max_hp;
		if (pct < lowest_pct) {
			lowest_pct = pct;
			lowest = ally;
		}
	}

	return lowest;
}

var KILL_RATE_WINDOW_MS = 2000;
var KILL_RATE_MIN_SPAN_MS = 500;

var _kill_hp_trace = [];
var _luck_latched_id = null;

function kill_rate(mob) {
	const now = Date.now();
	const trace = _kill_hp_trace;
	if (trace.length && trace[0].id !== mob.id) trace.length = 0;
	if (!trace.length || now - trace[trace.length - 1].t >= 100) trace.push({ id: mob.id, t: now, hp: mob.hp });
	while (now - trace[0].t > KILL_RATE_WINDOW_MS) trace.shift();
	if (!trace.length || now - trace[0].t < KILL_RATE_MIN_SPAN_MS) return 0;
	return Math.max(0, (trace[0].hp - mob.hp) / (now - trace[0].t));
}

function luck_due(mob) {
	if (_luck_latched_id === mob.id) return true;
	const lead_hp = kill_rate(mob) * CONFIG.equipment.luck_lead_ms;
	if (remaining_hp(mob) > lead_hp + CONFIG.equipment.luck_burst_hp) return false;
	_luck_latched_id = mob.id;
	return true;
}

function tank_boss_nearby() {
	for (const type of CONFIG.combat.tank_bosses) {
		const boss = get_nearest_monster({ type });
		if (boss) return boss;
	}
	return null;
}

function luck_kill_target() {
	if (!is_at_bscorpion_farm()) return tank_boss_nearby();
	const info = find_nearest_bscorpion();
	return info ? info.entity : null;
}

function luck_window() {
	const mob = luck_kill_target();
	return !!mob && !!mob.target && luck_due(mob);
}

function bscorpion_damage_window() {
	if (!is_at_bscorpion_farm()) return null;

	const info = find_nearest_bscorpion();
	if (!info) return null;

	const bscorp = info.entity;
	if (!bscorp.target) return null;
	if (luck_due(bscorp)) return null;
	return bscorp;
}

function zap_target() {
	return CONFIG.combat.zapper_enabled ? bscorpion_damage_window() : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

function heal_wanted() {
	const heal_target = cache.heal_target;
	if (!heal_target || cave_paused()) return false;

	const delivered = heal_delivered(heal_target, character.heal);

	const heal_threshold = Math.max(
		heal_target.max_hp * 0.5,
		heal_target.max_hp - delivered / 1.33
	);

	return heal_target.hp < heal_threshold && (heal_target === character || is_in_range(heal_target, "heal"));
}

function attack_wanted() {
	if (should_pause_combat_loop() || dungeon_flag("no_attack")) return false;
	const target = cache.target;
	return !!target && is_in_range(target);
}

async function action_loop() {
	loop_tick("action_loop");
	let next_delay = 10;

	try {
		if (is_disabled(character)) return setTimeout(action_loop, loop_next("action_loop", 50));

		update_cache();

		if (camp_temporal_surge()) return setTimeout(action_loop, loop_next("action_loop", 100));

		const ms = ms_to_next_skill("attack");

		if (ms === 0) {
			if (basic_action_busy()) next_delay = 40;
			else if (heal_wanted()) run_basic_action(heal(cache.heal_target), "heal");
			else if (attack_wanted()) run_basic_action(attack(cache.target), "attack");
			else next_delay = 40;
		} else {
			next_delay = next_action_delay(ms);
		}

	} catch (e) {
		catcher(e, "action_loop");
		next_delay = TICK_RATE.retry;
	}

	setTimeout(action_loop, loop_next("action_loop", next_delay));
}
