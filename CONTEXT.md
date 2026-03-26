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

Common Functions.js          ← shared by everything
    ├── smarter_move()        Promise-based pathfinding
    ├── State management      (panic / normal / boss / dead)
    ├── Loop toggle globals   (ATTACK_LOOP_ENABLED, etc.)
    ├── Location database     (monster spawn locations per map)
    ├── Party constants       (PARTY_LEADER, PARTY_MEMBERS)
    └── Tick rates / cooldowns

Characters/[Role].js         ← entry point per character
    ├── Creates UI buttons and windows
    ├── Starts periodic update loops
    └── Calls into Character Functions/

Character Functions/[Role] Functions.js   ← per-role behavior
    ├── Combat ability rotations
    ├── Movement patterns (circular kiting, chase, etc.)
    ├── Equipment auto-swap logic
    └── Role-specific CONFIG object

UI/*.js                      ← overlay panels (semi-independent)
    ├── DPS_Meter.js
    ├── Stats_Window.js       Canvas-based gold graph
    ├── Party_Frames.js
    ├── Remote_Bank_Viewer.js
    ├── CC_Meter.js
    ├── Gold_Meter.js
    └── XP_Meter.js

Auto Upgrade.js              ← item upgrade profiles (used by Merchant)
Auto Craft.js                ← crafting automation (used by Merchant)
Priest_Manager.js            ← extended healer system (alternate to Healer Functions)
Buttons.js                   ← floating button UI helper
Windows.js                   ← floating draggable window helper
```

---

## How Scripts Are Loaded

The `Bootstrapper.js` detects which character is logged in by name, then fetches and evaluates the appropriate scripts from a CDN (jsdelivr) in the correct order:

1. Common Functions
2. UI files
3. Character Functions
4. Character entry point

Each script is loaded with retry logic and exponential backoff. Loading is sequential to respect dependencies.

> **Note:** The bootstrapper is currently partially disabled/in transition. Scripts may also be pasted manually into the game's code editor.

---

## State Machine

Each character operates across these behavioral states:

| State | Trigger | Behavior |
|-------|---------|----------|
| `normal` | Default | Hunt monsters, loot, patrol |
| `boss` | Boss detected via `parent.S` | Prioritize boss, swap to boss gear |
| `panic` | HP too low | Flee, stop attacking, heal |
| `dead` | Character HP = 0 | Wait for respawn, rejoin party |

State transitions are managed in `Common Functions.js` and checked each loop tick.

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
- Runs `Auto Upgrade.js` profiles to improve party gear
- Handles fishing and mining for resources

### UI Overlays
- All panels are draggable floating windows built via `Windows.js`
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

| File | Lines |
|------|-------|
| Common Functions.js | ~2270 |
| Ranger Functions.js | ~4323 |
| Warrior Functions.js | ~2071 |
| Healer Functions.js | ~1775 |
| Merchant Functions.js | ~1069 |
| Priest_Manager.js | ~1192 |
| Auto Upgrade.js | ~520 |
| Buttons.js | ~398 |
| DPS_Meter.js | ~358 |
| Stats_Window.js | ~363 |
| Auto Craft.js | ~163 |
| Remote_Bank_Viewer.js | ~193 |
| Party_Frames.js | ~123 |
| CC_Meter.js | ~125 |
| Gold_Meter.js | ~114 |
| XP_Meter.js | ~80 |
| Game_Log.js | ~161 |
| Windows.js | ~81 |
| Bootstrapper.js | ~131 |
| Characters/*.js | ~60 each |

---

## Known Gaps / Ongoing Work

- `CC_Manager.js` is a placeholder (1 line) — not yet implemented
- `Game_Log.js` is mostly commented out — incomplete feature
- `Bootstrapper.js` has some disabled sections — loader is in transition
- No automated tests — all validation is done by running in the live game
- Git commits are not descriptively labeled (all labeled "1") — history is minimal

---

## External References

- Game: [adventure.land](https://adventure.land)
- CDN for script hosting: [jsdelivr.net](https://www.jsdelivr.com) (via GitHub raw)
- GitHub repo: Aegis-940/Adventure-Lands
