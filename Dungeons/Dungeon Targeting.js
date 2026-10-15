// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON TARGETING — what a run may hit: the whitelist, the avoided types, the focus target, suppressed types and aggro
// --------------------------------------------------------------------------------------------------------------------------------- //

function dungeon_target_whitelist() {
	const d = active_dungeon();
	return d && d.only ? d.only : null;
}

function dungeon_avoids(mtype) {
	const d = active_dungeon();
	return !!(d && d.avoid && d.avoid.includes(mtype));
}

let _dungeon_focus_target_id = null;

function set_dungeon_focus_target(id) {
	_dungeon_focus_target_id = id || null;
}

function dungeon_focus_target() {
	if (!_dungeon_focus_target_id) return null;
	const e = parent.entities[_dungeon_focus_target_id];
	if (!e || e.dead || e.type !== "monster") {
		_dungeon_focus_target_id = null;
		return null;
	}
	return e;
}

const DUNGEON_FOCUS_TTL_MS = 200;

let _dungeon_focus_cache = null;
let _dungeon_focus_at = 0;

function dungeon_type_alive(mtype) {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && !e.dead && e.mtype === mtype) return true;
	}
	return false;
}

function dungeon_suppressed_types() {
	const now = Date.now();
	if (now - _dungeon_focus_at < DUNGEON_FOCUS_TTL_MS) return _dungeon_focus_cache;

	_dungeon_focus_at = now;
	_dungeon_focus_cache = null;

	const d = active_dungeon();
	if (!d || !d.focus) return null;

	for (const rule of d.focus) {
		if (dungeon_target_done(rule.when)) continue;
		if (!dungeon_type_alive(rule.when)) continue;
		if (!_dungeon_focus_cache) _dungeon_focus_cache = [];
		for (const m of rule.suppress) {
			if (!_dungeon_focus_cache.includes(m)) _dungeon_focus_cache.push(m);
		}
	}
	return _dungeon_focus_cache;
}

function dungeon_skip_target(mob) {
	if (mob.cave && !cave_hostile(mob)) return true;

	const d = active_dungeon();
	if (!d || !mob) return false;
	if (dungeon_avoids(mob.mtype)) return true;

	const on_party = !!(mob.target && DUNGEON_PARTY.includes(mob.target));

	if (d.follow_focus && character.name !== MOVEMENT_LEADER) {
		if (on_party) return false;
		const focus = dungeon_focus_target();
		return !focus || mob.id !== focus.id;
	}

	if (on_party) return false;

	const suppressed = dungeon_suppressed_types();
	if (suppressed && suppressed.includes(mob.mtype)) return true;

	if (d.only && !d.only.includes(mob.mtype)) return true;
	return false;
}

function dungeon_aggro_suppressed() {
	const d = active_dungeon();
	if (!d || !d.suppress_aggro_when) return false;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (!d.suppress_aggro_when.includes(e.mtype)) continue;
		if (e.target && DUNGEON_PARTY.includes(e.target)) return true;
	}
	return false;
}
