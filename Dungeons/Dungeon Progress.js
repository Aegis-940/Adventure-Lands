// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON PROGRESS — what this run has killed, and whether the quota is met
// --------------------------------------------------------------------------------------------------------------------------------- //

const PROGRESS_SEEN_MS = 1000;

let _dungeon_kills = {};
let _dungeon_seen = new Map();
let _dungeon_run_started = 0;

function reset_dungeon_progress() {
	_dungeon_kills = {};
	_dungeon_seen.clear();
	_dungeon_run_started = Date.now();
}

function dungeon_quota() {
	const d = active_dungeon();
	return (d && d.quota) || null;
}

function dungeon_kills(mtype) {
	return _dungeon_kills[mtype] || 0;
}

function dungeon_target_done(mtype) {
	const quota = dungeon_quota();
	if (!quota || quota[mtype] === undefined) return false;
	return dungeon_kills(mtype) >= quota[mtype];
}

function dungeon_quota_met() {
	const quota = dungeon_quota();
	if (!quota) return false;
	return Object.keys(quota).every(m => dungeon_target_done(m));
}

function record_dungeon_kill(mtype) {
	const quota = dungeon_quota();
	if (!quota || quota[mtype] === undefined) return;

	_dungeon_kills[mtype] = dungeon_kills(mtype) + 1;
	const name = (G.monsters[mtype] || {}).name || mtype;
	log_msg("event", `☠️ ${name} ${dungeon_kills(mtype)}/${quota[mtype]}`);

	if (dungeon_target_done(mtype)) log_msg("event", `✅ ${name} complete`);
	if (dungeon_quota_met()) log_msg("event", "🏆 Dungeon quota complete");
}

function dungeon_progress_report() {
	const quota = dungeon_quota();
	if (!quota) return log_msg("info", "No dungeon quota active");
	const mins = Math.round((Date.now() - _dungeon_run_started) / 60000);
	log_msg("info", `Dungeon progress (${mins} min):`);
	for (const mtype of Object.keys(quota)) {
		const name = (G.monsters[mtype] || {}).name || mtype;
		const mark = dungeon_target_done(mtype) ? "✅" : "  ";
		log_msg("info", `${mark} ${name}: ${dungeon_kills(mtype)}/${quota[mtype]}`);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// KILL DETECTION — the hit event carries the kill flag, but the entity may be gone by the time we look it up
// --------------------------------------------------------------------------------------------------------------------------------- //

function remember_dungeon_entities() {
	const quota = dungeon_quota();
	if (!quota) return;
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster") continue;
		if (quota[e.mtype] === undefined) continue;
		_dungeon_seen.set(id, e.mtype);
	}
}

function dungeon_mtype_for(id) {
	const live = parent.entities[id];
	if (live && live.mtype) return live.mtype;
	return _dungeon_seen.get(id) || null;
}

function track_dungeon_kills() {
	on_socket("hit", "dungeon_kill_handler", data => {
		try {
			if (!data || !data.kill || !data.id) return;
			if (!active_dungeon()) return;
			const mtype = dungeon_mtype_for(data.id);
			if (!mtype) return;
			_dungeon_seen.delete(data.id);
			record_dungeon_kill(mtype);
		} catch (e) {
			console.error("dungeon kill handler error", e);
		}
	});
}
