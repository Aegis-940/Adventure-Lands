
// --------------------------------------------------------------------------------------------------------------------------------- //
// GLOBAL SWITCHES & TIMERS
// --------------------------------------------------------------------------------------------------------------------------------- //

let attackEnabled   = false;
let attackTimerId   = null;
let moveEnabled     = false;
let moveTimerId     = null;

// --------------------------------------------------------------------------------------------------------------------------------- //
// START/STOP HELPERS
// --------------------------------------------------------------------------------------------------------------------------------- //

function startAttackLoop() {
  if (!attackEnabled) {
    attackEnabled = true;
    _attack_loop();
    console.log("▶️ Attack loop started");
  }
}

function stopAttackLoop() {
  attackEnabled = false;
  clearTimeout(attackTimerId);
  console.log("⏹ Attack loop stopped");
}

function startMoveLoop() {
  if (!moveEnabled) {
    moveEnabled = true;
    _move_loop();
    console.log("▶️ Move loop started");
  }
}

function stopMoveLoop() {
  moveEnabled = false;
  clearTimeout(moveTimerId);
  console.log("⏹ Move loop stopped");
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

let lastSwitchTime = 0, state = "attacking";
const switchCooldown = 750;
const rangeThreshold = 45;
let lastEquippedSet = null;

async function attack_loop() {
    if (!attackEnabled) return;
    const X = character.x, Y = character.y;
    let delay = 1;
    const now = performance.now();
    const entities = Object.values(parent.entities);

    const sortedByHP = [];
    for (const e of entities) {
        if (e.type === "monster") {
            sortedByHP.push(e);
        }
    }
    sortedByHP.sort((a, b) => a.hp - b.hp);

    const inRange = [], outOfRange = [];
    for (const mob of sortedByHP) {
        (Math.hypot(mob.x - X, mob.y - Y) <= rangeThreshold ? inRange : outOfRange).push(mob);
    }

    try {
	if (sortedByHP.length) {
	    const cursed = get_nearest_monster_v2({ statusEffects: ["cursed"] });
	    if (cursed) {
		change_target(cursed);
		if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", cursed);
		if (!is_on_cooldown("supershot")) await use_skill("supershot", cursed);
	    }
	    //if (inRange.length >= 4) {
		//smartEquip("boom");
		//await use_skill("5shot", inRange.slice(0, 5).map(e => e.id));
	    //} else if (outOfRange.length >= 4) {
		//smartEquip("dead");
	    //    await use_skill("5shot", outOfRange.slice(0, 5).map(e => e.id));
	    if (sortedByHP.length >= 2) {
		//smartEquip("dead");
		const threeTargets = sortedByHP.filter(m => is_in_range(m)).slice(0, 3);
		if (threeTargets.length >= 2) {
			await use_skill("3shot", threeTargets.map(m => m.id));
		}
	    } else if (sortedByHP.length === 1 && is_in_range(sortedByHP[0])) {
		//smartEquip("single");
		await attack(sortedByHP[0]);
	    }
	    delay = ms_to_next_skill("attack");
	}
	    
    } catch (err) {
        console.error(err);
    }

    // only re-schedule if still enabled
    if (attackEnabled) {
        attackTimerId = setTimeout(attack_loop, delay);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {
    let delay = 50;
    try {
        let tar = get_nearest_monster({ type: home });
        if (tar && !smart.moving) {
            if (!is_in_range(tar)) {
                if (can_move_to(tar.real_x, tar.real_y)) {
                    // Calculate halfway point and move there
                    let halfway_x = character.real_x + (tar.real_x - character.real_x) / 2;
                    let halfway_y = character.real_y + (tar.real_y - character.real_y) / 2;
                    await move(halfway_x, halfway_y);
                } else {
                    if (!smart.moving) {
                        // Use smart_move if direct path is not possible
                        smart_move({
                            x: tar.real_x,
                            y: tar.real_y
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
