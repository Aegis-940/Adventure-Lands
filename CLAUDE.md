# CLAUDE.md — Claude Code Instructions for Adventure-Lands

## Project Summary

Adventure-Lands is a **browser-injected JavaScript game automation bot** for the AdventureLand MMO. It controls a party of 4 characters (Warrior, Healer, Ranger, Merchant) through role-based scripts loaded directly into the game client. There is no build system, bundler, or Node.js runtime — all code runs in the browser.

The code has no comments by convention, so the reasoning behind each system (mechanics, tuned numbers, past incidents) lives in [`Design Notes.md`](Design%20Notes.md). **Read a file's section there before changing it.**

---

## Environment & Constraints

- **No package.json, npm, build pipeline, or module system.** No `import`/`export`/`require()`. Files are fetched by the Bootstrapper or injected into the game client.
- **Two load mechanisms that scope differently:**
  - `Core Systems/`, `Dungeons/` and `Interface/` load in parallel as real `<script>` tags, so their top-level `const`/`let`/`function` are all global.
  - `Character Managers/**` load sequentially through **indirect eval**. `var` and `function` go global, but a top-level `const`/`let` is invisible to sibling files. Anything shared between two files of the same character must be `var` or `function`. Getting this wrong fails silently at runtime, not at load.
- **Nothing runs at load.** Every file's top level is declarations and registrations: `on_boot("File Name", fn)`, `console_api({...})` and `DUNGEONS.x = {...}`. The work goes in the file's boot step. After every script has loaded and the role files are evaluated, the Bootstrapper calls `kernel_boot()`, which runs the steps once, **in Bootstrapper list order**: the kernel stage, the first stage, the parallel batch (Error Log first), then the role files, with the entry point (`Warrior`, `Healer`, `Ranger`, `Merchant`) last. A throwing step is named in the game log and `al_boot()`, and the rest still run. The ratchet in `python Tools/Lint.py` fails any new top-level statement outside `Kernel/`.
- **A registration at load must name an earlier stage.** Files within one stage run in arrival order, so `on_boot()` works at load only because `Kernel/` is its own stage, awaited before the first stage. Lint reports any call made at load to a function defined in the same or a later stage (`STAGE …`), and `node Tests/Harness.js load` boots every role a second time with each stage reversed.
- **A top-level initializer may only name what has already loaded.** `Merchant Task Loop.js` builds `PRIORITY_CHECKS` from the `should_run_*` functions, so it loads last. A failing initializer throws inside the eval and the file defines nothing, silently.
- **Scripts arrive in network order, but nothing runs until boot.** Before the kernel, the parallel batch *ran* in network-completion order, and adding or removing an entry could expose a load-time dependency that had been winning by luck (deleting `Server Watch.js` broke the DPS meter this way). Now order only matters among boot steps, and those follow the list. The remaining load-time hazard is a top-level *initializer* that calls another file (`var x = f()`): lint counts these as `call_initializers`. The one left on purpose is the merchant's `CONFIG`, which reads storage and is used on the following lines; role files evaluate after every shared script anyway.
- **Loops, handlers and storage go through `Kernel/`:** `every(name, { ms, kind, fixed })` for timers, `on_socket(event, key, fn)` / `on_character` / `on_dom` for subscriptions, `wrap_parent(name, make)` for overriding a game-window function, and `storage_*` for localStorage. Socket and DOM handlers are kept under a fixed key on their target and replaced, never stacked, because the game window outlives the code iframe. Self-rescheduling `setTimeout` loops and `while (true)` loops (the combat loops among them) are not converted yet; that is the measured step 1.2b of `Overhaul Plan.md`.
- **If it's written correctly, you don't need guards.** Don't add `typeof x === "function"`/`!== "undefined"` checks or defensive fallbacks; treat any you find as a symptom and fix the cause. There are three legitimate kinds of guard, and they are the only acceptable reasons:
  - `Code Loader.js`, which runs standalone in a code slot before anything else exists
  - the game's optional callbacks (`on_cm`, and `heal`, which only a priest has)
  - optional callback *parameters* (`on_done`, `farm_step`, `context`), which are an API contract, not defence

  Everything else has a structural fix:
  - **Needed everywhere:** declare it in `Global Config.js` with a neutral default. These must be `var`, because character files re-declare the same names through eval, and a classic-script `const` would make that a SyntaxError.
  - **Optional or one-role-only:** add a no-op stub in `Global Config.js` that the real file overwrites (`errlog_*`, `request_delivery`, `upgrade_slot_for`, …).
  - **Waiting on DOM another file creates:** poll for the element and retry (the toprightcorner button chain).
  - **A required script** (anything not in the Bootstrapper's `OPTIONAL_SCRIPTS`): it cannot be absent, because a load failure aborts the bot, so a guard on it is dead code.
- **Game globals are not bugs:** `character`, `parent.G`, `parent.entities`, `parent.S`, `parent.socket`, and jQuery as `parent.$`/`window.jQuery`. Code runs in iframes; `parent.*` is the game's top-level scope.
- **No logical assignment operators** (`??=`, `||=`, `&&=`): the client's engine rejects them and the whole file fails to eval.
- `"Common Variables.js"` has been deleted. Don't reference or recreate it.

---

## File Map

Detail for every non-trivial file is in [`Design Notes.md`](Design%20Notes.md). The overall architecture is in [`Architecture.md`](Architecture.md).

**Loader**

| File | Role |
|------|------|
| `Code Loader.js` | The only file in a game code slot (slot 1). Evals `Bootstrapper.js` from jsDelivr, falling back to githack at the same SHA, and sets `window.__AL_BASE__` |
| `Bootstrapper.js` | Loads everything else from `__AL_BASE__`: the kernel stage and then the first stage, each awaited, then the parallel batch, then the role files, then `kernel_boot()` |

**Kernel** (its own stage, awaited before the first stage; declarations only)

| File | Role |
|------|------|
| `Kernel.js` | `on_boot()`/`kernel_boot()`: the boot phase. `al_boot()` reports what ran, skipped and failed. `console_api()`/`al_help()` list the console entry points |
| `Scheduler.js` | `every()`, the only interval; `stop_loop()`; `al_loops()` lists every loop with its kind, rate, runs and last error |
| `Events.js` | `on_socket`/`off_socket`, `on_character`, `on_dom`, `wrap_parent`, `parent_slot`, and the internal bus `bus_on`/`bus_emit` |
| `Storage.js` | The only code that touches localStorage (`storage_read/write`, `storage_raw_read/write`, `storage_remove`, `storage_keys`), and `STORAGE_KEYS`, the register of every key prefix |

**Core Systems** (shared by all four characters)

| File | Role |
|------|------|
| `Global Config.js` | **First stage.** Constants, party constants, shared fighter defaults, `var` declarations of every cross-character symbol, and no-op stubs |
| `Movement Manager.js` | `movement_goal()` (where to go) and `movement_local()` (where to stand), `smarter_move()`, the travel arbiter, parked routes, `walk()`, stuck escape, and the town shortcut |
| `Movement Positioning.js` | `best_orbit_spot()`, `reposition_center()`, `orbit_reposition()`: scoring candidate spots around a centre. `orbit_away()`: the ring walk shared by the bscorpion camp and the crabxx kite |
| `Party Cohesion.js` | `follow_goal()` with the leader's breadcrumb trail, `party_cohesion_hold()`, `leader_position()`. Consulted by `movement_goal()`; moves nothing itself |
| `World Events.js` | Live boss/seasonal targets and the goal that walks the party to them |
| `Combat Utilities.js` | Entity queries, boss/party predicates, the Rime shell predicates, `should_pause_combat_loop()`, the lethal-monster rule (`must_not_touch()`) and the boss leash (`boss_strayed()`) |
| `Combat Formulas.js` | The server's damage/heal arithmetic, `skill_mp_cost()`, `incoming_dps()`/`endangered()`. Computes, never acts |
| `Combat Sampling.js` | Hit/heal telemetry and the in-flight damage ledger behind `remaining_hp(mob)` |
| `Targeting.js` | `score_targets()`/`select_target()`, the one target scorer |
| `Boss Profiler.js` | Per-fight profile of every player on a coop boss, written to `boss_profiles.jsonl`. `al_boss_profiles()` reads it |
| `Character Messaging.js` | CM handlers and the localStorage-backed state cache |
| `Equipment Manager.js` | The only thing that changes what is worn: sets, `batch_equip()`, the planner over the sent view, slot intent, rules resolver. Situational gear comes from `encounter_gear()` |
| `Equipment Valuation.js` | Measured set profiles and the one weapon chooser (`resolve_weapon_set()`). Equips nothing |
| `Party Management.js` | Panic (`set_panic()` is the only writer) and its broadcast, `scare_off()`, invites, home |
| `Loot Management.js` | Keep/ship/vendor decisions, bank withdrawal, chest looting, `inventory_sorter()` |
| `Maintenance.js` | Potions (one per tick, shared cooldown) and the periodic tab reload |
| `Character Runner.js` | `run_character()`, the shared main tick |
| `Farm Ledger.js` | 5-minute ledger windows (gold, chest gold, XP, kills, deaths, potions; at the farm spot vs away) and the daily tracker snapshot, archived through `errlog_archive()` |
| `Danger Log.js` | Every death and close call (HP under 30%): when, who, against what (killer, damage sources in the last 10s, biggest hit), and the state around it, archived to `danger.jsonl` |
| `Farm Survey.js` | The `*SURVEY*` farm target: 60 minutes at each spot in `SURVEY_SPOTS`, then `bscorpion`. Myras writes the state; every fighter switches `home` at runtime. `survey_status()`/`survey_retry(spot)`/`survey_move_on()`/`survey_reset()` in the console |
| `Error Handling.js` | `catcher()` |
| `Error Log.js` | Cross-character flight recorder; defines the real `errlog_*`. Read with `al_errors(true)` |

**Encounters** (everything specific to one monster, spawn or boss; see Phase 2 of `Overhaul Plan.md`)

| File | Role |
|------|------|
| `Encounter Registry.js` | **First stage.** `encounter(name, spec)` registers at load. Shared and role code ask `encounter_gear(group)`, `encounter_setting(name, fallback)`, `encounter_allows(action, mob)`, `encounter_rank(mob)` and `encounter_trait(name, mob)`, plus `encounter_home_setting(name, fallback)` and `encounter_goal()` for answers that follow `home` onto any map; the role default stays at the call site. `why("gear.weapon")`, `encounters_active()` and `encounter_problems()` in the console |
| `Porcupine.js` | Hazard: Ulric never attacks, cleaves or agitates near a porcupine and wears his single set within splash reach; Riva ranks them first. Optional: deleting its Bootstrapper line removes the behaviour |
| `Bscorpion.js` | **The current farm. Required, not optional.** The desertland camp: positioning (`camp_step()`, Riva's rail), temporal surge on each kill, the kill logger, and the spec: goal, gear, Riva's panic limit (a `home_settings` answer, so it follows home onto boss trips) and her always-shoot trait |
| `Rime Djinn.js` | **Required.** The shell: the predicates every fighter's targeting uses, Ulric's shell windows and deadline stomp (generic stomp stays in Warrior Skills), Riva's shell shot, the spawn gear and the hold weapon while a Djinn is held or shelled |
| `Mummy.js` | Spawn: Myras wears her luck orb and the `zap_on` ring and zap-pulls fresh mummies, and doesn't curse them; Ulric doesn't agitate them; Riva spends no mark or supershot on them |
| `Targetron-Sparkbot.js` | Spawn (the uhills targetrons and sparkbots): Myras's luck gear and no curse, the party's farm focus, Ulric agitates sparkbots |
| `Dryad.js`, `Fireroamer.js` | Spawns: Myras's mdef or fire-resistance gear, fireroamer's skipped panic check and agitate conditions, no ranger skills |
| `Halloween Bosses.js` | mrpumpkin and mrgreen: Myras tanks, Ulric taunts them onto himself and cleaves with one in reach, single-target sets for Ulric and Riva |
| `Crabxx.js` | The kited boss (event off today) and its crabx adds: AOE sets, Myras tanks, Riva shoots adds only once targeted, Ulric agitates a pack of five |
| `Monster Rules.js` | Single monster types with a rule or two and no spawn of their own: pppompom (no cleave near one, not a reason to agitate), redfairy (no agitate near one), nerfedmummy (Riva never shoots one), franky and icegolem (Ulric holds his cleave near one), plantoid and mole (no ranger skills), jr, greenjr and bigbird (always a reason to agitate) |

**Dungeons**

| File | Role |
|------|------|
| `Dungeon Runner.js` | Shared machinery: party entry, `run_dungeon()`, `start_dungeon_when_ready()`, `dungeon_override` |
| `Dungeon Mode.js` | The on/off toggle and its toprightcorner buttons |
| `Dungeon Progress.js` | Kill quota tracking |
| `Dungeon Escape.js` | Bail-out: scare, walk away, town back to the entrance |
| `Dungeon Telemetry.js` | Dungeon flight recorder via `errlog_sample()` |
| `Dungeon Collection.js` | Every few runs, hand the haul to Riff |
| `Spider Dungeon.js`, `Crypt Dungeon.js`, `Crypt Route.js` | Dungeon definitions and the crypt's waypoint circuit |
| `Dreams Cave.js` | The daily Cave of Many Dreams: entry, voting, escorts, fighting inside |

**Interface**

| File | Role |
|------|------|
| `Widget Helpers.js` | **First stage.** `register_widget()`, toprightcorner buttons, `CLASS_COLORS`, coop-share and rolling-window helpers, `make_draggable()` |
| `Game Log.js` | **First stage.** The one log window; everything goes through `game_log()` |
| `DPS Meter.js`, `Gold Meter.js`, `XP Meter.js`, `CC Meter.js` | Overlays |
| `Boss Contribution.js` | Coop points and loot share of everyone on our boss |
| `Kill Tracker.js` | kpm/kph/kpd from `kill_credit` |
| `Lucky Slot Tracker.js` | Bayesian search for Riff's lucky upgrade slot; `upgrade_slot_for()` |
| `Metrics Graphs.js` | 📊 session graphs popout, and the once-a-second live feed of the same numbers to the status page |
| `Stats Window.js`, `Settings Window.js`, `Party Frames.js`, `Pause Button.js` | Stats/gold graph, per-character settings (farm targets, merchant toggles, upgrade and craft targets), party HP, pause automation |
| `Bank Viewer.js`, `Bank Sort Order.js` | Bank UI (plus the reload button) and sort order |

**Character Managers** — each character has `<Role> Config.js` (tunables, gear sets, `state`/`cache`), `Combat`, `Skills`, `Equipment`, `Movement`, and the entry point `<Role>.js`.

| Character | Notes |
|-----------|-------|
| Warrior — Ulric | `weapon_burst()` (the per-swing candy-cane swap) in Combat; cleave/agitate/stomp/taunt in Skills (the **Rime Djinn shell stomp** is in `Encounters/Rime Djinn.js`); `warrior_engage_step()` in Movement |
| Healer — Myras | **The tank.** Pull logic and `effective_aggro_cap()` in Combat; curse/absorb/zap in Skills; the `fight` rule (camp/boss loadouts, luck at the kill) in Equipment |
| Ranger — Riva | Shot chooser (`shot_apiercing()`, `coop_boss_only()`) in Combat; mark/supershot in Skills |
| Merchant — Riff | Split into Stand, Inventory, Exchange, Gear, Gathering, Party, Upkeep, Upgrading, Crafting. `Merchant Task Loop.js` **must load last**. `lolipop_push()` (Upgrading) is the on-demand ololipop +10 run |

**Tools** (run outside the game)

| File | Role |
|------|------|
| `Error Sink.py` / `Install Error Sink.ps1` | Local HTTP sink for `errlog_sample()` pushes → `errors.json`, `errors_timeline.jsonl`, and the `errlog_archive()` lane → `ledger.jsonl`, `tracker.jsonl`, `survey.jsonl`; `/snapshot` → `snapshots.jsonl` (the harness's fixture source); logon-task installer |
| `Data Store.py` | `al_data.sqlite`, rebuilt incrementally from the `.jsonl` archives (the sink runs `ingest` every 15 min). `python "Tools/Data Store.py" survey` prints the survey results; `status` is the status page's JSON; `compare A B` judges one build (or time range) against another at the same home |
| `Party Model.js` | Node, run outside the game: the server's stat pipeline for Ulric and Riva over the game's own `data.js` and `calculate_item_properties()`. `calibrate`, `mana`, `slots`, `upgrades`, `achievements`, `json` (→ `party_model.json`, refreshed by the sink every 15 min) |
| `Status Page.html` | The status page, served by the sink at `http://127.0.0.1:8787/`: `/api/live` every 1s (the characters' 📊 snapshots, memory only), `/api/status` every 15s |
| `Watchdog.py` / `Install Watchdog.ps1` | DevTools-port watchdog: logs navigations and network outages, reloads silent windows. **Read `watchdog.jsonl` first after a dead character** |
| `Lint.py` | `python Tools/Lint.py`: duplicate globals, orphaned ternaries, constant conditions |
| `Crypt Probe.js`, `Drag Probe.js` | One-off dev probes, not loaded |

---

## Code Conventions

- **Naming:** `snake_case` functions and variables; `UPPER_SNAKE_CASE` constants; `_` prefix for internals. File and folder names are space-separated words (`Global Config.js`): a folder names what it contains, a file names what it does.
- **Formatting:** tabs; double quotes (single only to avoid escaping, template literals for interpolation); K&R braces; semicolons.
- **Structure:** a local `CONFIG` at the top of each character file; `// ---...--- //` dash-block section headers; loops as `setInterval(async () => { ... }, tick)`; movement returns Promises.
- **Equipment swaps have no cooldown.** Swaps react in milliseconds, and no equip path waits on a timer, a hold or a server refusal. The reference is the warrior's cleave: arm, skill, restore in one burst, then return. Potions are unrelated to equipment, cooldowns included.
- **Zero code comments.** No explanatory, WHY or JSDoc comments; put the reasoning in `Design Notes.md` instead. Section-header dividers are structural, and commented-out code is not a comment either: leave it, and ask before removing it.

---

## Party

- **Leader:** `Ulric` (Warrior). **Members:** `Riva` (Ranger), `Myras` (Healer), `Riff` (Merchant, usually on another map, so `get_player("Riff")` returning null is normal).
- Riff supports the others: delivers potions, collects loot, upgrades.

### The Healer tanks — not the Warrior

This is the most commonly mis-assumed thing about the party.

- `Warrior Combat.js` sets `cache.tank_entity = get_entity("Myras")`; warrior skill and equipment decisions read that, not `character`.
- Myras deliberately pulls untargeted monsters while `count_my_aggro() < effective_aggro_cap()`, a cap that scales with MP. Aggro is a resource she spends mana on.
- Ulric's `agitate` feeds her (it refuses when she is dead/missing or more than 100 away), his stomp protects *her*, and his `hardshell`/`charge` are commented out. Low-HP checks like `tank.hp < tank.max_hp * 0.6` mean *her* HP.
- Target priority: Warrior `["Myras"]` (kill what she holds); Healer `["Ulric", "Myras"]` (pull what hits him, then hold it).
- Her absorb and pulls are gated by `tank_can_take()`: nothing is taken on if she would drop below 30% within 2s, net of healing. She pulls nothing while Ulric or Riva is dead or off her map.

So survivability work (damage projection, panic, defensive gear, escape) belongs on the **Healer**. The Warrior gets damage, positioning and aggro donation.

---

## What to Avoid

- Module syntax, TypeScript, transpilation, build tools, `package.json`
- Removing commented-out code without asking
- Speculative multi-file refactors (hard to test without the live game)
- Error handling for impossible game states (e.g. `character` being null)
- Centralizing config unless asked. Each file's `CONFIG` is intentionally local. `Global Config.js` holds only values that were identical in all three fighters (`LOOTING_DEFAULTS`, `POTION_DEFAULTS`, `EQUIPMENT_DEFAULTS`, `PANIC_ORB_SET`), spread and overridden per character
- Merging a dungeon's `flags` into `CONFIG`. They are contextual overrides read at the decision they affect; merging would mean ~20 dungeon-only keys, a mutable `CONFIG`, and an apply/revert lifecycle that can leave stale overrides

---

## Deploying (purge jsDelivr after every push)

Characters load `cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@<sha>/`, with the SHA resolved through `api.github.com` (60 unauthenticated requests/hour per IP). On a 403 the loader falls back to `@main`, which jsDelivr caches for 12h; a query string does not purge it. A push made while rate-limited can therefore never reach the characters, and a mixed build makes fixed bugs look unfixed.

**After every push, purge and verify.** Paths contain spaces, so iterate with `-z` and encode them as `%20`. Read the purge response: a throttled purge returns HTTP 200 and does nothing.

```bash
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  u=${f// /%20}
  r=$(curl -s "https://purge.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/$u")
  case "$r" in *'"throttled": true'*) echo "THROTTLED $f";; esac
done
# verify against git blobs (LF), not the working tree (CRLF)
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  u=${f// /%20}
  a=$(curl -s "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/$u" | md5sum | cut -d' ' -f1)
  b=$(git show "HEAD:$f" | md5sum | cut -d' ' -f1)
  [ "$a" != "$b" ] && echo "STALE $f"
done
```

- `"throttled": false` is not proof: an edge can refill from a lagging GitHub mirror. Only the verify loop is proof. For a rename or delete, grep the *served* file for something you changed.
- Re-purge stale paths **once**. If a path is still stale, stop: retrying keeps it throttled (`throttlingReset`, up to ~50 min). The pinned `@<sha>` path serves new content immediately; confirm with `curl -s ".../Adventure-Lands@$(git rev-parse HEAD)/<path>" | md5sum` against `git show "HEAD:<path>" | md5sum`.

Loader facts:

- Paste `Code Loader.js` into slot 1 **once**, replacing the whole slot. Two copies load everything twice: the `Core Systems` files can't re-declare their `const`s and define nothing, while the first copy's loops run against a stale `character`.
- The base must serve executable script. `raw.githubusercontent.com` sends `text/plain` + `nosniff`, so `getScript` refuses it.
- `game_log()` writes to the **in-game** log, not the browser console. Ask for the in-game log when diagnosing.

---

## Testing

There is no test suite yet (the overhaul's `Tests/` harness is being built). Changes are tested by injecting into the live game client, so keep them minimal and easy to verify in-game. `python Tools/Lint.py` catches cross-file global collisions and runs the overhaul ratchet before a push: a legacy-pattern count per file may go down, never up (lower `Tests/lint_baseline.json` with `--baseline` in the commit that removes one). `--graph` rewrites `Tests/dependency_graph.json`, whose load-time edges are what can race in the parallel batch.

---

## References

- [`Design Notes.md`](Design%20Notes.md): why each system works the way it does
- [`Game API Reference.md`](Game%20API%20Reference.md): game engine internals (API signatures and reject reasons, socket events, `character`/`G`/`S`, combat and movement internals). Check it before changing combat, movement or item code.
- [`Architecture.md`](Architecture.md), [`Diagnostics.md`](Diagnostics.md) (reading `errors.json`), [`Decision Ownership.md`](Decision%20Ownership.md), [`Loop Cadence.md`](Loop%20Cadence.md)
- [`Overhaul Plan.md`](Overhaul%20Plan.md): the phased restructure (kernel, telemetry bus, world model, encounters, deciders/actuators). Check its status table before structural work, and update it in the same commit as each step
