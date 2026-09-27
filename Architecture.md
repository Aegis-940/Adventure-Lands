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

Core Systems/Global Config.js     ← awaited FIRST, with Widget Helpers.js; everything may assume it
    ├── Location database     (monster spawn locations per map)
    ├── Party constants       (PARTY_LEADER, PARTY_MEMBERS, MOVEMENT_LEADER)
    ├── Shared config defaults (LOOTING_/POTION_/EQUIPMENT_DEFAULTS, PANIC_ORB_SET)
    ├── farm_target_for()/farm_target_key() — the per-character farm target
    ├── storage_read()/storage_write() — the one JSON-backed localStorage seam
    ├── No-op errlog_* stubs  (Error Log.js replaces them; call sites never guard)
    └── Tick rates / cooldowns

Core Systems/*.js                 ← loaded in parallel as real <script> tags
    ├── Movement Manager.js       movement_goal() + movement_local(), smarter_move(), travel_arbiter(), stuck escape
    ├── Bscorpion Camp.js         positioning for the desertland bscorpion/primling camp
    ├── Combat Utilities.js       monster/entity queries, boss + party state predicates
    ├── Combat Formulas.js        damage/heal arithmetic (defense, burn, splash, heal pipeline)
    ├── Combat Sampling.js        hit/action socket samplers, damage + heal windows
    ├── Movement Positioning.js   best_orbit_spot(), scorers, reposition_center(), orbit_reposition()
    ├── Targeting.js              score_targets()/select_target() — one scorer for every character
    ├── World Events.js           live boss/seasonal targets, the walk to them, the anniversary visit
    ├── Character Messaging.js    CM handlers, localStorage-backed state cache
    ├── Equipment Manager.js      equipment sets, batch_equip(), slot arbiter, rules resolver
    ├── Equipment Valuation.js    ability procs, set profiles, damage maths, weapon choice
    ├── Party Management.js       panic + its broadcast (set_panic()), party invites, home location
    ├── Loot Management.js        loose_loot() (keep/ship/vendor), bank withdrawal, chest looting
    ├── Maintenance.js            potion drinking/restocking, periodic tab reload
    ├── Party Cohesion.js         follow_goal(), party_cohesion_hold(), leader_position(), behind_on_xp()
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

    Sibling files share state/cache/CONFIG as `var` globals, because a top-level
    const/let is invisible across eval boundaries.

Dungeons/                            ← loaded in parallel as script tags, every character
    ├── Dungeon Runner.js         party entry, run_dungeon(), the flag accessors, scripted travel
    ├── Dungeon Mode.js           the on/off toggle and its toprightcorner buttons
    ├── Dungeon Progress.js       kills this run, and whether the quota is met
    ├── Dungeon Escape.js         bail-out: scare, walk away, town back to the entrance
    ├── Dungeon Telemetry.js      per-run flight recorder, pushed as errlog samples
    ├── Dungeon Collection.js     every few runs, meet Riff outside and hand the haul over
    ├── Spider Dungeon.js         DUNGEONS.spider definition and its run_/start_ wrappers
    ├── Crypt Dungeon.js          DUNGEONS.crypt definition and its run_/start_ wrappers
    └── Crypt Route.js            the crypt's waypoint circuit and when to back out

    A dungeon's `flags` are read through dungeon_flag()/dungeon_setting() at the
    decision they affect. They are contextual overrides, not a second config:
    most have no CONFIG counterpart, so they are deliberately NOT merged into it.

Character Managers/Merchant Manager/  ← Riff only; no combat files
    ├── Merchant Config.js        tunables, locations, merchant_task
    ├── Merchant Stand.js         the stall: open/close and the idle state
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
    ├── Widget Helpers.js         register_widget() + create_bottomrightcorner_widget(),
    │                             commas()/prune_before()/window_sum(), make_draggable()
    │                             — awaited in the first stage, not one of the parallel loads
    ├── DPS Meter.js
    ├── Stats Window.js           Canvas-based gold graph
    ├── Party Frames.js
    ├── Bank Viewer.js            bank access UI plus the toprightcorner reload button
    ├── Bank Sort Order.js        bank sorting order/category definitions
    ├── CC Meter.js
    ├── Gold Meter.js
    ├── XP Meter.js
    ├── Game Log.js               the one log window — timestamps, category filters, Log/Filtered tabs, resized #gamelog
    ├── Pause Button.js           per-character pause/resume, leaves combat/panic/upkeep running
    └── Settings Window.js        per-character target settings, persisted via localStorage

Tools/                            ← dev scaffolding, not loaded by the bot
    ├── Error Sink.py             local HTTP sink for errlog_sample() pushes -> errors.json
    ├── Anniversary Probe.js      one-off probe pasted into a code slot/console
    └── Crypt Probe.js            one-off probe for crypt geometry
```

---

## How Scripts Are Loaded

The `Bootstrapper.js` detects which character is logged in by name, then fetches and evaluates the appropriate scripts from a CDN (jsdelivr):

1. **First stage, awaited:** `Global Config.js` and `Interface/Widget Helpers.js`. Everything loaded later may assume both are present. A failure here aborts the load.
2. **Second stage, parallel:** every other Core Systems / Dungeons / Interface file, as real `<script>` tags. A failure in one named in `CRITICAL_SCRIPTS` aborts; others are allowed to be missing.
3. **Third stage, sequential:** that character's `Character Managers/` files via indirect eval, then its entry point — these call into the shared files immediately.

**Second-stage files execute in network-completion order, not list order.** So nothing in stage 2 may depend on another stage-2 file *at load time* — only from functions and handlers invoked later. Two patterns exist for genuine load-time needs: move the dependency into stage 1 (which is why Widget Helpers is there — the meters build their widgets as they load), or poll for it and retry, as the toprightcorner button chain does for the DOM element it attaches to. Adding or removing a stage-2 file reshuffles the race and can expose a latent dependency that had been winning by luck.

Each script is loaded with retry logic and exponential backoff. `Code Loader.js` — the only file pasted into each character's in-game code slot — just fetches and evals `Bootstrapper.js`; it deliberately does not resolve a commit SHA itself, since `Bootstrapper.js` already resolves one per load and doing it in both places doubled the `api.github.com` request rate against its 60/hour limit.

---

## The Main Tick

There is no state-machine object. `run_character()` in `Core Systems/Character Runner.js` runs one
`main_tick` and the order of its checks *is* the priority:

1. `is_disabled(character)` — dead or otherwise out of action; run the character's `on_disabled` hook and retry in 250ms
2. the character's `update_cache()`, then `panic_check()` unless its `skip_panic_check()` says otherwise
3. `automation_enabled()` — if paused, drop the goal, release the travel arbiter, and idle
4. `stuck_escape_check()`, then the character's optional `pre_move()`
5. `movement_goal()` — the one priority list for *where to go* (events, bosses, cohesion, home)
6. `dungeon_moving()` — a scripted dungeon walk owns movement, so yield to it
7. `travel_arbiter(goal)` — if it takes the goal, it owns movement this tick
8. otherwise `should_loot()` → `handle_looting()`, else `movement_local(goal, farm_step)` for *where to stand*

Panic lives in `Core Systems/Party Management.js` (`set_panic()` is its only writer) and is broadcast
to the party over CM. Combat, skills, equipment and upkeep run as their own independent loops started
from the entry point, not from this tick.

---

## Key Systems

### Movement (`smarter_move`)
- Promise-based — awaitable, supports timeout and interruption
- `smart._interrupt()` cancels in-flight movement
- Circular kiting: characters orbit enemies at configurable radius/speed
- Predictive movement: calculates where enemy will be, not where it is

### Combat Loops
- Each character starts its own `action_loop()`, `skill_loop()` and `equipment_manager_loop()` from its entry point; they self-reschedule with `setTimeout`, independently of the main tick
- There are no per-loop enable globals. Automation is paused per character through the ⏸️ button, which `automation_enabled()` reads from localStorage; panic and upkeep keep running
- Targets come from one scorer for everyone — `score_targets()`/`select_target()` in `Core Systems/Targeting.js`, weighted per character by `CONFIG.combat.target_weights`

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
- Bottom-right-corner meters (Gold/XP/CC/DPS) are each one `register_widget(id, { container, content, init, render, tick_ms })` call into `Widget Helpers.js`, which builds the container, runs the render tick, and rebuilds the widget if the game UI drops it. They share `commas()`, `prune_before()` and `window_sum()` from the same file; Settings Window.js/Stats Window.js use its `make_draggable()`
- Top-right-corner buttons (🔄 reload, 🏧 bank, ⚙️ settings, ⏸️ pause, ⚰️/🕷️ dungeon) were rebuilt piecemeal in their own files after `Buttons.js`/`Windows.js` were removed. Each attaches after the previous one's element and polls until it exists, so they chain safely regardless of load order
- DPS Meter: per-member damage tracking, rolling event window
- Stats Window: Canvas-based 30-minute rolling gold accumulation graph
- Party Frames: real-time HP bars for all 4 members
- CC Meter: tracks crowd control applications

---

## Configuration

Each character's `[Role] Config.js` owns its own `CONFIG` object — per-role isolation is deliberate,
and most values live only there. The exception is the handful that were byte-identical in all three
fighters: `Global Config.js` holds `LOOTING_DEFAULTS`, `POTION_DEFAULTS`, `EQUIPMENT_DEFAULTS` and
`PANIC_ORB_SET`, which each config spreads and then overrides, so every tuned value is still visible
where it is tuned:

```javascript
var CONFIG = {
    combat:    { target_priority: ["Myras"], target_weights: { damage: 1, protects: 1, close: 0.05 }, ... },
    movement:  { enabled: true, reposition: true, circle_radius: 35, follow_distance: 15, ... },
    equipment: { ...EQUIPMENT_DEFAULTS, weapon_sets: ["single", "aoe", "double_aoe"], ... },
    looting:   { ...LOOTING_DEFAULTS },
    potions:   { ...POTION_DEFAULTS },
    skills:    { cleave_enabled: true, agitate_enabled: true, ... },
};
```

Alongside `CONFIG`, each config file also declares `home`, `destination`, `PANIC_THRESHOLDS`,
`equipment_sets`, `ITEMS_TO_KEEP`, `item_order`, and the mutable `state`/`cache` its siblings share.
All of these are `var`, because a top-level `const`/`let` is invisible across the eval boundary
between sibling character files.

Read the real values from the config files — the snippet above is shape, not settings.

---

## File Size Reference

Deliberately not tabulated here — a snapshot of line counts went stale within one restructure and
listed files that no longer existed. Get it from git instead:

```bash
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  printf "%6d  %s
" "$(git show "HEAD:$f" | wc -l)" "$f"
done | sort -rn
```

Count against git blobs rather than the working tree: the tree is CRLF while blobs are LF.

---

## Known Gaps / Ongoing Work

- No automated tests — all validation is done by running in the live game. The only mechanical check available offline is a delimiter-balance pass over the changed files
- `Core Systems/Porcupine Guard.js` is explicitly temporary; every call site is `typeof`-guarded so deleting its Bootstrapper line removes it cleanly
- The buttons/windows UI is still incomplete after `Buttons.js`/`Windows.js` were removed — reload, bank, settings, pause and the dungeon toggles were rebuilt in their own files, but the rest was not
- `storage_read()`/`storage_write()` cover the JSON-backed values only. The bare-string stores (`automation_enabled()`, the dungeon override, Settings Window, `Error Log.js`'s key scan) still call `localStorage` directly, deliberately — `storage_read()` would `JSON.parse` a bare string and return null. Every one of those calls is inside a function and wrapped in try/catch, so a browser blocking site data degrades rather than breaking the load

---

## External References

- Game: [adventure.land](https://adventure.land)
- CDN for script hosting: [jsdelivr.net](https://www.jsdelivr.com) (via GitHub raw)
- GitHub repo: Aegis-940/Adventure-Lands
