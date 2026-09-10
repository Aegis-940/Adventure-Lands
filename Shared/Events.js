// --------------------------------------------------------------------------------------------------------------------------------- //
// EVENTS — live boss/seasonal targets, and the goal that walks the party to them
// --------------------------------------------------------------------------------------------------------------------------------- //

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
