# CONTEXT.md — Project Overview & Architecture

## What This Project Is

**Adventure-Lands** is a full-party game automation bot for the browser-based MMO [AdventureLand](https://adventure.land). It controls 4 characters simultaneously using scripts injected directly into the game client. One user can run an entire party — Tank, Healer, Ranger, and Merchant — through fully automated behavior loops.

---

## Characters

| Character | Class | Role |
|-----------|-------|------|
| Ulric | Warrior | Party leader, tank, melee DPS, cleave |
| Myras | Priest | Healer, buffer, crowd control support |
| Riva | Ranger | Ranged DPS, multi-shot (3-shot/5-shot) |
| Riff | Merchant | Logistics — potions, loot, upgrades, crafting |

---

## Architecture Overview

```
Bootstrapper.js
    └── loads all scripts in order from CDN (jsdelivr)

Shared/Game_Config.js   ← core config/constants shared by everything
    ├── Loop toggle globals   (ATTACK_LOOP_ENABLED, etc.)
    ├── Location database     (monster spawn locations per map)
    ├── Party constants       (PARTY_LEADER, PARTY_MEMBERS)
    └── Tick rates / cooldowns

Shared/Movement.js           ← smarter_move(), move_to_character(), bscorpion/primling farm, combat orbit
Shared/Combat_Utilities.js   ← monster targeting/distance/aggro helpers, event handling
Shared/Messaging.js          ← CM (character message) handlers, localStorage-backed state cache
Shared/Party_And_Loot.js     ← party invite/accept, shared loot/inventory/panic/equipment behaviors
Shared/Error_Handling.js     ← catcher(), the shared error-triage/logging helper
Shared/Widgets.js            ← create_bottomrightcorner_widget() (Gold/XP/CC/DPS meters'
                                container) and make_draggable() (used by Custom_Log.js/
                                Stats_Window.js) — the only pieces kept when Buttons.js/
                                Windows.js were removed for a from-scratch UI redesign

Characters/[Role].js         ← entry point per character
    ├── Starts periodic update loops
    └── Calls into Character_Functions/
    (button/window UI setup removed pending redesign — see Buttons.js/Windows.js note above)

Character_Functions/[Role]_Functions.js   ← per-role behavior
    ├── Combat ability rotations
    ├── Movement patterns (circular kiting, chase, etc.)
    ├── Equipment auto-swap logic
    └── Role-specific CONFIG object

Character_Functions/Warrior_Skills.js     ← Warrior skill loop (stomp, cleave, agitate, taunt)
Character_Functions/Healer_Skills.js      ← Healer skill loop (curse, absorb, party heal, dark blessing)
Character_Functions/Ranger_Equipment.js   ← Ranger equipment-swap loop (weapon/boss sets)
    Each is a separate eval closure loaded right after its parent _Functions.js file
    (own role_scripts entry in Bootstrapper.js) — reads/writes the parent file's
    state/cache/CONFIG/home/destination globals, which are `var` there for exactly
    this reason, and defines its loop function as a real function declaration.

UI/*.js                      ← overlay panels (semi-independent)
    ├── DPS_Meter.js
    ├── Stats_Window.js       Canvas-based gold graph
    ├── Party_Frames.js
    ├── Remote_Bank_Viewer.js
    ├── Bank_Sorter.js        Bank sorting order/category definitions
    ├── CC_Meter.js
    ├── Gold_Meter.js
    ├── XP_Meter.js
    ├── Game_Log.js           mostly commented out — incomplete feature
    └── Custom_Log.js         custom in-game log window

Merchant_Systems/
    ├── Auto_Upgrade.js        item upgrade profiles (loaded for Riff)
    └── Auto_Craft.js          crafting automation and batch orchestration (loaded for Riff)
```

---

## How Scripts Are Loaded

The `Bootstrapper.js` detects which character is logged in by name, then fetches and evaluates the appropriate scripts from a CDN (jsdelivr):

1. Game_Config + all Shared/UI files — loaded in parallel (none of them call into each other at load time, only from functions/handlers invoked later)
2. Character Functions, then that character's entry point — loaded sequentially afterward, since these do call into the shared files immediately

Each script is loaded with retry logic and exponential backoff. A small loader snippet pasted into each character's in-game code slot resolves the current commit SHA once and hands it to `Bootstrapper.js`, avoiding a duplicate lookup.

---

## State Machine

Each character operates across these behavioral states:

| State | Trigger | Behavior |
|-------|---------|----------|
| `normal` | Default | Hunt monsters, loot, patrol |
| `boss` | Boss detected via `parent.S` | Prioritize boss, swap to boss gear |
| `panic` | HP too low | Flee, stop attacking, heal |
| `dead` | Character HP = 0 | Wait for respawn, rejoin party |

State transitions are managed in `Game_Config.js` and checked each loop tick.

---

## Key Systems

### Movement (`smarter_move`)
- Promise-based — awaitable, supports timeout and interruption
- `smart._interrupt()` cancels in-flight movement
- Circular kiting: characters orbit enemies at configurable radius/speed
- Predictive movement: calculates where enemy will be, not where it is

### Combat Loops
- Each character has `setInterval`-based loops for attack, skills, and movement
- Toggleable via boolean globals (`ATTACK_LOOP_ENABLED`, etc.)
- Targets selected by priority (current target → nearest monster → boss)

### Equipment Auto-Swap
- Multiple swap profiles: single-target, multi-target, boss, XP farm
- Cooldown guards prevent rapid re-swapping
- Boss HP thresholds trigger gear changes mid-fight

### Merchant Logistics
- Periodically visits party members to collect loot
- Delivers potions when members run low
- Runs `Auto_Upgrade.js` profiles to improve party gear
- Handles fishing and mining for resources

### UI Overlays
- Bottom-right-corner meters (Gold/XP/CC/DPS) share `Widgets.js`'s `create_bottomrightcorner_widget()` container; Custom_Log.js/Stats_Window.js use its `make_draggable()`
- The rest of the buttons/windows UI (Buttons.js/Windows.js) was removed for a from-scratch redesign — not yet rebuilt
- DPS Meter: per-member damage tracking, rolling event window
- Stats Window: Canvas-based 30-minute rolling gold accumulation graph
- Party Frames: real-time HP bars for all 4 members
- CC Meter: tracks crowd control applications

---

## Configuration

Each character function file has a local `CONFIG` object at the top. There is no centralized config file — this is intentional for per-role isolation.

**Common config fields:**
```javascript
CONFIG = {
    combat: {
        enabled: true,
        target_priority: ["monster_name", ...],
    },
    movement: {
        circle_walk: true,
        circle_radius: 100,
        circle_speed: 0.002,
    },
    equipment: {
        auto_swap_sets: { boss: [...], normal: [...] },
        boss_luck_switch: true,
    },
    potions: {
        auto_buy: true,
        hp_threshold: 0.5,
        mp_threshold: 0.3,
    },
    looting: {
        enabled: true,
        chest_threshold: 1000,
    }
}
```

---

## File Size Reference

*(Line counts below are exact as of the last cleanup pass — see git history for drift over time; don't treat this table as authoritative if it's been a while since a restructure.)*

| File | Lines |
|------|-------|
| Character_Functions/Ranger_Functions.js | 1035 |
| Character_Functions/Warrior_Functions.js | 1014 |
| Character_Functions/Healer_Functions.js | 924 |
| Character_Functions/Merchant_Functions.js | 852 |
| Shared/Party_And_Loot.js | 638 |
| Merchant_Systems/Auto_Upgrade.js | 600 |
| Shared/Movement.js | 536 |
| Merchant_Systems/Auto_Craft.js | 469 |
| Character_Functions/Warrior_Skills.js | 224 |
| Character_Functions/Healer_Skills.js | 222 |
| Shared/Combat_Utilities.js | 194 |
| Shared/Messaging.js | 177 |
| Character_Functions/Ranger_Equipment.js | 133 |
| Shared/Error_Handling.js | 150 |
| Shared/Game_Config.js | 127 |
| Shared/Widgets.js | 54 |
| UI/DPS_Meter.js | 376 |
| UI/Stats_Window.js | 347 |
| UI/Remote_Bank_Viewer.js | 194 |
| UI/Bank_Sorter.js | 187 |
| UI/Custom_Log.js | 270 |
| UI/Party_Frames.js | 123 |
| UI/CC_Meter.js | 125 |
| UI/Gold_Meter.js | 114 |
| UI/XP_Meter.js | 86 |
| UI/Game_Log.js | 161 |
| Bootstrapper.js | 129 |
| Characters/Tank.js | 27 |
| Characters/Healer.js | 38 |
| Characters/Ranger.js | 27 |
| Characters/Merchant.js | 47 |

---

## Known Gaps / Ongoing Work

- `UI/Game_Log.js` is mostly commented out — incomplete feature
- No automated tests — all validation is done by running in the live game
- Git commits are not descriptively labeled (all labeled "1") — history is minimal

---

## External References

- Game: [adventure.land](https://adventure.land)
- CDN for script hosting: [jsdelivr.net](https://www.jsdelivr.com) (via GitHub raw)
- GitHub repo: Aegis-940/Adventure-Lands
