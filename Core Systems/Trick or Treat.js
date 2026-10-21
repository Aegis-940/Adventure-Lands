// --------------------------------------------------------------------------------------------------------------------------------- //
// TRICK OR TREAT — seven doors, one knock each per character per UTC day and 14 per account: Riff walks to every door, and Myras
// leads the party past the doors on whichever Halloween map an event leaves them on
// --------------------------------------------------------------------------------------------------------------------------------- //

const TRICK_OR_TREAT_FIGHTER = MOVEMENT_LEADER;
const KNOCK_LABEL = "knock";
const KNOCK_STAND_OFFSET = 24;
const KNOCK_REACH = 30;
const KNOCK_RETRY_MS = 5000;
const KNOCK_DOOR_REFUSALS = 3;
const KNOCK_DAY_OVER = ["trickortreat_season", "trickortreat_limit"];

let _knock_in_flight = false;
let _knock_at = 0;
let _knock_refusals = { day: "", doors: {}, over: false };

function knock_day() {
	return new Date().toISOString().slice(0, 10);
}

function knock_refusals() {
	if (_knock_refusals.day !== knock_day()) _knock_refusals = { day: knock_day(), doors: {}, over: false };
	return _knock_refusals;
}

function door_stand(i) {
	const door = G.events.trickortreat.doors[i];
	return { map: door[0], x: door[1], y: door[2] + KNOCK_STAND_OFFSET };
}

function doors_to_knock(map) {
	const tt = character.trickortreat;
	if (!tt || tt.doors_left <= 0 || !setting("trick_or_treat")) return [];
	const refusals = knock_refusals();
	if (refusals.over) return [];
	return G.events.trickortreat.doors
		.map((door, i) => i)
		.filter(i => !tt.doors.includes(i) && (refusals.doors[i] || 0) < KNOCK_DOOR_REFUSALS)
		.filter(i => !map || door_stand(i).map === map);
}

async function knock_door(i) {
	_knock_in_flight = true;
	_knock_at = Date.now();
	try {
		const reply = await knock(i);
		const got = reply.treat ? `a treat: ${reply.treat.name} x${reply.treat.q}` : `a trick: ${reply.trick}`;
		log_msg("event", `🎃 Door ${i}: ${got}${reply.parcel ? ", and a Witch's Parcel" : ""} (${reply.stamps} stamps)`);
		errlog_sample("trick_or_treat", { door: i, treat: reply.treat && reply.treat.name, trick: reply.trick, parcel: !!reply.parcel, stamps: reply.stamps });
	} catch (e) {
		const refusals = knock_refusals();
		if (KNOCK_DAY_OVER.includes(e.reason)) refusals.over = true;
		else refusals.doors[i] = (refusals.doors[i] || 0) + 1;
		log_msg("warn", `🎃 Door ${i} refused the knock: ${e.reason}`);
	} finally {
		_knock_in_flight = false;
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THE LEADER — the nearest unknocked door on her map, with the party together, no event live and nothing on her; the others follow
// --------------------------------------------------------------------------------------------------------------------------------- //

function trick_or_treat_goal() {
	if (character.name !== TRICK_OR_TREAT_FIGHTER || character.rip || panicking || monsters_targeting_me() > 0) return null;
	if (best_event_target()) return null;
	const doors = doors_to_knock(character.map);
	if (!doors.length) return null;

	const gap = stand => Math.hypot(character.x - stand.x, character.y - stand.y);
	const { i, stand } = doors.map(i => ({ i, stand: door_stand(i) })).sort((a, b) => gap(a.stand) - gap(b.stand))[0];

	if (gap(stand) <= KNOCK_REACH) {
		if (!_knock_in_flight && Date.now() - _knock_at > KNOCK_RETRY_MS) knock_door(i);
		return { local: "keep", label: KNOCK_LABEL, disengage: true };
	}
	return { label: KNOCK_LABEL, map: stand.map, x: stand.x, y: stand.y, radius: KNOCK_REACH / 2, disengage: true };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// RIFF — one walk past every door he has left today
// --------------------------------------------------------------------------------------------------------------------------------- //

async function trick_or_treat_round(abandoned) {
	for (const i of doors_to_knock()) {
		if (abandoned()) return;
		await smarter_move(door_stand(i), null, { radius: KNOCK_REACH / 2 });
		if (abandoned()) return;
		await knock_door(i);
	}
}
