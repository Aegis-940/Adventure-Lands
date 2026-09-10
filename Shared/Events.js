// --------------------------------------------------------------------------------------------------------------------------------- //
// EVENTS — live boss/seasonal targets, and the goal that walks the party to them
// --------------------------------------------------------------------------------------------------------------------------------- //

on_game_event = function(data) {
	if (!data?.name) return;
	log(`[Event] ${data.name} spawned`, "#FF8800");
};

const EVENT_JOIN_RETRY_MS = 5000;
let _last_event_join = 0;

function engage_hp_ok(e) {
	if (e.engage_below === undefined) return true;
	const max = (G.monsters?.[e.name]?.hp) || e.data?.max_hp;
	if (!max || !e.data?.hp) return true;
	return e.data.hp <= max * e.engage_below;
}

// Joining is a socket emit, not a journey — it works from anywhere. So "the boss is live but I am
// not in the instance yet" is a reason to keep grinding while we retry, never a reason to stand
// still. That hold was the party hanging around doing nothing.
let _holiday_tried = false;

function event_goal() {
	// One definitive attempt. If we reached the tree and the buff still is not on us, the
	// interaction is not available — that is an answer, not something to keep retrying.
	if (parent?.S?.holidayseason && !character?.s?.holidayspirit && !_holiday_tried) {
		return {
			label: "holiday-tree",
			to: "town",
			on_arrive: () => {
				_holiday_tried = true;
				parent.socket.emit("interaction", { type: "newyear_tree" });
			},
		};
	}
	if (character?.s?.holidayspirit) _holiday_tried = false;

	const target = best_event_target();
	if (!target) return null;

	if (target.join === true && !get_nearest_monster({ type: target.name })) {
		if (Date.now() - _last_event_join > EVENT_JOIN_RETRY_MS) {
			_last_event_join = Date.now();
			parent.socket.emit("join", { name: target.name });
		}
		return null;
	}

	const seen = get_nearest_monster({ type: target.name });
	if (seen) {
		const half_x = character.x + (seen.x - character.x) / 2;
		const half_y = character.y + (seen.y - character.y) / 2;
		if (is_in_range(seen, "attack") || can_move_to(half_x, half_y)) {
			return { local: "event", label: "event-" + target.name, event: target.name };
		}
		return { label: "event-" + target.name, map: seen.map || target.map, x: seen.x, y: seen.y, radius: 60 };
	}

	// A join-type event with no coordinates: nowhere to walk to until we are inside.
	if (!target.map || !isFinite(target.x) || !isFinite(target.y)) return null;

	return { label: "event-" + target.name, map: target.map, x: target.x, y: target.y, radius: 60 };
}

function event_step(event_type) {
	if (!parent?.S?.[event_type]?.live) return;
	const monster = get_nearest_monster({ type: event_type });
	if (!monster) return;
	if (is_in_range(monster, "attack")) return;
	local_move(character.x + (monster.x - character.x) / 2, character.y + (monster.y - character.y) / 2);
}

function best_event_target() {
	const alive_sorted = EVENT_LOCATIONS
		.map(e => {
			const data = parent.S[e.name];
			if (e.dynamic && data?.live) {
				return { ...e, map: data.map, x: data.x, y: data.y, data };
			}
			return { ...e, data };
		})
		.filter(e => e.data?.live)
		.filter(e => engage_hp_ok(e))
		.sort((a, b) => (a.data.hp / a.data.max_hp) - (b.data.hp / b.data.max_hp));

	if (!alive_sorted.length) return null;

	const wabbit = alive_sorted.find(e => e.name === "wabbit");
	return wabbit || alive_sorted[0];
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ANNIVERSARY EVENT — "I Kiss You"
// --------------------------------------------------------------------------------------------------------------------------------- //

var anniversary_travel = false;

const ANNIVERSARY_RANGE = 40;
const ANNIVERSARY_REFRESH_MS = 5 * 60 * 1000;
const ANNIVERSARY_TICK_MS = 2000;
const ANNIVERSARY_TICK_ACTIVE_MS = 400;

const ANNIVERSARY_KISS_RETRY_MS = 2500;

let _anniv_died_round = null;
let _anniv_reason = null;
let _anniv_casting = false;
let _anniv_last_kiss = 0;

function anniversary_event() {
	try {
		const s = parent.S && parent.S.anniversary;
		if (!s || !s.active || !s.live || !s.id) return null;
		return Date.now() < s.expires ? s : null;
	} catch (e) { return null; }
}

function anniversary_is_host() {
	const s = anniversary_event();
	return !!s && (String(character.id) === String(s.id) || character.name === s.target);
}

function anniversary_block_reason() {
	const s = anniversary_event();
	if (!s) return "no live round";
	if (character.rip) return "dead";
	if (_anniv_died_round === s.round) return "died during this round";
	if (s.available === false) return "host is not taking visitors";
	if (anniversary_is_host()) return "we are the featured player";

	const kiss = character.s && character.s.anniversary_kiss;
	if (kiss && (kiss.ms === undefined || kiss.ms > ANNIVERSARY_REFRESH_MS)) return "already buffed";

	if (character.ctype !== "merchant"
		&& typeof best_event_target === "function" && best_event_target()) {
		return "a boss is up — bossing first";
	}

	const ticket = character.s && character.s.anniversary_visit;
	if (!ticket) return "no ticket issued to us";
	if (!(ticket.ms > 0)) return "ticket already spent";
	if (ticket.round !== s.round) return `ticket is for round ${ticket.round}, live round is ${s.round}`;
	if (Date.now() >= ticket.expires) return "ticket expired";
	if (parent.server_region !== undefined && parent.server_identifier !== undefined) {
		const realm = parent.server_region + " " + parent.server_identifier;
		if (ticket.realm !== realm) return `ticket realm "${ticket.realm}" != "${realm}"`;
	}

	try {
		if (!G.maps[s.map] || !isFinite(s.x) || !isFinite(s.y)) return "no usable destination";
	} catch (e) { return "no usable destination"; }
	return null;
}

function anniversary_should_travel() {
	return anniversary_block_reason() === null;
}

function anniversary_destination() {
	if (!anniversary_travel) return null;
	const s = anniversary_event();
	if (!s) return null;

	const them = get_player(s.target);
	if (!them) return { label: "anniversary", map: s.map, x: s.x, y: s.y, radius: ANNIVERSARY_RANGE };
	return approach(them, {
		label: "anniversary",
		arrive: ANNIVERSARY_RANGE,
		ring: ANNIVERSARY_RANGE * 0.6,
		arrived: { hold: true, label: "anniversary-kiss" },
	});
}

async function anniversary_tick() {
	const s = anniversary_event();
	if (character.rip && anniversary_travel && s) _anniv_died_round = s.round;

	const reason = anniversary_block_reason();
	if (reason !== _anniv_reason) {
		_anniv_reason = reason;
		log(reason ? `🎂 Anniversary: ${reason}.` : `🎂 Anniversary: visiting ${s.target} on ${s.map}.`,
			"#F0B742", "Alerts");
	}
	anniversary_travel = !reason;
	if (!anniversary_travel) return false;

	// The floor and the in-flight latch are the backstop; the cooldown is only an optimisation on
	// top. ikissyou exists only during the event, so is_on_cooldown may throw or read false
	// forever — relying on it alone turned the tick rate into the cast rate, four characters
	// emitting use_skill every 400ms for as long as they stood in range.
	let ready = true;
	try { ready = !is_on_cooldown("ikissyou"); } catch (e) { /* unknown skill: the floor bounds us */ }

	const them = get_player(s.target);
	if (!_anniv_casting && ready
		&& Date.now() - _anniv_last_kiss > ANNIVERSARY_KISS_RETRY_MS
		&& them && distance(character, them) <= ANNIVERSARY_RANGE) {
		_anniv_casting = true;
		_anniv_last_kiss = Date.now();
		Promise.resolve(use_skill("ikissyou", them.id)).then(
			() => { _anniv_casting = false; },
			e => {
				_anniv_casting = false;
				errlog_count("kiss:" + ((e && (e.reason || e.response)) || "failed"));
				log(`🎂 Anniversary kiss failed: ${fmt_err(e)}`, "#FFA500", "Alerts");
			});
	}
	return true;
}

async function anniversary_loop() {
	try {
		await anniversary_tick();
	} catch (e) {
		try { catcher(e, "anniversary_loop"); } catch (x) { /* logging must never kill the loop */ }
	}
	setTimeout(anniversary_loop, anniversary_travel ? ANNIVERSARY_TICK_ACTIVE_MS : ANNIVERSARY_TICK_MS);
}
