// -------------------------------------------------------------------- //
// CONFIG VARIABLES
// -------------------------------------------------------------------- //
​
let attack_mode         = true;
​
const HEAL_THRESHOLD        = 800;
const HEAL_COOLDOWN         = 200;
​
const party_leader          = "Ulric";
​
const HP_THRESHOLD          = 500;
const MP_THRESHOLD          = 500;
const MERCHANT_NAME         = "Riff";
​
const _cmListeners          = [];
const floatingButtonIds     = [];
​
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
let lastCurseTime = 0;
const CURSE_COOLDOWN = 5250;
​
setInterval(() => {
    const now = Date.now();
​
    if (!attack_mode || character.rip || is_moving(character)) return;
​
    // === Gold/hr tracking ===
    const wind = window._statsWin;
    if (wind) {
        const gph = Math.round(getGoldPerHour());
        wind.innerHTML = `<strong>Gold/hr (5m avg)</strong><br>${gph.toLocaleString()} g/h`;
    }
