# Overhaul Plan

A worklist, not a reference. It restructures the bot into a modular, standardized codebase without a rewrite: the new structure grows around the existing code one subsystem at a time, every step ships on its own, and every step is measured against the farm ledger before the next one starts.

Baseline: commit `6ad5629`, 2026-10-14. Line references are to that commit and drift as work lands; search by function name if a line has moved.

---

## Status

| Phase | Title | Behaviour change | Status |
|---|---|---|---|
| 0 | Safety net: harness, snapshots, golden decisions, ratchet lint, docs triage | none | not started |
| 1 | Kernel: modules, scheduler, events, storage, console API | none | not started |
| 2 | Telemetry on the event bus | none | not started |
| 3 | World model | small (timing) | not started |
| 4 | Encounters (the monster behaviour redesign) | small | not started |
| 5 | Deciders and actuators | per decision | not started |
| 6 | Role manifests, file hygiene, docs | none | not started |

Update this table and the step checklists in the same commit as the work.

---

## 1. Goals

When this plan is done:

1. **Every file is a module** with declared dependencies. The global namespace holds only the kernel, an explicit console API, and the game's own callbacks (`on_cm`, …).
2. **Nothing runs at load.** Load order is dependency order, so load races and the `var`/`const` eval rule disappear.
3. **Every loop, socket handler, DOM listener and `parent.*` override is owned by the kernel**: named, measured, pausable, and torn down on `pagehide`.
4. **No monster is named outside its encounter file**, except the lists that legitimately enumerate monsters (`LOCATIONS`, `ALL_BOSSES`, `EVENT_LOCATIONS`, `SURVEY_SPOTS`, dungeon definitions).
5. **Every decision has one owner that returns an intent**; only actuators talk to the server.
6. **Telemetry is subscribed, not woven in.** Behaviour code emits events; meters, ledgers and loggers listen.
7. **Decisions are testable offline** against snapshots recorded in the live game.
8. **The structure enforces itself.** Lint counts every legacy pattern and fails a push that increases any count.
9. **Each fact has one home in the docs**, and anything that can be generated from the code is generated.

## 2. Non-goals

- A rewrite. 4,300 commits of live tuning are encoded in this code; every Design Notes paragraph is an incident or a measured number.
- Changing strategy: who tanks, what is farmed, tuned thresholds. A step that changes behaviour says so, and says why.
- A build system, TypeScript, npm or ES modules. The runtime stays browser script tags plus indirect eval.
- Centralising role `CONFIG`. Each role keeps its own; encounters hold only deviations from it.
- Changing `Code Loader.js`. It is pasted into slot 1 by hand; everything here is done from `Bootstrapper.js` onward.
- Dropping the zero-comments convention. Reasoning stays in `Design Notes.md`.

---

## 3. Ground rules for every step

- **One step per push.** A regression has exactly one suspect.
- **Behaviour-neutral phases are proven neutral**, by golden decisions (Phase 0) and by the ledger, not by reading the diff.
- **Run the per-push protocol (§11) every time.** Lint, harness, push, purge and verify, then measure once the user has reloaded.
- **Never reload the characters.** Deploy and stop; the user chooses when to reload.
- **Design Notes move with the code.** When a function moves module, its paragraph moves to that module's section in the same commit.
- **Commented-out code moves verbatim.** Never delete it without asking.
- **No logical assignment operators** (`??=`, `||=`, `&&=`).
- **A phase can stop at any step boundary** and leave a consistent codebase. Nothing depends on finishing the plan.

---

## 4. Baseline (measured 2026-10-14)

| Measure | Value | Where it goes |
|---|---|---|
| JS files loaded by the bot | 80 (Core 24, Dungeons 10, Interface 16, roles 30) | Phase 1 |
| Lines | ~19,200 loaded, ~20,300 with Tools | — |
| Top-level functions | ~1,150 | Phase 1: inside modules |
| Top-level `var`/`const`/`let` | ~760 | Phase 1: inside modules |
| `setInterval` | 31 across 20 files | Phase 1: scheduler |
| `while (true)` loops | 8 (4 merchant, Bscorpion Camp, Character Messaging, Equipment Manager, Crypt Route) | Phase 1: scheduler |
| Self-rescheduling `setTimeout` loops | most of the 59 `setTimeout`s | Phase 1: scheduler |
| `parent.socket.on` | 27 in 14 files, 24 using the hand-rolled `parent.socket._name` off/on pattern | Phase 1: events |
| Socket events subscribed | `hit` ×11, `kill_credit` ×3, `game_response` ×3, `action` ×3, one each of `tracker`, `skill_timeout`, `q_data`, `limitdcreport`, `entities`, `disconnect`, `ccreport` | Phase 2: one normalised subscriber per event |
| `character.on` | 5 (`new_map` ×2, `loot` ×3 in meters + ledger) | Phase 1: events |
| `parent.*` overrides | `add_log` (Game Log), `heal` and `console.error` wraps (Error Log) | Phase 1: `wrap_parent()` |
| Direct `localStorage` | 26 calls in 7 files, 20 distinct `AL_*` keys | Phase 1: storage registry |
| `typeof` guards | 14 (4 of them Porcupine Guard) | Phase 4 removes the 4; rest stay legitimate |
| Monster-name literals outside the allowed lists | ~65 (see Appendix B) | Phase 4 |
| Override systems | 5: `MONSTER_GEAR_OVERRIDES`, `BOSS_GEAR_OVERRIDES`, `RIME_HOLD_GEAR`, dungeon `flags` (31 keys), the `*_homes`/blacklist lists | Phase 4: the four non-dungeon systems become one; dungeon flags stay (D2) |
| Hand-rolled equip bursts (`equip_plan` + `emit_equip_ops`) | 4 sites | Phase 5 |
| Raw `equip()`/`unequip()` | 3 (Merchant Gear) | Phase 5 |
| Logger loops started from Ulric's entry point | 5 of 12 | Phase 2 |
| `game_log` / `errlog_count` call sites | 255 / 51 | Phase 2 |
| Tests | none | Phase 0 |

Drift found in the docs while measuring (fixed in step 0.7):

- `Architecture.md` lists Ulric as "Party leader, tank". Myras tanks.
- `Architecture.md` says "Cooldown guards prevent rapid re-swapping". Equipment has no cooldown.
- `Architecture.md` names `CRITICAL_SCRIPTS`. The Bootstrapper uses `OPTIONAL_SCRIPTS`.
- `Architecture.md` says the only offline check is a delimiter-balance pass. `Tools/Lint.py` exists.
- `Architecture.md` is headed `CONTEXT.md`.

---

## 5. Target architecture

```
 Kernel        define/boot · scheduler · events (socket, character, internal) · storage · console API
 World model   one snapshot shared across loops: me, party, mobs, mode, active encounters, goal
 Context       role defaults → spawn encounter → hazard encounter → situation encounter
 Deciders      world → intent   (attack · wear · go · stand · skill · heal · panic · merchant task)
 Actuators     intent → server  (equipment applier · movement · skill runner · attack runner)
 Telemetry     subscribers to events: ledger · danger · survey · meters · profilers · flight recorder
 Interface     widgets and toolbar through registries
```

### Folder layout at the end

```
Code Loader.js                 unchanged
Bootstrapper.js                fetch everything, then kernel_boot(character.name)
Kernel/                        first stage: Kernel.js, Scheduler.js, Events.js, Storage.js
Core Systems/                  shared modules (some split in Phase 6)
Encounters/                    one file per encounter (Phase 4)
Dungeons/                      dungeon machinery and definitions; flags stay their own system (D2)
Interface/                     widgets, windows, toolbar
Character Managers/            role modules and role manifests
Tests/                         Node harness, fixtures, goldens; never loaded by the Bootstrapper
Tools/                         unchanged role: sink, data store, model, lint, watchdog
```

Folders aren't renamed for their own sake. Every rename is a CDN purge plus lost `git log` continuity, so only new folders are added.

---

## 6. Phase 0 — Safety net

**Goal:** make every later step checkable offline and measurable live, with no behaviour change.

### 0.1 Dependency graph

Extend `Tools/Lint.py` with `--graph`: for each file, the top-level names it defines and the other files whose names it references. Output a file-level graph, its cycles, and a leaves-first order.

- The graph gives Phase 1 its migration order, and the cycles are its known obstacles. Expect some, e.g. Movement Manager ↔ Party Cohesion ↔ Combat Utilities.
- **Exit:** the graph is committed as `Tests/dependency_graph.json` and regenerated by lint.

### 0.2 Snapshot recorder

A `snapshot` lane through `errlog_archive()`, plus a sink lane in `Tools/Error Sink.py` (`archive_lane` paths dict) writing `snapshots.jsonl` (gitignored; fixtures are promoted from it with anonymisation, per D5).

A snapshot holds everything a decider reads:

- `character`: stats, `slots`, `items`, `s`, hp/mp, position, map, `rip`, `cc`
- entities within 600: id, `mtype`, hp/max_hp, `target`, position, `s`, and the stats the formulas read
- party state from the CM state cache
- `home`, `destination`, current goal, `panicking`, `panic_external`, the active dungeon, the role `cache`
- build SHA, character, role, timestamp

Triggers:

- `al_snapshot(label)` in the console
- every Danger Log close call and death, at the episode minimum (`danger_context()` already runs there)
- one per ledger window at the farm spot, so every spawn accumulates ordinary fixtures

**Exit:** at least 3 fixtures each from bscorpion, uhills, rimedjinn, one tanked boss, one panic, one dungeon.

### 0.3 Offline harness

`Tests/Harness.js`, run with Node like `Tools/Party Model.js` (which already runs the game's `data.js` in `vm`, cached in `Tools/.cache`).

- It builds a `vm` context with `G` from `data.js` and `common_functions.js`, and a fake `parent`: a socket stub that records `emit`s and accepts `on`/`off`, a jQuery stub, and `parent.entities` from the fixture.
- It loads the bot files in Bootstrapper order: script-tag files with `runInContext`, role files with indirect eval in the context, `Interface/` skipped with stubs for `register_widget`, `add_toprightcorner_button`, `game_log`, `al_log_push`.
- Timers are captured, not run. Load-time `setInterval`s and socket subscriptions are recorded as data: this also produces the Phase 1 loop and handler inventory.
- `node Tests/Harness.js load` boots all four roles and reports any load-time throw by file.

Before Phase 1 the harness has to work around top-level side effects. Phase 1 removes them, and the harness gets simpler as it goes.

### 0.4 Golden decisions

`node Tests/Harness.js decide <fixture>` runs every decider against the fixture and writes the answers:

| Decider | Call |
|---|---|
| gear | each `EQUIPMENT_RULES[group].resolve()` |
| target | `find_best_target()` / `update_target_cache()` → target id |
| shot (Riva) | `choose_attack_option(pool)` |
| goal | `movement_goal()` → label, local kind |
| panic | `_panic_check_body()` outcome, without side effects (the socket stub absorbs them) |
| skills | each skill's wanted/ready predicate |
| merchant | `get_character_state()` |

`node Tests/Harness.js golden` records `Tests/goldens/*.json`. `node Tests/Harness.js check` compares against them and prints any differences.

These are characterization tests: they say what the code *does*, not what it should do. A behaviour-neutral step must leave every golden identical. A behaviour-changing step re-records the affected goldens in the same commit, and its message says which ones changed and why.

### 0.5 Build-tagged archives

Check that every `.jsonl` line written by the sink carries the build SHA (`_errlog_build()` exists, but `errlog_archive()` doesn't stamp it on each record). Add it to records if missing, and to `ledger`, `danger` and `survey` rows in `Data Store.py`.

### 0.6 Ledger regression check

`python "Tools/Data Store.py" compare <build_a> <build_b> [home]` reports kills/h, deaths/h, gold/h, XP/h, potions/h and close calls/h at the spot for each build, with the existing `band()`/`judge()` noise bands. The verdict is `same`, `better`, `worse` or `not enough data`.

The minimum sample follows D4: 6 windows (30 minutes) at the same home per build for behaviour-neutral steps, 12 for steps that change timing or behaviour. Below that, the verdict is `not enough data`, never `same`.

### 0.7 Ratchet lint and docs triage

`Tools/Lint.py --ratchet` counts every legacy pattern per file and compares against `Tests/lint_baseline.json`:

| Counter | Allowed in |
|---|---|
| top-level executable statements | kernel, `Code Loader.js`, `Bootstrapper.js` |
| raw `setInterval` / `while (true)` / self-rescheduling `setTimeout` | `Kernel/Scheduler.js` |
| raw `parent.socket.on/off`, `character.on`, `addEventListener` | `Kernel/Events.js` |
| `parent.X =` assignment | `Kernel/Events.js` (`wrap_parent`) |
| direct `localStorage` | `Kernel/Storage.js`, `Code Loader.js` |
| `typeof` guards | the documented legitimate kinds |
| monster-name literals (from `G.monsters` in `Tools/.cache/data.js`) | `Encounters/`, `Dungeons/* definitions`, the allow-listed lists |
| `socket.emit`, `equip(`, `unequip(`, `use_skill(`, `attack(` | actuator modules (Phase 5) |
| top-level globals | kernel, console API |

A count may go down, never up. Lowering the baseline is part of the commit that removes the pattern. Lint prints a scoreboard so progress is visible.

Docs triage: fix the drift listed in §4, and add this plan to the References in `CLAUDE.md`.

### Phase 0 checklist

- [ ] 0.1 dependency graph
- [ ] 0.2 snapshot recorder and sink lane
- [ ] 0.3 harness boots all four roles
- [ ] 0.4 goldens recorded from the fixtures
- [ ] 0.5 build SHA on every archived record
- [ ] 0.6 `Data Store.py compare`
- [ ] 0.7 ratchet lint, baseline committed, docs drift fixed

**Exit:** `node Tests/Harness.js check` passes on main, the ratchet runs in lint, and a compare of the last two builds returns a verdict.

---

## 7. Phase 1 — Kernel

**Goal:** turn every file into a module and put every loop, handler, store and override under the kernel. No behaviour change: goldens identical, ledger `same`.

### 1.1 Module registry (`Kernel/Kernel.js`, first stage)

```js
define("equipment", ["storage", "events", "valuation"], ({ storage_read }, { on_socket }, { resolve_weapon_set }) => {
	return { batch_equip, equip_plan, emit_equip_ops, is_set_equipped, set_available };
});
```

- `define(name, deps, factory)` only records the definition. Nothing runs at load.
- After every script is fetched and every role file evaluated, the Bootstrapper calls `kernel_boot(character.name)`. It runs the factories in dependency order and then starts the role's manifest.
- A missing dependency fails the boot with the module and dependency named. A cycle fails it with the cycle printed. An optional module (the Bootstrapper's `OPTIONAL_SCRIPTS`) that failed to fetch is simply absent, and modules that depend on it must declare it optional (`"?boss_profiler"`), which gives them `null`.
- **Exports are functions and objects, never reassignable primitives.** Destructuring copies a primitive at boot, so a module reading `panicking` would see `false` forever. Known reassigned primitives become accessors or fields of an owned object, in the step that migrates their owner:
  - `home`, `destination` → `farm.home()`, `farm.destination()` (the survey reassigns both)
  - `panicking`, `panic_external`, `panic_since` → `panic.active()`, … (Party Management stays the only writer)
  - `merchant_task` → `task()` / `set_task()` (10 assignments today; see 5.5)
  - `main_beat_at`, `_current_goal` (already behind `current_goal()`)
- **Back-edges use late lookup.** For a real cycle, the later module calls `use("movement").smarter_move()` inside a function body instead of declaring the dependency. Lint counts `use(` calls as a ratchet.
- **Bridge for migration:** `define(name, deps, factory, { expose: true })` also copies the exports onto `window`, so unmigrated files keep calling them by global name. Lint counts exposed modules, and Phase 6 removes the bridge.
- Role files are still evaluated with indirect eval, but they only call `define`, so `var` vs `const` stops mattering: every file's internals sit inside its factory closure. Siblings share role state through a role module (`warrior_state`) instead of `var`.
- `Merchant Task Loop.js` stops needing to load last, because `PRIORITY_CHECKS` is built inside its factory after its dependencies exist.

### 1.2 Scheduler (`Kernel/Scheduler.js`)

```js
every("equipment", { ms: TICK_RATE.equipment, kind: "automation" }, resolve_equipment);
```

- `fn` may return the next delay. Returning nothing uses `ms`. The scheduler awaits `fn` before scheduling the next run, which matches today's self-rescheduling `setTimeout` loops. A former `setInterval` loop is checked for whether it relied on overlapping runs; none should.
- It has `loop_tick`/`loop_next` (the `lag <loop>` beats), `catcher(e, name)` and `errlog_beat` built in, so loop bodies lose that boilerplate and the outer `try/catch`.
- Loop kinds decide what pause and disability do, in one place:

| Kind | Paused (⏸️) | Disabled (`is_disabled`) | Examples |
|---|---|---|---|
| `automation` | idles | idles | action, skill, equipment, main tick |
| `safety` | runs | runs where it makes sense | panic, potions, merchant upkeep |
| `telemetry` | runs | runs | ledger, danger, samplers, flight recorder |
| `ui` | runs | runs | meters, frames, graphs |

- One start per tab replaces `window.__al_runner_started`. Everything stops on `pagehide`.
- `al_loops()` in the console lists each loop with its kind, rate, last lag and last error. This replaces hand-maintaining `Loop Cadence.md`'s inventory.

### 1.3 Events (`Kernel/Events.js`)

- `on_socket(event, key, fn)`: one real listener per socket event, fanning out to subscribers by key. Re-registering a key replaces it, so the 24 hand-rolled `parent.socket._name` off/on pairs become one line each. Everything is removed on `pagehide`.
- `on_character(event, key, fn)` does the same for `character.on`.
- `on_dom(target, event, key, fn)` covers `addEventListener` (Error Log lifecycle, Widget Helpers drag, Game Log resize).
- `wrap_parent(name, wrapper)` is the only way to override a `parent.*` function, and is restored on `pagehide`. This writes the lesson of the 2026-10-01 freeze (an unrestored `add_log` wrapper blocked the game's auto-reload) into the kernel. It covers `add_log` (Game Log), and the `heal` and `console.error` wraps (Error Log).
- `emit(topic, data)` / `on(topic, key, fn)` is the internal bus. Phase 2 fills it.

### 1.4 Storage (`Kernel/Storage.js`)

- `storage_read`/`storage_write` move here from Global Config, plus `storage_raw_read`/`storage_raw_write` for the bare-string keys (pause, dungeon mode, settings), all wrapped as today.
- A key registry declares every `AL_*` key once, with its owner, kind (JSON or raw) and default. Today there are 20. An unregistered key is a lint error.

### 1.5 Console API

`console_api({ al_errors, al_errors_clear, al_boss_profiles, al_snapshot, al_loops, survey_status, survey_retry, survey_move_on, survey_reset, heal_report, chest_report, dungeon_progress_report, crypt_threat_report, ... })`: the only intentional globals. The full list is taken in 1.6 from the functions documented in `CLAUDE.md`/Design Notes and from grep.

### 1.6 Migration order

Leaves first, using the 0.1 graph. Each batch is one push with goldens identical.

1. Kernel files, first stage, with `Global Config.js` declaring nothing new. The bridge makes every module global, so nothing else changes.
2. `Global Config.js` split into `config` (constants, party, defaults), `storage`, `farm` (home/destination/farm target), and the stubs (which become optional-dependency `null`s as their owners migrate).
3. Pure leaves: Combat Formulas, Equipment Valuation, Targeting, Widget Helpers, Game Log.
4. Combat Utilities, Combat Sampling, Character Messaging, Error Handling, Error Log.
5. Equipment Manager, Party Management, Loot Management, Maintenance.
6. Movement Manager, Movement Positioning, Party Cohesion, World Events, Bscorpion Camp, Character Runner.
7. Farm Ledger, Farm Survey, Danger Log, Boss Profiler, Porcupine Guard.
8. Dungeons (10 files, two pushes).
9. Interface (16 files, two pushes).
10. Healer, then Ranger, then Warrior (one role per push). Entry points become manifests: `define("role:warrior", [...], () => ({ update_cache, farm_step, engage_step, loops, intervals }))`, and `kernel_boot` passes the manifest to `run_character`.
11. Merchant (two pushes; `Merchant Task Loop.js` loses its load-last rule).
12. Remove the Bootstrapper's reliance on network order: the parallel batch stays parallel for speed, but boots only after all of it has arrived.

The diffs are mechanical: a `define(...)` header, a `return { ... }` footer, indentation. Check with `git diff -w --stat` that each changed file's body is untouched apart from the header and footer, then review the footer exports by hand.

### Phase 1 checklist

- [ ] 1.1 kernel with bridge, boot errors named, cycles reported
- [ ] 1.2 scheduler, `al_loops()`
- [ ] 1.3 events, `wrap_parent`
- [ ] 1.4 storage registry
- [ ] 1.5 console API
- [ ] 1.6 batches 1–12

**Exit:** ratchet counters for top-level statements, raw loops, raw socket/character/DOM handlers, `parent.X =` and direct `localStorage` are all zero outside the kernel. `CLAUDE.md`'s two load mechanisms section is rewritten (the `var`/`const` rule, "nothing at load", "network-completion order" and "Merchant Task Loop loads last" all retire). `al_loops()` lists the same loops at the same rates as the Phase 0 inventory.

---

## 8. Phase 2 — Telemetry on the event bus

**Goal:** behaviour code emits events and never logs, measures or archives inline. No behaviour change.

### 2.1 Normalised game events

`Kernel/Events.js` subscribes once to each socket event and re-emits a normalised topic with the fields every current handler derives for itself:

| Topic | From | Adds |
|---|---|---|
| `hit` | socket `hit` | `mob`, `by_me`, `by_party`, `on_me`, `on_party`, `kill`, `damage_type` |
| `kill` | socket `kill_credit` + `hit.kill` | `mtype`, `credit`, `at_spot` |
| `action` | socket `action` | `skill`, `source`, `target`, in-flight id |
| `equip_reply` | socket `game_response` (`place`) | `event`, `failed`, `slots` |
| `loot` | `character.on("loot")` | gold, items |
| `map` | `character.on("new_map")` | from, to |

### 2.2 Bot events

These are emitted by the deciders and actuators that own them: `swap`, `skill_cast`, `shot`, `pull`, `panic`, `death`, `close_call`, `goal_change`, `encounter_enter`/`encounter_leave` (Phase 4), `dungeon_enter`/`dungeon_exit`.

### 2.3 Subscribers

Each of these keeps its file and moves its handlers onto topics:

- Farm Ledger (`kill`, `loot`, `death`), Danger Log (`hit`), Farm Survey, Boss Profiler (`action`, `hit`), Combat Sampling (`action`, `hit`: the in-flight ledger stays exact), Dungeon Progress (`hit`→`kill`), Dungeon Runner's kill wait (`kill`)
- Meters: DPS (`hit`), Kill Tracker (`kill`), Gold Meter/Stats Window/Metrics Graphs (`loot`, `hit`, `kill`), Lucky Slot Tracker (`q_data` raw)
- Error Log (`equip_reply`, `disconnect`, `limitdcreport`, lifecycle)
- **Role loggers leave the entry points:** `cooperative_luck_logger`, `swap_penalty_logger`, `cc_report_logger` and `sugar_rush_roll_logger` become `telemetry`-kind subscribers in Warrior Combat. `rime_shell_logger` moves with the rime encounter in Phase 4.

### 2.4 Logging levels

`log(level, msg)` with `info`, `warn`, `error`, `event` and `debug` levels, where colour and prefix come from the level. This is the same set `ERRLOG_GAMELOG_PREFIXES` already infers from emojis. `game_log(msg, color)` stays as the underlying writer. `warn` and `error` also count into the flight recorder by level, which replaces Error Log's emoji-prefix inference.

Conversion (D3): a file's `game_log` calls are converted in the commit that changes that file for a non-mechanical reason in Phases 2–6. They're never converted inside a Phase 1 batch, whose diffs must stay header and footer only. Whatever is left is swept file by file in 6.2.

### 2.5 Record context

Every archived record carries build, character, home and active encounters (home only until Phase 4).

### Phase 2 checklist

- [ ] 2.1 normalised topics
- [ ] 2.2 bot events emitted at their owners
- [ ] 2.3 subscribers moved; logger loops gone from the entry points
- [ ] 2.4 `log(level, msg)` in place; call sites converted as files are touched (D3)
- [ ] 2.5 record context

**Exit:** no socket handler outside `Kernel/Events.js`. The entry points list only behaviour loops. Ledger, danger and survey `.jsonl` output is unchanged except for the added fields, checked by diffing a window from each build.

---

## 9. Phase 3 — World model

**Goal:** every decider in a tick reads the same picture of the world, built once. Small timing change, measured.

### 3.1 The snapshot

`world()` is rebuilt lazily when older than `CACHE_TTL` (50ms, already used by `make_cache()`), and shared by every loop of the character:

- `me`: hp/mp and percentages, position, map, `s`, `rip`, `cc`, `penalty_cd`
- `party`: each member's live entity or CM state, distance, hp/mp, alive, on my map
- `mobs`: in range by kind (attack range, cleave range, aggro radius), by `mtype`, targeting me / the tank / the party
- `mode`: one value out of `disabled | paused | bailing | panicking | dreams | dungeon | travelling | event | camped | farming`. Today these are separate booleans that loops check inconsistently: Ulric's skill loop pauses on `should_pause_combat_loop()`, Myras's on `dungeon_bailing() || cave_paused()`, with a commented-out `panicking` check.
- `goal`: the current goal (from `current_goal()`)
- `encounters`: the active set (Phase 4)
- `role`: role-specific fields that `update_cache()` builds today (`cache.target`, `cache.tank_entity`, `cache.monsters_in_cleave_range`, `cache.targets.in_range`, `cache.heal_target`)

### 3.2 Hot paths stay live

These read `character`/`parent.entities` directly, and the snapshot never serves them:

- the rime deadline stomp (`rime_deadline_stomp`, `rime_stomp_watcher`)
- `luck_due()` / `luck_window()` at the scorpion kill
- `weapon_burst()` / `swing_possible()`
- the potion check
- heal target and party heal triggers

Each exception is listed in Design Notes with its reason.

### 3.3 Predicates

Each `is_/has_/should_/can_` predicate either becomes a snapshot field, becomes a function of `world`, or stays live with a reason. `update_cache()` per role is removed when its fields are in `world.role`.

### 3.4 Snapshots and fixtures

The 0.2 recorder now just serialises `world()`, so fixtures and live decisions use exactly the same structure.

### Phase 3 checklist

- [ ] 3.1 `world()` with mode
- [ ] 3.2 hot-path exceptions documented
- [ ] 3.3 predicates migrated, one file per push
- [ ] 3.4 recorder serialises `world()`

**Exit:** goldens identical (fixtures are static, so timing can't show there). Ledger compare is `same` at bscorpion and one other spawn, with close calls no worse. The skill/action/equipment loops gate on `world().mode` through their scheduler kind, not on their own booleans.

---

## 10. Phase 4 — Encounters (the monster behaviour redesign)

**Goal:** everything specific to one monster, spawn or boss lives in one file. Core and role code ask questions; active encounters answer; role defaults answer last.

This phase comes after the kernel, bus and world for a reason. The registry and optional loading come from the kernel, which removes the porcupine guards structurally. Enter and leave events and telemetry come from the bus. Activity is computed once in the snapshot.

### 4.1 Encounter files

```js
define("encounter:uhills", ["encounters"], ({ encounter }) => encounter({
	tier: "spawn",
	homes: ["sparkbot", "targetron"],
	gear: {
		priest: { loadout: "luck_exoarm", orb: "uhills_orb", gloves: "uhills_gloves", chest: "uhills_chest", amulet: "uhills_amulet" },
	},
	settings: {
		priest: { curse: false },
		all: { farm_focus: true },
	},
	allows: {
		warrior: { agitate: mob => ["sparkbot", "targetron"].includes(mob.mtype) },
	},
}));

define("encounter:porcupine", ["encounters", "combat_utilities"], ({ encounter }, { monsters_matching }) => encounter({
	tier: "hazard",
	mtypes: ["porcupine"],
	active: world => world.mobs.by_type.porcupine.length > 0,
	gear: { warrior: { weapon: world => porcupines_in_splash(world) ? "single" : null } },
	allows: { warrior: { attack: false, cleave: false, agitate: false }, ranger: { attack: false } },
	rank: { all: { porcupine: -1 } },
}));
```

- Role keys are `character.ctype` values (`warrior`, `priest`, `ranger`, `merchant`) plus `all`.
- An answer is data, or a function of `world` when it depends on the situation. There's no condition language.
- An encounter may hold its own state and define `enter(world)` / `leave(world)`. Deleting the file deletes the state, the hooks and the special cases.
- **Folder name:** `Encounters/` (D1).

### 4.2 Activity and tiers

`encounters` computes the active set once per `world()` rebuild:

| Tier | Active when | Examples |
|---|---|---|
| `situation` | its own `active(world)` | held rime Djinn or shell within 400; mrpumpkin/mrgreen/crabxx/franky in sight |
| `hazard` | its own `active(world)` | porcupines within splash range |
| `spawn` | `home` is in `homes` **and** `character.map === destination.map` (today's `gear_override` rule) | uhills, fireroamer, mummy, dryad, bscorpion, rimedjinn |

Higher tiers win. Within a tier, two active encounters answering the same question is a configuration error, reported once by `errlog_count` and resolved by file order. Activity changes emit `encounter_enter`/`encounter_leave` and call the hooks.

### 4.3 Questions

| Question | Asked by | Combine |
|---|---|---|
| `encounter_gear(group)` | each `EQUIPMENT_RULES` resolver, in place of `gear_override(group)` | highest tier wins |
| `encounter_setting(name, fallback)` | any call site with a role default | highest tier wins |
| `encounter_allows(action, mob)` | attack, cleave, agitate, taunt, skills, curse, absorb, pull | any veto wins; mob-scoped (by `mtype`), not activity-scoped |
| `encounter_rank(mob)` | `score_targets()` | adjustments add |
| `encounter_goal(world)` | `movement_goal()`, beside `event_goal()`/`dreams_goal()` | highest tier wins |
| `encounter_step(kind)` | the skill runner and `movement_local()` | one owner per tick |

`allows` and `rank` are **mob hooks**. They apply wherever the mob is met, so a porcupine at another spawn is still protected. Everything else is a **context hook** and needs the encounter to be active. This is the spawn-rule vs monster-trait split from the original discussion, kept inside one file.

New questions are added only when an encounter being migrated needs one. Expect six to eight in total.

### 4.4 Attribution

Every answer records which encounter gave it. `why("gear.orb")` and `encounters_active()` in the console answer "why did Ulric swap?" without reading code. The 📊 live feed shows each character's active encounters on the status page.

### 4.5 Defaults stay at the call site

```js
if (!target && !encounter_setting("curse", true)) return;
```

The fallback is the role's default. Encounters hold only deviations, so changing a default never touches an encounter file.

### 4.6 Lint for drift

- Every key in an encounter is a known question, and every role key is valid.
- Every `setting` name an encounter sets is read by some `encounter_setting("name"` call in that role's modules (or in shared modules for `all`).
- Every gear set name exists in that role's `equipment_sets`, parsed from the role Config.
- Monster literals outside `Encounters/` and the allow-list: ratchet to zero.

### 4.7 Measurement

Each ledger window records the active encounter set (2.5). A changed encounter shows as a before/after at its spawn in `Data Store.py compare`.

### 4.8 Migration order and inventory

One encounter per push. Sources are from the 2026-10-14 inventory (Appendix B).

1. **porcupine** (`hazard`): `Core Systems/Porcupine Guard.js` (36 lines), and its four `typeof` sites, Ranger Combat 11 and 48, Warrior Combat 74, Warrior Equipment 79. Also Warrior Config `cleave_blacklist` (porcupine) and `agitate_blockers` (porcupine). This proves the registry, `allows`, `rank` and `gear`, and deletes the four guards plus the removal-seam exception in `CLAUDE.md`.
2. **Mob traits without a spawn:** pppompom (`cleave_blacklist`, `agitate_blacklist`), redfairy (`agitate_blockers`), nerfedmummy (Ranger `never_attack`), crabx (Ranger `attack_if_targeted`), phoenix (Ranger `always_attack`), ent (`taunt_ents`). These are small `mtypes`-only encounters, or one shared `encounter:traits` file. *(Decided when step 1 is reviewed.)*
3. **Gear-only spawns:** uhills (sparkbot + targetron, which share one entry today duplicated), mummy, dryad, fireroamer, plus the settings knobs: `no_curse_homes`, `zap_pull_homes`, Ranger `skill_blacklist` (dryad, fireroamer, plantoid, mole, mummy), `FARM_FOCUS_HOMES` (Targeting 186), Healer Movement 15 (`home === "fireroamer"` skip panic), Warrior Skills 618 and `agitate_fireroamer_conditions`, the agitate list at Warrior Skills 629 (`["sparkbot", "jr", "greenjr", "bigbird", home]`). After this step `MONSTER_GEAR_OVERRIDES` is gone from the three Equipment files and Global Config.
4. **Bosses** (`situation`): mrpumpkin and mrgreen (`BOSS_GEAR_OVERRIDES`, `tank_bosses`, `cleave_lone_bosses`, `taunt_bosses`), franky and icegolem (`cleave_boss_blacklist`), crabxx (`takes_one_damage` at Combat Utilities 233, the `coop_boss_only` exception in Ranger Combat 347, the crabx agitate at Warrior Skills 620, boss gear, the kite via `orbit_away`). After this step `BOSS_GEAR_OVERRIDES` is gone. `ALL_BOSSES`, `EVENT_LOCATIONS`, `boss_strayed()` and `is_coop_boss()` stay generic.
5. **Rime Djinn** (`spawn` + `situation`): Warrior Skills 90–456 (shell windows, stomp planning, the watcher, the deadline stomp), the Combat Utilities predicates 111–184, Ranger Combat `shelled_first` (77) and shell shots (314–347), `RIME_HOLD_GEAR` (Warrior, Ranger), its gear entries (Warrior, Healer), the Warrior Skills socket handlers (164–165, 421–422), the `rime_shell_logger` and `rime_stomp_watcher` loops. Uses `step` for the stomp, `enter`/`leave` for the shell windows, and keeps the hot-path exception from 3.2. After this step `RIME_HOLD_GEAR` is gone and Warrior Skills is the warrior's skill table only.
6. **Bscorpion** (`spawn`): `Core Systems/Bscorpion Camp.js` (360 lines: camp step, Riva's rail, temporal surge, the kill logger), Myras's `fight` rule in Healer Equipment (`fight_gear_owned`, `camp_fight`/`camp_luck`, `luck_window`, `log_camp_kill`, the remembered amulet), the Healer Combat/Skills references, the Movement Manager branch at 891 (→ `encounter_goal` returning `{ local: "camp" }`), Ranger `aggro_by_home`, Warrior `bscorpion_worth_buffing`, the gear entries in three files, `PRIM_FARM_*` constants. The most tangled, so last. It may take two pushes: positioning and gear, then the fight rule and luck.
7. **Dungeons stay a separate system** (D2). `dungeon_flag()`/`dungeon_setting()` and their 38 call sites remain. The one thing this phase adds is a precedence rule, because the two systems meet at the same decisions:
   - **Inside an active dungeon, the dungeon's flags win** over every encounter answer to the same decision. Spawn-tier encounters are never active there anyway, because `home` is the dungeon's home.
   - Today the order is inconsistent: `resolve_healer_orb()` checks the dungeon orb before `gear_override()`, but `resolve_healer_loadout()` checks `gear_override()` before `dungeon_loadout()`. Step 4.8.3 makes every resolver use the same order (dungeon flag, then encounter, then role default), and re-records any golden that changes.
   - Mob hooks (`allows`, `rank`) still apply inside dungeons, so a porcupine trait holds everywhere. A dungeon flag that vetoes an action (`no_cleave`) is checked alongside `encounter_allows()`, and either can veto.

### 4.9 What stays out

- Role logic: the tank model, weapon value chooser, chest band, shot chooser, heal pipeline
- Shared machinery: `orbit_away`, the equipment planner, Combat Formulas, Targeting's scorer
- Generic rules: `must_not_touch()` (lethal monsters, derived from stats), `boss_strayed()`, the panic thresholds
- Enumerations: `LOCATIONS`, `ALL_BOSSES`, `EVENT_LOCATIONS`, `SURVEY_SPOTS`

### Phase 4 checklist

- [ ] 4.1–4.6 registry, tiers, questions, attribution, lint
- [ ] 4.8.1 porcupine
- [ ] 4.8.2 mob traits
- [ ] 4.8.3 gear-only spawns and settings knobs
- [ ] 4.8.4 bosses
- [ ] 4.8.5 rime Djinn
- [ ] 4.8.6 bscorpion
- [ ] 4.8.7 dungeon/encounter precedence applied in every resolver

**Exit:** the monster-literal ratchet is zero. `gear_override()`, `MONSTER_GEAR_OVERRIDES`, `BOSS_GEAR_OVERRIDES`, `RIME_HOLD_GEAR` and the `*_homes`/blacklist lists are gone. The `typeof` count is down by 4. Design Notes has one section per encounter, with the bscorpion camp, rime shell and uhills paragraphs moved into them.

---

## 11. Phase 5 — Deciders and actuators

**Goal:** every decision is one owner returning an intent, and only actuators reach the server. This continues `Decision Ownership.md`, extended to every decision. Behaviour changes are allowed here only where they're named, one decision per push.

### 5.1 What to wear

- Persistent rules keep their shape: one resolver per group in `EQUIPMENT_RULES`, applied by `resolve_equipment()`.
- Transient procedures get one helper:
  ```js
  equip_burst({ owner: "cleave", arm: CLEAVE_SET, between: () => use_skill("cleave"), restore: chosen_weapon_set() });
  ```
  It replaces the four hand-rolled `equip_plan` + `emit_equip_ops` pairs: Warrior Combat 196–234 (`weapon_burst`, cleave + sugar rush), Warrior Skills 524–532 (stomp), Bscorpion Camp 290–294 (temporal surge, by then in the bscorpion encounter), Party Management 124–125 (panic arm). The helper owns the claim at `skill` priority, the shadow chaining, and the "swap after the skill" penalty rule. The `EQUIP_PRIORITY` ladder is then used only inside the helper and the rules loop.
- Merchant Gear's raw `equip()`/`unequip()` (lines 23, 65, 69) go through the planner, so `best_copy()` and the sent view protect Riff too.

### 5.2 Which skill

One shared skill runner over a per-role table:

```js
var WARRIOR_SKILLS = [
	{ name: "warcry",  wanted: warcry_wanted,  cast: () => use_skill("warcry") },
	{ name: "stomp",   wanted: stomp_wanted,   cast: handle_stomp },
	{ name: "cleave",  wanted: cleave_wanted,  cast: () => weapon_burst(true, sugar_rush_wanted(), null) },
	{ name: "agitate", wanted: agitate_wanted, cast: handle_agitate },
	{ name: "taunt",   wanted: taunt_wanted,   cast: handle_taunt },
	// { name: "charge", ... },
	// { name: "hardshell", ... },
];
```

- The runner owns the mode gate (from `world().mode`, the same for every role), the cooldown check, the mp reserve (`skill_mp_cost` + `panic_mp_reserve()`), per-entry `catcher`, attribution, and await semantics. Today each role repeats these in a hand-written chain of `try/catch` blocks, gated differently.
- Encounter `step` answers are entries in the same table.
- The commented-out `charge`/`hardshell` move as commented-out entries.
- Myras's heal/curse/absorb/blessing/zap and Riva's mark/supershot use the same runner. The zap loop stays separate (it's on its own cadence for a reason; see Loop Cadence) but uses the same entry shape.

### 5.3 Where to stand

`movement_local()`'s `if (goal.local === ...)` chain becomes a registry: `local_step("camp", camp_step)`. The bscorpion encounter registers `camp` and crabxx registers `kite`, so core movement no longer names either.

### 5.4 What to attack

This is already the model (`Decision Ownership.md` §6). The three `action_loop`s get one shared runner around `run_basic_action()`. Riva keeps her 5ms cadence as a parameter (Loop Cadence §3 left it deliberately).

### 5.5 Merchant

`PRIORITY_CHECKS` and `get_character_state()` already follow the decider shape and stay. `merchant_task` (10 assignments in four files) gets one writer, `set_task()`; the watchdog keeps reading it. Its four `while (true)` loops are already scheduler loops after Phase 1.

### 5.6 Emit ratchet

`socket.emit`, `equip(`, `unequip(`, `use_skill(`, `attack(`, `heal(`, `move(`/`smart_move(` are allowed only in actuator modules: Equipment Manager, the skill runner, the attack runner, Movement Manager, the merchant executors. Ratchet to zero elsewhere.

### Phase 5 checklist

- [ ] 5.1 `equip_burst`, the 4 bursts migrated (one per push), Merchant Gear through the planner
- [ ] 5.2 skill runner: warrior, priest, ranger (one per push)
- [ ] 5.3 local-step registry
- [ ] 5.4 shared action runner
- [ ] 5.5 merchant `set_task()`
- [ ] 5.6 emit ratchet at zero

**Exit:** `Decision Ownership.md` lists every decision with one owner and no coordination left over. The emit ratchet is at zero.

---

## 12. Phase 6 — Role manifests, file hygiene, docs

### 6.1 Role manifests

A role is its config, sets, skills table, equipment rules, steps, behaviour loops and hooks, declared in one manifest. `run_character()` takes the manifest. The merchant gets a manifest too, with its own runner (`loop_controller`).

### 6.2 Standard module shape

Every module has the same section order: header, constants and `CONFIG`, state, deciders, actions, event subscriptions, exports (§13 has the full standard).

### 6.3 Splits

Each split is behaviour-neutral, one file per push:

- `Merchant Upgrading.js` (968): profiles, selection, execution, lolipop push
- `Movement Manager.js` (928): goal, travel and arbiter, local dispatch, stuck escape, town shortcut
- `Dreams Cave.js` (897): entry and voting, escorts, fighting, exit
- `Metrics Graphs.js` (803): live feed vs dashboard UI
- `Dungeon Runner.js` (779): entry, run loop, scripted travel

### 6.4 Toolbar

`add_toprightcorner_button()` already exists, but four files still hand-roll their buttons: Bank Viewer 223–252, Settings Window 181–193, Pause Button 28–40, Dungeon Mode 105–119. They move to one toolbar registry with an explicit order, so the button-to-button polling chain is no longer needed.

### 6.5 Config validation

Each role's `CONFIG` is checked by lint: every key is read somewhere (122 distinct `CONFIG.x.y` keys are read today), and every read key exists.

### 6.6 Docs

- `define` takes an `about` string (data, not a comment). `CLAUDE.md`'s file map and `Architecture.md`'s tree are generated from it by `Tools/Lint.py --docs`.
- `Architecture.md` is rewritten for the final structure.
- Design Notes is reorganised by module and encounter.
- `Loop Cadence.md`'s inventory is replaced by `al_loops()` output.
- `Decision Ownership.md` is closed out.

### 6.7 Remove the bridge

Drop `expose: true` everywhere, and set every ratchet counter to fail at zero.

### Phase 6 checklist

- [ ] 6.1 manifests
- [ ] 6.2 module shape applied
- [ ] 6.3 splits
- [ ] 6.4 toolbar registry
- [ ] 6.5 config lint
- [ ] 6.6 docs generated and rewritten
- [ ] 6.7 bridge removed

**Exit:** §1's goals all hold, each checked by a lint counter or a harness command.

---

## 13. Standards (what every module follows)

| Area | Standard |
|---|---|
| Module | `define(name, deps, factory, { about })`; a factory declares state and functions and returns exports; nothing at load |
| Exports | functions and objects only; never a reassignable primitive |
| Naming | existing: `snake_case`, `UPPER_SNAKE_CASE` constants, `_` internals; module names `snake_case`; encounters `encounter:<name>`; roles `role:<ctype>` |
| Loops | `every(name, { ms, kind }, fn)` only |
| Events | `on_socket`, `on_character`, `on_dom`, `on`/`emit`; `wrap_parent` for overrides |
| Storage | registered keys through `Kernel/Storage.js` |
| Errors | `catcher` at the boundaries the kernel owns (loop, handler, skill entry); no per-step `try/catch` in bodies |
| Guards | none, as today; legitimate kinds are an optional dependency (`"?name"` → `null`), `Code Loader.js`, the game's optional callbacks, optional callback parameters |
| Config | role `CONFIG` local; defaults at the call site for encounter settings; shared defaults only for values identical across roles |
| Monsters | named only in encounters and the allow-listed enumerations |
| Server calls | only in actuators |
| Logging | `log(level, msg)` for people, `errlog_*`/events for data |
| Comments | none; reasoning in Design Notes; commented-out code kept verbatim |
| Syntax | no `??=`/`||=`/`&&=`; optional chaining is fine (already used) |

---

## 14. Per-push protocol

1. `python Tools/Lint.py` with no new problems, and the ratchet not increased (lower the baseline in the same commit if a count dropped).
2. `node Tests/Harness.js load`: all four roles boot.
3. `node Tests/Harness.js check`: goldens identical, or re-recorded with the reason in the commit message.
4. Commit, push, then purge and verify jsDelivr as in `CLAUDE.md` (stop after one re-purge; the pinned `@sha` serves immediately).
5. Stop. The user reloads when they choose.
6. After the D4 minimum of ledger windows at the same home on the new build (6, or 12 for timing or behaviour steps): `python "Tools/Data Store.py" compare <old> <new> <home>`. Also check `errors.json` for new buckets and `danger.jsonl` for close calls.
7. Record the verdict against the step's checkbox. `worse` means revert, then push and purge, then investigate. Don't fix forward on top of a regression.

Many small pushes run into jsDelivr purge throttling (§Deploying in `CLAUDE.md`). Pace pushes so each purge succeeds, and rely on the pinned SHA when one doesn't.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| A kernel boot error stops all four characters | Boot test for all four roles in the harness before every push; boot errors name the module; optional modules never abort the boot |
| Destructured primitive goes stale (reads `false` forever) | Export rule in 1.1; lint flags exported non-function, non-object values |
| Cycles block the migration | 0.1 finds them first; `use()` late lookup for back-edges, counted by the ratchet |
| Timing shifts from the shared snapshot | Hot paths stay live (3.2); ledger compare at two spawns before Phase 3 exits |
| Goldens can't see timing or server behaviour | They're for decisions only; the ledger and Danger Log cover the live side |
| Huge mechanical diffs hide a real change | One batch per push; `git diff -w` shows only the header and footer; footer exports reviewed by hand |
| Tuned knowledge lost in moves | Design Notes paragraphs move in the same commit; commented-out code moves verbatim |
| Harness drifts from the real client | Fixtures come only from live recordings; the harness is never trusted for timing |
| Encounters conflict silently | Same-tier conflicts counted and logged; `why()` attribution |
| Plan stalls midway | Every step leaves a consistent codebase; the status table and checklists show where it stopped |
| CDN purge throttling across many pushes | Pinned `@sha`, paced pushes, verify loop every time |

---

## 16. Size

Rough count of pushes, each independently shippable:

| Phase | Pushes |
|---|---|
| 0 | 7 |
| 1 | 15–17 |
| 2 | 5–6 |
| 3 | 5–7 |
| 4 | 8–10 |
| 5 | 9–11 |
| 6 | 10–12 |
| **Total** | **~60–70** |

Phase 0 is worth doing on its own even if nothing else follows: every later change, planned or not, gets cheaper and safer.

---

## 17. Decisions (2026-10-14)

- **D1 Folder name: `Encounters/`.** It covers spawns, places and bosses, not only single monsters.
- **D2 Dungeons stay a separate system.** Dungeon flags are not folded into encounters. Inside an active dungeon its flags win over encounter answers, and the resolvers are made consistent about that order (4.8.7).
- **D3 Log levels: yes, converted gradually.** `log(level, msg)` arrives in Phase 2. Call sites are converted when their file is touched for a non-mechanical reason, never inside a Phase 1 batch, and the remainder is swept in 6.2 (see 2.4).
- **D4 The ledger gate has two tiers:**
  - *Behaviour-neutral steps* (Phases 1, 2, 6 and the mechanical parts of 4): at least 6 windows (30 min) at the same home per build, verdict from the existing `band()`/`judge()` noise bands.
  - *Steps that change timing or behaviour* (Phase 3, 4.8.5 rime, 4.8.6 bscorpion, 4.8.7, every Phase 5 step): at least 12 windows (1 hour) per build, and at two spawns where the step isn't spawn-specific.
  - In both tiers, any death at the spot on the new build is read in `danger.jsonl` before a verdict is given. `worse` on kills/h or deaths/h beyond the band means revert, then investigate.
  - While the farm survey is running, `home` changes every hour, so compare per spot. Don't start a measured step in the last 30 minutes of a survey visit.
- **D5 `Tests/` is committed; raw snapshots are not.**
  - The repo is public (jsDelivr serves it), so `snapshots.jsonl` stays machine-local and gitignored like the other archives.
  - `node Tests/Harness.js promote <id>` copies a chosen snapshot into `Tests/fixtures/`. On the way it replaces every non-party player name with a stable hash, drops chat and trade data, and keeps only the fields deciders read.
  - The harness, goldens and promoted fixtures are committed. Fixtures are capped at about 60, and each one carries a label saying what it's for.

---

## Appendix A — Kernel API summary

| Call | Module | Purpose |
|---|---|---|
| `define(name, deps, factory, opts)` | Kernel | register a module; `opts.expose`, `opts.about` |
| `kernel_boot(character_name)` | Kernel | run factories in order, start the role manifest |
| `use(name)` | Kernel | late lookup for a back-edge |
| `every(name, { ms, kind }, fn)` | Scheduler | the only loop primitive |
| `al_loops()` | Scheduler | loop inventory in the console |
| `on_socket(event, key, fn)` | Events | socket fan-out, replace-by-key, torn down on `pagehide` |
| `on_character(event, key, fn)` | Events | `character.on` fan-out |
| `on_dom(target, event, key, fn)` | Events | DOM listeners |
| `wrap_parent(name, wrapper)` | Events | the only `parent.*` override, restored on `pagehide` |
| `emit(topic, data)` / `on(topic, key, fn)` | Events | internal bus |
| `storage_read/write`, `storage_raw_read/write`, `storage_key(name)` | Storage | registered keys only |
| `console_api({...})` | Kernel | the intentional globals |

## Appendix B — Monster-name inventory (2026-10-14)

Counted with `G.monsters` names from `Tools/.cache/data.js` against string literals and object keys, outside comments. `"target"` (a monster type that is also a common word) is excluded by hand.

| Monster | Files outside the allow-listed lists |
|---|---|
| bscorpion | Bscorpion Camp, Movement Manager, Healer Equipment, Ranger Config, Ranger Equipment, Warrior Equipment |
| sparkbot | Healer Config, Healer Equipment, Targeting, Warrior Skills |
| fireroamer | Healer Equipment, Healer Movement, Ranger Config, Warrior Skills |
| mrpumpkin, mrgreen | Healer Config, Ranger Equipment, Warrior Config, Warrior Equipment |
| mummy | Healer Config, Healer Equipment, Ranger Config, Warrior Config |
| crabxx | Healer Config, Ranger Equipment, Warrior Equipment |
| targetron | Healer Config, Healer Equipment, Targeting |
| dryad | Healer Equipment, Ranger Config |
| rimedjinn | Healer Equipment, Warrior Equipment (plus the rime code that matches by ability, not by name) |
| plantoid, mole | Ranger Config |
| pppompom | Warrior Config |
| porcupine | Porcupine Guard, Warrior Config |
| crabx | Ranger Config, Warrior Skills |
| franky, icegolem | Warrior Config |
| jr, greenjr, bigbird | Warrior Skills (agitate list, line 629) |
| ent | Warrior Skills |
| redfairy | Warrior Config |
| phoenix, nerfedmummy | Ranger Config |
| fieldgen0 | Loot Management (an object, not a fight; decide in 4.8.2) |

Allow-listed, staying where they are: Global Config (`LOCATIONS`, `ALL_BOSSES`, `EVENT_LOCATIONS`), Farm Survey (`SURVEY_SPOTS`), dungeon definitions and routes (Crypt Dungeon, Crypt Route, Spider Dungeon, Dreams Cave, Dungeon Mode).

## Appendix C — Dungeon flags by the encounter question they meet (for 4.8.7)

Dungeon flags stay their own system (D2). This table shows where a flag and an encounter answer can reach the same decision, which is where 4.8.7's precedence applies.

| Flag | Meets |
|---|---|
| `no_cleave`, `no_agitate`, `no_attack` | `allows` |
| `single_target`, `aggroed_only`, `nearest_first`, `target_lowest_hp`, `defensive_targeting`, `follow_focus` | `setting` (targeting/shot choice) |
| `orb`, `attack_loadout`, `heal_loadout`, `single_weapon` | `gear` |
| `engage_radius`, `melee_engage_radius`, `ranged_engage_radius`, `cohesion_range`, `cohesion_regroup`, `aggro_cap`, `aggro_cap_fixed` | `setting` |
| `center_on_tank`, `stack_on_center`, `circle_on_self` | `setting` (positioning) |
| `leader_manual`, `ignore_events`, `ignore_travel_panic`, `fight_while_moving`, `combat_always_on`, `skip_panic`, `absorb_nearby`, `party_only` | `setting` (mode and behaviour switches) |
