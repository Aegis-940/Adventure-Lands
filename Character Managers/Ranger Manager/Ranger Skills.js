// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER SKILLS — hunter's mark and supershot; started by Ranger.js
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL VALUE — damage bought, weighed against what the mana is worth elsewhere
// --------------------------------------------------------------------------------------------------------------------------------- //

function above_hp_pct(target, pct) {
	if (!pct) return true;
	return !!target.max_hp && remaining_hp(target) >= target.max_hp * pct;
}

function supershot_min_hp_pct() {
	return is_at_bscorpion_farm() ? CONFIG.combat.camp_supershot_min_hp_pct : CONFIG.combat.supershot_min_hp_pct;
}

var SUPERSHOT_SETUP_WAIT_MS = 4000;
var _supershot_ready_since = 0;

function supershot_setup_ready(target) {
	if (!is_at_bscorpion_farm()) return true;

	const now = Date.now();
	if (!_supershot_ready_since) _supershot_ready_since = now;

	const s = target.s || {};
	if (s.marked && s.cursed) return true;

	return now - _supershot_ready_since >= SUPERSHOT_SETUP_WAIT_MS;
}

function skill_pays(value, mana, target) {
	if (value <= 0 || mana <= 0) return false;
	if (mana_free()) return true;
	const reference = target_modifier(target, 1) || 1;
	const lambda = mana_price() * (character.attack || 0) * reference;
	return value > lambda * mana;
}

function mark_value(target) {
	const cond = G.conditions.marked;
	if (!cond.incdmgamp) return 0;
	if (target.s?.marked) return 0;

	const own_dps = (character.attack || 0) * (character.frequency || 1);
	const ttk = time_to_kill_ms(target, remaining_hp(target), own_dps, CONFIG.combat.party_dps_factor);
	const seconds = Math.min(cond.duration || 0, ttk) / 1000;

	const party_dps = own_dps * (CONFIG.combat.party_dps_factor || 1);
	return (cond.incdmgamp / 100) * party_dps * seconds * (target_modifier(target, 1) || 1);
}

function supershot_value(target) {
	const multiplier = G.skills.supershot.damage_multiplier;
	return Math.min(multiplier * (character.attack || 0) * (target_modifier(target, multiplier) || 1), remaining_hp(target));
}

var _last_sent_target = null;

var RANGER_SKILLS = [
	{ name: "huntersmark", gate: "combat", wanted: mark_wanted, value: shot => mark_value(shot.target), cast: shot => shoot_skill("huntersmark", shot) },
	{ name: "supershot", gate: "combat", wanted: supershot_wanted, value: shot => supershot_value(shot.target), cast: shot => shoot_skill("supershot", shot) },
];

function shot_affordable(shot, skill) {
	return character.mp - shot.committed >= skill_mp_cost(skill) + panic_mp_reserve();
}

function mark_wanted(shot) {
	return shot.allowed && CONFIG.combat.use_hunters_mark && shot.ms_hunter === 0
		&& above_hp_pct(shot.target, CONFIG.combat.mark_min_hp_pct)
		&& shot_affordable(shot, "huntersmark") && skill_pays(mark_value(shot.target), skill_mp_cost("huntersmark"), shot.target);
}

function supershot_wanted(shot) {
	return shot.allowed && CONFIG.combat.use_supershot && shot.ms_super === 0
		&& above_hp_pct(shot.target, supershot_min_hp_pct())
		&& supershot_setup_ready(shot.target)
		&& shot_affordable(shot, "supershot")
		&& (ALL_BOSSES.includes(shot.target.mtype) || skill_pays(supershot_value(shot.target), skill_mp_cost("supershot"), shot.target));
}

function shoot_skill(skill, shot) {
	shot.committed += skill_mp_cost(skill);
	return use_skill(skill, shot.target);
}

function skill_loop() {
	every("skill_loop", { ms: TICK_RATE.skill, kind: "combat", beat: true }, skill_tick);
}

async function skill_tick() {
	if (should_pause_combat_loop()) return 100;
	let next_delay = TICK_RATE.skill;
	try {
		if (!CONFIG.combat.use_hunters_mark && !CONFIG.combat.use_supershot) {
			return 1000;
		}
		if (is_disabled(character)) return 250;

		update_cache();

		const { sorted_by_value, in_range } = cache.targets;
		if (!sorted_by_value.length) return 200;

		const forced = dungeon_focus_target();
		if (forced && !is_in_range(forced)) return 100;
		const focus = farm_focus();
		const target = forced
			? forced
			: focus && is_in_range(focus) ? focus
			: (dungeon_flag("single_target") ? in_range[0] : sorted_by_value[0]);
		if (!target || !is_in_range(target)) return 100;

		if (cache.heal_target || mainhand_intent() === "cupid") return 100;

		const ms_hunter = ms_to_next_skill("huntersmark");
		const ms_super = ms_to_next_skill("supershot");
		const min_ms = Math.min(ms_hunter, ms_super);

		if (ms_super !== 0) _supershot_ready_since = 0;

		if (min_ms === 0) {
			if (_last_sent_target !== target.id) {
				_last_sent_target = target.id;
				change_target(target);
			}

			await run_skills(RANGER_SKILLS, { target, allowed: encounter_allows("skills", target), ms_hunter, ms_super, committed: 0 });
		} else {
			next_delay = min_ms > 200 ? 100 : min_ms > 50 ? 20 : 5;
		}
	} catch (e) {
		catcher(e, "skill_loop");
		next_delay = TICK_RATE.retry;
	}
	return next_delay;
}
