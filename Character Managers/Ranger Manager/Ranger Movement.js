// --------------------------------------------------------------------------------------------------------------------------------- //
// RANGER MOVEMENT — the licence top-up before each tick, and repositioning away from monsters
// --------------------------------------------------------------------------------------------------------------------------------- //

async function ranger_pre_move() {
	if (!CONFIG.equipment.use_licence) return;
	let slot = locate_item("licence");
	if (slot === -1 && (character?.s?.licenced?.ms ?? 0) < 5000) {
		await buy("licence");
		slot = locate_item("licence");
	}
	if ((character?.s?.licenced?.ms ?? 0) < 250 && slot !== -1) {
		await consume(slot);
	}
}

function reposition() {
	orbit_reposition(make_distance_from_monsters_scorer);
}
