// --------------------------------------------------------------------------------------------------------------------------------- //
// EVENTS — live boss/seasonal targets, and the goal that walks the party to them
// --------------------------------------------------------------------------------------------------------------------------------- //

function announce_game_event(data) {
	if (!data?.name) return;
	log_msg("event", `[Event] ${data.name} spawned`);
}

const EVENT_JOIN_RETRY_MS = 5000;
const EVENT_REACH = 0.8;
let _last_event_join = 0;

function engage_hp_ok(e) {
	return boss_engageable(e.name, e.data);
}

let _holiday_tried = false;

function event_goal() {
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit && !_holiday_tried) {
		return {
			label: "holiday-tree",
			to: "town",
			disengage: true,
			on_arrive: () => {
				_holiday_tried = true;
				parent.socket.emit("interaction", { type: "newyear_tree" });
			},
		};
	}
	if (character?.s?.holidayspirit) _holiday_tried = false;

	const target = best_event_target();
	boss_field_watch(target);

	if (!target) {
		if (character.ctype === "priest" && boss_field_draining()) {
			return { local: "loot", label: "boss-loot", passive: true };
		}
		return null;
	}

	if (target.join === true && !get_nearest_monster({ type: target.name })) {
		if (Date.now() - _last_event_join > EVENT_JOIN_RETRY_MS) {
			_last_event_join = Date.now();
			parent.socket.emit("join", { name: target.name });
		}
		return null;
	}

	const label = "event-" + target.name;
	const seen = get_nearest_monster({ type: target.name });
	if (seen) boss_watch(seen);
	if (seen && seen.target === character.name && kite_ring(seen)) {
		return { local: "kite", pursuit: true, label, event: target.name };
	}
	if (seen && !boss_strayed(seen)) {
		const stand = event_stand_point(target.name, seen);
		const place = event_place(target, seen);
		if (is_in_range(seen, "attack") || can_move_to(stand.x, stand.y)
			|| Math.hypot(character.x - stand.x, character.y - stand.y) <= EVENT_STAND_ARRIVE
			|| Math.hypot(character.x - place.x, character.y - place.y) <= EVENT_PLACE_ARRIVE) {
			return { local: "event", pursuit: true, label, event: target.name };
		}
		return { pursuit: true, label, event: target.name, map: character.map, x: place.x, y: place.y, radius: EVENT_PLACE_ARRIVE };
	}

	if (target.join) {
		const area = boss_home_area(seen);
		return { label, map: character.map, x: (area[0] + area[2]) / 2, y: (area[1] + area[3]) / 2, radius: EVENT_PLACE_ARRIVE, disengage: true };
	}

	if (!target.map || !isFinite(target.x) || !isFinite(target.y)) return null;

	return { label, map: target.map, x: target.x, y: target.y, radius: EVENT_PLACE_ARRIVE, disengage: true };
}

function event_place(target, boss) {
	return target.spot || (target.join ? boss : target);
}

const BOSS_WATCH_MS = 10000;
let _boss_watch_at = 0;

function boss_watch(boss) {
	const now = Date.now();
	if (now - _boss_watch_at < BOSS_WATCH_MS) return;
	_boss_watch_at = now;

	const pct = boss.max_hp ? Math.round((100 * boss.hp) / boss.max_hp) : 0;
	const flags = [boss_strayed(boss) && "strayed", panicking && "panic", lethal_pursuer() && "evading"].filter(Boolean).join(" ");
	errlog_timeline("boss_watch",
		`${boss.mtype} ${pct}% -> ${boss.target || "none"} @${Math.round(boss.x)},${Math.round(boss.y)}`
		+ ` | me @${Math.round(character.x)},${Math.round(character.y)} d${Math.round(distance(character, boss))}`
		+ ` hp${Math.round((100 * character.hp) / character.max_hp)}% ${current_goal_label() || "-"} ${flags}`);
}

function event_step(event_type, engage_step) {
	const boss = get_nearest_monster({ type: event_type });
	if (!boss) return;
	if (event_spot_step(event_type, boss)) return;
	if (engage_step) return engage_step(boss);
	if (is_in_range(boss, "attack")) return;
	const stand = engage_point(boss);
	local_move(stand.x, stand.y);
}

const EVENT_SPOT_RADIUS = 50;
const EVENT_SPOT_BOSS_REACH = 100;
const EVENT_STAND_ARRIVE = 20;
const EVENT_PLACE_ARRIVE = 60;

function event_rule_here() {
	return EVENT_LOCATIONS.find(e => e.avoid && parent.S[e.name]?.live && parent.S[e.name].map === character.map) || null;
}

function at_event_spot(entry) {
	return Math.hypot(character.x - entry.spot.x, character.y - entry.spot.y) <= EVENT_SPOT_RADIUS;
}

function event_spot_wanted(entry, boss) {
	return !!entry.spot && !at_event_spot(entry)
		&& Math.hypot(boss.x - entry.spot.x, boss.y - entry.spot.y) <= EVENT_SPOT_BOSS_REACH;
}

function event_stand_point(event_type, boss) {
	const entry = EVENT_LOCATIONS.find(e => e.name === event_type);
	return event_spot_wanted(entry, boss) ? entry.spot : engage_point(boss);
}

function event_spot_step(event_type, boss) {
	const entry = EVENT_LOCATIONS.find(e => e.name === event_type);
	if (!event_spot_wanted(entry, boss)) return false;
	if (character.moving && Math.hypot(character.going_x - entry.spot.x, character.going_y - entry.spot.y) <= EVENT_SPOT_RADIUS) return true;
	return local_move(entry.spot.x, entry.spot.y);
}

function pursued_boss() {
	const g = current_goal();
	return g && g.pursuit ? get_nearest_monster({ type: g.event }) : null;
}

function kited_boss() {
	const g = current_goal();
	return g && g.local === "kite" ? get_nearest_monster({ type: g.event }) : null;
}

function kite_step(event_type) {
	const boss = get_nearest_monster({ type: event_type });
	if (boss) orbit_away(kite_ring(boss), boss);
}

function best_event_target() {
	const alive_sorted = EVENT_LOCATIONS
		.filter(e => setting("boss_" + e.name))
		.map(e => ({ ...e, data: parent.S[e.name] }))
		.filter(e => e.data?.live)
		.filter(e => engage_hp_ok(e))
		.map(e => ({ ...e, seen: !!get_nearest_monster({ type: e.name }) }))
		.sort((a, b) => (b.seen - a.seen) || (a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp));

	return alive_sorted.length ? alive_sorted[0] : null;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS FIELD — the healer drains the chests where the boss fell before the party moves on
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSS_LOOT_GRACE_MS = 20000;
const BOSS_LOOT_LINGER_MS = 3000;
const BOSS_LOOT_REACH = 200;

let _boss_field = null;

function boss_field_watch(target) {
	if (target) {
		_boss_field = { map: character.map, at: Date.now() };
		return;
	}
	if (!_boss_field) return;
	if (character.map !== _boss_field.map || Date.now() - _boss_field.at > BOSS_LOOT_GRACE_MS) {
		_boss_field = null;
	}
}

function boss_field_draining() {
	if (!_boss_field) return false;
	if (get_num_chests() > 0) {
		_boss_field.chest_at = Date.now();
		return true;
	}
	return !!_boss_field.chest_at && Date.now() - _boss_field.chest_at < BOSS_LOOT_LINGER_MS;
}

function nearest_chest() {
	const chests = get_chests();
	let best = null;
	let best_distance = Infinity;

	for (const id in chests) {
		const chest = chests[id];
		const d = Math.hypot(character.x - chest.x, character.y - chest.y);
		if (d < best_distance) {
			best_distance = d;
			best = chest;
		}
	}

	return best;
}

function loot_step() {
	const chest = nearest_chest();
	if (!chest) return;
	if (Math.hypot(character.x - chest.x, character.y - chest.y) <= BOSS_LOOT_REACH) return;
	local_move(chest.x, chest.y);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOOT
// --------------------------------------------------------------------------------------------------------------------------------- //

on_boot("World Events", () => {
	on_game_event = announce_game_event;
});
