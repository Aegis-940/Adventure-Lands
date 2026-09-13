# Project Review — Adventure-Lands

Reviewed at commit `71a2527` plus the working tree. The only uncommitted change is one blank line removed in [Bscorpion Camp.js:119](Core%20Systems/Bscorpion%20Camp.js#L119); nothing below depends on it. Every finding cites a line that was read directly; where a claim rests on undocumented client behaviour it says so and gives the in-game check.

---

## 1. Summary

Fix these first, in this order:

1. **The merchant vendors what he just upgraded.** `sell_items()` runs after every upgrade/compound pass and sells by *name* from `SELLABLE_ITEMS`, which contains the compound rings/earrings and `harbringer`/`quiver` that the profiles upgrade. Scrolls, offerings and the item are lost every cycle. (Bug B1)
2. **The sugar-rush swap trick has been a no-op since it was routed through `batch_equip`.** The `{num, slot}` entries have no `item_name`, so nothing is emitted; the trick just holds the equip token for 300 ms after every attack. (Bug B5)
3. **Bank pack routing only covers packs 0-14** while every bank counter sees all 48. (Bug B4)

Also worth doing soon: `withdraw_item` unawaited in the upgrade path (B7), the inventory sorter's swap oscillation (B11), and the Warrior's missing `protects` term (Improvement I1).

---

## 2. Findings

### 2.0 Completed

Fixed and deployed 2026-09-13. Original line references are historical.

- **B2** Raw `upgrade`/`compound` emits looped forever on rejection -> now `await upgrade()`/`await compound()`; rejected slots memoised per pass; `auto_upgrade` honours the watchdog generation.
- **B3** Scroll buys over-bought and could hang -> `await buy()`, rejection returns `"end"`.
- **B6** Myras cast `absorb` at the bscorpion -> `absorb_from_ally_at_camp()` targets the ally the scorpion is hitting, in range, via `use_skill`.
- **B8** Camp loops ignored pause/travel/death -> `camp_loop_parked()` gates both loops; Ulric/Riva approach also skipped while panicking; both loops try/catch.
- **B9** Camp `move()` spam -> 3 px tolerance and skip when already heading to the same point (`going_x`/`going_y`).
- **B10** DPS meter never pruned -> `endsWith("_events")`.
- **B12** Settings/merchant exchanging default mismatch, mining inert -> settings default `true`; `CONFIG.enabled.mining` reads `AL_merchant_enabled_mining`.
- **B13** Merchant bank round-trip churn -> 10-min retry memo when an upgrade, exchange or craft run makes no progress (`upgrade_run_blocked()`, `_exchange_retry_at`, `craft_run_blocked()`).
- **B18** `clear_inventory` duplicated `send_to_merchant` unpaced -> both share a `_sending_to_merchant` guard; `clear_inventory` only triggers `send_to_merchant` (from `LOOT_THRESHOLD`, awaited sends); ranges are named constants.
- **B19** Merchant party requests at 4 Hz -> throttled to `TICK_RATE.maintenance`.

- **F1** Bootstrapper was always fetched from the 12h-cached `@main` -> Code Loader resolves the commit SHA itself, pins `@<sha>/Bootstrapper.js`, and seeds `window.__AL_BASE__` so Bootstrapper makes no second API call; the "cache-busted" fallback message is corrected. **Re-paste `Code Loader.js` into slot 1.**
- **F2** Re-bootstrap doubled every loop -> Code Loader guard is permanent (`__AL_LOAD_STARTED__`), `run_character`/`Merchant.js` refuse a second start, dead `window._cmListeners` removed.
- **F3** Runner and `catcher` depended on non-critical Interface files -> Custom Log, Widget Helpers and Bank Viewer are in `CRITICAL_SCRIPTS`; `catcher` falls back to `game_log` via `error_out()` when `log` is missing.
- **F4** Character-file top-level `const`/`let` -> all converted to `var` (Healer Combat/Skills/Dungeon, every Merchant file).
- **F5** Loop bodies shadowed `delay()` -> locals renamed `next_delay`; the `state` shadows in Warrior Equipment and Merchant Task Loop renamed.
- **F6** `bataxe` profile could never be recorded -> a set with no stored profile records after a 150 ms settle (`SET_PROFILE_FIRST_SETTLE_MS`), which fits inside the cleave swap.
- **F7** Dungeon could wedge the periodic reset -> `wait_for_death` (10 min) and the party wait (2 min) reject on timeout; `finally` sends `suppress_reset {state:false}` and the handler honours `state`; `enter_instance` caps at 30 attempts and never stacks intervals.
- **F8** Watchdog only stopped gathering -> `begin_task()`/`end_task(generation)` in Merchant Config; every handler releases only its own generation.
- **F9** `is_set_equipped` level-exact -> name match counts as equipped; a worn-level mismatch logs once per 30 s telling you to fix the set.
- **F10** `PROFILE_EXCLUDED_BUFFS` -> now also `sugarrush`, `energized`, `anniversary_kiss`.
- **F11** Equal-priority equip steal -> `equip_claim` rejects `>=`.
- **F12** String `target` filter -> `[name]` arrays in Healer Combat.
- **F13** Stale `smart.on_done` -> `smarter_move` installs a no-op when it takes over.
- **F14** Mixed distance metrics -> `find_monsters_in_cleave_range` uses `point_for_distance_check`, the same centre metric as `cleave_targets_at`.
- **F15** Stand price change listed a second copy -> listed count ignores price; a mismatched price logs "close it to relist".
- **F16** `MONSTER_GEAR_OVERRIDES` applied everywhere -> gated on `character.map === destination.map`.
- **F17** Bank snapshot via the modal -> `refresh_bank_snapshot()` in both merchant sites.
- **F18** `reserved_gear_slots` ignored locked copies -> locked copies count first toward the reservation, so unlocked junk copies are no longer kept.
- **F19** `tracker`/`tracktrix` -> both names in `ITEMS_TO_KEEP_BASE` and `ITEM_ORDER_BASE`.

- **S1** Attack issue -> `basic_action_busy()`/`run_basic_action()` live in Character Runner; Warrior, Healer and Ranger all issue attacks, heals, cupid heals and multishots through them (also closes B15/B16: the busy window resets on rejection).
- **S2** `update_cache` -> all three refresh everything under the 50 ms TTL and return early.
- **S3** Target selection -> Warrior has `target_priority: ["Myras"]` and a `protects` weight (closes I1); Ranger builds its pool through `monsters_matching({ where: should_attack_mob })`. The Ranger's boss/always-attack tiers stay as a sort because they are not expressible as a weight.
- **S4** Skill loop -> per-skill try/catch in the Warrior; Healer reads `TICK_RATE.skill`.
- **S5** Error retry delay -> `TICK_RATE.retry` in all six loops; `TICK_RATE.action` removed.
- **S6** Weapon choice -> one `resolve_weapon_by_value(choice, value_of, extra)` in Equipment.js, used by all three.
- **S7** `EQUIPMENT_RULES` -> Warrior: `weapon` + `orb` (cape/coat rules and the empty-set loadout gone, bscorpion override is `{ weapon: "single" }`); Healer: `gloves` removed from `luck` so one group owns the slot; Ranger: empty `loadout` rule and `dps` set gone.
- **S8** Reposition -> the panic branch lives in `orbit_reposition`; Warrior `reposition()` no longer special-cases it.
- **S9** Panic thresholds -> left as is (per-role by design; Q4 still open).
- **S10** `on_disabled` -> left as is (only the broadcaster needs it).
- **S11** Locals naming -> Healer Combat/Skills locals are snake_case.
- **S12** Top-level declarations -> done under F4.
- **S13** errlog instrumentation -> `loop_tick(name)`/`loop_next(name, ms)` in Character Runner give every action/skill loop the same beat and lag sampling; the Healer's one-off timings are gone.
- **S14** Config keys -> Ranger Looting.js deleted with its `delay_ms`/`loot_month` keys; Ranger `sample_targets` removed; Warrior `mp_thresholds`/`chest_threshold` (equipment) removed with their rules. Keys read only by commented-out skills stay with that code.
- **S15** Loot shipping threshold -> done under B18.
- **S16** Vendor list -> blocked on Q1 (which list is wrong); unchanged.
- **S17** Core naming -> `ALL_BOSSES`, `LOCATIONS`; Targeting uses `const`/`let`; `COOLDOWNS.equip_swap` is the swap-cooldown fallback (500); `BOSS_NEARLY_DEAD_HP` replaces the camp's `0.05`; merchant send ranges are named constants (B18).
- **S18** Merchant Crafting.js rewritten in the repo's style (`const`/`let`, arrows, `===`, `for…of`, awaited `craft()`, `CONFIG.min_free_inventory_slots` instead of the literal 3); Merchant Party's duplicate `on_party_*` removed.
- **S19** Comments -> the listed non-divider comments removed or trimmed to titles (Movement, Custom Log, Stats Window, Error Handling, Error Log, Settings Window, Maintenance, Ranger Combat); semicolons at Warrior Combat:6 and Bank Viewer:167; Merchant Upgrading indentation; `var al_items`.
- **S20** Dead code removed -> `apply_booster_rule`/`find_booster_slot`, `burn_ticks_at_dps`, the `should_pause_equipment_resolve` hook, `cache.invalidate`, `DUNGEON_LOOP_ENABLED`, `SMART_USE_TOWN`/`update_town_escape`, the `wabbit`/`dynamic` branches, `CM_HANDLERS["default"]`, `scan_inventory_for_item_index`, `upgraded`/`combined`, sets `sugarrush`/`burnboom`. Kept on purpose: console utilities (`al_errors*`, `ui_window`, `set_gold_interval`, `sort_all_bank`, `heal_report` chain) and anything only reachable from commented-out code (`handle_stomp`, `handle_zapper`, `equip_once`, sets `basher`/`zap_on`/`zap_off`).
- **S21** Docs -> CLAUDE.md drops `Warrior Bscorpion.js` and describes the Warrior's `target_priority`/`protects`; Error Sink.py names the real paths.

### 2.1 Bugs (will misbehave in game)

**B1. Upgraded and compounded items are vendored on the way back to the bank.**
[Merchant Upgrading.js:633](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L633) calls `sell_items()` after the upgrade pass. [Merchant Inventory.js:41-46](Character%20Managers/Merchant%20Manager/Merchant%20Inventory.js#L41-L46) sells any item whose name is in `SELLABLE_ITEMS` with no level check, skipping only exact stand stock and default gear. [Loot Management.js:295-307](Core%20Systems/Loot%20Management.js#L295-L307) lists `strring`, `dexring`, `intring`, `strearring`, `dexearring`, `intearring`, `harbringer`, `quiver`, all of which are in `COMBINE_PROFILE`/`UPGRADE_PROFILE` ([Merchant Upgrading.js:9-54](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L9-L54)).
Trigger: bank holds 3× `dexring`+0 → withdrawn → compounded → sold to the NPC. Same for a `harbringer` pushed to +7.
Fix: in `has_sellable_items`/`sell_sellable_items` skip names present in `UPGRADE_PROFILE` or `COMBINE_PROFILE`. Note the fighters' `remote_sell_items` ([Loot Management.js:309-313](Core%20Systems/Loot%20Management.js#L309-L313)) vendors the same rings every 5 s, so ring drops never reach the merchant at all; decide which of the two lists is wrong (see Question Q1).

**B4. Bank withdrawal only knows packs 0–14.**
[Loot Management.js:256-265](Core%20Systems/Loot%20Management.js#L256-L265) moves to `bank` for packs 0–7 and `bank_b` for 8–14. The reference (`Game API Reference.md` lines 742–743) puts `items8–items23` in `bank_b` and `items24–items47` in `bank_u`. Every bank counter (`bank_has_upgradeable_items`, `has_bank_exchangeables`, `stock_bank_count`, `bank_quantity_for`) counts all packs, so the task loop sees items it cannot fetch. Conditional on the account owning packs ≥15.
Fix: route 8–23 to `bank_b`, add a `bank_u` location for 24–47.

**B5. The sugar-rush swap trick never swaps anything.**
[Warrior Combat.js:63](Character%20Managers/Warrior%20Manager/Warrior%20Combat.js#L63) defines `swap_slots` as `[{num, slot}]`; lines [87 and 89](Character%20Managers/Warrior%20Manager/Warrior%20Combat.js#L87-L89) pass them to `equip_apply_slots`, which calls `batch_equip` ([Equipment.js:440-444](Core%20Systems/Equipment.js#L440-L444)). `batch_equip` reads `data[i].item_name` and `continue`s when it is missing ([Equipment.js:58-63](Core%20Systems/Equipment.js#L58-L63)), returns 0, and `equip_apply_slots` still returns `true`.
Trigger: any attack on a bscorpion while `sugarrush` is absent and `single` is worn. Effect: the equip token is claimed at priority 70 for 300 ms after every attack (blocking the rules resolver), `swap_trick_attempts` grows forever, "Sugar Rush activated" never logs.
Fix: have `equip_apply_slots` call the game's `equip_batch(slots)` (which takes `[{num, slot}]`) instead of `batch_equip`.

**B7. `withdraw_item` is called without `await` in four places, breaking the free-slot reserve.**
[Merchant Upgrading.js:170](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L170), [187](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L187), [235](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L235), [295](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L295). `withdraw_item` ([Loot Management.js:223-289](Core%20Systems/Loot%20Management.js#L223-L289)) is async and awaits each `bank_retrieve`; the callers re-read `count_empty_inventory()` 400 ms later, before the retrievals land, so the "leave 3 free" rule is not honoured, errors escape the surrounding `try`, and overlapping calls can interrupt each other's `smarter_move`. Line 170 also withdraws *every* stack of each scroll type (`total` null → Infinity).
Fix: `await` each call; pass a count for scrolls.

**B11. `inventory_sorter` can swap two items back and forth every 2 s.**
[Loot Management.js:124-146](Core%20Systems/Loot%20Management.js#L124-L146) snapshots `held` before any swap, then emits every swap in one pass. With `hpot1` in slot 4 and `xptome` in slot 2 it emits `swap(4,2)` then, from the stale snapshot, `swap(2,4)`, undoing it. Runs from `maintenance_loop` every 2 s ([Character Runner.js:80](Core%20Systems/Character%20Runner.js#L80)).
Fix: apply each swap to a local copy of the array before choosing the next, or emit one swap per tick. The sugar-rush trick's hardcoded slots 39/40 depend on this sorter being right.

**B14. `craft_cost_for_count` charges the recipe gold once per batch; `craft()` is not awaited.**
[Merchant Crafting.js:93](Character%20Managers/Merchant%20Manager/Merchant%20Crafting.js#L93) starts from `craft_def.cost` and multiplies only the ingredient purchases by `count`, so `max_affordable_count` overstates by `(count-1)*cost`. [Lines 236-242](Character%20Managers/Merchant%20Manager/Merchant%20Crafting.js#L236-L242) drop the `craft()` promise, so a gold rejection is unhandled and still counted in `crafted++`.
Fix: `craft_def.cost * count`; `await craft.apply(...)`.

**B15. The Warrior re-sends `attack` every 10 ms until the server answers.** *(medium confidence)*
[Warrior Combat.js:76](Character%20Managers/Warrior%20Manager/Warrior%20Combat.js#L76) fires `attack(target)` without awaiting; the loop reschedules in 10 ms ([line 133](Character%20Managers/Warrior%20Manager/Warrior%20Combat.js#L133)) and `ms_to_next_skill("attack")` reads `parent.next_skill`, which the reference says is set from the server's `skill_timeout` (lines 345, 651). Each swing therefore sends roughly ping/10 duplicate attacks, all rejected as cooldown, each counting toward `character.cc`, which gates cleave, the equipment resolver and looting. The Healer solved this with `basic_action_busy` ([Healer Combat.js:112-124](Character%20Managers/Healer%20Manager/Healer%20Combat.js#L112-L124)); the Ranger awaits.
Verify: `al_errors(true)` quiet "Attack c/d" counts on Ulric. Fix: `await` the attack, or lift the Healer's busy window into Core and use it in all three.

**B16. The Healer's busy window survives a rejected cast.**
[Healer Combat.js:117-118](Character%20Managers/Healer%20Manager/Healer%20Combat.js#L117-L118) sets `_basic_action_until` before the promise settles; the rejection branch at [line 122](Character%20Managers/Healer%20Manager/Healer%20Combat.js#L122) only calls `catcher`. When the heal target died inside the 50 ms cache window (`not_there`) or stepped out of range, she idles ~600–700 ms with the timer free.
Fix: reset `_basic_action_until = 0` in the rejection branch.

**B17. crabx agitate needs exactly five untargeted crabs.**
[Warrior Skills.js:198](Character%20Managers/Warrior%20Manager/Warrior%20Skills.js#L198): `untargeted_crabs.length === 5`. With six or more, the branch never fires and crabx is not in the list at [line 204](Character%20Managers/Warrior%20Manager/Warrior%20Skills.js#L204). Fix: `>= 5`.

**B20. The stuck escape can town-portal a character that is deliberately standing still.** *(conditional)*
[Movement.js:312-352](Core%20Systems/Movement.js#L312-L352) exempts followers with a live leader, the home map, instances and giantspider, but not a `hold` goal. Myras standing at the `anniversary-kiss` hold ([World Events.js:180](Core%20Systems/World%20Events.js#L180)) off the home map with no monster within 300 px for 60 s is portalled to town. Fix: bail when `_current_goal` is a hold/local goal or when `!travel_is_active()`.

### 2.2 Fragile (works today, breaks on the next edit)

All nineteen items (F1-F19) are fixed; see 2.0.

### 2.3 Improvements (correct today, could be better)

**I1. Give the Warrior a `protects` term.** CLAUDE.md says the Warrior's priority is `["Myras"]`, but [Warrior Config.js:10](Character%20Managers/Warrior%20Manager/Warrior%20Config.js#L10) weights are `{damage, close}` and [find_best_target:29-38](Character%20Managers/Warrior%20Manager/Warrior%20Combat.js#L29-L38) passes no `protect` context, so he attacks the highest-value monster in reach, including untargeted ones, pulling aggro onto himself. [Targeting.js:66](Core%20Systems/Targeting.js#L66) already supports it. Effect: fewer mobs on the non-tank, fewer Warrior panics.

**I2. Add Riva to the Healer's `target_priority`.** [Healer Config.js:11](Character%20Managers/Healer%20Manager/Healer%20Config.js#L11) is `["Ulric","Myras"]`. Riva panics at `aggro: 1` ([Ranger Config.js:81](Character%20Managers/Ranger%20Manager/Ranger%20Config.js#L81)), stops shooting while panicking and never targets what is on her ([Ranger Combat.js:22](Character%20Managers/Ranger%20Manager/Ranger%20Combat.js#L22)); the mob on her is reached only by the fallback at [Healer Combat.js:52](Character%20Managers/Healer%20Manager/Healer%20Combat.js#L52). Effect: shorter Ranger panics.

**I3. Cupid hysteresis.** `find_cupid_target` ([Ranger Combat.js:185-202](Character%20Managers/Ranger%20Manager/Ranger%20Combat.js#L185-L202)) uses one threshold; an ally hovering at 66% causes bow↔cupid swaps every 500 ms with one heal in between. Enter at 0.66, leave at ~0.85.

**I4. `change_target` spam.** [Ranger Skills.js:67-68](Character%20Managers/Ranger%20Manager/Ranger%20Skills.js#L67-L68) sends `change_target` on every ≤5 ms tick once a skill is within ping/10 of ready. Guard on `parent.ctarget?.id !== target.id`.

**I5. Potion restock buys the full `min_stock`, not the deficit.** [Maintenance.js:47-48](Core%20Systems/Maintenance.js#L47-L48): at 999/1000 it buys 1000 more. The merchant also keeps 1000 of each for himself ([Merchant Upkeep.js:11-23](Character%20Managers/Merchant%20Manager/Merchant%20Upkeep.js#L11-L23)) although nothing in the delivery run hands potions out. Gold tied up for nothing.

**I6. Empty sets drive real rules.** Warrior `cape`/`coat`/`loadout` resolve to `stealth`, `cape`, `stat`, `mana`, `dps`, `dps_accessories`, all empty arrays ([Warrior Config.js:135-169](Character%20Managers/Warrior%20Manager/Warrior%20Config.js#L135-L169)); Ranger `loadout` resolves to an empty `dps` ([Ranger Config.js:105](Character%20Managers/Ranger%20Manager/Ranger%20Config.js#L105)). `resolve_warrior_cape` costs an entity scan every 25 ms to choose between two empty sets. Concretely: at a boss off the home map both fighters keep whatever weapon they had, because `resolve_warrior_home_loadout` returns null off-map and `"dps"` is empty.

**I7. Per-skill try/catch.** The Healer wraps each skill separately ([Healer Skills.js:19-55](Character%20Managers/Healer%20Manager/Healer%20Skills.js#L19-L55)); the Warrior's one `try` ([Warrior Skills.js:9-51](Character%20Managers/Warrior%20Manager/Warrior%20Skills.js#L9-L51)) means a throwing `warcry` skips cleave and agitate for that tick.

**I8. Merchant round trips.** Every upgrade run re-withdraws scrolls and `offeringp`, every fishing run re-withdraws the `rod`, because `bank_items` banks everything past slot 2 ([Merchant Inventory.js:134-137](Character%20Managers/Merchant%20Manager/Merchant%20Inventory.js#L134-L137)); fishing leaves the spot after one successful cast ([Merchant Gathering.js:52-55](Character%20Managers/Merchant%20Manager/Merchant%20Gathering.js#L52-L55)); `try_craft` banks after every batch ([Merchant Crafting.js:372-373](Character%20Managers/Merchant%20Manager/Merchant%20Crafting.js#L372-L373)), banking the `basketofeggs` that `should_run_exchange` then re-withdraws. Adding tools/scrolls/offerings to `do_not_bank`, waiting out the fishing cooldown, and exchanging in place would each remove a bank trip per cycle.

**I9. Delivery leaves while loot is still arriving.** [Merchant Party.js:127-129](Character%20Managers/Merchant%20Manager/Merchant%20Party.js#L127-L129) sells and banks as soon as `any_party_within_range()` was true once; the fighter is still `send_item`ing every 150 ms, items past 400 px are rejected, `loose_slots` stays > 0 and `should_run_delivery` sends him straight back.

**I10. `get_num_targets` counts dead monsters.** [Combat Utilities.js:328-338](Core%20Systems/Combat%20Utilities.js#L328-L338), unlike `count_my_aggro` ([Healer Combat.js:59](Character%20Managers/Healer%20Manager/Healer%20Combat.js#L59)). Brief overcount after kills in the stuck check and the cape rule.

**I11. `main_tick` errors go to the browser console.** [Character Runner.js:128](Core%20Systems/Character%20Runner.js#L128) uses `console.error`; every other loop uses `catcher()`. The Error Log wrapper records it, but it never reaches the in-game Errors tab, which CLAUDE.md says is where diagnosis happens. Same at [Character Messaging.js:27,77,82](Core%20Systems/Character%20Messaging.js#L27) and [Equipment.js:106,378](Core%20Systems/Equipment.js#L106).

### 2.4 Standardization

All items addressed (S1-S21 in 2.0). Still open by design or pending an answer: panic thresholds (Q4) and the vendor list (Q1).

### 2.5 Performance

| Cost | Where | Rate | Note |
|---|---|---|---|
| Full equipment resolve | `equipment_manager_loop` [Equipment.js:522-531](Core%20Systems/Equipment.js#L522-L531) | 40 Hz | Warrior: `boss_engaged` + `resolve_warrior_cape` entity scan + `warrior_weapon_set` → `smoothed_splash_bonus` → `splash_bonus` per mob (O(mobs×entities)) ×2 sets; `preferred_orb` → `behind_on_xp` → 3× `localStorage` parse. `equip_group_ready` already floors at 500 ms; 100–250 ms loses nothing. |
| `read_state_cache` uncached | [Character Messaging.js:132-142](Core%20Systems/Character%20Messaging.js#L132-L142) | ~150 parses/s per character | Called from the equipment loop, cohesion (up to 6 per main tick), `healer_is_down` (the one caller that memoises). A 100 ms memo per name fixes all. |
| `write_state_cache` | [Character Messaging.js:144-154](Core%20Systems/Character%20Messaging.js#L144-L154) | 10 Hz ×4 tabs | Serialises `character.s`, runs `loose_loot(0)` → `reserved_gear_slots`, `anniversary_should_travel` → `best_event_target`, then a synchronous `setItem`. Readers tolerate 15 s; 250–500 ms is plenty. |
| Warrior `update_cache` | [Warrior Combat.js:6-8](Character%20Managers/Warrior%20Manager/Warrior%20Combat.js#L6-L8) | ~135 scans/s | Called from `main_tick` (100 ms), `action_loop` (10 ms), `skill_loop` (40 ms); line 8 is a full entity scan outside the TTL. |
| `sample_target_choice` | [Targeting.js:141-146](Core%20Systems/Targeting.js#L141-L146) | every `select_target` with ≥2 candidates | Recomputes `target_damage_value` for the whole pool (each an entity scan) *before* the 60 s throttle; Healer runs up to five `best_target` calls per 50 ms. Move the throttle first. |
| Ranger target cache | [Ranger Combat.js:34-79](Character%20Managers/Ranger%20Manager/Ranger%20Combat.js#L34-L79); [Ranger Equipment.js:32-46](Character%20Managers/Ranger%20Manager/Ranger%20Equipment.js#L32-L46) | 20 Hz + 40 Hz | O(n²) per refresh; `ranger_set_value` redoes `splash_bonus`/burn per in-range mob per set on every equipment tick. Cache the per-mob multipliers in `scored`. |
| Camp `move()` emits | [Bscorpion Camp.js:81,96](Core%20Systems/Bscorpion%20Camp.js#L81) | 10 Hz | B9. Line 104 also rescans entities for a bscorpion `find_nearest_bscorpion` already found. |
| `potion_loop` | [Maintenance.js:32](Core%20Systems/Maintenance.js#L32) | 100 Hz when idle | Trivial body; 10 ms is 200× finer than the 2 s potion cooldown warrants. |
| Bank JSON parse | `load_bank_from_local_storage` [Bank Viewer.js:23-28](Interface/Bank%20Viewer.js#L23-L28) | 10–20 parses per 250 ms merchant tick | Off the bank map `character.bank` is undefined, so every `should_run_*` reparses the full saved bank (restock ×4, exchange ×2, craft binary search ×log n). Memoise, invalidate in `refresh_bank_snapshot`/`save_bank_local`. Also `game_log`s "No saved bank data" at the same rate when nothing is saved. |
| Party Frames | [Party Frames.js:94-134](Interface/Party%20Frames.js#L94-L134) | 10 Hz | 3× `localStorage` parse + full `innerHTML` rebuild; values change at 10 Hz at most and matter at 2–4 Hz. |
| Custom Log "All" tab | [Custom Log.js:159-178,222](Interface/Custom%20Log.js#L159-L178) | every `log()` | Concat + sort + rebuild of 100 divs per call; `catcher()` routes every `too_far`/`no_mp` here, so a chasing Warrior rebuilds 100 nodes per rejected attack. `log_history["All"]` is maintained but never read. |
| DPS meter | [DPS Meter.js:271-335](Interface/DPS%20Meter.js#L271-L335) | 4 Hz | See B10; even after the prune fix it walks each array ~3× and rebuilds the table via `.html()`. |
| `has_sellable_items` | [Merchant Inventory.js:29-37](Character%20Managers/Merchant%20Manager/Merchant%20Inventory.js#L29-L37) | 4 Hz | 42 slots × 80-element `includes`; a `Set` would do. |

---

## 3. Cross-file contract map (condensed)

### 3.1 Load order and scoping

1. `Core Systems/Global Config.js` alone (real `<script>`).
2. In parallel, real `<script>` tags (`const`/`let`/`function` all global, order nondeterministic): Movement, Bscorpion Camp, Combat Utilities, Targeting, World Events, Character Messaging, Equipment, Party Management, Loot Management, Maintenance, Party Cohesion, Character Runner, Error Handling, Error Log; then Interface: Custom Log, Bank Sort Order, Widget Helpers, Game Log, XP Meter, Gold Meter, DPS Meter, Bank Viewer, Party Frames, CC Meter, Stats Window, Settings Window, Pause Button.
3. Sequentially via indirect eval (`var`/`function` global; `const`/`let` file-private): Ulric → Warrior Config, Combat, Skills, Equipment, Movement, Warrior.js. Myras → Healer Config, Combat, Skills, Equipment, Movement, Dungeon, Healer.js. Riva → Ranger Config, Combat, Skills, Equipment, Movement, Looting, Ranger.js. Riff → Merchant **Upgrading, Crafting** (before Config), Config, Stand, Inventory, Exchange, Gear, Gathering, Party, Upkeep, Task Loop, Merchant.js.

No Core top-level initializer reads another Core file (all cross-file uses are inside functions or `typeof`-guarded); the Interface meters poll for `create_bottomrightcorner_widget` and the corner buttons poll for each other's DOM. No character-file initializer reads a later file; `PRIORITY_CHECKS` names only functions from earlier merchant files. No character file runs code at load except the four entry points. No `??=`/`||=`/`&&=` anywhere.

Character-file `const`/`let` (all file-private, all currently same-file-only): Healer Combat 110, 126, 153, 154; Healer Skills 135, 136; Healer Dungeon 39; Merchant Upgrading 6, 7, 9, 34, 60, 62, 132; Merchant Stand 5, 6, 108, 157, 158; Merchant Inventory 57, 58, 89, 115, 161, 162; Merchant Exchange 5, 38; Merchant Gathering 5–7; Merchant Party 5, 6, 75; Merchant Upkeep 30, 31; Merchant Task Loop 5, 85, 129, 130, 131.

Symbols Core reads that a character file must define (`var`/`function`): `home`, `destination`, `CONFIG.{combat,movement,equipment,looting,potions,elixir,party}`, `state.equip_cooldowns`, `state.last_reposition`, `PANIC_THRESHOLDS`, `equipment_sets`, `EQUIPMENT_RULES`, `MONSTER_GEAR_OVERRIDES`, `ITEMS_TO_KEEP`, `item_order`, `reposition`, `update_cache`; optional and guarded: `PANIC_BROADCAST_TARGETS`, `model_prediction`, `should_pause_equipment_resolve`. The two unguarded reads that would throw for a character missing them are [Party Management.js:66](Core%20Systems/Party%20Management.js#L66) (`PANIC_THRESHOLDS`) and [Loot Management.js:128](Core%20Systems/Loot%20Management.js#L128) (`item_order`); the merchant defines neither and is safe only because he never calls those paths.

### 3.2 Name collisions

`on_party_request`/`on_party_invite`: Core [Party Management.js:185-186](Core%20Systems/Party%20Management.js#L185-L186) and [Merchant Party.js:18-24](Character%20Managers/Merchant%20Manager/Merchant%20Party.js#L18-L24) (merchant's wins, identical logic). `_cmListeners`: Bootstrapper window property vs Messaging `const` (the former is dead). Deliberate wrappers of game globals: `on_cm`, `on_game_event`, `log`, `game_log`, `heal`, `console.error`. Generic Interface globals that would collide with any future Core name: `interval`, `start_time`, `damage`, `order`, `al_items`. Function-local shadows of Core names: `delay` (six loop bodies), `state` (Warrior Equipment 59, Merchant Task Loop 158).

### 3.3 Shared-state writers

`panicking`/`panic_external`/`panic_external_since`: written only in `set_panic()` ([Party Management.js:15-27](Core%20Systems/Party%20Management.js#L15-L27)); CLAUDE.md's claim holds. `last_panic_time` is also written at [line 99](Core%20Systems/Party%20Management.js#L99) and `last_safe_time` at [137](Core%20Systems/Party%20Management.js#L137). `set_panic` callers: Party Management 84/131/148, Character Messaging 36 (CM from Myras only), Healer Movement 7. `CONFIG` is never written at runtime. `merchant_task` has 15 write sites across seven merchant files; the watchdog is the only generation writer. localStorage keys: `AL_automation_paused_*` (Global Config), `AL_char_state_*` (Messaging, 10 Hz), `AL_set_profile2_*` (Equipment), `AL_errors_*` (Error Log), `savedBank` (Loot Management, Bank Viewer), `AL_target_*`/`AL_merchant_enabled_*` (Settings Window).

### 3.4 Loop inventory

All fighter loops start once from `run_character` and never stop; none has a double-start guard except `panic_check` (`_panic_check_running`) and `run_spider_dungeon`. The pause flag gates only `main_tick`'s movement half ([Character Runner.js:110-113](Core%20Systems/Character%20Runner.js#L110-L113); `update_cache` and `panic_check` still run) and the merchant's `loop_controller`. Everything else keeps running while paused: action/skill/equipment/maintenance/potion/anniversary loops, the three bscorpion camp loops (B8), the merchant's `opportunistic_actions_loop` (still buys potions and sends `send_loot` CMs). Core intervals started at load: `send_updates` 20 s, periodic reset 60 s, damage samplers 250 ms/1 s/1 s/10 s, error log 100 ms/1 s/5 s. Interface intervals: XP 500 ms, Gold 500 ms, DPS 250 ms, Party Frames 100 ms, CC 100 ms, pause repaint 500 ms. The 4-hourly `location.reload()` clears all of them.

### 3.5 CM contract

| Type | Sender → receiver | Handler |
|---|---|---|
| `panic {state}` | Myras → Ulric, Riva ([Party Management.js:92,150](Core%20Systems/Party%20Management.js#L92), [Healer Movement.js:8](Character%20Managers/Healer%20Manager/Healer%20Movement.js#L8)) | [Messaging:34-37](Core%20Systems/Character%20Messaging.js#L34-L37), Myras-only |
| `suppress_reset` | Myras → Ulric, Riva | [Messaging:39](Core%20Systems/Character%20Messaging.js#L39); never un-set by CM (F7) |
| `enter_instance {in}` | Myras → Ulric, Riva | [Messaging:41-51](Core%20Systems/Character%20Messaging.js#L41-L51), unbounded interval (F7) |
| `instance_ready` | Ulric/Riva → Myras | ad-hoc listener only while the dungeon waits ([Healer Dungeon.js:62-72](Character%20Managers/Healer%20Manager/Healer%20Dungeon.js#L62-L72)); otherwise silently dropped |
| `reload` | Myras → Ulric, Riva; Settings Window → all | [Messaging:58-60](Core%20Systems/Character%20Messaging.js#L58-L60) |
| `send_loot` | Riff → nearby fighters ([Merchant Upkeep.js:48](Character%20Managers/Merchant%20Manager/Merchant%20Upkeep.js#L48)) | [Messaging:53-55](Core%20Systems/Character%20Messaging.js#L53-L55) → `send_to_merchant` (needs Riff within 400; Riff sends only within 350) |

No shape mismatches. `CM_HANDLERS["default"]` is referenced but never defined, so unknown types are dropped silently.

### 3.6 Equipment and movement contracts

Equipment: `batch_equip` is the only `equip_batch` emitter; every live swap path goes through a token (`rules` 20, `looting` 60, `swap-trick` 70, `cleave-swap` 80, `panic` 100). Bypasses: `equip()`/`unequip()` in Merchant Gear (merchant has no arbiter), the disabled temporal surge ([Healer Equipment.js:156](Character%20Managers/Healer%20Manager/Healer%20Equipment.js#L156)), the dead stomp path, and booster `shift()` from three writers (Maintenance, Loot Management, the dead `apply_booster_rule`) with no cooldown between them. `equip_group_ready` cooldown applies only to `resolve_equipment`.

Movement: fighters go through `movement_goal` → `travel_arbiter` → `movement_local` from `main_tick`; the arbiter interrupts any `smart.moving` it does not own after 3 s. Bypasses: the three bscorpion camp loops (`move()` at 10 Hz, not gated by goal, panic, pause or `smart.moving`); Healer Dungeon's direct `smarter_move` (safe because `movement_goal` returns null for the leader in giantspider mode); `withdraw_item`'s `smarter_move` from the Bank Viewer onclick; the merchant uses `smarter_move` directly everywhere plus raw `smart_move("basics")` in Crafting, and only touches the arbiter for the anniversary.

---

## 4. Things I checked that are fine

- No `??=`, `||=`, `&&=` in any file.
- No eval-scope bug exists today: every character-file `const`/`let` is read only by its own file; every cross-file share is `var`/`function`.
- No load-order bug: `PRIORITY_CHECKS` and every other top-level initializer name only already-loaded symbols; no Core file's top-level code reads a parallel Core file.
- No non-entry character file runs code at load.
- `set_panic()` is the sole writer of the panic flags; the external-hold expiry (60 s) covers a Healer tab reload mid-panic; `healer_on_disabled` covers her death.
- The panic/rules/looting/trick priority ladder is consistent: panic (100) blocks the rules resolver while held, releases on recovery, and `loadout_manages_orb()` correctly defers the orb restore to the rules.
- CM payload shapes match their handlers; every handler has a sender.
- Error Log: every mutating path is try-wrapped, recursion is guarded, `JSON.stringify` inputs are scalar-only, all rings are capped except `counts` (bounded in practice), the sink's field names match the JS payload, CORS/OPTIONS handled, loopback is exempt from mixed-content blocking. `catcher()` surfaces everything except cooldown/`not_there`, which are deliberately quiet.
- Socket listeners in Combat Utilities and DPS Meter are re-registration-guarded; Error Log's `log`/`game_log`/`heal` wraps are idempotent.
- Interface widgets poll for their container helper, so the parallel-load race is handled; the 4-hourly reload clears all DOM/timers so there is no cross-reload leak.
- Periodic reset window logic (`in_reset_window`, boot-bucket seeding, anniversary deferral) is correct.
- `smarter_move`'s settle/interrupt/timeout state machine is sound; the travel arbiter's drift/stall/search-overrun re-issue logic has no fight with `movement_local` (it refuses when `smart.moving`).
- Healer aggro cap, heal-target selection, party-heal value comparison and absorb-from-ally logic match the documented tank layout.
- Merchant `PRIORITY_CHECKS` ordering and the idle stand/sell/exchange cycle; restocking's failure memo; gathering's generation check.
- Deploy process in CLAUDE.md is consistent with what Code Loader/Bootstrapper actually do, apart from F1.

---

## 5. Questions

**Q1.** Are `strring`/`dexring`/`intring`/the earrings/`harbringer`/`quiver` junk to vendor (as `SELLABLE_ITEMS` says, and as the fighters do every 5 s) or compound/upgrade stock (as the merchant profiles and the `strring`+4 stand listing say)? Both cannot be right; the answer decides whether B1's fix is in the merchant or in the fighters' vendor list.

**Q2.** Is the grace pass ([Merchant Upgrading.js:64-130](Character%20Managers/Merchant%20Manager/Merchant%20Upgrading.js#L64-L130)) meant to perform real upgrades with `scroll_num = null` and an `offeringp`? If the server accepts that, it consumes an offering per attempt and can fail a +8 fireblade; if it rejects, the pass is a no-op and `grace_capped_slots` only feeds a log line either way.

**Q3.** `best_weapon_set` ([Equipment.js:282-293](Core%20Systems/Equipment.js#L282-L293)) wears each candidate set for 20 s whenever its profile is older than 10 minutes. Is a 20 s swap to the worse weapon every 10 minutes per set the intended cost of keeping profiles fresh, or should re-probing be rarer / only while no boss is up?

**Q4.** The Healer's `high_mp: 0.50` means her own panic, and therefore the party-wide external hold on Ulric and Riva, cannot clear until she is at half mana. Given her aggro cap already scales with MP, is that deliberate?

**Q5.** Does `smart_move({ to: "town" })` work in the client ([World Events.js:23](Core%20Systems/World%20Events.js#L23))? The reference lists `{to: map_name | monster | npc}` and string forms; if it rejects, the holiday goal fails silently and blocks local movement every 3 s during holiday season.

**Q6.** Should the bscorpion-camp `absorb` ([Bscorpion Camp.js:103-109](Core%20Systems/Bscorpion%20Camp.js#L103-L109)) exist at all, given `handle_absorb` already pulls anything hitting an ally? If the intent was to pull an *untargeted* scorpion onto Myras, `absorb` cannot do that.

**Q7.** Should the Warrior's `MONSTER_GEAR_OVERRIDES.bscorpion` and the Healer's `fireroamer` override apply off the home map (F16)?
