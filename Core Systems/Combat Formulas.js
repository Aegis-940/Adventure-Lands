// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT FORMULAS — the server's damage and heal arithmetic; computes values, acts on nothing
// --------------------------------------------------------------------------------------------------------------------------------- //

function defense_reduction(defense) {
	if (typeof parent.damage_multiplier === "function") return parent.damage_multiplier(defense);

	const d = defense || 0;
	const band = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

	const reduction =
		band(0, 100, d) * 0.00100 +
		band(0, 100, d - 100) * 0.00100 +
		band(0, 100, d - 200) * 0.00095 +
		band(0, 100, d - 300) * 0.00090 +
		band(0, 100, d - 400) * 0.00082 +
		band(0, 100, d - 500) * 0.00070 +
		band(0, 100, d - 600) * 0.00060 +
		band(0, 100, d - 700) * 0.00050 +
		Math.max(0, d - 800) * 0.00040;

	const piercing =
		band(0, 50, -d) * 0.00100 +
		band(0, 50, -50 - d) * 0.00075 +
		band(0, 50, -100 - d) * 0.00050 +
		Math.max(0, -150 - d) * 0.00025;

	return Math.min(1.32, Math.max(0.05, 1 - reduction + piercing));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALING — the server's heal pipeline, which is not the damage pipeline
// --------------------------------------------------------------------------------------------------------------------------------- //

const HEAL_POISON_FACTOR = 0.25;
const HEAL_RESISTANCE_DIVISOR = 2;
const PARTYHEAL_LEVEL_LADDER = [[80, 800], [72, 720], [60, 600], [0, 400]];

function is_self_target(target) {
	return !target || target === character || target.name === character.name;
}

function heal_entity(target) {
	return is_self_target(target) ? character : target;
}

function heal_reduction(target, rpiercing) {
	if (is_self_target(target)) return 1;
	const pierce = rpiercing === undefined ? (character.rpiercing || 0) : rpiercing;
	return defense_reduction(((target.resistance || 0) - pierce) / HEAL_RESISTANCE_DIVISOR);
}

function heal_poison_factor(target) {
	const entity = heal_entity(target);
	return entity && entity.s && entity.s.poisoned ? HEAL_POISON_FACTOR : 1;
}

function heal_delivered(target, base, rpiercing) {
	return (base || 0) * heal_reduction(target, rpiercing) * heal_poison_factor(target);
}

function heal_useful(target, base, rpiercing) {
	const entity = heal_entity(target);
	if (!entity) return 0;
	const deficit = Math.max(0, (entity.max_hp || 0) - (entity.hp || 0));
	return Math.min(heal_delivered(target, base, rpiercing), deficit);
}

function partyheal_base(level) {
	const lvl = level === undefined ? (character.level || 0) : level;
	for (const [floor, base] of PARTYHEAL_LEVEL_LADDER) if (lvl >= floor) return base;
	return 400;
}

function fear_attack_factor(fear) {
	const f = fear === undefined ? (character.fear || 0) : fear;
	if (f > 2) return 0.2;
	if (f > 1) return 0.4;
	if (f) return 0.6;
	return 1;
}

function heal_power_identity() {
	const output = character.output || 100;
	const fear = character.fear || 0;
	const implied = Math.round((character.heal || 0) * output / 100 * fear_attack_factor(fear));
	return {
		heal: character.heal || 0,
		attack: character.attack || 0,
		output,
		fear,
		implied,
		agrees: Math.abs(implied - (character.attack || 0)) <= 2
	};
}

function estimate_my_damage(entity, multiplier) {
	const info = (G.monsters && G.monsters[entity.mtype]) || {};
	const armor = (entity.armor !== undefined ? entity.armor : info.armor || 0) - (character.apiercing || 0);
	return (character.attack || 0) * defense_reduction(armor) * (multiplier === undefined ? 1 : multiplier);
}

function time_to_kill_ms(mob, hp, dps, party_factor, apiercing) {
	if (!mob || !hp || dps <= 0) return Infinity;
	const piercing = apiercing === undefined ? (character.apiercing || 0) : apiercing;
	const armor = (mob.armor || 0) - piercing;
	const effective = dps * defense_reduction(armor) * (party_factor || 1);
	return effective > 0 ? (hp / effective) * 1000 : Infinity;
}

const BURN_DURATION_MS = 5000;

const BURN_TICK_DIVISOR = 5;

function burn_multiplier_at_dps(mob, chance, dps, party_factor, options) {
	if (!chance) return 1;

	const def = G.conditions?.burned;
	if (!def || !def.interval) return 1;

	const opts = options || {};
	const rate = opts.frequency || character.frequency || 1;
	if (rate <= 0) return 1;

	const hp = opts.hp === undefined ? (mob && mob.max_hp) : opts.hp;
	const ttk = mob ? time_to_kill_ms(mob, hp, dps, party_factor, opts.apiercing) : Infinity;
	const window_ms = Math.min(BURN_DURATION_MS, isFinite(ttk) ? ttk : BURN_DURATION_MS);
	if (window_ms <= 0) return 1;

	const attacks = rate * (window_ms / 1000);
	const lit = 1 - Math.pow(1 - chance / 100, attacks);

	const ticks_per_second = 1000 / def.interval;
	return 1 + (lit * ticks_per_second) / (BURN_TICK_DIVISOR * rate);
}

function would_kill(entity, multiplier) {
	if (!entity || entity.dead) return false;
	return estimate_my_damage(entity, multiplier) >= entity.hp;
}

const EXPLOSION_RADIUS_DIVISOR = 3.6;

function explosion_radius(explosion) {
	const intensity = explosion === undefined ? (character.explosion || 0) : explosion;
	return intensity / EXPLOSION_RADIUS_DIVISOR;
}

function splash_bonus(mob, explosion, hit_damage) {
	if (!mob || !explosion) return 0;

	const radius = explosion_radius(explosion);
	let bonus = 0;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead) continue;
		if (e === mob || e.id === mob.id) continue;
		if (distance(e, mob) > radius) continue;

		const share = (explosion / 100) * defense_reduction(e.armor || 0);
		bonus += hit_damage > 0
			? Math.min(share * hit_damage, e.hp || 0) / hit_damage
			: share;
	}
	return bonus;
}
