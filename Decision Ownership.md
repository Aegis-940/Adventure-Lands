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
| 3 | **When to loot** | `should_loot()` | 3 bypass it | none | **leaky** |
| 4 | **Where to go** | `movement_goal()` | merchant, dungeons | separate by design | **acceptable** |
| 5 | **Am I in danger** | `_panic_check_body()` | 2 signal sources, 1 leak | `set_panic()` sole writer | **good** |
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

**Still split:** the gold gloves (`handle_looting`) remain their own decider. Only the healer has a
`gold` set, so it is a one-slot, one-character case; folding it into her `gloves` resolver is the
next slice.

### Before

Split nine ways

Nine independent contexts decide this character's gear, and nothing reconciles their answers:

| Decider | Where | Wants |
|---|---|---|
| `resolve_equipment()` | `Equipment.js:657` (25ms loop) | rules loadout |
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

## 3. When to loot — one decider, three bypasses

`should_loot()` owns the decision and `Character Runner.js:169` respects it. Three callers invoke
`handle_looting()` directly without asking: `Crypt Route.js:403`, `Dungeon Runner.js:119` and
`:561`. Not currently known to cause a bug, but it means `should_loot()`'s guards — chest count, cc
ceiling, `penalty_cd`, target count — are silently skipped in dungeons.

---

## 4. Where to go — acceptable

`movement_goal()` is a genuine single decider for the three fighters, composing `follow_goal()`,
`event_goal()` and `anniversary_destination()`. This is already the shape we want.

The merchant runs its own state machine (`loop_controller` + `PRIORITY_CHECKS`) and calls
`smarter_move` from eight files; dungeons route their own movement. Both are plausibly legitimate
separations rather than splits of one decision — worth confirming before touching.

---

## 5. Am I in danger — good, with one leak

`set_panic()` is the sole writer, documented as such. Three signal sources feed it — the character's
own `_panic_check_body()`, the healer's CM broadcast, and `healer_on_disabled()` on death. That is
one owner with several inputs, which is correct.

The leak: `dungeon_bail_out()` equips the `panic` set directly rather than going through
`panic_check()`, so gear and panic state can disagree during a bail.

---

## 6. What to attack — the model to copy

Three clean layers, no coordination needed anywhere:

- `select_target(pool, weights)` / `score_targets()` — one shared scorer, `Targeting.js`
- `find_best_target()` — one per character, writes `cache.target`
- `handle_attack()` — consumes it, decides nothing

**This is exactly the composable-decider shape.** When consolidating #1 and #2, copy this, not an
abstraction imported from elsewhere.

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
