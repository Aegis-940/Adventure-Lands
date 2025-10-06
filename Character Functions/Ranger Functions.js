
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL SWITCHES & TIMERS
// --------------------------------------------------------------------------------------------------------------------------------- //

let attack_enabled   = true;
let attack_timer_id  = null;
let move_enabled     = true;
let move_timer_id    = null;

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

function start_attack_loop() {
    attack_enabled = true;
    clearTimeout(attack_timer_id); // Always clear any previous timer
    attack_loop();
    save_persistent_state();
    game_log("▶️ Attack loop started");
}

function stop_attack_loop() {
    attack_enabled = false;
    clearTimeout(attack_timer_id);
    save_persistent_state();
    game_log("⏹ Attack loop stopped");
}

function start_move_loop() {
    move_enabled = true;
    move_loop();
    save_persistent_state();
    game_log("▶️ Move loop started");
}

function stop_move_loop() {
    move_enabled = false;
    clearTimeout(move_timer_id);
    save_persistent_state();
    game_log("⏹ Move loop stopped");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// 3) PERSISTENT STATE HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

function save_persistent_state() {
    try {
        set("ranger_attack_enabled", attack_enabled);
        set("ranger_move_enabled",   move_enabled);
    } catch (e) {
        console.error("Error saving persistent state:", e);
    }
}

function init_persistent_state() {
    try {
        const atk = get("ranger_attack_enabled");
        if (atk !== undefined) attack_enabled = atk;

        const mv = get("ranger_move_enabled");
        if (mv !== undefined) move_enabled = mv;

        // Reflect loaded flags in the loop state
        if (attack_enabled) start_attack_loop();
        else               stop_attack_loop();

        if (move_enabled)  start_move_loop();
        else               stop_move_loop();
    } catch (e) {
        console.error("Error loading persistent state:", e);
    }
}

// Save state on script unload
window.addEventListener("beforeunload", save_persistent_state);

// --------------------------------------------------------------------------------------------------------------------------------- //
// 4) PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

init_persistent_state();

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
    if (!attack_enabled) return;
    let ATTACK_TARGETED = false; // Toggle: true = only attack monsters with a target
    const RANGE_THRESHOLD = character.range;

    let delay = 50;
    const X = character.x, Y = character.y;

    await boss_handler();

    const monsters = Object.values(parent.entities).filter(e =>
            e.type === "monster" &&
            MONSTER_TYPES.includes(e.mtype) &&
            !e.dead &&
            e.visible &&
            parent.distance(character, e) <= character.range
        );

    let filteredMonsters;
    if (ATTACK_TARGETED) {
        // Only attack monsters that already have a target
        filteredMonsters = monsters.filter(m => m && typeof m === "object" && !!m.target);
    } else {
        // Attack the closest monster (all monsters in range)
        filteredMonsters = monsters;
    }

    // Find all monsters in range
    const inRange = [];
    let cursed = null;
    for (const mob of filteredMonsters) {
        const dist = Math.hypot(mob.x - X, mob.y - Y);
        if (dist <= RANGE_THRESHOLD) {
            inRange.push(mob);
            // Find a cursed monster in range (prioritize lowest HP if multiple)
            if (mob.s && mob.s.cursed) {
                if (!cursed || mob.hp < cursed.hp) cursed = mob;
            }
        }
    }

    // Sort by HP (lowest first)
    inRange.sort((a, b) => a.hp - b.hp);
    const sorted_targets = inRange.slice(0, 5);

    try {
        if (cursed) {
            change_target(cursed);
            if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", cursed);
            if (!is_on_cooldown("supershot")) await use_skill("supershot", cursed);
        }

        if (sorted_targets.length >= 5 && character.mp >= 380) {
            await use_skill("5shot", sorted_targets.map(m => m.id));
            delay = ms_to_next_skill("attack");
        } else if (sorted_targets.length >= 2 && character.mp >= 250) {
            await use_skill("3shot", sorted_targets.map(m => m.id));
            delay = ms_to_next_skill("attack");
        } else if (sorted_targets.length >= 1) {
            await attack(sorted_targets[0]);
            delay = ms_to_next_skill("attack");
        }
    } catch (e) {
        console.error(e);
    }
    attack_timer_id = setTimeout(attack_loop, delay);
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
// BOSS HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSSES = ["mrpumpkin", "mrgreen"];

async function boss_handler() {
    // 1. Find the first alive boss from BOSSES using parent.S.BOSSNAME.live
    let boss_name = null;
    for (const name of BOSSES) {
        if (parent.S[name] && parent.S[name].live) {
            boss_name = name;
            break;
        }
    }
    if (!boss_name) return false; // No boss alive, return to attack_loop

    // Save current location before moving to boss
    const prev_location = { map: character.map, x: character.x, y: character.y };

    // 3. Equip jacko and use scare
    const jacko_slot = locate_item("jacko");
    if (jacko_slot !== -1 && character.slots.mainhand?.name !== "jacko") {
        await equip(jacko_slot);
        await delay(300);
    }
    if (can_use("scare")) await use_skill("scare");

    // 4. smart_move to the boss's location
    await smart_move(boss_name);

    // Re-equip orbg after smart_move
    const orbg_slot = locate_item("orbg");
    if (orbg_slot !== -1 && character.slots.mainhand?.name !== "orbg") {
        await equip(orbg_slot);
        await delay(300);
    }

    // 5-9. Engage boss until dead
    while (parent.S[boss_name] && parent.S[boss_name].live) {
        // Find the boss entity
        let boss = Object.values(parent.entities).find(e =>
            e.type === "monster" &&
            e.mtype === boss_name &&
            !e.dead &&
            e.visible
        );

        if (!boss) {
            await delay(100);
            continue;
        }

        // Move to maintain distance character.range - 5
        const dist = parent.distance(character, boss);
        if (dist > character.range - 5) {
            const dx = boss.x - character.x;
            const dy = boss.y - character.y;
            const d = Math.hypot(dx, dy);
            const target_x = boss.x - (dx / d) * character.range * 0.95;
            const target_y = boss.y - (dy / d) * character.range * 0.95;
            move(target_x, target_y); // Do not await!
            await delay(100);
            continue;
        }

        // 6. Target boss
        change_target(boss);

        // 7. Only attack if boss's target is not self
        if (boss.target && boss.target !== character.name) {
            // 8. Use skills as available
            if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", boss);
            if (!is_on_cooldown("supershot")) await use_skill("supershot", boss);
            if (!is_on_cooldown("attack")) await attack(boss);
        }

        await delay(50);
    }

    if (getNumChests() >= chestThreshold && character.fear < 6) {
        await loot_chests();
    }

    // Smart move back to previous location after boss is dead
    await smart_move(prev_location);

    // 9. Boss is dead, return to regular attack loop
    return true;
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

// const CHECK_INTERVAL = 500;
// const PANIC_INTERVAL = 5100;
// const PRIEST_NAME = "Myras";
// const PANIC_WEAPON = "jacko";
// const NORMAL_WEAPON = "orbg";

// async function panic_button_loop() {
//     while (true) {
//         const myras_entity = parent.entities[PRIEST_NAME];
//         const myras_online = parent.party_list.includes(PRIEST_NAME) && myras_entity;
//         const myras_alive = myras_online && !myras_entity.rip;
//         const myras_near = myras_online && parent.distance(character, myras_entity) <= 500;
//         const low_health = character.hp < (character.max_hp / 3);
//         const high_health = character.hp >= ((2 * character.max_hp) / 3);

//         // PANIC CONDITION
//         if (!myras_online || !myras_alive || !myras_near || low_health) {
//             stop_attack_loop();
//             let reason = !myras_online ? "Myras is offline!" : !myras_alive ? "Myras is dead!" : !myras_near
//                         ? "Myras is too far!" : "Low health!";
//             game_log("⚠️ Panic triggered:", reason);

//             // Ensure jacko is equipped
//             const jacko_slot = locate_item(PANIC_WEAPON);
//             if (character.slots.orb?.name !== PANIC_WEAPON && jacko_slot !== -1) {
//                 await equip(jacko_slot);
//                 await delay(500);
//             }

//             // Recast scare if possible
//             if (can_use("scare")) {
//                 await use_skill("scare");
//             }

//             // Wait 5.1 seconds before rechecking panic state
//             await delay(PANIC_INTERVAL);
//         } else {
//             // SAFE CONDITION
//             // Ensure orbg is equipped
//             const orbg_slot = locate_item(NORMAL_WEAPON);
//             if (character.slots.orb?.name !== NORMAL_WEAPON && orbg_slot !== -1) {
//                 await equip(orbg_slot);
//                 await delay(500);
//             }

//             // Ensure attack loop is running
//             if (!attack_enabled) {
//                 game_log("✅ Panic over — resuming normal operations.");
//                 start_attack_loop();
//             }

//             // Wait 500ms before rechecking
//             await delay(CHECK_INTERVAL);
//         }
//     }
// }
