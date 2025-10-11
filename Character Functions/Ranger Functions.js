
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
    general_boss: false,
    potion: false,
    cache: false,

}

// Define default location for monster farming
const TARGET_LOC = MONSTER_LOCS.crabs;

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
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
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function attack_loop() {

    LOOP_STATES.attack = true;

    let delayMs = 100;

    try {
        while (LOOP_STATES.attack) {
            game_log("[attack_loop] Top of main loop");

            // Find all monsters in range
            const inRange = [];
            let cursed = null;
            for (const mob of MONSTER_TYPES) {
                // Debug: Log mob being checked
                game_log(`[attack_loop] Checking mob: ${mob.mtype || mob.name || mob.id}`);
                const dist = Math.hypot(mob.x - character.x, mob.y - character.y);
                if (dist <= character.range - 1) {
                    inRange.push(mob);
                    game_log(`[attack_loop] Mob in range: ${mob.mtype || mob.name || mob.id} (dist: ${dist})`);
                    // Find a cursed monster in range (prioritize lowest HP if multiple)
                    if (mob.s && mob.s.cursed) {
                        if (!cursed || mob.hp < cursed.hp) {
                            cursed = mob;
                            game_log(`[attack_loop] Found cursed mob: ${mob.mtype || mob.name || mob.id}`);
                        }
                    }
                }
            }

            // Sort by HP (lowest first)
            inRange.sort((a, b) => a.hp - b.hp);
            const sorted_targets = inRange.slice(0, 5);

            try {
                game_log(`[attack_loop] Sorted targets count: ${sorted_targets.length}`);

                if (cursed) {
                    game_log(`[attack_loop] Attacking cursed mob: ${cursed.mtype || cursed.name || cursed.id}`);
                    change_target(cursed);
                    if (!is_on_cooldown("huntersmark")) {
                        game_log("[attack_loop] Using huntersmark");
                        await use_skill("huntersmark", cursed);
                    }
                    if (!is_on_cooldown("supershot")) {
                        game_log("[attack_loop] Using supershot");
                        await use_skill("supershot", cursed);
                    }
                }

                if (sorted_targets.length >= 5 && character.mp >= 380) {
                    game_log("[attack_loop] Using 5shot");
                    await use_skill("5shot", sorted_targets.map(m => m.id));
                    delayMs = ms_to_next_skill("attack");
                } else if (sorted_targets.length >= 2 && character.mp >= 250) {
                    game_log("[attack_loop] Using 3shot");
                    await use_skill("3shot", sorted_targets.map(m => m.id));
                    delayMs = ms_to_next_skill("attack");
                } else if (sorted_targets.length >= 1) {
                    game_log(`[attack_loop] Single attacking: ${sorted_targets[0].mtype || sorted_targets[0].name || sorted_targets[0].id}`);
                    await attack(sorted_targets[0]);
                    delayMs = ms_to_next_skill("attack");
                } else {
                    game_log("[attack_loop] No targets to attack");
                }
            } catch (e) {
                game_log("⚠️ Attack Loop error (inner):", "#FF0000");
                if (e && e.message) {
                    game_log(e.message);
                } else if (typeof e === "string") {
                    game_log(e);
                } else {
                    game_log(JSON.stringify(e));
                }
            }
            game_log(`[attack_loop] Loop delay: ${delayMs}ms`);
            await delay(delayMs);
        }
    } catch (e) {
        game_log("⚠️ Attack Loop error (outer):", "#FF0000");
        if (e && e.message) {
            game_log(e.message);
        } else if (typeof e === "string") {
            game_log(e);
        } else {
            game_log(JSON.stringify(e));
        }
    } finally {
        LOOP_STATES.attack = false;
        game_log("Attack loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BOSS LOOP - HALLOWEEN EDITION
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSSES = ["mrpumpkin", "mrgreen"];
const GRIND_WEAPON = "hbow";
const BOSS_WEAPON = "firebow";

async function boss_loop() {

    LOOP_STATES.boss = true;

    let delayMs = 100;

    game_log("⚠️ Boss detected ⚠️", "#ff00e6ff");

    try {

        // Find all alive bosses and pick the one with the lowest HP (fallback: oldest spawn)
        let alive_bosses = BOSSES
            .filter(name => parent.S[name] && parent.S[name].live)
            .map(name => ({ name, live: parent.S[name].live }));

        // Sort by spawn time (oldest first)
        alive_bosses.sort((a, b) => a.live - b.live);

        // Find boss with lowest HP (visible or not)
        let lowest_hp_boss = null;
        let lowest_hp = Infinity;
        for (const boss of alive_bosses) {
            let hp = Infinity;
            const entity = Object.values(parent.entities).find(e =>
                e.type === "monster" &&
                e.mtype === boss.name &&
                !e.dead
            );
            if (entity) {
                hp = entity.hp;
            } else if (parent.S[boss.name] && typeof parent.S[boss.name].hp === "number") {
                hp = parent.S[boss.name].hp;
            }
            if (hp < lowest_hp) {
                lowest_hp = hp;
                lowest_hp_boss = boss.name;
            }
        }
        let boss_name = lowest_hp_boss || alive_bosses[0].name;

        // Equip jacko before moving to boss
        const jacko_slot = locate_item("jacko");
        if (jacko_slot !== -1 && character.slots.orb?.name !== "jacko") {
            try {
                await equip(jacko_slot);
                await delay(300);
            } catch (e) {
                game_log("⚠️ Error equipping jacko:", "#FF0000");
                game_log(e);
            }
        }

        // Only smart_move if boss spawn is known
        const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
            ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
            : null;

        if (boss_spawn) {
            let moving = true;

            // Start smart_move and scan for aggro in parallel
            const movePromise = smart_move(boss_spawn).then(() => { moving = false; });

            // Aggro scan loop runs until smart_move finishes or boss dies
            while (moving && parent.S[boss_name] && parent.S[boss_name].live) {
                const aggro = Object.values(parent.entities).some(e =>
                    e.type === "monster" && e.target === character.name && !e.dead
                );
                if (aggro && can_use("scare")) {
                    try {
                        await use_skill("scare");
                    } catch (e) {
                        game_log("⚠️ Error using boss scare:", "#FF0000");
                        game_log(e);
                    }
                }
                await delay(100);
            }

            // Ensure smart_move is awaited (in case loop exited early)
            await movePromise;
        } else {
            game_log("⚠️ Boss spawn location unknown, skipping smart_move.");
        }

        // Engage boss until dead
        game_log("⚔️ Engaging boss...");
        while (parent.S[boss_name].live) {

            const boss = Object.values(parent.entities).find(e =>
                e.type === "monster" &&
                e.mtype === boss_name &&
                !e.dead &&
                e.visible
            );

            if (!boss) {
                await delay(100);
                if (parent.S[boss_name].live) {
                    await smart_move(boss_spawn);
                }
                continue;
            }

            if (!parent.S[boss_name].live){
                break;
            }

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

            // Use scare if aggroed by any monster
            const aggro = Object.values(parent.entities).some(e =>
                e.type === "monster" && e.target === character.name && !e.dead
            );
            if (aggro && can_use("scare")) {
                await use_skill("scare");
            }

            try {
                change_target(boss);

                if (
                    boss.target &&
                    boss.target !== character.name &&
                    boss.target !== "Myras" &&
                    boss.target !== "Ulric" &&
                    boss.target !== "Riva"
                ) {
                    await attack(boss);
                    delayMs = ms_to_next_skill('attack');
                }
            } catch (e) {
                console.error(e);
            }
            
            await delay((delayMs/2)+10);

        }

        // Move back to target location, using scare if targeted during movement
        let moving_home = true;
        smart_move(TARGET_LOC).then(() => { moving_home = false; });
        while (moving_home) {
            const aggro = Object.values(parent.entities).some(e =>
                e.type === "monster" && e.target === character.name && !e.dead
            );
            if (aggro && can_use("scare")) {
                await use_skill("scare");
            }
            // If boss respawns while returning, break and restart boss loop
            if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
                game_log("🔄 Boss spawned while returning home. Restarting boss loop.");
                break;
            }
            await delay(100);
        }

        // Equip orbg once home
        const orbg_slot = locate_item("orbg");
        if (orbg_slot !== -1 && character.slots.orb?.name !== "orbg") {
            await equip(orbg_slot);
            await delay(300);
        }

    } catch (e) {
        game_log("⚠️ Boss Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.boss = false;
        game_log("Boss loop ended unexpectedly", "#ffea00ff");
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
            // 1. Scan for bosses in GENERAL_BOSSES within 500 distance
            let boss = null;
            for (const bossName of GENERAL_BOSSES) {
                boss = Object.values(parent.entities).find(e =>
                    e.type === "monster" &&
                    e.mtype === bossName &&
                    !e.dead &&
                    parent.distance(character, e) <= 500
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
                        await smart_move({ map: boss.map, x: boss.x, y: boss.y });
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
                        if (!is_on_cooldown("supershot")) await use_skill("supershot", boss);
                        if (can_attack(boss)) await attack(boss);
                        delayMs = ms_to_next_skill("attack");
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
    if (!move_enabled) return;
    let delay = 200;

    try {
        // 1) Find the nearest valid monster
        let closest = null;
        let minDist  = Infinity;
        for (const mtype of MONSTER_TYPES) {
            const m = get_nearest_monster_v2({ type: mtype, path_check: true });
            if (!m) continue;
            const d = parent.distance(character, m);
            if (d < minDist) {
                minDist = d;
                closest = m;
            }
        }

        // 2) If we actually found one, and we're out of attack range, move half-way toward it
        if (closest && minDist > character.range) {
            const halfway_x = character.real_x + (closest.real_x - character.real_x) / 2;
            const halfway_y = character.real_y + (closest.real_y - character.real_y) / 2;
            await move(halfway_x, halfway_y);
        }
    } catch (e) {
        console.error(e);
    }

    if (move_enabled) {
        move_timer_id = setTimeout(move_loop, delay);
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

// Main async optimized loot loop
async function loot_loop() {
    while (true) {
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

        await delay(100); // Check every 100ms
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTIONS LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function potions_loop() {
    while (true) {
        // Calculate missing HP/MP
        const hpMissing = character.max_hp - character.hp;
        const mpMissing = character.max_mp - character.mp;

        let used_potion = false;

        // Use health potion if needed (non-priest)
        if (hpMissing >= 400) {
            if (can_use("hp")) {
                await use("hp");
                used_potion = true;
            }
        }

        // Use mana potion if needed
        if (mpMissing >= 500) {
            if (can_use("mp")) {
                await use("mp");
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
