
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

hide_skills_ui();

// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIVERSAL LOOP CONTROL
// --------------------------------------------------------------------------------------------------------------------------------- //

// --- Helper: Handle death and respawn ---
async function handle_death_and_respawn() {
    stop_attack_loop();
    stop_panic_loop();
    stop_boss_loop();
    panicking = false;

    await delay(30000);
    await respawn();
    await delay(5000);
    await smart_move(TARGET_LOC);
}

// --- Helper: Boss alive check ---
function is_boss_alive() {
    return BOSSES.some(name => {
        const s = parent.S[name];
        return (
            s &&
            s.live === true &&
            Number.isFinite(s.hp) &&
            Number.isFinite(s.max_hp) &&
            (s.max_hp - s.hp) > 100000
        );
    });
}

async function universal_loop_controller() {

	try {

        // --- Ensure essential loops are always running ---
        if (!LOOP_STATES.potion) start_potions_loop();
        if (!LOOP_STATES.loot) start_loot_loop();
        // if (!LOOP_STATES.heal) start_heal_loop();
        if (!LOOP_STATES.panic) start_panic_loop();
        if (!LOOP_STATES.cache) start_status_cache_loop();

        // --- Boss detection ---
        let boss_alive = is_boss_alive();

        // --- Handle death and respawn ---
        if (character.rip) {
            await handle_death_and_respawn();
            return;

        // --- Handle panic state ---
        } else if (panicking) {

            if (!LOOP_STATES.panic) start_panic_loop();
            if (LOOP_STATES.attack) stop_attack_loop();
            // if (LOOP_STATES.skill) stop_skill_loop();
            if (LOOP_STATES.boss) stop_boss_loop();
            if (LOOP_STATES.general_boss) stop_general_boss_loop();
            return;

        // --- Handle boss logic ---
        } else if (boss_alive) {

            if (LOOP_STATES.attack) stop_attack_loop();
            // if (LOOP_STATES.skill) stop_skill_loop();
            // if (LOOP_STATES.orbit) stop_orbit_loop();
            if (!LOOP_STATES.boss) start_boss_loop();
            return;

        // --- Stop boss loop if no boss is alive ---
        } else if (!boss_alive && LOOP_STATES.boss) {
            stop_boss_loop();
        
        // --- Normal grind logic ---
        } else  {
            if (!LOOP_STATES.general_boss) start_general_boss_loop();
            if (!LOOP_STATES.attack) start_attack_loop();
            // if (!LOOP_STATES.skill) start_skill_loop();

            // const at_target = character.x === TARGET_LOC.x && character.y === TARGET_LOC.y;
            // const near_target = parent.distance(character, TARGET_LOC) <= 50;
            // if (near_target && !LOOP_STATES.orbit && !smart.moving) smart_move(TARGET_LOC);
            // if (!LOOP_STATES.orbit && at_target) start_orbit_loop();
        }

    } catch (e) {
        game_log("⚠️ Universal Loop error:", "#FF0000");
        game_log(e);
    }
}


// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

setInterval(() => {
	
	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

	// === Core utility loops ===
	party_manager();
	universal_loop_controller();
	
	if (!attack_mode || character.rip || is_moving(character)) return;

}, 250);
