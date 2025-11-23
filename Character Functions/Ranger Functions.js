
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL LOOP SWITCHES AND VARIABLES
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

const ATTACK_UNTARGETED = false;        // Prevent attacking mobs not targeting anyone
const TARGET_LOWEST_HP = false;         // true: lowest HP, false: highest HP

const POTION_HP_THRESHOLD = 300;        // Use potion if missing this much HP
const POTION_MP_THRESHOLD = 400;        // Use potion if missing this much MP

const ORBIT_RADIUS = 70;                // Combat Orbit radius
const ORBIT_STEPS = 12;                 // Number of steps in orbit (e.g., 12 = 30 degrees per step)
const ORBIT_ORIGIN = WARRIOR_TARGET;    // Origin point for orbiting

const PANIC_HP_THRESHOLD = 0.33;        // Panic if below 33% HP
const PANIC_MP_THRESHOLD = 100;         // Panic if below 100 MP
const SAFE_HP_THRESHOLD = 0.66;         // Resume normal if above 66% HP
const SAFE_MP_THRESHOLD = 500;          // Resume normal if above 500 MP
const PANIC_AGGRO_THRESHOLD = 99;       // Panic if this many monsters are targeting you
const PANIC_ORB = "jacko";              // Orb to switch to when panicking
const NORMAL_ORB = "orbg";              // Orb to switch to when not panicking

const AGITATE_MP_THRESHOLD = 800;       // Minimum MP Warrior must have to cast Agitate
const CLEAVE_MP_THRESHOLD = 900;        // Minimum MP Warrior must have to cast Cleave

const FIGHT_SOLO = true;                // If true, Ranger won't check for tanks/healers before engaging

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_NAMES = [
    "attack", "heal", "move", "skill", "panic", "loot", "potion", "orbit", "boss", "status_cache"
];

for (const name of LOOP_NAMES) {
    globalThis[`start_${name}_loop`] = () => { LOOP_STATES[name] = true; };
    globalThis[`stop_${name}_loop`] = () => { LOOP_STATES[name] = false; };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function attack_loop() {

    let delayMs = 100;

    while (true) {
        try {

            if (!LOOP_STATES.attack) {
                await delay(100);
                continue;
            }

            // Find all monsters in range
            const inRange = [];
            let cursed = null;
            for (const id in parent.entities) {
                const mob = parent.entities[id];
                if (mob.type !== "monster" || mob.dead) continue;
                if (!MONSTER_TYPES.includes(mob.mtype)) continue;
                const dist = Math.hypot(mob.x - character.x, mob.y - character.y);
                if (dist <= character.range-1) {
                    inRange.push(mob);
                    // Find a cursed monster in range (prioritize lowest HP if multiple)
                    if (mob.s && mob.s.cursed) {
                        if (!cursed || mob.hp < cursed.hp) cursed = mob;
                    }
                }
            }

            // Sort by HP (lowest first)
            inRange.sort((a, b) => b.hp - a.hp);
            const sorted_targets = inRange.slice(0, 5);

            try {
                if (smart.moving) {
                    await delay(1000)
                    continue; // Skip attacking while smart moving
                } else {
                    // Filter out dead monsters before using their IDs
                    const alive_targets = sorted_targets.filter(m => m && !m.dead);
                    let valid_targets = [];

                    if (FIGHT_SOLO) {
                        valid_targets = alive_targets;
                    } else {
                        valid_targets = alive_targets.filter(mob => mob.target === "Myras");
                    }

                    if (valid_targets.length >= 5 && character.mp >= 320 + 88) {
                        await use_skill("5shot", valid_targets.slice(0, 5).map(m => m.id));
                    } else if (valid_targets.length >= 2 && character.mp >= 200 + 88) {
                        await use_skill("3shot", valid_targets.slice(0, 3).map(m => m.id));
                    } else if (valid_targets.length >= 1 && character.mp >= 100) {
                        await attack(valid_targets[0]);
                    }
                }
                delayMs = ms_to_next_skill("attack") + character.ping + 50;
                await delay(delayMs);
                continue;   
            } catch (e) {
                catcher(e, "Attack Loop error ");
            }
            await delay(100);
        } catch (e) {
            catcher(e, "Attack Loop outer error ");
            await delay(1000); // Prevent rapid error spam
        }
        await delay(100);        
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS LOOP - HALLOWEEN EDITION
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSSES = ["mrpumpkin", "mrgreen"];
const BOSS_RANGE_TOLERANCE = 5;

let last_supershot_time = 0;

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

        const boss_name = select_boss(alive_bosses);

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

        // 2. Equip firebow +7 in mainhand before moving to boss
        const firebow7_slot = parent.character.items.findIndex(item =>
            item && item.name === "firebow" && item.level === 7
        );
        if (
            firebow7_slot !== -1 &&
            (!character.slots.mainhand || character.slots.mainhand.name !== "firebow" || character.slots.mainhand.level !== 7)
        ) {
            try {
                await equip(firebow7_slot, "mainhand");
                await delay(300);
            } catch (e) {
                catcher(e, "Error equipping firebow");
            }
        }

        // 2. Move to boss spawn if known
        const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
            ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
            : null;
        if (boss_spawn) {
            await smarter_move(boss_spawn);
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

            // --- Attack ---
            try {
                change_target(boss);

                // Determine who the boss is targeting (null if none)
                const targetName = boss.target ?? null;
                const skipTargets = ["Riva", "Ulric"];

                // If boss has no target, skip attacking to avoid drawing aggro
                if (!targetName) {
                    log("⏭️ Skipping boss attack — boss has no target", "#aaa", "Alerts");
                } else {
                    // Only attack if boss is targeting "Myras" OR any target that's not in the skip list
                    const shouldAttack = (targetName === "Myras") || !skipTargets.includes(targetName);

                    if (shouldAttack) {
                        if (!is_on_cooldown("huntersmark")) {
                            use_skill("huntersmark", boss);
                        }
                        const now = Date.now();
                        if (now - last_supershot_time >= 31000) { // 31 seconds
                            await use_skill("supershot", boss);
                            last_supershot_time = now;
                        } else {
                            await attack(boss);
                        }
                        delayMs = ms_to_next_skill('attack') + character.ping + 50;
                    } else {
                        log(`⏭️ Skipping boss attack (boss targeting: ${targetName})`, "#aaa", "Alerts");
                    }
                }
            } catch (e) {
                catcher(e, "Boss loop attack");
            }
            await delay(delayMs);
        }

        // 2. Equip pouchbow +9 in mainhand before moving to boss
        const pouchbow_slot = parent.character.items.findIndex(item =>
            item && item.name === "pouchbow" && item.level === 9
        );
        if (
            pouchbow_slot !== -1 &&
            (!character.slots.mainhand || character.slots.mainhand.name !== "pouchbow" || character.slots.mainhand.level !== 9)
        ) {
            try {
                await equip(pouchbow_slot, "mainhand");
                await delay(300);
            } catch (e) {
                catcher(e, "Error equipping pouchbow");
            }
        }

        // 4. Move back to target location
        let moving_home = true;
        smarter_move(RANGER_TARGET).then(() => { moving_home = false; });
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
// BOSS LOOP - GENERAL
// --------------------------------------------------------------------------------------------------------------------------------- //

const GENERAL_BOSSES = ["phoenix"];

let general_boss_active = false;

async function general_boss_loop() {
    LOOP_STATES.boss = true;
    let delayMs = 100;

    try {
        while (LOOP_STATES.general_boss) {
            // 1. Scan for bosses in GENERAL_BOSSES within 300 distance
            let boss = null;
            for (const bossName of GENERAL_BOSSES) {
                boss = Object.values(parent.entities).find(e =>
                    e.type === "monster" &&
                    e.mtype === bossName &&
                    !e.dead &&
                    parent.distance(character, e) <= 300
                );
                if (boss) break;
            }

            if (boss) {
                general_boss_active = true;

                // 2. Move to boss and stop within character.range
                while (boss && !boss.dead) {
                    const dist = parent.distance(character, boss);

                    // Move closer if out of range, but stop once within range
                    if (dist > character.range && !character.moving) {
                        await smarter_move({ map: boss.map, x: boss.x, y: boss.y });
                    } else if (dist > character.range) {
                        // Wait for movement to finish
                        await delay(100);
                    } else if (dist < character.range - 10 && !character.moving) {
                        // Maintain distance: move back if too close
                        const dx = character.x - boss.x;
                        const dy = character.y - boss.y;
                        const d = Math.hypot(dx, dy);
                        const target_x = boss.x + (dx / d) * character.range;
                        const target_y = boss.y + (dy / d) * character.range;
                        move(target_x, target_y);
                        await delay(100);
                    }

                    // 3. Attack logic
                    try {
                        change_target(boss);
                        if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", boss);
                        else if (!is_on_cooldown("supershot")) await use_skill("supershot", boss);
                        else if (can_attack(boss)) await attack(boss);
                        delayMs = ms_to_next_skill("attack") + character.ping + 20;
                    } catch (e) {
                        game_log("Error attacking boss: " + e.message);
                    }

                    // Refresh boss reference
                    boss = parent.entities[boss.id];
                    await delay(delayMs);
                }

                // 4. Boss is dead
                general_boss_active = false;
            } else {
                general_boss_active = false;
                await delay(500);
            }
        }
    } catch (e) {
        game_log("⚠️ General Boss Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.boss = false;
        general_boss_active = false;
        game_log("General boss loop ended unexpectedly", "#ffea00ff");
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
// LOOT LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let lastLoot = null;
let tryLoot = false;
const chestThreshold = 12;

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
    let delayMs = 100;

        while (true) {
            // Check if loot loop is enabled
            if (!LOOP_STATES.loot) {
                await delay(delayMs);
                continue;
            }
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
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTION LOOP
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
        if (HP_MISSING >= 300) {
            if (can_use("hp")) {
                use("hp");
                used_potion = true;
            }
        }

        // Use health potion if needed
        else if (MP_MISSING >= 400) {
            if (can_use("mp")) {
                use("mp");
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
