// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR SKILLS — warcry, cleave, agitate; started by Warrior.js
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	loop_tick("skill_loop");
	if (should_pause_combat_loop()) return setTimeout(skill_loop, loop_next("skill_loop", 100));
	let next_delay = TICK_RATE.skill;

	try {
		if (is_disabled(character)) {
			return setTimeout(skill_loop, loop_next("skill_loop", 250));
		}

		update_cache();

		const tank = cache.tank_entity;

		if (CONFIG.skills.warcry_enabled && !is_on_cooldown("warcry") && !character.s.warcry
			&& character.mp >= skill_mp_cost("warcry") + panic_mp_reserve()) {
			if (bscorpion_worth_buffing()) {
				try {
					await use_skill("warcry");
				} catch (e) {
					catcher(e, "warcry");
				}
			}
		}

		if (CONFIG.skills.stomp_enabled) {
			try {
				handle_stomp(tank);
			} catch (e) {
				catcher(e, "handle_stomp");
			}
		}

		if (!swing_possible(cache.target)) {
			try {
				if (cleave_ready()) weapon_burst(true, sugar_rush_wanted(), null);
			} catch (e) {
				catcher(e, "cleave");
			}
		}

		if (CONFIG.skills.agitate_enabled && tank && !dungeon_flag("no_agitate")) {
			try {
				await handle_agitate(tank);
			} catch (e) {
				catcher(e, "handle_agitate");
			}
		}

		if (CONFIG.skills.taunt_enabled && tank) {
			try {
				await handle_taunt(tank);
			} catch (e) {
				catcher(e, "handle_taunt");
			}
		}

		// if (CONFIG.skills.charge_enabled && !is_on_cooldown("charge")) {
		// 	await use_skill("charge");
		// }

		// if (CONFIG.skills.hardshell_enabled && !is_on_cooldown("hardshell") && character.hp < CONFIG.skills.hardshell_hp_threshold) {
		// 	await use_skill("hardshell");
		// }

	} catch (e) {
		catcher(e, "skill_loop");
		next_delay = TICK_RATE.retry;
	}

	setTimeout(skill_loop, loop_next("skill_loop", next_delay));
}

var STOMP_SET = "basher";
var STOMP_TANK_HP_PCT = 0.6;

function stomp_weapon_worn() {
	const worn = character.slots.mainhand;
	return !!worn && G.items[worn.name].wtype === G.skills.stomp.wtype;
}

function stomp_weapon_ready() {
	return stomp_weapon_worn() || set_available(STOMP_SET);
}

function stomp_wanted(tank, shell) {
	if (shell) return true;
	if (rime_shell_pending_within(G.skills.stomp.range)) return false;
	if (!tank || tank.rip) return false;
	if (blocker_within(G.skills.stomp.range, must_not_touch)) return false;
	if (!endangered(tank) && tank.hp >= tank.max_hp * STOMP_TANK_HP_PCT) return false;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || e.target !== tank.name) continue;
		if (distance(character, e) <= G.skills.stomp.range) return true;
	}
	return false;
}

function stomp_blocked() {
	const wait = ms_to_next_skill("stomp");
	if (wait !== 0) return `cooldown ${Math.ceil(wait / 1000)}s`;
	if (character.mp < skill_mp_cost("stomp") + panic_mp_reserve()) return "no mp";
	if (character.cc >= COOLDOWNS.cc) return "call cost";
	if (is_disabled(character)) return "disabled";
	if (!stomp_weapon_ready()) return "no basher";
	return null;
}

var _rime_shell_reported = {};

function report_unbroken_shell(shell, reason) {
	if (_rime_shell_reported[shell.id]) return;
	_rime_shell_reported[shell.id] = true;
	errlog_count(`rime shell unbroken: ${reason}`);
	game_log(`Rime Shell on ${shell.name} — cannot stomp: ${reason}`, "#FF4444");
}

function handle_stomp(tank) {
	const casting = rime_shell_casting();
	const shell = casting && distance(character, casting) <= G.skills.stomp.range ? casting : null;
	if (casting && !shell) report_unbroken_shell(casting, `${Math.round(distance(character, casting))}px away`);

	const blocked = stomp_blocked();
	if (blocked) {
		if (shell) report_unbroken_shell(shell, blocked);
		return;
	}
	if (!stomp_wanted(tank, shell)) return;

	if (shell) {
		errlog_count("stomp rime shell");
		game_log(`Stomp — breaking Rime Shell on ${shell.name}`, "#FFA600");
	}

	if (stomp_weapon_worn()) {
		parent.socket.emit("skill", { name: "stomp" });
		parent.next_skill.stomp = new Date(Date.now() + G.skills.stomp.cooldown);
		errlog_count("stomp fired");
		return;
	}

	const restore = chosen_weapon_set();
	if (!restore) return;

	const arm = equip_plan(STOMP_SET);
	if (!arm.ops.length) return;

	const back = equip_plan(restore, arm.shadow);
	if (!back.ops.length) return;

	emit_equip_ops(arm.ops, back.shadow);
	parent.socket.emit("skill", { name: "stomp" });
	emit_equip_ops(back.ops, back.shadow);
	parent.next_skill.stomp = new Date(Date.now() + G.skills.stomp.cooldown);
	errlog_count("stomp swap fired");
	if (!shell) game_log(`Stomp — Myras at ${Math.round(100 * tank.hp / tank.max_hp)}%`, "#FFA600");
}

function cleave_ready() {
	if (!CONFIG.skills.cleave_enabled || dungeon_flag("no_cleave")) return false;
	if (is_at_bscorpion_farm() && character.s[SUGAR_RUSH.status]) return false;
	return ms_to_next_skill("cleave") === 0 && can_cleave();
}

function fire_cleave() {
	parent.socket.emit("skill", { name: "cleave" });
	parent.next_skill.cleave = new Date(Date.now() + G.skills.cleave.cooldown);
	errlog_count("cleave swap fired");
}

var SKILL_BLOCKER_MARGIN = 25;

function blocker_within(range, is_blocker) {
	const reach = range + SKILL_BLOCKER_MARGIN;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (is_blocker(e) && distance(character, e) < reach) return true;
	}
	return false;
}

function can_cleave() {
	if (!CONFIG.equipment.cleave_maps.includes(character.map)) return false;
	if (is_travelling() || is_disabled(character)) return false;
	if (character.cc >= COOLDOWNS.cc) return false;

	const holding_axe = character.slots.mainhand?.name === "bataxe";

	const required_mp = character.mp_cost * 2 + skill_mp_cost("cleave") + 320;
	if (character.mp < required_mp) return false;

	const tank = cache.tank_entity;
	if (!tank) return false;

	const blocked = blocker_within(G.skills.cleave.range, e =>
		CONFIG.combat.cleave_blacklist.includes(e.mtype) || boss_blocks_cleave(e) || must_not_touch(e)
	);
	if (blocked) return false;

	const lone_boss = cache.monsters_in_cleave_range.some(m => CONFIG.combat.cleave_lone_bosses.includes(m.mtype));
	const one_is_enough = holding_axe || is_at_bscorpion_farm() || lone_boss;
	const min_mobs = one_is_enough ? CONFIG.combat.cleave_min_mobs_held : CONFIG.combat.cleave_min_mobs;
	return cache.monsters_in_cleave_range.length >= min_mobs;
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
	if (endangered(tank)) return;
	if (character.mp < skill_mp_cost("agitate") + panic_mp_reserve()) return;
	if (blocker_within(G.skills.agitate.range, e => CONFIG.combat.agitate_blockers.includes(e.mtype) || must_not_touch(e))) return;

	const skill_range = G.skills.agitate.range;
	const nearby_mobs = Object.values(parent.entities).filter(e =>
		e.visible && !e.dead && e.type === "monster" && distance(character, e) <= skill_range
	);

	if (home === "fireroamer" && !is_fireroamer_agitate_safe(nearby_mobs)) return;

	const crabx = nearby_mobs.filter(e => e.mtype === "crabx");
	const untargeted_crabs = crabx.filter(m => !m.target);

	if (crabx.length >= 5 && untargeted_crabs.length === 5) {
		await use_skill("agitate");
		return;
	}

	const other_mobs = nearby_mobs.filter(e =>
		["sparkbot", "jr", "greenjr", "bigbird", home].includes(e.mtype) &&
		!CONFIG.combat.agitate_blacklist.includes(e.mtype)
	);
	const untargeted_other = other_mobs.filter(m => !m.target);

	if (other_mobs.length >= CONFIG.combat.agitate_min_mobs && untargeted_other.length >= CONFIG.combat.agitate_min_mobs && !is_travelling()) {
		if (distance(character, tank) <= 100) await use_skill("agitate");
	}
}

function taunt_wanted(e, tank) {
	if (CONFIG.combat.taunt_ents && e.mtype === "ent") return e.target !== character.name;
	if (!CONFIG.combat.taunt_bosses.includes(e.mtype)) return false;
	if (!e.target || CONFIG.combat.taunt_exempt.includes(e.target)) return false;
	return e.target !== character.name && e.target !== tank.name;
}

async function handle_taunt(tank) {
	if (is_on_cooldown("taunt") || tank.rip) return;
	if (character.mp < skill_mp_cost("taunt") + panic_mp_reserve()) return;
	if (distance(character, tank) > G.skills.absorb.range) return;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.visible) continue;
		if (!taunt_wanted(e, tank) || !is_in_range(e, "taunt")) continue;

		await use_skill("taunt", e.id);
		errlog_count(`taunt ${e.mtype}`);
		game_log(`Taunting ${e.name} off ${e.target}`, "#FFA600");
		return;
	}
}
