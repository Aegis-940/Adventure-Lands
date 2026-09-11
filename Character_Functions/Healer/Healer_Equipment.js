// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// HEAL POWER — what each loadout actually heals for, read from live stats
// --------------------------------------------------------------------------------------------------------------------------------- //

var HEALER_WEAPON_SETS = ["luck", "single_target", "fireres"];

function live_heal_profile() {
	return {
		heal: character.heal || 0,
		attack: character.attack || 0,
		frequency: character.frequency || 1,
		rpiercing: character.rpiercing || 0,
		int: character.int || 0,
		mp_cost: character.mp_cost || 0
	};
}

function set_heal_profile(set_name) {
	return is_set_equipped(set_name) ? live_heal_profile() : get_set_profile(set_name);
}

function healer_set_value(set_name, target) {
	const profile = set_heal_profile(set_name);
	if (!profile || !profile.heal) return null;
	const who = target || cache.heal_target || character;
	return heal_delivered(who, profile.heal, profile.rpiercing) * (profile.frequency || 1);
}

function best_healer_weapon_set(target) {
	let best = null;
	let best_value = -Infinity;
	for (const name of HEALER_WEAPON_SETS) {
		if (!set_available(name)) continue;
		const value = healer_set_value(name, target);
		if (value === null || value <= best_value) continue;
		best_value = value;
		best = name;
	}
	return best;
}

function visible_allies() {
	const allies = [];
	for (const name of cache.party_members || []) {
		if (name === character.name) continue;
		const ally = get_player(name);
		if (ally && !ally.rip) allies.push(ally);
	}
	return allies;
}

function heal_marginals() {
	const base = character.heal || 0;
	const pierce = character.rpiercing || 0;
	const allies = visible_allies();

	let best_rpiercing = 0;
	let worst = null;
	let worst_delivered = Infinity;
	for (const ally of allies) {
		const at = heal_delivered(ally, base, pierce);
		best_rpiercing = Math.max(best_rpiercing, heal_delivered(ally, base, pierce + 10) - at);
		if (at < worst_delivered) {
			worst_delivered = at;
			worst = ally;
		}
	}

	return {
		self: heal_delivered(character, base),
		worst_ally: worst ? worst.name : null,
		worst_delivered: worst ? worst_delivered : 0,
		per_10_rpiercing: best_rpiercing,
		per_int_ceiling: character.int ? base / character.int : 0
	};
}

function heal_report() {
	const id = heal_power_identity();
	log(`[HEAL] power=${Math.round(id.heal)} attack=${Math.round(id.attack)} output=${id.output} int=${character.int} rpierce=${character.rpiercing || 0}`, "#33AAFF");
	log(`[HEAL] heal x output/100 = ${Math.round(id.implied)} vs attack ${Math.round(id.attack)} — ${id.agrees ? "identity holds" : "IDENTITY BROKEN"}`, id.agrees ? "#33AAFF" : "#FF5555");

	for (const name of cache.party_members || []) {
		const ally = name === character.name ? character : get_player(name);
		if (!ally) {
			log(`[HEAL] ${name}: not visible to get_player()`, "#999999");
			continue;
		}
		const self = name === character.name;
		const poisoned = ally.s && ally.s.poisoned ? " POISONED" : "";
		log(`[HEAL] ${name}: res=${ally.resistance || 0} heal→${Math.round(heal_delivered(ally, character.heal))} partyheal→${Math.round(heal_delivered(ally, partyheal_base()))}${self ? " (self, no resistance)" : ""}${poisoned}`, "#33AAFF");
	}

	const m = heal_marginals();
	log(`[HEAL] marginals: +10 rpiercing = ${Math.round(m.per_10_rpiercing)} hp (best ally), 1 int ≤ ${Math.round(m.per_int_ceiling)} hp, self ${Math.round(m.self)} vs worst ally ${m.worst_ally || "none"} ${Math.round(m.worst_delivered)}`, "#33AAFF");

	for (const name of HEALER_WEAPON_SETS) {
		const value = healer_set_value(name);
		if (value === null) continue;
		log(`[HEAL] set ${name}: ${Math.round(value)} hp/sec delivered${is_set_equipped(name) ? " (worn)" : ""}`, "#66ccff");
	}
}

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
