// --------------------------------------------------------------------------------------------------------------------------------- //
// DUNGEON COLLECTION — every few runs the party meets Riff outside and hands the haul over
// --------------------------------------------------------------------------------------------------------------------------------- //

const COLLECT_EVERY_RUNS = 3;
const COLLECT_RUNS_KEY = "AL_dungeon_runs";
const COLLECT_WAIT_MS = 5 * 60 * 1000;
const COLLECT_DRAIN_MS = 60000;
const COLLECT_POLL_MS = 2000;
const COLLECT_IDLE_ROUNDS = 3;
const COLLECT_RANGE = 300;

function dungeon_runs_done() {
	return parseInt(storage_raw_read(COLLECT_RUNS_KEY) || "0", 10) || 0;
}

function record_dungeon_run() {
	const n = dungeon_runs_done() + 1;
	storage_raw_write(COLLECT_RUNS_KEY, n);
	log_msg("event", `Dungeon run ${n} complete`);
	return n;
}

function reset_dungeon_runs() {
	storage_remove(COLLECT_RUNS_KEY);
	log_msg("info", "Dungeon run counter reset");
}

function collection_due() {
	const n = dungeon_runs_done();
	return n > 0 && n % COLLECT_EVERY_RUNS === 0;
}

async function run_dungeon_collection() {
	if (character.name !== MOVEMENT_LEADER) return false;

	log_msg("event", "📦 Collection: summoning Riff");
	dungeon_telemetry_event("collect_start", { runs: dungeon_runs_done() });
	send_cm("Riff", { type: "collect_loot" });

	const until = Date.now() + COLLECT_WAIT_MS;
	let arrived = false;
	while (Date.now() < until) {
		const riff = get_player("Riff");
		if (riff && !riff.rip && distance(character, riff) <= COLLECT_RANGE) {
			arrived = true;
			break;
		}
		await delay(COLLECT_POLL_MS);
	}

	if (!arrived) {
		log_msg("warn", "Collection: Riff never arrived — carrying on");
		dungeon_telemetry_event("collect_end", { ok: false });
		return false;
	}

	log_msg("event", "📦 Collection: Riff is here — handing over");
	send_cm(DUNGEON_FOLLOWERS, { type: "send_loot" });
	try {
		await send_to_merchant();
	} catch (e) {
		catcher(e, "run_dungeon_collection");
	}

	const drain = Date.now() + COLLECT_DRAIN_MS;
	let last = -1;
	let idle = 0;
	while (Date.now() < drain) {
		const left = loose_loot(LOOT_THRESHOLD).length;
		if (!left) break;

		if (left === last) {
			if (++idle >= COLLECT_IDLE_ROUNDS) {
				log_msg("warn", `Collection: ${left} item(s) would not transfer — moving on`);
				break;
			}
		} else {
			idle = 0;
		}
		last = left;
		await delay(COLLECT_POLL_MS);
	}

	log_msg("event", "📦 Collection: done");
	dungeon_telemetry_event("collect_end", { ok: true });
	return true;
}

console_api({
	reset_dungeon_runs: "reset the dungeon run counter that decides when Riff collects",
});
