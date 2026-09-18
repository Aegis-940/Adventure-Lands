// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT & CHARACTER UTILITIES — monster targeting, distance/aggro helpers, combat positioning
// COMBAT UTILITIES — monster and entity queries, boss and party state predicates


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

function boss_max_hp(name, data) {
	return (G.monsters?.[name]?.hp) || data?.max_hp || 0;
}

function boss_nearly_dead(name, hp, max_hp) {
	const max = max_hp || boss_max_hp(name, null);
	if (!max || !hp) return false;
	return hp <= max * BOSS_NEARLY_DEAD_HP;
}

function boss_blocks_cleave(e) {
	if (!e || e.dead || !CONFIG.combat.all_bosses.includes(e.mtype)) return false;
	if (CONFIG.combat.cleave_boss_blacklist?.includes(e.mtype)) return true;
	return boss_nearly_dead(e.mtype, e.hp, e.max_hp);
}

function boss_engageable(name, data) {
	const entry = EVENT_LOCATIONS.find(e => e.name === name);
	if (!entry || entry.engage_below === undefined) return true;

	const max = boss_max_hp(name, data);
	if (!max || !data?.hp) return true;
	return data.hp <= max * entry.engage_below;
}

function boss_engaged() {
	const boss = find_active_boss();
	return !!boss && boss_engageable(boss.name, boss.data);
}

function travel_blocks_combat() {
	if (dungeon_flag("fight_while_moving")) return false;
	return is_travelling();
}

function should_pause_combat_loop() {
	if (dungeon_bailing()) return true;
	if (panicking) return true;
	if (typeof anniversary_travel !== "undefined" && anniversary_travel) return true;

	if (dungeon_flag("fight_while_moving")) return false;

	if (typeof travel_is_active === "function" && travel_is_active()) return true;
	if (smart.moving) return true;

	const goal = typeof current_goal === "function" ? current_goal() : null;
	if (goal && goal.chasing) return true;

	if (dungeon_flag("combat_always_on")) return false;
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
