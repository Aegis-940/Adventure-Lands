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

	const gear = swing_gear();
	const explosion = gear ? gear.explosion : (character.explosion || 0);
	const touchable = mob => warrior_may_engage(mob) && safe_to_touch(mob, explosion);

	const pursued = pursued_boss();
	if (pursued && safe_to_touch(pursued, explosion)) return pursued;

	const max_dist = dungeon_setting("melee_engage_radius", dungeon_engage_radius(CONFIG.combat.engage_radius));

	const context = {
		gear,
		party_factor: CONFIG.combat.party_dps_factor,
		protect: CONFIG.combat.target_priority
	};

	const boss = best_target({ type: CONFIG.combat.all_bosses, max_distance: max_dist, where: touchable }, { close: 1 }, context);
	if (boss) return boss;

	const guard = typeof porcupine_guard_allows === "function" ? porcupine_guard_allows : undefined;
	const allowed = mob => touchable(mob) && (!guard || guard(mob));
	const weights = dungeon_target_weights();

	return best_target({ max_distance: max_dist, where: mob => is_in_range(mob) && allowed(mob) }, weights, context)
		|| best_target({ max_distance: max_dist, where: allowed }, weights, context);
}

function swing_gear() {
	const set_name = weapon_set_to_restore();
	const profile = set_name && get_set_profile(set_name);
	if (!profile || !profile.attack) return null;

	return {
		attack: profile.attack,
		frequency: profile.frequency || 1,
		explosion: profile.explosion || 0,
		apiercing: profile_apiercing(profile),
		burn_chance: set_ability_chance(set_name, "burn"),
	};
}

function warrior_may_engage(mob) {
	if (is_in_range(mob)) return true;
	if (dungeon_setting("melee_engage_radius", null)) return true;
	return DUNGEON_PARTY.includes(mob.target);
}

function find_monsters_in_cleave_range() {
	return monsters_matching({ max_distance: G.skills.cleave.range });
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WEAPON BURST — swing, cleave on the axe, hold the candy canes while the hits land, then the chosen set
// --------------------------------------------------------------------------------------------------------------------------------- //

var SUGAR_RUSH = {
	status: "sugarrush",
	set: "candycane",
	label: "Sugar Rush",
	color: "#ff69b4",
};

var CLEAVE_SET = "bataxe";
var SWAP_TRICK_HIT_TICK_MS = 7;
var SWAP_TRICK_MARGIN_MS = 20;

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

function free_hold_ms(armed_penalty, restore_penalty) {
	const swing_ms = 1000 / character.frequency;
	const free = Math.max(swing_ms - restore_penalty, armed_penalty);
	return Math.min(free, swing_ms - SWAP_TRICK_MARGIN_MS);
}

function hold_to_land(mob) {
	const gap = distance(character, mob);
	if (gap <= 0) return null;
	return swap_trick_flight_ms(gap) + SWAP_TRICK_HIT_TICK_MS + SWAP_TRICK_MARGIN_MS;
}

function burst_hold(swing_target, cleave_mobs, cap) {
	let hold = 0;

	if (swing_target) {
		const h = hold_to_land(swing_target);
		if (h === null) errlog_count("swap trick skipped: hitboxes overlap");
		else if (h > cap) errlog_count("swap trick skipped: too far");
		else hold = h;
	}

	if (cleave_mobs) {
		let rolls = 0;
		for (const mob of cleave_mobs) {
			const h = hold_to_land(mob);
			if (h === null || h > cap) continue;
			rolls++;
			if (h > hold) hold = h;
		}
		errlog_count(`swap trick cleave rolls ${rolls}`);
		errlog_count(`swap trick cleave missed ${cleave_mobs.length - rolls}`);
	}

	return hold;
}

function swing_trick_affordable() {
	if (character.cc < CONFIG.combat.swing_trick_cc_budget) return true;
	errlog_count("swap trick skipped: call cost");
	return false;
}

function swing_swaps(target) {
	const cleave = cleave_ready();
	const rush = sugar_rush_wanted() && (cleave || swing_trick_affordable());
	if (cleave || rush) weapon_burst(cleave, rush, target);
}

function restore_weapon_set(token, fallback) {
	const back = equip_plan(chosen_weapon_set() || fallback);
	emit_equip_ops(back.ops, back.shadow);
	equip_release(token);
}

function weapon_burst(cleave, rush, swing_target) {
	const restore = chosen_weapon_set();
	if (!restore) return false;

	const token = equip_claim("weapon-burst", EQUIP_PRIORITY.skill);
	if (!token) return false;

	const axe = equip_plan(cleave ? CLEAVE_SET : []);
	const shadow = axe.shadow;
	const axe_worn = !!shadow.slots.mainhand && shadow.slots.mainhand.name === CLEAVE_SET;
	const candy = equip_plan(rush ? SUGAR_RUSH.set : [], shadow);
	const back = equip_plan(restore, shadow);

	const will_cleave = cleave && axe_worn;
	const armed_penalty = penalty_left() + ops_penalty(axe.ops) + ops_penalty(candy.ops);
	const cap = free_hold_ms(armed_penalty, ops_penalty(back.ops));
	const hold = candy.ops.length
		? burst_hold(swing_target, will_cleave ? cache.monsters_in_cleave_range : null, cap)
		: 0;

	if ((!will_cleave && !hold) || !back.ops.length) {
		equip_release(token);
		return false;
	}

	emit_equip_ops(axe.ops, shadow);
	if (will_cleave) fire_cleave();

	if (!hold) {
		restore_weapon_set(token, restore);
		return true;
	}

	emit_equip_ops(candy.ops, shadow);
	swap_trick_attempts++;
	errlog_count("swap trick fired");
	errlog_time("swap trick hold", hold);
	setTimeout(() => restore_weapon_set(token, restore), hold);
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

function sugar_rush_roll_logger() {
	if (parent.socket._sugar_rush_roll_logger) {
		parent.socket.off("hit", parent.socket._sugar_rush_roll_logger);
	}

	parent.socket._sugar_rush_roll_logger = data => {
		if (!data || data.hid !== character.id || data.splash || data.miss || data.evade) return;
		if (data.source !== "attack" && data.source !== "cleave") return;
		const canes = equipment_sets[SUGAR_RUSH.set].filter(entry =>
			character.slots[entry.slot] && character.slots[entry.slot].name === entry.item_name).length;
		errlog_count(`sugar rush roll ${data.source} ${canes}`);
		if (data.trigger === SUGAR_RUSH.status) errlog_count(`sugar rush proc ${data.source} ${canes}`);
	};

	parent.socket.on("hit", parent.socket._sugar_rush_roll_logger);
}

var CC_REPORT_MS = 20000;

function cc_report_logger() {
	if (parent.socket._cc_report_logger) {
		parent.socket.off("ccreport", parent.socket._cc_report_logger);
	}

	parent.socket._cc_report_logger = data => {
		if (!data || !data.calls) return;
		const by_method = {};
		let total = 0;
		for (const call of data.calls) {
			by_method[call[1]] = +((by_method[call[1]] || 0) + call[2]).toFixed(2);
			total += call[2];
		}
		errlog_sample("cc_report", { total: +total.toFixed(1), climit: data.climit, by_method });
	};

	parent.socket.on("ccreport", parent.socket._cc_report_logger);
	setInterval(() => parent.socket.emit("ccreport"), CC_REPORT_MS);
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
