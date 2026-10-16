// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON ENTRY — gathering the party at the entrance, getting everyone into the instance, and back in after an ejection
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_PARTY_TIMEOUT_MS = 2 * 60 * 1000;
const DUNGEON_JOIN_TIMEOUT_MS = 90000;
const DUNGEON_JOIN_INTERVAL_MS = 400;
const DUNGEON_ENTRANCE_RANGE = 150;

let _dungeon_joining = false;

async function join_dungeon_instance(data) {
	if (_dungeon_joining) return;
	const instance_id = data.in;
	const map = data.map || "spider_instance";
	const entrance = data.entrance;

	_dungeon_joining = true;
	_dungeon_moving = true;
	stop_movement("joining the instance");

	try {
		if (entrance && character.map !== map) {
			const adrift = character.map !== entrance.map
				|| Math.hypot(character.x - entrance.x, character.y - entrance.y) > DUNGEON_ENTRANCE_RANGE;
			if (adrift) {
				log_msg("event", "🚪 Behind the party — walking to the entrance");
				try { await smarter_move(entrance); } catch (e) { }
			}
		}

		const until = Date.now() + DUNGEON_JOIN_TIMEOUT_MS;
		while (Date.now() < until) {
			if (character.map === map) {
				send_cm("Myras", { type: "instance_ready" });
				return;
			}
			try { await enter(map, instance_id); } catch (e) { }
			await sleep(DUNGEON_JOIN_INTERVAL_MS);
		}

		log_msg("error", `Gave up entering the instance after ${DUNGEON_JOIN_TIMEOUT_MS / 1000}s`);
	} finally {
		_dungeon_joining = false;
		_dungeon_moving = false;
	}
}

const DUNGEON_EXIT_WAIT_MS = 3 * 60 * 1000;
const DUNGEON_EXIT_POLL_MS = 1000;
const DUNGEON_ASSEMBLE_RANGE = 200;
const DUNGEON_ASSEMBLE_WAIT_MS = 3 * 60 * 1000;
const DUNGEON_ENTER_SETTLE_MS = 3000;
const DUNGEON_ENTER_TIMEOUT_MS = 20000;
const DUNGEON_ENTER_POLL_MS = 250;

function wait_until_on_map(map) {
	return wait_until(() => character.map === map, DUNGEON_ENTER_TIMEOUT_MS, DUNGEON_ENTER_POLL_MS);
}

function followers_still_inside(dungeon) {
	return DUNGEON_FOLLOWERS.filter(name => {
		const s = read_state_cache(name);
		return s && s.map === dungeon.map;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// REJOIN WATCH — a follower who died and was ejected has to get back in, not stand outside following a leader it cannot reach
// --------------------------------------------------------------------------------------------------------------------------------- //

const DUNGEON_REJOIN_WATCH_MS = 5000;

function dungeon_rejoin_watch() {
	if (character.name === MOVEMENT_LEADER) return;
	if (!DUNGEON_FOLLOWERS.includes(character.name)) return;
	if (_dungeon_joining || character.rip) return;
	if (!dungeon_override()) return;
	if (dungeon_bailing()) return;

	const d = active_dungeon();
	if (!d || character.map === d.map) return;

	const lead = read_state_cache(MOVEMENT_LEADER);
	if (!lead || lead.rip || lead.map !== d.map || !lead.in) return;

	log_msg("event", "🚪 Left behind — rejoining the instance");
	join_dungeon_instance({ in: lead.in, map: d.map, entrance: d.entrance });
}

function followers_away_from_entrance(dungeon) {
	const e = dungeon.entrance;
	return DUNGEON_FOLLOWERS.filter(name => {
		const s = read_state_cache(name);
		if (!s || s.rip) return false;
		if (s.map !== e.map) return true;
		return Math.hypot(s.x - e.x, s.y - e.y) > DUNGEON_ASSEMBLE_RANGE;
	});
}

async function wait_for_party_at_entrance(dungeon) {
	if (!followers_away_from_entrance(dungeon).length) return true;

	dungeon_log(dungeon, "Waiting for the party to reach the entrance...");
	if (await wait_until(() => !followers_away_from_entrance(dungeon).length, DUNGEON_ASSEMBLE_WAIT_MS, DUNGEON_EXIT_POLL_MS)) {
		dungeon_log(dungeon, "Party assembled at the entrance");
		return true;
	}

	dungeon_log(dungeon,
		`${followers_away_from_entrance(dungeon).join(", ")} never reached the entrance — entering anyway`,
		"warn");
	return false;
}

async function wait_for_party_out(dungeon) {
	if (!followers_still_inside(dungeon).length) return true;

	dungeon_log(dungeon, "Waiting for the party to clear the old instance...");
	if (await wait_until(() => !followers_still_inside(dungeon).length, DUNGEON_EXIT_WAIT_MS, DUNGEON_EXIT_POLL_MS)) {
		dungeon_log(dungeon, "Party is clear");
		return true;
	}

	dungeon_log(dungeon,
		`${followers_still_inside(dungeon).join(", ")} never left — entering anyway`, "warn");
	return false;
}

function wait_for_party_in_instance(dungeon) {
	return new Promise((resolve, reject) => {
		const confirmed = new Set();
		const timer = setTimeout(() => {
			remove_cm_listener(listener);
			reject(new Error(`party did not enter the instance within ${DUNGEON_PARTY_TIMEOUT_MS / 60000} min (${confirmed.size}/${DUNGEON_FOLLOWERS.length})`));
		}, DUNGEON_PARTY_TIMEOUT_MS);
		const listener = (name, data) => {
			if (data.type === "instance_ready" && DUNGEON_FOLLOWERS.includes(name)) {
				confirmed.add(name);
				dungeon_log(dungeon, `${name} entered instance (${confirmed.size}/${DUNGEON_FOLLOWERS.length})`);
				if (confirmed.size >= DUNGEON_FOLLOWERS.length) {
					clearTimeout(timer);
					remove_cm_listener(listener);
					resolve();
				}
			}
		};
		add_cm_listener(listener);
	});
}
