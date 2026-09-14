// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR MOVEMENT — the scorer that puts the warrior where his damage is highest
// --------------------------------------------------------------------------------------------------------------------------------- //

var WARRIOR_POSITION_SCALE = 100;

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

function warrior_reposition_scorer() {
	const primary = cache.target;
	if (!primary || primary.dead) return null;

	const set_name = weapon_set_to_restore();
	if (!set_name) return null;

	const base = set_damage_value(set_name, warrior_weapon_pool(), 1);
	if (base === null || base <= 0) return null;

	const here_targets = cleave_targets_at(character.x, character.y);
	const here_cleave = cleave_contribution(set_name, here_targets);
	const here = base * here_cleave.uptime + here_cleave.dps;
	if (here <= 0) return null;

	const reach = character.range * 0.9;

	return (x, y) => {
		if (Math.hypot(primary.x - x, primary.y - y) > reach) return null;

		const targets = cleave_targets_at(x, y);
		const cleave = cleave_contribution(set_name, targets);
		return ((base * cleave.uptime + cleave.dps) / here) * WARRIOR_POSITION_SCALE;
	};
}

function reposition() {
	orbit_reposition(warrior_reposition_scorer, {
		min_gain: CONFIG.movement.position_min_gain,
		travel_weight: CONFIG.movement.position_travel_weight
	});
}
