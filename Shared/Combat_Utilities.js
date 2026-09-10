// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, event handling
// --------------------------------------------------------------------------------------------------------------------------------- //

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE MACHINE
// --------------------------------------------------------------------------------------------------------------------------------- //

function is_boss_alive() {
	return BOSSES.some(name => {
		const s = parent.S[name];
		return (
			s &&
			s.live === true
		);
	});
}

function is_bscorpion_alive() {
	let found = false;
	if (HEALER_TARGET    === MONSTER_LOCS.bscorpion || WARRIOR_TARGET   === MONSTER_LOCS.bscorpion || RANGER_TARGET    === MONSTER_LOCS.bscorpion){
		const TARGET_LOC = { map: "desertland", x: -408, y: -1266 };
		const within_200 = character.map === TARGET_LOC.map &&
			Math.hypot(character.x - TARGET_LOC.x, character.y - TARGET_LOC.y) <= 200;
		if (within_200) {
			found = true;
		}
	}
	if (found) {
		PRIM_FARM_LOOT_ENABLED = true;
	} else {
		PRIM_FARM_LOOT_ENABLED = false;
	}
	return found;
}


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

function detect_character(target) {
	if (!target || !character || typeof target.x !== "number" || typeof target.y !== "number" || typeof character.x !== "number" || typeof character.y !== "number") return false;
	const dx = target.x - character.x;
	const dy = target.y - character.y;
	const distance = Math.sqrt(dx * dx + dy * dy);
	return distance <= 500;
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

	const goal = typeof current_goal_label === "function" ? current_goal_label() : null;
	if (goal === "follow" || goal === "follow-ring") return true;

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
	} catch (e) { /* storage unavailable */ }
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

function engage_hp_ok(e) {
	if (e.engage_below === undefined) return true;
	const max = (G.monsters?.[e.name]?.hp) || e.data?.max_hp;
	if (!max || !e.data?.hp) return true;
	return e.data.hp <= max * e.engage_below;
}

const EVENT_JOIN_RETRY_MS = 5000;
let _last_event_join = 0;

function event_goal() {
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit) {
		return {
			label: "holiday-tree",
			to: "town",
			on_arrive: () => parent.socket.emit("interaction", { type: "newyear_tree" }),
		};
	}

	const target = best_event_target();
	if (!target) return null;

	if (target.join === true && !get_nearest_monster({ type: target.name })) {
		if (Date.now() - _last_event_join > EVENT_JOIN_RETRY_MS) {
			_last_event_join = Date.now();
			parent.socket.emit("join", { name: target.name });
		}
		return { hold: true, label: "event-join" };
	}

	const seen = get_nearest_monster({ type: target.name });
	if (seen) {
		const half_x = character.x + (seen.x - character.x) / 2;
		const half_y = character.y + (seen.y - character.y) / 2;
		if (is_in_range(seen, "attack") || can_move_to(half_x, half_y)) {
			return { local: "event", label: "event-" + target.name, event: target.name };
		}
		return { label: "event-" + target.name, map: seen.map || target.map, x: seen.x, y: seen.y, radius: 60 };
	}

	if (!target.map || !isFinite(target.x) || !isFinite(target.y)) {
		return { hold: true, label: "event-join" };
	}

	return { label: "event-" + target.name, map: target.map, x: target.x, y: target.y, radius: 60 };
}

function event_step(event_type) {
	if (!parent?.S?.[event_type]?.live) return;
	const monster = get_nearest_monster({ type: event_type });
	if (!monster) return;
	if (is_in_range(monster, "attack")) return;
	local_move(character.x + (monster.x - character.x) / 2, character.y + (monster.y - character.y) / 2);
}

function best_event_target() {
	const alive_sorted = EVENT_LOCATIONS
		.map(e => {
			const data = parent.S[e.name];
			if (e.dynamic && data?.live) {
				return { ...e, map: data.map, x: data.x, y: data.y, data };
			}
			return { ...e, data };
		})
		.filter(e => e.data?.live)
		.filter(e => engage_hp_ok(e))
		.sort((a, b) => (a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp));

	if (!alive_sorted.length) return null;

	const wabbit = alive_sorted.find(e => e.name === "wabbit");
	return wabbit || alive_sorted[0];
}
