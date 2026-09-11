// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR SKILLS — warcry, cleave, agitate; started by Warrior.js
// --------------------------------------------------------------------------------------------------------------------------------- //

var SKILL_LOOP_IDLE_MS = 1000;

function warrior_loop_skills() {
	const skills = [];
	if (CONFIG.skills.warcry_enabled) skills.push("warcry");
	if (CONFIG.skills.cleave_enabled) skills.push("cleave");
	if (CONFIG.skills.agitate_enabled) skills.push("agitate");
	if (CONFIG.skills.taunt_enabled) skills.push("taunt");
	return skills;
}

async function skill_loop() {
	if (should_pause_combat_loop()) return setTimeout(skill_loop, 100);
	let delay = SKILL_LOOP_IDLE_MS;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, 250);
		}

		update_cache();

		const tank = cache.tank_entity;

		if (CONFIG.skills.warcry_enabled && !is_on_cooldown("warcry") && !character.s.warcry
			&& character.mp >= G.skills.warcry.mp + panic_mp_reserve()) {
			if (WARRIOR_TARGET !== "bscorpion" || bscorpion_worth_buffing()) {
				await use_skill("warcry");
			}
		}

		// if (CONFIG.skills.stomp_enabled && tank?.hp < tank?.max_hp * 0.3) {
		// 	await handle_stomp();
		// }

		await handle_aggro_skills(tank);

		// if (CONFIG.skills.taunt_enabled) {
		// 	await handle_taunt();
		// }

		// if (CONFIG.skills.charge_enabled && !is_on_cooldown("charge")) {
		// 	await use_skill("charge");
		// }

		// if (CONFIG.skills.hardshell_enabled && !is_on_cooldown("hardshell") && character.hp < CONFIG.skills.hardshell_hp_threshold) {
		// 	await use_skill("hardshell");
		// }

		const skills = warrior_loop_skills();
		delay = skills.length ? ms_to_next_of(skills) : SKILL_LOOP_IDLE_MS;

	} catch (e) {
		console.error("skill_loop error:", e);
		delay = TICK_RATE.skill;
	}

	setTimeout(skill_loop, delay);
}

async function handle_aggro_skills(tank) {
	const cleave_allowed = CONFIG.skills.cleave_enabled
		&& WARRIOR_TARGET !== "bscorpion"
		&& WARRIOR_TARGET !== "giantspider";
	const agitate_allowed = CONFIG.skills.agitate_enabled
		&& !!tank
		&& WARRIOR_TARGET !== "giantspider";

	if (!cleave_allowed && !agitate_allowed) return;

	const agitate_reach = monsters_within(G.skills.agitate.range);
	const prefer_cleave = agitate_reach.length <= cache.monsters_in_cleave_range.length;

	let cleaved = false;
	if (cleave_allowed && prefer_cleave) cleaved = await handle_cleave();

	if (!cleaved && agitate_allowed) {
		const taunted = await taunt_single(agitate_reach);
		if (!taunted) await handle_agitate(tank);
	}

	if (!cleaved && cleave_allowed && !prefer_cleave) await handle_cleave();
}

async function taunt_single(candidates) {
	if (!CONFIG.skills.taunt_enabled) return false;
	if (candidates.length !== 1) return false;
	if (is_on_cooldown("taunt")) return false;
	if (character.mp < G.skills.taunt.mp + panic_mp_reserve()) return false;

	const target = candidates[0];
	if (target.target === character.name) return false;
	if (!rule_allows_for(CONFIG.combat.monster_rules, target, "agitate")) return false;
	if (!is_in_range(target, "taunt")) return false;

	await use_skill("taunt", target.id);
	return true;
}

async function handle_stomp() {
	if (is_on_cooldown("stomp")) return;
	if (ms_to_next_skill("attack") <= 75) return;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== "basher";
	const now = performance.now();

	const token = equip_claim("stomp-swap", EQUIP_PRIORITY.skill);
	if (!token) return;
	try {
		if (needs_swap && now - state.last_basher_swap > COOLDOWNS.weapon_swap) {
			state.last_basher_swap = now;
			await unequip("offhand");
			if (!await equip_apply(token, "basher")) return;
		}

		await use_skill("stomp");

		if (needs_swap) {
			await equip_apply(token, mob_count() === 1 ? "single" : "aoe");
		}
	} finally {
		equip_release(token);
	}
}

async function handle_cleave() {
	const ms_until_cleave = ms_to_next_skill("cleave");
	if (ms_until_cleave !== 0) return false;
	if (!can_cleave()) return false;

	const mainhand = character.slots?.mainhand?.name;
	const needs_swap = mainhand !== "bataxe";
	const now = performance.now();

	const token = equip_claim("cleave-swap", EQUIP_PRIORITY.skill);
	if (!token) return false;
	try {
		if (now - state.last_cleave_swap > COOLDOWNS.weapon_swap) {
			state.last_cleave_swap = now;
			await unequip("offhand");
			if (!await equip_apply(token, "bataxe")) return false;
		}

		await use_skill("cleave");

		await equip_apply(token, mob_count() === 1 ? "single" : "aoe");
		return true;
	} finally {
		equip_release(token);
	}
}

var EQUIP_PENALTY_MS = 360;
var CLEAVE_ATTACK_HEADROOM_MS = 75;

function cleave_attack_headroom() {
	return character.slots?.mainhand?.name === "bataxe"
		? CLEAVE_ATTACK_HEADROOM_MS
		: EQUIP_PENALTY_MS;
}

function can_cleave() {
	if (!CONFIG.equipment.cleave_maps.includes(character.map)) return false;
	if (is_travelling() || is_disabled(character)) return false;
	if (character.cc >= COOLDOWNS.cc) return false;
	if (ms_to_next_skill("attack") <= cleave_attack_headroom()) return false;

	const required_mp = character.mp_cost * 2 + G.skills.cleave.mp + 320;
	if (character.mp < required_mp) return false;

	const tank = cache.tank_entity;
	if (!tank) return false;

	const low_boss = Object.values(parent.entities).find(e =>
		e?.type === "monster" &&
		CONFIG.combat.all_bosses.includes(e.mtype) &&
		!e.dead &&
		e.hp < CONFIG.equipment.boss_hp_thresholds[e.mtype]
	);
	if (low_boss) return false;

	const in_range = cache.monsters_in_cleave_range;

	if (!rule_allows(cache.cleave_rules, "cleave")) return false;

	if (in_range.length === 1 && can_kill_in_one_shot(in_range[0])) return false;

	const new_aggro = in_range.filter(e => !e.target && !can_kill_in_one_shot(e, "cleave"));
	if (new_aggro.length > CONFIG.combat.cleave_max_new_aggro) return false;

	return in_range.length >= CONFIG.combat.cleave_min_mobs;
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
	if (character.mp < G.skills.agitate.mp + panic_mp_reserve()) return;
	if (!rule_allows(cache.agitate_rules, "agitate")) return;

	const skill_range = G.skills.agitate.range;
	const nearby_mobs = Object.values(parent.entities).filter(e =>
		e.visible && !e.dead && e.type === "monster" && distance(character, e) <= skill_range
	);

	if (WARRIOR_TARGET === "fireroamer" && !is_fireroamer_agitate_safe(nearby_mobs)) return;

	const crabx = nearby_mobs.filter(e => e.mtype === "crabx");
	const untargeted_crabs = crabx.filter(m => !m.target);

	if (crabx.length >= 5 && untargeted_crabs.length === 5) {
		await use_skill("agitate");
		return;
	}

	const other_mobs = nearby_mobs.filter(e =>
		["sparkbot", "jr", "greenjr", "bigbird", home].includes(e.mtype) &&
		rule_allows_for(CONFIG.combat.monster_rules, e, "agitate")
	);
	const untargeted_other = other_mobs.filter(m => !m.target);

	if (other_mobs.length >= CONFIG.combat.agitate_min_mobs && untargeted_other.length >= CONFIG.combat.agitate_min_mobs && !is_travelling()) {
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
