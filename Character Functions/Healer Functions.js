
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL LOOP SWITCHES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_STATES = {

    attack: false,
    heal: false,
    move: false,
    skill: false,
    panic: false,
    orbit: false,
    boss: false,
    potion: false,

}

// Define default location for monster farming
const TARGET_LOC = { map: "desertland", x: 171, y: -970, orbit: true };

const HEALER_CONFIG = {
    potion: { hp: 400, mp: 500 },
    orbit:  { radius: 27, steps: 12 },
    panic:  { hp: 0.33, mp: 50 }
};

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

async function run_loop(name, fn) {
    // Prevent multiple instances of the same loop
    if (LOOP_STATES[name + "_running"]) {
        log(`${name} loop already running, aborting duplicate.`, "#FFAA00", "Errors");
        return;
    }
    LOOP_STATES[name + "_running"] = true;
    LOOP_STATES[name] = true;
    try {
        await fn();
    } catch (e) {
        catcher(e, `${name} loop`);
    } finally {
        LOOP_STATES[name] = false;
        LOOP_STATES[name + "_running"] = false;
        log(`${name} loop ended unexpectedly`, "#ffea00ff", "Errors");
    }
}

function stop_loop(name) {
    if (!LOOP_STATES[name]) return;
    LOOP_STATES[name] = false;
    LOOP_STATES[name + "_running"] = false; // Ensure running flag is cleared
    log(`⏹ ${name.charAt(0).toUpperCase() + name.slice(1)} loop stopped`);
}

function start_attack_loop() { LOOP_STATES.attack = true; }
function stop_attack_loop() { LOOP_STATES.attack = false; }

function start_heal_loop() { LOOP_STATES.heal = true; }
function stop_heal_loop() { LOOP_STATES.heal = false; }

function start_move_loop() { run_loop("move", move_loop); }
function stop_move_loop() { stop_loop("move"); }

function start_skill_loop() { run_loop("skill", skill_loop); }
function stop_skill_loop() { stop_loop("skill"); }

function start_panic_loop() { run_loop("panic", panic_loop); }
function stop_panic_loop() { stop_loop("panic"); }

function start_loot_loop() { run_loop("loot", loot_loop); }
function stop_loot_loop() { stop_loop("loot"); }

function start_potions_loop() { run_loop("potion", potions_loop); }
function stop_potions_loop() { stop_loop("potion"); }

function start_orbit_loop() { run_loop("orbit", orbit_loop); }
function stop_orbit_loop() { stop_loop("orbit"); }

function start_boss_loop() { run_loop("boss", boss_loop); }
function stop_boss_loop() { stop_loop("boss"); }

function start_status_cache_loop() { run_loop("cache", status_cache_loop); }
function stop_status_cache_loop() { stop_loop("cache"); }

// --------------------------------------------------------------------------------------------------------------------------------- //
// SUPPORT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function lowest_health_partymember() {
	let party_mems = Object.keys(parent.party).filter(e => parent.entities[e] && !parent.entities[e].rip);
	let the_party = [];

	for (let key of party_mems)
		the_party.push(parent.entities[key]);

	the_party.push(character);

	// Populate health percentages
	let res = the_party.sort(function (a, b) {
		let a_rat = a.hp / a.max_hp;
		let b_rat = b.hp / b.max_hp;
		return a_rat - b_rat;
	});

	return res[0];
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

// Toggle options
let ATTACK_TARGET_LOWEST_HP = true;      // true: lowest HP, false: highest HP
let ATTACK_PRIORITIZE_UNTARGETED = true; // true: prefer monsters with no target first

async function heal_attack_loop() {
    // This loop is designed to be called ONCE and runs forever
    let delayMs = 50;

    while (true) {
        // --- Target selection ---
        const heal_target = lowest_health_partymember();
        const should_heal = (
            heal_target &&
            heal_target.hp < heal_target.max_hp - (character.heal / 1.5) &&
            is_in_range(heal_target)
        );

        // --- Healing logic ---
        if (should_heal && LOOP_STATES.heal) {
            try {
                log(`💖 Healing ${heal_target.name}`, "#00FF00", "General");
                await heal(heal_target);
            } catch (e) {
                catcher(e, "Heal loop error");
            }
            delayMs = ms_to_next_skill("attack") + character.ping + 50;
            await delay(delayMs);
            continue;
        }

        // --- Attacking logic ---
        else if (LOOP_STATES.attack) {
            // Gather all valid monsters in range
            const monsters = Object.values(parent.entities).filter(e =>
                e.type === "monster" &&
                MONSTER_TYPES.includes(e.mtype) &&
                !e.dead &&
                e.visible &&
                parent.distance(character, e) <= character.range
            );

            // Prioritize: cursed > highest HP
            let target = monsters.find(m => m.s && m.s.cursed)
                || (monsters.length ? monsters.reduce((a, b) => (b.hp < a.hp ? a : b)) : null);

            const monsters_targeting_me = monsters.filter(e => e.target === character.name).length;

            if (
                target &&
                is_in_range(target) &&
                !smart.moving &&
                character.mp >= 3000 &&
                monsters_targeting_me < 5
            ) {
                try {
                    await attack(target);
                } catch (e) {
                    catcher(e, "Attack loop error");
                }
                delayMs = ms_to_next_skill("attack") + character.ping + 50;
                await delay(delayMs);
                continue;
            }
        }

        // --- If nothing to do, short delay ---
        await delay(50);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS LOOP - HALLOWEEN EDITION
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSSES = ["mrpumpkin", "mrgreen"];
const BOSS_RANGE_TOLERANCE = 5;

function get_party_names() {
    return Object.keys(parent.party).concat(character.name);
}

function get_alive_bosses() {
    return BOSSES
        .filter(name => parent.S[name] && parent.S[name].live)
        .map(name => ({ name, live: parent.S[name].live }));
}

function get_boss_entity(boss_name) {
    return Object.values(parent.entities).find(e =>
        e.type === "monster" && e.mtype === boss_name && !e.dead && e.visible
    );
}

function select_boss(alive_bosses) {
    let lowest_hp_boss = null, lowest_hp = Infinity;
    for (const boss of alive_bosses) {
        let hp = Infinity;
        const entity = get_boss_entity(boss.name);
        if (entity) hp = entity.hp;
        else if (parent.S[boss.name] && typeof parent.S[boss.name].hp === "number") hp = parent.S[boss.name].hp;
        if (hp < lowest_hp) {
            lowest_hp = hp;
            lowest_hp_boss = boss.name;
        }
    }
    return lowest_hp_boss || (alive_bosses[0] && alive_bosses[0].name);
}

async function boss_loop() {
    log("⚠️ Boss detected ⚠️", "#ff00e6ff", "Alerts");

    // 1. Find all alive bosses and pick the one with the lowest HP (fallback: oldest spawn)
    const alive_bosses = get_alive_bosses();
    if (!alive_bosses.length) {
        log("No alive bosses found.", "#ffaa00", "Alerts");
        return;
    }

    const boss_name = select_boss(alive_bosses);

    // 2. Move to boss spawn if known
    const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
        ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
        : null;
    if (boss_spawn) {
        await smart_move(boss_spawn);
    } else {
        log("⚠️ Boss spawn location unknown, skipping smart_move.", "#ffaa00", "Alerts");
    }

    // 3. Engage boss until dead
    log("⚔️ Engaging boss...", "#ff00e6ff", "Alerts");
    while (parent.S[boss_name] && parent.S[boss_name].live) {
        const boss = get_boss_entity(boss_name);

        if (!boss) {
            await delay(100);
            if (parent.S[boss_name] && parent.S[boss_name].live && boss_spawn) {
                await smart_move(boss_spawn);
            }
            continue;
        }

        // Maintain distance: character.range - 5, with a tolerance
        const dist = parent.distance(character, boss);
        const desired_range = character.range - BOSS_RANGE_TOLERANCE;
        if (
            (dist > desired_range + BOSS_RANGE_TOLERANCE || dist < desired_range - BOSS_RANGE_TOLERANCE) &&
            !character.moving
        ) {
            const dx = boss.x - character.x;
            const dy = boss.y - character.y;
            const d = Math.hypot(dx, dy);
            const target_x = boss.x - (dx / d) * desired_range;
            const target_y = boss.y - (dy / d) * desired_range;
            if (Math.hypot(target_x - character.x, target_y - character.y) > 10) {
                move(target_x, target_y);
            }
        }

        // --- Heal or Attack ---
        const heal_target = lowest_health_partymember();
        try {
            if (
                heal_target &&
                heal_target.hp < heal_target.max_hp - (character.heal / 1.33) &&
                is_in_range(heal_target)
            ) {
                await heal(heal_target);
            } else {
                await attack(boss);
            }
        } catch (e) { catcher(e, "Boss attack error"); }

        delayMs = ms_to_next_skill('attack') + character.ping + 50;
        await delay(delayMs);
    }

    // 4. Move back to target location
    let moving_home = true;
    smart_move(TARGET_LOC).then(() => { moving_home = false; });
    while (moving_home) {
        // If boss respawns while returning, break and restart boss loop
        if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
            log("🔄 Boss spawned while returning home. Restarting boss loop.", "#ffaa00", "Alerts");
            break;
        }
        await delay(100);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {

    LOOP_STATES.move = true;

    let delayMs = 200;

    try {
        while (LOOP_STATES.move) {
            // Don’t override an in-progress move
            if (character.moving || smart.moving) {
                await delay(delayMs);
                continue;
            }

            let move_target = null;
            let best_dist = Infinity;

            // 1) Find the absolute closest monster in MONSTER_TYPES
            for (const mtype of MONSTER_TYPES) {
                const mon = get_nearest_monster_v2({ type: mtype, path_check: true });
                if (!mon) continue;
                const d = parent.distance(character, mon);
                if (d < best_dist) {
                    best_dist = d;
                    move_target = mon;
                }
            }

            // If monster is already in attack range, we don’t need to move
            if (move_target && parent.distance(character, move_target) <= character.range) {
                move_target = null;
            }

            // 3) If we’ve picked someone to follow, move directly to them
            if (move_target) {
                await move(move_target.real_x, move_target.real_y);
                move_target = null;
            }

            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Move Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.move = false;
        game_log("Move loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {

    LOOP_STATES.skill = true;

    let delayMs = 100;

    try {
        while (LOOP_STATES.skill) {
            const X = character.real_x;
            const Y = character.real_y;
            const dead = character.rip;
            const disabled = !parent.is_disabled(character);
            const mapsToExclude = [];
            const eventMaps = [];
            const eventMobs = [];

            // Use global PRIEST_SKILL_TOGGLES if you want toggles to persist
            if (character.ctype === "priest") {
                await handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps);
            }

            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Skill Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.skill = false;
        game_log("Skill loop ended unexpectedly", "#ffea00ff");
    }
}

async function safe_call(fn, name) {
	try {
		await fn();
	} catch (e) {
		game_log(`Error in ${name}:`, e);
	}
}

const CURSE_WHITELIST = ["mrpumpkin", "mrgreen", "phoenix"];
const ABSORB_BLACKLIST = ["mrpumpkin", "mrgreen"];

async function handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps, zapperMobs) {
    if (dead || !disabled) return;

    if (PRIEST_SKILL_TOGGLES.curse && !smart.moving)
        safe_call(() => handle_cursing(X, Y, CURSE_WHITELIST), "handle_cursing");
    if (PRIEST_SKILL_TOGGLES.absorb && !smart.moving)
        safe_call(() => handle_absorb(mapsToExclude, eventMobs, eventMaps, ABSORB_BLACKLIST), "handle_absorb");
    if (PRIEST_SKILL_TOGGLES.party_heal)
        safe_call(() => handle_party_heal(), "handle_party_heal");
    if (PRIEST_SKILL_TOGGLES.dark_blessing && !smart.moving)
        safe_call(() => handle_dark_blessing(), "handle_dark_blessing");
    if (PRIEST_SKILL_TOGGLES.zap_spam && !smart.moving)
        safe_call(() => handleZapSpam(zapperMobs), "handleZapSpam");
}

async function handle_cursing(X, Y, whitelist) {
    const ctarget = get_nearest_monster_v2({
        type: whitelist,
        check_max_hp: true,
        max_distance: 75,
        point_for_distance_check: [X, Y],
    }) || get_targeted_monster();

    if (
        ctarget &&
        ctarget.hp >= ctarget.max_hp * 0.2 &&
        !ctarget.immune &&
        whitelist.includes(ctarget.mtype)
    ) {
        if (!is_on_cooldown("curse")) {
            try {
                await use_skill("curse", ctarget);
            } catch (e) {
                if (e?.reason !== "cooldown") throw e;
            }
        }
    }
}

let absorb_last_used = 0;
const ABSORB_COOLDOWN = 2000; // 2 second cooldown for absorb

async function handle_absorb(mapsToExclude, eventMobs, eventMaps, blacklist) {
    const now = Date.now();
    if (now - absorb_last_used < ABSORB_COOLDOWN) return;

    const partyNames = Object.keys(parent.party).filter(name => name !== character.name);

    const attackers = {};
    for (const id in parent.entities) {
        const monster = parent.entities[id];
        if (
            monster.type !== "monster" ||
            monster.dead ||
            !monster.visible ||
            blacklist.includes(monster.mtype)
        ) continue;
        if (partyNames.includes(monster.target)) attackers[monster.target] = true;
    }

    for (const name of partyNames) {
        if (attackers[name] && character.hp > character.max_hp * 0.5 && character.mp > 1000) {
            try {
                await use_skill("absorb", name);
                game_log(`Absorbing ${name}`, "#FFA600");
                absorb_last_used = now;
            } catch (e) {
                if (e?.reason !== "cooldown") throw e;
            }
            return;
        }
    }
}

async function handle_party_heal(minMissingHpMap = {}, minMp = 1000) {
    if (character.mp <= minMp) return;
    if (is_on_cooldown("partyheal")) return;

    // Default thresholds for each character
    const defaultThresholds = {
        Myras: character.heal + 800,
        Ulric: 1500,
        Riva: 1500,
        Riff: 500
    };

    // Merge user-provided thresholds with defaults
    const thresholds = { ...defaultThresholds, ...minMissingHpMap };

    // Use remote party info for up-to-date HP/MP, even across maps
    for (const name of Object.keys(parent.party)) {
        // if (name === character.name) continue;
        const info = get(name + '_newparty_info');
        if (!info || info.rip) continue;
        const threshold = thresholds[name] !== undefined ? thresholds[name] : 2000;
        if ((info.max_hp - info.hp) > threshold) {
            try {
                await use_skill("partyheal");
            } catch (e) {
                if (e?.reason !== "cooldown") throw e;
            }
            break;
        }
    }
}

async function handle_dark_blessing() {
	const nearbyHome = get_nearest_monster({ type: "home" });
	if (!nearbyHome) return;

	if (!is_on_cooldown("darkblessing")) {
		await use_skill("darkblessing");
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let lastLoot = null;
let tryLoot = false;
const chestThreshold = 3;

// Count the number of available chests
function getNumChests() {
    return Object.keys(get_chests()).length;
}

// Async function to loot up to chestThreshold chests
async function loot_chests() {
    let looted = 0;
    for (const id in get_chests()) {
        if (looted >= chestThreshold) break;
        parent.open_chest(id);
        looted++;
        await delay(60); // Small delay to avoid server spam
    }
    lastLoot = Date.now();
    tryLoot = true;
}

async function loot_loop() {
    LOOP_STATES.loot = true;
    let delayMs = 100;

    try {
        while (LOOP_STATES.loot) {
            const now = Date.now();

            // If enough time has passed since last loot, and enough chests are present, and not feared
            if ((lastLoot ?? 0) + 500 < now) {
                if (getNumChests() >= chestThreshold && character.fear < 6) {
                    await loot_chests();
                }
            }

            // If chests drop below threshold after looting, reset tryLoot
            if (getNumChests() < chestThreshold && tryLoot) {
                tryLoot = false;
            }

            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Loot Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.loot = false;
        game_log("Loot loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTIONS LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potions_loop() {

    LOOP_STATES.potion = true;

    try {
        while (LOOP_STATES.potion) {
            // Calculate missing HP/MP
            const HP_MISSING = character.max_hp - character.hp;
            const MP_MISSING = character.max_mp - character.mp;

            let used_potion = false;

            // Use mana potion if needed
            if (MP_MISSING >= 500) {
                if (can_use("mp")) {
                    use("mp");
                    used_potion = true;
                }
            }

            // Use health potion if needed
            else if (HP_MISSING >= 400) {
                if (can_use("hp")) {
                    use("hp");
                    used_potion = true;
                }
            }

            if (used_potion) {
                await delay(2010); // Wait 2 seconds after using a potion
            } else {
                await delay(10);   // Otherwise, check again in 10ms
            }
        }
    } catch (e) {
        game_log("⚠️ Potions Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.potion = false;
        game_log("Potions loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT ORBIT
// --------------------------------------------------------------------------------------------------------------------------------- //

let orbit_origin = null;
let orbit_radius = 27;
let orbit_path_points = [];
let orbit_path_index = 0;
const ORBIT_STEPS = 12; // 30 degrees per step
const MOVE_CHECK_INTERVAL = 120; // ms
const MOVE_TOLERANCE = 5; // pixels

function set_orbit_radius(r) {
    if (typeof r === "number" && r > 0) {
        orbit_radius = r;
        game_log(`Orbit radius set to ${orbit_radius}`);
    }
}

function compute_orbit_path(origin, orbit_radius, steps) {
    const points = [];
    for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        points.push({
            x: origin.x + orbit_radius * Math.cos(angle),
            y: origin.y + orbit_radius * Math.sin(angle)
        });
    }
    return points;
}

async function orbit_loop() {

    LOOP_STATES.orbit = true;

    let delayMs = 10;

    orbit_origin = { x: character.real_x, y: character.real_y };
    set_orbit_radius(orbit_radius);
    orbit_path_points = compute_orbit_path(orbit_origin, orbit_radius, ORBIT_STEPS);
    orbit_path_index = 0;

    try {
        while (LOOP_STATES.orbit) {

            // Stop the loop if character is more than 100 units from the orbit origin
            const dist_from_origin = Math.hypot(character.real_x - orbit_origin.x, character.real_y - orbit_origin.y);
            if (dist_from_origin > 100) {
                game_log("⚠️ Exiting orbit: too far from origin.", "#FF0000");
                break;
            }

            const point = orbit_path_points[orbit_path_index];
            orbit_path_index = (orbit_path_index + 1) % orbit_path_points.length;

            // Only move if not already close to the next point
            const dist = Math.hypot(character.real_x - point.x, character.real_y - point.y);
            if (!character.moving && !smart.moving && dist > MOVE_TOLERANCE) {
                try {
                    await move(point.x, point.y);
                } catch (e) {
                    console.error("Orbit move error:", e);
                }
            }

            // Wait until movement is finished or interrupted
            while (LOOP_STATES.orbit && (character.moving || smart.moving)) {
                await new Promise(resolve => setTimeout(resolve, MOVE_CHECK_INTERVAL));
            }

            // Small delay before next step to reduce CPU usage
            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Orbit Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.orbit = false;
        game_log("Orbit loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC BUTTON!!!
// --------------------------------------------------------------------------------------------------------------------------------- //

let panicking = false;

const PANIC_HP_THRESHOLD = character.max_hp / 3;        // Panic if below 33% HP
const PANIC_MP_THRESHOLD = 50;                          // Panic if below 50 MP     
const SAFE_HP_THRESHOLD = (2 * character.max_hp) / 3;   // Resume normal if above 66% HP
const SAFE_MP_THRESHOLD = 500;                          // Resume normal if above 500 MP
const PANIC_AGGRO_THRESHOLD = 99;                       // Panic if this many monsters are targeting you
const PANIC_WEAPON = "jacko";
const NORMAL_WEAPON = "orboffire";

async function panic_loop() {
    let delayMs = 100;

    while (LOOP_STATES.panic) {
        // --- Panic/Safe Conditions ---
        const low_health = character.hp < PANIC_HP_THRESHOLD;
        const low_mana = character.mp < PANIC_MP_THRESHOLD;
        const high_health = character.hp >= SAFE_HP_THRESHOLD;
        const high_mana = character.mp >= SAFE_MP_THRESHOLD;

        // Aggro check: monsters targeting me
        const monsters_targeting_me = Object.values(parent.entities).filter(
            e => e.type === "monster" && e.target === character.name && !e.dead
        ).length;

        // PANIC CONDITION
        if (low_health || low_mana || monsters_targeting_me >= PANIC_AGGRO_THRESHOLD) {
            if (!panicking) {
                panicking = true;
                log("⚠️ Panic triggered: Low health/mana or aggro!", "#ffcc00", "Alerts");
            }

            // Equip panic weapon if needed
            if (character.slots.orb?.name !== PANIC_WEAPON) {
                const jacko_slot = locate_item(PANIC_WEAPON);
                if (jacko_slot !== -1) {
                    await equip(jacko_slot);
                    await delay(delayMs);
                }
            }

            // Try to cast scare if possible
            if (!is_on_cooldown("scare") && can_use("scare")) {
                log("Panicked! Using Scare!", "#ffcc00", "Alerts");
                await use_skill("scare");
                await delay(delayMs);
            }

            await delay(delayMs);
            continue;
        }

        // SAFE CONDITION
        if (high_health && high_mana && monsters_targeting_me < PANIC_AGGRO_THRESHOLD) {
            if (panicking) {
                panicking = false;
                log("✅ Panic over — resuming normal operations.", "#00ff00", "Alerts");
            }
            // Equip normal weapon if needed
            if (character.slots.orb?.name !== NORMAL_WEAPON) {
                const orbg_slot = locate_item(NORMAL_WEAPON);
                if (orbg_slot !== -1) {
                    await equip(orbg_slot);
                    await delay(delayMs);
                }
            }
        }

        await delay(delayMs);
    }
}

