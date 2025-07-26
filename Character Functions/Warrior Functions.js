
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
    game_log("Check 1");
    let delay = null;
    try {
        let target = null;
	    game_log("Check 2")

        // Single loop, prioritized targeting
        for (const name of MONSTER_TYPES) {
            target = get_nearest_monster_v2({
                target: name,
                check_max_hp: true,
                max_distance: character.range,
                statusEffects: ["cursed"],
            });
            if (target) break;
		game_log("Check 3")

            // If no cursed target nearby, check wider range
            target = get_nearest_monster_v2({
		    game_log("Check 4")
                target: name,
                check_max_hp: true,
                max_distance: character.range,
            });
            if (target) break;
        }

        if (target) {
		
            await attack(target);
			reduce_cooldown("attack", character.ping * 0.95);
            delay = ms_to_next_skill("attack");
        }
    } catch (e) {
        // optional error logging
    }
    setTimeout(attack_loop, delay ?? 50); // Retry sooner if no attack
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let lastTarPosition = null; // Store the last known position of the monster

async function move_loop() {
    let delay = 50;
    try {
        let tar = get_nearest_monster_v2({ type: home });
        const event_maps = ["desertland"];
        if (event_maps.includes(character.map)) {
            if (tar) {
                // Get the monster's current position and velocity
                let targetX = tar.real_x;
                let targetY = tar.real_y;

                // Check if the monster is moving
                let directionX = 0;
                let directionY = 0;

                if (tar.vx !== 0 || tar.vy !== 0) {
                    // Calculate the direction vector based on the monster's current velocity
                    directionX = tar.going_x - targetX;
                    directionY = tar.going_y - targetY;

                    // Normalize the direction vector
                    let magnitude = Math.sqrt(directionX ** 2 + directionY ** 2);
                    if (magnitude > 0) {
                        directionX /= magnitude;
                        directionY /= magnitude;
                    }

                    // Update last known position
                    lastTarPosition = { x: targetX, y: targetY };
                } else if (lastTarPosition) {
                    // If the monster is not moving, use the last known position
                    targetX = lastTarPosition.x;
                    targetY = lastTarPosition.y;

                    // Use a dummy direction based on the last position to avoid standing on it
                    directionX = tar.going_x - targetX;
                    directionY = tar.going_y - targetY;

                    // Normalize the direction vector
                    let magnitude = Math.sqrt(directionX ** 2 + directionY ** 2);
                    if (magnitude > 0) {
                        directionX /= magnitude;
                        directionY /= magnitude;
                    }
                }

                // Calculate the position 40 units behind the monster
                const behindX = targetX - directionX * 50;
                const behindY = targetY - directionY * 50;

                // Move to the calculated position
                if (can_move_to(behindX, behindY)) {
                    smart.moving = false;
                    smart.searching = false;
                    await move(behindX, behindY);
                } else {
                    if (!smart.moving) {
                        smart_move({
                            x: behindX,
                            y: behindY
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
    setTimeout(move_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
    let delay = 10;
    try {
        let zap = false;
        const dead = character.rip;
        const Mainhand = character.slots?.mainhand?.name;
        const offhand = character.slots?.offhand?.name;
        const aoe = character.mp >= character.mp_cost * 2 + G.skills.cleave.mp + 320;
        const cc = character.cc < 135;
        const zapper_mobs = ["plantoid"];
        const st_maps = ["", "winter_cove", "arena", "",];
        const aoe_maps = ["mansion"];
        let tank = get_entity("Ulric");

        if (character.ctype === "warrior") {
            try {
                if (tank && tank.hp < tank.max_hp * 0.4 && character.name === "REPLACE_WITH_ULRIC_IF_NEEDED") {
                    //console.log("Calling handleStomp");
                    handle_stomp(Mainhand, st_maps, aoe_maps, tank);
                }
                if (character.ctype === "warrior") {
                    //console.log("Calling handleCleave");
                    handle_cleave(Mainhand, aoe, cc, st_maps, aoe_maps, tank);
                    //console.log("Calling handleWarriorSkills");
                    handle_warrior_skills(tank);
                }
            } catch (e) {
                //console.error("Error in warrior section:", e);
            }
        }

    } catch (e) {
        //console.error("Error in skillLoop:", e);
    }
    setTimeout(skill_loop, delay);
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HANDLE SKILLS
// --------------------------------------------------------------------------------------------------------------------------------- //

function handle_weapon_swap(stMaps, aoeMaps) {
    const now = performance.now();
    if (now - eTime <= 50) return;

    if (stMaps.includes(character.map)) {
        //equipSet("single");
        //eTime = now;
    } else if (aoe_maps.includes(character.map)) {
        //equipSet("aoe");
        //eTime = now;
    }
}

let last_cleave_time = 0;
const CLEAVE_THRESHOLD = 500;
const CLEAVE_RANGE = G.skills.cleave.range;
const MAPS_TO_INCLUDE = new Set([
    "desertland", "goobrawl", "main", "level2w", "cave", "halloween",
    "spookytown", "tunnel", "winterland", "level2n", "uhills", "mforest"
]);

function handle_cleave(Mainhand, aoe, cc, stMaps, aoeMaps, tank) {
    const now = performance.now();
    const time_since_last = now - last_cleave_time;

    const monsters = Object.values(parent.entities).filter(e =>
        e?.type === "monster" &&
        !e.dead &&
        e.visible &&
        distance(character, e) <= CLEAVE_RANGE
    );

    const untargeted = monsters.some(m => !m.target);

    if (can_cleave(aoe, cc, MAPS_TO_INCLUDE, monsters, tank, time_since_last, untargeted)) {
        if (Mainhand !== "bataxe") return;
        use_skill("cleave");
        reduce_cooldown("cleave", character.ping * 0.95);
        last_cleave_time = now;
    }

    // Swap back instantly (don't delay this)
    //handleWeaponSwap(stMaps, aoeMaps);
}

function can_cleave(aoe, cc, maps, monsters, tank, time_since, has_untargeted) {
    return (
        !smart.moving &&
        cc && aoe && tank &&
        time_since >= CLEAVE_THRESHOLD &&
        monsters.length > 0 &&
        //!hasUntargeted &&
        maps.has(character.map) &&
        !is_on_cooldown("cleave") &&
        ms_to_next_skill("attack") > 75
    );
}
