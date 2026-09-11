// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, combat positioning
// --------------------------------------------------------------------------------------------------------------------------------- //

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

function burn_multiplier_at_dps(mob, chance, dps, party_factor) {
	if (!chance) return 1;
	return 1 + (chance / 100) * (burn_ticks_at_dps(mob, dps, party_factor) / 5);
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

function splash_bonus(mob, explosion) {
	if (!mob || !explosion) return 0;

	const radius = explosion_radius(explosion);
	let bonus = 0;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e?.type !== "monster" || e.dead) continue;
		if (e === mob || e.id === mob.id) continue;
		if (distance(e, mob) > radius) continue;

		const reduction = defense_reduction((e.armor || 0) - (character.apiercing || 0));
		bonus += (explosion / 100) * reduction;
	}
	return bonus;
}

function score_by_explosion_spread(pool, aggro_only = false, radius, centre_metric) {
	const r = radius === undefined ? explosion_radius() : radius;

	const scored = pool.map(mob => ({ mob, count: count_neighbours(mob, r, aggro_only, centre_metric) }));

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
