# CLAUDE.md — Claude Code Instructions for Adventure-Lands

## Project Summary

Adventure-Lands is a **browser-injected JavaScript game automation bot** for the AdventureLand MMO. It controls a party of 4 characters (Warrior, Healer, Ranger, Merchant) through role-based scripts loaded directly into the game client. There is no build system, bundler, or Node.js runtime — all code runs in the browser.

---

## Environment & Constraints

- **No package.json, npm, or build pipeline.** Do not suggest installing packages or running build commands.
- **No module system.** Files are loaded sequentially via the Bootstrapper or injected manually into the game client. There are no `import`/`export` statements.
- **Runtime is the browser game client.** All globals (`character`, `parent.G`, `parent.entities`, `parent.S`, `parent.socket`) are provided by the game environment — they are not bugs or undefined references.
- **jQuery is available** as `parent.$` or `window.jQuery`. This is injected by the game client.
- **Code is injected into iframes.** `parent.*` references are how scripts access the game's top-level scope.
- **`"Common Variables.js"` has been deleted.** It was merged or removed — do not reference or recreate it.

---

## File Roles (Quick Reference)

| File | Role |
|------|------|
| `Bootstrapper.js` | Script loader — loads all other files from CDN in order |
| `Shared/Game_Config.js` | Core config/constants/loop-toggles/state variables |
| `Shared/Movement.js` | `smarter_move()`, `move_to_character()`, bscorpion/primling farm, combat orbit |
| `Shared/Combat_Utilities.js` | Monster targeting/distance/aggro helpers, event handling |
| `Shared/Messaging.js` | CM (character message) handlers, localStorage-backed state cache |
| `Shared/Party_And_Loot.js` | Party invite/accept management, shared loot/inventory/panic/equipment behaviors |
| `Shared/Error_Handling.js` | `catcher()`, the shared error-triage/logging helper |
| `Shared/Widgets.js` | `create_bottomrightcorner_widget()` (Gold/XP/CC/DPS meters' container) and `make_draggable()` (used by Custom_Log.js/Stats_Window.js) — all that survived removing Shared/Windows.js |
| `Merchant_Systems/Auto_Upgrade.js` | Item upgrade profiles and automation |
| `Merchant_Systems/Auto_Craft.js` | Crafting logic and batch orchestration — loaded by Bootstrapper.js |
| `Characters/Tank.js` | Warrior entry point (character: Ulric) |
| `Characters/Healer.js` | Healer entry point (character: Myras) |
| `Characters/Ranger.js` | Ranger entry point (character: Riva) |
| `Characters/Merchant.js` | Merchant entry point (character: Riff) |
| `Character_Functions/Warrior_Functions.js` | Warrior combat, movement, equipment swap logic |
| `Character_Functions/Warrior_Skills.js` | Warrior skill loop (stomp, cleave, agitate, taunt) — separate eval closure loaded after Warrior_Functions.js |
| `Character_Functions/Healer_Functions.js` | Healing, buffs, support logic |
| `Character_Functions/Healer_Skills.js` | Healer skill loop (curse, absorb, party heal, dark blessing) — separate eval closure loaded after Healer_Functions.js |
| `Character_Functions/Ranger_Functions.js` | Ranged combat, multi-target abilities |
| `Character_Functions/Ranger_Equipment.js` | Ranger equipment-swap loop (weapon/boss sets) — separate eval closure loaded after Ranger_Functions.js |
| `Character_Functions/Merchant_Functions.js` | Trading, fishing, mining, potion delivery |
| `UI/DPS_Meter.js` | Real-time DPS tracking overlay |
| `UI/Stats_Window.js` | Character stats + gold graph (Canvas API) |
| `UI/Settings_Window.js` | Live in-game per-character target settings, persisted via localStorage, ⚙️ button next to the reload button |
| `UI/Party_Frames.js` | Party HP/status display |
| `UI/Remote_Bank_Viewer.js` | Bank access UI, plus the toprightcorner reload button (restored here after Buttons.js was removed) |
| `UI/Bank_Sorter.js` | Bank sorting order/category definitions |
| `UI/CC_Meter.js` | Crowd control meter |
| `UI/Gold_Meter.js` | Gold accumulation display |
| `UI/XP_Meter.js` | XP tracking display |
| `UI/Game_Log.js` | Game event log (mostly commented out) |
| `UI/Custom_Log.js` | Custom in-game log window |

---

## Code Conventions

### Naming
- Functions and variables: `snake_case` — e.g., `smarter_move()`, `start_attack_loop()`
- Constants/config keys: `UPPER_SNAKE_CASE` — e.g., `TICK_RATE`, `LOOT_THRESHOLD`
- Top-level config objects: `CONFIG`, `STATE`
- Internal/private: prefixed with `_` — e.g., `smart._interrupt`
- Multi-word file/folder names: underscore-separated, e.g. `Game_Config.js`, `Character_Functions/` — no spaces in filenames (avoids `encodeURI()` friction in `Bootstrapper.js` and constant shell-quoting)

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
- Comments are extensive and intentional — preserve them when editing
- Commented-out code blocks are often experimental or disabled features, not dead code — ask before removing

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

- **Party Leader:** `Ulric` (Warrior/Tank)
- **Party Members:** `Riva` (Ranger), `Myras` (Healer), `Riff` (Merchant)
- Characters coordinate via shared globals and socket events
- Merchant (Riff) supports others: delivers potions, collects loot, handles upgrades

---

## Common Patterns to Follow

### Loop pattern
```javascript
setInterval(async () => {
    if (!CONDITION) return;
    // action
}, TICK_RATE);
```

### Promise-based movement
```javascript
await smarter_move(target, { timeout: 5000, radius: 50 });
```

### Socket emission (game actions)
```javascript
parent.socket.emit("move", { x: target.x, y: target.y });
parent.socket.emit("attack", { id: target.id });
```

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

## Testing

There is no test suite. Changes must be manually tested by injecting the modified script into the live game client. When suggesting changes, keep them minimal and easy to verify in-game.

---

## Game Engine Reference

A comprehensive map of the AdventureLand game engine internals is available in [`GAME_API_REFERENCE.md`](GAME_API_REFERENCE.md). This was sourced from the [official game repo](https://github.com/kaansoral/adventureland) and covers:

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
