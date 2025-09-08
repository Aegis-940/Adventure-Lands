
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
// ATTACK LOOP - SEMI OPTIMIZED
// --------------------------------------------------------------------------------------------------------------------------------- //

// Toggle options
let ATTACK_TARGET_LOWEST_HP = true;      // true: lowest HP, false: highest HP
let ATTACK_PRIORITIZE_UNTARGETED = true; // true: prefer monsters with no target first


async function attack_loop() {
    let delay = 100;
    let disabled = (parent.is_disabled(character) === undefined);

    try {
        if (disabled) {
            // Always heal, regardless of attack_enabled
            let heal_target = lowest_health_partymember();
            if (
                heal_target &&
                heal_target.hp < heal_target.max_hp - (character.heal / 1.11) &&
                is_in_range(heal_target)
            ) {
                await heal(heal_target);
                game_log(`Healing ${heal_target.name}`, "#00FF00");
                delay = ms_to_next_skill('attack');
            }

            // Only attack if attack_enabled is true
            if (attack_enabled) {
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

                if (target && is_in_range(target)) {
                    await attack(target);
                    delay = ms_to_next_skill('attack');
                }
            }
        }
    } catch (e) {
        console.error(e);
    }

    attack_timer_id = setTimeout(attack_loop, delay);
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// MOVE LOOP - UNOPTIMIZED
// --------------------------------------------------------------------------------------------------------------------------------- //

async function move_loop() {
  if (!move_enabled) return;
  const delay = 200;

  try {
    // Don’t override an in-progress move
    if (character.moving || smart.moving) {
      return setTimeout(move_loop, delay);
    }

	// 1) Otherwise, find the absolute closest monster in MONSTER_TYPES
	let bestDist = Infinity;
	for (const mtype of MONSTER_TYPES) {
	const mon = get_nearest_monster_v2({ type: mtype, path_check: true });
	if (!mon) continue;
	const d = parent.distance(character, mon);
	if (d < bestDist) {
		bestDist = d;
		moveTarget = mon;
	}
	}
	// If monster is already in attack range, we don’t need to move
	if (moveTarget && parent.distance(character, moveTarget) <= character.range) {
	moveTarget = null;
	}

    // 3) If we’ve picked someone to follow, move directly to them
    if (moveTarget) {
      await move(moveTarget.real_x, moveTarget.real_y);
    }

  } catch (err) {
    console.error("move_loop error:", err);
  }

	move_timer_id = setTimeout(move_loop, delay);

}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP - UNOPTIMIZED
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	
	const X = character.real_x;
	const Y = character.real_y;
	const delay = 100;
	const dead = character.rip;
	const disabled = !parent.is_disabled(character);
	const mapsToExclude = [];
	const eventMaps = [];
	const eventMobs = [];

    let PRIEST_SKILL_TOGGLES = {
        curse: true,
        absorb: true,
        party_heal: true,
        dark_blessing: false,
        zap_spam: false
    };

	try {
		if (character.ctype === "priest") {
			handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps);
		}
	} catch (e) {
		console.error(e);
	}
	setTimeout(skill_loop, delay);
 
}

async function safe_call(fn, name) {
	try {
		await fn();
	} catch (e) {
		console.error(`Error in ${name}:`, e);
	}
}

async function handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps, zapperMobs) {
	if (dead || !disabled) return;

	if (PRIEST_SKILL_TOGGLES.curse)
		safe_call(() => handle_cursing(X, Y), "handle_cursing");
	if (PRIEST_SKILL_TOGGLES.absorb)
		safe_call(() => handle_absorb(mapsToExclude, eventMobs, eventMaps), "handle_absorb");
	if (PRIEST_SKILL_TOGGLES.party_heal)
		safe_call(() => handle_party_heal(), "handle_party_heal");
	if (PRIEST_SKILL_TOGGLES.dark_blessing)
		safe_call(() => handle_dark_blessing(), "handle_dark_blessing");
	if (PRIEST_SKILL_TOGGLES.zap_spam)
		safe_call(() => handleZapSpam(zapperMobs), "handleZapSpam");
}

async function handle_cursing(X, Y) {
	const ctarget = get_nearest_monster_v2({
		target: "Myras",
		check_max_hp: true,
		max_distance: 75,
		point_for_distance_check: [X, Y],
	}) || get_targeted_monster();

	if (ctarget && ctarget.hp >= ctarget.max_hp * 0.2 && !ctarget.immune) {
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

async function handle_absorb(mapsToExclude) {
	const now = Date.now();
	if (now - absorb_last_used < ABSORB_COOLDOWN) return;

	const partyNames = Object.keys(get_party()).filter(name => name !== character.name);

	const attackers = {};
	for (const id in parent.entities) {
		const monster = parent.entities[id];
		if (monster.type !== "monster" || monster.dead || !monster.visible) continue;
		if (partyNames.includes(monster.target)) attackers[monster.target] = true;
	}

	for (const name of partyNames) {
		if (attackers[name]) {
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

async function handle_party_heal(healThreshold = 0.65, minMp = 2000) {
	if (!character.party || character.mp <= minMp) return;
	if (is_on_cooldown("partyheal")) return;

	const partyNames = Object.keys(get_party());
	for (const name of partyNames) {
		const ally = get_player(name);
		if (!ally || ally.rip) continue;
		if (ally.hp >= ally.max_hp * healThreshold) continue;

		try {
			await use_skill("partyheal");
		} catch (e) {
			if (e?.reason !== "cooldown") throw e;
		}
		break;
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
        if (hpMissing >= 720) {
            if (can_use("mp")) {
                use("mp");
				use_skill("partyheal");
                used_potion = true;
            }
        }

        // Use mana potion if needed
        if (mpMissing >= 500) {
            if (can_use("mp")) {
                use("mp");
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
// COMBAT MOVEMENT TO GROUP UP ENEMIES - SEMI OPTIMIZED
// --------------------------------------------------------------------------------------------------------------------------------- //

let circle_move_enabled = false;
let circle_move_timer_id = null;
let circle_origin = null;
let circle_move_radius = 20;
let circle_path_points = [];
let circle_path_index = 0;
const CIRCLE_STEPS = 12; // 30 degrees per step

function set_circle_move_radius(r) {
    if (typeof r === "number" && r > 0) {
        circle_move_radius = r;
        game_log(`Circle move radius set to ${circle_move_radius}`);
    }
}

function compute_circle_path(origin, radius, steps) {
    const points = [];
    for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        points.push({
            x: origin.x + radius * Math.cos(angle),
            y: origin.y + radius * Math.sin(angle)
        });
    }
    return points;
}

function start_circle_move(radius = circle_move_radius) {
    if (circle_move_enabled) return;
    circle_move_enabled = true;
    circle_origin = { x: character.real_x, y: character.real_y };
    set_circle_move_radius(radius);
    circle_path_points = compute_circle_path(circle_origin, circle_move_radius, CIRCLE_STEPS);
    circle_path_index = 0;
    circle_move_loop(); // No timer needed, just start the async loop
    console.log("🔵 Circle move started");
}

function stop_circle_move() {
    circle_move_enabled = false;
    console.log("⏹ Circle move stopped");
}

const MOVE_CHECK_INTERVAL = 120; // ms
const MOVE_TOLERANCE = 5; // pixels

async function circle_move_loop() {
    while (circle_move_enabled) {
        const point = circle_path_points[circle_path_index];
        circle_path_index = (circle_path_index + 1) % circle_path_points.length;

        // Only move if not already close to the next point
        const dist = Math.hypot(character.real_x - point.x, character.real_y - point.y);
        if (!character.moving && !smart.moving && dist > MOVE_TOLERANCE) {
            try {
                await move(point.x, point.y);
            } catch (e) {
                console.error("Circle move error:", e);
            }
        }

        // Wait until movement is finished or interrupted
        while (circle_move_enabled && (character.moving || smart.moving)) {
            await new Promise(resolve => setTimeout(resolve, MOVE_CHECK_INTERVAL));
        }

        // Small delay before next step to reduce CPU usage
        await new Promise(resolve => setTimeout(resolve, 100));
    }
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
        const low_health = character.hp < character.max_hp / 3;
        const high_health = character.hp >= 2 * character.max_hp / 3;

        if (low_health && !panic_triggered) {
            // Enter panic state
            panic_triggered = true;
            stop_attack_loop();
            game_log("⚠️ Panic triggered: Low health!");

            const jacko_slot = locate_item(PANIC_WEAPON);
            if (jacko_slot !== -1) {
                await equip(jacko_slot);
                await delay(500);
            }

            if (can_use("scare")) {
                await use_skill("scare");
            }
        } else if (panic_triggered && high_health) {
            // Exit panic state
            game_log("✅ Panic over — resuming normal operations.");
            panic_triggered = false;

            const orbg_slot = locate_item(NORMAL_WEAPON);
            if (orbg_slot !== -1) {
                await equip(orbg_slot);
                await delay(500);
            }

            start_attack_loop();
        }

        await delay(CHECK_INTERVAL);
    }
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// 1) GLOBAL SWITCHES & TIMERS
// --------------------------------------------------------------------------------------------------------------------------------- //

let attack_enabled   = true;
let attack_timer_id  = null;
let move_enabled     = true;
let move_timer_id    = null;

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

// --------------------------------------------------------------------------------------------------------------------------------- //
// 3) PERSISTENT STATE HANDLER
// --------------------------------------------------------------------------------------------------------------------------------- //

function save_persistent_state() {
    try {
        set("healer_attack_enabled", attack_enabled);
        set("healer_move_enabled", move_enabled);
        set("circle_move_enabled", circle_move_enabled);
        set("circle_path_points", JSON.stringify(circle_path_points));
        for (const key in PRIEST_SKILL_TOGGLES) {
            set(`priest_skill_${key}`, PRIEST_SKILL_TOGGLES[key]);
        }
    } catch (e) {
        console.error("Error saving persistent state:", e);
    }
}

function init_persistent_state() {
    try {
        // Load attack and move loop flags
        const atk = get("healer_attack_enabled");
        if (atk !== undefined) attack_enabled = atk;

        const mv = get("healer_move_enabled");
        if (mv !== undefined) move_enabled = mv;

        // Load circle move state
        const circle_enabled = get("circle_move_enabled");
        if (circle_enabled !== undefined) circle_move_enabled = circle_enabled;

        const saved_points = get("circle_path_points");
        if (saved_points) {
            try {
                circle_path_points = JSON.parse(saved_points);
            } catch (e) {
                circle_path_points = [];
            }
        }

        // Load skill toggles
        for (const key in PRIEST_SKILL_TOGGLES) {
            const val = get(`priest_skill_${key}`);
            if (val !== undefined) PRIEST_SKILL_TOGGLES[key] = val;
        }

        // Start/stop loops based on restored state
        if (attack_enabled) start_attack_loop();
        else               stop_attack_loop();

        if (move_enabled)  start_move_loop();
        else               stop_move_loop();

        // Start circle move loop if enabled and points exist
        if (circle_move_enabled && circle_path_points.length > 0) {
            circle_move_loop();
            game_log("🔵 Circle move loop resumed from persistent state");
        }
    } catch (e) {
        console.error("Error loading persistent state:", e);
    }
}

// Save state on script unload
window.addEventListener("beforeunload", save_persistent_state);

// --------------------------------------------------------------------------------------------------------------------------------- //
// 4) PERSISTENT STATE
// --------------------------------------------------------------------------------------------------------------------------------- //

init_persistent_state();
