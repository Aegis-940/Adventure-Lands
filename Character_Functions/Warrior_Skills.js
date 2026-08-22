// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR SKILLS — separate eval closure, loaded right after Warrior_Functions.js.
// Reads/writes that file's var globals (state/cache/CONFIG/equipment_sets) and
// defines skill_loop().
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	if (should_pause_combat_loop()) return setTimeout(skill_loop, 100);
	const delay = TICK_RATE.skill;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const tank = cache.tank_entity;

		// Warcry
		if (CONFIG.skills.warcry_enabled && !is_on_cooldown("warcry") && !character.s.warcry) {
			if (WARRIOR_TARGET !== "bscorpion" || bscorpion_worth_buffing()) {
				await use_skill("warcry");
			}
		}

		// Stomp
		// if (CONFIG.skills.stomp_enabled && tank?.hp < tank?.max_hp * 0.3) {
		// 	await handle_stomp();
		// }

		// Cleave
		if (CONFIG.skills.cleave_enabled && WARRIOR_TARGET !== "bscorpion" && WARRIOR_TARGET !== "giantspider") {
			await handle_cleave();
		}

		// Agitate
		if (CONFIG.skills.agitate_enabled && tank && WARRIOR_TARGET !== "giantspider") {
			await handle_agitate(tank);
		}

		// Taunt
		// if (CONFIG.skills.taunt_enabled) {
		// 	await handle_taunt();
		// }

		// Charge
		// if (CONFIG.skills.charge_enabled && !is_on_cooldown("charge")) {
		// 	await use_skill("charge");
		// }

		// Hardshell
		// if (CONFIG.skills.hardshell_enabled && !is_on_cooldown("hardshell") && character.hp < CONFIG.skills.hardshell_hp_threshold) {
		// 	await use_skill("hardshell");
		// }

	} catch (e) {
		console.error("skill_loop error:", e);
	}

	setTimeout(skill_loop, delay);
}

async function handle_stomp() {
	if (is_on_cooldown("stomp")) return;
	if (ms_to_next_skill("attack") <= 75) return;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== "basher";
	const now = performance.now();

	// Blocks resolve_equipment() (Shared/Party_And_Loot.js) from racing this temporary
	// weapon swap and yanking gear mid-sequence.
	lock_gear();
	try {
		if (needs_swap && now - state.last_basher_swap > COOLDOWNS.weapon_swap) {
			state.last_basher_swap = now;
			await unequip("offhand");
			await batch_equip(equipment_sets.basher);
		}

		await use_skill("stomp");

		if (needs_swap) {
			const target_set = mob_count() === 1 ? "single" : "aoe";
			await batch_equip(equipment_sets[target_set]);
		}
	} finally {
		unlock_gear();
	}
}

async function handle_cleave() {
	const ms_until_cleave = ms_to_next_skill("cleave");
	if (ms_until_cleave !== 0) return;
	if (!can_cleave()) return;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== "bataxe";
	const now = performance.now();

	// Blocks resolve_equipment() (Shared/Party_And_Loot.js) from racing this temporary
	// weapon swap and yanking gear mid-sequence.
	lock_gear();
	try {
		if (now - state.last_cleave_swap > COOLDOWNS.weapon_swap) {
			state.last_cleave_swap = now;
			await unequip("offhand");
			await batch_equip(equipment_sets.bataxe);
		}

		await use_skill("cleave");

		const target_set = mob_count() === 1 ? "single" : "aoe";
		await batch_equip(equipment_sets[target_set]);
	} finally {
		unlock_gear();
	}
}

function can_cleave() {
	// Fast checks first
	if (!CONFIG.equipment.cleave_maps.includes(character.map)) return false;
	if (smart.moving || is_disabled(character)) return false;
	if (character.cc >= COOLDOWNS.cc) return false;
	if (ms_to_next_skill("attack") <= 75) return false;

	const required_mp = character.mp_cost * 2 + G.skills.cleave.mp + 320;
	if (character.mp < required_mp) return false;

	const tank = cache.tank_entity;
	if (!tank) return false;

	// Don't cleave if low boss exists
	const low_boss = Object.values(parent.entities).find(e =>
		e?.type === "monster" &&
		CONFIG.combat.all_bosses.includes(e.mtype) &&
		!e.dead &&
		e.hp < CONFIG.equipment.boss_hp_thresholds[e.mtype]
	);
	if (low_boss) return false;

	// Don't cleave if a blacklisted monster is in AoE range
	const blacklisted_nearby = cache.monsters_in_cleave_range.some(e =>
		CONFIG.combat.cleave_blacklist.includes(e.mtype)
	);
	if (blacklisted_nearby) return false;

	return cache.monsters_in_cleave_range.length >= CONFIG.combat.cleave_min_mobs;
}

function is_fireroamer_agitate_safe(nearby_mobs) {
	const cond = CONFIG.combat.agitate_fireroamer_conditions;

	const healer = get_player("Myras");
	const ranger = get_player("Riva");

	if (!healer || healer.rip) return false;
	if (!ranger || ranger.rip) return false;

	if (healer.hp / healer.max_hp < cond.healer_hp_pct) return false;
	if (healer.mp / healer.max_mp < cond.healer_mp_pct) return false;
	if (ranger.hp / ranger.max_hp < cond.ranger_hp_pct) return false;
	if (character.hp / character.max_hp < cond.warrior_hp_pct) return false;
	if (nearby_mobs.length > cond.max_mobs_in_range) return false;

	return true;
}

async function handle_agitate(tank) {
	if (is_on_cooldown("agitate") || !tank || tank.rip) return;

	const skill_range = G.skills.agitate.range;
	const nearby_mobs = Object.values(parent.entities).filter(e =>
		e.visible && !e.dead && e.type === "monster" && distance(character, e) <= skill_range
	);

	// Fireroamer is high-risk: only agitate when party-safety conditions hold
	if (WARRIOR_TARGET === "fireroamer" && !is_fireroamer_agitate_safe(nearby_mobs)) return;

	const crabx = nearby_mobs.filter(e => e.mtype === "crabx");
	const untargeted_crabs = crabx.filter(m => !m.target);

	// Crabx priority
	if (crabx.length >= 5 && untargeted_crabs.length === 5) {
		await use_skill("agitate");
		return;
	}

	// Other mobs
	const other_mobs = nearby_mobs.filter(e =>
		["sparkbot", "jr", "greenjr", "bigbird", home].includes(e.mtype) &&
		!CONFIG.combat.agitate_blacklist.includes(e.mtype)
	);
	const untargeted_other = other_mobs.filter(m => !m.target);

	if (other_mobs.length >= CONFIG.combat.agitate_min_mobs && untargeted_other.length >= CONFIG.combat.agitate_min_mobs && !smart.moving) {
		const needs_protecting = ["porcupine", "redfairy"];
		const nearby_threat = needs_protecting.some(type => {
			const target = get_nearest_monster({ type });
			return target && is_in_range(target, "agitate");
		});

		if (!nearby_threat && distance(character, tank) <= 100) {
			await use_skill("agitate");
		}
	}
}

async function handle_taunt() {
	if (is_on_cooldown("taunt")) return;
	if (!CONFIG.combat.taunt_ents) return;

	const skill_range = G.skills.taunt.range;
	const ents = Object.values(parent.entities).filter(e =>
		e.type === "monster" &&
		e.mtype === "ent" &&
		e.target !== character.name &&
		e.visible &&
		!e.dead &&
		distance(character, e) <= skill_range
	);

	for (const ent of ents) {
		if (is_in_range(ent, "taunt")) {
			await use_skill("taunt", ent.id);
			game_log(`Taunting ${ent.name}`, "#FFA600");
			break;
		}
	}
}

// Started here, not in Warrior_Functions.js: that file's eval finishes before this
// one loads, so calling skill_loop() from there would throw ReferenceError.
skill_loop();
