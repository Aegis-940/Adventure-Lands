// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR MOVEMENT — the scorer that keeps the warrior inside reach of its cluster
// --------------------------------------------------------------------------------------------------------------------------------- //

function warrior_reposition_scorer() {
	if (panicking) return make_distance_from_monsters_scorer();

	const target_mob = cache.cluster_target;
	if (!target_mob || target_mob.dead) return null;

	const reach = character.range * 0.9;
	return (x, y) => {
		if (Math.hypot(target_mob.x - x, target_mob.y - y) > reach) return null;
		return -Math.hypot(character.x - x, character.y - y);
	};
}

function reposition() {
	orbit_reposition(warrior_reposition_scorer);
}
