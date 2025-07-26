
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
    set("healer_attack_enabled", attack_enabled);
    set("healer_move_enabled",   move_enabled);
  } catch (e) {
    console.error("Error saving persistent state:", e);
  }
}

// Load saved flags with native get(), then start/stop loops accordingly. Call this once at script init.
function init_persistent_state() {
  try {
    const atk = get("healer_attack_enabled");
    if (atk !== undefined) attack_enabled = atk;

    const mv = get("healer_move_enabled");
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
		if (args.no_target && current.target && current.target != character.name) continue;

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
// ATTACK LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function attack_loop() {
    	if (!attack_enabled) return;
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
							max_distance: 250,
						});
						if (bossMonster) break;
					}
				}
				*/

				for (let i = 0; i < MONSTER_TYPES.length; i++) {
					target = get_nearest_monster_v2({
						type: MONSTER_TYPES[i],
						check_min_hp: true,
						max_distance: 150,
					});
					if (target) break;
				}

				/*
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
  const delay = 100;

  try {
    // Don’t override an in-progress move
    if (character.moving || smart.moving) {
      return setTimeout(move_loop, delay);
    }

    // 1) Determine if anyone needs healing
    const healTarget = lowest_health_partymember();
    let moveTarget = null;

    if (
      healTarget &&
      healTarget.hp < healTarget.max_hp - (character.heal / 1.33) &&
      !is_in_range(healTarget) &&
      can_move_to(healTarget)
    ) {
      moveTarget = healTarget;
    } else {
      // 2) Otherwise, find the absolute closest monster in MONSTER_TYPES
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
    }

    // 3) If we’ve picked someone to follow, move directly to them
    if (moveTarget) {
      await move(moveTarget.real_x, moveTarget.real_y);
    }

  } catch (err) {
    console.error("move_loop error:", err);
  }

    if (move_enabled) {
        move_timer_id = setTimeout(move_loop, delay);
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// SKILL LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

async function skill_loop() {
	
	game_log("skill_loop called");
	/*
	const mapLocations = locations[character.map] || locations[home] || [];
	const X = mapLocations[0]?.x ?? character.real_x;
	const Y = mapLocations[0]?.y ?? character.real_y;
	const delay = 40;
	const dead = character.rip;
	const disabled = !parent.is_disabled(character);
	const mapsToExclude = ["level2n", "level2w"];
	const eventMaps = ["desertland", "halloween"];
	const eventMobs = ["rgoo", "bgoo", "snowman", "icegolem", "franky", "grinch", "dragold", "wabbit", "mrgreen", "mrpumpkin"];
	try {
		if (character.ctype === "priest") {
			handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps);
		}
	} catch (e) {
		console.error(e);
	}
	setTimeout(() => skill_loop(), delay);
 */
}

async function safe_call(fn, name) {
	try {
		await fn();
	} catch (e) {
		console.error(`Error in ${name}:`, e);
	}
}

async function handle_priest_skills(X, Y, dead, disabled, mapsToExclude, eventMobs, eventMaps, zapperMobs) {
	game_log("handle_priest_skills called");
	if (dead || !disabled) return;

	safe_call(() => handle_cursing(X, Y), "handle_cursing");
	safe_call(() => handle_absorb(mapsToExclude, eventMobs, eventMaps), "handle_absorb");
	safe_call(() => handle_party_heal(), "handle_party_heal");
	safe_call(() => handle_dark_blessing(), "handle_dark_blessing");
	// await safe_call(() => handleZapSpam(zapperMobs), "handleZapSpam");
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

async function handle_absorb(mapsToExclude) {
	game_log("handle_absorb called");
	if (!character.party) return;
	if (mapsToExclude.includes(character.map)) return;
	if (is_on_cooldown("absorb")) return;

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
