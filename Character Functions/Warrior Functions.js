
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
    let delay = 10;

    // Boss detection logic
    const boss_alive = BOSSES.some(name => parent.S[name] && parent.S[name].live);
    if (boss_alive) {
        stop_attack_loop();
        boss_loop();
        return;
    }

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
// BOSS LOOP - HALLOWEEN EDITION
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOSSES = ["mrpumpkin", "mrgreen"];
const GRIND_HOME = { map: "main", x: 866, y: -172 };

async function boss_loop() {

    let boss_active = true;
    let delay = 50;

    // Find all alive bosses and pick the one with the lowest HP (fallback: oldest spawn)
    let alive_bosses = BOSSES
        .filter(name => parent.S[name] && parent.S[name].live)
        .map(name => ({ name, live: parent.S[name].live }));

    if (alive_bosses.length === 0) {
        boss_active = false;
    } else {
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

        // Equip fireblade +7 in offhand before moving to boss
        const fireblade7_slot = parent.character.items.findIndex(item =>
            item && item.name === "fireblade" && item.level === 7
        );
        if (fireblade7_slot !== -1 && (!character.slots.offhand || character.slots.offhand.name !== "fireblade" || character.slots.offhand.level !== 7)) {
            await equip(fireblade7_slot, "offhand");
            await delay(300);
        }

        // Equip jacko before moving to boss
        const jacko_slot = locate_item("jacko");
        if (jacko_slot !== -1 && character.slots.orb?.name !== "jacko") {
            await equip(jacko_slot);
            await delay(300);
        }

        // Only smart_move if boss spawn is known
        const boss_spawn = parent.S[boss_name] && parent.S[boss_name].x !== undefined && parent.S[boss_name].y !== undefined
            ? { map: parent.S[boss_name].map, x: parent.S[boss_name].x, y: parent.S[boss_name].y }
            : null;

        if (boss_spawn) {
            let moving = true;
            smart_move(boss_spawn).then(() => { moving = false; });

            while (moving && boss_active) {
                // Recalculate distances
                const boss_entity = Object.values(parent.entities).find(e =>
                    e.type === "monster" && e.mtype === boss_name && !e.dead
                );
                const dist_to_boss = boss_entity ? parent.distance(character, boss_entity) : Infinity;
                const dist_to_spawn = Math.hypot(character.x - boss_spawn.x, character.y - boss_spawn.y);

                // Stop smart moving if within 400 of spawn or within 200 of boss
                if (dist_to_spawn <= 400 || dist_to_boss <= 200) {
                    if (character.moving) {
                        stop();
                        while (character.moving) {
                            await delay(20);
                        }
                    }
                    moving = false;
                    break;
                }

                // Scan for aggro and cast scare if needed
                const aggro = Object.values(parent.entities).some(e =>
                    e.type === "monster" && e.target === character.name && !e.dead
                );
                if (aggro && can_use("scare")) {
                    await use_skill("scare");
                }

                // If boss dies while moving, break out
                if (!(parent.S[boss_name] && parent.S[boss_name].live)) {
                    boss_active = false;
                    break;
                }

                await delay(100);
            }
        }

        // Engage boss until dead
        while (boss_active && parent.S[boss_name] && parent.S[boss_name].live) {

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

                if (boss.target !== character.name) {
                    if (!is_on_cooldown("attack")) {
                        await attack(boss);
                        delay = ms_to_next_skill("attack");
                    }
                }
            } catch (e) {
                console.error(e);
            }
            
            if (typeof delay !== "number" || isNaN(delay) || delay < 0) {
                game_log("Invalid delay value:", delay, "— defaulting to 10ms");
                delay = 10;
            }
            try {
                await delay(delay);
            } catch (e) {
                game_log("delay() failed, falling back to setTimeout:", e);
                await new Promise(resolve => setTimeout(resolve, typeof delay === "number" && delay > 0 ? delay : 10));
            }
            game_log("Check 4");
        }

        // Move back to grind home, using scare if targeted during movement
        let moving_home = true;
        smart_move(GRIND_HOME).then(() => { moving_home = false; });
        while (moving_home) {
            const aggro = Object.values(parent.entities).some(e =>
                e.type === "monster" && e.target === character.name && !e.dead
            );
            if (aggro && can_use("scare")) {
                await use_skill("scare");
            }
            // If boss respawns while returning, break and restart boss loop
            if (BOSSES.some(name => parent.S[name] && parent.S[name].live)) {
                boss_active = false;
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
    }

    // Restart attack loop after boss loop finishes
    start_attack_loop();
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

            // Exclude cleave if current target is a boss
            const current_target = get_target();
            const is_boss_target = current_target && BOSSES.includes(current_target.mtype);

            // Only check cleave if it's off cooldown and not targeting a boss
            if (!cleave_cooldown && mp_check && code_cost_check && !is_boss_target) {
                await handle_cleave(Mainhand);
            }
        }
    } catch (e) {
        //console.error("Error in skillLoop:", e);
    }
    setTimeout(skill_loop, delay);
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
        if (hpMissing >= character.max_hp - (character.max_hp / 2)) {
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
// MAINTAIN POSITION
// --------------------------------------------------------------------------------------------------------------------------------- //

let radius_lock_enabled = false;
let radius_lock_origin = null;
let radius_lock_loop = null;
let radius_lock_circle_id = "radius_lock_visual";

function toggle_radius_lock(radius = 200, check_interval = 500) {
	if (radius_lock_enabled) {
		// Disable
		radius_lock_enabled = false;
		radius_lock_origin = null;
		clear_drawings(radius_lock_circle_id);
		if (radius_lock_loop) clearInterval(radius_lock_loop);
		game_log("🔓 Radius lock disabled.");
	} else {
		// Enable
		radius_lock_enabled = true;
		radius_lock_origin = {
			x: Math.round(character.x),
			y: Math.round(character.y)
		};
		game_log(`🔒 Radius lock enabled. Origin set to (${radius_lock_origin.x}, ${radius_lock_origin.y})`);

		// Draw circle (circumference only)
		clear_drawings(radius_lock_circle_id);
		draw_circle(
			radius_lock_origin.x,
			radius_lock_origin.y,
			radius,
			1,
			0x00FFFF,
			radius_lock_circle_id
		);

		// Start loop
		radius_lock_loop = setInterval(async () => {
			if (!radius_lock_enabled) return;

			const dx = character.x - radius_lock_origin.x;
			const dy = character.y - radius_lock_origin.y;
			const dist = Math.hypot(dx, dy);

			if (dist > radius) {
				game_log(`🚨 Out of bounds (${Math.round(dist)} units)! Returning halfway...`);

				parent.stop();

				const mid_x = character.x - dx / 2;
				const mid_y = character.y - dy / 2;

				try {
					await move(mid_x, mid_y);
				} catch (e) {
					game_log("⚠️ Move failed:", e);
				}
			}
		}, check_interval);
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
    if (!mainhand || mainhand.name !== "bataxe" || mainhand.level !== 5) {
        batch_equip([
            { itemName: "bataxe", slot: "mainhand", level: 5 }
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

        if (monsters.length > 3) {
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
// PANIC BUTTON!!!
// --------------------------------------------------------------------------------------------------------------------------------- //

const CHECK_INTERVAL = 500;
const PANIC_INTERVAL = 5100;
const PRIEST_NAME = "Myras";
const PANIC_WEAPON = "jacko";
const NORMAL_WEAPON = "orbg";

async function panic_button_loop() {
    while (true) {
        const myras_entity = parent.entities[PRIEST_NAME];
        const myras_online = parent.party_list.includes(PRIEST_NAME) && myras_entity;
        const myras_alive = myras_online && !myras_entity.rip;
        const myras_near = myras_online && parent.distance(character, myras_entity) <= 500;
        const low_health = character.hp < (character.max_hp / 3);
        const high_health = character.hp >= ((2 * character.max_hp) / 3);

        // PANIC CONDITION
        if (!myras_online || !myras_alive || !myras_near || low_health) {
            stop_attack_loop();
            let reason = !myras_online ? "Myras is offline!" : !myras_alive ? "Myras is dead!" : !myras_near
                        ? "Myras is too far!" : "Low health!";
            game_log("⚠️ Panic triggered:", reason);

            // Ensure jacko is equipped
            const jacko_slot = locate_item(PANIC_WEAPON);
            if (character.slots.orb?.name !== PANIC_WEAPON && jacko_slot !== -1) {
                await equip(jacko_slot);
                await delay(500);
            }

            // Recast scare if possible
            if (can_use("scare")) {
                await use_skill("scare");
            }

            // Wait 5.1 seconds before rechecking panic state
            await delay(PANIC_INTERVAL);
        } else {
            // SAFE CONDITION
            // Ensure orbg is equipped
            const orbg_slot = locate_item(NORMAL_WEAPON);
            if (character.slots.orb?.name !== NORMAL_WEAPON && orbg_slot !== -1) {
                await equip(orbg_slot);
                await delay(500);
            }

            // Ensure attack loop is running
            if (!attack_enabled) {
                game_log("✅ Panic over — resuming normal operations.");
                start_attack_loop();
            }

            // Wait 500ms before rechecking
            await delay(CHECK_INTERVAL);
        }
    }
}

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
// 2) START/STOP HELPERS (with persistent state saving)
// --------------------------------------------------------------------------------------------------------------------------------- //

function start_attack_loop() {
    attack_enabled = true;
    clearTimeout(attack_timer_id); // Ensure no duplicate timers
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

function start_skill_loop() {
    skills_enabled = true;
    skill_loop();
    save_persistent_state();
    game_log("▶️ Skill loop started");
}

function stop_skill_loop() {
    skills_enabled = false;
    clearTimeout(skill_timer_id);
    save_persistent_state();
    game_log("⏹ Skill loop stopped");
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// 3) PERSISTENT STATE HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

function save_persistent_state() {
    try {
        set("warrior_attack_enabled", attack_enabled);
        set("warrior_move_enabled",  move_enabled);
        set("warrior_skill_enabled", skills_enabled);
    } catch (e) {
        console.error("Error saving persistent state:", e);
    }
}

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
        else               stop_attack_loop();

        if (move_enabled)   start_move_loop();
        else               stop_move_loop();

        if (skills_enabled) start_skill_loop();
        else               stop_skill_loop();
    } catch (e) {
        console.error("Error loading persistent state:", e);
    }
}

// Save state on script unload
window.addEventListener("beforeunload", save_persistent_state);

// --------------------------------------------------------------------------------------------------------------------------------- //
// 4) PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

// init_persistent_state();