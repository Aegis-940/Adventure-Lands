// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION KILL LOGGER — kill detection and the rolling seconds-per-kill average
// --------------------------------------------------------------------------------------------------------------------------------- //

let counted_bscorpion_deaths = new Set();
let bscorpion_kill_count = 0;
let bscorpion_kill_times = [];

function log_bscorpion_kill() {
	const now = Date.now();
	bscorpion_kill_count++;
	bscorpion_kill_times.push(now);
	if (bscorpion_kill_times.length > 50) bscorpion_kill_times.shift();

	if (bscorpion_kill_times.length > 1) {
		let total = 0;
		for (let i = 1; i < bscorpion_kill_times.length; i++) {
			total += bscorpion_kill_times[i] - bscorpion_kill_times[i - 1];
		}
		const avg = total / (bscorpion_kill_times.length - 1);
		log(`Seconds / Kill (Avg): ${(avg / 1000).toFixed(1)}s`, "#ffb347", "Bscorpion");
	} else {
		log(`Bscorpion kill #${bscorpion_kill_count}: ${new Date(now).toLocaleTimeString()} (first recorded)`, "#ffb347", "Bscorpion");
	}
}

async function bscorpion_kill_logger_loop() {
	while (true) {
		try {
			const present = new Set();
			for (const id in parent.entities) {
				const e = parent.entities[id];
				if (e?.type !== "monster" || e.mtype !== "bscorpion") continue;
				present.add(e.id);
				if (!e.dead || counted_bscorpion_deaths.has(e.id)) continue;
				counted_bscorpion_deaths.add(e.id);
				log_bscorpion_kill();
			}
			for (const id of counted_bscorpion_deaths) {
				if (!present.has(id)) counted_bscorpion_deaths.delete(id);
			}
		} catch (e) {
			catcher(e, "bscorpion_kill_logger_loop");
		}
		await delay(250);
	}
}
