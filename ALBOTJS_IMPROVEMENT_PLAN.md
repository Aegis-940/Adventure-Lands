# Improvement Plan — Verified Against the Codebase

## Context

Three external AdventureLand bots were reviewed for ideas worth porting here:

- **`FreezePhoenix/albot-js`** — Node.js/TypeScript, server-side, WASM pathfinder.
- **`Crowns3bc/AdventureLand`** — browser-injected scripts, same genre as this codebase.
- **`earthiverse/adventureland-bots`** — large TypeScript framework on `ALClient`, MongoDB-backed.

An earlier draft of this document listed 26 items. **It was wrong.** Items were written from the *source repos'* perspective and hedged ("if this doesn't already exist", "if the current gate is a flat number") instead of being checked against this codebase. On audit, roughly half proposed building things that already exist here — including the two ideas that had been ranked highest.

This rewrite is checked function-by-function against the actual source. Every item below names a verified anchor. Items that turned out to be already implemented are listed in Section A so they don't get re-proposed on a future pass.

Nothing here has a test suite; every item is verified by live in-game injection.

---

## Section A — Already implemented. Do not re-propose.

| Idea | Where it already lives |
|---|---|
| Extended monster filters (`status_effects`, `max_att`, `path_check`, min/max-HP sort) | `get_nearest_monster_v2()`, `Shared/Combat_Utilities.js:51-102` — every proposed filter is present |
| Atomic multi-item equip via one `equip_batch` emit | `batch_equip()`, `Shared/Party_And_Loot.js:149-207` (≤15 cap, skips already-equipped, single emit) + `is_set_equipped()` at `:210` |
| MP-aware cleave floor | `Warrior_Skills.js:128` — `character.mp_cost * 2 + G.skills.cleave.mp + 320`, identical formula |
| Agitate safety gating | `Warrior_Skills.js:152-205` — `is_fireroamer_agitate_safe()`, `agitate_blacklist`, `agitate_min_mobs`, untargeted-count checks |
| MP swap hysteresis band | `resolve_warrior_coat()`, `Warrior_Functions.js:485-486` — separate `mp_thresholds.upper` / `.lower` |
| Per-boss HP threshold dictionary | `CONFIG.equipment.boss_hp_thresholds`, `Warrior_Functions.js:44`, consumed at `:482` |
| Auto-craft buying missing ingredients | `craft_cost_for_count()` `Auto_Craft.js:108`, `compute_missing_ingredients()` `:151`, plus an affordability binary search the source bot lacked |
| Role-branching elixir manager | `elixir_usage()` — `Warrior_Functions.js:620`, `Healer_Functions.js:637` |
| Ping compensation on cooldown waits | `ms_to_next_skill()`, `Combat_Utilities.js:43-49`, using `Math.min(...parent.pings)` |
| xptome auto-restock | `auto_buy_potions()`, `Party_And_Loot.js:86` |
| Unpriced-item sell guard | `remote_sell_items()`, `Party_And_Loot.js:767` — `item.p !== undefined` already skipped |
| Log growth cap | `UI/Custom_Log.js:177, 208, 215, 231` — capped at 100 entries in four places |
| Sampled-angle reachable-position picker | `best_orbit_spot()`, `Combat_Utilities.js:181-190+` — 16 angles × 3 radii, `can_move_to()` filtered, "stay put" kept as a candidate to prevent thrash |

Two further ideas were **rejected in code, on purpose**, and should not be revived without a reason:

- **Grace-gated upgrade commits.** `Auto_Upgrade.js:422-428` already checks grace before the emit and deliberately proceeds anyway, with the rationale written out: *"best-effort: proceed with whatever grace was achieved rather than skipping the item forever if it never confirmed a genuine plateau."*
- **Bot-side waypoint caching.** `smarter_move()` doesn't pathfind — it drives the game client's own BFS via the `smart` object (`Movement.js:90-93`), and `Movement.js:245-246` notes the engine recalculates waypoints internally. There is no bot-computed route to cache. `handle_bscorpion_farm_approach()` (`:254-256`) also only calls `smart_move` when actually lost, not per farm-loop leg.

---

## Section B — Previously disabled on purpose. Needs your call.

Both of these exist as commented-out code. Per `CLAUDE.md`, commented-out blocks are treated as deliberately disabled, not dead. Neither should be re-enabled without you saying why it was turned off:

1. **Harakiri / self-revive loop** — `suicide()` at `Party_And_Loot.js:72-81`, and the xptome gate specifically commented out of the Healer's respawn at `Healer_Functions.js:446`. All four characters already call `respawn()` on `character.rip`.
2. **Active party self-correction** (leave a wrong party, re-request the correct one) — commented out at `Warrior_Functions.js:659-666` and `Ranger_Functions.js:707-711`. The passive invite/accept path is live at `Party_And_Loot.js:340-375`.

If either was disabled because it misfired, item 6 below (predictive damage) should be scoped so it never triggers a harakiri path.

---

## Section C — The plan

Ordered cheapest and most self-contained first; the invasive defensive work sits in the middle, cosmetic last.

### 1. Wire up the orphaned `should_spread()` — `Shared/Party_And_Loot.js` + fighter movement loops

`on_combined_damage` sets a flag and `should_spread()` reads it (`Party_And_Loot.js:19-35`), but **`should_spread()` is never called anywhere in the codebase.** The AoE-spread reaction was built and never connected. This is finished work sitting unused.

**Do:** Call `should_spread()` from the Warrior/Ranger `reposition()` paths (`Warrior_Functions.js:554`, `Ranger_Functions.js:559`), passing a scoring penalty to `best_orbit_spot()` that pushes the character away from co-located party members while the flag is hot (2s window).

**Don't touch:** The flag/timer logic itself, or `best_orbit_spot()`'s signature — pass the penalty through the existing `score` callback.

**Verify:** Take splash damage with two characters stacked; confirm they separate within the 2s window and settle back to normal orbit scoring afterward.

---

### 2. Inner per-move-attempt stuck detection — `Shared/Movement.js`

`monitor_movement()` (`Movement.js:95-112`) polls every 200ms but only checks arrival and `smart.moving`. The sole failure backstop is the 120s `MOVE_TIMEOUT` at `:116`. A move that dead-ends silently burns two minutes.

**Do:** Track last position + last-progress timestamp inside `monitor_movement()`; if position hasn't changed beyond a small epsilon for ~3-5s **while `smart.moving` is true and we haven't arrived**, reissue the move (and after N reissues, fail through to the existing reject path rather than waiting out the full timeout).

**Don't touch:** `stuck_escape_check()` (`:192-234`) and never call `use_town` from here. Critically, respect its documented reasoning at `:179-182` — *"Standing still is normal for this bot (reposition() often decides to stay put), so stillness alone proves nothing."* That's why this check must be scoped to an in-flight `smarter_move()` only, never to a character that is merely standing still.

**Verify:** Obstruct a character mid-`smarter_move()`; confirm reissue fires in ~5s, that a character idling in `reposition()` never triggers it, and that the 60s outer escape doesn't also fire for the same event.

---

### 3. Retreat scorer for `best_orbit_spot()` — `Shared/Combat_Utilities.js`

`best_orbit_spot(center, radius, score)` (`:188`) already does the hard part — samples candidate positions, filters on `can_move_to()`, scores them. earthiverse's kite logic is the same technique with a different scoring function.

**Do:** Add a retreat-specific `score` callback that maximizes distance from a named threat while keeping the position inside the character's own attack range, and call it from the Ranger's `reposition()` when a threat is inside melee range.

**Don't touch:** `best_orbit_spot()` itself — this is a new scorer passed to it, not a change to the sampler. Do not replace the sampler with a fixed-step circle walk; the current design is deliberately anti-thrash.

**Verify:** Force the Ranger into melee range of a hard-hitting mob; confirm it retreats to a reachable spot that increases distance without leaving its own attack range.

---

### 4. Overkill-prevention target-claim broadcast — `Shared/Messaging.js` + per-character targeting

Nothing currently stops two characters committing to the same low-HP mob. `CM_HANDLERS` (`Messaging.js:38-130`) is a clean dispatch table with a sender allowlist, so adding a message type is cheap.

**Do:** Broadcast `{type: "claim_target", entity_id}` when a character commits to a kill; each recipient drops that id from its own candidate pool for a short TTL (a stale claim must expire, or a disconnect strands the target permanently).

**Don't touch:** The dispatcher structure — add one `CM_HANDLERS` entry in the existing shape.

**Alternative, pick one:** the same problem can be solved implicitly by scoring — deprioritize a mob a teammate is already engaging, no messaging needed. The broadcast is more precise; the scoring approach is less machinery and can't strand a target on disconnect. **Recommend the scoring variant** unless you want hard claims; it also folds into the existing `score_by_explosion_spread()` neighborhood instead of adding a protocol.

**Verify:** Put two characters on one mob; confirm only one commits and the other retargets.

---

### 5. Damage-type capacity gate before the Warrior pulls — `Character_Functions/Warrior_Functions.js`

`courage` / `mcourage` / `pcourage` are **real character stats** (`GAME_API_REFERENCE.md:380`) — they cap how many attackers of each damage type you absorb cleanly. The Healer already has the analogous idea in `effective_aggro_cap()` (`Healer_Functions.js:239-243`, scaled by mana %); the Warrior has no equivalent, so it can agitate itself past what it can survive.

**Do:** Before accepting a new pull, sum incoming attackers by damage type and skip the pull if it would exceed the corresponding courage stat.

**Don't touch:** `find_best_target()` ordering — this is an accept/reject gate after selection, and the existing agitate gates (`Warrior_Skills.js:170-205`) stay as-is.

**Verify:** Tank several same-damage-type mobs up to the cap; confirm the Warrior declines an additional same-type pull and resumes once capacity frees.

---

### 6. Predictive incoming-damage projection — feed the existing `panic_check()`

`panic_check()` (`Party_And_Loot.js:470+`) reacts to current state and owns gear exclusively while active; `panicking` is already broadcast party-wide over CM (`Messaging.js:49-54`). What's missing is *projection* — earthiverse's version sums potential damage from every entity currently targeting you (respecting courage caps, range/speed, a mobbing multiplier, plus burn over remaining duration) and acts before the hit lands.

**Do:** Add a projection function and use it as an **earlier trigger for the existing panic path**, not a parallel system.

**Don't touch:** `panic_check()`'s gear ownership and cooldown logic (`:484-497`). Do **not** wire this to harakiri — that path is disabled (Section B) and a predictive trigger on a disabled suicide path is exactly how a false positive becomes a corpse.

**Verify:** Stage a multi-mob pull whose projected damage exceeds current HP; confirm panic engages before the fatal hit, and — more importantly — sit through several normal fights confirming no false positives.

---

### 7. Boss-contribution leaderboard — `UI/Party_Frames.js`

`Party_Frames.js` is small (`get_party_member_info()` `:68`, `render_party_ui()` `:99`, 100ms interval `:140`) and shows no co-op contribution. The codebase already touches cooperative kills (`Warrior_Functions.js:767-774`, `mob.cooperative` / `character.luckm`).

**Do:** Add a separate panel reading `character.s.coop.p` and nearby entities' `s.coop.p`, ranked, normalized to the top contributor, shown only while a co-op boss is live.

**Don't touch:** Existing HP/status rendering — new section, not a modification.

**Verify:** During a co-op boss fight, confirm correct ranking and clean hide when no co-op boss is active.

---

### 8. Upgrade cost/strategy planner — `Merchant_Systems/Auto_Upgrade.js`

`UPGRADE_PROFILE` (`:9-33`) encodes hand-tuned scroll/offering thresholds but nothing computes whether they're cheapest. albot-js runs Dijkstra over `[cost, level, grace]` states to find the cheapest path to a target level.

**Do:** Add it as a **pure calculator with no side effects**, callable from the console, reporting the cheapest strategy. Only wire it into purchasing after its output has been sanity-checked against real prices.

**Don't touch:** The upgrade emit path or the best-effort grace decision at `:422-428` (Section A) — this informs material purchasing, not commit timing.

**Verify:** Run standalone against known scenarios and compare against hand calculation before any automated purchasing is enabled.

---

### 9. Runtime native-panel patching helper — `Shared/Widgets.js`

`Widgets.js` currently offers only `create_bottomrightcorner_widget()` and `make_draggable()`. Crown's technique — `.toString()` a native render function, string-splice in markup, `parent.eval()` it back, retried until it applies — allows augmenting the game's own panels instead of overlaying them.

**Do:** Add the helper and use it opportunistically for new panel augmentations.

**Don't touch:** Existing standalone widgets — this is an alternative, not a refactor.

**Caveat:** String-splicing a native function is the most fragile thing in this plan; any game client update can silently break it. Lowest priority here for that reason.

**Verify:** Confirm the patch applies whether the panel loads before or after the retry loop starts.

---

## Section D — Optional / marginal

- **Extract a shared multi-key target sort.** `Ranger_Functions.js:308-316` has a real tier→tier→HP comparator; Warrior/Healer use different priority chains. Extracting it is a pure refactor with **no behavior change** — worth doing only as a prerequisite if item 4's scoring variant lands.
- **Shared item-keep predicate builder.** The three filters genuinely differ (`Party_And_Loot.js:404`, `:439`, `:767`). Consolidating is defensible, but `CLAUDE.md` prefers three similar lines over a premature abstraction, and the unpriced-item guard it was meant to add already exists. Low value.
- **Inventory-hygiene slot sorter** (name→target-slot table, periodic `imove` correction). New — `UI/Bank_Sorter.js` sorts the bank, not live inventory. Cosmetic.
- **Merchant stand auto-lister**, **dedicated mule/gold-overflow courier**, **Lucky Slot RNG tracker**, **read-only farming calculators** (drop rate, expected exchange value). All genuinely absent; all niche.
- **Dynamic loop-delay throttling** (derive tick delay from time-to-next-skill rather than fixed intervals). Plausible efficiency win, but it's an `setInterval` → recursive `setTimeout` rewrite across every character file. Deserves its own dedicated pass, not a line item here.

---

## Section E — Reviewed and rejected

- **Discord loot webhook notifier** — explicitly rejected.
- **Push-based merchant-pickup broadcast** — the merchant already reads `free_slots` and mluck-remaining from the CM/localStorage state cache (`Messaging.js:157`, `Merchant_Functions.js:106-117`). No polling cost to remove.
- **Potion-loop ping compensation** — `potion_loop()` (`Party_And_Loot.js:53-70`) already polls at 10ms when idle. Nothing to shave.
- **deltaTime circle-walk orbit** — strictly less capable than `best_orbit_spot()`; adopting it would be a regression.
- **Stacking-jitter escape as a new system** — superseded by item 1 (wiring up the `should_spread()` machinery that already exists).
- **Healer→lowest-HP magnetism** — the lowest-HP-ally scan already exists (`Healer_Functions.js:248-262`) and `should_pause_combat_loop()` already enforces a 200-unit leash to Myras (`Combat_Utilities.js:149-154`). Only "others drift toward healer when hurt" would be new, and it conflicts with the leash.
- **Holiday/seasonal event routing**, and everything depending on earthiverse's MongoDB multi-account model (server-hop scheduling, crypt lifecycle, tracker sync, deal-finder merchant strategy) — no fit for a single-session 4-character iframe bot.
- **External CDN chart libraries** — the native-canvas meters already cover this.

---

## Files touched

- `Shared/Movement.js` — item 2
- `Shared/Combat_Utilities.js` — items 1 (scorer), 3
- `Shared/Party_And_Loot.js` — items 1, 6
- `Shared/Messaging.js` — item 4 (only if the broadcast variant is chosen)
- `Character_Functions/{Warrior,Ranger}_Functions.js` — items 1, 3, 5
- `Merchant_Systems/Auto_Upgrade.js` — item 8
- `UI/Party_Frames.js` — item 7
- `Shared/Widgets.js` — item 9

No `Bootstrapper.js` changes required — all edits are additive within existing files.
