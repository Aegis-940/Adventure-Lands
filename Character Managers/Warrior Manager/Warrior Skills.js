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

function stomp_blocked(mp_reserve) {
	const wait = ms_to_next_skill("stomp");
	if (wait !== 0) return `cooldown ${Math.ceil(wait / 1000)}s`;
	if (character.mp < skill_mp_cost("stomp") + mp_reserve) return "no mp";
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
	errlog_timeline("rime_watch", `shell ${shell.id} unbroken: ${reason}`);
	game_log(`Rime Shell on ${shell.name} — cannot stomp: ${reason}`, "#FF4444");
}

var _rime_band_damage = {};
var _rime_shell_logged = {};

function rime_band_held(mob) {
	if (ms_to_next_skill("stomp") > RIME_SHELL_STOMP_LEAD_MS) return true;
	const casting = rime_shell_casting();
	if (casting && casting !== mob) return true;
	return rime_shell_next() !== mob;
}

function rime_shell_logger() {
	if (parent.socket._rime_band_logger) parent.socket.off("hit", parent.socket._rime_band_logger);
	if (parent.socket._stomp_reply_logger) parent.socket.off("game_response", parent.socket._stomp_reply_logger);

	errlog_timeline("rime_watch", `rimeshell ability ${JSON.stringify(G.monsters.rimedjinn.abilities.rimeshell)}`);

	parent.socket._rime_band_logger = data => {
		if (!data || !data.damage) return;
		const mob = parent.entities[data.id];
		const shell = mob && rime_shell_ability(mob);
		if (!shell) return;
		if (shell_hit_counts(mob)) record_shell_hit(mob, data);
		const margin = mob.hp - mob.max_hp * shell.threshold;
		if (margin > mob.max_hp * RIME_SHELL_HOLD_BAND) delete _rime_band_damage[mob.id];
		if (margin <= 0 || margin > mob.max_hp * RIME_SHELL_HOLD_BAND) return;

		const ledger = _rime_band_damage[mob.id] || (_rime_band_damage[mob.id] = { total: 0, held: {} });
		ledger.total += data.damage;
		if (!rime_band_held(mob)) return;
		const who = data.source === "burn" ? `${data.hid}:burn` : String(data.hid);
		ledger.held[who] = (ledger.held[who] || 0) + data.damage;
	};

	parent.socket._stomp_reply_logger = data => {
		if (!data || data.place !== "stomp" || !data.failed) return;
		errlog_count(`stomp refused: ${data.response}`);
		errlog_timeline("rime_watch", `stomp refused: ${data.response}`);
	};

	parent.socket.on("hit", parent.socket._rime_band_logger);
	parent.socket.on("game_response", parent.socket._stomp_reply_logger);
}

var RIME_SHELL_BREAK_PCT = 0.05;
var RIME_SHELL_OVERRUN_MS = 1000;
var RIME_STACK_RADIUS = 15;
var _rime_shell_window = {};

function kilo(v) {
	return `${Math.round(v / 1000)}k`;
}

function rime_stack_size(mob) {
	let n = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e === mob || e.type !== "monster" || e.dead || !rime_shell_ability(e)) continue;
		if (distance(e, mob) <= RIME_STACK_RADIUS) n++;
	}
	return n;
}

function shell_window(mob, start) {
	if (!_rime_shell_window[mob.id]) {
		_rime_shell_window[mob.id] = {
			start: start || Date.now(), max_hp: mob.max_hp, stack: rime_stack_size(mob),
			total: 0, burn: 0, by: {}, first_hit: 0, stomped_at: 0
		};
	}
	return _rime_shell_window[mob.id];
}

function shell_open(id, e) {
	const plan = _rime_stomp_plans[id];
	if (!plan) return !!e?.s?.rimeshell;
	return !plan.gone && Date.now() < plan.best_at + plan.best_ms + RIME_SHELL_OVERRUN_MS;
}

function shell_hit_counts(mob) {
	return shell_open(mob.id, mob);
}

function record_shell_hit(mob, data) {
	const w = shell_window(mob);
	if (w.stomped_at) return;
	const source = data.source === "burn" ? "burn" : data.splash ? "splash" : (data.source || "attack");
	const who = `${data.hid}:${source}`;
	if (!w.first_hit) w.first_hit = Date.now();
	w.total += data.damage;
	if (source === "burn") w.burn += data.damage;
	w.by[who] = (w.by[who] || 0) + data.damage;
}

function shell_outcome(w, mob, plan) {
	if (w.stomped_at) return "stomped";
	if (!mob) return "out of sight";
	if (mob.dead) return "died";
	const conditions = plan && plan.gone_s ? plan.gone_s : Object.keys(mob.s || {});
	return conditions.includes("rimeexposed") ? "broken" : `gone (${conditions.join("+") || "no conditions"})`;
}

function log_shell_window(id, w, mob, plan) {
	const end = w.stomped_at || (plan && plan.gone_at) || Date.now();
	const need = w.max_hp * RIME_SHELL_BREAK_PCT;
	const lead = w.first_hit ? w.first_hit - w.start : 0;
	const outcome = shell_outcome(w, mob, plan);
	const by = Object.entries(w.by)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6)
		.map(([who, dmg]) => `${who} ${kilo(dmg)}`)
		.join(", ");

	errlog_count(`rime shell ${outcome.split(" ")[0]}`);
	errlog_timeline("rime_watch",
		`shell ${id} ${outcome} ${end - w.start}ms: ${kilo(w.total)} (${kilo(w.total - w.burn)} direct + ${kilo(w.burn)} burn) `
		+ `of ${kilo(need)}, first hit ${lead}ms, stack ${w.stack}`);
	errlog_timeline("rime_watch", `shell ${id} by ${by || "no hits"}`);
}

function close_shell_windows() {
	for (const id in _rime_shell_window) {
		const e = parent.entities[id];
		if (e && !e.dead && shell_open(id, e)) continue;
		const plan = _rime_stomp_plans[id];
		log_shell_window(id, _rime_shell_window[id], e, plan);
		delete _rime_shell_window[id];
		if (plan) plan.done = true;
	}
}

function log_new_shells() {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.s?.rimeshell || _rime_shell_logged[id]) continue;
		_rime_shell_logged[id] = true;
		shell_window(e);

		const wait = ms_to_next_skill("stomp");
		const ledger = _rime_band_damage[id] || { total: 0, held: {} };
		const held = Object.entries(ledger.held)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 4)
			.map(([who, dmg]) => `${who} ${Math.round(dmg / 1000)}k`)
			.join(", ");
		errlog_timeline("rime_watch",
			`shell ${id} ${Math.round(distance(character, e))}px stomp ${wait ? Math.ceil(wait / 1000) + "s" : "ready"} | band ${Math.round(ledger.total / 1000)}k, held: ${held || "none"}`);
	}
}

var RIME_STOMP_MP_BUFFER = 300;

function publish_stomp_ready() {
	const next = parent.next_skill.stomp;
	const affordable = character.mp >= skill_mp_cost("stomp") + RIME_STOMP_MP_BUFFER;
	stomp_ready_at = stomp_weapon_ready() && affordable ? (next ? +next : 0) : null;
}

function mark_shells_stomped() {
	for (const id in _rime_stomp_plans) {
		const plan = _rime_stomp_plans[id];
		if (!plan.gone && rime_plan_distance(id) <= G.skills.stomp.range) plan.done = true;
	}
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || !e.s?.rimeshell) continue;
		if (distance(character, e) > G.skills.stomp.range) continue;
		_rime_shell_reported[id] = true;
		if (_rime_stomp_plans[id]) _rime_stomp_plans[id].done = true;
		const w = shell_window(e);
		if (!w.stomped_at) w.stomped_at = Date.now();
	}
}

var RIME_SHELL_STOMP_DELAY_MS = 1000;
var _rime_shell_seen = {};

function oldest_shell_age() {
	const now = Date.now();
	let oldest = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.s?.rimeshell) continue;
		if (distance(character, e) > G.skills.stomp.range) continue;
		if (!_rime_shell_seen[id]) _rime_shell_seen[id] = now;
		oldest = Math.max(oldest, now - _rime_shell_seen[id]);
	}
	return oldest;
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

var RIME_STOMP_MARGIN_MS = 250;
var RIME_RTT_FLOOR_MS = 300;
var RIME_RTT_PAD_MS = 100;
var RIME_PLAN_TTL_MS = 10000;
var RIME_RETRY_MS = 25;
var _rime_stomp_plans = {};
var _rime_stomp_timer = null;

function rime_rtt() {
	const recent = parent.pings.slice(-10).sort((a, b) => a - b);
	const median = recent.length ? recent[Math.floor(recent.length / 2)] : 0;
	return Math.max(RIME_RTT_FLOOR_MS, median + RIME_RTT_PAD_MS);
}

function rime_stomp_planned() {
	for (const id in _rime_stomp_plans) if (!_rime_stomp_plans[id].done) return true;
	return false;
}

function rime_stomp_watcher() {
	if (parent.socket._rime_stomp_watcher) parent.socket.off("entities", parent.socket._rime_stomp_watcher);

	parent.socket._rime_stomp_watcher = data => {
		if (!data || !data.monsters) return;
		const now = Date.now();
		for (const id in _rime_stomp_plans) {
			if (now - _rime_stomp_plans[id].seen > RIME_PLAN_TTL_MS) delete _rime_stomp_plans[id];
		}

		let changed = false;
		for (const m of data.monsters) {
			const plan = _rime_stomp_plans[m.id];
			if (plan && m.x !== undefined) { plan.x = m.x; plan.y = m.y; }
			if (!m.s) continue;

			const shell = m.s.rimeshell;
			if (!shell || !shell.ms) {
				if (plan && !plan.gone) {
					plan.gone = true;
					plan.gone_at = now;
					plan.gone_s = Object.keys(m.s);
				}
				continue;
			}
			const fire_at = now + shell.ms - rime_rtt() - RIME_STOMP_MARGIN_MS;
			if (!plan) {
				_rime_stomp_plans[m.id] = {
					seen: now, ms: shell.ms, best_at: now, best_ms: shell.ms, fire_at,
					mtype: m.type, x: m.x, y: m.y, done: false, gone: false
				};
				const e = parent.entities[m.id];
				if (e) shell_window(e, now);
				changed = true;
			} else if (!plan.done && fire_at < plan.fire_at) {
				plan.fire_at = fire_at;
				plan.best_at = now;
				plan.best_ms = shell.ms;
				changed = true;
			}
		}
		if (changed) schedule_rime_stomp();
		_rime_last_packet_at = now;
		rime_stomp_overdue_check("entities");
	};

	if (parent.socket._rime_stomp_hit_check) parent.socket.off("hit", parent.socket._rime_stomp_hit_check);
	parent.socket._rime_stomp_hit_check = () => {
		_rime_last_packet_at = Date.now();
		rime_stomp_overdue_check("hit");
	};

	parent.socket.on("entities", parent.socket._rime_stomp_watcher);
	parent.socket.on("hit", parent.socket._rime_stomp_hit_check);
}

var _rime_last_packet_at = 0;
var RIME_STOMP_LATE_MS = 50;

function rime_stomp_overdue_check(via) {
	const now = Date.now();
	for (const id in _rime_stomp_plans) {
		const plan = _rime_stomp_plans[id];
		if (!plan.done && plan.fire_at <= now) return rime_deadline_stomp(via);
	}
}

function rime_plan_distance(id) {
	const e = parent.entities[id];
	if (e) return distance(character, e);
	const plan = _rime_stomp_plans[id];
	return Math.hypot(character.x - plan.x, character.y - plan.y);
}

function schedule_rime_stomp() {
	clearTimeout(_rime_stomp_timer);
	_rime_stomp_timer = null;

	let earliest = Infinity;
	for (const id in _rime_stomp_plans) {
		const plan = _rime_stomp_plans[id];
		if (!plan.done) earliest = Math.min(earliest, plan.fire_at);
	}
	if (!isFinite(earliest)) return;
	_rime_stomp_timer = setTimeout(() => rime_deadline_stomp("timer"), Math.max(0, earliest - Date.now()));
}

function rime_deadline_stomp(via) {
	clearTimeout(_rime_stomp_timer);
	_rime_stomp_timer = null;
	const now = Date.now();
	const due = Object.keys(_rime_stomp_plans).filter(id => !_rime_stomp_plans[id].done && _rime_stomp_plans[id].fire_at <= now + 5);
	for (const id of due) _rime_stomp_plans[id].done = true;
	if (due.length) {
		const late = now - Math.min(...due.map(id => _rime_stomp_plans[id].fire_at));
		errlog_count(`rime deadline via ${via}`);
		if (late > RIME_STOMP_LATE_MS) {
			errlog_count(`rime deadline late via ${via}`);
			errlog_timeline("rime_watch", `deadline ${late}ms late, fired by ${via}, last packet ${now - _rime_last_packet_at}ms before`);
		}
	}

	try {
		if (!due.length) return;
		const live = due.filter(id => !_rime_stomp_plans[id].gone);
		if (!live.length) {
			errlog_count("rime deadline: shell gone before the deadline");
			return;
		}
		const id = live.find(i => rime_plan_distance(i) <= G.skills.stomp.range);
		const shell = parent.entities[id || live[0]] || { id: id || live[0], name: "Rime Djinn" };
		if (!id) return report_unbroken_shell(shell, `at deadline: ${Math.round(rime_plan_distance(live[0]))}px away`);

		const plan = _rime_stomp_plans[id];
		const blocked = stomp_blocked(0) || (fire_stomp() ? null : "stomp swap failed");
		if (blocked) {
			if (now + RIME_RETRY_MS < plan.seen + plan.ms - rime_rtt()) {
				plan.done = false;
				plan.fire_at = now + RIME_RETRY_MS;
				errlog_count(`rime deadline retry: ${blocked.replace(/\d+s$/, "Ns")}`);
				return;
			}
			return report_unbroken_shell(shell, `at deadline: ${blocked}`);
		}

		publish_stomp_ready();
		write_state_cache();
		const rtt = parent.pings.length ? parent.pings[parent.pings.length - 1] : 0;
		const duration = G.monsters[plan.mtype].abilities.rimeshell.duration;
		const into = duration - plan.best_ms + (now - plan.best_at) + rtt;
		const shift = plan.seen + plan.ms - (plan.best_at + plan.best_ms);
		mark_shells_stomped();
		errlog_count("stomp rime shell at deadline");
		errlog_timeline("rime_watch",
			`stomp on shell ${id} at deadline: ~${Math.round(into)}ms into the shell on arrival, ${now - plan.seen}ms after first update, `
			+ `best update ${shift}ms earlier, rtt ${rime_rtt()}/${rtt}`);
		game_log(`Stomp — breaking Rime Shell on ${shell.name} at the deadline`, "#FFA600");
	} catch (e) {
		catcher(e, "rime_deadline_stomp");
	} finally {
		schedule_rime_stomp();
	}
}

function fire_stomp() {
	if (stomp_weapon_worn()) {
		parent.socket.emit("skill", { name: "stomp" });
		parent.next_skill.stomp = new Date(Date.now() + G.skills.stomp.cooldown);
		errlog_count("stomp fired");
		return true;
	}

	const restore = chosen_weapon_set();
	if (!restore) return false;

	const arm = equip_plan(STOMP_SET);
	if (!arm.ops.length) return false;

	const back = equip_plan(restore, arm.shadow);
	if (!back.ops.length) return false;

	emit_equip_ops(arm.ops, back.shadow);
	parent.socket.emit("skill", { name: "stomp" });
	emit_equip_ops(back.ops, back.shadow);
	parent.next_skill.stomp = new Date(Date.now() + G.skills.stomp.cooldown);
	errlog_count("stomp swap fired");
	return true;
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
