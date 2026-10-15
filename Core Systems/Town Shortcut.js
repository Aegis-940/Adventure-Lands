// --------------------------------------------------------------------------------------------------------------------------------- //
// TOWN SHORTCUT — channel the town teleport while still walking, and land further along the route
// --------------------------------------------------------------------------------------------------------------------------------- //

const TOWN_MIN_GAIN_MS = 3000;
const TOWN_RECHECK_MS = 1000;
const TOWN_OWN_MS = 2000;
const TOWN_SAMPLE_PX = 30;
const TOWN_JUMP_PX = 100;
const TOWN_SPAWN_NEAR = 150;
const TOWN_LANDED_PX = 30;
const TOWN_LANDING_GRACE_MS = 1000;
const TOWN_OWN_CHANGE_GRACE_MS = 500;
const TOWN_LEAD_GONE_GRACE_MS = 1000;
const TOWN_LEAD_SEEN_LANDED_MS = 2500;

let _town = { checked_at: 0, cast_at: 0, label: null, mode: null, lead_at: null, channel: null, logged: null };

function town_spawn() {
	const s = G.maps[character.map].spawns[0];
	return { x: s[0], y: s[1] };
}

function plot_route(head) {
	const route = head.slice();
	for (let i = 0; i < smart.plot.length; i++) {
		const node = smart.plot[i];
		if (node.map !== character.map || node.transport || node.town) break;
		route.push({ x: node.x, y: node.y, idx: i });
	}
	return route;
}

function best_join(route, origin) {
	let best = null;
	let along = 0;
	for (let i = 1; i < route.length; i++) {
		const a = route[i - 1];
		const b = route[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const n = Math.max(1, Math.ceil(len / TOWN_SAMPLE_PX));
		for (let s = 1; s <= n; s++) {
			const x = a.x + (b.x - a.x) * s / n;
			const y = a.y + (b.y - a.y) * s / n;
			const gain = along + len * s / n - Math.hypot(x - origin.x, y - origin.y);
			if (best && gain <= best.gain) continue;
			if (!can_move({ map: character.map, x: origin.x, y: origin.y, going_x: x, going_y: y, base: character.base })) continue;
			best = { x, y, gain, next: b.idx };
		}
		along += len;
	}
	return best;
}

const SPAWN_GRID = 20;
const SPAWN_STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const _spawn_walk = {};

function spawn_walk_field(map) {
	const g = G.geometry[map];
	const s = G.maps[map].spawns[0];
	const origin = [Math.round(s[0] / SPAWN_GRID), Math.round(s[1] / SPAWN_GRID)];
	const dist = { [origin[0] + "," + origin[1]]: 0 };
	const queue = [origin];
	for (let h = 0; h < queue.length; h++) {
		const [cx, cy] = queue[h];
		const d = dist[cx + "," + cy];
		for (const [dx, dy, w] of SPAWN_STEPS) {
			const x = cx + dx;
			const y = cy + dy;
			const key = x + "," + y;
			const nd = d + w * SPAWN_GRID;
			if (dist[key] !== undefined && dist[key] <= nd) continue;
			if (x * SPAWN_GRID < g.min_x || x * SPAWN_GRID > g.max_x || y * SPAWN_GRID < g.min_y || y * SPAWN_GRID > g.max_y) continue;
			if (!can_move({ map, x: cx * SPAWN_GRID, y: cy * SPAWN_GRID, going_x: x * SPAWN_GRID, going_y: y * SPAWN_GRID, base: character.base })) continue;
			if (dist[key] === undefined) queue.push([x, y]);
			dist[key] = nd;
		}
	}
	return dist;
}

function walk_from_spawn(x, y) {
	const field = _spawn_walk[character.map] || (_spawn_walk[character.map] = spawn_walk_field(character.map));
	const d = field[Math.round(x / SPAWN_GRID) + "," + Math.round(y / SPAWN_GRID)];
	return d === undefined ? Infinity : d;
}

function best_spawn_join(route) {
	let best = null;
	let along = 0;
	for (let i = 1; i < route.length; i++) {
		const a = route[i - 1];
		const b = route[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const n = Math.max(1, Math.ceil(len / TOWN_SAMPLE_PX));
		for (let s = 1; s <= n; s++) {
			const gain = along + len * s / n - walk_from_spawn(a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n);
			if (!best || gain > best.gain) best = { gain };
		}
		along += len;
	}
	return best;
}

function party_untargeted() {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (e.target === character.name || COHESION_FOLLOWERS.includes(e.target)) return false;
	}
	return true;
}

function town_near_spawn() {
	const s = town_spawn();
	return Math.hypot(character.real_x - s.x, character.real_y - s.y) <= TOWN_SPAWN_NEAR;
}

function town_shortcut_eligible() {
	if (character.rip || G.maps[character.map].instance || in_dungeon()) return false;
	if (town_near_spawn()) return false;
	return monsters_targeting_me() === 0;
}

function town_note(event, ch) {
	errlog_count("town shortcut " + event);
	errlog_timeline("town", `${event} ${ch.mode}${ch.label ? " " + ch.label : ""} @${Math.round(character.x)},${Math.round(character.y)} ${character.map}`);
}

function town_cast(label, mode, lead_at) {
	_town.cast_at = Date.now();
	_town.label = label;
	_town.mode = mode;
	_town.lead_at = lead_at;
	town_teleport();
}

function town_cancel(ch, reason) {
	ch.mine = false;
	cancel_town_channel();
	town_note("cancelled", ch);
	log_msg("event", `🌀 Town teleport cancelled — ${reason}`);
}

function town_channel_watch(ch) {
	if (!ch.mine || ch.landed || ch.mode === "join" || ch.lead_landed) return;
	if (ch.mode === "own") {
		const g = current_goal();
		if ((g && g.hold) || (travel_is_active() && current_goal_label() === ch.label)) {
			ch.changed_at = 0;
			return;
		}
		if (!ch.changed_at) {
			ch.changed_at = Date.now();
			return;
		}
		if (Date.now() - ch.changed_at < TOWN_OWN_CHANGE_GRACE_MS) return;
		town_cancel(ch, "the journey changed");
		return;
	}
	const lead = get_player(MOVEMENT_LEADER);
	const now = Date.now();
	if (lead && lead.c.town) {
		ch.lead_at = { x: lead.x, y: lead.y };
		if (!ch.lead_seen_at || ch.lead_gone_at) ch.lead_seen_at = now;
		ch.lead_gone_at = 0;
		return;
	}
	const s = town_spawn();
	if (!lead
		|| Math.hypot(lead.x - ch.lead_at.x, lead.y - ch.lead_at.y) > TOWN_JUMP_PX
		|| Math.hypot(lead.x - s.x, lead.y - s.y) <= TOWN_LANDED_PX
		|| (ch.lead_seen_at && now - ch.lead_seen_at >= TOWN_LEAD_SEEN_LANDED_MS)) {
		ch.lead_landed = true;
		return;
	}
	if (!ch.lead_gone_at) {
		ch.lead_gone_at = now;
		return;
	}
	if (now - ch.lead_gone_at < TOWN_LEAD_GONE_GRACE_MS) return;
	town_cancel(ch, `${MOVEMENT_LEADER} stopped hers`);
}

function leader_waiting_at_spawn() {
	const pos = leader_position();
	const s = town_spawn();
	return pos.map === character.map
		&& Math.hypot(pos.x - s.x, pos.y - s.y) <= TOWN_SPAWN_NEAR
		&& Math.hypot(character.x - pos.x, character.y - pos.y) > cohesion_range();
}

function town_copy_leader() {
	if (!follow_has_leader() || !town_shortcut_eligible()) return false;
	const lead = get_player(MOVEMENT_LEADER);
	const mode = lead && lead.c.town ? "copy" : leader_waiting_at_spawn() ? "join" : null;
	if (!mode) return false;
	if (Date.now() - _town.cast_at < TOWN_RECHECK_MS) return true;
	if (_town.logged !== mode) {
		_town.logged = mode;
		log_msg("event", mode === "copy" ? `🌀 Following ${MOVEMENT_LEADER}'s town teleport` : `🌀 Teleporting to ${MOVEMENT_LEADER} at the spawn`);
	}
	town_cast(null, mode, mode === "copy" ? { x: lead.x, y: lead.y } : null);
	return true;
}

function town_shortcut_plan() {
	if (follow_has_leader() || !town_shortcut_eligible()) return;
	if (!smart.moving || !smart.found || smart.use_town) return;
	const goal = current_goal();
	if (!goal || goal.local || goal.hold) return;
	if (!party_untargeted()) return;
	const first = smart.plot[0];
	if (first && !first.transport && !first.town && (first.map !== character.map || !can_move_to(first.x, first.y))) return;

	const now = Date.now();
	if (now - _town.checked_at < TOWN_RECHECK_MS) return;
	_town.checked_at = now;

	const head = [{ x: character.real_x, y: character.real_y, idx: -1 }];
	if (character.moving) head.push({ x: character.going_x, y: character.going_y, idx: -1 });
	const join = best_spawn_join(plot_route(head));
	if (!join) return;

	const saved_ms = join.gain / character.speed * 1000 - G.conditions.town.duration - min_ping();
	if (saved_ms < TOWN_MIN_GAIN_MS) return;

	errlog_count("town shortcut cast");
	if (_town.logged !== goal.label) {
		_town.logged = goal.label;
		log_msg("event", `🌀 Town shortcut on "${goal.label}" — saves ~${Math.round(saved_ms / 1000)}s`);
	}
	town_cast(goal.label, "own", null);
}

function town_shortcut_check() {
	const ch = _town.channel;
	if (ch && !ch.landed) town_landed();
	if (town_channelling()) {
		if (!_town.channel) {
			const mine = Date.now() - _town.cast_at < TOWN_OWN_MS;
			_town.channel = { mine, mode: _town.mode, label: _town.label, lead_at: _town.lead_at, landed: false, gone_at: 0 };
			if (mine) town_note("channelling", _town.channel);
		}
		_town.channel.gone_at = 0;
		return town_channel_watch(_town.channel);
	}
	if (ch) {
		if (!ch.landed) {
			if (!ch.gone_at) ch.gone_at = Date.now();
			if (Date.now() - ch.gone_at < TOWN_LANDING_GRACE_MS) return;
			if (ch.mine) town_note("interrupted", ch);
		}
		_town.channel = null;
	}
	if (town_copy_leader()) return;
	town_shortcut_plan();
}

let _map_seen = null;

function map_changed() {
	if (character.map === _map_seen) return;
	const from = _map_seen;
	_map_seen = character.map;
	if (!from) return;
	errlog_timeline("map", `${from} -> ${character.map} @${Math.round(character.real_x)},${Math.round(character.real_y)} ${current_goal_label() || "-"}`);
}

function town_landed() {
	const ch = _town.channel;
	if (!ch || ch.landed) return;
	const s = town_spawn();
	if (Math.hypot(character.real_x - s.x, character.real_y - s.y) > TOWN_LANDED_PX) return;
	ch.landed = true;
	_town.logged = null;
	town_note("landed", ch);
	if (!smart.moving || !smart.found) return;
	const route = plot_route([{ x: character.going_x, y: character.going_y, idx: -1 }]);
	const join = best_join(route, { x: character.real_x, y: character.real_y });
	if (join) {
		smart.plot = [{ map: character.map, x: join.x, y: join.y }].concat(smart.plot.slice(join.next));
		return;
	}
	smart.plot = [];
	smart.found = smart.searching = false;
}
