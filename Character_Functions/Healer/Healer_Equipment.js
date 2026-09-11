// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

function resolve_healer_loadout() {
	return "luck";
}

function resolve_healer_orb() {
	if (set_available("orb_luck")) return "orb_luck";
	if (set_available("orb")) return "orb";
	return null;
}

var EQUIPMENT_RULES = {
	loadout: { kind: "set", resolve: resolve_healer_loadout },
	gloves:  { kind: "set", resolve: () => "gloves" },
	orb:     { kind: "set", resolve: resolve_healer_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	dryad:      { loadout: "mdef" },
	fireroamer: { loadout: "fireres", orb: "orb_fire" },
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// TEMPORAL SURGE
// --------------------------------------------------------------------------------------------------------------------------------- //

async function check_temporal_surge() {
	if (!CONFIG.equipment.temporal_surge_enabled) return false;

	const now = Date.now();
	if (now - state.last_temporal_surge < 60000) return false;

	// const nearby = Object.values(parent.entities).some(
	// 	e => e.type === "monster" && !e.dead
	// );
	// if (nearby) return false;

	const prev_orb = character.slots.orb ? { name: character.slots.orb.name, level: character.slots.orb.level } : null;

	const token = equip_claim("temporal", EQUIP_PRIORITY.skill);
	if (!token) return false;
	try {
		state.last_equip_time = performance.now();
		if (!await equip_apply(token, "temporal")) return false;
		await use_skill("temporalsurge");
		log("Temporal Surge activated!", "#FFAA00");
		state.last_temporal_surge = Date.now();
		state.last_equip_time = performance.now();

		if (prev_orb) {
			const inv_idx = character.items.findIndex(
				i => i && i.name === prev_orb.name && i.level === prev_orb.level
			);
			if (inv_idx !== -1 && equip_holds(token)) await equip(inv_idx, "orb");
		}
	} finally {
		equip_release(token);
	}

	return true;
}
