// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, combat positioning
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// PING COMPENSATION
// --------------------------------------------------------------------------------------------------------------------------------- //

const _compensated_cooldowns = {};

function min_ping() {
	return parent.pings?.length ? Math.min(...parent.pings) : 0;
}

function cooldown_key(skill) {
	if (skill === "heal") return "attack";
	return (G.skills && G.skills[skill] && G.skills[skill].share) || skill;
}

function compensate_cooldown(skill) {
	if (typeof reduce_cooldown !== "function") return;

	const key = cooldown_key(skill);
	const next = parent.next_skill && parent.next_skill[key];
	if (!next) return;

	const stamp = next.getTime();
	if (stamp <= Date.now()) return;
	if (_compensated_cooldowns[key] === stamp) return;

	const ping = min_ping();
	if (ping <= 0) return;

	reduce_cooldown(key, ping);

	const updated = parent.next_skill[key];
	_compensated_cooldowns[key] = updated ? updated.getTime() : stamp;
}

function _compensating(original, skill_of) {
	return function () {
		const skill = skill_of(arguments);
		const result = original.apply(this, arguments);
		return Promise.resolve(result).then(value => {
			try { compensate_cooldown(skill); } catch (e) { }
			return value;
		});
	};
}

const COMPENSATION_INSTALL_ATTEMPTS = 30;

let _compensation_installer = null;
let _compensation_attempts = 0;

function _install_compensation() {
	if (!window.__AL_COMP_ATTACK__ && typeof attack === "function") {
		attack = _compensating(attack, () => "attack");
		window.__AL_COMP_ATTACK__ = true;
	}
	if (!window.__AL_COMP_HEAL__ && typeof heal === "function") {
		heal = _compensating(heal, () => "heal");
		window.__AL_COMP_HEAL__ = true;
	}
	if (!window.__AL_COMP_USE_SKILL__ && typeof use_skill === "function") {
		use_skill = _compensating(use_skill, args => args[0]);
		window.__AL_COMP_USE_SKILL__ = true;
	}

	_compensation_attempts++;
	const done = window.__AL_COMP_ATTACK__ && window.__AL_COMP_HEAL__ && window.__AL_COMP_USE_SKILL__;
	if (_compensation_installer && (done || _compensation_attempts >= COMPENSATION_INSTALL_ATTEMPTS)) {
		clearInterval(_compensation_installer);
		_compensation_installer = null;
	}
}

_install_compensation();
_compensation_installer = setInterval(_install_compensation, 1000);

// --------------------------------------------------------------------------------------------------------------------------------- //
// THREAT ASSESSMENT — time to death, projected incoming damage
// --------------------------------------------------------------------------------------------------------------------------------- //

const TIME_TO_DEATH_TTL_MS = 60000;
const TIME_TO_DEATH_MAX_SAMPLES = 100;
const MOBBING_PENALTY_PER_EXCESS = 0.2;
const DEFENSE_HALF_POINT = 900;

const _hp_samples = {};

function monster_info(entity) {
	return (G.monsters && G.monsters[entity.mtype]) || {};
}

function ms_to_death(entity) {
	if (!entity || entity.dead) return 0;

	let samples = _hp_samples[entity.id];
	if (!samples) {
		samples = [];
		_hp_samples[entity.id] = samples;
	}

	samples.push([Date.now(), entity.hp]);
	if (samples.length > TIME_TO_DEATH_MAX_SAMPLES) {
		samples.splice(0, samples.length - TIME_TO_DEATH_MAX_SAMPLES);
	}

	let total_damage = 0;
	let total_time = 0;
	for (let i = 1; i < samples.length; i++) {
		total_damage += samples[i - 1][1] - samples[i][1];
		total_time += samples[i][0] - samples[i - 1][0];
	}

	if (total_time <= 0 || total_damage <= 0) return Infinity;
	return entity.hp / (total_damage / total_time);
}

function prune_hp_samples() {
	const cutoff = Date.now() - TIME_TO_DEATH_TTL_MS;
	for (const id in _hp_samples) {
		const samples = _hp_samples[id];
		if (!samples.length || samples[samples.length - 1][0] < cutoff || !parent.entities[id]) {
			delete _hp_samples[id];
		}
	}
}

setInterval(prune_hp_samples, TIME_TO_DEATH_TTL_MS);

function defense_reduction(defense) {
	if (typeof parent.damage_multiplier === "function") return parent.damage_multiplier(defense);
	const d = Math.max(0, defense || 0);
	return DEFENSE_HALF_POINT / (DEFENSE_HALF_POINT + d);
}

function damage_type_of(entity) {
	return entity.damage_type || monster_info(entity).damage_type || "physical";
}

function estimate_hit_damage(attacker) {
	const info = monster_info(attacker);
	const raw = attacker.attack || info.attack || 0;
	const type = damage_type_of(attacker);

	if (type === "pure") return raw;
	if (type === "magical") {
		return raw * defense_reduction((character.resistance || 0) - (attacker.rpiercing || 0));
	}
	return raw * defense_reduction((character.armor || 0) - (attacker.apiercing || 0));
}

function attackers_of_me() {
	const out = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (e.target !== character.name) continue;
		out.push(e);
	}
	return out;
}

function excess_attackers(attackers) {
	const counts = { physical: 0, magical: 0, pure: 0 };
	for (const e of attackers) counts[damage_type_of(e)]++;
	counts.physical -= (character.courage || 0);
	counts.magical -= (character.mcourage || 0);
	counts.pure -= (character.pcourage || 0);
	return counts;
}

function projected_incoming() {
	const attackers = attackers_of_me();
	if (!attackers.length) return { attackers: 0, in_reach: 0, burst: 0, dps: 0 };

	const excess = excess_attackers(attackers);
	let in_reach = 0;
	let burst = 0;
	let dps = 0;

	for (const e of attackers) {
		const info = monster_info(e);
		const reach = (e.range || info.range || 0) + (e.speed || info.speed || 0);
		if (parent.distance(character, e) > reach) continue;

		const type = damage_type_of(e);
		let damage = estimate_hit_damage(e);
		if (excess[type] > 0) damage *= 1 + MOBBING_PENALTY_PER_EXCESS * excess[type];

		in_reach++;
		burst += damage;
		dps += damage * (e.frequency || info.frequency || 1);
	}

	return { attackers: attackers.length, in_reach, burst, dps };
}

function projected_incoming_dps() {
	return projected_incoming().dps;
}

function could_die_to_incoming() {
	return projected_incoming().burst >= character.hp;
}

function will_burn_to_death() {
	const burned = character.s && character.s.burned;
	if (!burned) return false;

	const interval = G.conditions && G.conditions.burned && G.conditions.burned.interval;
	if (!interval) return false;

	const ticks = Math.min(
		Math.floor(burned.ms / interval) - 1,
		Math.ceil((min_ping() * 6) / interval) + 1
	);
	if (ticks <= 0) return false;

	return ticks * (burned.intensity / 5) >= character.hp;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MONSTER & COMBAT UTILITIES
// --------------------------------------------------------------------------------------------------------------------------------- //

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[cooldown_key(skill)];
	if (next_skill === undefined) return 0;
	const ms = next_skill.getTime() - Date.now();
	return ms < 0 ? 0 : ms;
}

function get_nearest_monster_v2(args = {}) {
	let min_d = 999999, target = null;
	let optimal_hp = args.check_max_hp ? 0 : 999999999;

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

		let c_dist = args.point_for_distance_check
			? Math.hypot(args.point_for_distance_check[0] - current.x, args.point_for_distance_check[1] - current.y)
			: parent.distance(character, current);

		if (args.max_distance !== undefined && c_dist > args.max_distance) continue;

		if (args.check_min_hp || args.check_max_hp) {
			let c_hp = current.hp;
			if ((args.check_min_hp && c_hp < optimal_hp) || (args.check_max_hp && c_hp > optimal_hp)) {
				optimal_hp = c_hp;
				target = current;
			}
			continue;
		}

		if (c_dist < min_d) {
			min_d = c_dist;
			target = current;
		}
	}
	return target;
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


function find_active_boss() {
	return EVENT_LOCATIONS
		.map(e => ({ name: e.name, data: parent.S[e.name] }))
		.find(e => e.data?.live);
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

function score_by_explosion_spread(pool, aggro_only = false) {
	const explosion_radius = character.explosion || 40;
	const all_monsters = Object.values(parent.entities).filter(e => e?.type === "monster" && !e.dead);

	const scored = pool.map(mob => {
		let count = 0;
		for (const e of all_monsters) {
			if (e === mob) continue;
			if (aggro_only && !e.target) continue;
			if (Math.hypot(e.x - mob.x, e.y - mob.y) <= explosion_radius) count++;
		}
		return { mob, count };
	});

	scored.sort((a, b) => b.count - a.count);
	return scored;
}

const ORBIT_ANGLE_SAMPLES = 16;
const ORBIT_RADIUS_FRACTIONS = [1.0, 0.66, 0.33];

const ORBIT_TRAVEL_WEIGHT = 0.35;
const ORBIT_MIN_GAIN = 20;

function best_orbit_spot(center, radius, score) {
	const here = score(character.x, character.y);
	const incumbent = (here === null || here === undefined) ? -Infinity : here;

	let best = null;
	let best_value = -Infinity;
	let best_raw = -Infinity;

	function consider(x, y) {
		if (!can_move_to(x, y)) return;
		const s = score(x, y);
		if (s === null || s === undefined) return;
		const value = s - Math.hypot(x - character.x, y - character.y) * ORBIT_TRAVEL_WEIGHT;
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
	if (best_raw < incumbent + ORBIT_MIN_GAIN) return { x: character.x, y: character.y };
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
