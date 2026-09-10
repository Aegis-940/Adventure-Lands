// --------------------------------------------------------------------------------------------------------------------------------- //
// BSCORPION KILL LOGGER — kill detection and the rolling seconds-per-kill average
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_bscorpion_ids = new Set();
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
			const bscorps = Object.values(parent.entities).filter(e => e.type === "monster" && e.mtype === "bscorpion");
			const alive_ids = new Set(bscorps.filter(e => !e.dead).map(e => e.id));
			const dead_now = [...last_bscorpion_ids].filter(id => !alive_ids.has(id));
			if (dead_now.length > 0) {
				log_bscorpion_kill();
			}
			last_bscorpion_ids = alive_ids;
		} catch (e) {
			catcher(e, "bscorpion_kill_logger_loop");
		}
		await delay(250);
	}
}
