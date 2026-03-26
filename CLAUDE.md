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
| `Common Functions.js` | Shared utilities, movement, state, location data |
| `Buttons.js` | Floating UI button creation |
| `Windows.js` | Generic draggable floating window helper |
| `Priest_Manager.js` | Alternate/extended healer management system |
| `Auto Upgrade.js` | Item upgrade profiles and automation |
| `Auto Craft.js` | Crafting logic |
| `Characters/Tank.js` | Warrior entry point (character: Ulric) |
| `Characters/Healer.js` | Healer entry point (character: Myras) |
| `Characters/Ranger.js` | Ranger entry point (character: Riva) |
| `Characters/Merchant.js` | Merchant entry point (character: Riff) |
| `Character Functions/Warrior Functions.js` | Warrior combat, movement, equipment swap logic |
| `Character Functions/Healer Functions.js` | Healing, buffs, support logic |
| `Character Functions/Ranger Functions.js` | Ranged combat, multi-target abilities |
| `Character Functions/Merchant Functions.js` | Trading, fishing, mining, potion delivery |
| `UI/DPS_Meter.js` | Real-time DPS tracking overlay |
| `UI/Stats_Window.js` | Character stats + gold graph (Canvas API) |
| `UI/Party_Frames.js` | Party HP/status display |
| `UI/Remote_Bank_Viewer.js` | Bank access UI |
| `UI/CC_Meter.js` | Crowd control meter |
| `UI/Gold_Meter.js` | Gold accumulation display |
| `UI/XP_Meter.js` | XP tracking display |
| `UI/Game_Log.js` | Game event log (mostly commented out) |

---

## Code Conventions

### Naming
- Functions: `snake_case` — e.g., `smarter_move()`, `start_attack_loop()`
- Constants/config keys: `UPPER_SNAKE_CASE` — e.g., `TICK_RATE`, `LOOT_THRESHOLD`
- Top-level config objects: `CONFIG`, `STATE`
- Internal/private: prefixed with `_` — e.g., `smart._interrupt`

### Structure
- Each character function file has a `CONFIG` object at the top for tunable settings
- Section headers use `// ─────────────────────────────────` dividers
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

### UI window creation
```javascript
// Use Windows.js helpers — do not create raw DOM elements
create_floating_window(id, title, content_html);
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
