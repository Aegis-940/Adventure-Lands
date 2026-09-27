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
