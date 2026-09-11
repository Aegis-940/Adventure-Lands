// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER COMBAT — who to heal, what to hold aggro on, and the action loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function update_cache() {
	if (!cache.is_valid()) {
		cache.target = find_best_target();
		cache.party_members = get_party_members();
		cache.last_update = performance.now();
	}

	cache.heal_target = find_heal_target();
}

function find_best_target() {
	const max_dist = HEALER_TARGET === "giantspider" ? 50 : character.range;

	const boss = get_nearest_monster_v2({ type: CONFIG.combat.all_bosses, max_distance: max_dist });
	if (boss) return boss;

	if (HEALER_TARGET === "giantspider") {
		return get_nearest_monster_v2({ target: character.name, max_distance: max_dist }) || null;
	}

	if (CONFIG.combat.aggro && count_my_aggro() < effective_aggro_cap()) {
		const untargeted = get_nearest_monster_v2({
			no_target: true,
			max_distance: character.range
		});
		if (untargeted) return untargeted;
	}

	for (const name of CONFIG.combat.target_priority) {
		const target = get_nearest_monster_v2({
			target: name,
			check_min_hp: true,
			max_distance: character.range
		});
		if (target) return target;
	}

	const highest_hp = get_nearest_monster_v2({
		max_distance: character.range,
		check_max_hp: true
	});
	if (highest_hp) return highest_hp;

	return null;
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
	const mp_pct = character.max_mp > 0 ? character.mp / character.max_mp : 0;
	const scaled = Math.max(0, Math.min(1, (mp_pct - 0.2) / 0.6));
	return Math.floor(CONFIG.combat.aggro_cap * scaled);
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

let _basic_action_until = 0;

function basic_action_busy() {
	return Date.now() < _basic_action_until;
}

function run_basic_action(p, label) {
	const freq = character.frequency > 0 ? character.frequency : 1.1;
	_basic_action_until = Date.now() + (1000 / freq) * 0.9;
	const t0 = Date.now();
	Promise.resolve(p).then(
		() => { if (typeof errlog_time === "function") errlog_time("await " + label, Date.now() - t0); },
		e => { catcher(e, "action_loop"); }
	);
}

let _heal_cast = false;

async function try_heal() {
	_heal_cast = false;
	const HEAL_TARGET = cache.heal_target;
	if (!HEAL_TARGET) return false;

	const HEAL_THRESHOLD = Math.max(
		HEAL_TARGET.max_hp * 0.5,
		HEAL_TARGET.max_hp - character.heal / 1.33
	);

	const is_self = HEAL_TARGET === character || HEAL_TARGET.name === character.name;

	if (HEAL_TARGET.hp < HEAL_THRESHOLD && (is_self || is_in_range(HEAL_TARGET, "heal"))) {
		// log(`Healing → ${HEAL_TARGET.name} (${Math.round((HEAL_TARGET.hp / HEAL_TARGET.max_hp) * 100)}%)`, "#33AAFF");
		if (basic_action_busy()) return true;
		run_basic_action(heal(HEAL_TARGET), "heal");
		_heal_cast = true;
		return true;
	}

	return false;
}

let _al_due = 0;
const _t = () => Date.now();

async function action_loop() {
	if (typeof errlog_beat === "function") errlog_beat("action_loop");
	const t_enter = _t();
	if (_al_due && typeof errlog_time === "function") errlog_time("lag action_loop", t_enter - _al_due);
	let delay = 10;

	try {
		if (is_disabled(character)) {
			if (typeof errlog_count === "function") errlog_count("action_loop exit:disabled");
			_al_due = _t() + 50;
			return setTimeout(action_loop, 50);
		}

		const t_cache = _t();
		update_cache();
		if (typeof errlog_time === "function") errlog_time("cpu update_cache", _t() - t_cache);

		if (await check_temporal_surge()) {
			_al_due = _t() + 100;
			return setTimeout(action_loop, 100);
		}

		const ms = ms_to_next_skill("attack");

		if (ms === 0) {
			let acted = false;

			const HEALED = await try_heal();
			if (_heal_cast) acted = true;

			if (panicking) {
				if (typeof errlog_count === "function") errlog_count("action_loop exit:panicking");
				_al_due = _t() + 100;
				return setTimeout(action_loop, 100);
			}

			const my_heal_threshold = Math.max(
				character.max_hp * 0.5,
				character.max_hp - character.heal / 1.33
			);
			const i_need_the_timer = character.hp < my_heal_threshold;

			const travelling = is_travelling();

			if (!HEALED && !travelling && HEALER_TARGET !== "giantspider" && !i_need_the_timer) {
				const TARGET = cache.target;
				if (TARGET && is_in_range(TARGET) && !basic_action_busy()) {
					run_basic_action(attack(TARGET), "attack");
					acted = true;
				}
			}

			if (!acted) delay = 40;
		} else {
			if (typeof errlog_time === "function") errlog_time("cooldown remaining", ms);
			delay = next_action_delay(ms);
		}

	} catch (e) {
		catcher(e, "action_loop");
		delay = 1;
	}

	if (typeof errlog_time === "function") errlog_time("iter action_loop", _t() - t_enter);
	_al_due = _t() + delay;
	setTimeout(action_loop, delay);
}
