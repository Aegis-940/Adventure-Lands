// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER SKILLS — hunter's mark and supershot; started by Ranger.js
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	if (should_pause_combat_loop()) return setTimeout(skill_loop, 100);
	let delay = 5;
	try {
		if (!CONFIG.combat.use_hunters_mark && !CONFIG.combat.use_supershot) {
			setTimeout(skill_loop, 1000);
			return;
		}
		if (is_disabled(character)) return setTimeout(skill_loop, 250);

		update_cache();

		const { sorted_by_hp, in_range } = cache.targets;
		if (!sorted_by_hp.length) {
			setTimeout(skill_loop, 200);
			return;
		}

		const target = RANGER_TARGET === "giantspider" ? in_range[0] : sorted_by_hp[0];
		if (!target || !is_in_range(target)) {
			setTimeout(skill_loop, 100);
			return;
		}

		if (character.slots?.mainhand?.name === "cupid") {
			setTimeout(skill_loop, 100);
			return;
		}

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

			const mana_for_luxuries = character.mp >= character.max_mp * (CONFIG.combat.skill_min_mp_pct ?? 0.40);

			if (skill_allowed && mana_for_luxuries && CONFIG.combat.use_hunters_mark && ms_hunter === 0
				&& !target.s?.marked && affordable(hm_cost)) {
				committed += hm_cost;
				await use_skill("huntersmark", target);
			}

			if (skill_allowed && mana_for_luxuries && CONFIG.combat.use_supershot && ms_super === 0
				&& affordable(ss_cost)) {
				committed += ss_cost;
				await use_skill("supershot", target);
			}
		} else {
			delay = next_action_delay(min_ms, 100);
		}
	} catch (e) {
		catcher(e, "skill_loop");
		delay = 1;
	}
	setTimeout(skill_loop, delay);
}
