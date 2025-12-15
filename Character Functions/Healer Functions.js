
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL TOGGLES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const TARGET_LOWEST_HP = false;         // true: lowest HP, false: highest HP
const PRIORITIZE_UNTARGETED = true;     // true: prefer monsters with no target first

const POTION_HP_THRESHOLD = 700;        // Use potion if missing this much HP
const POTION_MP_THRESHOLD = 400;        // Use potion if missing this much MP

const ORBIT_RADIUS = 27;                // Combat Orbit radius
const ORBIT_STEPS = 12;                 // Number of steps in orbit (e.g., 12 = 30 degrees per step)

const PANIC_HP_THRESHOLD = 0.40;        // Panic if below 40% HP
const PANIC_MP_THRESHOLD = 100;         // Panic if below 100 MP
const SAFE_HP_THRESHOLD = 0.70;         // Resume normal if above 70% HP
const SAFE_MP_THRESHOLD = 500;          // Resume normal if above 500 MP
const PANIC_AGGRO_THRESHOLD = 99;       // Panic if this many monsters are targeting you

const TARGET_LIMIT = 99;                // Max number of monsters allowed to target you before stopping attacks
const HEAL_THRESHOLD = 1.5;             // Overheal factor to compensate for resistance. (max_hp - heal/threshold)
const ATTACK_MP_THRESHOLD = 3000;       // Minimum MP required to perform attacks (throttles aggro)

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
            if (should_heal && HEAL_LOOP_ENABLED) {
                try {
                    heal(heal_target);
                } catch (e) {
                    catcher(e, "Heal loop error");
                }
                delayMs = ms_to_next_skill("attack") + character.ping + 50;
                await delay(delayMs);
                continue;
            }

            // --- Attacking logic ---
            else if (ATTACK_LOOP_ENABLED) {
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
                        attack(target);
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
// BOSS LOOP
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
        if (!BOSS_LOOP_ENABLED) {
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
        if (!MOVE_LOOP_ENABLED) {
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
        if (!SKILL_LOOP_ENABLED) {
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

const CURSE_WHITELIST = ["mrpumpkin", "mrgreen", "phoenix", "dryad"];
const ABSORB_BLACKLIST = ["mrpumpkin", "mrgreen"];

async function handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps, zapperMobs) {
    if (dead || !disabled) return;

    if (!smart.moving)
        safe_call(() => handle_cursing(X, Y, CURSE_WHITELIST), "handle_cursing");
    if (!smart.moving)
        safe_call(() => handle_absorb(mapsToExclude, eventMobs, eventMaps, ABSORB_BLACKLIST), "handle_absorb");
    if (PRIEST_SKILL_TOGGLES.party_heal)
        safe_call(() => handle_party_heal(), "handle_party_heal");
    if (!smart.moving)
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
        if (!is_on_cooldown("curse") && character.mp > 2000) {
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

let last_party_heal_time = 0;
async function handle_party_heal(minMissingHpMap = {}, minMp = 2000) {
    if (character.mp <= minMp) return;
    if (is_on_cooldown("partyheal")) return;

    // Default thresholds for each character
    const defaultThresholds = {
        Myras: character.heal + 800,
        Ulric: character.heal + 1000,
        Riva: character.heal + 1500,
        Riff: character.heal + 500
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
            const now = Date.now();
            if (now - last_party_heal_time < 500) return; // Only block if about to actually cast
            try {
                await use_skill("partyheal");
                last_party_heal_time = Date.now();
                log(`Party Heal - ${name}`, "#00ffff", "Alerts");
            } catch (e) {
                if (e?.reason !== "cooldown") throw e;
            }
            break;
        }
    }
}


let last_dark_blessing_time = 0;
async function handle_dark_blessing() {
    const now = Date.now();
    if (now - last_dark_blessing_time < 5000) return;
    if (is_on_cooldown("darkblessing")) return;
    if (can_use("darkblessing")) {
        try {
            await use_skill("darkblessing");
            last_dark_blessing_time = Date.now();
            log("Dark Blessing!!!", "#9059f5ff", "Alerts");
        } catch (e) {
            catcher(e, "handle_dark_blessing");
        }
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
        await delay(30); // Small delay to avoid server spam
    }
    last_loot_time = Date.now();
    tryLoot = true;
}

async function loot_loop() {
    let delayMs = 100;

        while (true) {
            // Check if loot loop is enabled
            if (!LOOT_LOOP_ENABLED) {
                await delay(delayMs);
                continue;
            }
            const now = Date.now();

            // If enough time has passed since last loot, and enough chests are present, and not feared
            if ((last_loot_time ?? 0) + 500 < now) {
                if (getNumChests() >= chestThreshold && character.fear < 6) {
                    batch_equip([{ itemName: "handofmidas", slot: "gloves", level: 4 }]);
                    shift(5, 'goldbooster');
                    await delay(75);
                    await loot_chests();
                    batch_equip([{ itemName: "mittens", slot: "gloves", level: 6 }]);
                    shift(5, 'luckbooster');
                    await delay(75);

                    // Check if gloves are "mittens", if not, try to equip again
                    if (!character.slots.gloves || character.slots.gloves.name !== "mittens") {
                        batch_equip([{ itemName: "mittens", slot: "gloves", level: 6 }]);
                    }
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
        if (!POTION_LOOP_ENABLED) {
            await delay(200);
            continue;
        }

        try {
            // Only use MP potions
            const MP_MISSING = character.max_mp - character.mp;
            if (MP_MISSING >= POTION_MP_THRESHOLD && can_use("mp")) {
                use("mp");
                await delay(Math.max(ms_to_next_skill("use_mp"), 50));
            } else {
                await delay(50);
            }
        } catch (e) {
            catcher(e, "potion_loop");
            await delay(500);
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