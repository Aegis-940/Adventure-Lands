
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL LOOP SWITCHES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_STATES = {

    attack: false,
    move: false,
    skill: false,
    panic: false,
    orbit: false,
    boss: false,
    potion: false,
    cache: false,

}

const ATTACK_UNTARGETED = false;        // Prevent attacking mobs not targeting anyone
const TARGET_LOWEST_HP = false;         // true: lowest HP, false: highest HP

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
const NORMAL_ORB = "orbg";              // Orb to switch to when not panicking

const AGITATE_MP_THRESHOLD = 800;        // Minimum MP Warrior must have to cast Agitate
const CLEAVE_MP_THRESHOLD = 900;         // Minimum MP Warrior must have to cast Cleave

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS (with persistent state saving)
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_NAMES = [
    "attack", "heal", "move", "skill", "panic", "loot", "potion", "orbit", "boss", "status_cache"
];

for (const name of LOOP_NAMES) {
    globalThis[`start_${name}_loop`] = () => { LOOP_STATES[name] = true; };
    globalThis[`stop_${name}_loop`] = () => { LOOP_STATES[name] = false; };
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SUPPORT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function get_optimal_explosion_target() {
    const explosion_radius = character.explosion / 3.6;
    const monsters_in_range = [];

    // Gather all monsters within character.range
    for (const id in parent.entities) {
        const mob = parent.entities[id];
        if (mob.type !== "monster" || mob.dead) continue;
        const dist = parent.distance(character, mob);
        if (dist <= character.range) {
            monsters_in_range.push(mob);
        }
    }

    let best_target = null;
    let max_hits = 0;

    // For each monster, count how many other monsters would be hit by the explosion
    for (const mob of monsters_in_range) {
        let hits = 0;
        for (const other of monsters_in_range) {
            if (other === mob) continue;
            const dist = Math.hypot(mob.x - other.x, mob.y - other.y);
            if (dist <= explosion_radius) {
                hits++;
            }
        }
        // Include the target itself in the hit count
        hits++; 
        if (hits > max_hits) {
            max_hits = hits;
            best_target = mob;
        }
    }

    return best_target;
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

            let target = null;

            if (character.explosion > 0) {
                // Use optimal explosion target logic
                target = get_optimal_explosion_target();
            } else {
                // Use current logic
                const inRange = [];
                let cursed = null;
                for (const id in parent.entities) {
                    const mob = parent.entities[id];
                    if (mob.type !== "monster" || mob.dead) continue;
                    if (!MONSTER_TYPES.includes(mob.mtype)) continue;
                    const dist = Math.hypot(mob.x - character.x, mob.y - character.y);
                    if (dist <= character.range-1) {
                        // If ATTACK_UNTARGETED is false, skip mobs with no target
                        if (!ATTACK_UNTARGETED && (!mob.target || mob.target === character.name)) continue;
                        inRange.push(mob);
                        // Find a cursed monster in range (prioritize lowest HP if multiple)
                        if (mob.s && mob.s.cursed) {
                            if (!cursed || mob.hp < cursed.hp) cursed = mob;
                        }
                    }
                }

                // Sort by HP according to TARGET_LOWEST_HP
                if (TARGET_LOWEST_HP) {
                    inRange.sort((a, b) => a.hp - b.hp); // lowest HP first
                } else {
                    inRange.sort((a, b) => b.hp - a.hp); // highest HP first
                }
                target = cursed || (inRange.length ? inRange[0] : null);
            }

            try {
                if (smart.moving) {
                    await delay(1000)
                    continue; // Skip attacking while smart moving
                } else if (target && is_in_range(target) && !smart.moving && character.mp >= 80) {
                    await attack(target);
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
const BOSS_RANGE_TOLERANCE = 1;

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
            await smarter_move(boss_spawn);
        } else {
            log("⚠️ Boss spawn location unknown, skipping smarter_move.", "#ffaa00", "Alerts");
        }

        single_set();

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

            try {
                const targetName = boss.target ?? null;
                const skipTargets = ["Riva", "Ulric"];

                // If boss has no target, skip to avoid drawing aggro
                if (!targetName) {
                    log("⏭️ Skipping boss attack — boss has no target", "#aaa", "Alerts");
                } else {
                    const shouldAttack = !!targetName && targetName !== character.name;

                    if (shouldAttack) {
                        await attack(boss);
                    } else {
                        log(`⏭️ Skipping boss attack (boss targeting: ${targetName})`, "#aaa", "Alerts");
                    }
                }
            } catch (e) { catcher(e, "Boss attack error"); }

            delayMs = ms_to_next_skill('attack') + character.ping + 50;
            await delay(delayMs);
        }

        // 4. Move back to target location
        let moving_home = true;
        smarter_move(WARRIOR_TARGET).then(() => { moving_home = false; });
        while (moving_home) {
            // If boss respawns while returning, break and restart boss loop
            if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
                log("🔄 Boss spawned while returning home. Restarting boss loop.", "#ffaa00", "Alerts");
                break;
            }
            await delay(100);
        }
        explosion_set();
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

let eTime = 0;

const st_maps = [];
const aoe_maps = ["main", "level2s", "winter_cave", "spookytown", "halloween"];
const taunt_mobs = ["ghost"];

async function skill_loop() {

    LOOP_STATES.skill = true;

    let delayMs = 50; // Start with a higher delay

    while (true) {

        if (!LOOP_STATES.skill) {
            await delay(delayMs);
            continue;
        }

        const Mainhand = character.slots?.mainhand?.name;
        const code_cost_check = character.cc < 135;
        let cleave_cooldown = is_on_cooldown("cleave");

        // Exclude cleave if current target is a boss
        const current_target = get_target();
        const is_boss_target = current_target && BOSSES.includes(current_target.mtype);

        const warriorTargetName = Object.keys(MONSTER_LOCS).find(
            k => MONSTER_LOCS[k] === WARRIOR_TARGET
        );

        try {
            // Check if character is at WARRIOR_TARGET location (within 20 units)
            const atWarriorTarget =
                Math.hypot(character.x - WARRIOR_TARGET.x, character.y - WARRIOR_TARGET.y) < 20;

            // Find Myras entity and check if within 50 units
            const myras = Object.values(parent.entities).find(
                e => e.type === "character" && e.name === "Myras"
            );
            const myrasNearby = myras && parent.distance(character, myras) <= 50;

            if (
                atWarriorTarget &&
                myrasNearby &&
                warriorTargetName &&
                taunt_mobs.includes(warriorTargetName)
            ) {
                // Count mobs within 600 range that don't have a target
                const untargetedMobs = Object.values(parent.entities).filter(
                    e =>
                        e.type === "monster" &&
                        e.mtype === warriorTargetName &&
                        !e.dead &&
                        parent.distance(character, e) <= 320 &&
                        !e.target
                );
                if (
                    untargetedMobs.length > 3 &&
                    !is_on_cooldown("agitate") &&
                    can_use("agitate") &&
                    character.mp >= AGITATE_MP_THRESHOLD
                ) {
                    await use_skill("agitate");
                }
            }
        } catch (e) {
            catcher(e, "Agitate error ");
        }

        try {
            // Only check cleave if it's off cooldown and not targeting a boss
            if (
                !cleave_cooldown &&
                code_cost_check &&
                !is_boss_target &&
                character.mp >= CLEAVE_MP_THRESHOLD &&
                !smart.moving &&
                aoe_maps.includes(character.map) // <-- Only cleave on allowed maps
            ) {
                await handle_cleave(Mainhand);
            }
        } catch (e) {
            catcher(e, "Skill Loop error ");
        }

        await delay(delayMs);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// LOOT LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let lastLoot = null;
let tryLoot = false;
const chestThreshold = 60;

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
        if (HP_MISSING >= POTION_HP_THRESHOLD) {
            if (can_use("hp")) {
                use("hp");
                used_potion = true;
            }
        }

        // Use health potion if needed
        else if (MP_MISSING >= POTION_MP_THRESHOLD) {
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

let weapon_set_equipped = "";

async function cleave_set() {
    // Only unequip offhand if it's not already empty
    if (character.slots.offhand) {
        unequip("offhand");
    }
    // Only equip bataxe if not already equipped
    const mainhand = character.slots.mainhand;
    if (!mainhand || mainhand.name !== "bataxe" || mainhand.level !== 7) {
        batch_equip([
            { itemName: "bataxe", slot: "mainhand", level: 7 }
        ]);
    }
    weapon_set_equipped = "cleave";
}

async function explosion_set() {
    const mainhand = character.slots.mainhand;
    const offhand = character.slots.offhand;
    const needs_main = !mainhand || mainhand.name !== "fireblade" || mainhand.level !== 8 || mainhand.l !== "l";
    const needs_off = !offhand || offhand.name !== "ololipop" || offhand.level !== 8 || offhand.l !== "l";
    if (needs_main || needs_off) {
        batch_equip([
            { itemName: "fireblade", slot: "mainhand", level: 8, l: "l" },
            { itemName: "ololipop", slot: "offhand", level: 8, l: "l" }
        ]);
    }
    weapon_set_equipped = "explosion";
}

async function single_set() {
    const mainhand = character.slots.mainhand;
    const offhand = character.slots.offhand;
    const needs_main = !mainhand || mainhand.name !== "fireblade" || mainhand.level !== 8 || mainhand.l !== "l";
    const needs_off = !offhand || offhand.name !== "fireblade" || offhand.level !== 7 || offhand.l !== "l";
    if (needs_main || needs_off) {
        batch_equip([
            { itemName: "fireblade", slot: "mainhand", level: 8, l: "l" },
            { itemName: "fireblade", slot: "offhand", level: 7, l: "l" }
        ]);
    }
    weapon_set_equipped = "single";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HANDLE SKILLS
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_cleave_time = 0;
const CLEAVE_THRESHOLD = 500;
const CLEAVE_RANGE = G.skills.cleave.range;
const MAPS_TO_INCLUDE = ["mansion", "main"];

async function handle_cleave(Mainhand) {
    const now = performance.now();
    const time_since_last = now - last_cleave_time;

    // Only proceed if all other conditions are met
    if (
        !smart.moving &&
        time_since_last >= CLEAVE_THRESHOLD &&
        ms_to_next_skill("attack") > 75
    ) {
        // Only now filter monsters
        const monsters = Object.values(parent.entities).filter(e =>
            e?.type === "monster" &&
            !e.dead &&
            e.visible &&
            distance(character, e) <= CLEAVE_RANGE
        );

        if (monsters.length > 2) {
            if (Mainhand !== "bataxe") cleave_set();
            await use_skill("cleave");
            //reduce_cooldown("cleave", character.ping * 0.95);
            last_cleave_time = now;
            // Swap back instantly (don't delay this)
            if (weapon_set_equipped !== "single") {
                await explosion_set();
            }
        }
    } 
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BATCH EQUIP ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

/**
 * Finds inventory indices for the requested items and calls the game's native equip_batch.
 * @param {Array} data - Array of { itemName, slot, level, l } objects.
 * @returns {Promise} Resolves/rejects with the result of equip_batch.
 */

let batch_equip_lock = false;

async function batch_equip(data) {
    if (batch_equip_lock) {
        game_log("batch_equip: Skipped due to lock");
        return;
    }
    batch_equip_lock = true;

    const batch = [];

    for (const equipRequest of data) {
        const { itemName, slot, level, l } = equipRequest;
        if (!itemName || !slot) continue;

        // Check if the slot already has the desired item equipped
        const equipped = character.slots[slot];
        if (
            equipped &&
            equipped.name === itemName &&
            equipped.level === level &&
            (!l || equipped.l === l)
        ) continue;

        // Find the first matching item in inventory
        const item_index = parent.character.items.findIndex(item =>
            item &&
            item.name === itemName &&
            item.level === level &&
            (!l || item.l === l)
        );

        if (item_index !== -1) {
            batch.push({ num: item_index, slot });
        }
    }

    if (!batch.length) {
        batch_equip_lock = false;
        return; // Nothing to equip, return early
    }

    await equip_batch(batch); // Await the batch equip
    batch_equip_lock = false;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// COMBAT ORBIT
// --------------------------------------------------------------------------------------------------------------------------------- //

let orbit_origin = WARRIOR_TARGET;
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
        const low_health = character.hp < PANIC_HP_THRESHOLD;
        const low_mana = character.mp < PANIC_MP_THRESHOLD;
        const high_health = character.hp >= SAFE_HP_THRESHOLD;
        const high_mana = character.mp >= SAFE_MP_THRESHOLD;

        // Aggro check: monsters targeting me
        const monsters_targeting_me = Object.values(parent.entities).filter(
            e => e.type === "monster" && e.target === character.name && !e.dead
        ).length;

        // PANIC CONDITION
        if (low_health || monsters_targeting_me >= PANIC_AGGRO_THRESHOLD) {
            if (!panicking) {
                panicking = true;
                log("⚠️ Panic triggered: Low health/mana or aggro!", "#ffcc00", "Alerts");
            }

            // Equip panic orb if needed
            if (character.slots.orb?.name !== PANIC_ORB) {
                const jacko_slot = locate_item(PANIC_ORB);
                if (jacko_slot !== -1) {
                    await equip(jacko_slot);
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
        if (high_health && monsters_targeting_me < PANIC_AGGRO_THRESHOLD) {
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// CUSTOM FUNCTION TO AGGRO MOBS IF MYRAS HAS ENOUGH MP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_aggro_time = 0;
let last_bigbird_seen = 0;

async function aggro_mobs() {
    if (!LOOP_STATES.boss && !smart.moving && LOOP_STATES.orbit) {
        const now = Date.now();

        // Check for bigbird within 50 units
        const bigbird = Object.values(parent.entities).find(e =>
            e.type === "monster" &&
            e.mtype === "bigbird" &&
            parent.distance(character, e) <= 50
        );

        // Track last time bigbird was seen
        if (bigbird) {
            last_bigbird_seen = now;
        }

        // Check if Myras has more than 75% mp
        const myras_info = get("Myras_newparty_info");
        const myras_has_mp = myras_info && myras_info.mp > 0.8 * myras_info.max_mp;

        // Only aggro if no bigbird nearby, Myras has enough mp, and at least 10s since last bigbird seen
        if (
            !bigbird &&
            myras_has_mp &&
            (now - last_bigbird_seen > 10000) &&
            (now - last_aggro_time > 30000)
        ) {
            last_aggro_time = now;
            await smarter_move({ x: 1280, y: 69 });
            await use_skill("agitate");
            await delay(2000);
            await smarter_move(WARRIOR_TARGET);
        }
    }
}

