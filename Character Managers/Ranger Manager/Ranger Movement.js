// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER MOVEMENT — the licence top-up before each tick, and repositioning away from monsters
// --------------------------------------------------------------------------------------------------------------------------------- //

async function ranger_pre_move() {
	if (!CONFIG.equipment.use_licence) return;
	let slot = locate_item("licence");
	const licenced_ms = character.s.licenced?.ms || 0;
	if (slot === -1 && licenced_ms < 5000) {
		await buy("licence");
		slot = locate_item("licence");
	}
	if (licenced_ms < 250 && slot !== -1) {
		await consume(slot);
	}
}

function reposition() {
	orbit_reposition(make_distance_from_monsters_scorer);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CLOSING IN — where a dungeon asks for it, walk to bow range of the best target instead of waiting for one to come
// --------------------------------------------------------------------------------------------------------------------------------- //

var RANGER_STANDOFF = 0.9;

function ranger_close_in() {
	const radius = dungeon_setting("ranged_engage_radius", null);
	if (!radius || cache.targets.in_range.length) return false;

	const target = cache.targets.sorted_by_value.find(mob => distance(character, mob) <= radius);
	if (!target) return false;

	const stand = standoff_point(target, character.range * RANGER_STANDOFF);
	if (!can_move_to(stand.x, stand.y)) return false;
	local_step({ step: stand });
	return true;
}

function ranger_farm_step() {
	if (ranger_close_in()) return;
	default_farm_step();
}
