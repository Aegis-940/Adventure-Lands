// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALER EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// HEAL POWER — what each loadout actually heals for, read from live stats
// --------------------------------------------------------------------------------------------------------------------------------- //

var HEALER_PROFILE_SETS = ["luck", "single_target", "fireres"];

function live_heal_profile() {
	return {
		heal: character.heal,
		attack: character.attack,
		frequency: character.frequency,
		rpiercing: character.rpiercing,
		int: character.int || 0,
		mp_cost: character.mp_cost
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

function heal_marginals() {
	const base = character.heal;
	const pierce = character.rpiercing;
	const allies = party_allies().filter(ally => ally !== character);

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
	log_msg("debug", `[HEAL] power=${Math.round(id.heal)} attack=${Math.round(id.attack)} output=${id.output} int=${character.int} rpierce=${character.rpiercing}`);
	log_msg(id.agrees ? "debug" : "error", `[HEAL] heal x output/100 = ${Math.round(id.implied)} vs attack ${Math.round(id.attack)} — ${id.agrees ? "identity holds" : "IDENTITY BROKEN"}`);

	for (const name of cache.party_members || []) {
		const ally = name === character.name ? character : get_player(name);
		if (!ally) {
			log_msg("debug", `[HEAL] ${name}: not visible to get_player()`);
			continue;
		}
		const self = name === character.name;
		const poisoned = ally.s.poisoned ? " POISONED" : "";
		log_msg("debug", `[HEAL] ${name}: res=${ally.resistance || 0} heal→${Math.round(heal_delivered(ally, character.heal))} partyheal→${Math.round(heal_delivered(ally, partyheal_base()))}${self ? " (self, no resistance)" : ""}${poisoned}`);
	}

	const m = heal_marginals();
	log_msg("debug", `[HEAL] marginals: +10 rpiercing = ${Math.round(m.per_10_rpiercing)} hp (best ally), 1 int ≤ ${Math.round(m.per_int_ceiling)} hp, self ${Math.round(m.self)} vs worst ally ${m.worst_ally || "none"} ${Math.round(m.worst_delivered)}`);

	for (const name of HEALER_PROFILE_SETS) {
		const value = healer_set_value(name);
		if (value === null) continue;
		log_msg("debug", `[HEAL] set ${name}: ${Math.round(value)} hp/sec delivered${is_set_equipped(name) ? " (worn)" : ""}`);
	}
}

function dungeon_loadout() {
	const attack_set = dungeon_setting("attack_loadout", null);
	const heal_set = dungeon_setting("heal_loadout", null);
	if (!attack_set || !heal_set) return null;

	const wanted = heal_wanted() ? heal_set : attack_set;

	return set_available(wanted) ? wanted : null;
}

function resolve_healer_loadout() {
	if (fight_gear_owned()) return null;
	const in_dungeon_loadout = dungeon_loadout();
	if (in_dungeon_loadout) return in_dungeon_loadout;

	const override = encounter_gear("loadout");
	if (override) return override;

	if (cache.target && CONFIG.combat.all_bosses.includes(cache.target.mtype) && set_available("single_target")) {
		return "single_target";
	}

	const target = cache.heal_target;
	return resolve_weapon_by_value(name => healer_set_value(name, target))
		|| first_available_set(CONFIG.equipment.weapon_sets);
}

function resolve_healer_gloves() {
	if (gold_gear_wanted()) return "gold";
	return encounter_gear("gloves") || "gloves";
}

function resolve_healer_orb() {
	if (panicking || disengaging()) return "panic";

	const dungeon_orb = dungeon_setting("orb", null);
	if (dungeon_orb && set_available(dungeon_orb)) return dungeon_orb;

	if (fight_gear_owned()) return null;
	return encounter_gear("orb") || preferred_orb("orb_luck");
}

function resolve_healer_chest() {
	return fight_gear_owned() ? null : encounter_gear("chest");
}

function resolve_healer_amulet() {
	return fight_gear_owned() ? null : encounter_gear("amulet");
}

function resolve_healer_ring() {
	if (fight_gear_owned()) return null;
	return zap_pull_home() ? "zap_on" : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// FIGHT GEAR — at the bscorpion camp or a tanked boss one rule owns every swapped slot, so each switch is a single equip_batch
// --------------------------------------------------------------------------------------------------------------------------------- //

var _camp_fight_amulet = null;
var _kill_watch = null;

function fight_gear_owned() {
	if (!is_at_bscorpion_farm() && !tank_boss_nearby()) return false;
	return !panicking && !disengaging();
}

function camp_gear_held(entry) {
	const worn = character.slots[entry.slot];
	if (worn && worn.name === entry.item_name) return true;
	return locate_item(entry.item_name) !== -1;
}

function camp_gear_set(name, entries) {
	equipment_sets[name] = entries.filter(camp_gear_held);
	return equipment_sets[name].length ? name : null;
}

function remember_fight_amulet() {
	if (slot_in_flight("amulet") !== undefined) return;
	const worn = character.slots.amulet;
	if (!worn) return;
	const luck_piece = equipment_sets.camp_luck.some(entry =>
		entry.slot === "amulet" && entry.item_name === worn.name && entry.level === (worn.level || 0));
	if (luck_piece) return;
	_camp_fight_amulet = { item_name: worn.name, slot: "amulet", level: worn.level || 0, l: worn.l };
	if (!ITEMS_TO_KEEP.includes(worn.name)) ITEMS_TO_KEEP.push(worn.name);
}

function camp_luck_worn() {
	return equipment_sets.camp_luck.filter(camp_gear_held).every(entry =>
		!!character.slots[entry.slot] && character.slots[entry.slot].name === entry.item_name);
}

function log_camp_kill() {
	const info = find_nearest_bscorpion();
	if (info) {
		_kill_watch = info.entity;
		return;
	}
	if (!_kill_watch) return;
	const target = _kill_watch.target === character.name ? "me" : (_kill_watch.target || "none");
	errlog_count(`bscorpion kill: target ${target}, luck gear ${camp_luck_worn() ? "on" : "off"}`);
	_kill_watch = null;
}

function resolve_healer_fight() {
	const at_camp = is_at_bscorpion_farm();
	if (at_camp) log_camp_kill();
	else _kill_watch = null;

	if (!fight_gear_owned()) return null;
	if (luck_window()) return camp_gear_set("camp_luck_live", equipment_sets.camp_luck);

	remember_fight_amulet();
	const zapping = at_camp;
	const fight = equipment_sets.camp_fight.filter(entry => zapping || entry.item_name !== "zapper");
	return camp_gear_set("camp_fight_live", _camp_fight_amulet ? fight.concat(_camp_fight_amulet) : fight);
}

var EQUIPMENT_RULES = {
	loadout: { kind: "set", resolve: resolve_healer_loadout },
	gloves:  { kind: "set", resolve: resolve_healer_gloves },
	orb:     { kind: "set", resolve: resolve_healer_orb },
	chest:   { kind: "set", resolve: resolve_healer_chest },
	amulet:  { kind: "set", resolve: resolve_healer_amulet },
	ring:    { kind: "set", resolve: resolve_healer_ring },
	fight:   { kind: "set", resolve: resolve_healer_fight },
};

console_api({
	heal_report: "Myras's heal power identity, per-ally delivered heals and marginals, and each set's hp/sec, in the game log",
});
