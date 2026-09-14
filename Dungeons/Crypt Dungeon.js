// --------------------------------------------------------------------------------------------------------------------------------- //
// CRYPT DUNGEON — the healer opens the instance and then drives the party by hand
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRYPT_VAMPIRELINGS = "vbat";
const CRYPT_PRIORITY = [CRYPT_VAMPIRELINGS, "a3"];
const CRYPT_OPPORTUNISTIC = ["a2", "a7"];
const CRYPT_AVOID = ["a1", "a4", "a5", "a6", "a8"];
const CRYPT_QUOTA = { a3: 1, a7: 1, a2: 1, vbat: 7 };

DUNGEONS.crypt = {
	name: "Crypt Dungeon",
	map: "crypt",
	home: "crypt",
	key: "cryptkey",
	entrance: { map: "cave", x: -192, y: -1308 },
	spawn: { map: "crypt", x: 0, y: 0 },
	exit: { map: "cave", x: -192, y: -1308 },
	camp: { map: "crypt", x: 1191, y: -385 },
	priority: CRYPT_PRIORITY,
	opportunistic: CRYPT_OPPORTUNISTIC,
	avoid: CRYPT_AVOID,
	only: [...CRYPT_PRIORITY, ...CRYPT_OPPORTUNISTIC],
	quota: CRYPT_QUOTA,
	suppress_aggro_when: ["a2", "a3", "a7"],
	focus: [{ when: "a2", suppress: [CRYPT_VAMPIRELINGS] }],
	route: "run_crypt_route",
	leave: "crypt_leave",
	flags: {
		leader_manual: true,
		ignore_events: true,
		center_on_tank: true,
		combat_always_on: true,
		fight_while_moving: true,
		single_target: true,
		warrior_single_weapon: true,
		no_cleave: true,
		no_agitate: false,
		circle_on_self: true,
		absorb_nearby: true,
		aggroed_only: false,
		defensive_targeting: false,
		no_attack: false,
		target_lowest_hp: true,
		cohesion_range: 60,
		cohesion_regroup: 40,
		aggro_cap_fixed: 1,
	},
};

function run_crypt_dungeon() {
	return run_dungeon(DUNGEONS.crypt);
}

function start_crypt_dungeon_when_ready() {
	start_dungeon_when_ready(DUNGEONS.crypt);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// WAYPOINTS — the healer is driven by hand, these are the spots worth returning to
// --------------------------------------------------------------------------------------------------------------------------------- //

function crypt_go(where) {
	const d = DUNGEONS.crypt;
	const spot = d[where];
	if (!spot) return log(`Crypt: no waypoint named ${where}`, DUNGEON_WARN_COLOR);
	log(`Crypt: walking to ${where} (${Math.round(spot.x)}, ${Math.round(spot.y)})`, DUNGEON_LOG_COLOR);
	return dungeon_travel(spot);
}

function crypt_camp() { return crypt_go("camp"); }

async function crypt_leave() {
	log("Crypt: clearing the floor before leaving", DUNGEON_LOG_COLOR, "Alerts");
	await dungeon_loot_everything();

	if (character.map === DUNGEONS.crypt.map && !dungeon_at_spawn(DUNGEONS.crypt)) {
		await dungeon_bail_out("heading for the door", true, false);
		await dungeon_loot_everything();
	}

	return crypt_go("exit");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// THREAT WATCH — what is actually near us, and whether we should be here
// --------------------------------------------------------------------------------------------------------------------------------- //

const CRYPT_BOSS_TYPES = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
const CRYPT_THREAT_RADIUS = 400;

function crypt_bosses_near(radius = CRYPT_THREAT_RADIUS) {
	const found = [];
	for (const id in parent.entities) {
		const e = parent.entities[id];
		if (e.type !== "monster" || e.dead) continue;
		if (!CRYPT_BOSS_TYPES.includes(e.mtype)) continue;
		if (Math.hypot(character.x - e.x, character.y - e.y) > radius) continue;
		found.push(e);
	}
	return found;
}

function crypt_threat_report() {
	const near = crypt_bosses_near();
	if (!near.length) return log("Crypt: no bosses in view", DUNGEON_LOG_COLOR);
	for (const e of near) {
		const name = (G.monsters[e.mtype] || {}).name || e.mtype;
		const avoided = CRYPT_AVOID.includes(e.mtype) ? " ⚠️ AVOID" : "";
		log(`Crypt: ${name} (${e.mtype}) at ${Math.round(distance(character, e))}${avoided}`, DUNGEON_LOG_COLOR);
	}
}
