
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
  attack_loop();             // always call it
  console.log("▶️ Attack loop started");
}

function stop_attack_loop() {
  attack_enabled = false;
  clearTimeout(attack_timer_id);
  console.log("⏹ Attack loop stopped");
}

function start_move_loop() {
    move_enabled = true;
    move_loop();
    console.log("▶️ Move loop started");
}

function stop_move_loop() {
  move_enabled = false;
  clearTimeout(move_timer_id);
  console.log("⏹ Move loop stopped");
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

const SWITCH_COOLDOWN = 750;
const RANGE_THRESHOLD = 45;
//let lastEquippedSet = null;

async function attack_loop() {
	
    if (!attack_enabled) return;
    let delay = 10; 
    const X = character.x, Y = character.y;
    const now = performance.now();
    const entities = Object.values(parent.entities);

    const SORTED_BY_HP = [];
    for (const e of entities) {
        if (e.type === "monster" && MONSTER_TYPES.includes(e.mtype)) {
            SORTED_BY_HP.push(e);
        }
    }
    SORTED_BY_HP.sort((a, b) => a.hp - b.hp);

    const IN_RANGE = [], OUT_OF_RANGE = [];
    for (const mob of SORTED_BY_HP) {
        (Math.hypot(mob.x - X, mob.y - Y) <= RANGE_THRESHOLD ? IN_RANGE : OUT_OF_RANGE).push(mob);
    }

    try {
	if (SORTED_BY_HP.length) {
	    const cursed = get_nearest_monster_v2({ statusEffects: ["cursed"] });
	    if (cursed) {
		change_target(cursed);
		if (!is_on_cooldown("huntersmark")) await use_skill("huntersmark", cursed);
		if (!is_on_cooldown("supershot")) await use_skill("supershot", cursed);
	    }

	    //if (IN_RANGE.length >= 4) {
		//smartEquip("boom");
		//await use_skill("5shot", IN_RANGE.slice(0, 5).map(e => e.id));
	   // } else if (OUT_OF_RANGE.length >= 4) {
		//smartEquip("dead");
		//await use_skill("5shot", OUT_OF_RANGE.slice(0, 5).map(e => e.id));
	    const three_targets = SORTED_BY_HP.filter(mob => is_in_range(mob)).slice(0, 3);
	    if (three_targets.length >= 2) {
	    // Only fire 3shot if Myras is present on this map
	        use_skill("3shot", three_targets.map(m => m.id));
	    } else if (three_targets.length === 1) {
		//smartEquip("single");
		await attack(three_targets[0]);
	    }
	    delay = ms_to_next_skill("attack");
	}
    
    } catch (err) {
        console.error(err);
    }

    if (attack_enabled) {
        attack_timer_id = setTimeout(attack_loop, delay);
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
// PANIC BUTTON!!!
// --------------------------------------------------------------------------------------------------------------------------------- //

let panic_triggered = false;

async function panic_button_loop() {
	const CHECK_INTERVAL = 500;
	const PRIEST_NAME = "Myras";
	const PANIC_WEAPON = "jacko";
	const NORMAL_WEAPON = "orbg";

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
					equip(jacko_slot);
					await delay(100);
				}

				if (can_use("scare")) {
					use_skill("scare");
				}
			}
		} else {
			if (panic_triggered && high_health) {
				// Exit panic state
				game_log("✅ Panic over — resuming normal operations.");
				panic_triggered = false;

				const orbg_slot = locate_item(NORMAL_WEAPON);
				if (orbg_slot !== -1) {
					equip(orbg_slot);
					await delay(100);
				}

				attack_enabled = true;
				start_attack_loop?.(); // Optional chaining if defined
			}
		}

		await delay(CHECK_INTERVAL);
	}
}

