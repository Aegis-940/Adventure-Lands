// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, combat positioning
// COMBAT UTILITIES — monster and entity queries, boss and party state predicates


function min_ping() {
	return parent.pings.length ? Math.min(...parent.pings) : 0;
}

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill];
	if (next_skill === undefined) return 0;
	const ms = next_skill.getTime() - Date.now() - min_ping();
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
		if (dungeon_skip_target(current)) continue;

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

function free_inventory_slots() {
	return character.items.filter(it => !it).length;
}

function get_num_chests() {
	return Object.keys(get_chests()).length;
}

function get_party_members() {
	return Object.keys(get_party() || {});
}

function panic_mp_reserve() {
	return skill_mp_cost("scare") + 200;
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

function boss_max_hp(name) {
	return G.monsters[name].hp;
}

function boss_nearly_dead(name, hp, max_hp) {
	const max = max_hp || boss_max_hp(name);
	if (!max || !hp) return false;
	return hp <= max * BOSS_NEARLY_DEAD_HP;
}

function boss_blocks_cleave(e) {
	if (!e || e.dead || !CONFIG.combat.all_bosses.includes(e.mtype)) return false;
	if (CONFIG.combat.cleave_boss_blacklist.includes(e.mtype)) return true;
	return boss_nearly_dead(e.mtype, e.hp, e.max_hp);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LETHAL MONSTERS — a monster with no target turns on whoever touches it first, so nobody touches one whose hit they cannot take
// --------------------------------------------------------------------------------------------------------------------------------- //

const LETHAL_HIT_PCT = 0.5;
const SPLASH_TOUCH_MARGIN = 10;

function hit_too_big(mob, player) {
	return monster_hit_on(mob, player) >= player.max_hp * LETHAL_HIT_PCT;
}

function off_limits(mob) {
	const rule = event_rule_here();
	if (!rule || mob.mtype === rule.name) return false;
	return rule.avoid.includes(mob.mtype) || !at_event_spot(rule);
}

function must_not_touch(mob) {
	return off_limits(mob) || (!mob.target && hit_too_big(mob, character));
}

function splash_would_touch(mob, explosion) {
	if (!explosion) return false;
	const radius = explosion_radius(explosion) + SPLASH_TOUCH_MARGIN;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || e.id === mob.id) continue;
		if (must_not_touch(e) && distance(e, mob) <= radius) return true;
	}
	return false;
}

function safe_to_touch(mob, explosion) {
	return !must_not_touch(mob) && !splash_would_touch(mob, explosion);
}

function lethal_pursuer() {
	let nearest = null;
	let nearest_gap = Infinity;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || e.target !== character.name) continue;
		if (!hit_too_big(e, character)) continue;
		const gap = distance(character, e);
		if (gap < nearest_gap) {
			nearest = e;
			nearest_gap = gap;
		}
	}
	return nearest;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS LEASH — a boss that has left its spawn area is chasing someone; following it only drags the fight across the map
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSS_LEASH_MARGIN = 200;
const BOSS_RETURN_MARGIN = 150;

const _boss_strayed = {};

function boss_home_area(mob) {
	const event = EVENT_LOCATIONS.find(e => e.name === mob.mtype);
	if (event && event.leash === false) return null;
	const spawns = (G.maps[mob.map || character.map] || {}).monsters || [];
	const entry = spawns.find(s => s.type === mob.mtype && s.boundary && !s.roam);
	return entry ? entry.boundary : null;
}

function boss_strayed(mob) {
	const area = boss_home_area(mob);
	if (!area) return false;
	const m = _boss_strayed[mob.id] ? BOSS_RETURN_MARGIN : BOSS_LEASH_MARGIN;
	const outside = mob.x < area[0] - m || mob.y < area[1] - m || mob.x > area[2] + m || mob.y > area[3] + m;
	_boss_strayed[mob.id] = !!mob.target && outside;
	return _boss_strayed[mob.id];
}

function boss_engageable(name, data) {
	const entry = EVENT_LOCATIONS.find(e => e.name === name);
	if (!entry || entry.engage_below === undefined) return true;

	const max = boss_max_hp(name);
	if (!max || !data.hp) return true;
	return data.hp <= max * entry.engage_below;
}

function travel_blocks_combat() {
	if (dungeon_flag("fight_while_moving")) return false;
	return is_travelling();
}

function cave_paused() {
	return !!(character.cave && character.cave.paused);
}

function should_pause_combat_loop() {
	if (cave_paused()) return true;
	if (dungeon_bailing()) return true;
	if (panicking) return true;
	if (anniversary_travel && !follow_has_leader()) return true;
	if (disengaging()) return true;

	if (dungeon_flag("fight_while_moving")) return false;

	if (travel_is_active()) return true;
	if (smart.moving) return true;

	const goal = current_goal();
	if (goal && goal.chasing) return true;
	if (goal && goal.pursuit) return false;

	if (dungeon_flag("combat_always_on")) return false;
	if (character.name === MOVEMENT_LEADER) return false;
	const leader = get_player(MOVEMENT_LEADER);
	const defending = monsters_targeting_me() > 0;
	if (!leader || distance(character, leader) > 200) return !defending;
	return leader.rip && !defending;
}
