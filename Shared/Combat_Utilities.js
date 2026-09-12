// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, combat positioning
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// DAMAGE SAMPLING — what burn and splash are actually worth, measured from hit events
// --------------------------------------------------------------------------------------------------------------------------------- //

const DAMAGE_WINDOW_MS = 15000;
const BUFFS_WORTH_LOGGING = ["warcry", "darkblessing", "mluck", "mcourage", "power", "xpower", "holidayspirit", "newcomersblessing", "energized"];

const _damage_windows = {};

function weapon_label() {
	const mainhand = character.slots?.mainhand?.name || "none";
	const offhand = character.slots?.offhand?.name || "none";
	return `${mainhand}/${offhand}`;
}

function firing_stats() {
	return {
		explosion: character.explosion || 0,
		crit: character.crit || 0,
		critdamage: character.critdamage || 0,
		apiercing: character.apiercing || 0,
		attack: Math.round(character.attack || 0)
	};
}

function damage_window_for(weapon, stats) {
	let w = _damage_windows[weapon];
	if (!w) {
		const s = stats || firing_stats();
		w = _damage_windows[weapon] = {
			at: Date.now(),
			weapon,
			explosion: s.explosion,
			crit: s.crit,
			critdamage: s.critdamage,
			apiercing: s.apiercing,
			attack: s.attack,
			buffs: Object.keys(character.s || {}).filter(s => BUFFS_WORTH_LOGGING.includes(s)).join("+"),
			direct: 0, splash: 0, burn: 0,
			hits: 0, splashes: 0, ticks: 0,
			splash_armor: 0, direct_armor: 0,
			tagged: 0, untagged: 0,
			pred_splash: 0, pred_burn: 0, pred_ticks: 0,
			off_home: 0, boss_seen: 0, context_ticks: 0
		};
	}
	return w;
}

function sample_hits_enabled() {
	return typeof CONFIG !== "undefined" && CONFIG.combat && CONFIG.combat.sample_hits;
}

function flush_damage_windows() {
	if (!sample_hits_enabled()) return;
	for (const weapon in _damage_windows) {
		const w = _damage_windows[weapon];
		if (Date.now() - w.at < DAMAGE_WINDOW_MS) continue;
		delete _damage_windows[weapon];
		emit_damage_window(w);
	}
}

function tick_damage_windows() {
	if (!sample_hits_enabled()) return;

	const worn = weapon_label();
	const at_home = typeof destination !== "undefined" && destination && character.map === destination.map;
	const boss = typeof find_active_boss === "function" && !!find_active_boss();
	const prediction = typeof model_prediction === "function" ? model_prediction() : null;

	for (const weapon in _damage_windows) {
		const w = _damage_windows[weapon];

		w.context_ticks++;
		if (!at_home) w.off_home++;
		if (boss) w.boss_seen++;

		if (!prediction || weapon !== worn) continue;
		w.pred_splash += prediction.splash;
		w.pred_burn += prediction.burn;
		w.pred_ticks++;
	}
}

function emit_damage_window(w) {
	if (w.direct > 0 && typeof errlog_sample === "function") {
		errlog_sample("damage", {
			weapon: w.weapon,
			explosion: w.explosion, crit: w.crit, critdamage: w.critdamage,
			apiercing: w.apiercing, attack: w.attack, buffs: w.buffs,
			secs: +((Date.now() - w.at) / 1000).toFixed(1),
			direct: Math.round(w.direct),
			splash: Math.round(w.splash),
			burn: Math.round(w.burn),
			burn_mult: +(1 + w.burn / w.direct).toFixed(3),
			splash_mult: +(1 + w.splash / w.direct).toFixed(3),
			hits: w.hits, splashes: w.splashes, ticks: w.ticks,
			tagged: w.tagged, untagged: w.untagged,
			splash_armor: w.splashes ? Math.round(w.splash_armor / w.splashes) : 0,
			direct_armor: w.hits ? Math.round(w.direct_armor / w.hits) : 0,
			per_splash: w.splashes ? +(w.splash / w.splashes / (w.direct / w.hits)).toFixed(3) : 0,

			predicted_splash_mult: w.pred_ticks ? +(1 + w.pred_splash / w.pred_ticks).toFixed(3) : 0,
			predicted_burn_mult: w.pred_ticks ? +(w.pred_burn / w.pred_ticks).toFixed(3) : 0,
			splash_accuracy: w.pred_ticks && w.pred_splash > 0
				? +((1 + w.splash / w.direct) / (1 + w.pred_splash / w.pred_ticks)).toFixed(3) : 0,
			burn_accuracy: w.pred_ticks && w.pred_burn > 0
				? +((1 + w.burn / w.direct) / (w.pred_burn / w.pred_ticks)).toFixed(3) : 0,

			off_home_pct: w.context_ticks ? +(w.off_home / w.context_ticks).toFixed(2) : 0,
			boss_pct: w.context_ticks ? +(w.boss_seen / w.context_ticks).toFixed(2) : 0,
			map: character.map
		});
	}
}

function _is_my_hit(data) {
	return data && (data.hid === character.id || data.hid === character.name);
}

const _pid_weapon = {};

if (parent.socket._action_sampler) {
	parent.socket.off("action", parent.socket._action_sampler);
}

parent.socket._action_sampler = data => {
	try {
		if (!sample_hits_enabled() || !data || !data.pid) return;
		if (data.attacker !== character.id && data.attacker !== character.name) return;
		if (data.heal) {
			record_pid_heal(data);
			return;
		}
		_pid_weapon[data.pid] = Object.assign({ weapon: weapon_label(), at: Date.now() }, firing_stats());
	} catch (e) { }
};

parent.socket.on("action", parent.socket._action_sampler);

const _pid_heal = {};

function heal_target_entity(id) {
	if (id === character.id || id === character.name) return character;
	return parent.entities[id] || null;
}

function record_pid_heal(data) {
	const target = heal_target_entity(data.target);
	const source = data.source === "partyheal" || data.source === "selfheal" ? "party" : "single";
	const base = source === "party" ? partyheal_base() : (character.heal || 0);
	_pid_heal[data.pid] = {
		at: Date.now(),
		source,
		deficit: target ? Math.max(0, (target.max_hp || 0) - (target.hp || 0)) : 0,
		predicted: target ? heal_delivered(target, base) : 0
	};
}

function prune_pid_weapons() {
	const cutoff = Date.now() - 10000;
	for (const pid in _pid_weapon) {
		if (_pid_weapon[pid].at < cutoff) delete _pid_weapon[pid];
	}
	for (const pid in _pid_heal) {
		if (_pid_heal[pid].at < cutoff) delete _pid_heal[pid];
	}
}

setInterval(prune_pid_weapons, 10000);

let _heal_window = null;

function heal_window() {
	if (!_heal_window) {
		_heal_window = {
			at: Date.now(),
			single_casts: 0, single_delivered: 0, single_predicted: 0, single_overheal: 0,
			party_hits: 0, party_delivered: 0, party_predicted: 0, party_overheal: 0,
			untagged: 0, poisoned_ticks: 0, ticks: 0, mp_low_ticks: 0
		};
	}
	return _heal_window;
}

function tick_heal_window() {
	if (!sample_hits_enabled() || !character.heal) return;
	const w = heal_window();
	w.ticks++;
	if (character.s && character.s.poisoned) w.poisoned_ticks++;
	if (character.max_mp && character.mp / character.max_mp < 0.25) w.mp_low_ticks++;
}

function flush_heal_window() {
	if (!_heal_window) return;
	const w = _heal_window;
	if (Date.now() - w.at < DAMAGE_WINDOW_MS) return;
	_heal_window = null;

	if (!w.single_casts && !w.party_hits) return;
	if (typeof errlog_sample !== "function") return;

	errlog_sample("heal", {
		secs: +((Date.now() - w.at) / 1000).toFixed(1),
		heal: Math.round(character.heal || 0),
		mp_cost: Math.round(character.mp_cost || 0),
		rpiercing: character.rpiercing || 0,
		single_casts: w.single_casts,
		single_delivered: Math.round(w.single_delivered),
		single_predicted: Math.round(w.single_predicted),
		single_overheal: Math.round(w.single_overheal),
		single_accuracy: w.single_predicted ? +(w.single_delivered / w.single_predicted).toFixed(3) : 0,
		party_hits: w.party_hits,
		party_delivered: Math.round(w.party_delivered),
		party_predicted: Math.round(w.party_predicted),
		party_overheal: Math.round(w.party_overheal),
		party_accuracy: w.party_predicted ? +(w.party_delivered / w.party_predicted).toFixed(3) : 0,
		poisoned_pct: w.ticks ? +(w.poisoned_ticks / w.ticks).toFixed(2) : 0,
		mp_low_pct: w.ticks ? +(w.mp_low_ticks / w.ticks).toFixed(2) : 0,
		untagged: w.untagged
	});
}

if (parent.socket._damage_sampler) {
	parent.socket.off("hit", parent.socket._damage_sampler);
}

parent.socket._damage_sampler = data => {
	try {
		if (!sample_hits_enabled() || !_is_my_hit(data)) return;

		if (data.heal) {
			const w = heal_window();
			const cast = data.pid && _pid_heal[data.pid];
			const kind = cast ? cast.source : "single";
			if (!cast) w.untagged++;
			if (kind === "party") w.party_hits++; else w.single_casts++;
			w[kind + "_delivered"] += data.heal;
			w[kind + "_predicted"] += cast ? cast.predicted : 0;
			w[kind + "_overheal"] += cast ? Math.max(0, data.heal - cast.deficit) : 0;
			return;
		}

		if (!data.damage) return;

		const fired = data.pid && _pid_weapon[data.pid];
		const w = damage_window_for(fired ? fired.weapon : weapon_label(), fired);
		const hit = parent.entities[data.id];
		const armor = hit ? (hit.armor || 0) : 0;
		if (fired) w.tagged++; else w.untagged++;

		if (data.source === "burn") { w.burn += data.damage; w.ticks++; }
		else if (data.splash) { w.splash += data.damage; w.splashes++; w.splash_armor += armor; }
		else { w.direct += data.damage; w.hits++; w.direct_armor += armor; }
	} catch (e) { }
};

parent.socket.on("hit", parent.socket._damage_sampler);

setInterval(() => { try { tick_damage_windows(); } catch (e) { } flush_damage_windows(); }, 1000);
setInterval(() => { try { tick_heal_window(); flush_heal_window(); } catch (e) { } }, 1000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// MONSTER & COMBAT UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill];
	if (next_skill === undefined) return 0;
	const ping = parent.pings?.length ? Math.min(...parent.pings) : 0;
	const ms = next_skill.getTime() - Date.now() - ping;
	return ms < 0 ? 0 : ms;
}

function monster_distance_for(args, mob) {
	return args.point_for_distance_check
		? Math.hypot(args.point_for_distance_check[0] - mob.x, args.point_for_distance_check[1] - mob.y)
		: parent.distance(character, mob);
}

function monsters_matching(args = {}) {
	const out = [];

	for (let id in parent.entities) {
		let current = parent.entities[id];
		if (current.type != "monster" || !current.visible || current.dead) continue;

		if (args.type) {
			if (Array.isArray(args.type)) {
				if (!args.type.includes(current.mtype)) continue;
			} else {
				if (current.mtype !== args.type) continue;
			}
		}

		if (args.min_level !== undefined && current.level < args.min_level) continue;
		if (args.max_level !== undefined && current.level > args.max_level) continue;
		if (args.target && !args.target.includes(current.target)) continue;
		if (args.no_target && current.target) continue;

		if (args.status_effects && !args.status_effects.every(effect => current.s[effect])) continue;

		if (args.min_xp !== undefined && current.xp < args.min_xp) continue;
		if (args.max_xp !== undefined && current.xp > args.max_xp) continue;

		if (args.max_att !== undefined && current.attack > args.max_att) continue;

		if (args.path_check && !can_move_to(current)) continue;
		if (args.where && !args.where(current)) continue;

		if (args.max_distance !== undefined && monster_distance_for(args, current) > args.max_distance) continue;

		out.push(current);
	}

	return out;
}


function get_num_targets(player_name) {
	if (!player_name) return 0;
	let count = 0;
	for (const id in parent.entities) {
		const entity = parent.entities[id];
		if (entity.type === "monster" && entity.target === player_name) {
			count++;
		}
	}
	return count;
}

function get_num_chests() {
	return Object.keys(get_chests()).length;
}

function get_party_members() {
	return Object.keys(get_party() || {});
}

function panic_mp_reserve() {
	return (G.skills.scare?.mp || 50) + 200;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CHARACTER UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //


function boss_is_present(entry) {
	if (entry.data.map && entry.data.map === character.map) return true;
	return !!get_nearest_monster({ type: entry.name });
}

function find_active_boss() {
	return EVENT_LOCATIONS
		.map(e => ({ name: e.name, data: parent.S[e.name] }))
		.find(e => e.data?.live && boss_is_present(e));
}

function should_pause_combat_loop() {
	if (panicking) return true;
	if (typeof anniversary_travel !== "undefined" && anniversary_travel) return true;

	if (typeof travel_is_active === "function" && travel_is_active()) return true;
	if (smart.moving) return true;

	const goal = typeof current_goal === "function" ? current_goal() : null;
	if (goal && goal.chasing) return true;

	if (home === "giantspider") return false;
	const myras = get_player("Myras");
	if (!myras || distance(character, myras) > 200) return true;

	if (myras.rip) return true;
	return healer_is_down();
}

let _healer_down = { at: 0, down: false };

function healer_is_down() {
	const now = Date.now();
	if (now - _healer_down.at < 250) return _healer_down.down;
	_healer_down.at = now;
	let down = false;
	try {
		if (typeof read_state_cache === "function") {
			const cached = read_state_cache("Myras");
			down = !!(cached && cached.rip);
		}
	} catch (e) { }
	_healer_down.down = down;
	return down;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT POSITIONING — shared by Warrior/Ranger's reposition() loops.
// --------------------------------------------------------------------------------------------------------------------------------- //

function defense_reduction(defense) {
	if (typeof parent.damage_multiplier === "function") return parent.damage_multiplier(defense);

	const d = defense || 0;
	const band = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

	const reduction =
		band(0, 100, d) * 0.00100 +
		band(0, 100, d - 100) * 0.00100 +
		band(0, 100, d - 200) * 0.00095 +
		band(0, 100, d - 300) * 0.00090 +
		band(0, 100, d - 400) * 0.00082 +
		band(0, 100, d - 500) * 0.00070 +
		band(0, 100, d - 600) * 0.00060 +
		band(0, 100, d - 700) * 0.00050 +
		Math.max(0, d - 800) * 0.00040;

	const piercing =
		band(0, 50, -d) * 0.00100 +
		band(0, 50, -50 - d) * 0.00075 +
		band(0, 50, -100 - d) * 0.00050 +
		Math.max(0, -150 - d) * 0.00025;

	return Math.min(1.32, Math.max(0.05, 1 - reduction + piercing));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALING — the server's heal pipeline, which is not the damage pipeline
// --------------------------------------------------------------------------------------------------------------------------------- //

const HEAL_POISON_FACTOR = 0.25;
const HEAL_RESISTANCE_DIVISOR = 2;
const PARTYHEAL_LEVEL_LADDER = [[80, 800], [72, 720], [60, 600], [0, 400]];

function is_self_target(target) {
	return !target || target === character || target.name === character.name;
}

function heal_entity(target) {
	return is_self_target(target) ? character : target;
}

function heal_reduction(target, rpiercing) {
	if (is_self_target(target)) return 1;
	const pierce = rpiercing === undefined ? (character.rpiercing || 0) : rpiercing;
	return defense_reduction(((target.resistance || 0) - pierce) / HEAL_RESISTANCE_DIVISOR);
}

function heal_poison_factor(target) {
	const entity = heal_entity(target);
	return entity && entity.s && entity.s.poisoned ? HEAL_POISON_FACTOR : 1;
}

function heal_delivered(target, base, rpiercing) {
	return (base || 0) * heal_reduction(target, rpiercing) * heal_poison_factor(target);
}

function heal_useful(target, base, rpiercing) {
	const entity = heal_entity(target);
	if (!entity) return 0;
	const deficit = Math.max(0, (entity.max_hp || 0) - (entity.hp || 0));
	return Math.min(heal_delivered(target, base, rpiercing), deficit);
}

function partyheal_base(level) {
	const lvl = level === undefined ? (character.level || 0) : level;
	for (const [floor, base] of PARTYHEAL_LEVEL_LADDER) if (lvl >= floor) return base;
	return 400;
}

function fear_attack_factor(fear) {
	const f = fear === undefined ? (character.fear || 0) : fear;
	if (f > 2) return 0.2;
	if (f > 1) return 0.4;
	if (f) return 0.6;
	return 1;
}

function heal_power_identity() {
	const output = character.output || 100;
	const fear = character.fear || 0;
	const implied = Math.round((character.heal || 0) * output / 100 * fear_attack_factor(fear));
	return {
		heal: character.heal || 0,
		attack: character.attack || 0,
		output,
		fear,
		implied,
		agrees: Math.abs(implied - (character.attack || 0)) <= 2
	};
}

function estimate_my_damage(entity, multiplier) {
	const info = (G.monsters && G.monsters[entity.mtype]) || {};
	const armor = (entity.armor !== undefined ? entity.armor : info.armor || 0) - (character.apiercing || 0);
	return (character.attack || 0) * defense_reduction(armor) * (multiplier === undefined ? 1 : multiplier);
}

function time_to_kill_ms(mob, hp, dps, party_factor) {
	if (!mob || !hp || dps <= 0) return Infinity;
	const armor = (mob.armor || 0) - (character.apiercing || 0);
	const effective = dps * defense_reduction(armor) * (party_factor || 1);
	return effective > 0 ? (hp / effective) * 1000 : Infinity;
}

const BURN_DURATION_MS = 5000;

function burn_ticks_at_dps(mob, dps, party_factor) {
	const def = G.conditions?.burned;
	if (!def || !def.interval) return 0;

	const max_ticks = Math.floor((def.duration || BURN_DURATION_MS) / def.interval);
	if (!mob) return max_ticks;

	const ttk = time_to_kill_ms(mob, mob.max_hp, dps, party_factor);
	if (!isFinite(ttk)) return max_ticks;

	return Math.max(0, Math.min(max_ticks, Math.floor(ttk / def.interval)));
}

const BURN_TICK_DIVISOR = 5;

function burn_multiplier_at_dps(mob, chance, dps, party_factor, options) {
	if (!chance) return 1;

	const def = G.conditions?.burned;
	if (!def || !def.interval) return 1;

	const opts = options || {};
	const rate = opts.frequency || character.frequency || 1;
	if (rate <= 0) return 1;

	const hp = opts.hp === undefined ? (mob && mob.max_hp) : opts.hp;
	const ttk = mob ? time_to_kill_ms(mob, hp, dps, party_factor) : Infinity;
	const window_ms = Math.min(BURN_DURATION_MS, isFinite(ttk) ? ttk : BURN_DURATION_MS);
	if (window_ms <= 0) return 1;

	const attacks = rate * (window_ms / 1000);
	const lit = 1 - Math.pow(1 - chance / 100, attacks);

	const ticks_per_second = 1000 / def.interval;
	return 1 + (lit * ticks_per_second) / (BURN_TICK_DIVISOR * rate);
}

function would_kill(entity, multiplier) {
	if (!entity || entity.dead) return false;
	return estimate_my_damage(entity, multiplier) >= entity.hp;
}

const EXPLOSION_RADIUS_DIVISOR = 3.6;

function explosion_radius(explosion) {
	const intensity = explosion === undefined ? (character.explosion || 0) : explosion;
	return intensity / EXPLOSION_RADIUS_DIVISOR;
}

function count_neighbours(mob, radius, aggro_only, centre_metric) {
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead) continue;
		if (e === mob || e.id === mob.id) continue;
		if (aggro_only && !e.target) continue;
		const gap = centre_metric ? Math.hypot(e.x - mob.x, e.y - mob.y) : distance(e, mob);
		if (gap <= radius) count++;
	}
	return count;
}

function splash_bonus(mob, explosion, hit_damage) {
	if (!mob || !explosion) return 0;

	const radius = explosion_radius(explosion);
	let bonus = 0;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead) continue;
		if (e === mob || e.id === mob.id) continue;
		if (distance(e, mob) > radius) continue;

		const share = (explosion / 100) * defense_reduction(e.armor || 0);
		bonus += hit_damage > 0
			? Math.min(share * hit_damage, e.hp || 0) / hit_damage
			: share;
	}
	return bonus;
}


const ORBIT_ANGLE_SAMPLES = 16;
const ORBIT_RADIUS_FRACTIONS = [1.0, 0.66, 0.33];

const ORBIT_TRAVEL_WEIGHT = 0.35;
const ORBIT_MIN_GAIN = 20;

let _last_orbit_decision = null;

function best_orbit_spot(center, radius, score, options) {
	const min_gain = options?.min_gain ?? ORBIT_MIN_GAIN;
	const travel_weight = options?.travel_weight ?? ORBIT_TRAVEL_WEIGHT;

	_last_orbit_decision = null;

	const here = score(character.x, character.y);
	const incumbent = (here === null || here === undefined) ? -Infinity : here;

	let best = null;
	let best_value = -Infinity;
	let best_raw = -Infinity;

	function consider(x, y) {
		if (!can_move_to(x, y)) return;
		const s = score(x, y);
		if (s === null || s === undefined) return;
		const value = s - Math.hypot(x - character.x, y - character.y) * travel_weight;
		if (value > best_value) {
			best_value = value;
			best_raw = s;
			best = { x, y };
		}
	}

	consider(center.x, center.y);

	for (const frac of ORBIT_RADIUS_FRACTIONS) {
		const r = radius * frac;
		for (let i = 0; i < ORBIT_ANGLE_SAMPLES; i++) {
			const angle = (i / ORBIT_ANGLE_SAMPLES) * 2 * Math.PI;
			consider(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r);
		}
	}

	if (!best) return null;

	const moved = best_raw >= incumbent + min_gain;
	_last_orbit_decision = {
		incumbent: Math.round(incumbent),
		best_raw: Math.round(best_raw),
		moved,
		travel: Math.round(Math.hypot(best.x - character.x, best.y - character.y))
	};

	if (!moved) return { x: character.x, y: character.y };
	return best;
}

function make_distance_from_monsters_scorer() {
	const monsters = Object.values(parent.entities).filter(e => e?.type === "monster" && !e.dead);
	if (!monsters.length) return null;

	return (x, y) => {
		let nearest = Infinity;
		for (const e of monsters) {
			const d = Math.hypot(e.x - x, e.y - y);
			if (d < nearest) nearest = d;
		}
		return nearest;
	};
}

function reposition_center() {
	if (home === "giantspider") {
		const healer = get_player("Myras");
		if (!healer || healer.rip || healer.map !== character.map) return null;
		return { x: healer.x, y: healer.y };
	}
	if (character.name !== MOVEMENT_LEADER) {
		const lead = get_player(MOVEMENT_LEADER);
		if (lead && !lead.rip) return { x: lead.x, y: lead.y };
	}
	return locations[home][0];
}
