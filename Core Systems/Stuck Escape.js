// --------------------------------------------------------------------------------------------------------------------------------- //
// STUCK ESCAPE — last resort when pathfinding cannot leave where we are
// --------------------------------------------------------------------------------------------------------------------------------- //

const STUCK_MOVE_EPSILON = 20;
const STUCK_REQUIRED_MS = 60000;
const STUCK_ESCAPE_COOLDOWN_MS = 300000;
const STUCK_TOWN_WAIT_MS = 12000;
const STUCK_RETRY_MS = 15000;
const STUCK_LANDED_RANGE = 150;

let _stuck_anchor = null;
let _stuck_since = 0;
let _last_stuck_escape = 0;
let _stuck_escape = null;

function stuck_escape_landed() {
	const from = _stuck_escape;
	if (character.map !== from.map) return true;
	const spawn = G.maps[character.map].spawns[0];
	return Math.hypot(character.x - spawn[0], character.y - spawn[1]) <= STUCK_LANDED_RANGE;
}

function stuck_escape_settle(now) {
	if (stuck_escape_landed()) {
		_last_stuck_escape = now;
		_stuck_escape = null;
		log_msg("event", "🚨 Stuck escape landed");
		return;
	}
	if (now - _stuck_escape.at < STUCK_TOWN_WAIT_MS) return;
	_stuck_escape = null;
	_last_stuck_escape = now - STUCK_ESCAPE_COOLDOWN_MS + STUCK_RETRY_MS;
	log_msg("warn", `Stuck escape did not land — retrying in ${STUCK_RETRY_MS / 1000}s`);
}

function stuck_escape_check() {
	if (!destination) return;
	if (character.rip) return;

	const now = Date.now();
	if (_stuck_escape) return stuck_escape_settle(now);

	if (!is_travelling()) { _stuck_anchor = null; return; }

	if (follow_has_leader()) {
		const lead = get_player(MOVEMENT_LEADER);
		if (lead && !lead.rip) { _stuck_anchor = null; return; }
	}

	if (destination.map && character.map === destination.map) { _stuck_anchor = null; return; }

	if (G.maps[character.map].instance || character.cave) return;

	const progressed = !_stuck_anchor
		|| _stuck_anchor.map !== character.map
		|| Math.hypot(character.x - _stuck_anchor.x, character.y - _stuck_anchor.y) > STUCK_MOVE_EPSILON;

	if (progressed) {
		_stuck_anchor = { map: character.map, x: character.x, y: character.y };
		_stuck_since = now;
		return;
	}

	const stuck_ms = now - _stuck_since;
	if (stuck_ms < STUCK_REQUIRED_MS) return;
	if (character.c?.town) return;
	if (now - _last_stuck_escape < STUCK_ESCAPE_COOLDOWN_MS) return;

	if (monsters_targeting_me() > 0) return;

	_stuck_since = now;
	_stuck_escape = { at: now, map: character.map };
	log_msg("warn", `Stuck on ${character.map} for ${Math.round(stuck_ms / 1000)}s — using town to escape.`);
	town_teleport();
}
