
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
create_custom_log_window();

// --------------------------------------------------------------------------------------------------------------------------------- //
// UNIVERSAL LOOP CONTROL
// --------------------------------------------------------------------------------------------------------------------------------- //

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

const STATES = {
    DEAD: "dead",
    PANIC: "panic",
    BOSS: "boss",
    NORMAL: "normal"
};

function get_character_state() {
    if (character.rip) return STATES.DEAD;
    if (panicking) return STATES.PANIC;
    if (is_boss_alive()) return STATES.BOSS;
    return STATES.NORMAL;
}

async function set_loops(state) {
    // Always-on loops
    if (!LOOP_STATES.potion) start_potions_loop();
    if (!LOOP_STATES.loot) start_loot_loop();
    if (!LOOP_STATES.cache) start_status_cache_loop();

    // State-specific
    switch (state) {
        case STATES.DEAD:
            panicking = false;
            if (LOOP_STATES.attack) stop_attack_loop();
            if (LOOP_STATES.heal) stop_heal_loop();
            if (LOOP_STATES.orbit) stop_orbit_loop();
            if (LOOP_STATES.panic) stop_panic_loop();
            if (LOOP_STATES.boss) stop_boss_loop();

            log("Respawning in 30s...", "red");
            await delay(30000);
            await respawn();
            await delay(5000);
            await smart_move(TARGET_LOC);

            if (!LOOP_STATES.panic) start_panic_loop();
            if (!LOOP_STATES.attack) start_attack_loop();
            if (!LOOP_STATES.heal) start_heal_loop();

            break;

        case STATES.PANIC:
            stop_attack_loop();
            stop_skill_loop();
            stop_boss_loop();

            break;

        case STATES.BOSS:
            stop_attack_loop();
            stop_skill_loop();
            stop_orbit_loop();

            if (!LOOP_STATES.boss) start_boss_loop();

            break;

        case STATES.NORMAL:
            if (LOOP_STATES.boss) stop_boss_loop();
            if (!LOOP_STATES.skill) start_skill_loop();
            if (!LOOP_STATES.attack) start_attack_loop();

            // Orbit logic
            if (TARGET_LOC.orbit) {
                const at_target = character.x === TARGET_LOC.x && character.y === TARGET_LOC.y;
                const near_target = parent.distance(character, TARGET_LOC) <= 50;
                if (near_target && !LOOP_STATES.orbit && !smart.moving) smart_move(TARGET_LOC);
                if (!LOOP_STATES.orbit && at_target) start_orbit_loop();
            }

            break;
    }
}

async function loop_controller() {
    try {
        const state = get_character_state();
        await set_loops(state);
    } catch (e) {
        catcher(e, "Loop Controller error");
    }
}

// --------------------------------------------------------------------------------------------------------------------------------- //
// MAIN LOOP
// --------------------------------------------------------------------------------------------------------------------------------- //

let last_update_time = 0;

potions_loop();
loot_loop();
move_loop();
skill_loop();
panic_loop();
boss_loop();
orbit_loop();
status_cache_loop();
heal_attack_loop();

setInterval(async () => {
	
	// Throttle to every 20 seconds (20,000 ms)
	const now = Date.now();
	if (now - last_update_time >= 20000) {
		parent.socket.emit("send_updates", {});
		last_update_time = now;
	}

	// === Core utility loops ===
	party_manager();
	await loop_controller();

	if (!attack_mode || character.rip || is_moving(character)) return;


}, 250);
