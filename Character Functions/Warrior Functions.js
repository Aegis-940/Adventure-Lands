


// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL SWITCHES & TIMERS
// --------------------------------------------------------------------------------------------------------------------------------- //

let attack_enabled   = true;
let attack_timer_id  = null;
let move_enabled     = true;
let move_timer_id    = null;
let skill_enabled     = true;
let skill_timer_id    = null;

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
    skill_enabled = true;
    skill_loop();
    game_log("▶️ Skill loop started");
}

function stop_skill_loop() {
  skill_enabled = false;
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
    set("warrior_skill_enabled",  skill_enabled);
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
    if (sk !== undefined) skill_enabled = sk;

    // Reflect loaded flags in the loop state
    if (attack_enabled) start_attack_loop();
    else                stop_attack_loop();

    if (move_enabled)   start_move_loop();
    else                stop_move_loop();

    if (skill_enabled)  start_skill_loop();
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
    try {
        let target = null;

        // Single loop, prioritized targeting
        for (const name of MONSTER_TYPES) {
            target = get_nearest_monster_v2({
                type: name,
                check_max_hp: false,
                max_distance: character.range,
                statusEffects: ["cursed"],
            });
            if (target) break;

            // If no cursed target nearby, check wider range
            target = get_nearest_monster_v2({
                type: name,
                check_max_hp: false,
                max_distance: character.range,
            });
		
            if (target) break;
		
        }

        if (target) {
            await attack(target);
	    reduce_cooldown("cleave", character.ping * 0.95);
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
  // How often to run
  const delay = 200;
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

let eTime = 0;

async function skill_loop() {
    if (!skill_enabled) return;
    let delay = 200;
    try {
        let zap = false;
        const dead = character.rip;
        const Mainhand = character.slots?.mainhand?.name;
        const offhand = character.slots?.offhand?.name;
        const aoe = character.mp >= character.mp_cost * 2 + G.skills.cleave.mp + 50;
        const cc = character.cc < 135;
        const zapper_mobs = ["plantoid"];
        const st_maps = [];
        const aoe_maps = ["mansion", "main", "cave", "level2s"];
        let tank = get_entity("Ulric");

        if (character.ctype === "warrior") {
            try {
                if (tank && tank.hp < tank.max_hp * 0.4 && character.name === "REPLACE_WITH_ULRIC_IF_NEEDED") {
                    handle_stomp(Mainhand, st_maps, aoe_maps, tank);
                }
                if (character.ctype === "warrior") {
                    handle_cleave(Mainhand, aoe, cc, st_maps, aoe_maps, tank);
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
// EQUIPMENT SETS
// --------------------------------------------------------------------------------------------------------------------------------- //

const equipment_sets = {

    dps: [
        { itemName: "strearring", slot: "earring1", level: 1, l: "l" },
        { itemName: "strearring", slot: "earring2", level: 2, l: "l" },
        { itemName: "orbg", slot: "orb", level: 2, l: "l" },
        //{ itemName: "orbofstr", slot: "orb", level: 5, l: "l" },
        { itemName: "strring", slot: "ring1", level: 2, l: "l" },
        { itemName: "suckerpunch", slot: "ring2", level: 1, l: "u" },
    ],
    single: [
        { itemName: "fireblade", slot: "mainhand", level: 7, l: "l" },
        { itemName: "fireblade", slot: "offhand", level: 7, l: "l" }
    ],
    cleave: [
        { itemName: "bataxe", slot: "mainhand", level: 5, l: "s" }
    ],
};

function cleave_set() {
    unequip("offhand");
    equip_batch([
        { itemName: "bataxe", slot: "mainhand", level: 5},
    ]);
}

function equip_set(setName) {
    const set = equipment_sets[setName];
    if (set) {
       equip_batch(set);
    } else {
        console.error(`Set "${setName}" not found.`);
    }
}

function handle_weapon_swap() {
	const now = performance.now();
	if (now - eTime <= 300) return;

        equip_set("single");
        eTime = now;
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// HANDLE SKILLS
// --------------------------------------------------------------------------------------------------------------------------------- //

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

    if (can_cleave(aoe, monsters, tank, time_since_last)) {
        if (Mainhand !== "bataxe") cleave_set();
        use_skill("cleave");
        reduce_cooldown("cleave", character.ping * 0.95);
        last_cleave_time = now;	  
    }
    // Swap back instantly (don't delay this)
    handle_weapon_swap();
}

function can_cleave(aoe, monsters, tank, time_since) {
    return (
        !smart.moving &&
	aoe && tank &&
        time_since >= CLEAVE_THRESHOLD &&
        monsters.length > 2 &&
        !is_on_cooldown("cleave") &&
        ms_to_next_skill("attack") > 25
    );
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// BATCH EQUIP ITEMS
// --------------------------------------------------------------------------------------------------------------------------------- //

function handleEquipBatchError(message) {
    game_log(message);
    // You may decide to implement a delay or other error handling mechanism here
    return Promise.reject({ reason: "invalid", message });
}

async function equip_batch(data) {
	if (!Array.isArray(data)) return handleEquipBatchError("Input is not an array.");
	if (data.length > 15) return handleEquipBatchError("Too many items in equip batch.");

	const used_slots = new Set();

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

		// Search inventory for matching item
		const item_index = parent.character.items.findIndex((item, idx) =>
			item &&
			item.name === itemName &&
			item.level === level &&
			(!l || item.l === l) &&
			!used_slots.has(idx)
		);

		if (item_index !== -1) {
			used_slots.add(item_index);
			equip(item_index, slot);
			await delay(20); // just enough time for server sync
		}
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
		let myras_online = parent.party_list.includes(PRIEST_NAME) && parent.entities[PRIEST_NAME];

		if (!myras_online) {
			if (!panic_triggered) {
				// Enter panic state
				panic_triggered = true;
				attack_enabled = false;
				game_log("⚠️ Panic triggered: Myras is offline!");

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
			if (panic_triggered) {
				// Exit panic state
				game_log("✅ Myras is back online — exiting panic mode!");
				panic_triggered = false;

				const orbg_slot = locate_item(NORMAL_WEAPON);
				if (orbg_slot !== -1) {
					equip(orbg_slot);
					await delay(100);
				}

				attack_enabled = true;
				start_attack_loop();
			}
		}

		await delay(CHECK_INTERVAL);
	}
}
