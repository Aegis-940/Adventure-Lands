
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

// Define default location for monster farming
const TARGET_LOC = { map: "desertland", x: 139, y: -1013, orbit: false };

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS (with persistent state saving)
// --------------------------------------------------------------------------------------------------------------------------------- //

function start_attack_loop() {
    if (LOOP_STATES.attack) return;
    LOOP_STATES.attack = true;
    attack_loop();
    game_log("▶️ Attack loop started");
}

function stop_attack_loop() {
    if (!LOOP_STATES.attack) return;
    LOOP_STATES.attack = false;
    game_log("⏹ Attack loop stopped");
}

function start_move_loop() {
    if (LOOP_STATES.move) return;
    LOOP_STATES.move = true;
    move_loop();
    game_log("▶️ Move loop started");
}

function stop_move_loop() {
    if (!LOOP_STATES.move) return;
    LOOP_STATES.move = false;
    game_log("⏹ Move loop stopped");
}

function start_skill_loop() {
    if (LOOP_STATES.skill) return;
    LOOP_STATES.skill = true;
    skill_loop();
    game_log("▶️ Skill loop started");
}

function stop_skill_loop() {
    if (!LOOP_STATES.skill) return;
    LOOP_STATES.skill = false;
    game_log("⏹ Skill loop stopped");
}

function start_panic_loop() {
    if (LOOP_STATES.panic) return;
    LOOP_STATES.panic = true;
    panic_loop();
    game_log("▶️ Panic loop started");
}

function stop_panic_loop() {
    if (!LOOP_STATES.panic) return;
    LOOP_STATES.panic = false;
    game_log("⏹ Panic loop stopped");
}

function start_loot_loop() {
    if (LOOP_STATES.loot) return;
    LOOP_STATES.loot = true;
    loot_loop();
    game_log("▶️ Loot loop started");
}

function stop_loot_loop() {
    if (!LOOP_STATES.loot) return;
    LOOP_STATES.loot = false;
    game_log("⏹ Loot loop stopped");
}

function start_potions_loop() {
    if (LOOP_STATES.potion) return;
    LOOP_STATES.potion = true;
    potions_loop();
    game_log("▶️ Potions loop started");
}

function stop_potions_loop() {
    if (!LOOP_STATES.potion) return;
    LOOP_STATES.potion = false;
    game_log("⏹ Potions loop stopped");
}

function start_orbit_loop() {
    if (LOOP_STATES.orbit) return;
    LOOP_STATES.orbit = true;
    orbit_loop();
    game_log("▶️ Orbit loop started");
}

function stop_orbit_loop() {
    if (!LOOP_STATES.orbit) return;
    LOOP_STATES.orbit = false;
    game_log("⏹ Orbit loop stopped");
}

function start_boss_loop() {
    if (LOOP_STATES.boss) return;
    LOOP_STATES.boss = true;
    boss_loop();
    game_log("▶️ Boss loop started");
}

function stop_boss_loop() {
    if (!LOOP_STATES.boss) return;
    LOOP_STATES.boss = false;
    game_log("⏹ Boss loop stopped");
}

function start_status_cache_loop() {
    if (LOOP_STATES.cache) return;
    LOOP_STATES.cache = true;
    status_cache_loop();
    game_log("▶️ Status cache loop started");
}

function stop_status_cache_loop() {
    if (!LOOP_STATES.cache) return;
    LOOP_STATES.cache = false;
    game_log("⏹ Status cache loop stopped");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SUPPORT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill]
	if (next_skill == undefined) return 0
	const ms = parent.next_skill[skill].getTime() - Date.now() - Math.min(...parent.pings) - character.ping;
	return ms < 0 ? 0 : ms;
}

function get_nearest_monster_v2(args = {}) {
    let min_d = 999999, target = null;
    let optimal_hp = args.check_max_hp ? 0 : 999999999; // Set initial optimal HP based on whether we're checking for max or min HP

    for (let id in parent.entities) {
        let current = parent.entities[id];
        if (current.type != "monster" || !current.visible || current.dead) continue;
        if (args.type && current.mtype != args.type) continue;
        if (args.min_level !== undefined && current.level < args.min_level) continue;
        if (args.max_level !== undefined && current.level > args.max_level) continue;
        if (args.target && !args.target.includes(current.target)) continue;
        if (args.no_target && current.target && current.target != character.name) continue;

        // Status effects (debuffs/buffs) check
        if (args.statusEffects && !args.statusEffects.every(effect => current.s[effect])) continue;

        // Min/max XP check
        if (args.min_xp !== undefined && current.xp < args.min_xp) continue;
        if (args.max_xp !== undefined && current.xp > args.max_xp) continue;

        // Attack power limit
        if (args.max_att !== undefined && current.attack > args.max_att) continue;

        // Path check
        if (args.path_check && !can_move_to(current)) continue;

        // Distance calculation
        let c_dist = args.point_for_distance_check
            ? Math.hypot(args.point_for_distance_check[0] - current.x, args.point_for_distance_check[1] - current.y)
            : parent.distance(character, current);

        if (args.max_distance !== undefined && c_dist > args.max_distance) continue;

        // Generalized HP check (min or max)
        if (args.check_min_hp || args.check_max_hp) {
            let c_hp = current.hp;
            if ((args.check_min_hp && c_hp < optimal_hp) || (args.check_max_hp && c_hp > optimal_hp)) {
                optimal_hp = c_hp;
                target = current;
            }
            continue;
        }

        // If no specific HP check, choose the closest monster
        if (c_dist < min_d) {
            min_d = c_dist;
            target = current;
        }
    }
    return target;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// STATUS CACHE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function status_cache_loop() {
    LOOP_STATES.cache = true;
    let delayMs = 5000;

    try {
        while (LOOP_STATES.cache) {
            let inventory_count = 0, mpot1_count = 0, hpot1_count = 0, map = "", x = 0, y = 0;
            try { inventory_count = character.items.filter(Boolean).length; } catch (e) {}
            try { mpot1_count = character.items.filter(it => it && it.name === "mpot1").reduce((sum, it) => sum + (it.q || 1), 0); } catch (e) {}
            try { hpot1_count = character.items.filter(it => it && it.name === "hpot1").reduce((sum, it) => sum + (it.q || 1), 0); } catch (e) {}
            try { map = character.map; x = character.x; y = character.y; } catch (e) {}

            // Only send status if inventory is 20+ or either potion is below 2000
            if (
                inventory_count >= 30 ||
                mpot1_count < 2000 ||
                hpot1_count < 2000
            ) {
                try {
                    send_cm("Riff", {
                        type: "status_update",
                        data: {
                            name: character.name,
                            inventory: inventory_count,
                            mpot1: mpot1_count,
                            hpot1: hpot1_count,
                            map: map,
                            x: x,
                            y: y,
                            lastSeen: Date.now()
                        }
                    });
                } catch (e) {
                    game_log("Error sending status to Riff: " + e.message);
                }
            }

            await delay(delayMs);
        }
    } catch (e) {
        game_log("Status cache loop fatal error: " + e.message);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function attack_loop() {

    LOOP_STATES.attack = true;

    let delayMs = 100;

    try {
        while (LOOP_STATES.attack) {

            // 1. Filter all relevant monsters ONCE
            const monsters = Object.values(parent.entities).filter(e =>
                e.type === "monster" &&
                MONSTER_TYPES.includes(e.mtype) &&
                !e.dead &&
                e.visible &&
                e.target &&                 
                e.target !== character.name &&   
                parent.distance(character, e) <= character.range
            );

            // 2. Prioritize cursed monsters if any
            let target = monsters.find(m => m.s && m.s.cursed);

            // 3. Otherwise, pick the Highest HP monster in range
            if (!target && monsters.length) {
                target = monsters.reduce((a, b) => (b.hp < a.hp ? a : b));
            }

            if (target && is_in_range(target) && !smart.moving && character.mp >= 100) {
                try {
                    await attack(target);
                } catch (e) {
                    game_log("Attack error: " + e, "#FF0000");
                }
                delayMs = ms_to_next_skill("attack") + character.ping;
            }
            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Attack Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.attack = false;
        game_log("Attack loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS LOOP - HALLOWEEN EDITION
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSSES = ["mrpumpkin", "mrgreen"];

async function boss_loop() {
    LOOP_STATES.boss = true;
    let delayMs = 100;
    game_log("⚠️ Boss detected ⚠️", "#ff00e6ff");

    try {
        // 1. Find all alive bosses and pick the one with the lowest HP (fallback: oldest spawn)
        let alive_bosses = BOSSES
            .filter(name => parent.S[name] && parent.S[name].live)
            .map(name => ({ name, live: parent.S[name].live }));

        if (!alive_bosses.length) {
            game_log("No alive bosses found.");
            return;
        }

        // Sort by spawn time (oldest first) and lowest HP
        alive_bosses.sort((a, b) => a.live - b.live);
        let lowest_hp_boss = null, lowest_hp = Infinity;
        for (const boss of alive_bosses) {
            let hp = Infinity;
            const entity = Object.values(parent.entities).find(e =>
                e.type === "monster" && e.mtype === boss.name && !e.dead
            );
            if (entity) hp = entity.hp;
            else if (parent.S[boss.name] && typeof parent.S[boss.name].hp === "number") hp = parent.S[boss.name].hp;
            if (hp < lowest_hp) {
                lowest_hp = hp;
                lowest_hp_boss = boss.name;
            }
        }
        let boss_name = lowest_hp_boss || alive_bosses[0].name;

        // 2. Equip fireblade +7 in offhand before moving to boss
        const fireblade7_slot = parent.character.items.findIndex(item =>
            item && item.name === "fireblade" && item.level === 7
        );
        if (
            fireblade7_slot !== -1 &&
            (!character.slots.offhand || character.slots.offhand.name !== "fireblade" || character.slots.offhand.level !== 7)
        ) {
            try {
                await equip(fireblade7_slot, "offhand");
                await delay(300);
            } catch (e) {
                game_log("⚠️ Error equipping fireblade:", "#FF0000");
                game_log(e);
            }
        }

        // 3. Only smart_move if boss spawn is known
        const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
            ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
            : null;

        if (boss_spawn) {
            try {
                await smart_move(boss_spawn);
            } catch (e) {
                game_log("Error moving to boss spawn: " + e.message);
            }
        } else {
            game_log("⚠️ Boss spawn location unknown, skipping smart_move.");
        }

        // 4. Engage boss until dead
        game_log("⚔️ Engaging boss...");
        while (parent.S[boss_name] && parent.S[boss_name].live) {
            const boss = Object.values(parent.entities).find(e =>
                e.type === "monster" && e.mtype === boss_name && !e.dead && e.visible
            );

            if (!boss) {
                await delay(100);
                if (parent.S[boss_name] && parent.S[boss_name].live && boss_spawn) {
                    await smart_move(boss_spawn);
                }
                continue;
            }

            if (!parent.S[boss_name].live) break;

            // Maintain distance: character.range - 5, with a tolerance of ±5
            const dist = parent.distance(character, boss);
            const desired_range = character.range - 5;
            const tolerance = 5;
            if (
                (dist > desired_range + tolerance || dist < desired_range - tolerance) &&
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
                change_target(boss);

                // Only attack if boss is not targeting party
                if (
                    boss.target &&
                    !["Myras", "Ulric", "Riva", character.name].includes(boss.target)
                ) {
                    await attack(boss);
                    delayMs = ms_to_next_skill('attack') + character.ping + 20;
                }
            } catch (e) {
                // Robust error message extraction
                let msg;
                if (typeof e === "string") {
                    msg = e;
                } else if (e && e.message) {
                    msg = e.message;
                } else {
                    try {
                        msg = JSON.stringify(e);
                    } catch {
                        msg = String(e);
                    }
                }

                // // Filter out unwanted error messages by keyword
                // if (msg.includes("cooldown")) {
                //     // Ignore these errors
                //     return;
                // }

                game_log("⚠️ Boss engagement error:", "#FF0000");
                game_log(msg);
            }

            await delay(delayMs);
        }

        // 5. Move back to target location
        let moving_home = true;
        smart_move(TARGET_LOC).then(() => { moving_home = false; });
        while (moving_home) {
            // If boss respawns while returning, break and restart boss loop
            if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
                game_log("🔄 Boss spawned while returning home. Restarting boss loop.");
                break;
            }
            await delay(100);
        }

    } catch (e) {
        game_log("⚠️ Boss Loop error:", "#FF0000");
        game_log(e);
        await delay(1000);
    } finally {
        LOOP_STATES.boss = false;
        game_log("Boss loop ended unexpectedly", "#ffea00ff");
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

let eTime = 0;

const st_maps = [];
const aoe_maps = ["mansion", "main", "cave", "level2s"];

async function skill_loop() {

    LOOP_STATES.skill = true;

    let delayMs = 50; // Start with a higher delay

    try {
        while (LOOP_STATES.skill) {
            if (!character.rip) {
                const Mainhand = character.slots?.mainhand?.name;
                const mp_check = character.mp >= 760;
                const code_cost_check = character.cc < 135;
                let cleave_cooldown = is_on_cooldown("cleave");

                // Exclude cleave if current target is a boss
                const current_target = get_target();
                const is_boss_target = current_target && BOSSES.includes(current_target.mtype);

                // Only check cleave if it's off cooldown and not targeting a boss
                if (!cleave_cooldown && mp_check && code_cost_check && !is_boss_target && character.mp >= 770 && !smart.moving) {
                    await handle_cleave(Mainhand);
                }
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

            // If mana is critically low, always use mp pot first
            if (character.mp < 50 && can_use("mp")) {
                use("mp");
                used_potion = true;
            } else {

                // Use mana potion if needed
                if (MP_MISSING >= 500) {
                    if (can_use("mp")) {
                        use("mp");
                        used_potion = true;
                    }
                }
                
                // Cast partyheal rather than use HP Pot
                if (HP_MISSING >= 400) {
                    if (can_use("hp")) {
                        use("hp");
                        used_potion = true;
                    }
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

async function single_set() {
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
                single_set();
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

const PANIC_WEAPON = "jacko";
const NORMAL_WEAPON = "orbg";

async function panic_loop() {
    LOOP_STATES.panic = true;
    let delayMs = 100;

    try {
        while (LOOP_STATES.panic) {
            // Re-evaluate these every loop!
            const low_health = character.hp < (character.max_hp / 2);
            const low_mana = character.mp < 50;
            const high_health = character.hp >= ((3 * character.max_hp) / 4);
            const high_mana = character.mp >= 500;

            // PANIC CONDITION
            if (low_health) {
                if (!panicking) {
                    panicking = true;
                    game_log("⚠️ Panic triggered: Low health!");
                }

                // Always ensure jacko is equipped
                const jacko_slot = locate_item(PANIC_WEAPON);
                if (character.slots.orb?.name !== PANIC_WEAPON && jacko_slot !== -1) {
                    await equip(jacko_slot);
                    await delay(delayMs);
                }

                // Always try to cast scare if possible
                if (!is_on_cooldown("scare") && can_use("scare")) {
                    game_log("Panicked! Using Scare!");
                    await use_skill("scare");
                    await delay(delayMs);
                }

                await delay(delayMs);
                continue;
            }

            // SAFE CONDITION
            else if (high_health) {
                if (panicking) {
                    panicking = false;
                    game_log("✅ Panic over — resuming normal operations.");
                }
                const orbg_slot = locate_item(NORMAL_WEAPON);
                if (character.slots.orb?.name !== NORMAL_WEAPON && orbg_slot !== -1) {
                    await equip(orbg_slot);
                    await delay(delayMs);
                }
                await delay(delayMs);
                continue;
            }

            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Panic Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.panic = false;
        game_log("Panic loop ended unexpectedly", "#ffea00ff");
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
            await smart_move({ x: 1280, y: 69 });
            await use_skill("agitate");
            await delay(2000);
            await smart_move(TARGET_LOC);
        }
    }
}

