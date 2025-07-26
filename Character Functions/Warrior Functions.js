
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
    set("warrior_attack_enabled", attack_enabled);
    set("warrior_move_enabled",   move_enabled);
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

async function attack_loop() {
    if (!attack_enabled) return;
    let delay = null;
    try {
        let target = null;

        // Single loop, prioritized targeting
        for (const name of MONSTER_TYPES) {
            target = get_nearest_monster_v2({
                type: name,
                check_max_hp: true,
                max_distance: character.range,
                statusEffects: ["cursed"],
            });
            if (target) break;

            // If no cursed target nearby, check wider range
            target = get_nearest_monster_v2({
                type: name,
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

	// only re-schedule if still enabled
	if (attack_enabled) {
	attack_timer_id = setTimeout(attack_loop, delay);
	}
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {
  if (!move_enabled) return;
  try {
    // 1) Find the absolute closest monster among your approved types
    let closest = null;
    let minDist  = Infinity;

    for (const mtype of MONSTER_TYPES) {
      const mon = get_nearest_monster_v2({ type: mtype });
      if (!mon) continue;
      const d = parent.distance(character, mon);
      if (d < minDist) {
        minDist  = d;
        closest = mon;
      }
    }

    // 2) If there is one and we're out of range, walk straight at it
    if (
      closest &&
      minDist > character.range * 0.9 &&
      !character.moving   // optional: don’t spam move() if we're already walking
    ) {
      // Use real_x/real_y for smooth coords, and pass them as two args
      await move(closest.real_x, closest.real_y);
    }
  } catch (err) {
    console.error("move_loop error:", err);
  } finally {
   if (move_enabled) {
        move_timer_id = setTimeout(move_loop, delay);
    }
  }
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
        const aoe = character.mp >= character.mp_cost * 2 + G.skills.cleave.mp + 50;
        const cc = character.cc < 135;
        const zapper_mobs = ["plantoid"];
        const st_maps = [];
        const aoe_maps = ["mansion", "main"];
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

    if (st_maps.includes(character.map)) {
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
const MAPS_TO_INCLUDE = ["mansion", "main"];

function handle_cleave(Mainhand, aoe, cc, st_maps, aoe_maps, tank) {
    const now = performance.now();
    const time_since_last = now - last_cleave_time;

    const monsters = Object.values(parent.entities).filter(e =>
        e?.type === "monster" &&
        !e.dead &&
        e.visible &&
        distance(character, e) <= CLEAVE_RANGE
    );

    const untargeted = monsters.some(m => !m.target);

    if (can_cleave(aoe, cc, new Set(aoe_maps), monsters, tank, time_since_last, untargeted)) {
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

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAINTAIN POSITION
// --------------------------------------------------------------------------------------------------------------------------------- //

const BOUNDARY_RADIUS = 200;

function start_boundary_guard(radius = BOUNDARY_RADIUS, interval = 200) {
  // 1) Capture the home point
  const homeX = character.real_x;
  const homeY = character.real_y;

  // 2) The enforcement loop
  async function boundary_loop() {
    const dx   = character.real_x - homeX;
    const dy   = character.real_y - homeY;
    const dist = Math.hypot(dx, dy);

    if (dist > radius) {
      // Move halfway back toward home
      const targetX = character.real_x + (homeX - character.real_x) / 2;
      const targetY = character.real_y + (homeY - character.real_y) / 2;
      await move(targetX, targetY);
    }

    // Schedule the next check
    setTimeout(boundary_loop, interval);
  }

  // 3) *Start* the loop
  boundary_loop();
}
