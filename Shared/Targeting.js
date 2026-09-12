// --------------------------------------------------------------------------------------------------------------------------------- //
// TARGETING — one scorer for every character; eligibility stays with each character, value is shared
// --------------------------------------------------------------------------------------------------------------------------------- //

function attack_damage_against(mob) {
	const amp = 1 + ((mob.incdmgamp || 0) / 100);
	return estimate_my_damage(mob) * amp;
}

function splash_landed_on_neighbours(mob, explosion, hit_damage) {
	if (!explosion || !hit_damage) return 0;

	const radius = explosion_radius(explosion);
	let total = 0;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead) continue;
		if (e === mob || e.id === mob.id) continue;
		if (distance(e, mob) > radius) continue;

		const dealt = hit_damage * (explosion / 100) * defense_reduction(e.armor || 0);
		total += Math.min(dealt, e.hp || 0);
	}
	return total;
}

function target_damage_value(mob, options) {
	const opts = options || {};
	const explosion = opts.explosion === undefined ? (character.explosion || 0) : opts.explosion;
	const party_factor = opts.party_factor || 1;

	const hit = attack_damage_against(mob);
	if (hit <= 0) return 0;

	const direct = Math.min(hit, mob.hp || 0);
	const burn = burn_multiplier_at_dps(
		mob, worn_ability_chance("burn"), hit * (character.frequency || 1), party_factor
	);

	return direct * burn + splash_landed_on_neighbours(mob, explosion, hit);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TERMS — each returns a raw number; the selector normalises them across the pool before weighting
// --------------------------------------------------------------------------------------------------------------------------------- //

var TARGET_TERMS = {
	damage: (mob, ctx) => target_damage_value(mob, ctx),

	finish: mob => (attack_damage_against(mob) >= (mob.hp || 0) ? 1 : 0),

	untargeted: mob => (mob.target ? 0 : 1),

	protects: (mob, ctx) => ((ctx.protect || []).includes(mob.target) ? 1 : 0),

	wounded: mob => (mob.max_hp ? 1 - (mob.hp || 0) / mob.max_hp : 0),

	healthy: mob => (mob.max_hp ? (mob.hp || 0) / mob.max_hp : 0),

	hp_low: mob => -(mob.hp || 0),

	hp_high: mob => (mob.hp || 0),

	close: mob => -distance(character, mob),
};

function normalise(values) {
	let lo = Infinity;
	let hi = -Infinity;
	for (const v of values) {
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	const span = hi - lo;
	if (!isFinite(span) || span <= 0) return values.map(() => 0);
	return values.map(v => (v - lo) / span);
}

function score_targets(pool, weights, context) {
	const ctx = context || {};
	const names = Object.keys(weights).filter(n => weights[n] && TARGET_TERMS[n]);

	const columns = {};
	for (const name of names) {
		columns[name] = normalise(pool.map(mob => TARGET_TERMS[name](mob, ctx)));
	}

	return pool.map((mob, i) => {
		let score = 0;
		const parts = {};
		for (const name of names) {
			const contribution = weights[name] * columns[name][i];
			parts[name] = contribution;
			score += contribution;
		}
		return { mob, score, parts };
	}).sort((a, b) => b.score - a.score);
}

function select_target(pool, weights, context) {
	if (!pool || !pool.length) return null;
	if (pool.length === 1) return pool[0];

	const scored = score_targets(pool, weights, context);
	sample_target_choice(scored, context, weights);
	return scored[0].mob;
}

function best_target(args, weights, context) {
	return select_target(monsters_matching(args), weights, context);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SAMPLING — read the decision rather than infer it from behaviour
// --------------------------------------------------------------------------------------------------------------------------------- //

var TARGET_SAMPLE_MS = 5000;
var _last_target_sample = 0;

function sample_target_choice(scored, context, weights) {
	if (!weights || !weights.damage) return;
	if (!CONFIG.combat?.sample_targets || typeof errlog_sample !== "function") return;
	if (!scored || scored.length < 2) return;

	const now = Date.now();
	if (now - _last_target_sample < TARGET_SAMPLE_MS) return;
	_last_target_sample = now;

	const top = scored[0];
	const next = scored[1];

	errlog_sample("target_choice", {
		pool: scored.length,
		mob: top.mob.mtype,
		chosen_score: +top.score.toFixed(3),
		runner_up_score: +next.score.toFixed(3),
		parts: Object.keys(top.parts).reduce((o, k) => (o[k] = +top.parts[k].toFixed(3), o), {}),
		chosen_hp_pct: top.mob.max_hp ? +((top.mob.hp || 0) / top.mob.max_hp).toFixed(2) : 0,
		chosen_value: Math.round(target_damage_value(top.mob, context || {})),
		best_value: Math.round(Math.max(...scored.map(s => target_damage_value(s.mob, context || {}))))
	});
}
