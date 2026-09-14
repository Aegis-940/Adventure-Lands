// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR EQUIPMENT RULES — consumed by the shared resolve_equipment()/equipment_manager_loop()
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// CLEAVE — what the axe swap costs and pays, used by the reposition scorer
// --------------------------------------------------------------------------------------------------------------------------------- //

function cleave_period() {
	const cooldown = (G.skills.cleave.cooldown || 1200) / 1000;
	const spare = Math.max(0, CONFIG.equipment.mana_income_per_sec - character.mp_cost * (character.frequency || 1));
	const budget = spare * (1 - CONFIG.equipment.skill_mana_reserve);
	if (budget <= 0) return Infinity;
	return Math.max(cooldown, G.skills.cleave.mp / budget);
}

function cleave_contribution(set_name, targets) {
	const axe = get_set_profile("bataxe");
	if (!axe || !axe.attack || !targets) return { dps: 0, uptime: 1 };

	const period = cleave_period();
	if (!isFinite(period)) return { dps: 0, uptime: 1 };

	const dps = (0.5 * axe.attack * targets) / period;
	if (set_name === "bataxe") return { dps, uptime: 1 };

	const swap_s = (CONFIG.equipment.cleave_swap_ms || 480) / 1000;
	return { dps, uptime: Math.max(0, 1 - swap_s / period) };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WEAPON — the mobs a set is valued against, and the rule the shared resolver runs
// --------------------------------------------------------------------------------------------------------------------------------- //

function attackable_monsters() {
	const reach = character.range;
	return (cache.monsters_in_cleave_range || []).filter(e =>
		e && !e.dead && distance(character, e) <= reach
	);
}

function warrior_weapon_pool() {
	const pool = attackable_monsters();
	if (pool.length) return pool;
	return cache.target ? [cache.target] : [];
}

function weapon_choice_context() {
	return () => ({
		cleave_targets: (cache.monsters_in_cleave_range || []).length,
		cleave_period: +cleave_period().toFixed(2),
		mob: cache.target ? cache.target.mtype : null
	});
}

function model_prediction() {
	const target = cache.target;
	if (!target) return null;

	const explosion = character.explosion || 0;
	const raw_dps = (character.attack || 0) * (character.frequency || 1);

	return {
		splash: explosion > 0 ? splash_bonus(target, explosion, 0) : 0,
		burn: burn_multiplier_at_dps(
			target, worn_ability_chance("burn"), raw_dps,
			CONFIG.combat.party_dps_factor, { hp: target.hp }
		)
	};
}

function resolve_warrior_orb() {
	return preferred_orb("orb_dps");
}

function resolve_warrior_weapon() {
	return resolve_weapon_set({ pool: warrior_weapon_pool(), width: 1, context: weapon_choice_context() });
}

var EQUIPMENT_RULES = {
	weapon: { kind: "set", resolve: resolve_warrior_weapon },
	orb:    { kind: "set", resolve: resolve_warrior_orb },
};

var MONSTER_GEAR_OVERRIDES = {
	bscorpion: { weapon: "single" },
};
