// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //
​
let attack_mode = true;
​
let taunt_mode = true;
let taunt_button_title = "Taunt";
​
const TAUNT_RANGE = 320;
​
const PARTY_CHECK_INTERVAL = 5000;
let lastPartyCheck = 0;
​
const floatingButtonIds = [];
const _cmListeners      = [];
let goldHistory = [];
​
load_code(99);
load_code(98);
load_code(97);
​
init_persistent_state();
​
// -------------------------------------------------------------------- //
// BUTTONS AND WINDOWS
// -------------------------------------------------------------------- //
​
removeAllFloatingStatsWindows();
removeAllFloatingButtons();
​
createTeamStatsWindow();
hookGoldTrackingToStatsWindow("teamStatsWindow");
hookDPSTrackingToStatsWindow("teamStatsWindow");
​
createMapMovementWindow([
  { id: "SendToMerchant", label: "Deposit", onClick: () => send_to_merchant() },
  { id: "custom2", label: "Custom 2", onClick: () => null },
  { id: "custom3", label: "Custom 3", onClick: () => null },
  { id: "custom4", label: "Custom 4", onClick: () => null },
  { id: "custom5", label: "Custom 5", onClick: () => null },
  { id: "custom6", label: "Custom 6", onClick: () => null }
]);
​
toggle_combat();
toggle_tank_role();
toggle_follow_tank();
toggle_free_move();
//toggle_stats_window();
​
// -------------------------------------------------------------------- //
// MAIN LOOP
// -------------------------------------------------------------------- //
​
setInterval(() => {
    const now = Date.now();
​
    if (!attack_mode || character.rip || smart.moving) return;
​
    // Utility logic
    pots();
    loot();
    party_manager();
    check_and_request_pots();
​
    // TAUNT — pull aggro from monsters targeting allies
    if (taunt_mode && can_use("taunt") && !is_moving(character) && tank_name === "Ulric") {
        for (const id in parent.entities) {
            const e = parent.entities[id];
            if (
