// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR MOVEMENT — the scorer that puts the warrior where his damage is highest
// --------------------------------------------------------------------------------------------------------------------------------- //

var WARRIOR_POSITION_SCALE = 100;

var _position_probe = null;

function cleave_targets_at(x, y) {
	const radius = G.skills.cleave.range;
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead || !e.visible) continue;
		if (CONFIG.combat.cleave_blacklist.includes(e.mtype)) continue;
		if (Math.hypot(e.x - x, e.y - y) <= radius) count++;
	}
	return count;
}

function warrior_position_set() {
	if (_weapon_choice.name) return _weapon_choice.name;
	for (const name of CONFIG.equipment.weapon_sets) {
		if (set_available(name)) return name;
	}
	return null;
}

function warrior_reposition_scorer() {
	_position_probe = null;

	const primary = cache.target;
	if (!primary || primary.dead) return null;

	const set_name = warrior_position_set();
	if (!set_name) return null;

	const base = warrior_set_base_value(set_name, primary);
	if (base === null || base <= 0) return null;

	const here_targets = cleave_targets_at(character.x, character.y);
	const here_cleave = cleave_contribution(set_name, here_targets);
	const here = base * here_cleave.uptime + here_cleave.dps;
	if (here <= 0) return null;

	const reach = character.range * 0.9;
	_position_probe = {
		set: set_name,
		here_targets,
		best_targets: here_targets,
		best_score: WARRIOR_POSITION_SCALE,
		in_reach: 0
	};

	return (x, y) => {
		if (Math.hypot(primary.x - x, primary.y - y) > reach) return null;

		const targets = cleave_targets_at(x, y);
		const cleave = cleave_contribution(set_name, targets);
		const score = ((base * cleave.uptime + cleave.dps) / here) * WARRIOR_POSITION_SCALE;

		_position_probe.in_reach++;
		if (score > _position_probe.best_score) {
			_position_probe.best_score = score;
			_position_probe.best_targets = targets;
		}
		return score;
	};
}

function sample_reposition() {
	const probe = _position_probe;
	const decision = _last_orbit_decision;
	_position_probe = null;
	if (!probe || !decision || !CONFIG.combat.sample_positions || typeof errlog_sample !== "function") return;
	if (probe.best_targets === probe.here_targets) return;

	errlog_sample("position", {
		set: probe.set,
		here_targets: probe.here_targets,
		best_targets: probe.best_targets,
		best_gain_pct: Math.round(probe.best_score - WARRIOR_POSITION_SCALE),
		taken_gain_pct: decision.best_raw - decision.incumbent,
		travel: decision.travel,
		in_reach: probe.in_reach,
		moved: decision.moved && decision.travel > CONFIG.movement.move_threshold
	});
}

function reposition() {
	if (panicking) {
		orbit_reposition(make_distance_from_monsters_scorer);
		return;
	}
	orbit_reposition(warrior_reposition_scorer, {
		min_gain: CONFIG.movement.position_min_gain,
		travel_weight: CONFIG.movement.position_travel_weight
	});
	sample_reposition();
}
