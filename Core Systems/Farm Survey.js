// --------------------------------------------------------------------------------------------------------------------------------- //
// FARM SURVEY — the *SURVEY* farm target: 60 minutes at each spot in turn, then bscorpion. Myras owns the state; everyone follows it
// --------------------------------------------------------------------------------------------------------------------------------- //

const SURVEY_KEY = "AL_survey";
const SURVEY_OWNER = MOVEMENT_LEADER;
const SURVEY_SPOTS = [
	"odino", "plantoid", "fireroamer", "bscorpion", "sparkbot", "xscorpion",
	"dryad", "wolf", "gscorpion", "bigbird", "scorpion", "pppompom",
];

const SURVEY_TICK_MS = 1000;
const SURVEY_SPOT_MS = 60 * 60 * 1000;
const SURVEY_OCCUPANCY_MS = 5000;
const SURVEY_TRAVEL_LIMIT_MS = 20 * 60 * 1000;
const SURVEY_UNSAFE_DEATHS = 2;
const SURVEY_REPORT_MS = 60000;

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATE — localStorage, shared by every character's iframe
// --------------------------------------------------------------------------------------------------------------------------------- //

function survey_new() {
	return {
		started: Date.now(),
		index: 0,
		complete: false,
		spots: SURVEY_SPOTS.map(type => ({ type, status: "pending", visits: 0, at_spot_ms: 0 })),
	};
}

function survey_read() {
	return storage_read(SURVEY_KEY);
}

function survey_target() {
	const survey = survey_read();
	if (!survey) return SURVEY_SPOTS[0];
	return survey.complete ? DEFAULT_FARM_TARGET : survey.spots[survey.index].type;
}

function survey_selected() {
	return farm_target_setting(character.name) === SURVEY_FARM_TARGET;
}

function survey_spot_now() {
	if (!survey_selected()) return null;
	const survey = survey_read();
	return survey && !survey.complete ? survey.spots[survey.index].type : null;
}

function switch_home(type) {
	home = type;
	destination = home_destination(type);
	game_log(`🧭 Farm target: ${type}`, "#66ccff");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// VISIT — arrival and the occupancy check, the 60-minute clock, and the safety stop
// --------------------------------------------------------------------------------------------------------------------------------- //

let _survey_tick_at = 0;
const _survey_rip = {};

function survey_begin_visit(spot) {
	spot.visits++;
	spot.arrived = false;
	spot.travel_ms = 0;
	spot.occupancy_ms = 0;
	spot.deaths = 0;
	spot.visit_started = Date.now();
	game_log(`🧭 Survey: heading to ${spot.type} (visit ${spot.visits})`, "#66ccff");
}

function survey_next_index(survey) {
	const pending = survey.spots.findIndex(s => s.status === "pending");
	if (pending !== -1) return pending;
	return survey.spots.findIndex(s => s.status === "skipped");
}

function survey_reconcile(survey) {
	const current = survey.complete ? null : survey.spots[survey.index].type;
	const kept = SURVEY_SPOTS.map(type => survey.spots.find(s => s.type === type)
		|| { type, status: "pending", visits: 0, at_spot_ms: 0 });
	if (kept.length === survey.spots.length && kept.every((s, i) => s === survey.spots[i])) return false;

	const removed = survey.spots.filter(s => !SURVEY_SPOTS.includes(s.type)).map(s => s.type);
	survey.spots = kept;
	const at = kept.findIndex(s => s.type === current);
	const next = at !== -1 ? at : survey_next_index(survey);
	survey.complete = next === -1;
	if (next !== -1) survey.index = next;
	game_log(`🧭 Survey: spot list changed${removed.length ? ", dropped " + removed.join(", ") : ""}`, "#66ccff");
	return true;
}

function survey_extend(survey) {
	const short = survey.spots.filter(s => s.status === "done" && s.at_spot_ms < SURVEY_SPOT_MS);
	if (!short.length) return false;
	for (const spot of short) {
		spot.status = "pending";
		spot.visit_started = 0;
	}
	if (survey.complete) {
		survey.complete = false;
		survey.index = survey_next_index(survey);
	}
	game_log(`🧭 Survey: ${short.map(s => s.type).join(", ")} reopened for ${SURVEY_SPOT_MS / 60000} min at the spot`, "#66ccff");
	return true;
}

function survey_finish(survey, status) {
	const spot = survey.spots[survey.index];
	spot.status = status;
	spot.finished = Date.now();
	spot.visit_started = 0;

	errlog_archive("survey_spot", {
		spot: spot.type,
		status,
		visits: spot.visits,
		at_spot_s: Math.round(spot.at_spot_ms / 1000),
		travel_s: Math.round(spot.travel_ms / 1000),
		deaths: spot.deaths,
	});
	game_log(`🧭 Survey: ${spot.type} ${status} after ${Math.round(spot.at_spot_ms / 60000)} min at the spot`, "#66ccff");

	const next = survey_next_index(survey);
	if (next === -1) {
		survey.complete = true;
		survey.completed = Date.now();
		game_log(`🧭 Survey complete — farming ${DEFAULT_FARM_TARGET}`, "#66ccff");
		errlog_archive("survey_spot", { spot: null, status: "complete" });
	} else {
		survey.index = next;
	}
}

function survey_count_deaths(spot) {
	for (const name of COHESION_FOLLOWERS.concat([MOVEMENT_LEADER])) {
		const s = name === character.name ? character : read_state_cache(name);
		const rip = !!(s && s.rip);
		if (rip && _survey_rip[name] === false && in_farm_area(s.map, s.x, s.y)) {
			spot.deaths++;
			game_log(`🧭 Survey: ${name} died at ${spot.type} (${spot.deaths}/${SURVEY_UNSAFE_DEATHS})`, "#FFA500");
		}
		_survey_rip[name] = rip;
	}
}

function survey_owner_tick(dt) {
	const survey = survey_read() || survey_new();
	const reconciled = survey_reconcile(survey);
	if (survey_extend(survey) || reconciled) storage_write(SURVEY_KEY, survey);
	if (survey.complete) return void survey_report_state(survey);

	const spot = survey.spots[survey.index];
	if (home !== spot.type) return;
	if (!spot.visit_started) survey_begin_visit(spot);

	const here = at_farm_spot();
	const on_event = party_on_event();

	if (!spot.arrived) {
		if (here) {
			spot.arrived = true;
		} else {
			if (!on_event) spot.travel_ms += dt;
			if (spot.travel_ms > SURVEY_TRAVEL_LIMIT_MS) survey_finish(survey, "unreachable");
			return void storage_write(SURVEY_KEY, survey);
		}
	}

	if (here && spot.occupancy_ms < SURVEY_OCCUPANCY_MS) {
		spot.occupancy_ms += dt;
		if (foreign_players_in_farm_area() > 0) {
			survey_finish(survey, spot.status === "skipped" ? "occupied" : "skipped");
			return void storage_write(SURVEY_KEY, survey);
		}
	}

	if (!on_event) survey_count_deaths(spot);
	if (here) spot.at_spot_ms += dt;

	if (spot.deaths >= SURVEY_UNSAFE_DEATHS) survey_finish(survey, "unsafe");
	else if (spot.at_spot_ms >= SURVEY_SPOT_MS) survey_finish(survey, "done");

	storage_write(SURVEY_KEY, survey);
	survey_report_state(survey);
}

let _survey_reported_at = 0;

function survey_report_state(survey) {
	const now = Date.now();
	if (now - _survey_reported_at < SURVEY_REPORT_MS) return;
	_survey_reported_at = now;
	errlog_sample("survey_state", {
		index: survey.index,
		complete: survey.complete,
		spot_minutes: SURVEY_SPOT_MS / 60000,
		spots: survey.spots.map(s => ({
			type: s.type, status: s.status, visits: s.visits, at_spot_s: Math.round(s.at_spot_ms / 1000),
			arrived: !!s.arrived, deaths: s.deaths || 0,
		})),
	});
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// TICK — every fighter follows the survey's spot; the owner also advances it
// --------------------------------------------------------------------------------------------------------------------------------- //

function survey_tick() {
	const now = Date.now();
	const dt = _survey_tick_at ? now - _survey_tick_at : 0;
	_survey_tick_at = now;

	if (!survey_selected()) return;
	const target = survey_target();
	if (target !== home) switch_home(target);
	if (character.name === SURVEY_OWNER) survey_owner_tick(dt);
}

function farm_survey_start() {
	setInterval(() => {
		try {
			survey_tick();
		} catch (e) {
			catcher(e, "survey_tick");
		}
	}, SURVEY_TICK_MS);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// CONSOLE
// --------------------------------------------------------------------------------------------------------------------------------- //

function survey_status() {
	const survey = survey_read();
	if (!survey) return "no survey yet — set a fighter's farm target to " + SURVEY_FARM_TARGET;
	return survey.spots.map((s, i) => `${i === survey.index && !survey.complete ? "▶" : " "} ${s.type.padEnd(11)} `
		+ `${s.status.padEnd(11)} ${Math.round(s.at_spot_ms / 60000)} min, visits ${s.visits}`).join("\n")
		+ (survey.complete ? "\ncomplete" : "");
}

function survey_retry(type) {
	const survey = survey_read();
	if (!survey) return "no survey yet";
	const i = survey.spots.findIndex(s => s.type === type);
	if (i === -1) return `${type} is not on the survey list`;
	const spot = survey.spots[i];
	if (i === survey.index && !survey.complete) return `${type} is the spot being surveyed now`;
	survey.spots[i] = { type, status: "pending", visits: spot.visits, at_spot_ms: 0 };
	if (survey.complete) {
		survey.complete = false;
		survey.index = i;
	}
	storage_write(SURVEY_KEY, survey);
	errlog_archive("survey_spot", { spot: type, status: "retry", visits: spot.visits, was: spot.status });
	return `${type} is pending again (was ${spot.status}); it is visited when the current spot finishes`;
}

function survey_move_on() {
	const survey = survey_read();
	if (!survey || survey.complete) return "no survey running";
	const spot = survey.spots[survey.index];
	const next = survey.spots.findIndex((s, i) => i !== survey.index && s.status === "pending");
	if (next === -1) return `${spot.type} is the only pending spot`;
	spot.visit_started = 0;
	survey.index = next;
	storage_write(SURVEY_KEY, survey);
	return `${spot.type} stays pending with ${Math.round(spot.at_spot_ms / 60000)} min; heading to ${survey.spots[next].type}`;
}

function survey_reset() {
	localStorage.removeItem(SURVEY_KEY);
	errlog_archive("survey_spot", { spot: null, status: "reset" });
	return "survey reset — the next tick starts again at " + SURVEY_SPOTS[0];
}
