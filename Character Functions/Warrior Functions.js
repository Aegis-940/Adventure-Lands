
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL SWITCHES & TIMERS
// --------------------------------------------------------------------------------------------------------------------------------- //

let attack_enabled   = true;
let attack_timer_id  = null;
let move_enabled     = true;
let move_timer_id    = null;
let skills_enabled   = true;
let skill_timer_id   = null;

// --------------------------------------------------------------------------------------------------------------------------------- //
// 2) START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

function start_attack_loop() {
  attack_enabled = true;     // always set it
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

function start_skill_loop() {
    skills_enabled = true;
    skill_loop();
    game_log("▶️ Skill loop started");
}

function stop_skill_loop() {
  skills_enabled = false;
  clearTimeout(skill_timer_id);
  game_log("⏹ Skill loop stopped");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// 3) PERSISTENT STATE HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

// Save current loop flags using native set().
function save_persistent_state() {
  try {
    set("warrior_attack_enabled", attack_enabled);
    set("warrior_move_enabled",  move_enabled);
    set("warrior_skill_enabled",  skills_enabled);
  } catch (e) {
    console.error("Error saving persistent state:", e);
  }
}

// Load saved flags with native get(), then start/stop loops accordingly. Call this once at script init.
function init_persistent_state() {
  try {
    const atk = get("warrior_attack_enabled");
    if (atk !== undefined) attack_enabled = atk;

    const mv = get("warrior_move_enabled");
    if (mv !== undefined) move_enabled = mv;

    const sk = get("warrior_skill_enabled");
    if (sk !== undefined) skills_enabled = sk;

    // Reflect loaded flags in the loop state
    if (attack_enabled) start_attack_loop();
    else                stop_attack_loop();

    if (move_enabled)   start_move_loop();
    else                stop_move_loop();

    if (skills_enabled) start_skill_loop();
    else                stop_skill_loop();
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

const _origStartSkill = start_skill_loop;
start_skill_loop = function() {
  _origStartSkill();
  save_persistent_state();
};
const _origStopSkill = stop_skill_loop;
stop_skill_loop = function() {
  _origStopSkill();
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

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill]
	if (next_skill == undefined) return 0
	const ms = parent.next_skill[skill].getTime() - Date.now() - Math.min(...parent.pings) - character.ping;
	return ms < 0 ? 0 : ms;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function attack_loop() {
    if (!attack_enabled) return;
    let delay = 10;
    try {

        // 1. Filter all relevant monsters ONCE
        const monsters = Object.values(parent.entities).filter(e =>
            e.type === "monster" &&
            MONSTER_TYPES.includes(e.mtype) &&
            !e.dead &&
            e.visible &&
            parent.distance(character, e) <= character.range
        );

        // 2. Prioritize cursed monsters if any
        let target = monsters.find(m => m.s && m.s.cursed);

        // 3. Otherwise, pick the lowest HP monster in range
        if (!target && monsters.length) {
            target = monsters.reduce((a, b) => (a.hp < b.hp ? a : b));
        }
        
        if (target) {
            await attack(target);
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
    const delay = 200;
    try {
        // Filter all relevant monsters ONCE
        const monsters = Object.values(parent.entities).filter(e =>
            e.type === "monster" &&
            MONSTER_TYPES.includes(e.mtype) &&
            !e.dead &&
            e.visible
        );

        // Find the closest monster
        let closest = null;
        let minDist = Infinity;
        for (const mon of monsters) {
            const d = parent.distance(character, mon);
            if (d < minDist) {
                minDist = d;
                closest = mon;
            }
        }

        // If there is one and we're out of range, walk straight at it
        if (
            closest &&
            minDist > character.range * 0.9 &&
            !character.moving
        ) {
            await move(closest.real_x, closest.real_y);
        }
    } catch (err) {
        console.error("move_loop error:", err);
    } finally {
        move_timer_id = setTimeout(move_loop, delay);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let eTime = 0;

const st_maps = [];
const aoe_maps = ["mansion", "main", "cave", "level2s"];

async function skill_loop() {
    if (!skills_enabled) return;
    let delay = 50; // Start with a higher delay

    try {
        if (!character.rip) {
            const Mainhand = character.slots?.mainhand?.name;
            const mp_check = character.mp >= 760;
            const code_cost_check = character.cc < 135;
            let cleave_cooldown = is_on_cooldown("cleave");

            // Only check cleave if it's off cooldown
            if (!cleave_cooldown && mp_check && code_cost_check) {
                tempCC0 = character.cc;
                await game_log("Check 1: " + tempCC0);
                await handle_cleave(Mainhand);
                tempCC3 = character.cc;
                await game_log("Check 2: " + tempCC3);
            }
        }
    } catch (e) {
        //console.error("Error in skillLoop:", e);
    }
    setTimeout(skill_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

let weapon_set_equipped = "";

async function cleave_set() {
    unequip("offhand");
    batch_equip([
        { itemName: "bataxe", slot: "mainhand", level: 5},
    ]);
    weapon_set_equipped = "cleave";
}

async function single_set() {
    batch_equip([
        { itemName: "fireblade", slot: "mainhand", level: 7, l: "l" },
        { itemName: "ololipop", slot: "offhand", level: 5, l: "l" }
    ]);
    weapon_set_equipped = "single";
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HANDLE SKILLS
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_cleave_time = 0;
const CLEAVE_THRESHOLD = 500;
const CLEAVE_RANGE = G.skills.cleave.range;
const MAPS_TO_INCLUDE = ["mansion", "main"];

/*async function handle_cleave(Mainhand) {
    const now = performance.now();
    const time_since_last = now - last_cleave_time;

    // Only proceed if all other conditions are met
    if (
        !smart.moving &&
        time_since_last >= CLEAVE_THRESHOLD //&&
        //ms_to_next_skill("attack") > 75
    ) {
        // Only now filter monsters
        const monsters = Object.values(parent.entities).filter(e =>
            e?.type === "monster" &&
            !e.dead &&
            e.visible &&
            distance(character, e) <= CLEAVE_RANGE
        );

        if (monsters.length > 4) {
            if (Mainhand !== "bataxe") await cleave_set();
            await use_skill("cleave");
            reduce_cooldown("cleave", character.ping * 0.95);
            last_cleave_time = now;
            // Swap back instantly (don't delay this)
            if (weapon_set_equipped !== "single") {
                await single_set();
            }
        }
    }
}*/

async function handle_cleave(Mainhand) {
    const now = performance.now();
    const time_since_last = now - last_cleave_time;

    if (
        !smart.moving &&
        time_since_last >= CLEAVE_THRESHOLD &&
        !is_on_cooldown("cleave") &&
        character.mp >= G.skills.cleave.mp
    ) {
        const monsters = Object.values(parent.entities).filter(e =>
            e?.type === "monster" &&
            !e.dead &&
            e.visible &&
            distance(character, e) <= CLEAVE_RANGE
        );

        if (monsters.length > 4) {
            if (Mainhand !== "bataxe") await cleave_set();

            // Try to use cleave and check the result
            let result;
            try {
                result = await use_skill("cleave");
            } catch (e) {
                game_log("Cleave failed: " + e.reason || e);
                return; // Don't proceed if cleave failed
            }

            if (result && !result.failed) {
                reduce_cooldown("cleave", character.ping * 0.95);
                last_cleave_time = now;
                // Swap back instantly (don't delay this)
                if (weapon_set_equipped !== "single") {
                    await single_set();
                }
            } else {
                game_log("Cleave did not trigger: " + (result && result.reason ? result.reason : "unknown reason"));
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

let tempCC0 = 0;
let tempCC1 = 0;
let tempCC2 = 0;
let tempCC3 = 0;

async function batch_equip(data) {

    tempCC1 = character.cc;
    game_log("Check 3: " + tempCC1);

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

    if (!batch.length) return handleEquipBatchError("No items to equip.");

    tempCC2 = character.cc;
    game_log("Check 4: " + tempCC2);

    // Use the game's native equip_batch
    return equip_batch(batch);
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
