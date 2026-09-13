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
Code Loader.js                    ← the only file in a game code slot; fetches/evals Bootstrapper.js
Bootstrapper.js                   ← loads everything else from CDN (jsdelivr), in order

Core Systems/Global Config.js     ← core config/constants shared by everything; loaded FIRST, alone
    ├── Loop toggle globals   (ATTACK_LOOP_ENABLED, etc.)
    ├── Location database     (monster spawn locations per map)
    ├── Party constants       (PARTY_LEADER, PARTY_MEMBERS)
    └── Tick rates / cooldowns

Core Systems/*.js                 ← loaded in parallel as real <script> tags
    ├── Movement.js               smarter_move(), travel_arbiter(), move_to_character(), stuck escape
    ├── Bscorpion Camp.js         positioning for the desertland bscorpion/primling camp
    ├── Combat Utilities.js       monster queries, damage/heal models, best_orbit_spot()
    ├── Targeting.js              score_targets()/select_target() — one scorer for every character
    ├── World Events.js           live boss/seasonal targets, the walk to them, the anniversary visit
    ├── Character Messaging.js    CM handlers, localStorage-backed state cache
    ├── Equipment.js              equipment sets, batch_equip(), slot arbiter, rules resolver
    ├── Party Management.js       panic + its broadcast (set_panic()), party invites, home location
    ├── Loot Management.js        loose_loot() (keep/ship/vendor), bank withdrawal, chest looting
    ├── Maintenance.js            potion drinking/restocking, periodic tab reload
    ├── Party Cohesion.js         follow_goal(), party_cohesion_hold(), movement_goal() priority list
    ├── Character Runner.js       run_character(), the shared main tick loop
    ├── Error Handling.js         catcher(), the shared error-triage/logging helper
    └── Error Log.js              persistent cross-character flight recorder (al_errors(true))

Character Managers/[Role] Manager/   ← loaded sequentially via indirect eval, per character
    ├── [Role] Config.js          tunables, gear sets, panic thresholds, state/cache
    ├── [Role] Combat.js          target cache and action_loop()
    ├── [Role] Skills.js          the skill loop
    ├── [Role] Equipment.js       EQUIPMENT_RULES resolvers and monster gear overrides
    ├── [Role] Movement.js        reposition scorer / movement hooks
    └── [Role].js                 entry point — wires windows and calls run_character()

    Warrior adds Warrior Bscorpion.js; Healer adds Healer Dungeon.js;
    Ranger adds Ranger Looting.js. Sibling files share state/cache/CONFIG as `var`
    globals, because a top-level const/let is invisible across eval boundaries.

Character Managers/Merchant Manager/  ← Riff only; no combat files
    ├── Merchant Config.js        tunables, locations, merchant_task
    ├── Merchant Stand.js         the stall: open/close, orders, stock, restocking, idle
    ├── Merchant Inventory.js     slot counting, vendoring SELLABLE_ITEMS, banking
    ├── Merchant Exchange.js      bank fetch task plus idle exchanging
    ├── Merchant Gear.js          default loadout and gathering-tool swaps
    ├── Merchant Gathering.js     shared fishing/mining run
    ├── Merchant Party.js         mluck, party membership, the delivery run
    ├── Merchant Upkeep.js        potions, loot collection and buffing, on their own 1Hz loop
    ├── Merchant Upgrading.js     item upgrade profiles and automation
    ├── Merchant Crafting.js      crafting logic and batch orchestration
    ├── Merchant Task Loop.js     PRIORITY_CHECKS, set_state(), loop_controller()
    │                             — MUST load after every file it names
    └── Merchant.js               entry point

Interface/*.js                    ← overlay panels (semi-independent)
    ├── Widget Helpers.js         create_bottomrightcorner_widget(), make_draggable()
    ├── DPS Meter.js
    ├── Stats Window.js           Canvas-based gold graph
    ├── Party Frames.js
    ├── Bank Viewer.js            bank access UI plus the toprightcorner reload button
    ├── Bank Sort Order.js        bank sorting order/category definitions
    ├── CC Meter.js
    ├── Gold Meter.js
    ├── XP Meter.js
    ├── Game Log.js               mostly commented out — incomplete feature
    ├── Custom Log.js             custom in-game log window
    ├── Pause Button.js           per-character pause/resume, leaves combat/panic/upkeep running
    └── Settings Window.js        per-character target settings, persisted via localStorage

Tools/                            ← dev scaffolding, not loaded by the bot
    ├── Error Sink.py             local HTTP sink for errlog_sample() pushes -> errors.json
    └── Anniversary Probe.js      one-off probe pasted into a code slot/console
```

---

## How Scripts Are Loaded

The `Bootstrapper.js` detects which character is logged in by name, then fetches and evaluates the appropriate scripts from a CDN (jsdelivr):

1. Global Config, then all Core Systems/Interface files — loaded in parallel (none of them call into each other at load time, only from functions/handlers invoked later)
2. Character Functions, then that character's entry point — loaded sequentially afterward, since these do call into the shared files immediately

Each script is loaded with retry logic and exponential backoff. `Code Loader.js` — the only file pasted into each character's in-game code slot — just fetches and evals `Bootstrapper.js`; it deliberately does not resolve a commit SHA itself, since `Bootstrapper.js` already resolves one per load and doing it in both places doubled the `api.github.com` request rate against its 60/hour limit.

---

## State Machine

Each character operates across these behavioral states:

| State | Trigger | Behavior |
|-------|---------|----------|
| `normal` | Default | Hunt monsters, loot, patrol |
| `boss` | Boss detected via `parent.S` | Prioritize boss, swap to boss gear |
| `panic` | HP too low | Flee, stop attacking, heal |
| `dead` | Character HP = 0 | Wait for respawn, rejoin party |

State transitions are managed in `Global Config.js` and checked each loop tick.

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
- Runs `Merchant Upgrading.js` profiles to improve party gear
- Handles fishing and mining for resources

### UI Overlays
- Bottom-right-corner meters (Gold/XP/CC/DPS) share `Widget Helpers.js`'s `create_bottomrightcorner_widget()` container; Custom Log.js/Stats Window.js use its `make_draggable()`
- Top-right-corner buttons (🔄 reload, 🏧 bank, ⚙️ settings, ⏸️ pause) were rebuilt piecemeal in their own files after `Buttons.js`/`Windows.js` were removed; the rest of that UI is still pending
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

*(Line counts as of the naming pass — see git history for drift; don't treat this table as authoritative if it's been a while since a restructure.)*

| File | Lines |
|------|-------|
| Core Systems/Combat Utilities.js | 679 |
| Character Managers/Merchant Manager/Merchant Upgrading.js | 640 |
| Core Systems/Equipment.js | 514 |
| Core Systems/Error Log.js | 462 |
| Character Managers/Merchant Manager/Merchant Crafting.js | 391 |
| Core Systems/Movement.js | 352 |
| Interface/DPS Meter.js | 343 |
| Interface/Stats Window.js | 313 |
| Character Managers/Healer Manager/Healer Skills.js | 286 |
| Character Managers/Ranger Manager/Ranger Combat.js | 276 |
| Core Systems/Loot Management.js | 274 |
| Character Managers/Healer Manager/Healer Movement.js | 261 |
| Core Systems/World Events.js | 257 |
| Character Managers/Warrior Manager/Warrior Skills.js | 251 |
| Bootstrapper.js | 235 |
| Character Managers/Merchant Manager/Merchant Stand.js | 231 |
| Interface/Custom Log.js | 224 |
| Character Managers/Healer Manager/Healer Combat.js | 223 |
| Character Managers/Warrior Manager/Warrior Equipment.js | 212 |
| Character Managers/Warrior Manager/Warrior Config.js | 212 |
| Interface/Bank Viewer.js | 203 |
| Core Systems/Party Cohesion.js | 199 |
| Core Systems/Party Management.js | 186 |
| Character Managers/Merchant Manager/Merchant Inventory.js | 184 |
| Interface/Bank Sort Order.js | 183 |
| Character Managers/Healer Manager/Healer Config.js | 172 |
| Character Managers/Ranger Manager/Ranger Config.js | 168 |
| Character Managers/Merchant Manager/Merchant Task Loop.js | 165 |
| Interface/Settings Window.js | 163 |
| Character Managers/Healer Manager/Healer Equipment.js | 163 |
| Interface/Game Log.js | 161 |
| Core Systems/Targeting.js | 158 |
| Core Systems/Global Config.js | 154 |
| Core Systems/Character Messaging.js | 154 |
| Core Systems/Bscorpion Camp.js | 149 |
| Core Systems/Character Runner.js | 140 |
| Character Managers/Merchant Manager/Merchant Party.js | 135 |
| Interface/Party Frames.js | 134 |
| Character Managers/Merchant Manager/Merchant Gathering.js | 130 |
| Character Managers/Healer Manager/Healer Dungeon.js | 127 |
| Tools/Error Sink.py | 125 |
| Character Managers/Warrior Manager/Warrior Combat.js | 123 |
| Interface/CC Meter.js | 122 |
| Character Managers/Ranger Manager/Ranger Equipment.js | 117 |
| Character Managers/Merchant Manager/Merchant Exchange.js | 112 |
| Character Managers/Warrior Manager/Warrior Movement.js | 100 |
| Interface/Gold Meter.js | 99 |
| Character Managers/Ranger Manager/Ranger Skills.js | 96 |
| Core Systems/Maintenance.js | 93 |
| Character Managers/Merchant Manager/Merchant Upkeep.js | 85 |
| Interface/XP Meter.js | 80 |
| Character Managers/Merchant Manager/Merchant Config.js | 80 |
| Character Managers/Merchant Manager/Merchant Gear.js | 72 |
| Core Systems/Error Handling.js | 70 |
| Character Managers/Ranger Manager/Ranger Looting.js | 64 |
| Code Loader.js | 61 |
| Interface/Widget Helpers.js | 46 |
| Interface/Pause Button.js | 45 |
| Tools/Anniversary Probe.js | 44 |
| Character Managers/Warrior Manager/Warrior Bscorpion.js | 42 |
| Character Managers/Warrior Manager/Warrior.js | 37 |
| Character Managers/Healer Manager/Healer.js | 28 |
| Character Managers/Ranger Manager/Ranger.js | 20 |
| Character Managers/Ranger Manager/Ranger Movement.js | 19 |
| Character Managers/Merchant Manager/Merchant.js | 15 |
---

## Known Gaps / Ongoing Work

- `Interface/Game Log.js` is mostly commented out — incomplete feature
- No automated tests — all validation is done by running in the live game
- The buttons/windows UI is still being rebuilt from scratch after `Buttons.js`/`Windows.js` were removed — only `Interface/Widget Helpers.js`'s two helpers survived

---

## External References

- Game: [adventure.land](https://adventure.land)
- CDN for script hosting: [jsdelivr.net](https://www.jsdelivr.com) (via GitHub raw)
- GitHub repo: Aegis-940/Adventure-Lands
