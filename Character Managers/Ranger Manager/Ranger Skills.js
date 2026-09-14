// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER SKILLS — hunter's mark and supershot; started by Ranger.js
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL VALUE — damage bought, weighed against what the mana is worth elsewhere
// --------------------------------------------------------------------------------------------------------------------------------- //

function above_hp_pct(target, pct) {
	if (!pct) return true;
	return !!target.max_hp && target.hp >= target.max_hp * pct;
}

function skill_pays(value, mana, target) {
	if (value <= 0 || mana <= 0) return false;
	const reference = target_modifier(target, 1) || 1;
	const lambda = mana_price() * (character.attack || 0) * reference;
	return value > lambda * mana;
}

function mark_value(target) {
	const cond = G.conditions?.marked;
	if (!cond || !cond.incdmgamp) return 0;
	if (target.s?.marked) return 0;

	const own_dps = (character.attack || 0) * (character.frequency || 1);
	const ttk = time_to_kill_ms(target, target.hp, own_dps, CONFIG.combat.party_dps_factor);
	const seconds = Math.min(cond.duration || 0, ttk) / 1000;

	const party_dps = own_dps * (CONFIG.combat.party_dps_factor || 1);
	return (cond.incdmgamp / 100) * party_dps * seconds * (target_modifier(target, 1) || 1);
}

function supershot_value(target) {
	const multiplier = G.skills.supershot?.damage_multiplier || 1.5;
	return multiplier * (character.attack || 0) * (target_modifier(target, multiplier) || 1);
}

async function skill_loop() {
	loop_tick("skill_loop");
	if (should_pause_combat_loop()) return setTimeout(skill_loop, loop_next("skill_loop", 100));
	let next_delay = 5;
	try {
		if (!CONFIG.combat.use_hunters_mark && !CONFIG.combat.use_supershot) {
			return setTimeout(skill_loop, loop_next("skill_loop", 1000));
		}
		if (is_disabled(character)) return setTimeout(skill_loop, loop_next("skill_loop", 250));

		update_cache();

		const { sorted_by_value, in_range } = cache.targets;
		if (!sorted_by_value.length) return setTimeout(skill_loop, loop_next("skill_loop", 200));

		const forced = dungeon_focus_target();
		if (forced && !is_in_range(forced)) return setTimeout(skill_loop, loop_next("skill_loop", 100));
		const target = forced
			? forced
			: (dungeon_flag("single_target") ? in_range[0] : sorted_by_value[0]);
		if (!target || !is_in_range(target)) return setTimeout(skill_loop, loop_next("skill_loop", 100));

		if (character.slots?.mainhand?.name === "cupid") return setTimeout(skill_loop, loop_next("skill_loop", 100));

		const ms_hunter = ms_to_next_skill("huntersmark");
		const ms_super = ms_to_next_skill("supershot");
		const min_ms = Math.min(ms_hunter, ms_super);

		if (min_ms < character.ping / 10) {
			change_target(target);

			const skill_allowed = !CONFIG.combat.skill_blacklist.includes(target.mtype);

			const hm_cost = G.skills.huntersmark?.mp || 0;
			const ss_cost = G.skills.supershot?.mp || 0;
			let committed = 0;
			const affordable = (cost) => (character.mp - committed) >= cost + panic_mp_reserve();

			if (skill_allowed && CONFIG.combat.use_hunters_mark && ms_hunter === 0
				&& above_hp_pct(target, CONFIG.combat.mark_min_hp_pct)
				&& affordable(hm_cost) && skill_pays(mark_value(target), hm_cost, target)) {
				committed += hm_cost;
				await use_skill("huntersmark", target);
			}

			if (skill_allowed && CONFIG.combat.use_supershot && ms_super === 0
				&& above_hp_pct(target, CONFIG.combat.supershot_min_hp_pct)
				&& affordable(ss_cost) && skill_pays(supershot_value(target), ss_cost, target)) {
				committed += ss_cost;
				await use_skill("supershot", target);
			}
		} else {
			next_delay = min_ms > 200 ? 100 : min_ms > 50 ? 20 : 5;
		}
	} catch (e) {
		catcher(e, "skill_loop");
		next_delay = TICK_RATE.retry;
	}
	setTimeout(skill_loop, loop_next("skill_loop", next_delay));
}
