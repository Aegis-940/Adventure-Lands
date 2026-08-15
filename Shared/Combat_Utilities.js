// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, event handling
// (split out of Game_Config.js — real <script> tag, same global scope, no eval boundary)
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

// Returns true if the target character is within 500 units
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

function should_handle_events() {
	const holiday_spirit = parent?.S?.holidayseason && !character?.s?.holidayspirit;
	const has_handleable_event = EVENT_LOCATIONS.some(e => parent?.S?.[e.name]?.live);
	return holiday_spirit || has_handleable_event;
}

function handle_events() {
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit) {
		if (!smart.moving) {
			smart_move({ to: "town" }, () => {
				parent.socket.emit("interaction", { type: "newyear_tree" });
			});
		}
		return;
	}

	const alive_sorted = EVENT_LOCATIONS
		.map(e => {
			const data = parent.S[e.name];
			if (e.dynamic && data?.live) {
				return { ...e, map: data.map, x: data.x, y: data.y, data };
			}
			return { ...e, data };
		})
		.filter(e => e.data?.live)
		.sort((a, b) => (a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp));

	if (!alive_sorted.length) return;

	// Wabbit takes exclusive priority when alive
	const wabbit = alive_sorted.find(e => e.name === "wabbit");
	const target = wabbit || alive_sorted[0];

	// Some events (no fixed map/x/y — franky) require joining an instance first. Keep
	// re-joining until the monster is actually visible, then fall through to the normal
	// move/attack handling below instead of gating on target.map, which join-type entries don't set.
	if (target.join === true && !get_nearest_monster({ type: target.name })) {
		parent.socket.emit("join", { name: target.name });
		return;
	}

	if (!smart.moving) {
		handle_specific_event(target.name, target.map, target.x, target.y);
	}
}

async function handle_specific_event(event_type, map_name, x, y) {
	if (!parent?.S?.[event_type]?.live) return;

	const monster = get_nearest_monster({ type: event_type });
	if (!monster) {
		smart_move({ x, y, map: map_name });
		return;
	}

	const halfway_x = character.x + (monster.x - character.x) / 2;
	const halfway_y = character.y + (monster.y - character.y) / 2;

	if (!is_in_range(monster, "attack") && !smart.moving) {
		await xmove(halfway_x, halfway_y);
	}
}

