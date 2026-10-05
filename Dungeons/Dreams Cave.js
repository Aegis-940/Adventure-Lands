// --------------------------------------------------------------------------------------------------------------------------------- //
// CAVE OF MANY DREAMS — the daily generated dungeon: one visit a day, three floors, three objectives a floor
// --------------------------------------------------------------------------------------------------------------------------------- //

const DREAMS_DORR = { map: "main", x: 816, y: 1200 };
const DREAMS_DORR_RANGE = 150;
const DREAMS_WATCH_MS = 1000;
const DREAMS_POLL_MS = 250;
const DREAMS_CHECK_MS = 10 * 60 * 1000;
const DREAMS_RETRY_MS = 30 * 60 * 1000;
const DREAMS_RETURN_RETRY_MS = 30000;
const DREAMS_START_DELAY_MS = 5000;
const DREAMS_ENTRY_ATTEMPTS = 3;
const DREAMS_ENTRY_RETRY_MS = 5000;
const DREAMS_ASSEMBLE_MS = 3 * 60 * 1000;
const DREAMS_ENTER_WAIT_MS = 30000;
const DREAMS_LEFT_GRACE_MS = 3000;
const DREAMS_EXIT_LOOT_MS = 10000;
const DREAMS_ARRIVE = 40;
const DREAMS_DOOR_ARRIVE = 20;
const DREAMS_WALK_TIMEOUT_MS = 60000;
const DREAMS_THREAT_RADIUS = 250;
const DREAMS_LAG_RANGE = 250;
const DREAMS_TOGETHER_MS = 90000;
const DREAMS_POKE_AFTER_MS = 20000;
const DREAMS_POKE_EVERY_MS = 15000;
const DREAMS_ROOM_IDLE_MS = 90000;
const DREAMS_SKIP_MS = 2 * 60 * 1000;
const DREAMS_CHEST_RANGE = 380;
const DREAMS_CHEST_RETRY_MS = 2000;
const DREAMS_AMBER_PENALTY = 15;
const DREAMS_HOSTILE_SIDES = ["enemy", "predator"];
const DREAMS_DUEL_SIDES = ["duel_left", "duel_right"];
const DREAMS_UNTOUCHABLE = ["cave_darkmage"];
const DREAMS_VOTE_RETRY = ["timeout", "disconnected"];

const DREAMS_EFFECT_RANK = {
	wolves: 100,
	bad_double: 95,
	hunt_double: 90,
	both: 85,
	bad_fight: 80,
	hunt: 75,
	testimony: 72,
	save: 70,
	escort: 68,
	venture: 60,
	use_tool: 58,
	hunt_quick: 56,
	hunt_late: 55,
	hunt_helper: 54,
	left: 50,
	right: 50,
	lure: 48,
	hire: 46,
	gift: 45,
	inspect: 44,
	practice: 42,
	plant: 40,
	moths: 38,
	reveal: 36,
	appraise: 34,
	guide: 32,
	tool: 30,
	lamp: 28,
	decoy: 26,
	dice_room: 25,
	free_die: 24,
	careful: 22,
	favor: 20,
	cover: 18,
	dice: 15,
	dice6: 14,
	exchange: 12,
	recipes: 10,
	peace: 8,
	watch: 6,
	neither: 6,
	die: 5,
	story: 3,
	leave: 2,
	time: 1,
	pay: 0,
};

const DREAMS_UNKNOWN_RANK = 5;

DUNGEONS.dreams = {
	name: "Cave of Many Dreams",
	start: start_dreams_run,
	only: Object.keys(G.monsters).filter(m => m.startsWith("cave_") && !DREAMS_UNTOUCHABLE.includes(m)),
	flags: {
		leader_manual: true,
		ignore_events: true,
		party_only: true,
		combat_always_on: true,
		fight_while_moving: true,
		ignore_travel_panic: true,
		skip_panic: true,
		no_agitate: true,
		absorb_nearby: true,
	},
};

let _dreams_running = false;
let _dreams_checking = false;
let _dreams_next_check = 0;
let _dreams_returning = false;
let _dreams_return_at = 0;
let _dreams_voted = null;
let _dreams_bought = null;
let _dreams_lag_since = 0;
let _dreams_poked_at = 0;
const _dreams_chests = {};
const _dreams_skipped = {};

function dreams_log(message, color) {
	dungeon_log(DUNGEONS.dreams, message, color);
}

function dreams_mode_on() {
	return dungeon_override() === "dreams";
}

function dreams_server() {
	return parent.server_region + parent.server_identifier;
}

function dreams_reason(e) {
	return (e && e.reason) || fmt_err(e);
}

async function dreams_until(done, ms) {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		if (done()) return true;
		await delay(DREAMS_POLL_MS);
	}
	return done();
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WHO IS AN ENEMY — cave travelers, victims and allies are monsters too, and only some sides may be hit
// --------------------------------------------------------------------------------------------------------------------------------- //

function cave_hostile(mob) {
	if (DREAMS_UNTOUCHABLE.includes(mob.mtype)) return false;
	if (DREAMS_HOSTILE_SIDES.includes(mob.cave.side)) return true;
	if (DUNGEON_PARTY.includes(mob.target)) return true;
	if (!DREAMS_DUEL_SIDES.includes(mob.cave.side)) return false;
	const victim = parent.entities[mob.target];
	return !!(victim && victim.cave && victim.cave.side === "ally");
}

function cave_bystander(mob) {
	return !!mob.cave && !cave_hostile(mob);
}

function dreams_threats() {
	const out = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead || !e.cave || !cave_hostile(e)) continue;
		if (DUNGEON_PARTY.includes(e.target) || distance(character, e) <= DREAMS_THREAT_RADIUS) out.push(e);
	}
	return out;
}

function dreams_party_engaged() {
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type === "monster" && !e.dead && DUNGEON_PARTY.includes(e.target)) return true;
	}
	return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// DAILY CHECK — the leader asks once every ten minutes whether today's visit is still unused
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_visit_usable(visit) {
	if (visit.resume) return visit.resume.server === dreams_server();
	return !!(visit.available || visit.unlimited);
}

async function dreams_daily_check() {
	if (_dreams_checking || Date.now() < _dreams_next_check) return;
	if (dungeon_override() || character.rip || panicking || !automation_enabled()) return;
	if (G.events.dreams.disabled) return;

	_dreams_checking = true;
	_dreams_next_check = Date.now() + DREAMS_CHECK_MS;
	try {
		const visit = await cave_info();
		if (!dreams_visit_usable(visit)) return;
		dreams_log(visit.resume ? "An unfinished visit is waiting — taking the party back" : "Today's visit is unused — taking the party in");
		set_dungeon_mode("dreams");
	} catch (e) {
		dreams_log(`Visit check failed: ${dreams_reason(e)}`, DUNGEON_WARN_COLOR);
	} finally {
		_dreams_checking = false;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ENTRY — gather at Dorr with exactly the three fighters in the party, then open the cave
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_entry_blocker() {
	const party = Object.keys(get_party() || {});
	if (party.length !== DUNGEON_PARTY.length || !DUNGEON_PARTY.every(n => party.includes(n))) {
		return `party is ${party.join(", ") || "empty"}`;
	}
	for (const name of DUNGEON_FOLLOWERS) {
		const s = read_state_cache(name);
		if (!s || s.rip) return `${name} is not ready`;
		if (s.map !== DREAMS_DORR.map || Math.hypot(s.x - DREAMS_DORR.x, s.y - DREAMS_DORR.y) > DREAMS_DORR_RANGE) {
			return `${name} is not at Dorr`;
		}
	}
	if (dreams_party_engaged()) return "still in combat";
	return null;
}

async function dreams_wait_for_entry_party() {
	if (await dreams_until(() => dreams_entry_blocker() === null || !dreams_mode_on(), DREAMS_ASSEMBLE_MS)) {
		return dreams_mode_on();
	}
	dreams_log(`Party never assembled: ${dreams_entry_blocker()}`, DUNGEON_WARN_COLOR);
	return false;
}

async function dreams_enter() {
	const visit = await cave_info();
	if (!dreams_visit_usable(visit)) {
		dreams_log(visit.resume
			? `Our visit is open on ${visit.resume.server} — it can only be resumed there`
			: "Today's visit is already used", DUNGEON_WARN_COLOR);
		return false;
	}
	const resume = !!visit.resume;

	for (let attempt = 1; attempt <= DREAMS_ENTRY_ATTEMPTS; attempt++) {
		if (!dreams_mode_on()) return false;
		dreams_log(resume ? "Walking to Dorr to return to our visit" : `Gathering the party at Dorr (attempt ${attempt})`);
		try { await dungeon_travel(DREAMS_DORR, { radius: 30 }); } catch (e) { }
		if (!resume && !await dreams_wait_for_entry_party()) continue;

		try {
			await cave_enter();
		} catch (e) {
			const reason = dreams_reason(e);
			dreams_log(`Entry refused: ${reason}`, DUNGEON_WARN_COLOR);
			dungeon_telemetry_event("dreams_entry_refused", { reason, attempt, resume });
			if (reason === "daily_opening_used" || reason === "cant_reenter") return false;
			await delay(DREAMS_ENTRY_RETRY_MS);
			continue;
		}

		if (await dreams_until(() => !!character.cave, DREAMS_ENTER_WAIT_MS)) {
			dreams_log(resume ? "Back inside" : "Inside — floor 1");
			dungeon_telemetry_event("dreams_entered", { resume, run: character.cave.run });
			return true;
		}
	}
	return false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PARTY — the leader waits for anyone who fell behind, but not for ever
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_member(name) {
	const live = get_player(name);
	if (live) return { map: character.map, x: live.x, y: live.y, rip: live.rip };
	return read_state_cache(name);
}

function dreams_party_lagging() {
	return DUNGEON_FOLLOWERS.some(name => {
		const s = dreams_member(name);
		if (!s || s.rip) return false;
		if (s.map !== character.map) return true;
		return Math.hypot(s.x - character.x, s.y - character.y) > DREAMS_LAG_RANGE;
	});
}

function dreams_wait_for_party() {
	if (!dreams_party_lagging()) {
		_dreams_lag_since = 0;
		return false;
	}
	if (!_dreams_lag_since) _dreams_lag_since = Date.now();
	return Date.now() - _dreams_lag_since < DREAMS_TOGETHER_MS;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVING — every walk stops the moment a fight, a vote, a death or a straggler needs us to stand still
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_walk_interrupted() {
	return !character.cave || character.cave.paused || character.rip || !dreams_mode_on()
		|| dreams_threats().length > 0 || dreams_wait_for_party();
}

async function dreams_walk(spot, radius) {
	let settled = false;
	const journey = dungeon_travel({ map: character.map, x: spot.x, y: spot.y }, { radius, timeout: DREAMS_WALK_TIMEOUT_MS })
		.then(() => { settled = true; }, () => { settled = true; });

	while (!settled) {
		if (dreams_walk_interrupted()) {
			stop_movement("dreams: walk interrupted");
			await journey;
			return false;
		}
		await delay(DREAMS_POLL_MS);
	}
	return true;
}

function dreams_close_in() {
	const threats = dreams_threats()
		.sort((a, b) => distance(character, a) - distance(character, b));
	const target = threats[0];

	if (distance(character, target) <= character.range * 0.9) {
		if (smart.moving) stop_movement("dreams: in range");
		return;
	}
	if (can_move_to(target.x, target.y)) {
		if (smart.moving) stop_movement("dreams: direct approach");
		move(target.x, target.y);
		return;
	}
	if (!smart.moving) dungeon_travel({ map: character.map, x: target.x, y: target.y }).catch(() => { });
}

function dreams_door(map, door) {
	return G.maps[map].doors.find(d => d[4] === door.to);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ROUTE — stairs down if they are open, otherwise the nearest unfinished objective on this floor
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_open_stairs(cave) {
	return cave.doors.find(d => d.down && !d.locked && d.floor === cave.floor) || null;
}

function dreams_last_floor(cave) {
	return !cave.doors.some(d => d.down && d.floor === cave.floor);
}

function dreams_label(objective) {
	return `${objective.kind} "${objective.name}"`;
}

function dreams_next_objective(cave, current) {
	const pending = cave.objectives.filter(o => o.required && !o.done && o.floor === cave.floor);
	const now = Date.now();
	const open = pending.filter(o => !(_dreams_skipped[o.id] > now));
	const pool = open.length ? open : pending;
	if (!pool.length) return null;

	if (current) {
		const same = pool.find(o => o.id === current.id);
		if (same) return same;
	}
	return pool.sort((a, b) =>
		Math.hypot(character.x - a.x, character.y - a.y) - Math.hypot(character.x - b.x, character.y - b.y))[0];
}

function dreams_poke(objective) {
	const now = Date.now();
	if (now - _dreams_poked_at < DREAMS_POKE_EVERY_MS) return;
	_dreams_poked_at = now;

	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (!e.cave || e.cave.room !== objective.id || !cave_bystander(e)) continue;
		dreams_log(`Nothing happening at ${dreams_label(objective)} — talking to ${e.name || e.mtype}`);
		cave_talk(objective.id, e.id).catch(err => dreams_log(`Talk refused: ${dreams_reason(err)}`, DUNGEON_WARN_COLOR));
		return;
	}
}

async function dreams_descend(door) {
	if (Math.hypot(character.x - door.x, character.y - door.y) > DREAMS_DOOR_ARRIVE) {
		await dreams_walk(door, DREAMS_DOOR_ARRIVE);
		return;
	}

	const floor = character.cave.floor;
	dreams_log(`Floor ${floor + 1} clear — taking the stairs down`);
	dungeon_telemetry_event("dreams_stairs", { floor, to: door.to });
	try {
		await transport(door.to, dreams_door(character.map, door)[5]);
	} catch (e) {
		dreams_log(`Stairs refused: ${dreams_reason(e)}`, DUNGEON_WARN_COLOR);
		await delay(DREAMS_ENTRY_RETRY_MS);
	}
}

async function dreams_still_inside() {
	if (character.cave) return true;
	return dreams_until(() => !!character.cave, DREAMS_LEFT_GRACE_MS);
}

async function dreams_floors() {
	let goal = null;
	let idle_since = 0;
	let floor = -1;

	while (dreams_mode_on() && await dreams_still_inside()) {
		try {
			const cave = character.cave;
			if (cave.floor !== floor) {
				floor = cave.floor;
				goal = null;
				dreams_log(`Floor ${floor + 1}`);
			}

			if (cave.paused || character.rip) {
				idle_since = 0;
				await delay(DREAMS_POLL_MS);
				continue;
			}

			if (dreams_threats().length) {
				idle_since = 0;
				dreams_close_in();
				await delay(DREAMS_POLL_MS);
				continue;
			}

			if (dreams_wait_for_party()) {
				await delay(DREAMS_POLL_MS);
				continue;
			}

			const stairs = dreams_open_stairs(cave);
			if (stairs) {
				await dreams_descend(stairs);
				continue;
			}

			const next = dreams_next_objective(cave, goal);
			if (!next) {
				if (dreams_last_floor(cave)) {
					await dreams_exit_all("all three floors complete");
					return;
				}
				await delay(DREAMS_POLL_MS);
				continue;
			}

			if (!goal || next.id !== goal.id) {
				goal = next;
				idle_since = 0;
				dreams_log(`Floor ${floor + 1}: heading for ${dreams_label(goal)}`);
				dungeon_telemetry_event("dreams_objective", { floor, id: goal.id, kind: goal.kind });
			}

			if (Math.hypot(character.x - goal.x, character.y - goal.y) > DREAMS_ARRIVE) {
				idle_since = 0;
				await dreams_walk(goal, DREAMS_ARRIVE);
				continue;
			}

			if (!idle_since) idle_since = Date.now();
			const idle = Date.now() - idle_since;
			if (idle > DREAMS_POKE_AFTER_MS) dreams_poke(goal);
			if (idle > DREAMS_ROOM_IDLE_MS) {
				dreams_log(`${dreams_label(goal)} is not progressing — trying another objective first`, DUNGEON_WARN_COLOR);
				dungeon_telemetry_event("dreams_objective_skipped", { floor, id: goal.id, kind: goal.kind });
				_dreams_skipped[goal.id] = Date.now() + DREAMS_SKIP_MS;
				goal = null;
				idle_since = 0;
			}
			await delay(DREAMS_POLL_MS);
		} catch (e) {
			catcher(e, "dreams_floors");
			await delay(DREAMS_WATCH_MS);
		}
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EXIT — leaving is final, so it only happens when the run is over or the mode was switched off
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_leave() {
	if (!character.cave) return;
	cave_exit().catch(e => dreams_log(`Exit refused: ${dreams_reason(e)}`, DUNGEON_WARN_COLOR));
}

function dreams_chests_near() {
	const chests = get_chests();
	return Object.keys(chests).filter(id => {
		const chest = chests[id];
		return chest.map === character.map
			&& Math.hypot(chest.x - character.real_x, chest.y - character.real_y) <= DREAMS_CHEST_RANGE;
	});
}

async function dreams_exit_all(reason) {
	dreams_log(`Leaving the cave — ${reason}`);
	dungeon_telemetry_event("dreams_exit", { reason, floor: character.cave ? character.cave.floor : null });
	await dreams_until(() => !dreams_chests_near().length, DREAMS_EXIT_LOOT_MS);
	send_cm(DUNGEON_FOLLOWERS, { type: "dreams_exit" });
	dreams_leave();
	await dreams_until(() => !character.cave, DREAMS_ENTER_WAIT_MS);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RUN — the leader's driver, started by the dungeon mode
// --------------------------------------------------------------------------------------------------------------------------------- //

function start_dreams_run() {
	setTimeout(run_dreams, DREAMS_START_DELAY_MS);
}

async function run_dreams() {
	if (_dreams_running || !dreams_mode_on()) return;
	if (character.name !== MOVEMENT_LEADER) return;

	_dreams_running = true;
	hold_reset_for_mode(true);
	let entered = !!character.cave;
	try {
		if (!entered) entered = await dreams_enter();
		if (entered) await dreams_floors();
	} catch (e) {
		catcher(e, "run_dreams");
	} finally {
		_dreams_running = false;
		if (!entered) _dreams_next_check = Date.now() + DREAMS_RETRY_MS;
		if (character.cave) await dreams_exit_all("mode switched off");
		if (dreams_mode_on()) set_dungeon_mode(null);
		dreams_log(entered ? "Run over" : "Could not get in — trying again later");
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// VOTES — every character works out the same answer from G, so the three always vote together
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_encounter_for(choice) {
	return G.events.dreams.encounters.find(encounter =>
		choice.options.every(offered => encounter.options.some(o => o.id === offered.id))) || null;
}

function dreams_option_score(option, encounter) {
	const def = encounter && encounter.options.find(o => o.id === option.id);
	const gold = (option.cost || 0) / 1000;
	if (!def) return DREAMS_UNKNOWN_RANK + (option.amber ? 1 : 0) - gold;
	return (DREAMS_EFFECT_RANK[def.effect] || 0) - (option.amber || 0) * DREAMS_AMBER_PENALTY - gold;
}

function dreams_pick_option(choice) {
	const encounter = dreams_encounter_for(choice);
	let best = null;
	let best_score = -Infinity;
	for (const option of choice.options) {
		if (option.unavailable) continue;
		const score = dreams_option_score(option, encounter);
		if (score > best_score) {
			best = option;
			best_score = score;
		}
	}
	return best;
}

function dreams_vote(cave) {
	const choice = cave.choice;
	if (!choice || choice.resolved || choice.votes[character.name] || _dreams_voted === choice.id) return;

	const option = dreams_pick_option(choice);
	if (!option) return;

	_dreams_voted = choice.id;
	dreams_log(`Vote on "${choice.title}": ${option.label}`);
	dungeon_telemetry_event("dreams_vote", {
		choice: choice.id,
		title: choice.title,
		option: option.id,
		encounter: (dreams_encounter_for(choice) || {}).id || null,
		offered: choice.options.map(o => o.id).join(","),
	});
	cave_reply(choice.id, option.id).catch(e => {
		const reason = dreams_reason(e);
		dreams_log(`Vote refused: ${reason}`, DUNGEON_WARN_COLOR);
		if (_dreams_voted === choice.id && DREAMS_VOTE_RETRY.includes(reason)) _dreams_voted = null;
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SPOILS — cave gold only spends inside, so open every chest in reach and buy whatever a merchant offers
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_loot_nearby() {
	if (character.rip || character.cave.paused) return;
	const now = Date.now();
	for (const id of dreams_chests_near()) {
		if (now - (_dreams_chests[id] || 0) < DREAMS_CHEST_RETRY_MS) continue;
		_dreams_chests[id] = now;
		parent.open_chest(id);
	}
}

function dreams_buy(cave) {
	const choice = cave.choice;
	if (!choice || !choice.resolved || !choice.shop) return;
	const shop = choice.shop;
	if (shop.sold || !shop.nearby || cave.gold < shop.price || _dreams_bought === choice.id) return;

	_dreams_bought = choice.id;
	dreams_log(`Buying ${G.items[shop.name].name} for ${shop.price} cave gold`);
	dungeon_telemetry_event("dreams_buy", { item: shop.name, price: shop.price });
	cave_buy(shop.room).catch(e => dreams_log(`Purchase refused: ${dreams_reason(e)}`, DUNGEON_WARN_COLOR));
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// FOLLOWERS — take whichever stairs Myras took, and walk back to Dorr after a reload
// --------------------------------------------------------------------------------------------------------------------------------- //

async function dreams_follow_floor(cave) {
	if (_dreams_returning || character.rip || cave.paused) return;
	const lead = read_state_cache(MOVEMENT_LEADER);
	if (!lead || lead.cave_run !== cave.run || lead.map === character.map) return;
	const door = cave.doors.find(d => d.floor === cave.floor && d.to === lead.map && !d.locked);
	if (!door) return;

	_dreams_returning = true;
	try {
		game_log("🌙 Following Myras down the stairs", DUNGEON_LOG_COLOR);
		await dungeon_travel({ map: character.map, x: door.x, y: door.y }, { radius: DREAMS_DOOR_ARRIVE });
		await transport(door.to, dreams_door(character.map, door)[5]);
	} catch (e) {
		game_log(`🌙 Could not follow down the stairs: ${dreams_reason(e)}`, DUNGEON_WARN_COLOR);
	} finally {
		_dreams_returning = false;
	}
}

async function dreams_follower_return() {
	if (_dreams_returning || Date.now() < _dreams_return_at) return;
	if (!dreams_mode_on() || character.rip || character.cave_entering) return;
	const lead = read_state_cache(MOVEMENT_LEADER);
	if (!lead || !lead.cave_run) return;

	_dreams_returning = true;
	_dreams_return_at = Date.now() + DREAMS_RETURN_RETRY_MS;
	try {
		const visit = await cave_info();
		if (!visit.resume || visit.resume.server !== dreams_server()) return;
		game_log("🌙 Left outside — walking back to Dorr", DUNGEON_LOG_COLOR);
		await dungeon_travel(DREAMS_DORR, { radius: 30 });
		await cave_enter();
	} catch (e) {
		game_log(`🌙 Could not return to the cave: ${dreams_reason(e)}`, DUNGEON_WARN_COLOR);
	} finally {
		_dreams_returning = false;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WATCH — once a second on every fighter
// --------------------------------------------------------------------------------------------------------------------------------- //

function dreams_watch() {
	try {
		const cave = character.cave;
		if (!cave) {
			if (character.name === MOVEMENT_LEADER) dreams_daily_check();
			else dreams_follower_return();
			return;
		}

		dreams_vote(cave);
		dreams_loot_nearby();
		if (character.name === MOVEMENT_LEADER) dreams_buy(cave);
		else dreams_follow_floor(cave);
	} catch (e) {
		catcher(e, "dreams_watch");
	}
}
