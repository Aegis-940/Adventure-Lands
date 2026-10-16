# Architecture

How the parts of the bot fit together. The file-by-file map is in [`CLAUDE.md`](CLAUDE.md), and the reasoning behind each system (mechanics, tuned numbers, past incidents) is in [`Design Notes.md`](Design%20Notes.md).

## What this is

**Adventure-Lands** drives a party of four characters in the browser MMO [AdventureLand](https://adventure.land) from scripts injected into the game client. There is no build step, no bundler and no module system: every file is a plain script that runs in the game's code iframe, and `parent.*` is the game's own window.

| Character | Class | Role |
|-----------|-------|------|
| Ulric | Warrior | Party leader, melee damage, cleave; feeds aggro to Myras |
| Myras | Priest | **The tank**: pulls and holds aggro within an MP-scaled cap, heals the party, leads movement |
| Riva | Ranger | Ranged damage, multi-shot and supershot |
| Riff | Merchant | Logistics: potions, loot collection, upgrades, crafting. Usually on another map |

---

## How code reaches the game

```
game code slot 1 ── Code Loader.js ── GET http://127.0.0.1:8787/code/main ──► commit SHA of local main
                                   └─ GET /code/<sha>/Bootstrapper.js, eval ──► Bootstrapper loads the rest from /code/<sha>/
```

The error sink (`Tools/Error Sink.py`) serves the code from git, never from the working tree, so only what is committed on `main` can run, and one load never mixes two commits. A commit on local `main` goes live at the next reload. GitHub is only the backup. Deploying is described in `CLAUDE.md`.

### Load stages

The Bootstrapper loads in four stages, and **nothing runs at load**: each file only declares functions and constants and registers itself (`on_boot`, `console_api`, `encounter`, `DUNGEONS.x = {...}`).

1. **Kernel**, awaited: `Kernel.js` (boot phase, console API), `Scheduler.js` (`every()`, the only loop), `Events.js` (socket, character and DOM subscriptions, `wrap_parent`, the internal bus) and `Storage.js` (the only localStorage access).
2. **First stage**, awaited: `Global Config.js`, `Widget Helpers.js`, `Game Log.js` and `Encounter Registry.js`. Every later file may assume these exist.
3. **Parallel batch**: every other `Core Systems/`, `Encounters/`, `Dungeons/` and `Interface/` file as a real `<script>` tag, in network-completion order. A file in `OPTIONAL_SCRIPTS` may fail to load; any other failure aborts.
4. **Role files**, in order, through indirect eval: the character's `Character Managers/` folder, entry point last.

Then `kernel_boot()` runs every registered boot step once, **in Bootstrapper list order**. Because the steps run in list order, the order in which scripts arrive doesn't matter. A boot step that throws is reported in the game log and in `al_boot()`, and the rest still run.

The two load mechanisms scope differently. Script tags share one global scope, so a top-level `const` in `Core Systems/` is visible everywhere. Indirect eval does not share `const`/`let`, so anything two files of one character share must be `var` or `function`.

---

## Folder layout

```
Code Loader.js, Bootstrapper.js       the loader (slot 1) and the staged loader

Kernel/                               stage 1: boot, scheduler, events, storage
Core Systems/                         shared by all four characters
    Global Config.js                  stage 2: party constants, LOCATIONS, shared CONFIG defaults, every
                                      cross-character var with a neutral default, no-op stubs
    Movement Manager.js               smarter_move(), walk(), town_teleport(), the route resplice
    Travel Arbiter.js                 the one owner of long-range movement
    Town Shortcut.js                  town teleport while walking; followers copy or join the leader's
    Stuck Escape.js                   last-resort town out of a pocket
    Movement Goal.js                  movement_goal() (where to go) and movement_local() (where to stand)
    Movement Positioning.js           orbit scoring around a centre
    Party Cohesion.js                 follow goal, breadcrumb trail, cohesion holds
    World Events.js                   live bosses and seasonal events, the walk to them
    Combat Utilities.js               entity and boss predicates, the combat pause, lethal monsters
    Combat Formulas.js                the server's damage and heal arithmetic
    Combat Sampling.js                hit and heal telemetry, the in-flight damage ledger
    Targeting.js                      the one target scorer
    Equipment Manager.js              the only writer of what is worn
    Equipment Valuation.js            measured set profiles and the weapon chooser
    Party Management.js               panic (set_panic() is its only writer) and its broadcast
    Loot Management.js                keep/ship/vendor, bank withdrawal, chests
    Maintenance.js                    potions and the periodic reload
    Character Messaging.js            CM handlers and the party state cache
    Character Runner.js               run_character(): the main tick and the shared action runner
    Skill Runner.js                   run_skills(): one pass over a role's skill table
    Settings.js                       the ⚙️ settings registry and setting(name)
    Farm Ledger.js, Farm Survey.js    5-minute farming windows; the survey farm target
    Danger Log.js, Decision Log.js    deaths and close calls; decisions and their outcomes
    Experiments.js                    settings under test, alternated on the clock
    Boss Profiler.js                  per-fight profile of every player on a coop boss
    Error Handling.js, Error Log.js   catcher(); the cross-character flight recorder
Encounters/                           everything specific to one monster, spawn or boss
    Encounter Registry.js             stage 2: encounter(name, spec) and the questions code asks
    Bscorpion.js, Rime Djinn.js       required: the current farm; the Rime Djinn shell
    Porcupine.js, Mummy.js, Dryad.js, Fireroamer.js, Targetron-Sparkbot.js,
    Halloween Bosses.js, Crabxx.js, Monster Rules.js        optional, one per encounter
Dungeons/
    Dungeon Runner.js                 the active dungeon and its flags, scripted travel, the run and the loop
    Dungeon Targeting.js, Dungeon Entry.js                  what a run may hit; getting the party in
    Dungeon Mode.js, Dungeon Progress.js, Dungeon Escape.js, Dungeon Telemetry.js, Dungeon Collection.js
    Spider Dungeon.js, Crypt Dungeon.js, Crypt Route.js     dungeon definitions
    Dreams Cave.js                    the daily Cave of Many Dreams
Interface/
    Widget Helpers.js, Game Log.js    stage 2: the panel theme, meters and toolbar; the one log window
    Layout.js                         which panels are shown and where, synced across the four windows
    Session Metrics.js                the session's numbers and the live feed to the status page
    Metrics Graphs.js                 the 📊 popout over them
    DPS, Gold, XP and CC Meters, Boss Contribution, Kill Tracker, Party Frames, Stats Window,
    Lucky Slot Tracker, Bank Viewer, Bank Sort Order, Settings Window, Pause Button
Character Managers/<Role> Manager/    per character, through eval
    <Role> Config.js                  CONFIG, gear sets, state and cache
    <Role> Combat.js, Skills.js, Equipment.js, Movement.js
    <Role>.js                         entry point: wires the loops and calls run_character()
    Merchant Manager/                 Riff: Stand, Inventory, Exchange, Gear, Gathering, Party, Upkeep,
                                      Upgrading, Lolipop Push, Crafting, Task Loop (loads last)
Tools/                                run outside the game: the sink, the data store, the status page,
                                      the watchdog, lint, the party model
Tests/                                the offline harness, the parser-based analysis, the config check
```

---

## At runtime

### Loops

Every loop is an `every(name, { ms, kind }, fn)` from the scheduler. The body returns its next delay, `false` to stop, or nothing to keep the rate. `kind` decides what pausing does:

| Kind | Paused (⏸️) | Dead | Examples |
|------|-------------|------|----------|
| `automation` | idles | idles | the main tick, dungeon watchers |
| `combat` | runs | idles | action, skills, zap, equipment |
| `safety` | runs | as usual | panic, potions, merchant upkeep |
| `telemetry` | runs | runs | ledger, danger and decision logs, samplers |
| `ui` | runs | runs | meters, frames, graphs |

`al_loops()` in the console lists every loop with its rate, run count, last lag and last error.

### The main tick

`run_character()` in `Character Runner.js` runs the main tick, and the order of its checks is the priority:

1. Disabled (dead or stunned): the role's `on_disabled` hook, retry in 250ms.
2. The role's `update_cache()`, then `panic_check()` unless the role skips it.
3. Paused: drop the goal and release the travel arbiter.
4. `stuck_escape_check()`, the channel walk and `town_shortcut_check()`, then the role's `pre_move()`.
5. `movement_goal()`: where to go (lethal pursuer, dreams, events and bosses, cohesion, follow, encounters, home).
6. A scripted dungeon walk owns movement this tick if one is running.
7. `travel_arbiter(goal)` owns long-range movement. When it doesn't take the goal, the tick loots or calls `movement_local(goal)` for where to stand.

Combat runs beside it, not inside it: each role starts its own action, skill and equipment loops from its entry point. The action loop is shared (`start_action_loop(ROLE_ACTION)`); the skill loops run the role's table through `run_skills()`.

### One owner per decision

Each decision has a single owner, which is what lets the harness pin it (`node Tests/Harness.js check`), so a change to one shows as a golden diff. A decision with two owners needs a lock, a priority order or a rate limiter to stop them disagreeing; removing the split leaves that mechanism nothing to do. Monster specifics are answers an encounter file gives to questions shared and role code ask (`encounter_gear`, `encounter_allows`, `encounter_rank`, `encounter_setting`, `encounter_goal`); core code doesn't name monsters, and lint counts monster names outside the allowed files.

| Decision | Owner | How others take part |
|---|---|---|
| **What to wear** | `Equipment Manager.js`: `resolve_equipment()` runs each `EQUIPMENT_RULES` group, and `apply_equipment_rule()` is the only path to the server | A burst (cleave, stomp, scare, the temporal surge, the candy-cane swing) claims slots through `equip_burst()` at a priority (`panic` 100, `skill` 80, `rules` 20, `resting` 10); situational gear is an answer from `encounter_gear()`. No other file sends an equip |
| **Where to go** | `movement_goal()` (`Movement Goal.js`) | Events, cohesion, follow, encounters and home are inputs to its one priority list; the merchant and dungeons are modes |
| **How to get there** | `travel_arbiter()` (`Travel Arbiter.js`) | A scripted dungeon walk stands it down (`dungeon_moving()`); the town shortcut and stuck escape act only on journeys it owns |
| **Where to stand** | `movement_local()` (`Movement Goal.js`) | A goal names its local step (`LOCAL_STEPS`, or an encounter's `steps`, like bscorpion's `camp`); otherwise the role's farm step |
| **Am I in danger** | `set_panic()` (`Party Management.js`), the only writer | Its own `panic_check()` and the healer's CM broadcast (two call sites each) |
| **What to attack** | `select_target()`/`score_targets()` (`Targeting.js`), one writer of the target cache per character | `encounter_rank()` and dungeon targeting rules feed the scorer |
| **Which skill to cast** | `run_skills(table, context)` (`Skill Runner.js`) over the role's table | Each entry's `gate`, `wanted` and `value`; encounters answer `encounter_allows()` |
| **The basic action** | `run_action()` (`Character Runner.js`) over the role's `ROLE_ACTION` | The role supplies cadence, gate and `act(ms)` |
| **When to loot** | `should_loot()` → `handle_looting()` | Dungeon callers go through `should_loot()` |
| **The merchant's task** | `run_task(label, body, on_error)` (`Merchant Config.js`): every task starts only from Idle, gets an `abandoned()` test, reports errors and returns to Idle; `abandon_task()` for the watchdog | `PRIORITY_CHECKS` in the task loop picks; the watchdog abandons a stuck one |

### Events and storage

Socket, character and DOM subscriptions go through `on_socket`, `on_character` and `on_dom`, kept under a fixed key and replaced, never stacked, because the game window outlives the code iframe across reloads. Telemetry that several files want (`ledger_window`) goes over the internal bus (`bus_on`/`bus_emit`); the `hit` handlers subscribe to the socket themselves and share `hit_kind()`. Only `Kernel/Storage.js` touches localStorage, and `STORAGE_KEYS` registers every key and its owner.

---

## Data

```
characters ──errlog_sample / errlog_archive / snapshots / live feed──► Error Sink (127.0.0.1:8787)
    errors.json, errors_timeline.jsonl              the flight recorder (al_errors(true) reads it in game)
    ledger, tracker, danger, decisions, damage, heal, target_choice, cc_report  .jsonl archives
    snapshots.jsonl                                 live moments, the harness's fixture source
         │
         └─► Data Store.py ──► al_data.sqlite ──► Status Page, compare, the question reports
```

- **Farm Ledger** closes a 5-minute window per character (gold, XP, kills, deaths, potions, at the spot or away) and emits `ledger_window`; the **Decision Log** closes on it with what was chosen in the same seconds (casts confirmed by the server, actions and pulls, bursts, gear, panics, damage dealt and taken, time per weapon and goal).
- **Danger Log** records every death and close call with the damage sources of the last 10s and the decisions taken in them.
- Every record carries its context: build, home, map, goal, encounters, settings and experiment variant.
- `python "Tools/Data Store.py"` rebuilds the store incrementally (the sink runs it every 15 minutes) and answers `compare A B` (one build or time range against another at the same home), `skills`, `weapons`, `pulls`, `time`, `before-danger` and `experiment NAME`.
- **Experiments** alternate a setting's variants in 30-minute blocks of the wall clock. Each one changes behaviour, so each needs the user's go-ahead.

---

## Configuration

Each role's `<Role> Config.js` owns its own `CONFIG`. Only values that were identical in all three fighters live in `Global Config.js` (`LOOTING_DEFAULTS`, `POTION_DEFAULTS`, `EQUIPMENT_DEFAULTS`, `PANIC_ORB_SET`), spread and overridden per role, so every tuned value is visible where it is tuned. Runtime choices the user makes (farm target, boss toggles, dungeon, merchant tasks) are settings, read live through `setting(name)` from the ⚙️ window. Lint checks that every `CONFIG` key is read somewhere and every key read exists.

A dungeon's `flags` are read through `dungeon_flag()` at the decision they affect. They are contextual overrides with no `CONFIG` counterpart, so they are deliberately not merged into it.

---

## Guards

If the structure is right, code doesn't need `typeof` or existence checks. The legitimate kinds are:

- `Code Loader.js`, which runs alone in a code slot before anything else exists.
- The game's optional callbacks: `on_cm`, and `heal`, which only a priest has.
- Optional callback parameters (`on_done`, `farm_step`, `context`) and a role's optional runner hooks (`on_disabled`, `pre_move`), which are an API contract.

Anything else has a structural fix. A symbol several characters read is declared in `Global Config.js` with a default. A one-role function gets a no-op stub there that the real file overwrites. A DOM dependency waits with `when()`. A function in a file that isn't optional can't be absent, so guarding it is dead code.

---

## Testing

- `node Tests/Harness.js load|check|smoke|golden` boots the bot in Node over the game's own `runner_functions.js` and `data.js`. `load` boots every role, then again with each stage reversed; `check` replays 77 fixtures (recorded live moments and synthetic scenes) and compares every decider, emit and burst with its golden; `smoke` fires every socket event and runs every loop.
- `python Tools/Lint.py` checks cross-file global collisions, load-stage violations and every role's `CONFIG`, and runs the ratchet: a legacy-pattern count per file may go down, never up.
- Whether a change farms better is measured live, with `compare`.

---

## Known gaps

- The harness pins decisions, not play: positioning over time, pathing and server timing are only visible live.
- `Dreams Cave.js` (911 lines) and `Merchant Upgrading.js` (735) are the largest files left. They stay whole until someone works in them.

## File sizes

Not tabulated, since a table goes stale within a restructure. From git:

```bash
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  printf '%6d  %s\n' "$(git show "HEAD:$f" | wc -l)" "$f"
done | sort -rn
```

## References

- Game: [adventure.land](https://adventure.land); engine internals in [`Game API Reference.md`](Game%20API%20Reference.md)
- Reading the flight recorder: [`Diagnostics.md`](Diagnostics.md)
- Loop rates: `al_loops()` in the console; Design Notes → `Scheduler.js` explains the choices
- GitHub (backup): Aegis-940/Adventure-Lands
