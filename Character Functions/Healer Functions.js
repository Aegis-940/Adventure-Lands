
// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL LOOP SWITCHES AND VARIABLES
// --------------------------------------------------------------------------------------------------------------------------------- //

const LOOP_STATES = {

    attack: false,
    heal: false,
    move: false,
    skill: false,
    panic: false,
    orbit: false,
    boss: false,
    potion: false,

}

// Define default location for monster farming
const TARGET_LOC = MONSTER_LOCS.spider;

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

function start_heal_loop() {
    if (LOOP_STATES.heal) return;
    LOOP_STATES.heal = true;
    heal_loop();
    game_log("▶️ Heal loop started");
}

function stop_heal_loop() {
    if (!LOOP_STATES.heal) return;
    LOOP_STATES.heal = false;
    game_log("⏹ Heal loop stopped");
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

function ms_to_next_skill(skill) {
	const next_skill = parent.next_skill[skill]
	if (next_skill == undefined) return 0
	const ms = parent.next_skill[skill].getTime() - Date.now() - Math.min(...parent.pings) - character.ping;
	return ms < 0 ? 0 : ms;
}

function get_nearest_monster_v2(args = {}) {
	let min_d = 999999, target = null;
	let optimal_hp = args.check_max_hp ? 0 : 999999999;

	for (let id in parent.entities) {
		let current = parent.entities[id];
		if (current.type != "monster" || !current.visible || current.dead) continue;

		if (args.type) {
			if (Array.isArray(args.type)) {
				if (!args.type.includes(current.mtype)) continue;
			} else {
				if (current.mtype !== args.type) continue;
			}
		}

		if (args.min_level !== undefined && current.level < args.min_level) continue;
		if (args.max_level !== undefined && current.level > args.max_level) continue;
		if (args.target && !args.target.includes(current.target)) continue;
		if (args.no_target && current.target) continue;

		if (args.statusEffects && !args.statusEffects.every(effect => current.s[effect])) continue;

		if (args.min_xp !== undefined && current.xp < args.min_xp) continue;
		if (args.max_xp !== undefined && current.xp > args.max_xp) continue;

		if (args.max_att !== undefined && current.attack > args.max_att) continue;

		if (args.path_check && !can_move_to(current)) continue;

		let c_dist = args.point_for_distance_check
			? Math.hypot(args.point_for_distance_check[0] - current.x, args.point_for_distance_check[1] - current.y)
			: parent.distance(character, current);

		if (args.max_distance !== undefined && c_dist > args.max_distance) continue;

		if (args.check_min_hp || args.check_max_hp) {
			let c_hp = current.hp;
			if ((args.check_min_hp && c_hp < optimal_hp) || (args.check_max_hp && c_hp > optimal_hp)) {
				optimal_hp = c_hp;
				target = current;
			}
			continue;
		}
		
		if (c_dist < min_d) {
			min_d = c_dist;
			target = current;
		}
	}
	return target;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HEALING LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let just_healed = false;

async function heal_loop() {

    LOOP_STATES.heal = true;

    let delayMs = 50;

    try {
        while (LOOP_STATES.heal) {

            // 1. Find the lowest health party member
            const target = lowest_health_partymember();

            // 2. If a target is found and needs healing, cast the heal spell
            if (target && target.hp < target.max_hp - (character.heal / 1.1) && is_in_range(target)) {
                game_log(`💖 Healing ${target.name}`, "#00FF00");
                await heal(target);
                just_healed = true;
                delayMs = ms_to_next_skill('attack') + character.ping + 20;
                await delay(delayMs);
                continue;
            } else {
                just_healed = false
            }

            await delay(50);
        }
    } catch (e) {
        game_log("⚠️ Heal Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.heal = false;
        game_log("Heal loop ended unexpectedly", "#ffea00ff");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

// Toggle options
let ATTACK_TARGET_LOWEST_HP = true;      // true: lowest HP, false: highest HP
let ATTACK_PRIORITIZE_UNTARGETED = true; // true: prefer monsters with no target first

async function attack_loop() {

    LOOP_STATES.attack = true;

    let delayMs = 50;

    try {
        while (LOOP_STATES.attack) {
            if (!just_healed) {

                // --- Attacking ---
                // Filter all relevant monsters ONCE
                const monsters = Object.values(parent.entities).filter(e =>
                    e.type === "monster" &&
                    MONSTER_TYPES.includes(e.mtype) &&
                    !e.dead &&
                    e.visible &&
                    parent.distance(character, e) <= character.range
                );

                let target = null;

                if (monsters.length) {
                    let untargeted = monsters.filter(m => !m.target);
                    let candidates = (ATTACK_PRIORITIZE_UNTARGETED && untargeted.length) ? untargeted : monsters;

                    if (ATTACK_TARGET_LOWEST_HP) {
                        target = candidates.reduce((a, b) => (a.hp < b.hp ? a : b));
                    } else {
                        target = candidates.reduce((a, b) => (a.hp > b.hp ? a : b));
                    }
                }

                if (target && is_in_range(target) && !smart.moving) {
                    await attack(target);
                    delayMs = ms_to_next_skill('attack') + character.ping + 20;
                    await delay(delayMs);
                    continue;
                }
                await delay(50);
            } else {
                await delay(50);
            }
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
            await equip(jacko_slot);
            await delay(300);
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
                    await use_skill("scare");
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

                // Always heal, regardless of attack_enabled
                let heal_target = lowest_health_partymember();
                if (
                    heal_target &&
                    heal_target.hp < heal_target.max_hp - (character.heal / 1.11) &&
                    is_in_range(heal_target)
                ) {
                    await heal(heal_target);
                    delayMs = ms_to_next_skill('attack');
                }

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

async function skill_loop() {

    LOOP_STATES.skill = true;

    let delayMs = 100;

    try {
        while (LOOP_STATES.skill) {
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
    } catch (e) {
        game_log("⚠️ Skill Loop error:", "#FF0000");
        game_log(e);
    } finally {
        LOOP_STATES.skill = false;
        game_log("Skill loop ended unexpectedly", "#ffea00ff");
    }
}

async function safe_call(fn, name) {
	try {
		await fn();
	} catch (e) {
		console.error(`Error in ${name}:`, e);
	}
}

const CURSE_WHITELIST = ["mrpumpkin", "mrgreen", "phoenix"];
const ABSORB_BLACKLIST = ["mrpumpkin", "mrgreen"];

async function handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps, zapperMobs) {
    if (dead || !disabled) return;

    if (PRIEST_SKILL_TOGGLES.curse)
        safe_call(() => handle_cursing(X, Y, CURSE_WHITELIST), "handle_cursing");
    if (PRIEST_SKILL_TOGGLES.absorb)
        safe_call(() => handle_absorb(mapsToExclude, eventMobs, eventMaps, ABSORB_BLACKLIST), "handle_absorb");
    if (PRIEST_SKILL_TOGGLES.party_heal)
        safe_call(() => handle_party_heal(), "handle_party_heal");
    if (PRIEST_SKILL_TOGGLES.dark_blessing)
        safe_call(() => handle_dark_blessing(), "handle_dark_blessing");
    if (PRIEST_SKILL_TOGGLES.zap_spam)
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
        Riff: 1500
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
                // // Cast partyheal rather than use HP Pot
                // if (HP_MISSING >= 400) {
                //     if (can_use("hp")) {
                //         use("hp");
                //         used_potion = true;
                //     }
                // }

                // Use mana potion if needed
                if (MP_MISSING >= 500) {
                    if (can_use("mp")) {
                        use("mp");
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

    let delayMs = 100

    try {
        while (LOOP_STATES.panic) {
            const low_health = character.hp < (character.max_hp / 3);
            const low_mana = character.mp < 50;
            const high_health = character.hp >= ((2 * character.max_hp) / 3);
            const high_mana = character.mp >= 500;

            // PANIC CONDITION
            if (low_health || low_mana) {
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
            if (high_health && high_mana) {
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
// 3) PERSISTENT STATE HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

// function save_persistent_state() {
//     try {
//         set("healer_attack_enabled", attack_enabled);
//         set("healer_move_enabled", move_enabled);
//         set("circle_move_enabled", circle_move_enabled);
//         set("circle_path_points", JSON.stringify(circle_path_points));
//         for (const key in PRIEST_SKILL_TOGGLES) {
//             set(`priest_skill_${key}`, PRIEST_SKILL_TOGGLES[key]);
//         }
//     } catch (e) {
//         console.error("Error saving persistent state:", e);
//     }
// }

// function init_persistent_state() {
//     try {
//         // Load attack and move loop flags
//         const atk = get("healer_attack_enabled");
//         if (atk !== undefined) attack_enabled = atk;

//         const mv = get("healer_move_enabled");
//         if (mv !== undefined) move_enabled = mv;

//         // Load circle move state
//         const circle_enabled = get("circle_move_enabled");
//         if (circle_enabled !== undefined) circle_move_enabled = circle_enabled;

//         const saved_points = get("circle_path_points");
//         if (saved_points) {
//             try {
//                 circle_path_points = JSON.parse(saved_points);
//             } catch (e) {
//                 circle_path_points = [];
//             }
//         }

//         // Load skill toggles
//         for (const key in PRIEST_SKILL_TOGGLES) {
//             const val = get(`priest_skill_${key}`);
//             if (val !== undefined) PRIEST_SKILL_TOGGLES[key] = val;
//         }

//         // Start/stop loops based on restored state
//         if (attack_enabled) start_attack_loop();
//         else               stop_attack_loop();

//         if (move_enabled)  start_move_loop();
//         else               stop_move_loop();

//         // Start circle move loop if enabled and points exist
//         if (circle_move_enabled && circle_path_points.length > 0) {
//             circle_move_loop();
//             game_log("🔵 Circle move loop resumed from persistent state");
//         }
//     } catch (e) {
//         console.error("Error loading persistent state:", e);
//     }
// }

// // Save state on script unload
// window.addEventListener("beforeunload", save_persistent_state);

// --------------------------------------------------------------------------------------------------------------------------------- //
// 4) PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

// init_persistent_state();
