# IMPROVEMENT_PLAN.md

Twenty changes drawn from a review of [earthiverse/adventureland-bots](https://github.com/earthiverse/adventureland-bots)
(TypeScript/Node on ALClient — none of its code ports, but the game math does).

Every item below has been checked against this repo; none of them duplicate something already present.

**Items are numbered in the order they should be done**, not grouped by topic — see "By topic"
below for the thematic view. Items 19 and 20 sit outside the sequence deliberately.

**One exception to "none of its code ports":** `source/videos/optimizing_attack/` is seven numbered
**plain-JS, browser-injected** scripts — the same environment we run in — forming a measured
progression of attack-loop optimisation, each instrumented with `show_json()` to report kills per
ten minutes. Items 1, 2 and 19 come from it and can be read as runnable code rather than translated.

**Role reminder:** `Myras` (Healer) is the tank. `Ulric` (Warrior) is DPS and the puller who
gathers mobs for her via `agitate`. Survivability work belongs on Myras; see CLAUDE.md
§ "The Healer tanks — not the Warrior".

---

## Ordering

| # | Item | Files | Risk | Depends on |
|---|------|-------|------|------------|
| ✅ 1 | `reduce_cooldown()` after skill use | `Combat_Utilities.js`, all `*_Skills.js`, `*_Combat.js` | Low | — |
| ✅ 2 | Sleep the exact cooldown | `Character_Runner.js`, `Ranger_Skills.js` | Low | 1 |
| 3 | Respawn-timed temporal surge | `Healer_Equipment.js`, `Healer_Config.js` | Low | — |
| 4 | Anti-stacking | `Movement.js` or `Combat_Utilities.js` | Low | — |
| ✅ 5 | Cleave gating rework | `Warrior_Skills.js`, `Warrior_Config.js` | Low | — |
| ✅ 6 | Cooldown-driven skill loops | `Combat_Utilities.js`, `Warrior_Skills.js` | Low | 1 |
| ✅ 7 | Time-to-death tracking | `Combat_Utilities.js` | Low | — |
| ✅ 8 | Damage-aware aggro cap | `Combat_Utilities.js`, `Healer_Combat.js` | Med | — |
| ✅ 9 | Projected-death escape | `Combat_Utilities.js`, `Party_Management.js` | High | 8 (shares the damage helper) |
| ✅ 10 | Tank-specific scare policy | `Party_Management.js`, `Game_Config.js` | Med | 8, 9 |
| ✅ 11 | Agitate/cleave/taunt arbitration | `Warrior_Skills.js` | Med | 5 |
| ✅ 12 | Overkill prevention (**kill-claims only**) | `Messaging.js`, `Combat_Utilities.js`, each `*_Combat.js` | Med | 7 |
| ✅ 13 | Spread-out target sorter | `Combat_Utilities.js`, `Warrior_Combat.js` | Low | — |
| ✅ 14 | Monster-derived kite distance | `Combat_Utilities.js`, `Ranger_Movement.js` | Med | — |
| ✅ 15 | Per-monster tactical overrides | `*_Config.js`, `*_Skills.js` | Med | — |
| 16 | Resolve instance keys from `G` | `Healer_Dungeon.js` | Low | — |
| 17 | Let instances age before clearing | none (strategy) | None | — |
| 18 | Per-monster dungeon sub-strategies | `Healer_Dungeon.js` | Med | 14, 15, 16 |
| ✅ 19 | Multiple-attack burst (**off by default**) | `Ranger_Combat.js`, `Combat_Utilities.js` | High (CC) | 1 |
| 20 | Leave `hardshell` disabled (**no action**) | — | None | — |

✅ marks an item that has been written. Nothing is ticked as *verified* — that needs the live client.

Items **1–2** are a correctness fix and should land before anything else measures timing.
Items **8–10** share one new function; build it first within that group.
Items **16–18** are only worth doing if dungeon running expands past the spider run.
Items **19–20** are out of sequence on purpose: 19 may be a net loss, 20 is a record of a
decision already correctly made.

## By topic

| Topic | Items |
|---|---|
| Timing | 1, 2, 6, 19 |
| Survivability (Myras, the tank) | 3, 8, 9, 10 |
| Warrior aggro donation (Ulric) | 5, 11, 20 |
| Targeting and rotation | 7, 13, 14, 15 |
| Party coordination | 4, 12 |
| Dungeons | 16, 17, 18 |

---

## Reference: the attack-loop progression

`source/videos/optimizing_attack/` in the source repo, with where our loops currently sit:

| Stage | Technique | Where we are |
|---|---|---|
| `2_default.js` | `setInterval(..., 250)` | past it |
| `3_while_true.js` | `while(true)` — crashes the game, included as a counter-example | n/a |
| `4_10ms.js` | `setInterval(async …, 10)` + `await attack()` | past it |
| `5_next_skill.js` | `setTimeout` chain on `Math.max(1, ms_to_next_skill("attack"))` | **≈ here** |
| `6_reduce_cooldown.js` | `reduce_cooldown("attack", Math.min(...parent.pings))` | **item 1** |
| `7_multiple_attacks.js` | burst of 9 attacks 1ms apart | **item 19** |

---

## ✅ 1. Call `reduce_cooldown()` after every skill use

**Files:** `Shared/Combat_Utilities.js`, all `*_Skills.js` and `*_Combat.js`

This is a correctness fix, not a tuning change, and it is the highest-value item in the plan.

`ms_to_next_skill()` currently compensates for ping inside its own return value:

```js
const ping = parent.pings?.length ? Math.min(...parent.pings) : 0;
const ms = next_skill.getTime() - Date.now() - ping;
```

`reduce_cooldown(name, ms)` instead **mutates `parent.next_skill[name]`** (see
`GAME_API_REFERENCE.md`). The difference is who else sees the compensation, and today the codebase
is split down the middle:

- **Compensated** — every caller of `ms_to_next_skill()`: all three `action_loop`s, and
  `Ranger_Skills.js` (`ms_hunter` / `ms_super`).
- **Not compensated** — every caller of `is_on_cooldown()` and `can_attack()`, which read
  `parent.next_skill` directly: `warcry` in `Warrior_Skills.js`, plus `handle_agitate()`,
  `handle_cleave()` and `handle_taunt()`.

So **every warrior skill currently fires one full round-trip late, every time.**

**Change:** call `reduce_cooldown(skill, Math.min(...parent.pings))` after each successful skill
use. Both paths then agree, and the manual `- ping` inside `ms_to_next_skill()` can be removed so
the compensation is not applied twice.

**Verify in-game:** log `parent.next_skill.warcry` before and after a `use_skill("warcry")` — the
timestamp should land earlier than the raw cooldown by roughly the current min ping.

---

## ✅ 2. Sleep the exact cooldown, not a bucketed approximation

**Files:** `Shared/Character_Runner.js` — `next_action_delay()` (~line 27);
`Character_Functions/Ranger/Ranger_Skills.js`

```js
function next_action_delay(ms) {
	return ms > 200 ? 200 : ms > 50 ? 50 : 10;
}
```

For any `ms` between 1 and 50 the loop sleeps 10, so at `ms = 1` it wakes 9ms late. At `ms = 51` it
sleeps 50, then sleeps 10 more for the remaining 1 — 9ms late again. The exact figure is computed
and then discarded.

**Change:** `setTimeout(loop, Math.max(1, ms))`, as in stage 5 of the progression.

Note this **reduces** wakeups rather than increasing them: the bucketed version wakes at fixed
10/50/200ms boundaries regardless of when the skill is actually ready, while an exact sleep wakes
once, when it is.

Apply the same to the hand-rolled bucketing at the end of `Ranger_Skills.js`
(`min_ms > 200 ? 100 : min_ms > 50 ? 20 : 5`).

---

## 3. Respawn-timed temporal surge (Myras)

**Files:** `Character_Functions/Healer/Healer_Equipment.js`, `Healer_Config.js`

`orboftemporal` is in the config and `temporalsurge` is wired, but
`equipment.temporal_surge_enabled` is `false`.

**Change:** surge when standing within 160px of a boss spawn point whose respawn estimate has
passed and whose entity is not yet visible — spawn-driven, not cooldown-driven. Earthiverse backs
this with a MongoDB respawn table; this repo needs its own estimates, so start with a static table
of spawn coordinates for the bosses actually farmed here and refine later.

**Gotcha:** the equip → surge → re-equip sequence must `await` `character.s.penalty_cd.ms` after
equipping the orb, or the surge is rejected. Confirm the cooldown guards in `Shared/Equipment.js`
account for this before enabling.

---

## 4. Anti-stacking (party-wide)

**File:** `Shared/Movement.js` or `Shared/Combat_Utilities.js`

The `hit` socket event carries `data.stacked` — a server-provided list of entity ids stacked on one
pixel. No geometry to compute. Nothing in this repo reads it.

**Change:** on `hit`, if `data.stacked` includes `character.id` and the character is not already
moving, jitter position by ±25px. Rate-limit to once per 250ms.

Stacking quietly ruins both the Healer's circle walk (`movement.circle_walk`) and the Warrior's
reposition scorer, so this is cheap insurance for two systems at once.

---

## ✅ 5. Cleave gating rework (Ulric)

**File:** `Character_Functions/Warrior/Warrior_Skills.js` — `should_cleave()` (~line 110)

Cleave aggros everything it touches onto Ulric, but his `target_priority: ["Myras"]` says he is
meant to be killing what *she* already holds. The gate should therefore measure aggro he is about
to steal, not just mob count.

Three specific changes:

- **Cap newly-aggroed targets, not total mobs.** `cleave_min_mobs: 3` counts everything in range,
  including mobs that already have a target and so cost nothing. Count only `!e.target` entities —
  those are the ones that will land on him.
- **Skip cleave when a single target is already one-shot-able** by a normal attack. Free win, no
  downside.
- **The `ms_to_next_skill("attack")` guard.** Currently `<= 75`. Earthiverse uses 360, because that
  is the *equip penalty* in ms — only relevant if a weapon swap is added, but note it now so the
  number is not mistaken for an arbitrary constant later.

**As built:** all three, plus a correction — `handle_cleave()` **already swaps to a bataxe**, so the
360ms equip penalty is not hypothetical here. `cleave_attack_headroom()` returns 75 when the bataxe
is already held and `EQUIP_PENALTY_MS` (360) when a swap is needed, so current behaviour is
preserved in the no-swap case and the swap case stops eating an attack window.

The new-aggro cap is `CONFIG.combat.cleave_max_new_aggro` (2), counting only `!e.target` monsters
that the cleave would *not* kill outright — a mob that dies to the cleave never lands on him.
`cleave_min_mobs` is untouched and still measures total mobs in range, which is the right question
for "is this cleave worth the MP".

---

## ✅ 6. Schedule skill loops off cooldowns, not a fixed tick

**Files:** `Shared/Combat_Utilities.js` (new helper), `Character_Functions/Warrior/Warrior_Skills.js`

The source repo lets a loop declare the skills it uses and reschedules itself to whichever is ready
soonest:

```js
Math.max(50, Math.min(...skills.map(skill => getCooldown(skill))))
```

`Ranger_Skills.js` already does exactly this by hand with `Math.min(ms_hunter, ms_super)`.
`Warrior_Skills.js` does not — it runs on a flat `TICK_RATE.skill = 40`ms tick, re-evaluating
warcry (long cooldown), cleave and agitate twenty-five times a second regardless of whether any of
them could possibly be ready.

**Change:** extract the Ranger's pattern into a shared helper — `ms_to_next_of(["warcry", "cleave",
"agitate"])` — and drive the Warrior loop from it. The 50ms floor matters; without it a
zero-cooldown skill spins the loop.

**Related:** `Ranger_Skills.js` fires when `min_ms < character.ping / 10`, an unexplained heuristic.
Once item 1 lands the condition is simply `min_ms === 0`.

**As built:** `ms_to_next_of(skills)` in `Combat_Utilities.js`, floored at `SKILL_LOOP_MIN_MS` (50).
The Warrior loop builds its skill list from the enabled flags each tick via `warrior_loop_skills()`,
so a disabled skill never drives the schedule, and falls back to `SKILL_LOOP_IDLE_MS` (1000) when
nothing is enabled. No ceiling: when every skill is on cooldown the loop is *supposed* to sleep, and
when one is ready but its conditions are unmet the 50ms floor polls at a sane rate.

The `character.ping / 10` heuristic in `Ranger_Skills.js` is **left alone** — with item 1's
compensation moved into `parent.next_skill`, it evaluates to the same `raw < 1.1 × ping` it always
did, so changing it is cosmetic rather than a fix.

---

## ✅ 7. Time-to-death tracking

**Files:** `Shared/Combat_Utilities.js`, data source already present in `UI/DPS_Meter.js`

`base/timetokill.ts` in the source repo is thirty lines: a TTL-cached `[timestamp, hp]` series per
monster id, pruned to the last 100 points, yielding damage-per-ms and therefore projected ms to
death.

`DPS_Meter.js` already hooks `parent.socket` "hit" events, so the data stream is flowing past us
today — this is bookkeeping on top of an existing subscription, not a new one.

**Three payoffs from one structure:**

- **Target ranking** — prefer whatever dies soonest, which compounds with item 13's sorters.
- **Overkill detection** — a real signal for item 12, rather than a one-shot estimate.
- **Don't start what cannot be finished** — skip a target whose projected time-to-death exceeds
  how long we can hold position.

**As built:** `ms_to_death(entity)` in `Combat_Utilities.js`, sampling `entity.hp` on each call
rather than hooking the socket — simpler than piggybacking on `DPS_Meter.js`, whose handler filters
to party members and is UI-scoped. A `prune_hp_samples()` sweep on a 60s interval drops entries for
monsters that are gone. **It has no caller yet** — it is a dependency of item 12, not a change in
behaviour on its own.

---

## ✅ The shared piece for items 8–10: projected incoming damage

Items 8, 9 and 10 all ask the same question — *how much damage is actually inbound right now?*
Write it once in `Shared/Combat_Utilities.js`, next to `get_num_targets()`.

Two things this repo does not currently model:

- **Courage stats.** `character.courage`, `character.mcourage`, `character.pcourage` — the number
  of physical / magical / pure attackers the character can hold before penalties. Zero hits across
  the codebase today.
- **The mobbing penalty.** Each attacker *beyond* the matching courage stat multiplies incoming
  damage by a further 20%:

```
multiplier[type] = (attackers of that damage type) - courage_of_that_type
if multiplier > 0: damage *= 1 + 0.2 * multiplier
```

This is why overshooting courage falls off a cliff instead of degrading. Shape:

```js
function projected_incoming_dps(who) { ... }
function could_die_to_incoming(who) { ... }
```

Count only entities whose `distance <= e.range + e.speed` — anything further cannot land a hit
before the next tick. Skip entities that will die to projectiles already in flight.

**As built:** `projected_incoming()` returns `{attackers, in_reach, burst, dps}` in one pass;
`projected_incoming_dps()` and `could_die_to_incoming()` wrap it.

**The reduction curve is the game's own, not an approximation.** `defense_reduction()` calls
`parent.damage_multiplier(defense)` when the game exposes it, and otherwise runs a direct port of
`damage_multiplier()` from `js/common_functions.js` in
[kaansoral/adventureland](https://github.com/kaansoral/adventureland) — the nine-band piecewise
curve (0.00100/unit for the first 100 armor, tapering to 0.00040 above 800), the four-band
armor-piercing curve for negative defense, and the `min(1.32, max(0.05, …))` clamp.

An earlier revision used a one-parameter fit, `900 / (900 + defense)`, anchored on the single data
point in `GAME_API_REFERENCE.md`. It was exact at 0 and 100 armor and diverged badly above that —
+20% at 500, +50% at 800, +122% at 1200 — always under-stating reduction, so it over-stated incoming
damage. Do not reintroduce it.

Evasion and crits are still ignored, which biases the estimate high — the safe direction for a
death check.

---

## ✅ 8. Damage-aware aggro cap (Myras)

**File:** `Character_Functions/Healer/Healer_Combat.js` — `effective_aggro_cap()`

Today the cap scales on mana alone:

```js
const scaled = Math.max(0, Math.min(1, (mp_pct - 0.2) / 0.6));
return Math.floor(CONFIG.combat.aggro_cap * scaled);
```

Five crabs and five fireroamers produce the same number. Mana is the right *first* constraint —
aggro is a resource she spends mana on — but it is not the binding one when the mobs hit hard.

**Change:** take the lower of the mana-scaled cap and a damage-derived cap, where the damage cap
is the largest pull whose `projected_incoming_dps()` stays under her sustainable heal throughput.

**Knock-on:** `is_fireroamer_agitate_safe()` in `Warrior_Skills.js` currently proxies this exact
question with four hardcoded percentages (`healer_hp_pct`, `healer_mp_pct`, `ranger_hp_pct`,
`warrior_hp_pct`) plus `max_mobs_in_range`. Once the real calculation exists, that function should
consult it rather than the constants, and `agitate_fireroamer_conditions` can shrink.

**Verify in-game:** park on a fireroamer camp and watch the cap move as mobs arrive — it should
drop well below `aggro_cap: 5` there while staying at 5 on crabs.

**As built:** `effective_aggro_cap()` takes `Math.min(mana_cap, floor(budget / damage_per_attacker))`
where `budget = sustainable_heal_dps()` = `character.heal × frequency × CONFIG.combat.heal_budget_pct`
(0.70 — the fraction of her casts spent healing rather than attacking). Gated by
`CONFIG.combat.damage_aware_aggro`, default **on**; set it false to get the old mana-only behaviour
back without a deploy. The `is_fireroamer_agitate_safe()` knock-on is **not** done — it is a Warrior
file and belongs with item 11.

---

## ✅ 9. Projected-death escape (Myras first, then Riva)

**Files:** `Shared/Combat_Utilities.js` (predicates), `Shared/Party_Management.js` (panic path),
`Character_Functions/Healer/Healer.js` (socket hook)

She holds everything, so she is the one who dies. Panic today reacts to HP already lost; both
mechanisms below react to damage that has not landed yet.

**9a. Burn-death prediction.** When `character.s.burned` is present:

```
intervals   = min(floor(s.burned.ms / G.conditions.burned.interval) - 1,
                  ceil((ping * 6) / G.conditions.burned.interval) + 1)
burn_damage = intervals * (s.burned.intensity / 5)
if burn_damage >= character.hp: harakiri
```

The `ping * 6` clamp is deliberate — it is the window in which an incoming party heal could still
save her, so she does not harakiri over a burn someone is about to out-heal. The repo's only
`harakiri` today is in `Shared/Maintenance.js`.

**9b. Pre-emptive jail warp.** Hook the `action` socket event. When `data.target === character.name`
and `could_die_to_incoming()` says the projectiles already in flight are lethal, warp to jail
*before* they land.

Fall back to `harakiri` when `s.stoned || s.deepfreezed || s.stunned || s.fingered` — warping is
disabled while disabled.

**Risk note:** this deliberately kills or teleports the character. Gate it behind a config flag,
default off, and watch the in-game log (`log()`/`game_log()`, not the browser console) before
trusting it. A false positive costs a corpse run; a false negative costs the same corpse run, so
tune toward caution.

### As built — panic + scare instead of a jail warp

**9a is as specified.** `will_burn_to_death()` implements the formula above and fires
`parent.socket.emit("harakiri")`, the escape confirmed by this repo's own commented-out `suicide()`
in `Maintenance.js`.

**9b deliberately does not warp to jail.** `GAME_API_REFERENCE.md` documents `leave()` for *getting
out of* jail but no API for warping into it; ALClient's `warpToJail()` works by tripping the
server's anti-cheat with an invalid move. Rather than reproduce that, the escape uses the panic
machinery this repo already has:

| situation | action taken |
|---|---|
| burning to death | `harakiri` |
| lethal inbound, character disabled (`stoned`/`deepfreezed`/`stunned`/`fingered`) | `harakiri` — skills are blocked, nothing else is possible |
| lethal inbound, not disabled | `set_panic(true, …)` + broadcast, then `scare` immediately |

**Why scare is fired directly and not left to the panic loop.** `scare` requires a jacko equipped,
which is why `_panic_check_body()` `await`s `equip_apply` + `wait_until_equipped("panic")` *before*
it scares. For a volley already in the air that ordering is backwards, so `trigger_death_escape()`
scares itself the moment panic is set. When the jacko is already on, aggro drops without waiting for
the next 100ms tick; when it is not, `can_use("scare")` is false, the direct attempt is skipped, and
the panic loop's equip-then-scare path runs as normal. The loop's own scare is guarded by
`!is_on_cooldown("scare")`, so the two never double-fire.

The escape scares unconditionally — it does not consult `should_hold_scare()` from item 10, which
returns false under `could_die_to_incoming()` anyway. A live tank re-tanks.

Detection runs on two paths: `death_escape_check()` inside `_panic_check_body()` (100ms), and a
`parent.socket.on("action")` hook that catches projectiles already in flight, filtered to
`data.target === character.id` and skipping heals. A 3s `DEATH_ESCAPE_COOLDOWN_MS` stops it
retriggering on the same volley.

**Config:** `CONFIG.safety.death_escape`, currently `true` in all three combat configs for testing —
`Healer_Config.js`, `Ranger_Config.js` and `Warrior_Config.js`. "Myras first, then Riva" in the
heading is a **rollout order, not a capability restriction**: enable it on the tank, watch the log,
then widen. All three have `PANIC_THRESHOLDS`, a jacko in their panic set, and run `panic_check()`,
so the mechanism works identically for each — and Ulric is the puller, so `agitate` gathering a pull
that goes wrong is exactly the case this catches.

The Merchant is the real exclusion: `Merchant_Config.js` has no `PANIC_THRESHOLDS` and Riff runs
`loop_controller()` rather than `run_character()`, so he never calls `panic_check()` at all.
`death_escape_enabled()` returns false when `CONFIG.safety` is absent, so he is off regardless.

---

## ✅ 10. Tank-specific scare policy (Myras)

**File:** `Shared/Party_Management.js` (~line 117)

Panic currently fires `use_skill("scare")` for whoever is panicking. On the tank that dumps the
entire pull at once onto Ulric and Riva — relocating the emergency rather than ending it.

**Change:** branch on whether the panicking character is the tank.

- **Tank:** prefer the item-9 escapes (harakiri / jail warp), or scare only when the rest of the
  party can absorb the scatter (check their HP and current target counts first).
- **Non-tank:** current behaviour is correct; scare freely.

Also worth borrowing: earthiverse gates scare on whether the threat is *off-list* — something not
in the intended `typeList` that got pulled by accident — rather than purely on count. A mob you
meant to fight and a mob you did not warrant different responses.

**As built:** `should_hold_scare()` wraps the existing `use_skill("scare")` call in
`_panic_check_body()`. The tank holds scare when an absorber is below `SCATTER_ALLY_HP_PCT` (0.60)
or already has `SCATTER_ALLY_TARGETS` (2) monsters on it — **unless `could_die_to_incoming()`, in
which case she scares regardless.** A live tank re-tanks; a dead one does not, so self-preservation
wins over protecting the scatter.

Absorbers are `[PARTY_LEADER, ...PARTY_MEMBERS]` minus `PARTY_TANK` and `PARTY_MERCHANT` — Ulric
and Riva. Riff is excluded so a hurt merchant wandering past cannot veto the tank's scare. Computed
in a function, not a top-level const: `Shared/*.js` load **in parallel**, so a top-level initialiser
naming `PARTY_LEADER` can evaluate before `Game_Config.js` has run.

Non-tank characters are unaffected — `tank_scare_policy_enabled()` requires
`character.name === PARTY_TANK`.

**Two new constants in `Game_Config.js`:** `PARTY_TANK` and `PARTY_MERCHANT`.
`Warrior_Combat.js` now reads `get_entity(PARTY_TANK)` instead of the hardcoded `"Myras"`, so the
tank's identity has one home rather than two.

The off-list gating is **not** done — it needs per-monster intent, which is item 15.

---

## ✅ 11. Agitate / cleave / taunt arbitration (Ulric)

**File:** `Character_Functions/Warrior/Warrior_Skills.js`

`handle_agitate()` and `should_cleave()` decide independently today and can both fire in the same
tick. Two rules worth adopting:

- If `count(in agitate range) <= count(in cleave range)`, **cleave instead of agitating** — same
  pull, plus damage.
- If exactly **one** target is within taunt range, **taunt it** rather than agitating.

This matters more here than it does in the source repo, because agitate is the handoff mechanism:
Ulric gathers within 100px of Myras (`distance(character, tank) <= 100`), she picks the mobs up via
`target_priority: ["Ulric", "Myras"]`. Firing the wrong one of the three wastes a handoff cycle.

Note `handle_taunt()` is currently commented out and `taunt_ents: false`. Re-enabling it is part of
this item — do not remove the commented block, extend it.

**As built:** `handle_aggro_skills(tank)` owns the arbitration. It compares
`monsters_within(G.skills.agitate.range).length` against `cache.monsters_in_cleave_range.length`;
when agitate reaches no more, cleave goes first and `handle_cleave()` (now returning a boolean)
suppresses agitate if it fired. When agitate reaches more, agitate goes first and cleave gets the
leftover.

Single-target taunt is a new `taunt_single()` rather than a change to `handle_taunt()` — the latter
is ent-specific and gated on `taunt_ents`, a different feature. Both it and its commented call site
are untouched.

---

## ✅ 12. Overkill prevention (party-wide)

**Files:** `Shared/Messaging.js`, each `*_Combat.js`

When one character computes it will kill a target this hit, the other three should stop attacking
it. With four bodies on one mob this is straightforward throughput. Item 7 supplies the kill
prediction.

**Change:** add a `claiming` message to `CM_HANDLERS` in `Shared/Messaging.js`. On receipt, drop the
entity id from the local target cache for a short TTL. `add_cm_listener()` is the extension point.

Do **not** claim special/boss monsters — earthiverse explicitly skips `SPECIAL_MONSTERS`, since
deleting a boss from a teammate's view is worse than a little overkill.

**Second half:** keep a TTL set of recently-aggroed monster ids so two characters do not both pull
the same fresh mob. In this party that specifically stops Ulric and Myras double-pulling during the
agitate handoff.

### As built — kill-claims only; the aggro half is wrong for this party

`claim_monsters(entities)` broadcasts `{type:"claiming", ids}` to the other combat characters;
`record_monster_claim()` in `Messaging.js` stores them with a 1.5s TTL. Claimed monsters are skipped
by `get_nearest_monster_v2()` (Warrior and Healer targeting, overridable with `ignore_claims`) and by
`should_attack_mob()` (Ranger). Emitted by all three when `can_kill_in_one_shot()` says the shot
lands — the Ranger passes the skill name so `3shot` (×0.7) and `5shot` (×0.5) are scored at their
real damage. `all_bosses` is never claimed, matching earthiverse's `SPECIAL_MONSTERS` exemption.

**The "second half" is deliberately not implemented, because it would break the handoff.** I wrote
it first and reverted it. Claiming what Ulric *pulls* means Myras skips those monsters — but her
`target_priority: ["Ulric", "Myras"]` exists precisely so she takes what is hitting him. A pull
claim would suppress the transfer this party is built around.

The double-pull the source repo avoids is two DPS wasting an aggro action on one mob. Here the
second "pull" *is the handoff*, so there is nothing to prevent. A claim means "I will kill this",
never "I pulled this".

**CC cost** is the live risk: one CM per claim, on a farm where everything dies in one shot. Guarded
by `MONSTER_CLAIM_MIN_INTERVAL_MS` (200ms between sends), `MONSTER_CLAIM_MAX_CC` (skip entirely at
cc ≥ 100) and `MONSTER_CLAIM_MAX_IDS` (8 per message). Watch `cc` on Riva first — 5shot claims up to
five monsters at once.

---

## ✅ 13. Spread-out target sorter (party-wide)

**File:** `Shared/Combat_Utilities.js` — alongside `score_by_explosion_spread()` (~line 144)

Earthiverse's `base/sort.ts` exposes a family of composable comparators: closest,
type-then-HP, type-then-closest, highest-level-first, and `sortSpreadOut`, which deliberately picks
targets *distant from each other*.

`sortSpreadOut` is the one worth porting — it is the opposite instinct to the current
`score_by_explosion_spread()` and is useful when the goal is to avoid clustering mobs on the tank
rather than to group them for AoE. Add it as an alternative scorer, selectable per farm, rather
than replacing what is there.

**As built:** `score_by_isolation()`, selected by `CONFIG.combat.prefer_isolated_targets` (default
`false`) in the Warrior's `find_cluster_target()`. The neighbour count was identical in both
directions, so the body moved to `count_neighbours()` and both scorers are now one-line sorts of it
rather than a 15-line copy differing by one character.

---

## ✅ 14. Kite distance derived from the monster

**Files:** `Shared/Combat_Utilities.js`, the per-character configs

The source repo computes kite distance per monster:

```js
kiteDistance = Math.min(bot.range, (entity.charge ?? entity.speed) + entity.range + 50)
lookDistance = kiteDistance * 1.25
```

Our radii are fixed constants — `circle_radius: 30` (Healer), `35` (Warrior) — and nothing in this
repo greps for kiting at all. A radius keyed to the specific monster's charge, speed and range is
strictly better than one number for every farm.

**Change:** derive the radius per target and feed it to `best_orbit_spot()` instead of
`CONFIG.movement.circle_radius`. Keep the config value as a fallback for when no target is present.

**Caveat:** the Healer is the tank and *wants* to be hit — kiting is for the Warrior, the Ranger,
and for her only when she is shedding a pull she cannot hold (see item 10). Do not apply this
uniformly.

### As built — Ranger only, and not via `circle_radius`

**The plan's file target was wrong.** `CONFIG.movement.circle_radius` is not a kite distance: the
orbit in `orbit_reposition()` is centred on `reposition_center()`, which is the movement leader or a
fixed farm location. It bounds how far from the *party* a character may roam. Monster distance
enters through the **scorers**, so that is where the change went.

`kite_distance(entity)` = `min(character.range, entity.range + (entity.charge ?? entity.speed) + 50)`.
`make_kite_distance_scorer()` scores a candidate position by the worst threat's standoff: at or
beyond the wanted distance it scores `want` (no reward for over-running), inside it the shortfall is
penalised double.

Wired to the **Ranger only**, behind `CONFIG.movement.kite_distance` (default `true`), and skipped
while `panicking` — in a panic the old "maximum distance from everything" scorer is the right one.

**Not wired to the Warrior**, despite the plan's wording. His scorer already caps at
`character.range * 0.9` of the cluster and minimises travel; he is melee and wants to be close, so a
standoff distance would be either a no-op or actively wrong. **Not wired to the Healer** — she tanks.

---

## ✅ 15. Per-monster tactical overrides mid-fight

**Files:** the per-character `*_Config.js` and `*_Skills.js`

The source repo's crypt strategies flip behaviour based on which monster is currently present, not
just which farm was configured: disable scare when only the weakest monster is around and HP is
high, swap to a splash weapon for that same case, re-enable both when anything else appears, curse
the entity another character is chasing so it stops outrunning them.

We already do the gear half of this — `boss_hp_thresholds` in each config swaps sets on boss HP.
The extension is to let the same table carry **skill-enable flags**, so a monster type can turn
`cleave`, `agitate` or `scare` on and off without a code change.

This also gives `cleave_blacklist` / `agitate_blacklist` / `skill_blacklist` — currently three
separate flat lists across three files — one structure to live in.

**As built:** a `CONFIG.combat.monster_rules` table per character, keyed by monster type. All three
blacklists are gone, migrated into it with identical contents:

| was | now |
|---|---|
| Warrior `cleave_blacklist` / `agitate_blacklist` | `fireroamer: {cleave:false}`, `plantoid`/`pppompom`: `{cleave:false, agitate:false}` |
| Ranger `skill_blacklist` | five types at `{skills:false}` |
| Healer | `monster_rules: {}` — structure present, nothing to migrate |

**Two resolvers, because the old lists had two different scopes** and collapsing them to one would
have silently changed behaviour:

- `monster_overrides(rules, range)` — **area** rules, merged over monsters within a range, `false`
  winning. Cached per tick as `cache.cleave_rules` (cleave range) and `cache.agitate_rules` (agitate
  range), matching exactly where each blacklist used to be checked. A single 400px resolve would
  have let a fireroamer block cleave from across the screen.
- `rule_allows_for(rules, entity, key)` — **per-target** rules, for the Ranger's skill gate and the
  Warrior's agitate candidate filter, which tested the specific monster rather than the area.

Skill-enable flags for `scare` are supported by the same table but not yet consulted anywhere — the
tank's scare decision is party-state driven (item 10), not monster driven.

---

## 16. Resolve instance keys from `G` instead of hardcoding

**File:** `Character_Functions/Healer/Healer_Dungeon.js`

The source repo carries its own TODO on this: it uses a `switch (map)` returning `"cryptkey"` /
`"tombkey"` / `"frozenkey"`, and notes that `G.items[key].opens` already encodes the mapping.

**Change:** look the key up from `G` rather than a hardcoded map, so adding an instance needs no
table edit. Small, and it is a prerequisite for item 18 being worth writing generically.

---

## 17. Let instances age before clearing them

**Files:** none — this is a strategy change

`CRYPT_WAIT_TIME = 1.944e8` — **54 hours**. The source repo deliberately opens a crypt, kills part
of it, leaves it open, and returns days later, because the monsters inside level up in the interim
and drop better loot.

No code required to start doing this; it is a decision about when to re-enter, and it should be
settled before item 18 assumes instances are cleared in one visit.

---

## 18. Per-monster dungeon sub-strategies

**File:** `Character_Functions/Healer/Healer_Dungeon.js`

The source repo treats a dungeon as a sequence of distinct fights rather than one uniform farm:
`CRYPT_MONSTERS = ["a1" … "a8", "vbat"]`, each with its own handling, and a dedicated move strategy
that kites *between* them — stay on one monster to kill it, move into range of the next, kite to a
third while waiting.

This is the composition of items 14, 15 and 16: per-monster kite distance, per-monster skill flags,
and key resolution from `G`. It is listed last of the actionable items because it is only worth
building once those three exist, and only if we run dungeons beyond the spider instance.

---

## ✅ 19. Multiple-attack burst — optional, may be a net loss

**File:** one `*_Combat.js`, behind a config flag, on Riva only to start

Out of sequence deliberately: this is the one item in the plan that might make things worse.

Stage 7 of the progression:

```js
const NUM_ATTACKS = 9
const interval = setInterval(async () => {
    if (numLoops <= 0) { clearInterval(interval); return } else { numLoops -= 1 }
    await attack(nearest)
    reduce_cooldown("attack", Math.min(...parent.pings) + Math.floor(NUM_ATTACKS / 2))
}, 1)
```

The reasoning: the true round-trip time of any *individual* packet is unknown — only the minimum of
recent pings is. Firing several attacks a millisecond apart means one lands exactly as the
server-side cooldown expires. The server rejects the rest.

**Why this is flagged High risk:** code cost. `COOLDOWNS.cc = 125` already exists in
`Game_Config.js` and is checked in `Warrior_Skills.js`. Nine calls where one was made before will
push CC up hard, and high CC risks a disconnect — the source repo's own tracker strategy waits when
`cc > 100` for exactly that reason.

**If attempted:** start at `NUM_ATTACKS = 3`, on Riva only, and watch CC in the in-game log. Measure
kills-per-ten-minutes against the same farm with the flag off before keeping it. The source repo
measures this rather than assuming it, and so should we.

### As built — shipped off, with the measurement to decide it

`fire_attack_burst(target)` in `Ranger_Combat.js`, fired alongside the primary attack (not after —
the point is packets straddling the cooldown boundary). Config:

- `CONFIG.combat.burst_attacks` — extra attacks, **default `0`, which is off**. The count is the
  switch; there is no separate boolean. Set to `3` to test.
- `CONFIG.combat.burst_max_cc` — `60`. No burst is started above it, well under
  `COOLDOWNS.cc` (125).

**Single-target only.** `3shot`/`5shot` share the `attack` cooldown so they race the same boundary,
but they cost far more MP and CC per call, and bursting a 5-target skill multiplies both. The burst
runs only on the plain `attack()` branches.

**It composes with item 1 rather than duplicating it.** Earthiverse calls
`reduce_cooldown(minPing + floor(N/2))` inside each burst iteration. We do not: the `_compensating`
wrapper from item 1 already applies exactly one `reduce_cooldown` per cooldown window, deduped by
timestamp, on whichever packet the server accepts. Bursts that lose the race reject with `cooldown`,
never reach the wrapper's success path, and so never over-compensate. Adding earthiverse's extra
reduction on top would double-compensate.

Rejections are swallowed deliberately — most burst packets are *supposed* to be rejected. They are
counted rather than logged: `burst_landed / burst_sent` is the hit rate.

### Deciding it

A COMBAT TELEMETRY section in `Combat_Utilities.js` counts kills (from the socket `hit` event, where
`kill` actually lives — `character.on("target_hit")` does not carry it), attacks sent, and burst
sent/landed, over a 10-minute window. It logs one line per window to Alerts and resets:

```
[COMBAT] 412 kills (412/10min), 508 attacks, burst 37/1524, cc 38, ping 41
```

`al_combat()` in the console returns the same figures for the window so far. All three characters
count kills and attacks, so the Warrior and Healer give a baseline while only Riva bursts.

**How to read it:** run a farm with `burst_attacks: 0`, note kills/10min, then run the same farm at
`3`. Keep the burst only if kills/10min rises and `cc` stays clear of 125. A low
`burst_landed/burst_sent` is expected and not itself a failure — one landed packet per window is the
whole point.

---

## 20. Leave `hardshell` disabled (Ulric) — no action

Recorded so it is not "fixed" later. `hardshell` only adds armor, and Ulric is not eating the hits;
it is correctly commented out in `Warrior_Skills.js` (~line 45).

The trigger worth remembering if it is ever wanted on a Warrior emergency is
`potential_physical_damage * 3 >= character.hp`, counting physical attackers only. Not a gap today.

---

## Testing

No test suite exists; every item must be verified by injecting into the live client and reading the
**in-game** log windows (`log()` / `game_log()` — the browser console does not contain them).

Deploy one item at a time, and remember the jsDelivr purge-and-verify loop in CLAUDE.md after every
push — a mixed build makes a fixed bug look unfixed.
