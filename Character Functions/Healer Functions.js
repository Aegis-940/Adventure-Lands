
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL TOGGLES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_STATES = {

    attack: false,
    heal: true,
    move: false,
    skill: false,
    panic: true,
    orbit: false,
    boss: false,
    potion: true,

}

const POTION_HP_THRESHOLD = 300;        // Use potion if missing this much HP
const POTION_MP_THRESHOLD = 400;        // Use potion if missing this much MP

const ORBIT_RADIUS = 27;                // Combat Orbit radius
const ORBIT_STEPS = 12;                 // Number of steps in orbit (e.g., 12 = 30 degrees per step)

const PANIC_HP_THRESHOLD = 0.33;        // Panic if below 33% HP
const PANIC_MP_THRESHOLD = 100;         // Panic if below 100 MP
const SAFE_HP_THRESHOLD = 0.66;         // Resume normal if above 66% HP
const SAFE_MP_THRESHOLD = 500;          // Resume normal if above 500 MP
const PANIC_AGGRO_THRESHOLD = 99;       // Panic if this many monsters are targeting you
const PANIC_ORB = "jacko";              // Orb to switch to when panicking
const NORMAL_ORB = "talkingskull";      // Orb to switch to when not panicking

const TARGET_LIMIT = 99;                // Max number of monsters allowed to target you before stopping attacks
const HEAL_THRESHOLD = 1.5;             // Overheal factor to compensate for resistance. (max_hp - heal/threshold)
const ATTACK_MP_THRESHOLD = 3000;       // Minimum MP required to perform attacks (throttles aggro)

const TARGET_LOWEST_HP = true;          // true: lowest HP, false: highest HP
const PRIORITIZE_UNTARGETED = true;     // true: prefer monsters with no target first

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_NAMES = [
    "attack", "heal", "move", "skill", "panic", "loot", "potions", "orbit", "boss", "status_cache"
];

for (const name of LOOP_NAMES) {
    globalThis[`start_${name}_loop`] = () => { LOOP_STATES[name] = true; };
    globalThis[`stop_${name}_loop`] = () => { LOOP_STATES[name] = false; };
}

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

async function heal_attack_loop() {
    // This loop is designed to be called ONCE and runs forever
    let delayMs = 50;

    while (true) {
        try {

            // --- Target selection ---
            const heal_target = lowest_health_partymember();
            const should_heal = (
                heal_target &&
                heal_target.hp < heal_target.max_hp - (character.heal / HEAL_THRESHOLD) &&
                is_in_range(heal_target)
            );
            // --- Healing logic ---
            if (should_heal && LOOP_STATES.heal) {
                try {
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
                let monsters = Object.values(parent.entities).filter(e =>
                    e.type === "monster" &&
                    MONSTER_TYPES.includes(e.mtype) &&
                    !e.dead &&
                    e.visible &&
                    parent.distance(character, e) <= character.range
                );

                // Prioritize untargeted if toggle is on
                if (PRIORITIZE_UNTARGETED) {
                    monsters = monsters.sort((a, b) => {
                        let aUntargeted = !a.target ? -1 : 0;
                        let bUntargeted = !b.target ? -1 : 0;
                        return aUntargeted - bUntargeted;
                    });
                }

                // Prioritize by HP (lowest or highest)
                if (TARGET_LOWEST_HP) {
                    monsters = monsters.sort((a, b) => (a.hp / a.max_hp) - (b.hp / b.max_hp));
                } else {
                    monsters = monsters.sort((a, b) => (b.hp / b.max_hp) - (a.hp / a.max_hp));
                }

                // Prioritize: cursed > highest HP
                let target = monsters.find(m => m.s && m.s.cursed)
                    || (monsters.length ? monsters.reduce((a, b) => (b.hp < a.hp ? a : b)) : null);

                let monsters_targeting_me = monsters.filter(e => e.target === character.name).length;

                if (
                    target &&
                    is_in_range(target) &&
                    !smart.moving &&
                    character.mp >= ATTACK_MP_THRESHOLD &&
                    monsters_targeting_me < TARGET_LIMIT
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

            await delay(100);
        } catch (e) {
            catcher(e, "heal_attack_loop (outer)");
            await delay(1000); // Prevent rapid error spam
        }
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

    while (true) {
        // Check if boss loop is enabled
        if (!LOOP_STATES.boss) {
            await delay(1000);
            continue;
        }

        log("⚠️ Boss detected ⚠️", "#ff00e6ff", "Alerts");

        // 1. Find all alive bosses and pick the one with the lowest HP (fallback: oldest spawn)
        const alive_bosses = get_alive_bosses();
        if (!alive_bosses.length) {
            log("No alive bosses found.", "#ffaa00", "Alerts");
            return;
        }

        // // Equip panic weapon if needed
        // if (character.slots.orb?.name !== PANIC_WEAPON) {
        //     const jacko_slot = locate_item(PANIC_WEAPON);
        //     if (jacko_slot !== -1) {
        //         await equip(jacko_slot);
        //     }
        // }

        // // Try to cast scare if possible
        // if (!is_on_cooldown("scare") && can_use("scare")) {
        //     log("Panicked! Using Scare!", "#ffcc00", "Alerts");
        //     await use_skill("scare");
        // }

        const boss_name = select_boss(alive_bosses);

        // 2. Move to boss spawn if known
        const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
            ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
            : null;
        if (boss_spawn) {
            let aggro_timeout = false;
            const timeout_ms = 30000;
            const start_time = Date.now();

            // Start smarter_move and monitor aggro
            const movePromise = smarter_move(boss_spawn);
            while (!aggro_timeout && !character.moving && !smart.moving) {
                // Wait for movement to start
                await delay(100);
            }
            while (!aggro_timeout && (character.moving || smart.moving)) {
                // Check for aggro and timeout
                const monsters_targeting_me = Object.values(parent.entities).filter(
                    e => e.type === "monster" && e.target === character.name && !e.dead
                ).length;
                if (Date.now() - start_time > timeout_ms && monsters_targeting_me > 0) {
                    aggro_timeout = true;
                    log("⏰ Timeout: Still have aggro after 30s of smarter_move. Reloading...", "#ff0000", "Alerts");
                    parent.window.location.reload();
                    break;
                }
                await delay(250);
            }
            await movePromise;
        } else {
            log("⚠️ Boss spawn location unknown, skipping smarter_move.", "#ffaa00", "Alerts");
        }

        // 3. Engage boss until dead
        log("⚔️ Engaging boss...", "#ff00e6ff", "Alerts");
        while (parent.S[boss_name] && parent.S[boss_name].live) {
            const boss = get_boss_entity(boss_name);

            if (!boss) {
                await delay(100);
                if (parent.S[boss_name] && parent.S[boss_name].live && boss_spawn) {
                    await smarter_move(boss_spawn);
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
        smarter_move(HEALER_TARGET).then(() => { moving_home = false; });
        while (moving_home) {
            // If boss respawns while returning, break and restart boss loop
            if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
                log("🔄 Boss spawned while returning home. Restarting boss loop.", "#ffaa00", "Alerts");
                break;
            }
            await delay(100);
        }
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {

    let delayMs = 200;

    while (true) {
        // Check if move loop is enabled
        if (!LOOP_STATES.move) {
            await delay(delayMs);
            continue;
        }
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

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {

    let delayMs = 100;

    while (true) {
        // Check if skill loop is enabled
        if (!LOOP_STATES.skill) {
            await delay(delayMs);
            continue;
        }
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

let last_loot_time = null;
let tryLoot = false;
const chestThreshold = 6;

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
    last_loot_time = Date.now();
    tryLoot = true;
}

async function loot_loop() {
    let delayMs = 100;

        while (true) {
            // Check if loot loop is enabled
            if (!LOOP_STATES.loot) {
                await delay(delayMs);
                continue;
            }
            const now = Date.now();

            // If enough time has passed since last loot, and enough chests are present, and not feared
            if ((last_loot_time ?? 0) + 500 < now) {
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
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTIONS LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potion_loop() {

    while (true) {
        // Check if potion loop is enabled
        if (!LOOP_STATES.potion) {
            await delay(200);
            continue;
        }
        // Calculate missing HP/MP
        const HP_MISSING = character.max_hp - character.hp;
        const MP_MISSING = character.max_mp - character.mp;

        let used_potion = false;

        // Use mana potion if needed
        if (MP_MISSING >= POTION_MP_THRESHOLD) {
            if (can_use("mp")) {
                use("mp");
                used_potion = true;
            }
        }

        // Use health potion if needed
        else if (HP_MISSING >= POTION_HP_THRESHOLD) {
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

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT ORBIT
// --------------------------------------------------------------------------------------------------------------------------------- //

let orbit_origin = HEALER_TARGET;
let orbit_path_points = [];
let orbit_path_index = 0;
const MOVE_CHECK_INTERVAL = 120; // ms
const MOVE_TOLERANCE = 5; // pixels

function set_orbit_radius(r) {
    if (typeof r === "number" && r > 0) {
        orbit_radius = r;
        game_log(`Orbit radius set to ${orbit_radius}`);
    }
}

function compute_orbit_path(origin, ORBIT_RADIUS, steps) {
    const points = [];
    for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        points.push({
            x: origin.x + ORBIT_RADIUS * Math.cos(angle),
            y: origin.y + ORBIT_RADIUS * Math.sin(angle)
        });
    }
    return points;
}

async function orbit_loop() {

    let delayMs = 50;

    while(true) {
        // Wait until orbit loop is enabled
        if (!LOOP_STATES.orbit) {
            await delay(100);
            continue;
        }

        // orbit_origin = { x: character.real_x, y: character.real_y };
        set_orbit_radius(ORBIT_RADIUS);
        orbit_path_points = compute_orbit_path(orbit_origin, ORBIT_RADIUS, ORBIT_STEPS);
        orbit_path_index = 0;

        while (true) {
            // Check if orbit loop is enabled
            if (!LOOP_STATES.orbit) {
                await delay(100);
                continue;
            }
            // Stop the loop if character is more than 100 units from the orbit origin
            const dist_from_origin = Math.hypot(character.real_x - orbit_origin.x, character.real_y - orbit_origin.y);
            if (dist_from_origin > 100) {
                game_log("⚠️ Exiting orbit: too far from origin.", "#FF0000");
                LOOP_STATES.orbit = false;
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
    }

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC BUTTON!!!
// --------------------------------------------------------------------------------------------------------------------------------- //

let panicking = false;

async function panic_loop() {
    
    let delayMs = 100;

    while (true) { 
        // Check if panic loop is enabled
        if (!LOOP_STATES.panic) {
            await delay(delayMs);
            continue;
        }
        // --- Panic/Safe Conditions ---
        const low_health = character.hp < character.max_hp * PANIC_HP_THRESHOLD;
        const low_mana = character.mp < PANIC_MP_THRESHOLD;
        const high_health = character.hp >= character.max_hp * SAFE_HP_THRESHOLD;
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

            // Equip panic orb if needed
            if (character.slots.orb?.name !== PANIC_ORB) {
                const orb_slot = locate_item(PANIC_ORB);
                if (orb_slot !== -1) {
                    await equip(orb_slot);
                }
            }

            // Try to cast scare if possible
            if (!is_on_cooldown("scare") && can_use("scare")) {
                log("Panicked! Using Scare!", "#ffcc00", "Alerts");
                await use_skill("scare");
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
            // Equip normal orb if needed
            if (character.slots.orb?.name !== NORMAL_ORB) {
                const orbg_slot = locate_item(NORMAL_ORB);
                if (orbg_slot !== -1) {
                    await equip(orbg_slot);
                    await delay(delayMs);
                }
            }
        }

        await delay(delayMs);
    }
}

