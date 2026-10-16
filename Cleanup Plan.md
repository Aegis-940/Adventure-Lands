# Cleanup Plan

Remove what the bot no longer needs, use the game's own functions where they do the same job, and make what's left simpler. It follows the overhaul (complete 2026-10-16). It is a subtraction plan: nothing new is built except two small shared helpers that replace copies.

Every finding below comes from a read of the source on 2026-10-16 at `eb4ea67`, checked against the game's client (`Tools/.cache/runner_functions.js`, `common_functions.js`) and server (`server.js`, `server_functions.js`). Line numbers are from that commit. They drift as work lands, so **re-read each site before changing it**.

## Status

| Phase | Title | Changes how the party plays | Status |
|---|---|---|---|
| C0 | Safety net for subtraction | none | **done** 2026-10-16 |
| C1 | Docs | none | **done** 2026-10-16 |
| C2 | Dead code | none | not started |
| C3 | Error handling that hides errors | none (errors start reaching the log) | not started |
| C4 | Guards and fallbacks | none | not started |
| C5 | Native game functions | a few items, each marked ⚠ | not started |
| C6 | Party state and the information the bot gathers | a few items, each marked ⚠ | not started |
| C7 | Simplification | none | not started |
| C8 | Close-out | none | not started |

Update this table and the phase checklists in the same commit as the work.

---

## 1. Goals

1. Remove old and unused docs, including completed or redundant planning docs.
2. Remove unused and dead code.
3. Use the game's native functions where our code re-implements them.
4. Replace information-gathering code with what the game already sends, where it really is the same.
5. Simplify functions that are more complex than their job.
6. Remove unnecessary guards and checks.

## 2. Non-goals

- **No new behaviour.** Anything that would change how the party plays is marked ⚠, needs the user's go-ahead first, and is measured with `compare` like any other behaviour change.
- **Commented-out code stays** unless the user says otherwise item by item (list in §C2.6).
- **No structural moves.** Files stay where Phase 6 put them; splits are not part of this plan.
- **The dungeons stay.** Spider and crypt are dormant, but they are a feature, not dead code. Only their dead wrappers go.

## 3. What the audit found

| Area | Finding |
|---|---|
| Docs | 4 planning docs are finished: Overhaul Plan, Data and Farming Plan, Combat Plan, Party Console Review. Decision Ownership and Loop Cadence now repeat Architecture and `al_loops()` |
| Dead code | About 15 globals that nothing references; 7 unused filters in `monsters_matching`; the weapon chooser's hold and margin, which can never trigger; a hand-ported damage formula that never runs; 4 cache fields nobody reads; 3 bus topics nobody listens to; most of the DPS Meter's bookkeeping |
| Error handling | 16 empty `catch (e) { }` around code the kernel already catches, and 9 catches that only `console.error`, the main tick among them. Errors there never reach `errors.json` |
| Guards | About 255 unnecessary: about 120 `\|\| 0`/`\|\| {}` fallbacks on values the server always sends, 29 `?.` links on objects that always exist, about 30 checks for impossible states, about 12 double checks, 4 `typeof` existence guards, 1 stale flag |
| Native functions | About 25 places that repeat the game: `character.targets`, `character.esize`, `damage_multiplier()`, `locate_item()`/`quantity()`, `get_entity()`, `calculate_item_grade()`, `transport()`, `sleep()`, `is_in_range()` |
| Information gathering | **Less to replace than suspected** (§C6.1). The game tells a character little about its teammates across maps, so the shared state cache stays. It can shrink, and one accessor that prefers live data would replace three ad hoc versions. Messages between our characters already go through localStorage, not the server |
| Complexity | Most long functions are long for documented reasons. About 10 real simplifications, mostly copies spread across files: 13 hand-written waits, 8 copies of the merchant task wrapper, 4 copies of the hit-kind test, 3 aggro counters, 7 copies of the merchant "am I at the spot" check |

---

## 4. Ground rules for every change

1. **Verify before removing.** For a function, grep for its name as an identifier *and* as a string (`route: "run_crypt_route"` looks functions up by name), in the HTML (`onclick="...select_bank_floor"`), in `console_api` and in the docs. Something only a human calls from the console isn't dead: register it (§C2.1).
2. **Record goldens first** (`node Tests/Harness.js golden`) for any change to code the harness pins: gear, targets, goal, combat pause, skills, aggro cap, bursts and local steps. Then `check`. A pure removal keeps every golden.
3. **`load`, `smoke` and `python Tools/Lint.py`** after every change. Lint's config check catches removed `CONFIG` keys.
4. **One subsystem per commit**, committed on `main` and pushed. Mechanical batches (guards in one file) may be one commit per file group.
5. **Code the harness doesn't pin** (`smarter_move`, the travel arbiter, the merchant, dungeons, the DPS Meter) is changed in smaller steps. After the next reload, read `errors.json` for new buckets before stacking more on top.
6. **⚠ items** wait for the user's go-ahead. They go live alone, and get a `compare` verdict (behaviour tier, 12 windows) at the current home before the next ⚠ item.
7. **Design Notes first.** Read the file's section before changing it, and update it in the same commit. A rule that looks unnecessary may have a dated incident behind it.

---

## C0. Safety net for subtraction

- **C0.1 Fixtures carry what the server always sends.** The synthetic fixtures and `minimal_fixture()` may lack fields the server always sets (`explosion`, `s`, `c`, the zeroed stats in `calculate_player_stats`, `server.js:1073-1110`). Removing an `|| 0` would then break a golden rather than the bot. Fill those fields in the fixture builder, so goldens test the real shape. Re-record and confirm every decision is unchanged.
- **C0.2 Harness `parent.damage_multiplier`.** `Tests/Harness.js:279` copies `distance` and `is_disabled` onto `parent`, but not `damage_multiplier`. That is why tests run our hand port (§C2.3). Copy it, and confirm the goldens are unchanged (the port matches the game band for band).
- **C0.3 A lint count for unreferenced globals.** Add a ratchet counter to `Tests/Analyze.js`: a global defined and referenced nowhere, not registered in `console_api`, not named in a string, not a game callback (`on_*`). Baseline it now and drive it to zero in C2, so dead code can't creep back.
- **C0.4 Lint counts for swallowed errors.** Add ratchet counters for empty catches and for `console.error` outside `Kernel/` and `Error Log.js`. They go down in C3.

**Checklist**
- [x] C0.1 fixture fields (`server_shape()` in the harness fills every stat the server zeroes, and `s`/`c`/`q`; entities get `s`/`c`. No golden moved)
- [x] C0.2 harness damage_multiplier (no golden moved)
- [x] C0.3 unreferenced-global counter (`unreferenced`, baseline 27: the unregistered console commands and the dead code of C2. `experiment_value` is exempt as the experiment hook; `STORAGE_KEYS` is listed by the new `al_storage_keys()`)
- [x] C0.4 swallowed-error counters (`empty_catch` 43, `console_error` 11)

---

## C1. Docs

Today's docs: `CLAUDE.md` (230 lines), `Architecture.md` (222), `Design Notes.md` (877), `Game API Reference.md` (1042), `Diagnostics.md` (229), `Overhaul Plan.md` (894), `Decision Ownership.md` (289), `Loop Cadence.md` (124), `Party Console Review.md` (727), `Combat Plan.md` (391), `Data and Farming Plan.md` (217).

**Keep:** CLAUDE.md, Architecture, Design Notes, Game API Reference, Diagnostics. **Delete:** the six others, once what still matters has moved.

### C1.1 Move what is durable, then delete

| Doc | What survives, and where it goes |
|---|---|
| `Overhaul Plan.md` | The decisions still in force go to a short **Decisions** section at the end of Design Notes, one line each: D2 (dungeon flags stay separate), D5 and D15 (fixtures committed, snapshots private, `promote` strips private fields), D9 (gates belong to the loop or skill entry), D12 (goldens are deterministic), D14 (snapshot throttling), the closed reload-deaths decision, D17 (data-based changes). The standards table (§13) is already in CLAUDE.md; reconcile it and drop anything stale. The per-push protocol (§14) still mentions `overhaul` and jsDelivr; fold the current version into CLAUDE.md's Testing and Deploying sections. Appendices A–D are history |
| `Combat Plan.md` | The measured constants table, "Considered and rejected" and the four "Open, not scheduled" items move to Design Notes (Healer Skills and Combat Formulas sections), so they're not re-derived |
| `Data and Farming Plan.md` | Everything is built. The bands and score decisions are already in Design Notes (`Data Store.py`); confirm each one is, then delete |
| `Party Console Review.md` | Its summary lists the done items. **Triage every open item against today's code** before deleting: G1–G5, K1, S2, E1, E3, R1–R3, R5–R10, I3–I6, L1. Some are done (R6 is the Lucky Slot Tracker; I3 is moot now the code is served locally), some are superseded, and the rest are real ideas. The ideas go in a short **Ideas not yet measured** list at the end of Design Notes, one line each with its evidence, to be weighed against the data like any other proposal |
| `Decision Ownership.md` | The owner table moves into Architecture's "One owner per decision" (which already summarises it); the consolidation history is in git |
| `Loop Cadence.md` | The principle and the four rate decisions (Ranger skill loop, potion loop, Ranger action loop at 5ms, equipment loop at 25ms) move to Design Notes → `Scheduler.js`. The inventory is `al_loops()` |

### C1.2 Prune what is kept

- **Diagnostics.md**: drop the traps that are now history. Trap 4 (the prefix filter) is history after 6.2, and trap 3's dead counters go with C2. Keep what still helps someone read `errors.json` today.
- **Design Notes**: remove notes on code this plan deletes, in the same commit as the deletion.
- **CLAUDE.md**: the file map loses the probes and the dependency graph (C1.3). References, the Testing section and any mention of the deleted docs are updated.
- **Links**: grep every `.md` and the memory files (`C:\Users\jaysu\.claude\projects\d--AdventureLand\memory\`) for the deleted names, and fix each link.

### C1.3 Tools and test artefacts

- `Tools/Crypt Probe.js`, `Tools/Drag Probe.js`: one-off probes, never loaded. Delete.
- `Tests/dependency_graph.json` and `Lint.py --graph`: nothing reads the file. It existed to show which load-time edges could race in the parallel batch, and the boot kernel ended those races. Delete the file and the flag; `Analyze.js` keeps computing the stage check.
- `snapshots.jsonl.old` (untracked): it is the sink's rotation, so add it to `.gitignore`.

**Checklist**
- [x] C1.1 Overhaul Plan → Design Notes Decisions, CLAUDE.md (every-commit checklist); deleted
- [x] C1.1 Combat Plan → Design Notes (Measured constants, Considered and rejected, Ideas; the packing and positioning results in Healer and Warrior Movement), Game API Reference (courage and fear); deleted
- [x] C1.1 Data and Farming Plan confirmed covered (Data Store bands and score); deleted
- [x] C1.1 Party Console Review triaged (4 done, 4 moot, 15 open into Ideas not yet measured; it also found the dead `tracktrix` keep entry, removed); deleted
- [x] C1.1 Decision Ownership → Architecture; deleted
- [x] C1.1 Loop Cadence → Design Notes (`Scheduler.js`, loop rates); deleted
- [x] C1.2 Diagnostics pruned to the reading guide and the lessons; links fixed; memory updated (the overhaul review memory retired, the load-race memory rewritten)
- [x] C1.3 probes, dependency graph and `--graph`, `.gitignore`

---

## C2. Dead code

### C2.1 Console commands that aren't registered

Only 5 files call `console_api()`, so `al_help()` misses most of the console entry points: `al_errors`, `al_errors_clear`, `al_boss_profiles`, `heal_report`, `chest_report`, `survey_status`/`survey_retry`/`survey_move_on`/`survey_reset`, `lolipop_push`/`lolipop_push_stop`, `crypt_threat_report`, `stop_crypt_route`, `reset_dungeon_runs`, `sort_all_bank`, `set_gold_interval`, `ui_window`. Register each in its own file, so the unreferenced-global count (C0.3) can tell them from dead code.

### C2.2 Unreferenced globals (delete after the C4.1 check)

| Symbol | Where | Why it's dead |
|---|---|---|
| `get_num_targets` | Combat Utilities.js:63 | No caller; a third copy of the aggro count (§C5.1) |
| `mainhand_in_flight` | Equipment Manager.js:68 | No caller |
| `run_spider_dungeon`, `start_spider_dungeon_when_ready` | Spider Dungeon.js:39 | Only the toolbar buttons called these, and those went in `fd5a114` |
| `run_crypt_dungeon`, `start_crypt_dungeon_when_ready` | Crypt Dungeon.js:54 | Same |
| `crypt_camp` | Crypt Dungeon.js:74 | No caller (check the crypt waypoint console use first) |
| `crypt_waypoint`, `crypt_route_running` | Crypt Route.js:38, 48 | No caller |
| `DUNGEON_TOWN_CHANNEL_MS` | Dungeon Escape.js:5 | Never read |
| `PRIM_FARM_FALLBACK` and its branch | Bscorpion.js:15-20 | desertland's bscorpion spawn has a boundary in `data.js` |
| `STATE_CACHE_LOOP_ENABLED` and "SECTION 4: LOOP TOGGLES" | Global Config.js:285; Character Messaging.js:158,160; Stats Window.js:197 | Only ever set to `true` |
| `__al_runner_started` (×2) | Character Runner.js:125, Merchant.js:6 | `kernel_boot()` already refuses a second boot, and both run only from a boot step |

`experiment_value` is unreferenced only because no experiment is running. It stays: it's the hook. `kernel_boot` is called by Bootstrapper and `STORAGE_KEYS` is a register; neither is dead.

### C2.3 Dead branches and parameters

- **`defense_reduction()`** (Combat Formulas.js:5): the `typeof parent.damage_multiplier` guard and the hand port after it. The game always defines `damage_multiplier` (`common_functions.js:735`), and the port only ever ran in the harness (C0.2). It becomes `return damage_multiplier(defense)`, or callers call it directly.
- **`monsters_matching()`** (Combat Utilities.js:23): 7 filters no caller passes: `min_level`, `max_level`, `min_xp`, `max_xp`, `max_att`, `path_check`, `status_effects`. It sits on the combat hot path, and the goldens pin `target` and `targets.in_range`.
- **The weapon chooser's hold and margin** (Equipment Valuation.js:339-349, constants at :213-214): Ulric and Riva set `weapon_hysteresis_ms: 0` and `weapon_switch_margin: 1.0`, and Myras has one weapon set. Both branches are dead. Remove them, the two constants and the two config keys; `min_swap_interval_ms` stays. This matches the standing rule never to add a margin or hold to the weapon chooser.
- **`smarter_move()`** (Movement Manager.js:66): `interrupt_reason` is written and never read; `interrupted` mirrors `settled`; `smart._interrupt` repeats `complete()`'s cleanup and can be `reason => complete(false, reason)`. Check every caller before dropping the number and string destination forms (:103-124); the audit found only `{map, x, y}` callers.
- **`auto_combine_item()`** (Merchant Upgrading.js:582-588): the third `offeringp` check can't fire, because the line before proves one is held.
- **DPS Meter** (`dps_meter_hit`, DPS Meter.js:56): the nine top-level totals (:20-21), every `sum_*` field, and the heal, mana, return, reflect and damage-taken series are recorded and never shown. So are the `Dmg Taken` branches in `get_type_value`, `dps_cell` and `dps_total`. About 104 lines become about 20 (see also §C6.4).
- **Bus topics with no listener**: `hit` (Decision Log.js:126), `encounter_enter`/`encounter_leave` (Encounter Registry.js:71,76). Either give `hit` its listeners (§C6.5) or delete the emits.
- **State cache fields nobody reads**: `name`, `moving`, `speed` (only the out-of-view fallback reads it, where it can't matter) and `max_xp` (it is `G.levels[level]`). See §C6.2.

### C2.4 Copies that collapse to one

These are dead in effect: one copy stays, the rest call it.

- `dungeon_channelling()` (Dungeon Escape.js:63) is `town_channelling()` (Movement Manager.js:43).
- `is_teleporting()` (Movement Manager.js:15) is a bare alias of `is_transporting(character)`. Inline it.
- `heal_target_entity()` (Combat Sampling.js:199) and the inline copies at Combat Sampling.js:149 and Healer Combat.js:125 are `get_entity(id)`.
- `Number.isNaN(data.gold)` in three loot handlers (Gold Meter.js:44, Stats Window.js:76, Session Metrics.js:209): `!data.gold` is enough, as the Farm Ledger already does.

### C2.5 Config knobs

There are 21 `*_enabled: true` keys in the role configs that nothing ever turns off. They're tunables, not bugs: **the user's call**, one decision for all of them. Removing them removes the `if (CONFIG.x.y_enabled)` checks too. `CONFIG.combat.sample_hits` is `true` on all three fighters and missing on Riff, so it really means "is a fighter". Replace it with a role check, or don't register the samplers on the merchant (Combat Sampling.js:53, Equipment Valuation.js:295, Healer Skills.js:241, Warrior Combat.js:20).

### C2.6 Commented-out code: the user decides, item by item

Global Config.js:36 (fireroamer location) and :117-119 (icegolem, crabxx, wabbit events) · Maintenance.js:47-56 (`suicide()`) · Bscorpion.js:282-285 · Healer Skills.js:27 · Warrior Skills.js:35-41 (charge, hardshell; their config keys stay while this does) · Warrior Config.js:117-149 (about 20 gear entries) · Merchant Upgrading.js:29 (frankypants profile).

**Checklist**
- [ ] C2.1 console commands registered
- [ ] C2.2 unreferenced globals removed (counter at 0)
- [ ] C2.3 dead branches: damage formula, filters, weapon hold/margin, `smarter_move`, combine check, DPS Meter, bus, cache fields
- [ ] C2.4 copies collapsed
- [ ] C2.5 knobs (user's decision recorded)
- [ ] C2.6 commented-out code (user's decision per item)

---

## C3. Error handling that hides errors

The kernel already isolates and reports. `every()` runs each body through `run_loop` (Scheduler.js:58) and `on_socket()` wraps each handler in `guarded()` (Events.js:7), and both report to `catcher`. A try/catch inside them only adds a way to lose the error. Fix these first: after C3, errors that were invisible start showing up in `errors.json`, and some will be real bugs. **Expect new error buckets after the reload that ships C3, and read them before C4.**

- **C3.1 Empty catches around kernel-caught code (16):** Boss Profiler.js:338-340 · Combat Sampling.js:136, 167, 304, 317, 319 · Movement Manager.js:12, 38, 39 · Global Config.js:98 · Loot Management.js:40 · Character Runner.js:188-189 (a try around `catcher` itself) · Error Handling.js:53.
- **C3.2 Catches that only `console.error` (9):**
  - Character Runner.js:177, the **main tick**: its errors never reach the error log or `al_loops()`.
  - Character Messaging.js:26, 83, 87
  - Dungeon Entry.js:95
  - Dungeon Progress.js:92
  - Dungeon Telemetry.js:123
  - DPS Meter.js:156
  - Equipment Manager.js:217, which also turns every real error into `{ reason: "invalid" }`

  Delete each try and let the kernel report.
- **C3.3 Loop bodies that wrap themselves to get a 10ms retry:** Character Runner.js:76, 117 · Healer Skills.js:42, 59 · Ranger Skills.js:134 · Warrior Skills.js:43 · Character Messaging.js:152 · Merchant Task Loop.js:166. Give `every()` one `retry_ms` option, so a body that throws comes back at the retry rate, and remove the eight wrappers.

**Keep** (legitimate):
- the Storage.js boundary (6) and the kernel's own isolation;
- `Skill Runner.js:18` (one skill throwing mustn't stop the table);
- the `errlog_*` and Decision Log recorders (they promise never to throw into their caller);
- game calls that reject as a normal refusal, and the merchant task catches that report to `catcher`;
- the 27 fire-and-forget `.catch(() => {})`.

**Checklist**
- [ ] C3.1 empty catches (counter down)
- [ ] C3.2 console.error catches (counter down)
- [ ] C3.3 `every()` retry option, wrappers removed
- [ ] reload read: new error buckets triaged

---

## C4. Guards and fallbacks

**Evidence that makes these removable:**
- The server zeroes every character stat (`calculate_player_stats`, `server.js:1073-1110`) and sends them all to the character itself (`server.js:676-723`).
- It sets `player.s = {}` and `player.c = {}` (`server.js:842-843`), and our own code already reads `m.s.cursed` unguarded.
- `get_party()` is `parent.party` (`runner_functions.js:761`).
- Every `CONFIG` section is checked by lint.

Work file by file, worst first: Combat Sampling (about 22), Combat Formulas (19), Error Log (16), Ranger Combat (11), Character Runner (10), Healer Equipment (9), Rime Djinn (9), Targeting (9), Boss Profiler (9). Each file is one commit with `check`.

- **C4.1 Fallbacks on values that always exist (about 120):**
  - `character.<stat> || 0` (64 sites)
  - `.s || {}` / `.s &&` (15)
  - `get_party() || {}` (5)
  - `G.monsters &&` (7)
  - `CONFIG.<section> &&` and `?.` on config (about 10)
  - cache sections that are always set (about 8)
  - monster `hp || 0` (about 12, lowest priority)
- **C4.2 Optional chaining on objects that always exist (29 links):** for example World Events.js:21 (`parent?.S?.`, `character?.s?.`), Loot Management.js:178-184, Rime Djinn.js (6), Bscorpion.js (4), Combat Sampling.js:13-14.
- **C4.3 Impossible states (about 30):**
  - `character && character.name` (Error Log ×4, Global Config.js:267)
  - `parent.pings &&`
  - `!data` on socket payloads the server always sends (about 15)
  - `max_hp &&` before a division
  - `if (!_errlog.samples)` after the store is built
- **C4.4 Double checks (about 12):**
  - Warrior Skills.js:209 `!tank` (the table's `wanted` already checked it)
  - Warrior Skills.js:23 pause (every warrior skill is `gate: "combat"`, so `run_skills` asks again)
  - Movement Manager.js:11, a try around a promise that already has a `.catch`
  - Party Cohesion.js:231 `Promise.resolve(parent.push_deferred(...))`
  - Error Log.js:265, 275, tries around `errlog_count`
  - Merchant Party.js:37 and Merchant Upkeep.js:43 check `player.map === character.map` after `get_player()`, which only returns entities on our map
- **C4.5 Structural fixes, so the guard has nothing to protect against:**
  - Movement Manager.js:37, 67 `typeof smart._interrupt`: install a no-op `smart._interrupt` in the boot step.
  - Dungeon Runner.js:392, 399 `typeof window[d.route]`: Crypt Dungeon and Crypt Route are optional separately. Have `DUNGEONS.crypt` take the function from Crypt Route's own registration, or give Crypt Dungeon's step `needs: ["Crypt Route"]`.
  - Equipment Valuation.js:289 `weapon_min_swap_attacks ?? 0`: Myras lacks the key, so add it to `EQUIPMENT_DEFAULTS`.
  - Error Log.js:438, 448 `cache &&`: Global Config declares `var cache = null`; give it a neutral `{}` default.
  - Character Runner.js:130, 148, 185, 193 (`spec || {}`, `typeof s.update_cache`, `s.loops || []`, `s.intervals || []`): all three fighter specs pass these. Keep only the optional hooks (`on_disabled`, `pre_move`, `skip_panic_check`).
  - Game Log.js:102 `typeof parent.add_log` and Merchant Inventory.js:44 `typeof sale.catch`: the game always provides both.

**Keep:**
- Item `.level || 0` (stackables have no level).
- Counter accumulators (`map[k] || 0`).
- Restored storage data.
- `find() || null`.
- Optional monster and skill data (`e.armor`, `G.skills[x].mp`).
- `character.bank` (only exists inside the bank).
- Real type checks (`typeof destination === "string"`).
- The legitimate guard kinds in CLAUDE.md.

**Checklist**
- [ ] C4.1 fallbacks, file by file
- [ ] C4.2 optional chaining
- [ ] C4.3 impossible states
- [ ] C4.4 double checks
- [ ] C4.5 structural fixes
- [ ] Architecture.md and CLAUDE.md guard sections still true

---

## C5. Native game functions

Ranked by value. "Same" means the two implementations were read side by side and give the same answer for every input the bot passes.

| # | Ours | Native | Same? | Notes |
|---|---|---|---|---|
| 1 | `free_inventory_slots()` (Combat Utilities.js:75, 17 calls) | `character.esize` (`server.js:1163`) | Same whenever the bag has its 42 slots (the server pads to 42) | Merchant Gathering.js:47 "bag full" is `character.esize <= 0` |
| 2 | `defense_reduction()` (Combat Formulas.js:5) | `damage_multiplier()` (`common_functions.js:735`) | Same, band for band | C2.3. **Keep `pierced_defense()` subtracting piercing twice**: the server does too (`server.js:3041-3044`, `:3473`) |
| 3 | Hand loops in `count_dungeon_keys` (Dungeon Runner.js:462), Merchant Upkeep.js:16-18, Lolipop Push.js:148 | `quantity(name)` (`runner_functions.js:260`) | Same | |
| 4 | Hand loops in `has_dungeon_key` (Dungeon Runner.js:459), Merchant Crafting.js:16, Merchant Upgrading.js:548/576, Healer Equipment.js:156, Equipment Manager.js:265, `find_in_inventory` (Merchant Gear.js:15) | `locate_item(name)` (`runner_functions.js:251`) | Same | `inventory_slot()` (Merchant Upgrading.js:67, 12 calls) returns `null` where `locate_item` returns `-1`: convert the callers in the same commit. `bag_slot`/`stock_of` stay (they filter by level) |
| 5 | `upgrade_grade()` (Lolipop Push.js:117) | `calculate_item_grade(def, {level})` (`common_functions.js:682`) | Same for all 376 upgradeable or compoundable items | The server uses the native one itself |
| 6 | `dungeon_type_alive()` (Dungeon Targeting.js:36), Dungeon Runner.js:229 | `!!get_nearest_monster({ type })` | Native is stricter: visible only | Fixes stale references to monsters that have left view |
| 7 | `passage_step` raw `transport` emit (Party Cohesion.js:230) | `transport(to, spawn)` | Same request; the native adds a 20s background poll | Call it without awaiting |
| 8 | `delay()` (Global Config.js:202, 54 calls) | `sleep()` (`common_functions.js:2034`) | Byte for byte | Cosmetic; do it with the C7 wait helper or not at all |
| 9 ⚠ | `monsters_targeting_me()` (Party Management.js:40, 8 calls), `count_my_aggro()` (Healer Combat.js:84), inline copies (Danger Log.js:57-60, Dungeon Telemetry.js:47-51) | `character.targets` (`server.js:693`, kept by `increase_targets`/`reduce_targets`, `:11586`) | **No.** The server counts every monster targeting us, off-screen included; ours counts only what's in view | Panic and Myras's pull cap would start counting chasers we can't see. Probably more correct, but it changes behaviour: user's go-ahead and `compare`. The server also tracks `targets_p`/`targets_m` (physical and magical attackers), which danger projection could use later |
| 10 ⚠ | `potion_tick()` (Maintenance.js:17) calls `use("hp")` and then waits a fixed 2050ms | `use_skill("use_hp")` and `is_on_cooldown("use_hp")` | Thresholds stay ours; the native `use_hp_or_mp()` drinks at any deficit, so don't adopt it | Gating on the real cooldown can drink up to 50ms sooner. Mana is the binding resource, so measure it |
| 11 ⚠ | mluck range (Merchant Party.js:27), centre distance | `is_in_range(e, "mluck")`, edge distance as the server checks | No: native reach is larger by the hitboxes | Fewer refusals and walks; merchant only |
| 12 ⚠ | `find_nearest_bscorpion()` (Bscorpion.js:51, 9 calls) | `get_nearest_monster({ type: "bscorpion" })` to pick | No: native picks by edge distance and requires visibility | Pick with the native, keep `Math.hypot` for the camp geometry's `.distance`. At the current farm, so it is the user's call |
| 13 ⚠ | `World Events.js:47` raw `join`; Bank Sort Order.js:452, 481 raw bank emits with a 150ms sleep | `join()`; `bank_retrieve()`/`bank_store()` | `join()` hands off to `parent.join`, which isn't in the cached sources; the bank wrappers wait for the reply | Verify `parent.join` live first |

**Keep:**
- `smarter_move` (timeout, arrival radius, interrupt, plot injection).
- The Equipment Manager emits: they register the reply wait first, because of the `equip_batch` reply mismatch.
- The stomp and cleave bursts.
- `handle_looting()`: it opens up to `chest_threshold × 5` chests per pass where the native `loot()` opens 2. The native also skips a chest holding more items than we have free slots; whether to adopt that is the user's call.
- `skill_mp_cost()`: the client has no equivalent.
- `ms_to_next_skill`: it adds a ping lead.
- `send_cm`: it already sends over localStorage between local pages (`runner_functions.js:1066`).

**Checklist**
- [ ] C5 rows 1–8 (no behaviour change)
- [ ] C5 rows 9–13, each with the user's go-ahead and a `compare`

---

## C6. Party state and the information the bot gathers

### C6.1 What the game already tells us

| Source | Covers | Freshness |
|---|---|---|
| `get_player(name)` / `parent.entities` | A teammate **in view on our map**: hp, max_hp, mp, max_mp, xp, level, speed, rip, target, s, c (`c.town`), x, y, moving, going_x/y, slots, ctype (`player_to_client`, `server.js:596-646`) | Live |
| `parent.party` (`party_update`) | Every member on any map: x, y, map, in, level, type, rip, loot share | Every **60s**, plus immediately on death, respawn, revival and join/leave (`server.js:13498-13506`). **Not** on a map change, so map, x and y can be a minute stale. Only `rip` is prompt |
| Only to the character itself | gold, max_xp, targets, esize, cc, map, in | Live, but not visible to teammates |
| Never sent | Session totals (`player.t`), bot state (goal, formation, pause, timers) | — |

**So the shared state cache stays.** No native source gives a teammate's HP, map or position across maps in under a minute, and none gives bot state. What can change is how it's read, and its size.

### C6.2 One accessor, live first

Three readers each merge cache and live data their own way: `leader_position()` (Party Cohesion.js:80) merges live position with cached flags, `dreams_member()` (Dreams Cave.js:370) returns live position and drops the cached fields, and the other 23 readers use the cache only. Replace all of them with one `party_state(name)` in Character Messaging.js: the cached record, overlaid with the live entity's fields when `get_player()` sees it.

⚠ **This changes behaviour, slightly.** Readers that use only the cache today get live HP and position whenever the teammate is in view:
- `party_member_in_danger()` (Party Cohesion.js:48), which reads HP up to 500ms old at a close call
- `fighter_down()`
- `party_cohesion_hold()`
- Danger Log's `danger_party`
- Dreams and Dungeon Entry

A page that has frozen but whose character is still in view would now count as present. Goldens that read these will change, because their inputs get fresher. Land it alone, and give it a `compare`.

### C6.3 A smaller cache

- **Drop:** `name`, `moving`, `speed`, `max_xp` (§C2.3).
- **Replace:** `paused` with the existing `AL_automation_paused_<name>` key (Global Config.js:261-276), read through `automation_enabled(name)`.
- **Shrink:** `conditions` (the whole of `character.s`, read only for `mluck.ms` at Merchant Party.js:12) to one `mluck_until` timestamp.
- **Result:** 22 fields plus `last_seen`. Today the change check rarely skips a write, because the condition timers and positions change constantly. Without `conditions` it can skip when idle. The saving is small (localStorage writes measure under 5ms), so the gain is clarity.
- **Session Metrics.js:167** reads its *own* cache only for `goal`, a workaround for a load race that no longer exists (loops now start in boot steps). Use `current_goal_label()`. This also stops the live feed's goal going blank 15s after a stall.

### C6.4 Meters that count the same thing twice

- **Kills:** Kill Tracker.js:27 counts `kill_credit` exactly as `metrics.kills` (Session Metrics.js:207) does, from the same start. Kill Tracker reads `metrics`.
- **Chest gold:** `data.gold / parent.party[me].share` is computed in Gold Meter.js:43, Session Metrics.js:208 and Farm Ledger.js:100. One `chest_gold(data)` helper.
- **XP:** three pollers of `character.xp` (XP Meter.js:107, `metrics_track_xp`, Farm Ledger's `xp_gained`). There is no XP event. One poller, the ledger's version that handles level-ups, feeding the other two.
- **Damage per member:** DPS Meter and Session Metrics both build it from `hit`. After §C2.3 trims the DPS Meter, it reads Session Metrics' per-member, per-kind totals. Low priority.
- **Keep:** CC Meter (native `character.cc`), Boss Contribution (native `s.coop.p`, constants match `server.js:2390-2408`), Party Frames (the game's party data has no HP; move it to `party_state()`), the Farm Ledger, Combat Sampling, Danger Log, Decision Log and Boss Profiler (none of them has a server equivalent).

### C6.5 One normalised hit

12 handlers subscribe to the socket's `hit`, and each re-derives attacker, target, kind (burn, splash, base) and party membership. The kind test alone is written four times: DPS Meter, Session Metrics.js:59, Boss Profiler.js:123, Rime Djinn.js:186. The Decision Log already normalises the hit and publishes it on the bus as `hit`, but nothing listens.

Move the meters and loggers onto `bus_on("hit")`, adding `kind` and party membership to the normalised record. Combat Sampling's two handlers stay on the socket: the in-flight ledger must run exactly and first. Pure refactor, one subscriber per commit.

### C6.6 Two things to check live

- `original_on_cm` (Character Messaging.js:20) wraps the runner's default `on_cm`, which writes "Received a code message from: X" to the game log (`runner_compat.js:41`). If it does that in the live client, every CM logs a line. Check the in-game log; if it's there, drop the default.
- `send updates` (Character Messaging.js:173) asks the server every 20s to resend every entity's position (`send_all_xy`, 12 call cost). It's cheap, but nothing records why it exists. Find out, then document it or remove it.

**Checklist**
- [ ] C6.2 `party_state()` ⚠
- [ ] C6.3 cache shrunk, `paused` and `mluck_until`, Session Metrics goal
- [ ] C6.4 meters share one count each
- [ ] C6.5 hit consumers on the bus
- [ ] C6.6 `on_cm` default and `send updates` checked

---

## C7. Simplification

Most of the longest functions are long for reasons Design Notes records, and they stay: `travel_arbiter`, `movement_goal`, `should_pause_combat_loop`, `event_goal`, the Rime stomp timing, `stuck_escape_check` and `consolidate_stack_group`. These are the real simplifications, ranked by value against risk:

1. **One wait helper.** `dreams_until(done, ms)` (Dreams Cave.js:148) is already the general form. Thirteen hand-written polls do the same:
   - `wait_for_bank` (Loot Management.js:260)
   - `wait_for_movement_to_settle` (Merchant Inventory.js:72)
   - `wait_until_on_map`, `wait_for_party_at_entrance`, `wait_for_party_out` (Dungeon Entry.js)
   - the crypt calm and mana holds (Crypt Route.js:244, 263)
   - Riff's arrival (Dungeon Collection.js:43)
   - `bank_op` (Bank Sort Order.js:226)
   - the gathering channel wait (Merchant Gathering.js:73-81)

   Move it to `Kernel/Scheduler.js` as `wait_until(done, ms, poll)`. The two "drain until zero or N idle rounds" loops, `dungeon_loot_everything` (Dungeon Runner.js:110) and the collection drain (Dungeon Collection.js:69), become one.
2. **One merchant task wrapper.** Eight tasks repeat `if idle … begin_task … try … catch catcher … finally end_task`. A `run_task(label, body)` that passes `abandoned()` in replaces them. Merchant Gathering's `finally` (:96-104) rewrites `end_task` by hand and equips the default gear twice. Its five stop checks (:31-54) become a list of `[test, message]` pairs.
3. **One aggro count and one monster census.** One `monsters_targeting(name)` with the dead check (§C5 row 9 decides whether ours means `character.targets`). Danger Log.js:56, Error Log.js:76 and Dungeon Telemetry.js:19/44 each count "monsters within a radius, and those targeting me" by hand; that becomes one `monster_census(radius)`.
4. **The merchant's "am I at the spot" check**, written 7 times (Crafting:25, Gathering:20/43, Lolipop Push:95, Stand:40, Upgrading:323, Upkeep:7), is `simple_distance(character, spot) > tolerance` (`common_functions.js:1101` returns 9999999 across maps). Confirm `simple_distance` is reachable from the code iframe first.
5. **`auto_combine_item()`** (Merchant Upgrading.js:502, 106 lines, to about 60):
   - Key the buckets by name: `lvl` is always `level`.
   - Merge the two copies of the primling check (:546, :574).
   - Drop the `typeof item.level` test, which `item.level !== level` already covers.
   - `pick_three_slots` becomes a `flatMap` and `slice(0, 3)`.

   `withdraw_upgradeable_items()` (:322) repeats one withdraw-by-level loop three times; that becomes one helper.
6. **`smarter_move()`**: the interrupt and settle cleanup from §C2.3, done as its own commit (travel path, not pinned).
7. **`travel_arbiter()`**: only the accidental parts. The goal distance is computed twice (:154, :162), and `_travel.active = false; travel_release()` appears three times.
8. **Two "wait at camp up to N ms for a condition" functions**, `supershot_setup_ready` (Ranger Skills.js:21) and `dark_blessing_synced` (Healer Skills.js:70), become one.
9. **`sort_bank_floor()`** (Bank Sort Order.js:412): it recurses through `delay().then` with loop state in four parameters, and filters out the gold pack four times. It becomes an `async while` loop.
10. **`dreams_floors()`** (Dreams Cave.js:569, 117 lines): split out the escort and objective step functions, and keep one `await` at the bottom. It runs once a day and can only be tested live, so it goes last.

**Not in this plan:** merging the two equipment planners (`batch_equip` for the rules loop and the merchant, `plan_set_equip` with `emit_equip_ops` for bursts). They differ on the reply wait and the in-flight check, and it is the code with the most past incidents. Revisit only with a new burst golden for every path.

**Checklist**
- [ ] C7.1 `wait_until`
- [ ] C7.2 `run_task`
- [ ] C7.3 aggro count and census
- [ ] C7.4 merchant at-spot
- [ ] C7.5 combine and withdraw
- [ ] C7.6 `smarter_move`
- [ ] C7.7 `travel_arbiter` dedupe
- [ ] C7.8 camp wait
- [ ] C7.9 `sort_bank_floor`
- [ ] C7.10 `dreams_floors`

---

## C8. Close-out

- The unreferenced-global, empty-catch and `console.error` counters are at zero (or at their documented legitimate floor), and baselined.
- CLAUDE.md, Architecture and Design Notes describe the code as it is. Design Notes has no section for deleted code.
- The ⚠ items each have a recorded verdict, or are recorded as declined.
- This plan is deleted. Anything left undone moves to Design Notes' "Ideas not yet measured".

---

## Order and size

C0 → C1 → C2 → C3, with a reload read after C3 → C4 → C5 rows 1–8 → C6.3–C6.6 → C7. The ⚠ items (C5 rows 9–13 and C6.2) go when the user picks them, one at a time, each with its `compare`.

| Phase | Commits (about) | Risk |
|---|---|---|
| C0 | 3 | none |
| C1 | 6 | none |
| C2 | 8 | low; pinned where it's combat |
| C3 | 4 | low; surfaces hidden errors |
| C4 | 12 (file groups) | low with `check`; the fixture caveat in C0.1 |
| C5 | 8, plus 5 ⚠ | low; ⚠ items measured |
| C6 | 6, plus 1 ⚠ | low–medium (meters are UI) |
| C7 | 10 | low–medium (unpinned paths go in small steps) |

## Decisions the user owns

**Decided 2026-10-16:** every ⚠ item is approved (rolled out one at a time: `character.targets`, then the potion gate, then `party_state()`, then the four smaller items together, each measured before the next; the queued ones wait on the `cleanup-queue` branch). The `*_enabled` switches are removed. Commented-out code: keep the icegolem, crabxx and wabbit event entries; remove the rest, with charge and hardshell's config keys. Looting stays as it is. The survey tooling stays.


1. The ⚠ items: `character.targets`, the potion cooldown gate, the mluck range, picking bscorpions with the native function, the native `join` and bank calls, and `party_state()`.
2. The 21 `*_enabled` knobs (§C2.5): keep or remove, one decision.
3. Each commented-out block (§C2.6).
4. Whether looting should skip a chest that holds more items than we have free slots (the native `loot()` does).
5. Whether the survey tooling (`Farm Survey.js`, the `survey` lane and report) stays. The survey is finished, but it can be run again for a new spot list.
