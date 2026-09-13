// --------------------------------------------------------------------------------------------------------------------------------- //
// SPIDER DUNGEON — the healer leads the party through the spider instance
// --------------------------------------------------------------------------------------------------------------------------------- //

function wait_for_death(mob_type, spawn_x, spawn_y, spawn_radius = 250) {
	return new Promise(resolve => {
		let consecutive_alive = 0;
		let confirmed_alive = false;
		let consecutive_dead = 0;

		const interval = setInterval(() => {
			const near_spawn = Math.hypot(character.x - spawn_x, character.y - spawn_y) < spawn_radius;

			const alive = Object.values(parent.entities).some(
				e => e.type === "monster" && e.mtype === mob_type && !e.dead
			);

			if (alive) {
				consecutive_alive++;
				consecutive_dead = 0;
				if (consecutive_alive >= 3) confirmed_alive = true;
			} else if (confirmed_alive && near_spawn) {
				consecutive_alive = 0;
				consecutive_dead++;
				if (consecutive_dead >= 3) {
					clearInterval(interval);
					log(`[Dungeon] ${mob_type} confirmed dead`, "#AA88FF");
					resolve();
				}
			} else {
				consecutive_alive = 0;
				consecutive_dead = 0;
			}
		}, 500);

	});
}

let _dungeon_running = false;

async function run_spider_dungeon() {
	if (_dungeon_running) {
		log("Spider Dungeon: Already running — ignoring duplicate start.", "#FF8844");
		return;
	}
	_dungeon_running = true;
	set_suppress_reset(true);
	send_cm(["Ulric", "Riva"], { type: "suppress_reset" });
	try {
		log("Spider Dungeon: Moving to gateway entrance...", "#AA88FF");
		await smarter_move({ map: "gateway", x: -322, y: -203 });
		log("Spider Dungeon: At entrance — entering instance...", "#AA88FF");
		await delay(10000);
		enter("spider_instance");
		await delay(10000);

		log("Spider Dungeon: Signalling party to enter instance...", "#AA88FF");
		send_cm(["Ulric", "Riva"], { type: "enter_instance", in: character.in });

		await new Promise(resolve => {
			const confirmed = new Set();
			const listener = (name, data) => {
				if (data.type === "instance_ready" && ["Ulric", "Riva"].includes(name)) {
					confirmed.add(name);
					log(`Spider Dungeon: ${name} entered instance (${confirmed.size}/2)`, "#AA88FF");
					if (confirmed.size >= 2) {
						remove_cm_listener(listener);
						resolve();
					}
				}
			};
			add_cm_listener(listener);
		});

		log("Spider Dungeon: Full party in instance — proceeding", "#AA88FF");

		log("Spider Dungeon: Moving to spiderbr...", "#AA88FF");
		await smarter_move({ map: "spider_instance", x: 192, y: -1533 });
		await delay(2000);
		await wait_for_death("spiderbr", 192, -1533);
		log("Spider Dungeon: spiderbr dead — looting", "#AA88FF");
		await handle_looting();
		await delay(10000);

		log("Spider Dungeon: Moving to spiderr...", "#AA88FF");
		await smarter_move({ map: "spider_instance", x: 0, y: -1515 });
		await delay(2000);
		await wait_for_death("spiderr", 0, -1515);
		log("Spider Dungeon: spiderr dead — looting", "#AA88FF");
		await handle_looting();
		await delay(10000);

		log("Spider Dungeon: Moving to spiderbl...", "#AA88FF");
		await smarter_move({ map: "spider_instance", x: -188, y: -1515 });
		await delay(2000);
		await wait_for_death("spiderbl", -188, -1515);
		log("Spider Dungeon: spiderbl dead — looting", "#AA88FF");
		await handle_looting();
		await delay(10000);

		log("Spider Dungeon: Complete — reloading party...", "#AA88FF");
		send_cm(["Ulric", "Riva"], { type: "reload" });
		await delay(500);
		parent.window.location.reload();

	} catch (e) {
		catcher(e, "run_spider_dungeon");
	} finally {
		_dungeon_running = false;
		set_suppress_reset(false);
	}
}

function start_spider_dungeon_when_ready() {
	setTimeout(() => {
		if (_dungeon_running) return;
		if (character.rip) {
			log("Spider Dungeon: Character is dead on startup — not auto-starting.", "#FF8844");
			return;
		}
		if (character.map === "spider_instance") {
			log("Spider Dungeon: Detected startup inside instance — restarting from gateway.", "#FFAA44");
		}
		log("Spider Dungeon: Auto-starting...", "#AA88FF");
		run_spider_dungeon();
	}, 5000);
}
