// --------------------------------------------------------------------------------------------------------------------------------- //
// PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

//init_persistent_state();

// --------------------------------------------------------------------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// --------------------------------------------------------------------------------------------------------------------------------- //

remove_all_floating_stats_windows();
remove_all_floating_buttons();

create_map_movement_window([
  { id: "SendToMerchant", label: "Deposit", onClick: () => send_to_merchant() },
  { id: "custom2", label: "Custom 2", onClick: () => null },
  { id: "custom3", label: "Custom 3", onClick: () => null },
  { id: "custom4", label: "Custom 4", onClick: () => null },
  { id: "custom5", label: "Custom 5", onClick: () => null },
  { id: "custom6", label: "Custom 6", onClick: () => null }
]);

toggle_combat();
toggle_tank_role();
toggle_follow_tank();
toggle_free_move();
hide_skills_ui();
// toggle_stats_window();

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
    let optimal_hp = args.check_max_hp ? 0 : 999999999; // Set initial optimal HP based on whether we're checking for max or min HP

    for (let id in parent.entities) {
        let current = parent.entities[id];
        if (current.type != "monster" || !current.visible || current.dead) continue;

        // Allow type to be an array for multiple types
        if (args.type) {
            if (Array.isArray(args.type)) {
                if (!args.type.includes(current.mtype)) continue; // Check if monster type is in the provided list
            } else {
                if (current.mtype !== args.type) continue;
            }
        }

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
    let delay = 1;
    let disabled = (parent.is_disabled(character) === undefined);
    let bosses = ["troll", "grinch"];
    try {
        if (disabled) {
            let heal_target = lowest_health_partymember();
            if (heal_target && heal_target.hp < heal_target.max_hp - (character.heal / 1.33) && is_in_range(heal_target)) {
                await heal(heal_target);
                delay = ms_to_next_skill('attack');
            } else {
                let target = null;
                let bossMonster = null;

		/*
                //Prioritize Bosses
                if (!target) {
                    for (let i = 0; i < bosses.length; i++) {
                        bossMonster = get_nearest_monster_v2({
                            type: bosses[i],
                            max_distance: 250, // Higher range for bosses
                        });
                        if (bossMonster) break;
                    }
                }
		*/

                // If no Bosses, find regular mobs
                for (let i = 0; i < MONSTER_TYPES.length; i++) {
                    target = get_nearest_monster_v2({
                        type: MONSTER_TYPES[i],
                        check_min_hp: true,
                        max_distance: 150, // Only consider monsters within 50 units
                    });
                    if (target) break;
                }

		/*
                // Prioritize boss target if found, otherwise use regular target
                if (bossMonster) {
                    target = bossMonster;
                }
		*/

                if (target) {
                    if (is_in_range(target)) {
                        await attack(target);
                        delay = ms_to_next_skill('attack');
                    }
                }
            }
        }
    } catch (e) {
        //console.error(e);
    }
    setTimeout(attack_loop, delay);
}

attack_loop();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {
    let delay = 100;

    try {
        // Prioritize healing target
        let heal_target = lowest_health_partymember();

        if (
            heal_target &&
            heal_target.hp < heal_target.max_hp - (character.heal / 1.33) &&
            !is_in_range(heal_target) &&
            can_move_to(heal_target)
        ) {
            // Move halfway to the healing target
            await move(
                character.real_x + (heal_target.real_x - character.real_x) / 2,
                character.real_y + (heal_target.real_y - character.real_y) / 2
            );
        } else {
            // Fallback: move toward the nearest monster of valid types
            let monster = null;

            for (let i = 0; i < MONSTER_TYPES.length; i++) {
                monster = get_nearest_monster_v2({
                    type: MONSTER_TYPES[i],
                    check_min_hp: true,
                    path_check: true,
                });

                if (monster && !is_in_range(monster)) break;
                monster = null;
            }

            if (monster) {
                await move(
                    character.real_x + (monster.real_x - character.real_x) / 2,
                    character.real_y + (monster.real_y - character.real_y) / 2
                );
            }
        }
    } catch (e) {
        console.error(e);
    }

    setTimeout(move_loop, delay);
}

move_loop();

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

setInterval(() => {

	// === Core utility loops ===
	pots();
	loot();
	party_manager();
	check_and_request_pots();

	if (!attack_mode || character.rip || is_moving(character)) return;

}, 250);
