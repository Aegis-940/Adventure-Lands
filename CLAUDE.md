# CLAUDE.md — Claude Code Instructions for Adventure-Lands

## Project Summary

Adventure-Lands is a **browser-injected JavaScript game automation bot** for the AdventureLand MMO. It controls a party of 4 characters (Warrior, Healer, Ranger, Merchant) through role-based scripts loaded directly into the game client. There is no build system, bundler, or Node.js runtime — all code runs in the browser.

---

## Environment & Constraints

- **No package.json, npm, or build pipeline.** Do not suggest installing packages or running build commands.
- **No module system.** Files are loaded sequentially via the Bootstrapper or injected manually into the game client. There are no `import`/`export` statements.
- **Two different load mechanisms, and they scope differently.** `Core Systems/*.js` and `Interface/*.js` load in parallel as real `<script>` tags, so their top-level `const`/`let`/`function` are all global. `Character Managers/**` load sequentially through **indirect eval**, where `var` and `function` go global but **a top-level `const`/`let` is invisible to sibling files**. Anything shared between two files of the same character must therefore be `var` or `function`. This fails silently at runtime, not at load.
- **Nothing in a character file may run at load time** except the entry point (`Warrior.js`, `Healer.js`, `Ranger.js`, `Merchant.js`). The fighters start every loop from `run_character()`; the merchant starts `loop_controller()`.
- **A top-level initializer may only name what has already loaded.** Function bodies run later so they can call anything, but a top-level `const X = {...}` is evaluated at load. `Merchant Task Loop.js` builds `PRIORITY_CHECKS` out of the `should_run_*` functions, so it has to load last. Getting this wrong throws inside the eval and the file defines nothing — silently.
- **Runtime is the browser game client.** All globals (`character`, `parent.G`, `parent.entities`, `parent.S`, `parent.socket`) are provided by the game environment — they are not bugs or undefined references.
- **jQuery is available** as `parent.$` or `window.jQuery`. This is injected by the game client.
- **Code is injected into iframes.** `parent.*` references are how scripts access the game's top-level scope.
- **`"Common Variables.js"` has been deleted.** It was merged or removed — do not reference or recreate it.

---

## File Roles (Quick Reference)

| File | Role |
|------|------|
| `Code Loader.js` | The one file that lives in a game code slot; fetches and evals `Bootstrapper.js` |
| `Bootstrapper.js` | Script loader — loads all other files from CDN in order |
| `Core Systems/Global Config.js` | Core config/constants/state variables |
| `Core Systems/Movement.js` | `smarter_move()`, the travel arbiter (`travel_arbiter()`), `move_to_character()`, stuck escape |
| `Core Systems/Bscorpion Camp.js` | Content-specific positioning for the desertland bscorpion/primling camp |
| `Core Systems/Combat Utilities.js` | Monster targeting/distance/aggro helpers, combat positioning (`best_orbit_spot()`) |
| `Core Systems/Targeting.js` | `score_targets()`/`select_target()` — the one scorer every character picks targets with |
| `Core Systems/World Events.js` | Live boss/seasonal targets, the goal that walks the party to them, and the anniversary visit |
| `Core Systems/Character Messaging.js` | CM (character message) handlers, localStorage-backed state cache |
| `Core Systems/Equipment.js` | Equipment sets, the single `batch_equip()` emitter, the slot arbiter, the rules resolver |
| `Core Systems/Party Management.js` | Panic and its broadcast (`set_panic()` is the only writer), party invites, where home is |
| `Core Systems/Loot Management.js` | `loose_loot()` — what we keep, ship to the merchant, or vendor; bank withdrawal; chest looting (`should_loot()`/`handle_looting()`, driven by each character's `CONFIG.looting`) |
| `Core Systems/Maintenance.js` | Potion drinking/restocking and the periodic tab reload |
| `Core Systems/Party Cohesion.js` | Party cohesion (`follow_goal()`, `party_cohesion_hold()`) and `movement_goal()`, the one priority list |
| `Core Systems/Character Runner.js` | `run_character()` — the shared main tick loop every character starts from |
| `Core Systems/Error Handling.js` | `catcher()`, the shared error-triage/logging helper |
| `Core Systems/Error Log.js` | Persistent cross-character flight recorder; hooks only, read with `al_errors(true)` |
| `Interface/Widget Helpers.js` | `create_bottomrightcorner_widget()` (Gold/XP/CC/DPS meters' container) and `make_draggable()` (used by Custom Log.js/Stats Window.js) — all that survived removing Windows.js |
| `Character Managers/Warrior Manager/Warrior Config.js` | Warrior tunables, gear sets, panic thresholds, `state`/`cache` (character: Ulric) |
| `Character Managers/Warrior Manager/Warrior Combat.js` | Warrior targeting, the sugar-rush swap trick, `action_loop()`; sets `cache.tank_entity` to **Myras** |
| `Character Managers/Warrior Manager/Warrior Skills.js` | Warrior skill loop (cleave, agitate, warcry); agitate donates aggro to the tank (stomp/hardshell/charge commented out) |
| `Character Managers/Warrior Manager/Warrior Equipment.js` | Warrior `EQUIPMENT_RULES` resolvers and monster gear overrides |
| `Character Managers/Warrior Manager/Warrior Movement.js` | Warrior reposition scorer |
| `Character Managers/Warrior Manager/Warrior Bscorpion.js` | Bscorpion kill detection and seconds-per-kill average |
| `Character Managers/Warrior Manager/Warrior.js` | Warrior entry point — windows, event handlers, `run_character()` |
| `Character Managers/Healer Manager/Healer Config.js` | Healer tunables, gear sets, panic thresholds, `state`/`cache` (character: Myras) |
| `Character Managers/Healer Manager/Healer Combat.js` | **The tank's** pull logic — heal target selection, MP-scaled aggro cap (`effective_aggro_cap()`), `action_loop()` |
| `Character Managers/Healer Manager/Healer Skills.js` | Healer skill loop (curse, absorb, party heal, dark blessing) |
| `Character Managers/Healer Manager/Healer Equipment.js` | Healer `EQUIPMENT_RULES` resolvers, booster swap, temporal surge |
| `Character Managers/Healer Manager/Healer Movement.js` | Healer runner hooks (`healer_local`, panic skip) and the circle walk |
| `Character Managers/Healer Manager/Healer Dungeon.js` | Spider instance run and its auto-start |
| `Character Managers/Healer Manager/Healer.js` | Healer entry point — windows, `run_character()` |
| `Character Managers/Ranger Manager/Ranger Config.js` | Ranger tunables, gear sets, panic thresholds, `state`/`cache` (character: Riva) |
| `Character Managers/Ranger Manager/Ranger Combat.js` | Ranger target cache, `action_loop()`, `handle_attack()` |
| `Character Managers/Ranger Manager/Ranger Skills.js` | Ranger skill loop (hunter's mark, supershot) |
| `Character Managers/Ranger Manager/Ranger Equipment.js` | Ranger `EQUIPMENT_RULES` resolvers (weapon/boss sets) |
| `Character Managers/Ranger Manager/Ranger Movement.js` | Licence top-up and the reposition scorer |
| `Character Managers/Ranger Manager/Ranger Looting.js` | Disabled delayed-chest looting, kept for later |
| `Character Managers/Ranger Manager/Ranger.js` | Ranger entry point — windows, `run_character()` |
| `Character Managers/Merchant Manager/Merchant Config.js` | Merchant tunables, locations, `merchant_task` (character: Riff) |
| `Character Managers/Merchant Manager/Merchant Stand.js` | The stall: open/close, buy and sell orders, stock accounting, restocking, and the idle state |
| `Character Managers/Merchant Manager/Merchant Inventory.js` | Slot counting, vendoring `SELLABLE_ITEMS`, and the banking state |
| `Character Managers/Merchant Manager/Merchant Exchange.js` | Bank fetch task plus the exchanging he does while idle |
| `Character Managers/Merchant Manager/Merchant Gear.js` | Default loadout and gathering-tool swaps |
| `Character Managers/Merchant Manager/Merchant Gathering.js` | Shared fishing/mining run |
| `Character Managers/Merchant Manager/Merchant Party.js` | mluck, party membership, the delivery run |
| `Character Managers/Merchant Manager/Merchant Upkeep.js` | Potions, loot collection and buffing, on their own 1Hz loop |
| `Character Managers/Merchant Manager/Merchant Task Loop.js` | `PRIORITY_CHECKS`, `set_state()`, `loop_controller()` — **must load after every file it names** |
| `Character Managers/Merchant Manager/Merchant Upgrading.js` | Item upgrade profiles and automation |
| `Character Managers/Merchant Manager/Merchant Crafting.js` | Crafting logic and batch orchestration |
| `Character Managers/Merchant Manager/Merchant.js` | Merchant entry point |
| `Interface/DPS Meter.js` | Real-time DPS tracking overlay |
| `Interface/Stats Window.js` | Character stats + gold graph (Canvas API) |
| `Interface/Settings Window.js` | Live in-game per-character target settings, persisted via localStorage, ⚙️ button next to the reload button |
| `Interface/Party Frames.js` | Party HP/status display |
| `Interface/Bank Viewer.js` | Bank access UI, plus the toprightcorner reload button (restored here after Buttons.js was removed) |
| `Interface/Bank Sort Order.js` | Bank sorting order/category definitions |
| `Interface/CC Meter.js` | Crowd control meter |
| `Interface/Gold Meter.js` | Gold accumulation display |
| `Interface/XP Meter.js` | XP tracking display |
| `Interface/Game Log.js` | Game event log (mostly commented out) |
| `Interface/Custom Log.js` | Custom in-game log window |
| `Interface/Pause Button.js` | Per-character pause/resume button — parks automation, leaves combat/panic/upkeep running |
| `Tools/Error Sink.py` | Local HTTP sink that receives `errlog_sample()` pushes and writes `errors.json` |
| `Tools/Anniversary Probe.js` | One-off dev probe pasted into a code slot/console; not part of the loaded bot |

---

## Code Conventions

### Naming
- Functions and variables: `snake_case` — e.g., `smarter_move()`, `start_attack_loop()`
- Constants/config keys: `UPPER_SNAKE_CASE` — e.g., `TICK_RATE`, `LOOT_THRESHOLD`
- Top-level config objects: `CONFIG`, `STATE`
- Internal/private: prefixed with `_` — e.g., `smart._interrupt`
- Multi-word file/folder names: space-separated, e.g. `Global Config.js`, `Character Managers/` — a folder names what it contains, a file names what it does. `Bootstrapper.js` already `encodeURI()`s every path and jsDelivr serves `%20` fine; shell loops over these paths must quote and use `-z`/null separators (see Deploying)

### Formatting
- Indentation: tabs
- String quotes: double quotes by default; single quotes only to avoid escaping (e.g. a string containing a `"`); template literals for interpolation
- Braces: same-line (K&R) — `function foo() {`, not `function foo()\n{`
- Statements are semicolon-terminated

### Structure
- Each character function file has a `CONFIG` object at the top for tunable settings
- Section headers use `// ---...--- //` dash-block dividers
- Async loops use `setInterval(async () => { ... }, tickRate)` pattern
- Movement returns Promises — use `smarter_move().then(...)` or `await smarter_move(...)`
- Equipment swapping has cooldown guards — check `COOLDOWNS` before adding new swap logic

### Comments
- **Zero code comments.** Do not add explanatory, WHY, or doc comments (including JSDoc) to any code you write — identifiers, structure, and headings should carry all the meaning
- Section-header dividers (`// ---...--- //` dash-block, title, dash-block) are structural, not comments — keep them
- Commented-out code blocks (disabled/experimental features) aren't comments either — leave them; ask before removing (see What to Avoid)

---

## Key Game Globals (Do Not Flag as Errors)

```javascript
character          // current character state (HP, mana, position, inventory)
parent.entities    // all entities in game world
parent.G           // game data (maps, items, NPCs, crafting)
parent.S           // server data (boss status)
parent.socket      // WebSocket to game server
parent.$           // jQuery
```

---

## Party Configuration

- **Party Leader:** `Ulric` (Warrior)
- **Party Members:** `Riva` (Ranger), `Myras` (Healer), `Riff` (Merchant)
- Characters coordinate via shared globals and socket events
- Merchant (Riff) supports others: delivers potions, collects loot, handles upgrades

### The Healer tanks — not the Warrior

`Myras` (Healer) is the party's tank. This is the single most commonly mis-assumed thing about
this party, so do not reason from the usual Warrior-tanks/Healer-heals layout:

- `Warrior Combat.js` hardcodes `cache.tank_entity = get_entity("Myras")`. Every warrior skill and
  equipment decision reads that entity, never `character`.
- The Healer deliberately pulls: `Healer Combat.js` takes untargeted monsters while
  `count_my_aggro() < effective_aggro_cap()`, and her cap scales with MP
  (`(mp_pct - 0.2) / 0.6`, floored at `CONFIG.combat.aggro_cap`). Aggro is a *resource she
  spends mana on*, not a hazard she avoids.
- The Warrior's `agitate` exists to feed her: `handle_agitate(tank)` refuses to fire when the tank
  is missing or dead, and checks `distance(character, tank) <= 100`.
- Target priority runs both ways round this: the Warrior's is `["Myras"]` (kill what she holds),
  the Healer's is `["Ulric", "Myras"]` (pull what is hitting him, then hold it).
- So `Warrior Skills.js`'s `stomp`/`hardshell`/`charge` are commented out, and low-HP checks like
  `tank?.hp < tank?.max_hp * 0.3` refer to *her* HP, not his.

Practical consequence: survivability work (damage projection, panic thresholds, defensive gear,
escape logic) belongs on the **Healer**. The Warrior is a DPS/off-puller — give him damage,
positioning, and aggro-donation logic.

---

## What to Avoid

- Do not add `import`/`export`, `require()`, or module syntax
- Do not suggest TypeScript, transpilation, or build tools
- Do not add `package.json` or dependency management
- Do not remove commented-out code without confirming with the user
- Do not refactor across multiple files speculatively — changes are hard to test without the live game
- Do not add error handling for scenarios that can't happen in game context (e.g., `character` being null)
- Do not centralize config unless explicitly asked — each file's `CONFIG` is intentionally local

---

## Deploying (purge jsDelivr after every push)

The bot loads from `cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@<sha>/`, resolved via
`api.github.com`. That API allows **60 unauthenticated requests/hour per IP**; on 403 the loader
falls back to `@main`, which jsDelivr caches for 12h (`s-maxage=43200`, confirmed in the response
headers). A query string does **not** purge that cache — only `purge.jsdelivr.net` does.

So a push made while rate-limited can silently never reach the characters. This is not theoretical:
`Party Management.js` and `Healer Skills.js` sat on a pre-fix commit for hours while every other file
was current, producing a mixed build that made fixed bugs look unfixed.

**After every push, purge and verify:**

```bash
# Read the purge response — do NOT discard it. purge.jsdelivr.net throttles PER PATH and reports
# it in the JSON body: {"paths":{"...":{"throttled":true,"throttlingReset":2990}}}. A throttled
# purge returns HTTP 200 and does nothing, so `-o /dev/null` makes the failure invisible.
# Paths contain SPACES: iterate with `-z` and URL-encode them as %20. An unquoted
# `for f in $(git ls-files)` splits every path and purges nonsense.
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  u=${f// /%20}
  r=$(curl -s "https://purge.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/$u")
  case "$r" in *'"throttled": true'*) echo "THROTTLED $f";; esac
done
# verify: compare against git blobs, NOT working-tree files — the working tree is CRLF
# while git blobs and jsDelivr are LF, so a naive diff reports every file as stale.
git ls-files -z '*.js' | while IFS= read -r -d '' f; do
  u=${f// /%20}
  a=$(curl -s "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@main/$u" | md5sum | cut -d' ' -f1)
  b=$(git show "HEAD:$f" | md5sum | cut -d' ' -f1)
  [ "$a" != "$b" ] && echo "STALE $f"
done
```

A purge that reports `"throttled": false` can still leave `@main` serving the old
content, because an edge refills from a GitHub mirror that is still behind. This has
happened four times. The purge response is therefore not proof of anything — only the
verify loop above is, and for a rename or delete, grep the *served* file for something
you changed. **One** re-purge of just the stale paths clears it in practice.

If a file is still STALE after that one retry, **stop and wait** — do not retry in a loop. Retrying keeps the path
throttled (`throttlingReset` is in seconds and runs to ~50 minutes) and cannot succeed. The pinned
`@<sha>` path is unaffected by any of this and serves the new content immediately, so a stale
`@main` only matters when the loader has fallen back to it after a GitHub API 403. Check the SHA
path to confirm the deploy is actually reachable:

```bash
sha=$(git rev-parse HEAD)
curl -s "https://cdn.jsdelivr.net/gh/Aegis-940/Adventure-Lands@$sha/${f// /%20}" | md5sum
git show "HEAD:$f" | md5sum
```

Other loader facts worth not re-deriving:

- `Code Loader.js` lives in **game code slot 1**, not the repo's load path. Paste it **once** —
  replacing the slot's whole contents. A slot holding two copies runs both IIFEs and loads
  everything twice, which re-evaluates every `Core Systems/*.js`; their top-level `const`s cannot
  re-declare, so those files throw at instantiation and define **nothing**, while the first copy's
  loops keep running against a stale `character` and every action is rejected as `disabled`.
- The base must serve executable script. `raw.githubusercontent.com` sends `text/plain` with
  `nosniff`, so `getScript` refuses it — a raw base fails all 18 files even though a `fetch`+`eval`
  of `Bootstrapper.js` from raw succeeds.
- `log()` and `game_log()` write to the **in-game** log windows, never the browser console. Ask for
  the in-game log when diagnosing; the browser console does not contain them.

## Testing

There is no test suite. Changes must be manually tested by injecting the modified script into the live game client. When suggesting changes, keep them minimal and easy to verify in-game.

---

## Game Engine Reference

A comprehensive map of the AdventureLand game engine internals is available in [`Game API Reference.md`](Game%20API%20Reference.md). This was sourced from the [official game repo](https://github.com/kaansoral/adventureland) and covers:

- **All bot API functions** — `attack()`, `heal()`, `use_skill()`, `smart_move()`, `buy()`, `upgrade()`, `compound()`, `bank_store()`, `send_cm()`, etc. with signatures, return types, and reject reasons
- **Socket events** — every client→server and server→client event with payloads (including skill-specific payloads like `3shot`, `5shot`, `cburst`, `blink`)
- **`character` object** — all properties (stats, slots, inventory, status effects, channeling, bank, queue)
- **`parent.entities`** — monster vs player properties
- **`parent.G` data** — items, monsters, maps, skills, NPCs, geometry, crafting, sets
- **`parent.S` server data** — live boss/event status
- **Event system** — `character.on()` events and overridable callbacks
- **Combat system** — damage flow, reduction formula, cooldowns, disable checks
- **Movement system** — smart_move BFS internals, collision geometry, doors/transporters
- **Item system** — upgrade/compound multipliers, grade thresholds, scroll types

**When to consult it:** Before suggesting improvements to bot combat, movement, item management, or any game API usage — check the reference to confirm exact function signatures, valid parameters, and available events rather than guessing.
