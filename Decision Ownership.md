# Decision Ownership

A worklist, not a reference. For each decision the bot makes, who decides it — and where that
decision is split across several controllers that must then be coordinated.

**The principle.** A decision has exactly one owner. Small decisions get small functions; the loops
compose them. Multiple loops at different cadences are fine and correct. What is not fine is two
loops deciding the same thing and needing a lock, a priority order or a rate limiter to stop them
disagreeing.

**A lock is not a decider.** It answers "who may write?", not "what should the answer be." Every
coordination mechanism in this codebase exists because a decision has more than one owner. Remove
the split and the mechanism has nothing left to do.

---

## Ranked

| # | Decision | Owner | Other deciders | Coordination | Verdict |
|---|---|---|---|---|---|
| 1 | **What to wear** | `resolve_equipment()` | 8 | lock + 6 priorities + rate limiter | **split** |
| 2 | **Where to stand** | `movement_local()` | 6 | ordering only — no arbiter | **split** |
| 3 | **When to loot** | `handle_looting()` | none — 2 trigger kinds | shared `_looting`/`_loot_last` | **done** |
| 4 | **Where to go** | `movement_goal()` | none — merchant/dungeons are modes | mutual exclusion | **confirmed** |
| 5 | **Am I in danger** | `_panic_check_body()` | none — 5 signal sources | `set_panic()` sole writer | **confirmed** |
| 6 | **What to attack** | `find_best_target()` | none | none needed | **the model** |

---

## 1. What to wear — ORB SLOT CONSOLIDATED (2026-09-18)

Reading the nine deciders showed they are **two different kinds**, which the original audit missed:

- **Persistent state** — "while X is true, wear Y": the rules resolver, looting's gold gloves,
  panic's jacko, the dungeon bail. These genuinely compete, and they are what caused the ping-pong.
- **Transient procedures** — "equip, cast, restore": the warrior's basher and cleave swaps, the
  swap trick, temporal surge, the zapper. These need momentary exclusive ownership of a slot, which
  is what a lock is *for*. Forcing them into a declarative decider would be the god-function
  mistake. They keep `equip_claim` at `skill`/`trick` priority, and that use is correct.

A third decider also turned up that the audit had not counted: **`MONSTER_GEAR_OVERRIDES`**.
`resolve_equipment()` consulted it *instead of* the group resolver, so at bscorpion the override
replaced the orb rule outright — which would have silently clobbered panic once panic moved into
the resolver.

**What changed.** Each group resolver is now the single owner of its slot, composing all three
inputs in order:

```js
function resolve_warrior_orb() {
    if (panicking) return "panic";
    return gear_override("orb") || preferred_orb("orb_dps");
}
```

`resolve_equipment()` is now just "ask each group, apply the answer" — the override branch is gone,
replaced by a shared `gear_override(group)` the resolvers call themselves. `panic_check()` became a
*consumer*: it waits for the orb it needs rather than equipping it.

Deleted outright: `panic_equip_hold()`, `panic_equip_free()`, `_panic_equip_token`,
`_panic_last_emit`, the panic equip block, the recovery's orb-restore block, and
`loadout_manages_orb()` with its cache and uncached twin — 25 lines whose only job was answering
"does the loadout own the orb?", a question that only existed because ownership was ambiguous.
Net 71 deletions against 25 insertions.

**Deliberate exception:** `dungeon_scare_off()` still equips the jacko itself, because
`equipment_manager_loop` is parked while `dungeon_bailing()` is true — the resolver is switched off
during a bail, so the bail path takes over. Clean mutual exclusion, like bscorpion. It now uses
`equip_once()` rather than holding a persistent claim.

**Gold gloves consolidated too (2026-09-18).** `resolve_healer_gloves()` now owns the gloves slot,
asking `gold_gear_wanted()` — which lives with looting, where the knowledge belongs.
`handle_looting()` stopped equipping and became a consumer, waiting for the gloves like
`panic_check()` waits for the orb. `equip_claim("looting")` and `EQUIP_PRIORITY.loot` are gone;
the priority ladder is down from six levels to four.

`gold_gear_wanted()` is exactly `_looting` — gold on while chests are being opened, normal gloves
the moment they are not. That is the behaviour that was always intended and it is unchanged; only
the ownership moved.

**A wrong turn worth recording.** The first attempt added a 5s linger so that consecutive loots
would not thrash the slot, on the theory that the churn (two equips per 3s cycle, against a server
accepting one per two seconds) was worth removing. It was not: `loot_cooldown` is 3s, so a 5s
linger never expires while farming and the combat gloves simply never came back. The swap-back had
already been called out as deliberate, and the churn was a stated design cost rather than a defect.
Single ownership was the goal; the swap rate was not ours to trade away.

**All four persistent gear deciders are now one per slot.** What remains claiming slots is the five
transient skill procedures, which is what the arbiter is for.

### Before

Split nine ways

Nine independent contexts decide this character's gear, and nothing reconciles their answers:

| Decider | Where | Wants |
|---|---|---|
| `resolve_equipment()` | `Equipment Manager.js` (25ms loop) | rules loadout |
| `handle_looting()` | `Loot Management.js:210` | `gold` |
| `panic_check()` | `Party Management.js:104,147` | `panic`, then `orb` back |
| `check_temporal_surge()` | `Healer Equipment.js:139,149` | `temporal`, then raw `equip()` |
| `handle_zapper()` | `Healer Skills.js:261,283` | `zap_on` / `zap_off` |
| swap trick | `Warrior Combat.js:112,114` | slot pairs, twice |
| basher / bataxe | `Warrior Skills.js:85,91,123,129` | swap and restore |
| merchant gear | `Merchant Gear.js:23,69` | raw `equip()` |
| `dungeon_bail_out()` | `Dungeon Escape.js:43` | `panic` |

Coordination is `equip_claim`/`equip_holds`/`equip_release` plus a six-level `EQUIP_PRIORITY`, a
5s claim lease, and a per-group rate limiter. **All of it is machinery for managing the split.**

This is the confirmed source of the orb ping-pong: `panic -> orb` 19,778 against `orb -> orb`
19,211 on Riva. Neither side was misbehaving. Both held the lock legitimately, in turn, forever.
Priorities could not fix it because a priority scheduler is still nine deciders with a pecking
order.

**Target shape.** One `desired_loadout()` composed of small owned decisions — ordered conditions
returning a name — and one loop applying the diff. Callers set intent instead of equipping.
Deletes: claims, tokens, leases, priority levels, per-group cooldowns, `loadout_manages_orb()`.

---

## 2. Where to stand — CONSOLIDATED (2026-09-18)

`movement_local()` now owns it. The healer's `healer_local` override is gone and she is wired with
an ordinary `farm_step` like the other two, and the `s.local` escape hatch in `run_character` —
what allowed the bypass in the first place — has been removed, so single ownership is now
structural rather than conventional.

**Panic is movement-agnostic and does not appear here.** Its job is to dump aggro; it may do that
while moving, standing still or orbiting. Three couplings were removed:

- `orbit_reposition()` carried a `panicking ? distance_scorer : make_score()` ternary that silently
  swapped the warrior's and ranger's position scorer. It now scores by the character's own scorer
  and nothing else.
- `party_cohesion_hold()` returned early while panicking, so the leader stopped waiting for a
  lagging party member. Cohesion no longer knows about panic.
- `prim_farm_loop()` skipped `hold_camp_station()` while panicking. The bscorpion camp now holds
  station regardless.

No movement decider reads `panicking`. The remaining references are combat (`should_pause_combat_loop`),
skills, equipment, and panic's own state handling.

**Deliberate exception:** the crypt route (`Crypt Route.js:194,265,282,320`) still treats panic as
one of five route interrupts alongside `abort`, `dead`, `ejected` and `intruder`, handing off to
`crypt_wait_for_calm()`. That is scripted-sequence safety in the same family as `dungeon_bailing()`,
not positional logic. If it is ever untangled, the fix is a separate "route should pause" signal
rather than deleting the check.

Two findings that changed the plan, both from reading rather than assuming:

- **bscorpion was never a split.** Every other decider explicitly bails on `home === "bscorpion"`
  and its own loops are already gated on `!panicking`. That is a mode switch with clean mutual
  exclusion, not competing ownership. Left alone.
- **`stuck_escape_check()` is not local positioning.** It returns early when
  `character.map === destination.map`, so it only acts while travelling. It belongs to "where to
  go", not "where to stand". Left alone.

The original description follows, for the record.

### Before

Split six ways, with no arbiter at all

| Decider | Where |
|---|---|
| `orbit_reposition()` | `Character Runner.js:90` |
| `walk_in_circle()` | `Healer Movement.js:53` |
| bscorpion camp | `Bscorpion Camp.js:104,120,185,201` — **its own loop**, outside `movement_local` |
| `local_step()` (cohesion) | `Party Cohesion.js:159` |
| event approach / chest drain | `World Events.js:70,128` |
| crypt waypoints | `Crypt Route.js:168` |

`movement_local()` is an ordered four-way dispatch — step / event / loot / farm — so it is a small
arbiter, but not an exclusive one: `bscorpion_start()` runs as a separate loop entirely, and
`stuck_escape_check()` moves independently from `main_tick`.

**Worse than #1 in one respect: equipment at least has a lock. This has nothing.** Whichever branch
happens to run wins.

That is why the healer orbited at radius 30 in the middle of 13 plantoids while panicking —
`walk_in_circle()` was the only decider that ran, and it has no notion of panic. It was not a
missing escape; it was a decider that did not know what it was meant to be deciding about.

**Target shape.** `movement_local()` becomes the sole owner. Bscorpion and stuck-escape become
branches within it rather than parallel loops.

---

## 3. When to loot — NOT A SPLIT; enforcement moved (2026-09-18)

The audit called this leaky. Reading it, `handle_looting()` is the sole owner of the *act*; what
differs is the trigger. Ambient (`should_loot()` from `main_tick`) asks "are enough chests lying
around". Scripted (after a crypt waypoint, inside the dungeon loot sweep, after a boss dies) says
"we just cleared this, sweep it". They share `_looting` and `_loot_last`, so they interleave rather
than conflict: ambient stands down while `_looting`, and every scripted sweep pushes the ambient
cooldown forward. One writer, several signals — the same shape as panic, which the audit graded
good.

The one real gap was that three safety checks lived in `should_loot()`, so only the ambient path
consulted them: the `cc` ceiling (125), an active `penalty_cd`, and `CONFIG.looting.enabled`. A
dungeon sweep ran regardless of all three.

They now live in `looting_blocked()`, checked inside `handle_looting()` itself, so every caller
gets them without having to remember — the same move as making `batch_equip` own its own cooldown.
`should_loot()` keeps only the ambient trigger question. `handle_looting()` also gained a
`_looting` re-entrancy guard, which it needed: the dungeon loops run beside `main_tick`, so a
scripted sweep could previously start on top of an ambient one. Blocked attempts are counted.

---

## 4. Where to go — CONFIRMED SEPARATE (2026-09-18)

`movement_goal()` is a genuine single decider for the three fighters, composing `follow_goal()`,
`event_goal()` and `anniversary_destination()`.

The two suspected splits are neither, and this was checked rather than assumed:

- **The merchant never calls `run_character()`.** `Merchant.js` starts `loop_controller()`, so
  `movement_goal()` does not execute for Riff at all. Its own decider is `get_character_state()` —
  an ordered walk over `CONFIG.priorities` against `PRIORITY_CHECKS`, the same shape as
  `movement_goal()`. The eight files calling `smarter_move` are executing a chosen state, not
  choosing one.
- **Dungeons short-circuit ahead of the arbiter.** `dungeon_moving()` is checked in `main_tick`
  before `travel_arbiter`, so dungeon routing and `movement_goal()` are mutually exclusive.

Untidy but not a decision defect: `merchant_task` is written from six places across four files. It
is a status label the watchdog reads, not the state machine's state — though the watchdog does act
on it, so it is not purely cosmetic.

---

## 5. Am I in danger — good, with one leak

`set_panic()` is the sole writer, documented as such. Three signal sources feed it — the character's
own `_panic_check_body()`, the healer's CM broadcast, and `healer_on_disabled()` on death. That is
one owner with several inputs, which is correct.

Re-verified 2026-09-18: five `set_panic()` call sites, all legitimate signals — the trigger, the
external-hold expiry and the recovery in `_panic_check_body()`, the healer's CM broadcast, and
`healer_on_disabled()` on death.

The one exception stands and is deliberate: `dungeon_scare_off()` equips the `panic` set itself
because `equipment_manager_loop` is parked while `dungeon_bailing()` is true. The resolver is
switched off, so the bail path takes over — mutual exclusion, not a competing owner.

---

## 6. What to attack — the model to copy

Three clean layers, no coordination needed anywhere:

- `select_target(pool, weights)` / `score_targets()` — one shared scorer, `Targeting.js`
- `find_best_target()` — one per character, writes `cache.target`
- `handle_attack()` — consumes it, decides nothing

**This is exactly the composable-decider shape.** #1 and #2 were consolidated by copying it rather
than importing an abstraction.

Re-verified 2026-09-18: exactly one writer of the target cache per character —
`find_best_target()` on the warrior and healer, `update_target_cache()` on the ranger — and every
`attack()` call site reads from that cache rather than choosing for itself.

---

## Order of work

1. **Where to stand** (#2) — worst coordination, confirmed in the healer deaths, and smaller than
   equipment. Good first consolidation and it pays off immediately.
2. **What to wear** (#1) — biggest win, biggest blast radius. Do it second, once the method is
   proven on #2.
3. **When to loot** (#3) — small; route the three dungeon callers through `should_loot()`.
4. **The panic leak** (#5) — small.
5. **Confirm #4** is genuinely separate rather than split.

One change per deploy, so a regression has one suspect. A coordination mechanism comes out in the
same change that removes the split it was compensating for — that is how we know the consolidation
was real rather than cosmetic.
