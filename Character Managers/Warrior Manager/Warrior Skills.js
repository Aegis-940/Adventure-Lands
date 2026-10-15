// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR SKILLS — warcry, cleave, agitate; started by Warrior.js
// --------------------------------------------------------------------------------------------------------------------------------- //

function skill_loop() {
	every("skill_loop", { ms: TICK_RATE.skill, kind: "combat", beat: true }, skill_tick);
}

async function skill_tick() {
	if (should_pause_combat_loop()) return 100;
	let next_delay = TICK_RATE.skill;

	try {
		if (is_disabled(character)) {
			return 250;
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

	return next_delay;
}

var STOMP_SET = "basher";
var STOMP_TANK_HP_PCT = 0.35;

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
	if (tank.hp >= tank.max_hp * STOMP_TANK_HP_PCT) return false;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || e.target !== tank.name) continue;
		if (distance(character, e) <= G.skills.stomp.range) return true;
	}
	return false;
}

function stomp_blocked(mp_reserve) {
	const wait = ms_to_next_skill("stomp");
	if (wait !== 0) return `cooldown ${Math.ceil(wait / 1000)}s`;
	if (character.mp < skill_mp_cost("stomp") + mp_reserve) return "no mp";
	if (character.cc >= COOLDOWNS.cc) return "call cost";
	if (is_disabled(character)) return "disabled";
	if (!stomp_weapon_ready()) return "no basher";
	return null;
}

function handle_stomp(tank) {
	rime_stomp_overdue_check("skill loop");
	publish_stomp_ready();
	log_new_shells();
	close_shell_windows();
	const casting = rime_shell_casting();
	const shell = casting && distance(character, casting) <= G.skills.stomp.range ? casting : null;
	if (casting && !shell && !rime_stomp_planned()) report_unbroken_shell(casting, `${Math.round(distance(character, casting))}px away`);

	const planned = !!shell && rime_stomp_planned();
	const blocked = stomp_blocked(shell ? 0 : panic_mp_reserve());
	if (blocked) {
		if (shell && !planned) report_unbroken_shell(shell, blocked);
		return;
	}
	if (shell && (planned || oldest_shell_age() < RIME_SHELL_STOMP_DELAY_MS)) return;
	if (!stomp_wanted(tank, shell) || !fire_stomp()) return;
	publish_stomp_ready();
	write_state_cache();

	if (shell) {
		mark_shells_stomped();
		errlog_count("stomp rime shell");
		errlog_timeline("rime_watch", `stomp on shell ${shell.id}, ${Math.round(oldest_shell_age())}ms in`);
		game_log(`Stomp — breaking Rime Shell on ${shell.name}`, "#FFA600");
	} else {
		game_log(`Stomp — Myras at ${Math.round(100 * tank.hp / tank.max_hp)}%`, "#FFA600");
	}
}

function fire_stomp() {
	if (stomp_weapon_worn()) {
		send_stomp();
		errlog_count("stomp fired");
		return true;
	}

	const restore = chosen_weapon_set();
	if (!restore) return false;

	const arm = equip_plan(STOMP_SET);
	if (!arm.ops.length || !equip_plan(restore, arm.shadow).ops.length) return false;

	if (!equip_burst({ owner: "stomp", priority: EQUIP_PRIORITY.panic, arm: STOMP_SET, between: send_stomp, restore: chosen_weapon_set })) return false;
	errlog_count("stomp swap fired");
	return true;
}

function send_stomp() {
	parent.socket.emit("skill", { name: "stomp" });
	parent.next_skill.stomp = new Date(Date.now() + G.skills.stomp.cooldown);
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
		!encounter_allows("cleave", e) || boss_blocks_cleave(e) || must_not_touch(e)
	);
	if (blocked) return false;

	const boss = pursued_boss();
	if (boss && !cache.monsters_in_cleave_range.includes(boss)) return false;

	const lone_boss = cache.monsters_in_cleave_range.some(m => encounter_trait("cleave_alone", m));
	const one_is_enough = holding_axe || is_at_bscorpion_farm() || lone_boss;
	const min_mobs = one_is_enough ? CONFIG.combat.cleave_min_mobs_held : CONFIG.combat.cleave_min_mobs;
	return cache.monsters_in_cleave_range.length >= min_mobs;
}

function agitate_conditions_met(cond, nearby_mobs) {
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
	if (blocker_within(G.skills.agitate.range, e => !encounter_allows("agitate", e) || must_not_touch(e) || kite_ring(e))) return;

	const skill_range = G.skills.agitate.range;
	const nearby_mobs = Object.values(parent.entities).filter(e =>
		e.visible && !e.dead && e.type === "monster" && distance(character, e) <= skill_range
	);

	const conditions = encounter_setting("agitate_conditions", null);
	if (conditions && !agitate_conditions_met(conditions, nearby_mobs)) return;

	for (const type of encounter_mtypes("agitate_pack")) {
		const size = encounter_trait("agitate_pack", { mtype: type });
		const pack = nearby_mobs.filter(e => e.mtype === type);
		if (pack.length >= size && pack.filter(m => !m.target).length === size) {
			await use_skill("agitate");
			return;
		}
	}

	const other_mobs = nearby_mobs.filter(e =>
		(e.mtype === home || encounter_trait("pull", e)) && encounter_allows("pull", e)
	);
	const untargeted_other = other_mobs.filter(m => !m.target);

	if (other_mobs.length >= CONFIG.combat.agitate_min_mobs && untargeted_other.length >= CONFIG.combat.agitate_min_mobs && !is_travelling()) {
		if (distance(character, tank) <= 100) await use_skill("agitate");
	}
}

function taunt_wanted(e, tank) {
	if (!encounter_trait("taunt", e)) return false;
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
