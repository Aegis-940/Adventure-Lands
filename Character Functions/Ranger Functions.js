
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
    attack_enabled = true;     // always set it
    clearTimeout(attack_timer_id);
    attack_loop();             // always call it
    game_log("▶️ Attack loop started");
}

function stop_attack_loop() {
    attack_enabled = false;
    clearTimeout(attack_timer_id);
    game_log("⏹ Attack loop stopped");
    }

function start_move_loop() {
    move_enabled = true;
    move_loop();
    game_log("▶️ Move loop started");
}

function stop_move_loop() {
    move_enabled = false;
    clearTimeout(move_timer_id);
    game_log("⏹ Move loop stopped");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// 3) PERSISTENT STATE HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

// Save current loop flags using native set().
function save_persistent_state() {
    try {
        set("ranger_attack_enabled", attack_enabled);
        set("ranger_move_enabled",   move_enabled);
    } catch (e) {
        console.error("Error saving persistent state:", e);
    }
}

// Load saved flags with native get(), then start/stop loops accordingly. Call this once at script init.
function init_persistent_state() {
    try {
        const atk = get("ranger_attack_enabled");
        if (atk !== undefined) attack_enabled = atk;

        const mv = get("ranger_move_enabled");
        if (mv !== undefined) move_enabled = mv;

        // Reflect loaded flags in the loop state
        if (attack_enabled) start_attack_loop();
        else                stop_attack_loop();

        if (move_enabled)   start_move_loop();
        else                stop_move_loop();
    } catch (e) {
        console.error("Error loading persistent state:", e);
    }
}

// Hook state-saving into your start/stop functions:
const _origStartAttack = start_attack_loop;
start_attack_loop = function() {
  _origStartAttack();
  save_persistent_state();
};
const _origStopAttack = stop_attack_loop;
stop_attack_loop = function() {
  _origStopAttack();
  save_persistent_state();
};

const _origStartMove = start_move_loop;
start_move_loop = function() {
  _origStartMove();
  save_persistent_state();
};
const _origStopMove = stop_move_loop;
stop_move_loop = function() {
  _origStopMove();
  save_persistent_state();
};

// Ensure state is saved if the script unloads
window.addEventListener("beforeunload", save_persistent_state);

// --------------------------------------------------------------------------------------------------------------------------------- //
// 4) PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

init_persistent_state();

// --------------------------------------------------------------------------------------------------------------------------------- //
// SUPPORT FUNCTIONS
// --------------------------------------------------------------------------------------------------------------------------------- //

function item_quantity(name) {
    for (let i = 0; i < 42; i++) {
        if (character.items[i]?.name === name) {
            return character.items[i].q;
        }
    }
    return 0;
}

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
    const BOSSES = ["phoenix"]; // Add more boss mtypes as needed

    let delay = 50;
    const X = character.x, Y = character.y;

    // --- Boss priority logic ---
    const boss = Object.values(parent.entities).find(e =>
        e.type === "monster" &&
        BOSSES.includes(e.mtype) &&
        !e.dead &&
        e.visible
    );
    if (boss) {
        change_target(boss);
        if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", boss);
        if (!is_on_cooldown("supershot")) await use_skill("supershot", boss);
        if (!is_on_cooldown("attack")) {
            await attack(boss);
        }
        delay = ms_to_next_skill("attack");
        attack_timer_id = setTimeout(attack_loop, delay);
        return;
    }
    // --- End boss logic ---
    
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

        if (sorted_targets.length >= 2 && character.mp >= 250) {
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

/*
// --------------------------------------------------------------------------------------------------------------------------------- //
// HANDLE BOSSES
// --------------------------------------------------------------------------------------------------------------------------------- //

async function handle_bosses() {
    const boss = Object.values(parent.entities).find(e =>
        e.type === "monster" &&
        BOSSES.includes(e.mtype) &&
        !e.dead &&
        e.visible
    );

    if (boss) {
        change_target(boss);
        if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", boss);
        if (!is_on_cooldown("supershot")) await use_skill("supershot", boss);
        if (!is_on_cooldown("attack")) {
            await attack(boss);
        }
        return true; // Always return boolean
    }
    return false;
}
*/

// --------------------------------------------------------------------------------------------------------------------------------- //
// POTIONS LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let lastPotion = 0; // Track the time of the last potion usage
let lastBuy = 0; // Track the time of the last purchase

async function potions_loop() {
    const hpThreshold = character.max_hp - 400;
    const mpThreshold = character.max_mp - 500;
    const potionCooldown = 1000; // Minimum time between potion usages
    const buyCooldown = 1000; // Minimum time between purchases
    let delay = null; // Shorter delay to handle frequent checks

    try {
        const currentTime = Date.now();

        // Use MP potion if needed
        if (character.mp <= mpThreshold && !is_on_cooldown('use_mp') && item_quantity("mpot1") > 0 && currentTime - lastPotion > potionCooldown) {
            await use('use_mp');
            reduce_cooldown("use_mp", character.ping)
            lastPotion = currentTime;
        }

        // Use HP potion if needed
        if (character.hp <= hpThreshold && !is_on_cooldown('use_hp') && item_quantity("hpot1") > 0 && currentTime - lastPotion > potionCooldown) {
            await use('use_hp');
            reduce_cooldown("use_hp", character.ping)
            lastPotion = currentTime;
        }
        delay = ms_to_next_skill("use_mp");

    } catch (e) {
        console.error("Error in handle_potions function:", e);
    }

    setTimeout(potions_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// PANIC BUTTON!!!
// --------------------------------------------------------------------------------------------------------------------------------- //

let panic_triggered = false;

const CHECK_INTERVAL = 500;
const PRIEST_NAME = "Myras";
const PANIC_WEAPON = "jacko";
const NORMAL_WEAPON = "orbg";

async function panic_button_loop() {

    while (true) {
        const myras_online = parent.party_list.includes(PRIEST_NAME) && parent.entities[PRIEST_NAME];
        const low_health = character.hp < character.max_hp / 3;
        const high_health = character.hp >= 2 * character.max_hp / 3;

        if (!myras_online || low_health) {
            if (!panic_triggered) {
                // Enter panic state
                panic_triggered = true;
                attack_enabled = false;
                game_log("⚠️ Panic triggered:", !myras_online ? "Myras is offline!" : "Low health!");

                const jacko_slot = locate_item(PANIC_WEAPON);
                if (jacko_slot !== -1) {
                    await equip(jacko_slot);
                    await delay(500);
                }

                if (can_use("scare")) {
                    await use_skill("scare");
                }
            }
        } else {
            if (panic_triggered && high_health && myras_online) {
                // Exit panic state
                game_log("✅ Panic over — resuming normal operations.");
                panic_triggered = false;

                const orbg_slot = locate_item(NORMAL_WEAPON);
                if (orbg_slot !== -1) {
                    await equip(orbg_slot);
                    await delay(500);
                }

                attack_enabled = true;
                start_attack_loop?.(); // Optional chaining if defined
            }
        }

        await delay(CHECK_INTERVAL);
    }
}
