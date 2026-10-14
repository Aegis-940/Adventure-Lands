# Overhaul Plan

A worklist, not a reference. It restructures the bot into a standardized, better-owned codebase without a rewrite: the new structure grows around the existing code one subsystem at a time, every step ships on its own, and every step is checked offline against recorded decisions before it ships and against the farm ledger after it is live.

Baseline: commit `6ad5629`, 2026-10-14. Line references are to that commit and drift as work lands; search by function name if a line has moved.

Reviewed 2026-10-14 before execution. The review's changes are folded in and listed in §17 (D6–D9). A second review the same evening added D10–D12 (staging branch, rare fixtures, deterministic goldens).

---

## Status

| Phase | Title | Behaviour change | Status |
|---|---|---|---|
| 0 | Safety net: harness, snapshots, golden decisions, ratchet lint, docs triage | none | **done** 2026-10-15 (live on `main`) |
| 1 | Boot kernel: boot phase, scheduler, events, storage, console API | none | **1.1–1.7 live** 2026-10-15. `compare` at bscorpion against Oct 12–14: **same** (6 full windows; kills, XP, potions within 1.5%, no deaths or close calls). 1.2b (combat loops) not started |
| 2 | Encounters (the monster behaviour redesign) | small, per encounter | **registry, porcupine and monster rules live** 2026-10-15 (2.1–2.6, 2.8.1, 2.8.2); 2.8.3 onward not started |
| 3 | Deciders and actuators | per decision | not started |
| 4 | Telemetry on the event bus | none | not started |
| 5 | World model (optional) | small (timing) | not started |
| 6 | File hygiene and docs (trimmed) | none | not started |

Phases 0–3 are the plan. Phases 4–6 are worth doing only if 0–3 leave an appetite for them; nothing in 0–3 depends on them.

Update this table and the step checklists in the same commit as the work.

---

## 1. Goals

When this plan is done:

1. **Nothing runs at load.** Every file's top level is declarations plus registrations; work starts in one boot phase after every script has arrived, so load races and the "network-completion order" rule disappear.
2. **Every loop, socket handler, DOM listener and `parent.*` override is owned by the kernel**: named, measured, pausable by kind, and torn down on `pagehide`.
3. **No monster is named outside its encounter file**, except the lists that legitimately enumerate monsters (`LOCATIONS`, `ALL_BOSSES`, `EVENT_LOCATIONS`, `SURVEY_SPOTS`, dungeon definitions).
4. **Every decision has one owner that returns an intent**; only actuators talk to the server.
5. **Decisions are testable offline** against snapshots recorded in the live game.
6. **The structure enforces itself.** Lint counts every legacy pattern and fails a push that increases any count.
7. **Telemetry is subscribed, not woven in** (Phase 4, optional).
8. **Each fact has one home in the docs.**

"Every file is a module with declared dependencies" was a goal in the first draft. It is now a deferred option (Appendix D): it cost 15–17 pushes of mechanical wrapping, a bridge that had to be removed again, and an unplanned dependency inversion (Core reads role `CONFIG`), for a benefit the boot phase and lint deliver on their own.

## 2. Non-goals

- A rewrite. 4,300 commits of live tuning are encoded in this code; every Design Notes paragraph is an incident or a measured number.
- Changing strategy: who tanks, what is farmed, tuned thresholds. A step that changes behaviour says so, and says why.
- A build system, TypeScript, npm or ES modules. The runtime stays browser script tags plus indirect eval.
- Centralising role `CONFIG`. Each role keeps its own; encounters hold only deviations from it.
- Changing `Code Loader.js`. It is pasted into slot 1 by hand; everything here is done from `Bootstrapper.js` onward.
- Dropping the zero-comments convention. Reasoning stays in `Design Notes.md`.
- **Moving the party to test.** No step sends the characters to another spawn, starts the survey, or changes the current farm to produce measurements. Measurement comes from wherever they already are (D6).
- **Making the bot farm better.** Every phase here is behaviour-neutral or nearly so. The payoff is that improvements afterwards are cheap to make and possible to measure; this plan does not contain them.

---

## 3. Ground rules for every step

- **The characters keep running.** The bot is live for the whole plan. The unit of live measurement is a reload, not a push (D6).
- **`main` is live within hours.** The bot reloads itself at x:55 whenever `(hour + 1) % 4 === 0` (`Maintenance.js` `in_reset_window`: 3:55, 7:55, 11:55, 15:55, 19:55, 23:55), and the watchdog reloads silent windows. Whatever is on `main` then runs whether or not anyone is watching (D10).
- **Stage on `overhaul`, merge while watched.** Any change to a file the bot loads goes to the `overhaul` branch. It reaches `main` only when the user is present to watch the next reload. The exceptions, which may go straight to `main`, are files the bot never loads (`Tools/`, `Tests/`, `.md`) and changes that only add telemetry and cannot throw into their callers (0.2, 0.5).
- **Don't touch the current farm's behaviour.** While a spawn is the farm (bscorpion at desertland as of 2026-10-15; mummies at spookytown until then), the only step allowed to touch its code paths is a pure move with identical goldens recorded from live fixtures at that spawn. Anything that changes behaviour at the current farm waits until the farm moves, or ships only with the user's explicit go-ahead.
- **One step per push.** A regression has exactly one suspect.
- **Behaviour-neutral steps are proven neutral offline** by golden decisions (Phase 0) before the push, and watched live afterwards; the ledger confirms per reload or per phase, not per push (D4).
- **Run the per-push protocol (§14) every time.** Lint, harness, push, purge and verify. Then stop.
- **Never reload the characters.** Deploy and stop; the user chooses when to reload.
- **Design Notes move with the code.** When a function moves file, its paragraph moves to that file's section in the same commit.
- **Commented-out code moves verbatim.** Never delete it without asking.
- **No logical assignment operators** (`??=`, `||=`, `&&=`).
- **A phase can stop at any step boundary** and leave a consistent codebase. Nothing depends on finishing the plan.

---

## 4. Baseline (measured 2026-10-14)

| Measure | Value | Where it goes |
|---|---|---|
| JS files loaded by the bot | 80 (Core 24, Dungeons 10, Interface 16, roles 30) | — |
| Lines | ~19,200 loaded, ~20,300 with Tools | — |
| Top-level functions | ~1,150 | stay global; lint owns collisions |
| Top-level `var`/`const`/`let` | ~760 | stay; lint owns collisions |
| Top-level executable statements (calls, `setInterval`, `socket.on`, DOM work at load) | counted by 0.7 | Phase 1: inside boot steps |
| `setInterval` | 31 across 20 files | Phase 1: scheduler |
| `while (true)` loops | 8 (4 merchant, Bscorpion Camp, Character Messaging, Equipment Manager, Crypt Route) | Phase 1: scheduler |
| Self-rescheduling `setTimeout` loops | most of the 59 `setTimeout`s | Phase 1: scheduler |
| `parent.socket.on` | 27 in 14 files, 24 using the hand-rolled `parent.socket._name` off/on pattern | Phase 1: events |
| Socket events subscribed | `hit` ×11, `kill_credit` ×3, `game_response` ×3, `action` ×3, one each of `tracker`, `skill_timeout`, `q_data`, `limitdcreport`, `entities`, `disconnect`, `ccreport` | Phase 4: one normalised subscriber per event |
| `character.on` | 5 (`new_map` ×2, `loot` ×3 in meters + ledger) | Phase 1: events |
| `parent.*` overrides | `add_log` (Game Log), `heal` and `console.error` wraps (Error Log) | Phase 1: `wrap_parent()` |
| Direct `localStorage` | 31 calls in 8 files (plus Code Loader), 20 distinct `AL_*` keys | Phase 1: storage registry |
| Game runner functions the bot calls | ~45 distinct (`distance`, `is_in_range`, `can_use`, `is_on_cooldown`, `get_player`, `get_nearest_monster`, `quantity`, `can_move`, `use_skill`, `attack`, `heal`, `move`, …) plus `parent.entities` (116 sites), `parent.pings`, `parent.next_skill` | Phase 0: the harness loads `runner_functions.js` |
| `typeof` guards | 14 (4 of them Porcupine Guard) | Phase 2 removes the 4; rest stay legitimate |
| Monster-name literals outside the allowed lists | ~65 (see Appendix B) | Phase 2 |
| Override systems | 5: `MONSTER_GEAR_OVERRIDES`, `BOSS_GEAR_OVERRIDES`, `RIME_HOLD_GEAR`, dungeon `flags` (31 keys), the `*_homes`/blacklist lists | Phase 2: the four non-dungeon systems become one; dungeon flags stay (D2) |
| Hand-rolled equip bursts (`equip_plan` + `emit_equip_ops`) | 4 sites | Phase 3 |
| Raw `equip()`/`unequip()` | 3 (Merchant Gear) | Phase 3 |
| Logger loops started from Ulric's entry point | 5 of 12 | Phase 4 |
| `game_log` / `errlog_count` call sites | 255 / 51 | Phase 4 |
| Core files reading role-owned globals (`CONFIG`, `cache`, `state`, `EQUIPMENT_RULES`, `ITEMS_TO_KEEP`) | 16 of 24, plus Dungeon Runner | stays as is: globals with neutral defaults in `Global Config.js` (this is why modules are deferred, Appendix D) |
| Tests | none | Phase 0 |

Counts in this table are for orientation. The ratchet baseline (0.7) is generated by lint, never copied from here.

Drift found in the docs while measuring (fixed in step 0.7):

- `Architecture.md` lists Ulric as "Party leader, tank". Myras tanks.
- `Architecture.md` says "Cooldown guards prevent rapid re-swapping". Equipment has no cooldown.
- `Architecture.md` names `CRITICAL_SCRIPTS`. The Bootstrapper uses `OPTIONAL_SCRIPTS`.
- `Architecture.md` says the only offline check is a delimiter-balance pass. `Tools/Lint.py` exists.
- `Architecture.md` is headed `CONTEXT.md`.

---

## 5. Target architecture

```
 Kernel        boot phase · scheduler · events (socket, character, DOM, internal) · storage · console API
 Context       role defaults → spawn encounter → hazard encounter → situation encounter
 Deciders      context → intent   (attack · wear · go · stand · skill · heal · panic · merchant task)
 Actuators     intent → server  (equipment applier · movement · skill runner · attack runner)
 Telemetry     subscribers to events: ledger · danger · survey · meters · profilers · flight recorder   (Phase 4)
 World model   one lazily built snapshot shared across loops                                             (Phase 5, optional)
 Interface     widgets and toolbar through registries
```

### Folder layout at the end

```
Code Loader.js                 unchanged
Bootstrapper.js                fetch everything, eval the role files, then kernel_boot(script_list)
Kernel/                        first stage: Kernel.js, Scheduler.js, Events.js, Storage.js
Core Systems/                  shared files (a few split in Phase 6)
Encounters/                    one file per encounter (Phase 2)
Dungeons/                      dungeon machinery and definitions; flags stay their own system (D2)
Interface/                     widgets, windows, toolbar
Character Managers/            role files; the entry point becomes the role's boot step
Tests/                         Node harness, fixtures, goldens; never loaded by the Bootstrapper
Tools/                         unchanged role: sink, data store, model, lint, watchdog
```

Folders aren't renamed for their own sake. Every rename is a CDN purge plus lost `git log` continuity, so only new folders are added.

---

## 6. Phase 0 — Safety net

**Goal:** make every later step checkable offline and measurable live, with no behaviour change. Worth doing on its own even if nothing else follows.

### 0.1 Dependency graph

Extend `Tools/Lint.py` with `--graph`: for each file, the top-level names it defines and the other files whose names it references. Output a file-level graph, its cycles, and which references are *load-time* (reached from a top-level statement) versus *call-time* (only from inside a function body).

- The load-time references are Phase 1's worklist: every one of them moves into a boot step.
- **Exit:** the graph is committed as `Tests/dependency_graph.json` and regenerated by lint.

### 0.2 Snapshot recorder

A `snapshot` lane through `errlog_archive()`, plus a sink lane in `Tools/Error Sink.py` (`ARCHIVES` paths dict) writing `snapshots.jsonl` (already gitignored; fixtures are promoted from it with anonymisation, per D5).

A snapshot holds everything a decider reads:

- `character`: stats, `slots`, `items`, `s`, hp/mp, position, map, `rip`, `cc`
- entities within 600: id, `mtype`, hp/max_hp, `target`, position, `s`, and the stats the formulas read
- party state from the CM state cache
- `home`, `destination`, current goal, `panicking`, `panic_external`, the active dungeon, the role `cache`
- build SHA, character, role, timestamp
- **the clock the deciders read:** `Date.now()`, `performance.now()`, `parent.next_skill`, `character.s` timers, `parent.pings`
- **the stored values the deciders read:** the set profiles (`AL_set_profile2_<name>`, which drive the weapon chooser), farm focus (`AL_farm_focus`), the farm target

The recorder lives inside Error Log as `errlog_snapshot(label)`, with a no-op stub in Global Config like the other `errlog_*`. Its body is wrapped the way `errlog_archive()` is, so a bug in it can only lose a snapshot, never throw into the code that called it.

Triggers:

- `al_snapshot(label)` in the console
- every Danger Log close call (when the episode opens) and death
- one per ledger window at the farm spot, so the current spawn accumulates ordinary fixtures without anyone doing anything
- panic start (`set_panic(true)`)
- coop boss engage (first hit on a boss in `ALL_BOSSES`) and every 60s while on it, so each boss fight leaves fixtures

Fixtures come from wherever the party is. The current farm and whichever bosses and panics happen are enough to start; other spawns accumulate when the farm moves (D6).

**Exit:** at least 3 ordinary fixtures from the current farm and the recorder armed for panics, close calls and bosses. A panic or close-call fixture is not an exit condition, because those are rare. It's required before 3.2 (the skill runner), the only step whose golden needs one (D11). Fixtures from other spawns are not an exit condition either; the steps that need them wait for them (2.8).

### 0.3 Offline harness

`Tests/Harness.js`, run with Node like `Tools/Party Model.js` (which already runs the game's `data.js` in `vm`, cached in `Tools/.cache`). This is the largest Phase 0 item: three or four pushes, not one.

- It builds a `vm` context with `G` from `data.js`, `common_functions.js`, and **the game's `runner_functions.js`** (same source as the memory note: raw.githubusercontent, cached like `data.js`). The deciders call about 45 runner functions, and the target, shot and skill goldens depend on their exact semantics (`distance`, `is_in_range`, `can_use`, `is_on_cooldown`, …). Stubbing them would make the goldens test the stubs.
- `runner_functions.js` reads `parent.character`, `parent.entities`, `parent.G`, `parent.S`, `parent.socket`, `parent.smart`, `parent.pings`, `parent.next_skill` and friends, so the fake `parent` is built from the fixture: a socket stub that records `emit`s and accepts `on`/`off`, a jQuery stub, `entities` and `character` from the fixture, `S` and `pings` from the fixture or defaults.
- It loads the bot files in Bootstrapper order: script-tag files with `runInContext`, role files with indirect eval in the context, `Interface/` skipped with stubs for `register_widget`, `add_toprightcorner_button`, `game_log`, `al_log_push`.
- Timers are captured, not run. Load-time `setInterval`s and socket subscriptions are recorded as data: this also produces the Phase 1 loop and handler inventory, with each loop's kind (1.2) decided from what it does today.
- **Deterministic per fixture.** Each fixture runs in a fresh context (deciders hold latches such as `_mana_chest_engaged` and the per-scorpion luck latch). `Date.now()` and `performance.now()` are frozen to the fixture's clock, `localStorage` is seeded from the fixture's stored values, and `Math.random` is seeded. A decider that reads anything else from outside shows up as a golden that differs between two runs of the same fixture, which `check` tests by running every fixture twice.
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
| skills | each skill's wanted/ready predicate, **including Myras's party heal under a panic fixture** (she heals while panicking by design; see 3.2) |
| merchant | `get_character_state()` |

`node Tests/Harness.js golden` records `Tests/goldens/*.json`. `node Tests/Harness.js check` compares against them and prints any differences.

These are characterization tests: they say what the code *does*, not what it should do. A behaviour-neutral step must leave every golden identical. A behaviour-changing step re-records the affected goldens in the same commit, and its message says which ones changed and why.

**Synthetic fixtures.** A mob-trait step (porcupine, pppompom, …) may have no live fixture containing that mob. For those, a promoted fixture may be copied and edited to add the mob, saved under `Tests/fixtures/synthetic/` with a label saying what was added. Synthetic fixtures prove code paths that are pure functions of the entity list; they are never used for timing or ledger claims.

### 0.5 Build-tagged archives

`errlog_archive()` (`Error Log.js:196`) does not stamp the build on each record although `_errlog_build()` exists. Add `build` to every archived record, and carry it into the `ledger`, `danger` and `survey` rows in `Data Store.py`.

### 0.6 Ledger regression check

`python "Tools/Data Store.py" compare <A> <B> [--home H] [--tier neutral|behaviour]` takes two builds (7-char SHA) or two local-time ranges (`2026-10-14T18:00..2026-10-14T21:40`, for windows recorded before 0.5 stamped builds). It reports per-hour kills, XP, gold and MP potions from full 5-minute windows at the spot, plus deaths and close calls, for each build. A metric is `same` unless its change exceeds both 2 standard errors of the difference (from each build's own window-to-window variance) and 2%. (The first draft named `band()`/`judge()`, but those rank farm spots against each other and aren't noise bands.) The verdict is `same`, `better`, `worse`, `not enough data`, or "read danger.jsonl" when B has a death. Measured at mummies on 10-14: 15 windows per side resolve kills/h to ±1.8%.

Without `home` it uses the home the party was at during each build's windows and refuses to compare across different homes. The minimum sample follows D4. Below it, the verdict is `not enough data`, never `same`.

### 0.7 Ratchet lint and docs triage

`Tools/Lint.py --ratchet` counts every legacy pattern per file and compares against `Tests/lint_baseline.json`:

| Counter | Allowed in |
|---|---|
| top-level executable statements (anything at file top level that is not a declaration or a kernel registration call) | `Kernel/`, `Code Loader.js`, `Bootstrapper.js` |
| top-level initializers that call a bot function (`var destination = home_destination(home)`): they run at load just as a statement does. Literals, `new Set/Map`, spreads of constants and game data reads (`G.*`) don't count | `Kernel/`, `Global Config.js` constants |
| raw `setInterval` / `while (true)` / self-rescheduling `setTimeout` | `Kernel/Scheduler.js` |
| raw `parent.socket.on/off`, `character.on`, `addEventListener` | `Kernel/Events.js` |
| `parent.X =` assignment | `Kernel/Events.js` (`wrap_parent`) |
| direct `localStorage` | `Kernel/Storage.js`, `Code Loader.js` |
| `typeof` guards | the documented legitimate kinds |
| monster-name literals (from `G.monsters` in `Tools/.cache/data.js`) | `Encounters/`, `Dungeons/* definitions`, the allow-listed lists |
| `socket.emit`, `equip(`, `unequip(`, `use_skill(`, `attack(` | actuator files (Phase 3) |

A count may go down, never up. Lowering the baseline is part of the commit that removes the pattern. Lint prints a scoreboard so progress is visible. The baseline is generated by lint on the baseline commit, not typed from §4.

Docs triage: fix the drift listed in §4, and add this plan to the References in `CLAUDE.md`.

### Phase 0 checklist

- [x] 0.1 dependency graph with load-time vs call-time edges (transitive through functions and load-time callbacks)
- [x] 0.2 snapshot recorder and sink lane, all five triggers (live at the next reload; fixtures accumulate from then)
- [x] 0.3 harness boots all four roles over `runner_functions.js` (one push: the game's `common_functions.js` supplies `parent.distance`/`is_disabled`, the other game-client functions are recording stubs)
- [x] 0.4 goldens recorded from the current farm's fixtures, Myras panic-heal golden included (15 live fixtures: farm, panic, mrpumpkin, mrgreen; plus 10 synthetic)
- [x] 0.5 build SHA on every archived record, and a `build` column in `ledger`/`danger`/`survey`
- [x] 0.6 `Data Store.py compare`
- [x] 0.7 ratchet lint, baseline committed, docs drift fixed

**Exit:** `node Tests/Harness.js check` passes on main, the ratchet runs in lint, and a compare of the last two builds at the current home returns a verdict.

---

## 7. Phase 1 — Boot kernel

**Goal:** nothing runs at load, and every loop, handler, store and override is owned by the kernel. No behaviour change: goldens identical, ledger `same` at the current home once reloaded.

This is the first draft's Phase 1 with the module registry taken out (D7). Files stay classic scripts with global functions; the `var`/`const` eval rule for role files stays (lint already catches collisions). What changes is *when* things run.

### 1.1 Boot phase (`Kernel/Kernel.js`, first stage)

```js
on_boot("Equipment Manager", () => {
	every("equipment", { ms: TICK_RATE.equipment, kind: "combat" }, equipment_manager_loop);
	on_socket("game_response", "equipment", on_equip_reply);
});
```

- `on_boot(file, fn)` records a boot step under the file's base name. Nothing runs at load; a file's top level is declarations and registrations only.
- The Bootstrapper fetches the first stage, fetches the parallel batch, evaluates the role files, and then calls `kernel_boot(script_list)` once. Boot steps run **in Bootstrapper list order**, which is deterministic, instead of network order. A step registered under a name not in the list is a boot error; a listed file with no step is fine.
- A step may declare `needs: ["Combat Sampling"]`. A missing need fails the boot naming both files, unless the needed file is in `OPTIONAL_SCRIPTS`, in which case the step is skipped and the skip is logged once. This replaces the `typeof` removal seam for optional files.
- A throwing boot step is caught, named, and does not stop the other steps; the character then runs with that subsystem missing and the error in `al_errors()`. A throwing *role* boot step (the entry point) is fatal and says so in the game log.
- The role entry point becomes its boot step: `on_boot("Warrior", () => run_character({ ... }))`. `Merchant Task Loop.js` keeps its `PRIORITY_CHECKS` initializer but moves it into its boot step, so it no longer has to load last.
- One boot per tab replaces `window.__al_runner_started`.

### 1.2 Scheduler (`Kernel/Scheduler.js`)

```js
every("equipment", { ms: TICK_RATE.equipment, kind: "combat" }, resolve_equipment);
```

- `fn` may return the next delay. Returning nothing uses `ms`. The scheduler awaits `fn` before scheduling the next run, which matches today's self-rescheduling `setTimeout` loops. Each former `setInterval` loop is checked in the 0.3 inventory for whether its body awaits (its cadence would then stretch by the await); any that does keeps a `fixed: true` option that preserves `setInterval` timing.
- It has `loop_tick`/`loop_next` (the `lag <loop>` beats), `catcher(e, name)` and `errlog_beat` built in, so loop bodies lose that boilerplate and the outer `try/catch`.
- Loop kinds decide what pause and death do, in one place. **The kinds encode what each loop does today**, as inventoried in 0.3; moving a loop to a different kind is a behaviour change and is its own push.

| Kind | Paused (⏸️) | Dead / disabled | Examples |
|---|---|---|---|
| `automation` | idles | idles | main tick (movement, travel, farming), dungeon watchers |
| `combat` | **runs** | idles | action, skill, zap, equipment. The Pause Button leaves combat running today, and these loops never read `automation_enabled()` |
| `safety` | runs | as today | panic, potions, merchant upkeep |
| `telemetry` | runs | runs | ledger, danger, samplers, flight recorder |
| `ui` | runs | runs | meters, frames, graphs |

- Everything stops on `pagehide`.
- `al_loops()` in the console lists each loop with its kind, rate, last lag and last error. This replaces hand-maintaining `Loop Cadence.md`'s inventory.

### 1.3 Events (`Kernel/Events.js`)

- `on_socket(event, key, fn)`: one real listener per socket event, fanning out to subscribers by key. Re-registering a key replaces it, so the 24 hand-rolled `parent.socket._name` off/on pairs become one line each.
- **Leftovers are cleared at boot, not only on `pagehide`.** `parent.socket` outlives the code iframe, and the iframe can die without `pagehide` firing (the 2026-10-01 freeze removed it on a disconnect). Today each file stores its handler on `parent.socket` and calls `off` on the previous one at load for exactly this reason. The kernel keeps its real listeners in `parent.__al_listeners` and removes any it finds there before registering. `wrap_parent` likewise restores the original saved in `parent.__al_wrapped` before wrapping again. `pagehide` teardown stays as a courtesy.
- **Each subscriber runs inside its own `catcher`**, so one throwing subscriber cannot starve the rest (today a throw in one `socket.on` handler skips the later handlers for that event).
- **Subscribers run in registration order**, which is boot order, which is Bootstrapper list order. Combat Sampling's in-flight ledger therefore updates before anything that reads `remaining_hp()` in the same event, as today.
- `on_character(event, key, fn)` does the same for `character.on`.
- `on_dom(target, event, key, fn)` covers `addEventListener` (Error Log lifecycle, Widget Helpers drag, Game Log resize).
- `wrap_parent(name, wrapper)` is the only way to override a `parent.*` function, and is restored on `pagehide`. This writes the lesson of the 2026-10-01 freeze (an unrestored `add_log` wrapper blocked the game's auto-reload) into the kernel. It covers `add_log` (Game Log), and the `heal` and `console.error` wraps (Error Log).
- `emit(topic, data)` / `on(topic, key, fn)` is the internal bus. Phase 2 uses it for `encounter_enter`/`leave`; Phase 4 fills it.

### 1.4 Storage (`Kernel/Storage.js`)

- `storage_read`/`storage_write` move here from Global Config, plus `storage_raw_read`/`storage_raw_write` for the bare-string keys (pause, dungeon mode, settings), all wrapped as today.
- A key registry declares every `AL_*` key once, with its owner, kind (JSON or raw) and default. Today there are 20. An unregistered key is a lint error.

### 1.5 Console API

`console_api({ al_errors, al_errors_clear, al_boss_profiles, al_snapshot, al_loops, survey_status, survey_retry, survey_move_on, survey_reset, heal_report, chest_report, dungeon_progress_report, crypt_threat_report, ... })`: the intentional console entry points, listed in one place and documented from it. The full list is taken from the functions documented in `CLAUDE.md`/Design Notes and from grep.

### 1.6 Migration order

Each push moves one group's load-time work into boot steps and its loops and handlers onto the kernel, with goldens identical and `node Tests/Harness.js load` clean. The diffs are small: a top-level statement becomes a line inside `on_boot`, a `setInterval` becomes an `every`, a `socket.on` pair becomes an `on_socket`.

1. Kernel files in the first stage; Bootstrapper calls `kernel_boot(script_list)` after the role files. No file changes yet: with no boot steps registered, nothing happens.
2. Core Systems (24 files, two pushes: the 0.1 graph says which half has the load-time edges).
3. Dungeons (10 files, one push).
4. Interface (16 files, one push; the toprightcorner button chain becomes boot steps in list order and loses its polling).
5. Healer, Ranger, Warrior entry points and their loggers (one push).
6. Merchant (one push; `Merchant Task Loop.js` loses its load-last rule).

Six to seven pushes. The first reload after any of them is the live test for all of them.

### Phase 1 checklist

- [x] 1.1 boot phase, named boot errors, `needs` (on `overhaul`)
- [x] 1.2a scheduler for every `setInterval` loop, `fixed` timing, `al_loops()` (on `overhaul`, D13)
- [ ] 1.2b the self-rescheduling `setTimeout` loops (41) and `while (true)` loops (8), the combat loops among them: a timing change, measured per D4
- [x] 1.3 events with a per-subscriber catcher, legacy-keyed slots, `wrap_parent`, `off_socket` (on `overhaul`)
- [x] 1.4 storage registry (on `overhaul`)
- [x] 1.5 console API (on `overhaul`)
- [x] 1.6 Core, Dungeons, Interface, roles (on `overhaul`): every Phase 1 ratchet counter at zero outside `Kernel/` except one deliberate call initializer (the merchant's `CONFIG`)
- [x] 1.7 `Kernel/` loads as its own awaited stage (D16); lint checks stage order and `load` boots each stage reversed (on `overhaul`)

**Exit:** ratchet counters for top-level statements, raw loops, raw socket/character/DOM handlers, `parent.X =` and direct `localStorage` are all zero outside `Kernel/`. `CLAUDE.md`'s two-load-mechanisms section is rewritten: "nothing at load", "network-completion order" and "Merchant Task Loop loads last" retire; the `var`/`const` eval rule stays. `al_loops()` lists the same loops at the same rates as the Phase 0 inventory. Pause still leaves combat running (checked by the `combat` kind's golden).

---

## 8. Phase 2 — Encounters (the monster behaviour redesign)

**Goal:** everything specific to one monster, spawn or boss lives in one file. Core and role code ask questions; active encounters answer; role defaults answer last.

This comes straight after the kernel. It needs the boot phase (an encounter file registers at load and nothing more), optional-file handling (which removes the porcupine guards structurally), and the internal bus for enter/leave. It does not need a world model: activity is computed in a 50ms memo like today's `make_cache()`.

### 2.1 Encounter files

```js
encounter("uhills", {
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
});

encounter("porcupine", {
	tier: "hazard",
	mtypes: ["porcupine"],
	active: ctx => ctx.mobs.by_type.porcupine.length > 0,
	gear: { warrior: { weapon: ctx => porcupines_in_splash(ctx) ? "single" : null } },
	allows: { warrior: { attack: false, cleave: false, agitate: false }, ranger: { attack: false } },
	rank: { all: { porcupine: -1 } },
});
```

- `encounter(name, spec)` only records the spec: a registration, allowed at load.
- Role keys are `character.ctype` values (`warrior`, `priest`, `ranger`, `merchant`) plus `all`.
- An answer is data, or a function of `ctx` when it depends on the situation. There's no condition language.
- `ctx` is `encounter_context()`: `me` (hp/mp, position, map), `mobs` (within 600, `by_type`, targeting me / the tank / the party), `home`, `destination`, `goal`. Rebuilt lazily when older than `CACHE_TTL`. Phase 5's `world()` replaces it if Phase 5 happens; the fields are chosen so that is a rename.
- An encounter may hold its own state and define `enter(ctx)` / `leave(ctx)`. Deleting the file deletes the state, the hooks and the special cases.
- **Folder name:** `Encounters/` (D1). Encounter files are in `OPTIONAL_SCRIPTS`: a missing encounter means its answers are absent, nothing else.

### 2.2 Activity and tiers

`encounters` computes the active set once per `ctx` rebuild:

| Tier | Active when | Examples |
|---|---|---|
| `situation` | its own `active(ctx)` | held rime Djinn or shell within 400; mrpumpkin/mrgreen/crabxx/franky in sight |
| `hazard` | its own `active(ctx)` | porcupines within splash range |
| `spawn` | `home` is in `homes` **and** `character.map === destination.map` (today's `gear_override` rule) | uhills, fireroamer, mummy, dryad, bscorpion, rimedjinn |

Higher tiers win. Within a tier, two active encounters answering the same question is a configuration error, reported once by `errlog_count` and resolved by **encounter name order** (deterministic; Bootstrapper order is not a tie-break because encounters are optional files). Activity changes emit `encounter_enter`/`encounter_leave` and call the hooks.

### 2.3 Questions

| Question | Asked by | Combine |
|---|---|---|
| `encounter_gear(group)` | each `EQUIPMENT_RULES` resolver, in place of `gear_override(group)` | highest tier wins |
| `encounter_setting(name, fallback)` | any call site with a role default | highest tier wins |
| `encounter_allows(action, mob)` | attack, cleave, agitate, taunt, skills, curse, absorb, pull | any veto wins; mob-scoped (by `mtype`), not activity-scoped |
| `encounter_rank(mob)` | `score_targets()` | adjustments add |
| `encounter_goal(ctx)` | `movement_goal()`, beside `event_goal()`/`dreams_goal()` | highest tier wins |
| `encounter_step(kind)` | the skill runner and `movement_local()` | the highest-tier active encounter that defines the step owns it this tick |

`allows` and `rank` are **mob hooks**. They apply wherever the mob is met, so a porcupine at another spawn is still protected. Everything else is a **context hook** and needs the encounter to be active. This is the spawn-rule vs monster-trait split, kept inside one file.

New questions are added only when an encounter being migrated needs one. Expect six to eight in total.

### 2.4 Attribution

Every answer records which encounter gave it. `why("gear.orb")` and `encounters_active()` in the console answer "why did Ulric swap?" without reading code. The 📊 live feed shows each character's active encounters on the status page.

### 2.5 Defaults stay at the call site

```js
if (!target && !encounter_setting("curse", true)) return;
```

The fallback is the role's default. Encounters hold only deviations, so changing a default never touches an encounter file.

### 2.6 Lint for drift

- Every key in an encounter is a known question, and every role key is valid.
- Every `setting` name an encounter sets is read by some `encounter_setting("name"` call in that role's files (or in shared files for `all`).
- Every gear set name exists in that role's `equipment_sets`, parsed from the role Config.
- Monster literals outside `Encounters/` and the allow-list: ratchet to zero.

### 2.7 Measurement

Each ledger window records the active encounter set. A changed encounter shows as a before/after at its spawn in `Data Store.py compare`, whenever the party is next there.

### 2.8 Migration order follows the farm

One encounter per push. Sources are from the 2026-10-14 inventory (Appendix B). **The order is driven by where the party is**, not by the list below: a spawn encounter is migrated when its spawn is the current farm (pure move, live fixtures, measured in place) or when at least three promoted fixtures from that spawn already exist (then it ships on goldens and gets its ledger verdict on the next visit). A boss encounter ships on goldens from boss fixtures as they are recorded and gets its verdict at the next fight. Nothing waits on a spawn the party is not going to.

1. **porcupine** (`hazard`): `Core Systems/Porcupine Guard.js` (36 lines), and its four `typeof` sites, Ranger Combat 11 and 48, Warrior Combat 74, Warrior Equipment 79. Also Warrior Config `cleave_blacklist` (porcupine) and `agitate_blockers` (porcupine). This proves the registry, `allows`, `rank` and `gear`, and deletes the four guards plus the removal-seam exception in `CLAUDE.md`. Dormant at spookytown, so it is the safe first step; goldens from a synthetic fixture (0.4).
2. **Mob traits without a spawn:** pppompom (`cleave_blacklist`, `agitate_blacklist`), redfairy (`agitate_blockers`), nerfedmummy (Ranger `never_attack`), crabx (Ranger `attack_if_targeted`), phoenix (Ranger `always_attack`), ent (`taunt_ents`). These are small `mtypes`-only encounters, or one shared `encounter:traits` file. *(Decided when step 1 is reviewed.)* Synthetic fixtures.
3. **mummy** (the current farm, `spawn`): the mummy entries in `MONSTER_GEAR_OVERRIDES` (Healer, Ranger, Warrior Equipment), `no_curse_homes` and `zap_pull_homes` (Healer Config), the mummy agitate exclusion (Warrior Config), Ranger `skill_blacklist` (mummy). A pure move: goldens from live spookytown fixtures must be identical, and the ledger compare is read after the next reload. This is the one step that touches the current farm, and it changes nothing there.
4. **Other gear-only spawns, as the farm reaches them or fixtures exist:** uhills (sparkbot + targetron, which share one entry today duplicated), dryad, fireroamer, plus the remaining settings knobs: Ranger `skill_blacklist` (dryad, fireroamer, plantoid, mole), `FARM_FOCUS_HOMES` (Targeting 186), Healer Movement 15 (`home === "fireroamer"` skip panic), Warrior Skills 618 and `agitate_fireroamer_conditions`, the agitate list at Warrior Skills 629 (`["sparkbot", "jr", "greenjr", "bigbird", home]`). After this `MONSTER_GEAR_OVERRIDES` is gone from the three Equipment files and Global Config.
5. **Bosses** (`situation`), as fixtures from fights arrive: mrpumpkin and mrgreen (`BOSS_GEAR_OVERRIDES`, `tank_bosses`, `cleave_lone_bosses`, `taunt_bosses`), franky and icegolem (`cleave_boss_blacklist`), crabxx (`takes_one_damage` at Combat Utilities 233, the `coop_boss_only` exception in Ranger Combat 347, the crabx agitate at Warrior Skills 620, boss gear, the kite via `orbit_away`). After this `BOSS_GEAR_OVERRIDES` is gone. `ALL_BOSSES`, `EVENT_LOCATIONS`, `boss_strayed()` and `is_coop_boss()` stay generic.
6. **Rime Djinn** (`spawn` + `situation`), when the farm is there or fixtures exist: Warrior Skills 90–456 (shell windows, stomp planning, the watcher, the deadline stomp), the Combat Utilities predicates 111–184, Ranger Combat `shelled_first` (77) and shell shots (314–347), `RIME_HOLD_GEAR` (Warrior, Ranger), its gear entries (Warrior, Healer), the Warrior Skills socket handlers (164–165, 421–422), the `rime_shell_logger` and `rime_stomp_watcher` loops. Uses `step` for the stomp and `enter`/`leave` for the shell windows. The deadline stomp stays a live hot path. After this `RIME_HOLD_GEAR` is gone and Warrior Skills is the warrior's skill table only.
7. **Bscorpion** (`spawn`), when the farm is there or fixtures exist: `Core Systems/Bscorpion Camp.js` (360 lines: camp step, Riva's rail, temporal surge, the kill logger), Myras's `fight` rule in Healer Equipment (`fight_gear_owned`, `camp_fight`/`camp_luck`, `luck_window`, `log_camp_kill`, the remembered amulet), the Healer Combat/Skills references, the Movement Manager branch at 891 (→ `encounter_goal` returning `{ local: "camp" }`), Ranger `aggro_by_home`, Warrior `bscorpion_worth_buffing`, the gear entries in three files, `PRIM_FARM_*` constants. The most tangled. It may take two pushes: positioning and gear, then the fight rule and luck.
8. **Dungeons stay a separate system** (D2). `dungeon_flag()`/`dungeon_setting()` and their 38 call sites remain. The one thing this phase adds is a precedence rule, because the two systems meet at the same decisions:
   - **Inside an active dungeon, the dungeon's flags win** over every encounter answer to the same decision. Spawn-tier encounters are never active there anyway, because `home` is the dungeon's home.
   - Today the order is inconsistent: `resolve_healer_orb()` checks the dungeon orb before `gear_override()`, but `resolve_healer_loadout()` checks `gear_override()` before `dungeon_loadout()`. Step 2.8.3 or 2.8.4, whichever first touches a resolver, makes every resolver use the same order (dungeon flag, then encounter, then role default), and re-records any golden that changes.
   - Mob hooks (`allows`, `rank`) still apply inside dungeons, so a porcupine trait holds everywhere. A dungeon flag that vetoes an action (`no_cleave`) is checked alongside `encounter_allows()`, and either can veto.

### 2.9 What stays out

- Role logic: the tank model, weapon value chooser, chest band, shot chooser, heal pipeline
- Shared machinery: `orbit_away`, the equipment planner, Combat Formulas, Targeting's scorer
- Generic rules: `must_not_touch()` (lethal monsters, derived from stats), `boss_strayed()`, the panic thresholds
- Enumerations: `LOCATIONS`, `ALL_BOSSES`, `EVENT_LOCATIONS`, `SURVEY_SPOTS`

### Phase 2 checklist

- [x] 2.1–2.6 registry, context, tiers, questions (gear, settings, allows, rank), attribution, spec checks in the harness (on `overhaul`). Still to come as encounters need them: `encounter_goal`, `encounter_step`, the 📊 live feed of active encounters, the settings-are-read lint
- [x] 2.8.1 porcupine (on `overhaul`): a pure move, 9 synthetic fixtures whose goldens fail without it; `typeof` count down 4
- [x] 2.8.2 mob traits (on `overhaul`): pppompom, redfairy and nerfedmummy in `Encounters/Monster Rules.js`, pinned by 6 synthetic fixtures; `cleave_blacklist`, `agitate_blockers` and `never_attack` are gone. Phoenix left Riva's `always_attack` (the user's call: the party has moved past phoenix). crabx moves with the crabxx boss (2.8.5); `taunt_ents` (off) stays
- [x] 2.8.3 mummy (on `overhaul`; no longer the current farm): `Encounters/Mummy.js`. A pure move against the 15 live and 10 synthetic mummy fixtures except one recorded change: `zap_pull` is a live-spawn setting, so off the spawn's map Myras wears `zap_off` (one golden, the mrpumpkin fight on halloween, re-recorded: `zap_pull_home` true → false, ring unchanged because the fight rule owns it). Encounter gear sits inside `gear_override()` below rime and boss gear. `agitate_blacklist` and `zap_pull_homes` are gone. The harness now fails a setting no code reads
- [ ] 2.8.4 uhills, dryad, fireroamer and the settings knobs (as reached)
- [x] 2.8.5 bosses (on `overhaul`): `Encounters/Halloween Bosses.js` (mrpumpkin and mrgreen as one encounter), `Encounters/Crabxx.js` (with its crabx adds), franky and icegolem in Monster Rules. A pure move against the 6 live boss fixtures and 6 new synthetic ones. Adds `traits` (positive mob facts: `tank`, `taunt`, `cleave_alone`, `hold_cleave`, `attack_if_targeted`, `agitate_pack`). `BOSS_GEAR_OVERRIDES`, `boss_gear_here()`, `tank_bosses`, `taunt_bosses`, `cleave_lone_bosses`, `cleave_boss_blacklist` and `attack_if_targeted` are gone
- [ ] 2.8.6 rime Djinn (as reached)
- [ ] 2.8.7 bscorpion (as reached)
- [ ] 2.8.8 dungeon/encounter precedence applied in every resolver

Steps marked "as reached" may stay open for weeks without blocking Phase 3. The phase is exited when every encounter whose spawn the party has visited since Phase 0 is migrated.

**Exit:** the monster-literal ratchet is zero outside the unmigrated spawns. `gear_override()`, `MONSTER_GEAR_OVERRIDES`, `BOSS_GEAR_OVERRIDES`, `RIME_HOLD_GEAR` and the `*_homes`/blacklist lists are gone or reduced to the unmigrated entries. The `typeof` count is down by 4. Design Notes has one section per encounter, with the bscorpion camp, rime shell and uhills paragraphs moved into them as they migrate.

---

## 9. Phase 3 — Deciders and actuators

**Goal:** every decision is one owner returning an intent, and only actuators reach the server. This continues `Decision Ownership.md`, extended to every decision. Behaviour changes are allowed here only where they're named, one decision per push.

### 3.1 What to wear

- Persistent rules keep their shape: one resolver per group in `EQUIPMENT_RULES`, applied by `resolve_equipment()`.
- Transient procedures get one helper:
  ```js
  equip_burst({ owner: "cleave", arm: CLEAVE_SET, between: () => use_skill("cleave"), restore: () => chosen_weapon_set() });
  ```
  `restore` is a function, evaluated after the skill, never a value captured before it: the right weapon can change during the burst, and the chooser is never held to an earlier answer (see the Riva bow-swap note in memory). It replaces the four hand-rolled `equip_plan` + `emit_equip_ops` pairs: Warrior Combat 196–234 (`weapon_burst`, cleave + sugar rush), Warrior Skills 524–532 (stomp), Bscorpion Camp 290–294 (temporal surge, by then in the bscorpion encounter if 2.8.7 has happened), Party Management 124–125 (panic arm). The helper owns the claim at `skill` priority, the shadow chaining, and the "swap after the skill" penalty rule. The `EQUIP_PRIORITY` ladder is then used only inside the helper and the rules loop.
- Merchant Gear's raw `equip()`/`unequip()` (lines 23, 65, 69) go through the planner, so `best_copy()` and the sent view protect Riff too.

### 3.2 Which skill

One shared skill runner over a per-role table:

```js
var WARRIOR_SKILLS = [
	{ name: "warcry",  gate: "combat", wanted: warcry_wanted,  cast: () => use_skill("warcry") },
	{ name: "stomp",   gate: "combat", wanted: stomp_wanted,   cast: handle_stomp },
	{ name: "cleave",  gate: "combat", wanted: cleave_wanted,  cast: () => weapon_burst(true, sugar_rush_wanted(), null) },
	{ name: "agitate", gate: "combat", wanted: agitate_wanted, cast: handle_agitate },
	{ name: "taunt",   gate: "combat", wanted: taunt_wanted,   cast: handle_taunt },
	// { name: "charge", ... },
	// { name: "hardshell", ... },
];

var PRIEST_SKILLS = [
	{ name: "party_heal", gate: "alive",  wanted: heal_wanted,   cast: handle_party_heal },
	{ name: "curse",      gate: "combat", wanted: curse_wanted,  cast: handle_curse },
	{ name: "absorb",     gate: "combat", wanted: absorb_wanted, cast: handle_absorb },
	...
];
```

- **The gate is per entry, not per runner.** Today the roles gate differently on purpose: Ulric's skill loop stops entirely on `should_pause_combat_loop()` (panic, bail, travel, chase), while Myras's `handle_party_heal()` runs whenever she is alive (`Healer Skills.js:7–24`: the `panicking` return is commented out and `paused` gates only curse, absorb and blessing), because her heals are what the party survives panic on. A single runner-level mode gate would have stopped her healing in panic. Gate values: `alive` (only `is_disabled`), `combat` (today's `should_pause_combat_loop()` plus bail and cave), `always`. The 0.4 panic-heal golden pins this.
- The runner owns the cooldown check, the mp reserve (`skill_mp_cost` + `panic_mp_reserve()`), per-entry `catcher`, attribution, and await semantics. Today each role repeats these in a hand-written chain of `try/catch` blocks.
- Encounter `step` answers are entries in the same table.
- The commented-out `charge`/`hardshell` move as commented-out entries.
- Riva's mark/supershot use the same runner. The zap loop stays separate (it's on its own cadence for a reason; see Loop Cadence) but uses the same entry shape.

### 3.3 Where to stand

`movement_local()`'s `if (goal.local === ...)` chain becomes a registry: `local_step("camp", camp_step)`. The bscorpion encounter registers `camp` and crabxx registers `kite`, so core movement no longer names either.

### 3.4 What to attack

This is already the model (`Decision Ownership.md` §6). The three `action_loop`s get one shared runner around `run_basic_action()`. Riva keeps her 5ms cadence as a parameter (Loop Cadence §3 left it deliberately).

### 3.5 Merchant

`PRIORITY_CHECKS` and `get_character_state()` already follow the decider shape and stay. `merchant_task` (10 assignments in four files) gets one writer, `set_task()`; the watchdog keeps reading it. Its four `while (true)` loops are already scheduler loops after Phase 1.

### 3.6 Emit ratchet

`socket.emit`, `equip(`, `unequip(`, `use_skill(`, `attack(`, `heal(`, `move(`/`smart_move(` are allowed only in actuator files: Equipment Manager, the skill runner, the attack runner, Movement Manager, the merchant executors. Ratchet to zero elsewhere.

### Phase 3 checklist

- [ ] 3.1 `equip_burst`, the 4 bursts migrated (one per push), Merchant Gear through the planner
- [ ] 3.2 skill runner: warrior, priest, ranger (one per push; priest's panic-heal golden unchanged)
- [ ] 3.3 local-step registry
- [ ] 3.4 shared action runner
- [ ] 3.5 merchant `set_task()`
- [ ] 3.6 emit ratchet at zero

**Exit:** `Decision Ownership.md` lists every decision with one owner and no coordination left over. The emit ratchet is at zero.

---

## 10. Phase 4 — Telemetry on the event bus (optional)

**Goal:** behaviour code emits events and never logs, measures or archives inline. No behaviour change.

### 4.1 Normalised game events

`Kernel/Events.js` subscribes once to each socket event and re-emits a normalised topic with the fields every current handler derives for itself:

| Topic | From | Adds |
|---|---|---|
| `hit` | socket `hit` | `mob`, `by_me`, `by_party`, `on_me`, `on_party`, `kill`, `damage_type` |
| `kill` | socket `kill_credit` + `hit.kill` | `mtype`, `credit`, `at_spot` |
| `action` | socket `action` | `skill`, `source`, `target`, in-flight id |
| `equip_reply` | socket `game_response` (`place`) | `event`, `failed`, `slots` |
| `loot` | `character.on("loot")` | gold, items |
| `map` | `character.on("new_map")` | from, to |

### 4.2 Bot events

These are emitted by the deciders and actuators that own them: `swap`, `skill_cast`, `shot`, `pull`, `panic`, `death`, `close_call`, `goal_change`, `encounter_enter`/`encounter_leave`, `dungeon_enter`/`dungeon_exit`.

### 4.3 Subscribers

Each of these keeps its file and moves its handlers onto topics:

- Farm Ledger (`kill`, `loot`, `death`), Danger Log (`hit`), Farm Survey, Boss Profiler (`action`, `hit`), Combat Sampling (`action`, `hit`: the in-flight ledger stays exact and first in order), Dungeon Progress (`hit`→`kill`), Dungeon Runner's kill wait (`kill`)
- Meters: DPS (`hit`), Kill Tracker (`kill`), Gold Meter/Stats Window/Metrics Graphs (`loot`, `hit`, `kill`), Lucky Slot Tracker (`q_data` raw)
- Error Log (`equip_reply`, `disconnect`, `limitdcreport`, lifecycle)
- **Role loggers leave the entry points:** `cooperative_luck_logger`, `swap_penalty_logger`, `cc_report_logger` and `sugar_rush_roll_logger` become `telemetry`-kind subscribers in Warrior Combat. `rime_shell_logger` moves with the rime encounter.

### 4.4 Logging levels

`log(level, msg)` with `info`, `warn`, `error`, `event` and `debug` levels, where colour and prefix come from the level. This is the same set `ERRLOG_GAMELOG_PREFIXES` already infers from emojis. `game_log(msg, color)` stays as the underlying writer. `warn` and `error` also count into the flight recorder by level, which replaces Error Log's emoji-prefix inference.

Conversion (D3): a file's `game_log` calls are converted in the commit that changes that file for a non-mechanical reason. Whatever is left is swept file by file in 6.2.

### 4.5 Record context

Every archived record carries build, character, home and active encounters.

### Phase 4 checklist

- [ ] 4.1 normalised topics
- [ ] 4.2 bot events emitted at their owners
- [ ] 4.3 subscribers moved; logger loops gone from the entry points
- [ ] 4.4 `log(level, msg)` in place; call sites converted as files are touched (D3)
- [ ] 4.5 record context

**Exit:** no socket handler outside `Kernel/Events.js`. The entry points list only behaviour loops. Ledger, danger and survey `.jsonl` output is unchanged except for the added fields, checked by diffing a window from each build.

---

## 11. Phase 5 — World model (optional)

**Goal:** every decider in a tick reads the same picture of the world. Small timing change, measured.

Do this only if Phase 2's `encounter_context()` and the roles' `update_cache()` turn out to duplicate enough scanning to matter. CPU has never been the bottleneck here (the 2026-10-01 freeze was network; Loop Cadence's cost of a fast loop is call cost and races), so the case for it is consistency and testability, not speed. A snapshot that eagerly builds every field every 50ms would cost more than the targeted queries it replaces.

### 5.1 The snapshot

`world()` is `encounter_context()` grown into the full picture, **with every field a lazy getter memoised within `CACHE_TTL`** so a loop that reads one field pays for one field:

- `me`: hp/mp and percentages, position, map, `s`, `rip`, `cc`, `penalty_cd`
- `party`: each member's live entity or CM state, distance, hp/mp, alive, on my map
- `mobs`: in range by kind (attack range, cleave range, aggro radius), by `mtype`, targeting me / the tank / the party
- `mode`: one value out of `disabled | paused | bailing | panicking | dreams | dungeon | travelling | event | camped | farming`. This is a *description* for telemetry and the console. It is not a gate: loops and skill entries keep their own gates (3.2), because the roles gate differently on purpose.
- `goal`, `encounters`, `role` (what `update_cache()` builds today)

### 5.2 Hot paths stay live

These read `character`/`parent.entities` directly, and the snapshot never serves them: the rime deadline stomp, `luck_due()`/`luck_window()` at the scorpion kill, `weapon_burst()`/`swing_possible()`, the potion check, heal target and party heal triggers. Each exception is listed in Design Notes with its reason.

### 5.3 Predicates

Each `is_/has_/should_/can_` predicate either becomes a snapshot field, becomes a function of `world`, or stays live with a reason. `update_cache()` per role is removed when its fields are in `world.role`.

### Phase 5 checklist

- [ ] 5.1 lazy `world()`
- [ ] 5.2 hot-path exceptions documented
- [ ] 5.3 predicates migrated, one file per push

**Exit:** goldens identical. Ledger compare `same` at the current home over the D4 behaviour-tier sample, close calls no worse.

---

## 12. Phase 6 — File hygiene and docs (trimmed)

### 6.1 Splits

Each split is behaviour-neutral, one file per push, and only for files someone is about to work in again:

- `Merchant Upgrading.js` (968): profiles, selection, execution, lolipop push
- `Movement Manager.js` (928): goal, travel and arbiter, local dispatch, stuck escape, town shortcut
- `Dreams Cave.js` (897): entry and voting, escorts, fighting, exit
- `Metrics Graphs.js` (803): live feed vs dashboard UI
- `Dungeon Runner.js` (779): entry, run loop, scripted travel

### 6.2 Remaining `game_log` sweep

Whatever D3 left unconverted, file by file.

### 6.3 Config validation

Each role's `CONFIG` is checked by lint: every key is read somewhere (122 distinct `CONFIG.x.y` keys are read today), and every read key exists.

### 6.4 Docs

- `Architecture.md` is rewritten for the final structure.
- Design Notes is reorganised by file and encounter.
- `Loop Cadence.md`'s inventory is replaced by `al_loops()` output.
- `Decision Ownership.md` is closed out.

Dropped from the first draft: re-ordering every file's sections to a standard shape, and generating the file map from per-file `about` strings. Both touch every file for no behaviour payoff, and each touched file is another purge.

### Phase 6 checklist

- [ ] 6.1 splits (as needed)
- [ ] 6.2 `game_log` sweep
- [ ] 6.3 config lint
- [ ] 6.4 docs

---

## 13. Standards (what every file follows)

| Area | Standard |
|---|---|
| File top level | declarations and kernel registrations (`on_boot`, `encounter`, `register_widget`) only; nothing executes at load |
| Naming | existing: `snake_case`, `UPPER_SNAKE_CASE` constants, `_` internals; encounters named by spawn, mob or boss |
| Loops | `every(name, { ms, kind }, fn)` only |
| Events | `on_socket`, `on_character`, `on_dom`, `on`/`emit`; `wrap_parent` for overrides |
| Storage | registered keys through `Kernel/Storage.js` |
| Errors | `catcher` at the boundaries the kernel owns (loop, handler, skill entry); no per-step `try/catch` in bodies |
| Guards | none, as today; legitimate kinds are a boot step's `needs` on an optional file, `Code Loader.js`, the game's optional callbacks, optional callback parameters |
| Config | role `CONFIG` local; defaults at the call site for encounter settings; shared defaults only for values identical across roles |
| Monsters | named only in encounters and the allow-listed enumerations |
| Server calls | only in actuators |
| Logging | `log(level, msg)` for people (once Phase 4 exists), `errlog_*`/events for data |
| Comments | none; reasoning in Design Notes; commented-out code kept verbatim |
| Syntax | no `??=`/`||=`/`&&=`; optional chaining is fine (already used) |

---

## 14. Per-push protocol

1. `python Tools/Lint.py` with no new problems, and the ratchet not increased (lower the baseline in the same commit if a count dropped).
2. `node Tests/Harness.js load`: all four roles boot.
3. `node Tests/Harness.js check`: goldens identical, or re-recorded with the reason in the commit message.
4. Commit. A change to a file the bot loads is pushed to `overhaul`, not `main` (D10). A `main` push is purged and verified on jsDelivr as in `CLAUDE.md` (stop after one re-purge; the pinned `@sha` serves immediately).
5. Stop. `overhaul` is merged to `main` only with the user present, and the next reload, theirs or the x:55 one, is then watched. Several pushes may stack up before a merge; that is expected.
6. After the next reload, watch `errors.json` for new buckets and `danger.jsonl` for close calls over the first hour. Any new error bucket or death that names a changed subsystem is treated as `worse` without waiting for the ledger.
7. When the D4 sample for the tier has accrued at the current home: `python "Tools/Data Store.py" compare <old> <new>`. Record the verdict against every step that went live in that reload. `worse` means revert the whole reload's steps, push and purge, then bisect offline with the harness before putting any of them back. Don't fix forward on top of a regression.

Many small pushes run into jsDelivr purge throttling (§Deploying in `CLAUDE.md`). Pace pushes so each purge succeeds, and rely on the pinned SHA when one doesn't.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| A kernel boot error stops all four characters | Boot test for all four roles in the harness before every push; boot errors name the file; a non-role boot step that throws is skipped, not fatal |
| A reload carrying several pushes regresses and the suspect is unclear | Goldens per push narrow it offline; the whole reload is reverted first, then bisected in the harness |
| Pause or panic semantics drift inside a "neutral" phase | Loop kinds and skill gates are taken from the 0.3 inventory of today's behaviour, pinned by goldens (combat-runs-while-paused, priest-heals-while-panicking) |
| Goldens pass on stubs rather than the game | The harness runs the real `runner_functions.js`; fixtures come only from live recordings or labelled synthetic edits of them |
| Fixtures never arrive for a spawn | Its encounter step stays open; nothing else waits on it (2.8) |
| Huge mechanical diffs hide a real change | One group per push; the diff is registrations, not moved bodies |
| Tuned knowledge lost in moves | Design Notes paragraphs move in the same commit; commented-out code moves verbatim |
| Harness drifts from the real client | Fixtures come only from live recordings; the harness is never trusted for timing |
| Encounters conflict silently | Same-tier conflicts counted and logged; deterministic tie-break; `why()` attribution |
| The current farm is disturbed | The only step touching it is the mummy pure move (2.8.3), gated by live goldens; everything else waits for the farm to move |
| Plan stalls midway | Every step leaves a consistent codebase; the status table and checklists show where it stopped |
| CDN purge throttling across many pushes | Pinned `@sha`, paced pushes, verify loop every time |

---

## 16. Size

Rough count of pushes, each independently shippable:

| Phase | Pushes |
|---|---|
| 0 | 9–10 (the harness is 3–4 of them) |
| 1 | 6–7 |
| 2 | 9–11, several of them waiting on the farm |
| 3 | 9–11 |
| **0–3** | **~33–39** |
| 4 | 5–6 |
| 5 | 4–6 |
| 6 | 4–8 |
| **All** | **~46–59** |

Reloads are the user's; a reload may carry any number of pushes. Live measurement runs per reload at the current home (D4), so the calendar cost is set by how often the user reloads, not by the push count.

---

## 17. Decisions

**2026-10-14 (first draft)**

- **D1 Folder name: `Encounters/`.** It covers spawns, places and bosses, not only single monsters.
- **D2 Dungeons stay a separate system.** Dungeon flags are not folded into encounters. Inside an active dungeon its flags win over encounter answers, and the resolvers are made consistent about that order (2.8.8).
- **D3 Log levels: yes, converted gradually.** `log(level, msg)` arrives in Phase 4. Call sites are converted when their file is touched for a non-mechanical reason, and the remainder is swept in 6.2.
- **D5 `Tests/` is committed; raw snapshots are not.**
  - The repo is public (jsDelivr serves it), so `snapshots.jsonl` stays machine-local and gitignored like the other archives.
  - `node Tests/Harness.js promote <id>` copies a chosen snapshot into `Tests/fixtures/`. On the way it replaces every non-party player name with a stable hash, drops chat and trade data, and keeps only the fields deciders read.
  - The harness, goldens and promoted fixtures are committed. Fixtures are capped at about 60 and kept small (they ride in the repo jsDelivr mirrors), and each one carries a label saying what it's for.

**2026-10-14 (review)**

- **D4 The ledger gate is per reload, in two tiers, always at the current home.** (Rewritten.)
  - *Mechanical pushes* (Phase 1 batches, Phase 2 pure moves, Phase 6 splits) are gated by goldens and `Harness.js load` only. They need no ledger wait before the next push.
  - *Steps that change timing or behaviour* (every Phase 3 step, 2.8.6 rime, 2.8.7 bscorpion, 2.8.8, Phase 5) get a ledger verdict: at least 12 windows (1 hour) per build at the home the party is already at, with the existing `band()`/`judge()` bands. Mechanical steps that went live in the same reload get a verdict from the same windows, at least 6.
  - A spawn- or boss-specific step gets its verdict when the party is next at that spawn or in that fight. Until then its checkbox reads "live, awaiting <spot>". No step sends the party anywhere to collect it.
  - Any death at the spot on the new build is read in `danger.jsonl` before a verdict is given. `worse` on kills/h or deaths/h beyond the band means revert the reload, then investigate.
  - If the farm survey is running (the user's choice, never the plan's), compare per spot, and don't count a visit's last 30 minutes.
- **D6 The characters keep running, and the current farm is not a test bed.** The bot stays live throughout; fixtures and ledger windows come from wherever the party already is and whatever bosses and panics happen. Nothing in this plan relocates the party, starts the survey, or changes behaviour at the current farm. Encounter migration order follows the farm (2.8).
- **D7 Phase 1 is a boot kernel, not a module registry.** `define()`/dependency wrapping of 80 files, the `expose` bridge and its removal are deferred (Appendix D). Reasons: 15–17 mechanical pushes for a benefit the boot phase and lint provide; an unplanned Core → role dependency inversion (16 Core files read role `CONFIG`/`cache`/`state`); and a bridge that would have to be removed again. Files stay classic scripts; the `var`/`const` eval rule stays and is documented.
- **D8 Phase order is 0, 1, encounters, deciders/actuators, then the optional phases.** Encounters are the design change the overhaul is for and need only the boot kernel. The telemetry bus and world model are refactors with no behaviour payoff and go last, if at all. The world model, if built, is lazy per field and never a gate.
- **D10 Stage on `overhaul`; `main` is what runs unattended.** The bot reloads itself every four hours at x:55 and the watchdog reloads silent windows, so "deploy and stop, the user reloads" doesn't hold: `main` goes live within hours whether or not anyone is watching. Changes to loaded files are staged on `overhaul` and merged with the user present. Only files the bot never loads, and the throw-proof telemetry of 0.2/0.5, go straight to `main`.
- **D11 Rare fixtures gate only the step that needs them.** A panic or close-call fixture is required before 3.2, not to leave Phase 0.
- **D12 Goldens are deterministic or they are noise.** The clock, the stored values and `Math.random` come from the fixture. Each fixture runs in a fresh context, and `check` runs every fixture twice.

**2026-10-15 (overnight run)**

- **D13 Phase 1 converts only `setInterval` loops; the combat loops are their own measured step (1.2b).** All 30 `setInterval` loops moved to `every(…, { fixed: true })`, which is plain `setInterval` timing, so nothing ticks differently. The 41 self-rescheduling `setTimeout` loops and 8 `while (true)` loops include `action_loop`, `skill_loop`, `potion_loop`, `main_tick` and the equipment loop; moving those changes timing, which D4 puts in the behaviour tier.
- **D14 Snapshots are throttled per trigger.** Riva's panic trigger is one mob on her, and overnight it snapshotted 903 times (about 51KB each, 102MB). Panics now snapshot at most once per 5 minutes and close calls once a minute; farm windows, deaths and bosses are unthrottled.
- **D15 Promotion strips private fields.** Live snapshots carry the account id (`owner`), `ipass`, friends, shells, code slots and PIXI internals. `promote` drops those keys and every underscore-prefixed key at every depth, drops the role cache, keeps only the storage the deciders read, and hashes strangers' names. Checked on all 15 committed fixtures.
- **D16 The kernel is its own stage.** Phase 1 put `Kernel/` in the first stage beside Widget Helpers and Game Log, which call `on_boot()` at load; the first stage is a `Promise.all`, so either could run before `Kernel.js` and lose its boot step. Found while adding the encounter registry, which needs the same guarantee. `Kernel/` is now awaited before the first stage, lint fails a load-time call into the same or a later stage, and `node Tests/Harness.js load` also boots with each stage reversed.
- **Open for the user: the reload order puts the tank first.** At the 23:55 self-reload `RELOAD_ORDER` restarted Myras first in the middle of a pull of about 8 mummies. They switched to Riva (dead 5s later, on the old build), and Ulric and Myras booted into the new build already dead. 03:55 and 07:55 caused no deaths, so it depends on the pull at that moment. Reloading the tank last, or waiting for a lull before the reload, would remove it; that is a behaviour change at the current farm, so it needs your go-ahead.
- **D9 Gates belong to the loop or skill entry, never to a shared runner.** The Pause Button leaves combat running and Myras heals while panicking; both are deliberate and both would have been broken by the first draft's uniform `automation` kind and runner-level mode gate. Loop kinds (1.2) and skill gates (3.2) are taken from the inventory of today's behaviour and pinned by goldens.

---

## Appendix A — Kernel API summary

| Call | Module | Purpose |
|---|---|---|
| `on_boot(file, fn, { needs })` | Kernel | register a boot step under the file's name |
| `kernel_boot(script_list)` | Kernel | run boot steps in Bootstrapper list order, once per tab |
| `every(name, { ms, kind, fixed }, fn)` | Scheduler | the only loop primitive |
| `al_loops()` | Scheduler | loop inventory in the console |
| `on_socket(event, key, fn)` | Events | socket fan-out, ordered, each subscriber in its own catcher, replace-by-key, torn down on `pagehide` |
| `on_character(event, key, fn)` | Events | `character.on` fan-out |
| `on_dom(target, event, key, fn)` | Events | DOM listeners |
| `wrap_parent(name, wrapper)` | Events | the only `parent.*` override, restored on `pagehide` |
| `emit(topic, data)` / `on(topic, key, fn)` | Events | internal bus |
| `storage_read/write`, `storage_raw_read/write`, `storage_key(name)` | Storage | registered keys only |
| `console_api({...})` | Kernel | the intentional console entry points |
| `encounter(name, spec)` / `encounter_context()` / `why(path)` / `encounters_active()` | Encounters | registry, context, attribution |

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
| fieldgen0 | Loot Management (an object, not a fight; decide in 2.8.2) |

Allow-listed, staying where they are: Global Config (`LOCATIONS`, `ALL_BOSSES`, `EVENT_LOCATIONS`), Farm Survey (`SURVEY_SPOTS`), dungeon definitions and routes (Crypt Dungeon, Crypt Route, Spider Dungeon, Dreams Cave, Dungeon Mode).

## Appendix C — Dungeon flags by the encounter question they meet (for 2.8.8)

Dungeon flags stay their own system (D2). This table shows where a flag and an encounter answer can reach the same decision, which is where 2.8.8's precedence applies.

| Flag | Meets |
|---|---|
| `no_cleave`, `no_agitate`, `no_attack` | `allows` |
| `single_target`, `aggroed_only`, `nearest_first`, `target_lowest_hp`, `defensive_targeting`, `follow_focus` | `setting` (targeting/shot choice) |
| `orb`, `attack_loadout`, `heal_loadout`, `single_weapon` | `gear` |
| `engage_radius`, `melee_engage_radius`, `ranged_engage_radius`, `cohesion_range`, `cohesion_regroup`, `aggro_cap`, `aggro_cap_fixed` | `setting` |
| `center_on_tank`, `stack_on_center`, `circle_on_self` | `setting` (positioning) |
| `leader_manual`, `ignore_events`, `ignore_travel_panic`, `fight_while_moving`, `combat_always_on`, `skip_panic`, `absorb_nearby`, `party_only` | `setting` (mode and behaviour switches) |

## Appendix D — Deferred: the module registry

The first draft's Phase 1 wrapped every file in `define(name, deps, factory)`, booted factories in dependency order, exported functions and objects only (never reassignable primitives, which destructuring would copy stale), used `use(name)` for back-edges, and bridged unmigrated callers with `expose: true` until a final removal step. It is recorded here in case the boot kernel proves insufficient.

What would have to be solved first if it is revived:

- **Core → role inversion.** 16 Core files and Dungeon Runner read `CONFIG`, `cache`, `state`, `EQUIPMENT_RULES` and `ITEMS_TO_KEEP`, which role Config files define. A core module cannot declare the role as a dependency because the role depends on core. The fix would be a kernel-owned `role_config` slot that the role Config file populates in the first role push, with role Config migrating before the Core batches.
- **Reassigned primitives.** `home`/`destination` (Farm Survey), `panicking`/`panic_external`/`panic_since` (Party Management), `merchant_task` (10 sites), `main_beat_at` would all need accessors before any importer destructured them.
- **Eager factory statements.** A `const X = f(...)` at factory top level needs `f`'s module booted first; the ratchet's top-level counter would have to count inside factories too, or the load race just moves inside `kernel_boot`.
- **Cost.** 15–17 pushes plus the bridge removal, every file touched twice, every touch a purge.
