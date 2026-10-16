// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER COMBAT — what is worth shooting, the target cache, and the action loop
// --------------------------------------------------------------------------------------------------------------------------------- //

function should_attack_mob(mob) {
	if (!mob || mob.dead) return false;

	if (!encounter_allows("attack", mob)) return false;
	if (!safe_to_touch(mob, character.explosion || 0)) return false;

	if (encounter_rank(mob) > 0) return true;

	if (CONFIG.combat.always_attack.includes(mob.mtype) || encounter_trait("always_attack", mob)) return true;

	const aggroed = !CONFIG.combat.engage_aggroed_only || !!mob.target;

	if (encounter_trait("attack_if_targeted", mob)) return aggroed;

	if (parent.S[mob.mtype]?.live) return true;

	if (dungeon_flag("aggroed_only")) return aggroed;

	if (dungeon_target_whitelist()) return true;

	return CONFIG.combat.target_priority.includes(mob.target);
}

function update_cache() {
	if (cache.is_valid()) return;
	const now = performance.now();
	sample_set_profiles(CONFIG.equipment.weapon_sets);
	cache.targets = update_target_cache();
	cache.heal_target = find_cupid_target();
	cache.last_update = now;
}

function update_target_cache() {
	const pool = monsters_matching({ where: should_attack_mob });

	const context = {
		explosion: character.explosion || 0,
		party_factor: CONFIG.combat.party_dps_factor
	};

	const value = new Map();
	for (const mob of pool) value.set(mob, target_damage_value(mob, context));

	const sorted_by_value = pool.sort((a, b) => {
		const a_rank = encounter_rank(a);
		const b_rank = encounter_rank(b);
		if (a_rank !== b_rank) return b_rank - a_rank;

		const a_boss = CONFIG.combat.always_attack.includes(a.mtype) || !!encounter_trait("always_attack", a);
		const b_boss = CONFIG.combat.always_attack.includes(b.mtype) || !!encounter_trait("always_attack", b);
		if (a_boss !== b_boss) return b_boss - a_boss;

		const a_priority = !!encounter_trait("attack_if_targeted", a);
		const b_priority = !!encounter_trait("attack_if_targeted", b);
		if (a_priority !== b_priority) return b_priority - a_priority;

		return value.get(b) - value.get(a);
	});
	shelled_first(sorted_by_value);

	const engage_radius = dungeon_engage_radius(null);
	const within_range = engage_radius
		? mob => is_in_range(mob) && parent.distance(character, mob) <= engage_radius
		: mob => is_in_range(mob);

	const in_range = dungeon_sort_targets(sorted_by_value.filter(within_range));

	return { sorted_by_value, in_range };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MANA / DAMAGE EFFICIENCY
// --------------------------------------------------------------------------------------------------------------------------------- //

var SHOT_PROFILES = [
	{ name: "attack", count: 1, multiplier: 1.0 },
	{ name: "3shot", count: 3, multiplier: 0.7 },
	{ name: "5shot", count: 5, multiplier: 0.5 },
	{ name: "piercingshot", count: 1, multiplier: 0.75, single: true, pierces: true },
];

function shot_mana(profile) {
	return profile.name === "attack" ? character.mp_cost : skill_mp_cost(profile.name);
}

function shot_usable(profile) {
	return character.level >= (G.skills[profile.name].level || 0);
}

function shot_apiercing(profile) {
	const base = 2 * (character.apiercing || 0);
	if (!profile.pierces) return base;
	return base + (G.skills[profile.name].apiercing || 0);
}

function armour_factor(mob, apiercing) {
	return damage_multiplier((mob.armor || 0) - apiercing);
}

function burn_multiplier(mob, skill_multiplier) {
	if (!CONFIG.combat.burn_enabled) return 1;
	if (would_kill(mob, skill_multiplier)) return 1;

	const dps = (character.attack || 0) * (character.frequency || 1);
	return burn_multiplier_at_dps(mob, worn_ability_chance("burn"), dps, CONFIG.combat.party_dps_factor, { hp: remaining_hp(mob) });
}

function target_modifier(mob, skill_multiplier, apiercing) {
	const pierce = apiercing === undefined ? shot_apiercing(SHOT_PROFILES[0]) : apiercing;
	const explosion = character.explosion || 0;
	if (explosion > 0) {
		const hit = (character.attack || 0) * skill_multiplier * armour_factor(mob, pierce);
		return 1 + splash_bonus(mob, explosion, hit);
	}
	return burn_multiplier(mob, skill_multiplier);
}

function model_prediction() {
	const target = cache.targets && cache.targets.in_range && cache.targets.in_range[0];
	if (!target) return null;

	const explosion = character.explosion || 0;

	return {
		splash: explosion > 0 ? splash_bonus(target, explosion, 0) : 0,
		burn: burn_multiplier(target, 1)
	};
}

function lambda_bounds() {
	const ladder = SHOT_PROFILES.filter(p => !p.pierces).sort((a, b) => shot_mana(a) - shot_mana(b));

	let cheapest = Infinity;
	let dearest = 0;
	for (let i = 1; i < ladder.length; i++) {
		const extra_damage = ladder[i].count * ladder[i].multiplier - ladder[i - 1].count * ladder[i - 1].multiplier;
		const extra_mana = shot_mana(ladder[i]) - shot_mana(ladder[i - 1]);
		if (extra_mana <= 0 || extra_damage <= 0) continue;
		const rate = extra_damage / extra_mana;
		if (rate < cheapest) cheapest = rate;
		if (rate > dearest) dearest = rate;
	}

	if (!isFinite(cheapest) || dearest <= 0) return { lo: 0.002, hi: 0.012 };
	return {
		lo: cheapest * CONFIG.combat.lambda_headroom_low,
		hi: dearest * CONFIG.combat.lambda_headroom_high,
	};
}

function mana_price() {
	const reserve = panic_mp_reserve();
	const usable = Math.max(0, Math.min(1, (character.mp - reserve) / Math.max(1, character.max_mp - reserve)));
	const { lo, hi } = lambda_bounds();
	return hi - (hi - lo) * usable;
}

function shot_stealable_damage(mobs, profile, hits, apiercing) {
	const explosion = character.explosion || 0;
	let total = 0;
	for (let i = 0; i < hits; i++) {
		const hit = (character.attack || 0) * profile.multiplier * armour_factor(mobs[i], apiercing);
		total += explosion > 0 ? hit * (1 + splash_bonus(mobs[i], explosion, hit)) : hit;
	}
	return total;
}

function manasteal_rebate(mobs, profile, hits, apiercing) {
	const steal = (character.manasteal || 0) / 100;
	if (steal <= 0) return 0;
	return steal * shot_stealable_damage(mobs, profile, hits, apiercing);
}

function score_option(mobs, profile, mana, lambda, reference) {
	const hits = Math.min(profile.count, mobs.length);
	if (!hits) return null;

	const apiercing = shot_apiercing(profile);
	let damage = 0;
	for (let i = 0; i < hits; i++) {
		damage += target_modifier(mobs[i], profile.multiplier, apiercing) * armour_factor(mobs[i], apiercing);
	}
	damage *= profile.multiplier / reference;

	const net = lambda > 0 ? Math.max(0, mana - manasteal_rebate(mobs, profile, hits, apiercing)) : mana;
	return { damage, mana, net, hits, score: damage - lambda * net };
}

function mana_free() {
	return CONFIG.combat.mana_is_free && set_available(CONFIG.equipment.chest_sets.mana);
}

function choose_attack_option(primary) {
	const lambda = mana_free() ? 0 : mana_price();
	if (!primary.length) return null;

	const base_apiercing = shot_apiercing(SHOT_PROFILES[0]);
	const reference = (target_modifier(primary[0], 1, base_apiercing) * armour_factor(primary[0], base_apiercing)) || 1;
	const options = [];

	for (const profile of SHOT_PROFILES) {
		if (!shot_usable(profile)) continue;
		const scored = score_option(primary, profile, shot_mana(profile), lambda, reference);
		if (scored) options.push({ name: profile.name, single: !!profile.single, targets: primary.slice(0, scored.hits), ...scored });
	}

	const affordable = options.filter(o => character.mp >= o.mana + panic_mp_reserve());
	if (affordable.length) return affordable.reduce((best, o) => (o.score > best.score ? o : best));

	if (character.mp >= Math.max(100, panic_mp_reserve())) {
		return options.find(o => o.name === "attack") || null;
	}
	return null;
}

var _cupid_engaged = false;

function cupid_blocked() {
	return !set_available("heal") || encounter_gear("weapon") !== null;
}

function find_cupid_target() {
	if (cupid_blocked()) {
		_cupid_engaged = false;
		return null;
	}

	const healer = get_entity("Myras");
	const healer_up = healer && !healer.rip;

	if (healer_up && healer.mp / healer.max_mp >= CONFIG.combat.cupid_healer_mp_pct) {
		_cupid_engaged = false;
		return null;
	}

	const engage = healer_up
		? CONFIG.combat.cupid_engage_pct
		: CONFIG.combat.cupid_engage_pct_no_healer;
	const release = Math.min(1, engage + CONFIG.combat.cupid_release_margin);
	const party = Object.keys(get_party() || {});

	let target = null, min_pct = 1;

	for (const name of party) {
		if (name === character.name) continue;
		const ally = get_player(name);
		if (ally && !ally.rip && is_in_range(ally)) {
			const pct = ally.hp / ally.max_hp;
			if (pct < min_pct) { min_pct = pct; target = ally; }
		}
	}

	_cupid_engaged = _cupid_engaged ? min_pct < release : min_pct < engage;
	return _cupid_engaged ? target : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ACTION LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function cupid_heal(target) {
	try {
		await attack(target);
	} catch (e) {
		if (e && e.reason === "no_pvp") {
			errlog_count("cupid heal raced the bow swap");
			return;
		}
		throw e;
	}
}

var RANGER_ACTION = { ms: 5, gate: "combat", before: () => camp_temporal_surge(), act: ranger_action };

function action_loop() {
	start_action_loop(RANGER_ACTION);
}

function ranger_action(ms) {
	if (ms !== 0 || travel_blocks_combat() || basic_action_busy()) return next_action_delay(ms);
	const cupid_live = mainhand_intent() === "cupid";
	const want_heal = !!cache.heal_target;
	if (want_heal && character.slots.mainhand?.name === "cupid" && cupid_live) run_basic_action(cupid_heal(cache.heal_target), "cupid", cache.heal_target);
	else if (!want_heal && !cupid_live) handle_attack();
	else return next_action_delay(ms);
}

function coop_boss_only(in_range) {
	const boss = in_range.find(is_coop_boss);
	if (!boss) return in_range;
	if (!takes_one_damage(boss)) return [boss];
	return [boss, ...in_range.filter(m => m !== boss)];
}

function handle_attack() {
	const { sorted_by_value, in_range } = cache.targets;
	if (!sorted_by_value.length) return;

	const single_target_mode = dungeon_flag("single_target");

	if (single_target_mode) {
		if (character.mp < Math.max(100, panic_mp_reserve())) return;
		const forced = dungeon_focus_target();
		if (forced) {
			if (!is_in_range(forced)) return;
			return run_basic_action(attack(forced), "attack", forced);
		}
		if (!in_range.length) return;
		return run_basic_action(attack(in_range[0]), "attack", in_range[0]);
	}

	const shelled = rime_shell_casting();
	const choice = shelled && in_range.includes(shelled)
		? choose_shell_shot(shelled, in_range)
		: choose_attack_option(coop_boss_only(in_range));
	if (!choice) return;

	if (choice.name === "attack") return run_basic_action(attack(choice.targets[0]), "attack", choice.targets[0]);
	if (choice.single) return run_basic_action(use_skill(choice.name, choice.targets[0]), choice.name, choice.targets[0]);
	return run_basic_action(use_skill(choice.name, choice.targets.map(e => e.id)), choice.name, choice.targets[0]);
}

