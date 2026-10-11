// --------------------------------------------------------------------------------------------------------------------------------- //
// WARRIOR MOVEMENT — the scorer that puts the warrior where his damage is highest
// --------------------------------------------------------------------------------------------------------------------------------- //

var WARRIOR_POSITION_SCALE = 100;

function cleave_targets_at(x, y) {
	const radius = G.skills.cleave.range;
	const probe = { x, y, awidth: get_width(character), aheight: get_height(character) };
	let count = 0;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		const gap = distance(probe, e);
		if (CONFIG.combat.cleave_blacklist.includes(e.mtype)) {
			if (gap < radius + SKILL_BLOCKER_MARGIN) return 0;
			continue;
		}
		if (e.visible && gap < radius) count++;
	}
	return count;
}

function warrior_reposition_scorer() {
	const primary = cache.target;
	if (!primary || primary.dead) return null;

	const set_name = weapon_set_to_restore();
	if (!set_name) return null;

	const base = set_damage_value(set_name, warrior_weapon_pool(), 1);
	if (base === null || base <= 0) return null;

	const here_targets = cleave_targets_at(character.x, character.y);
	const here_cleave = cleave_contribution(set_name, here_targets);
	const here = base * here_cleave.uptime + here_cleave.dps;
	if (here <= 0) return null;

	const reach = character.range * 0.9;
	const probe = { x: 0, y: 0, awidth: get_width(character), aheight: get_height(character) };

	return (x, y) => {
		if (Math.hypot(primary.x - x, primary.y - y) > reach) return null;
		if (CONFIG.combat.swap_trick_enabled) {
			probe.x = x;
			probe.y = y;
			if (distance(probe, primary) < SWAP_TRICK_MIN_GAP) return null;
		}

		const targets = cleave_targets_at(x, y);
		const cleave = cleave_contribution(set_name, targets);
		return ((base * cleave.uptime + cleave.dps) / here) * WARRIOR_POSITION_SCALE;
	};
}

var WARRIOR_DETOUR_DIRECTIONS = 16;
var WARRIOR_DETOUR_RADII = [80, 160, 320];
var WARRIOR_DETOUR_ARRIVE = 10;
var WARRIOR_DETOUR_SEARCH_MS = 1000;
var WARRIOR_REGOAL_PX = 8;

var SWAP_TRICK_MIN_GAP = 4;
var SWAP_TRICK_EDGE_GAP = 12;

var _warrior_detour = null;
var _warrior_detour_at = 0;

function warrior_detour_point(goal) {
	let best = null;
	for (const r of WARRIOR_DETOUR_RADII) {
		for (let i = 0; i < WARRIOR_DETOUR_DIRECTIONS; i++) {
			const a = (2 * Math.PI * i) / WARRIOR_DETOUR_DIRECTIONS;
			const x = character.real_x + Math.cos(a) * r;
			const y = character.real_y + Math.sin(a) * r;
			if (!can_move_to(x, y)) continue;
			if (!can_move({ map: character.map, x, y, going_x: goal.x, going_y: goal.y, base: character.base })) continue;
			const cost = r + Math.hypot(goal.x - x, goal.y - y);
			if (!best || cost < best.cost) best = { x, y, cost };
		}
	}
	return best;
}

function warrior_engage_point(target) {
	const gap = Math.min(SWAP_TRICK_EDGE_GAP, character.range / 2);
	const angle = Math.atan2(character.y - target.y, character.x - target.x);
	const r = centre_distance_for_gap({ x: target.x, y: target.y, entity: target }, angle, gap);
	return { x: target.x + Math.cos(angle) * r, y: target.y + Math.sin(angle) * r };
}

function heading_to(goal) {
	return character.moving && Math.hypot(character.going_x - goal.x, character.going_y - goal.y) <= WARRIOR_REGOAL_PX;
}

function warrior_close_in(target) {
	const goal = warrior_engage_point(target);
	if (heading_to(goal)) return;

	if (local_move(goal.x, goal.y)) {
		_warrior_detour = null;
		return;
	}

	if (_warrior_detour
		&& Math.hypot(character.x - _warrior_detour.x, character.y - _warrior_detour.y) <= WARRIOR_DETOUR_ARRIVE) {
		_warrior_detour = null;
	}

	if (!_warrior_detour) {
		const now = Date.now();
		if (now - _warrior_detour_at < WARRIOR_DETOUR_SEARCH_MS) return;
		_warrior_detour_at = now;
		_warrior_detour = warrior_detour_point(goal);
		if (!_warrior_detour) return;
	}

	if (!character.moving) move(_warrior_detour.x, _warrior_detour.y);
}

function warrior_clear_overlap(target) {
	if (!CONFIG.combat.swap_trick_enabled || character.moving) return false;
	if (distance(character, target) >= SWAP_TRICK_MIN_GAP) return false;

	const goal = warrior_engage_point(target);
	if (!local_move(goal.x, goal.y)) return false;

	errlog_count("swap trick overlap cleared");
	return true;
}

function warrior_engage_step(target) {
	if (!is_in_range(target)) {
		warrior_close_in(target);
		return true;
	}
	return warrior_clear_overlap(target);
}

function warrior_event_step(boss) {
	const target = cache.target;
	return warrior_engage_step(takes_one_damage(boss) && target && !target.dead ? target : boss);
}

function warrior_farm_step() {
	const target = cache.target;
	if (target && !target.dead && warrior_engage_step(target)) return;
	default_farm_step();
}

function reposition() {
	orbit_reposition(warrior_reposition_scorer, {
		min_gain: CONFIG.movement.position_min_gain,
		travel_weight: CONFIG.movement.position_travel_weight
	});
}
