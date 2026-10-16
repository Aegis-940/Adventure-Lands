// --------------------------------------------------------------------------------------------------------------------------------- //
// RIME DJINN — the shell: every fighter targets a shelled Djinn, Ulric holds damage in the band above its threshold until his
// stomp can break the shell, and stomps it at the deadline; Riva picks her shell shot. Then the two encounters
// --------------------------------------------------------------------------------------------------------------------------------- //

function rime_shell_ability(mob) {
	return G.monsters[mob.mtype].abilities?.rimeshell;
}

function rime_shell_casting() {
	let nearest = null;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.s.rimeshell) continue;
		if (!nearest || distance(character, e) < distance(character, nearest)) nearest = e;
	}
	return nearest;
}

var stomp_ready_at = null;

const RIME_SHELL_BREAKER = "Ulric";
const RIME_SHELL_HOLD_BAND = 0.12;
const RIME_SHELL_STOMP_LEAD_MS = 1500;

function rime_shell_stomp_covers(mob) {
	const breaker = get_player(RIME_SHELL_BREAKER);
	if (!breaker || breaker.rip || distance(breaker, mob) > G.skills.stomp.range) return false;
	if (rime_shell_casting()) return false;
	const ready_at = character.name === RIME_SHELL_BREAKER
		? stomp_ready_at
		: read_state_cache(RIME_SHELL_BREAKER)?.stomp_ready_at;
	return ready_at != null && ready_at - Date.now() <= RIME_SHELL_STOMP_LEAD_MS;
}

function rime_shell_margin(mob) {
	return remaining_hp(mob) - pending_burn(mob) - mob.max_hp * rime_shell_ability(mob).threshold;
}

function rime_shell_band_margin(mob) {
	if (!rime_shell_ability(mob)) return null;
	const margin = rime_shell_margin(mob);
	return margin > 0 && margin <= mob.max_hp * RIME_SHELL_HOLD_BAND ? margin : null;
}

function rime_shell_next() {
	let next = null;
	let next_margin = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		const margin = rime_shell_band_margin(e);
		if (margin === null) continue;
		if (margin < next_margin || (margin === next_margin && e.id < next.id)) {
			next = e;
			next_margin = margin;
		}
	}
	return next;
}

function rime_shell_held(mob) {
	if (rime_shell_band_margin(mob) === null) return false;
	return rime_shell_next() !== mob || !rime_shell_stomp_covers(mob);
}

const RIME_HOLD_GEAR_RANGE = 400;

function rime_hold_gear_wanted() {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !rime_shell_ability(e)) continue;
		if (distance(character, e) > RIME_HOLD_GEAR_RANGE) continue;
		if (e.s.rimeshell || rime_shell_held(e)) return true;
	}
	return false;
}

function rime_shell_pending_within(range) {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		const shell = rime_shell_ability(e);
		if (shell && e.hp > e.max_hp * shell.threshold && distance(character, e) <= range) return true;
	}
	return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ULRIC'S SHELL BREAKING — shell windows and their log, stomp mana and readiness, the band logger
// --------------------------------------------------------------------------------------------------------------------------------- //

var _rime_shell_reported = {};

function report_unbroken_shell(shell, reason) {
	if (_rime_shell_reported[shell.id]) return;
	_rime_shell_reported[shell.id] = true;
	errlog_count(`rime shell unbroken: ${reason}`);
	errlog_timeline("rime_watch", `shell ${shell.id} unbroken: ${reason}`);
	log_msg("warn", `Rime Shell on ${shell.name} — cannot stomp: ${reason}`);
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

	errlog_timeline("rime_watch", `rimeshell ability ${JSON.stringify(G.monsters.rimedjinn.abilities.rimeshell)}`);

	const _rime_band_logger = data => {
		if (!data || !data.damage) return;
		const mob = parent.entities[data.id];
		const shell = mob && mob.type === "monster" && rime_shell_ability(mob);
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

	const _stomp_reply_logger = data => {
		if (!data || data.place !== "stomp" || !data.failed) return;
		errlog_count(`stomp refused: ${data.response}`);
		errlog_timeline("rime_watch", `stomp refused: ${data.response}`);
	};

	on_socket("hit", "rime_band_logger", _rime_band_logger);
	on_socket("game_response", "stomp_reply_logger", _stomp_reply_logger);
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
	if (!plan) return !!e?.s.rimeshell;
	return !plan.gone && Date.now() < plan.best_at + plan.best_ms + RIME_SHELL_OVERRUN_MS;
}

function shell_hit_counts(mob) {
	return shell_open(mob.id, mob);
}

function record_shell_hit(mob, data) {
	const w = shell_window(mob);
	if (w.stomped_at) return;
	const source = hit_kind(data);
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
	const conditions = plan && plan.gone_s ? plan.gone_s : Object.keys(mob.s);
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
		if (e.type !== "monster" || e.dead || !e.s.rimeshell || _rime_shell_logged[id]) continue;
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

function stomp_mana_reserved() {
	const shell_coming = rime_stomp_planned() || rime_shell_pending_within(G.skills.stomp.range);
	if (!shell_coming) return false;
	return character.mp - character.mp_cost < skill_mp_cost("stomp");
}

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
		if (e.type !== "monster" || !e.s.rimeshell) continue;
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
		if (e.type !== "monster" || e.dead || !e.s.rimeshell) continue;
		if (distance(character, e) > G.skills.stomp.range) continue;
		if (!_rime_shell_seen[id]) _rime_shell_seen[id] = now;
		oldest = Math.max(oldest, now - _rime_shell_seen[id]);
	}
	return oldest;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DEADLINE STOMP — planned from the shell timer in each entities packet, fired by timer, packet or skill loop
// --------------------------------------------------------------------------------------------------------------------------------- //

var RIME_STOMP_MARGIN_MS = 150;
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

	const _rime_stomp_watcher = data => {
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

	const _rime_stomp_hit_check = () => {
		_rime_last_packet_at = Date.now();
		rime_stomp_overdue_check("hit");
	};

	on_socket("entities", "rime_stomp_watcher", _rime_stomp_watcher);
	on_socket("hit", "rime_stomp_hit_check", _rime_stomp_hit_check);
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
		log_msg("event", `Stomp — breaking Rime Shell on ${shell.name} at the deadline`);
	} catch (e) {
		catcher(e, "rime_deadline_stomp");
	} finally {
		schedule_rime_stomp();
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RIVA'S SHELL SHOTS — the shelled Djinn first in her list, and the shot that puts the most damage on it
// --------------------------------------------------------------------------------------------------------------------------------- //

function shelled_first(pool) {
	const shelled = rime_shell_casting();
	const i = shelled ? pool.indexOf(shelled) : -1;
	if (i > 0) pool.unshift(pool.splice(i, 1)[0]);
}

function shell_shot_damage(shelled, targets, profile) {
	const apiercing = shot_apiercing(profile);
	const explosion = character.explosion;
	const radius = explosion_radius(explosion);
	let damage = 0;
	for (const mob of targets) {
		const hit = character.attack * profile.multiplier * armour_factor(mob, apiercing);
		if (mob === shelled) damage += hit;
		else if (explosion && distance(mob, shelled) <= radius) damage += hit * (explosion / 100) * damage_multiplier(shelled.armor || 0);
	}
	return damage;
}

function choose_shell_shot(shelled, in_range) {
	const others = in_range.filter(e => e !== shelled).sort((a, b) => distance(a, shelled) - distance(b, shelled));
	const primary = [shelled, ...others];
	let best = null;

	for (const profile of SHOT_PROFILES) {
		if (!shot_usable(profile)) continue;
		if (character.mp < shot_mana(profile) + panic_mp_reserve()) continue;
		const targets = primary.slice(0, profile.single ? 1 : profile.count);
		const damage = shell_shot_damage(shelled, targets, profile);
		const total = targets.length * profile.multiplier;
		if (!best || damage > best.damage || (damage === best.damage && total > best.total)) {
			best = { name: profile.name, single: !!profile.single, targets, damage, total };
		}
	}

	if (best) errlog_count(`shell shot ${best.name}${character.explosion ? " boom" : ""}`);
	return best;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ENCOUNTERS — the spawn's gear, and the hold gear while a Djinn is shelled or held in the band
// --------------------------------------------------------------------------------------------------------------------------------- //

encounter("rimedjinn", {
	tier: "spawn",
	homes: ["rimedjinn"],
	mtypes: ["rimedjinn"],
	gear: {
		warrior: { orb: "orb_dps" },
		priest: { loadout: "single_target", orb: "orb_dps", chest: "dps_chest" },
	},
});

encounter("rime shell", {
	tier: "situation",
	active: () => Object.values(parent.entities).some(e => e.type === "monster" && !e.dead && rime_shell_ability(e)),
	gear: {
		warrior: { weapon: () => rime_hold_gear_wanted() ? "single" : null },
		ranger: { weapon: () => rime_hold_gear_wanted() ? "single" : null },
	},
});
