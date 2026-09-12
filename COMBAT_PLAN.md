# COMBAT_PLAN.md — positioning, debuff pricing, and dynamic aggro

Four workstreams, in execution order. Each is independently shippable and independently
revertible.

## How this plan is meant to differ from the last one

The previous improvement plan was ~15 behavioural changes shipped together, none of which
carried a way to tell whether it had worked. The measured result was no gain and the whole
thing was reverted.

So every item below carries three things, and an item that cannot supply all three is not
ready to start:

- **Evidence** — the source line or measured number that says the current behaviour is wrong.
- **A test** — the specific measurement that will say whether the change helped, decided
  *before* the change ships.
- **A blast radius** — what breaks if it is wrong, and how it gets reverted.

Ship one at a time. Measure. Then the next.

---

## Reference: courage and fear

Hard-won and not obvious; see also the Healing section in
[`GAME_API_REFERENCE.md`](GAME_API_REFERENCE.md).

```js
player.fear = max(0, targets_p - courage, targets_m - mcourage, targets_u - pcourage);
const sredux = [0, 20, 40, 70, 80, 90, 100];
player.speed -= sredux[min(6, player.fear)];
if (fear > 2)      player.attack *= 0.2;
else if (fear > 1) player.attack *= 0.4;
else if (fear)     player.attack *= 0.6;
```

- `targets_p` / `targets_m` / `targets_u` count monsters **currently targeting you**, split by
  the *monster's* `damage_type` (physical / magical / pure). Each is checked against its own
  courage stat, and `fear` is the worst of the three.
- `courage += str/30` for warriors, `mcourage += int/30` for priests, `pcourage` for paladins.
- The speed penalty is a **flat subtraction**, not a multiplier.
- The attack penalty is applied *after* `player.heal = player.attack` is snapshotted, so a feared
  priest loses up to 80% of her damage and **none** of her healing.
- `character.fear`, `character.courage`, `character.mcourage`, `character.pcourage` are all
  exposed to the client.

**Consequence for Myras.** Her int 382 buys ~12 *magical* courage and nothing physical. Measured
from her deaths: attack stepped ×0.6 then ×0.4 at ~10 fireroamers, so fireroamers deal physical
damage and her physical courage is around 8. She tanks magical mobs well and physical mobs badly.
Nothing in the bot currently knows this stat exists.

## Measured constants worth not re-deriving

| quantity | value | source |
|---|---|---|
| Myras heal power | ~3023 (varies with buffs) | live |
| Myras `mp_cost` | **61** | sampled |
| Myras sustained healing ceiling | **~4,230 HP/s** (`heal × 1.46/s`) | sampled |
| `partyheal` base | flat **800** at level 80+, ignores heal power | server L2914 |
| incoming at fireroamer ×10 | **~5,000 HP/s** | death timeline |
| heal model accuracy | **0.9966** over 437 casts | sampled |
| Ulric burn term | modelled **1.39× too generous**, error sub-linear in proc chance | sampled |
| cleave AoE | ~160px, `attack × (0.1 + rand × 0.8)` per target | server |

---

## 1. Warrior movement and positioning

**Status: done, and it bought nothing. Kept anyway — see the verdict at the end of this item.**

### Result

Measured across three configurations at the same spawn:

| | bataxe hits/s | aoe hits/s | aoe damage/hit | aoe splash/hit |
|---|---|---|---|---|
| old scorer, `radius 35`, `min_gain 20` | 1.27 | 0.98 | 2920 | 1590 |
| new scorer, `radius 35`, `min_gain 5` | 1.27 | 0.97 | 2831 | 1590 |
| new scorer, `radius 60`, `min_gain 5` | 1.27 | 0.97 | 2831 | 1528 |

Flat to three significant figures. Overall DPS varied (6666 / 5717 / 6076) but that tracks
idle time from a scheduled reload and an anniversary loop, not combat intensity — which is why
intensity, not raw DPS, is the comparison that survives.

### Why there was nothing to win

`best_targets − here_targets` was **+1 in 71 of 74 samples at radius 35, and +1 in 56 of 56 at
radius 60.** Widening the orbit did not expose a single richer spot. One extra cleave target is
worth 3–7%, and only ~6 genuinely damage-driven moves per five minutes cleared even a 5% bar.

The monsters are already clustered around Myras and the cleave radius is large relative to that
cluster, so almost every reachable position covers almost the same mobs. **Position is not a
lever at this spawn**, at any orbit radius. That is a property of the spawn, not of the scorer.

### Verdict

The scorer is kept. It is strictly more correct than "prefer standing still", it measurably does
no harm, and it should matter at a spread-out spawn where the cluster is wider than cleave. But it
earned nothing here, `circle_radius` is back to 35, and `sample_positions` is its own flag, off,
so the damage windows stay clean for later items.

**If positioning is revisited, the question to ask first is whether a spawn exists where
`best_targets − here_targets` ever exceeds +1.** If it never does, this is finished for good.

### Original analysis

Do this first — pure upside, no survivability risk.

**Evidence.** [`Warrior_Movement.js`](Character_Functions/Warrior/Warrior_Movement.js) is the
entire positioning model:

```js
const reach = character.range * 0.9;
return (x, y) => {
    if (Math.hypot(target_mob.x - x, target_mob.y - y) > reach) return null;
    return -Math.hypot(character.x - x, character.y - y);
};
```

Stay in range of one mob; prefer standing still. It knows nothing about cleave's ~160px AoE, the
explosion radius of the `aoe` set, how many mobs a candidate spot covers, or the centre-pull that
comes from monsters grouping at the spawn point.

**What already exists.** `best_orbit_spot()` samples candidate positions and applies a travel
penalty (`ORBIT_TRAVEL_WEIGHT`), so only the scorer needs replacing. `warrior_set_value()` already
prices `cleave_targets`. `count_neighbours()` and `splash_bonus()` already exist and are validated.

**What changes.** The scorer returns expected DPS from a candidate spot rather than negative
distance:

- mobs within cleave radius of the spot, weighted by the cleave contribution already modelled
- splash coverage for the `aoe` set via `splash_bonus`
- primary target in attack range (hard gate, as now)
- a penalty on distance from the spawn centre, for the travel-time point

**Test.** Ulric's damage windows, already sampling. Compare DPS and `hits` per window before and
after at a fixed spawn. Cleave hits per window is the direct readout.

**Blast radius.** Positioning only. If it moves him badly, DPS drops and it is one file to revert.

---

## 2. Healer movement and monster packing

**Status: measured. Motion matters, geometry does not. Circle left as it was.**

### What packing is worth

Splash pays only inside `explosion / 3.6` — 11.7px for Ulric's `aoe`, 14.2px for Riva's
pouchbow. Backing out of Ulric's measured splash (1590 against 2831 direct, each neighbour worth
`0.42 × dm(300) = 0.296`) puts packing at ~1.9 neighbours. Monsters have no entity collision, so
the ceiling is `mobs − 1`, not a geometric limit. We capture roughly **47%** of it.

### Result 1 — motion beats stillness, by a lot

Commanded rate cycled `1.8 / 0.6 / 0` on 2-minute arms. Matched at 4 engaged monsters:

| rate | r12 | n |
|---|---|---|
| 1.8 | **1.67** | 15 |
| 0.6 | 1.58 | 13 |
| 0 | **1.33** | 18 |

Moving packs **26% tighter** than standing still. Normalised against the `mobs − 1` ceiling the
penalty for standing still is −21% at 12px, −10% at 30px, −6% at 60px — it barely changes how
many monsters are *nearby*, it changes how they are *arranged*. A stationary target is surrounded
by a ring whose opposite sides are two attack ranges apart; a moving one drags a trailing arc.
Only the arc puts pairs inside the radius splash pays for. **Jay called this from visual
observation; my prior was the opposite and was wrong.**

### Result 2 — within the moving regime, geometry does nothing

Radius swept `30 / 20 / 12` with the rate pinned at 3.0, 5.5 hours, 1099 orbiting windows.
Holding **both** mob count and fear constant:

| radius | r12 | n | achieved rate |
|---|---|---|---|
| 30 | 1.36 | 269 | 1.04 |
| 20 | 1.37 | 271 | 1.35 |
| 12 | 1.32 | 283 | 1.65 |

Standard error 0.024, so every difference is under 2 SE with no consistent ordering — while
achieved turn rate varied by 59% across the arms. **Turn rate is not a gradient. It is a
threshold: any continuous motion forms the arc, and turning harder does not compress it further.**

The observational correlation between slow movement and tight packing (−0.187 within matched mob
count) is a confound — `speed` is downstream of `fear`, which measures how many monsters are on
*her* specifically. The randomised radius arms are the clean test and they are flat.

### Verdict

`circle_radius: 30` and `circle_speed: 1.8` are kept unchanged — they were already on the right
side of the only distinction that matters. `circle_experiment` is off; the machinery stays for
future sweeps.

### Result 3 — the approach constant is 12, not the monster's range

From the monster AI (node_server.js L12245):

```js
} else if (can_attack(monster, player)) {
    commence_attack(monster, player, "attack");
} else if (distance(monster, player, true) > 12 && ...) {
    monster.going_x = monster.x + (player.x - monster.x) / 2;   // midpoint, repeatedly
    start_moving_element(monster);
}
```

`can_attack` gates on cooldown as well as range, so between attacks every monster falls through
to the movement branch and keeps closing until it is within **12** — regardless of its nominal
attack range. Jay called this from observation; it is a flat constant for all general monsters.
They also path to the *midpoint* each tick, an exponential contraction toward her position, which
is itself a stacking force.

A monster can hold station only inside the intersection of all discs of radius 12 centred on her
circle — a disc of radius `12 − R`. **At R = 30, 20 and 12 that disc is empty**, which is why
those three arms were indistinguishable: all of them were in the same perpetual-chase regime.

### Settled: radius 10

`circle_radius` is set to **10** — just inside the 12 threshold, so a resting zone of radius 2
exists while the orbit still moves. Chosen rather than measured: R = 12 was tested at n = 283 and
matched R = 30, so 10 is adjacent to a known-good point and the downside is bounded by that
measurement. The untested region below ~8 was avoided because waypoint start-stop overhead would
dominate and any result there would be an implementation artefact.

This is a cheap bet on a plausible model, not a finding. Two earlier models in this workstream
(trailing-arc, and radius tied to the monster's attack range) both failed against measurement.
The only firmly established fact is motion versus stillness, and that was already in place.

### Rejected: centroid re-centring

Centring the circle on the centroid of engaged monsters does not work, and the reason is
structural rather than a tuning problem. **The monsters are chasing her, so their centroid is
mostly a lagged copy of her own position** — the signal carries almost no information about where
the pack is. The centre chases her, she orbits the centre, and the result is a pursuit spiral that
drifts until the distance clamp catches it. Measured `drift` sat at 25–26px and climbing with
`r12` falling 1.24 → 0.87 → 0.73. Damping bounds the instability; it cannot make a
self-referential input meaningful.

The version that could work uses monsters that are **not** already engaged with her — untargeted
mobs, or ones fighting Ulric and Riva — whose positions are genuinely independent of hers. That
turns a movement rule into an aggro decision, so it belongs in item 4 rather than here.

### What is left for packing

Two hypotheses, neither tested:

- **Re-centre the circle on the aggro centroid.** `circle_centre()` is the hardcoded
  `locations[home][0]`, so the path ignores where the monsters actually are — it cannot collect
  stragglers, cannot follow a pack that has drifted, and does not sweep spawn points. This is a
  different mechanism from turn rate (where the arc forms, not how tightly it curves) and is the
  strongest remaining candidate. Note she is `MOVEMENT_LEADER`, so moving her centre moves
  Ulric's orbit anchor with it.
- **Aggro concentration.** At fixed total mob count, packing rises with how many of those
  monsters are on one character. That is not a movement lever at all — it is item 4.

### Original analysis

Small, and fixes a provable defect.

**Evidence.** `walk_in_circle()` uses `circle_radius: 30` and `circle_speed: 1.8` rad/s, so the
required tangential speed is `30 × 1.8 = 54 units/sec`. Her base speed is roughly 72–80; at fear 1
she is at ~52–60 and at fear 2 ~32–40. **She tanks, so she is nearly always feared, and therefore
usually cannot keep up with her own circle.** She is issuing move targets she cannot reach.

**What changes.** Derive the angular rate from live `character.speed` instead of a constant, so the
circle degrades gracefully instead of breaking down. Optionally shrink the radius under fear rather
than slowing further, since a tight circle still groups monsters.

**Test.** Log achieved angular rate against commanded rate for a few minutes; they should track.
Secondary: monster spread around the centre point (`count_neighbours` at the spawn centre) should
not get worse, and should improve if grouping is currently failing.

**Blast radius.** Healer movement only. Reverting is one function.

**Follow-on (not part of this item).** The circle is blind to where monsters actually are. Turning
it into a scorer that pulls toward the centroid of loose mobs would do the grouping deliberately
rather than incidentally. Worth doing only after the speed fix is measured, so the two effects do
not confound.

---

## 3. Curse pricing

**Status:** not started. Mostly a port of code that already works.

**Evidence.** [`Healer_Skills.js`](Character_Functions/Healer/Healer_Skills.js) `handle_curse()`
picks the highest-HP mob with a target within 175px of the home point above 25% HP, and casts. No
mana price, no time-to-kill check, no clustering term. Meanwhile Riva's `mark_value()` already does
the job properly: `incdmgamp × party_dps × min(duration, ttk) × target_modifier`, gated by
`skill_pays()` against λ.

**Three premises confirmed against the server**, all of which make clustering and target choice
matter:

- **Splash inherits the amp.** `incdmgamp` is applied at L3477; `o_attack` is set at L3490, *after*.
  Splash targets take `o_attack × splash factor`, so amping a clustered mob amplifies damage to
  every neighbour.
- **Burn inherits it.** `add_condition(target, "burned")` fires after L3490 and burn intensity is
  the applying hit's damage.
- **Distance and grouping therefore change the value**, and both are computable now.

**Numbers.** `curse` is `incdmgamp: 20` + `output: -20` for 5000ms at 400 MP. `marked` is
`incdmgamp: 10` for 10000ms. Same amp-seconds, concentrated — so curse specifically wants a
short-TTK, well-clustered target, exactly the case the current code cannot distinguish. The
`output: -20` is also a ~20% cut to that monster's damage, which feeds item 4.

**What changes.** A `curse_value()` modelled on `mark_value()`, gated by a mana price, plus
coordination so Riva and Myras do not both debuff the same mob (`target.s.marked` / `target.s.cursed`
are already checked by `mark_value()` for its own condition).

**Test.** Ulric's damage windows again — a correctly-placed curse should show as higher
`direct/hit` on his side. Also count curses cast per minute before and after; if the pricing is
right it should fall while party DPS holds or rises.

**Blast radius.** One function, and curse is currently an unpriced spend, so the downside case is
that it simply casts less.

---

## 4. Dynamic aggro

**Status:** blocked on the incoming-DPS sampler (item 4a). Highest value, highest risk — do it last.

**Evidence.** `effective_aggro_cap()` is `floor(CONFIG.combat.aggro_cap × clamp((mp_pct − 0.2) / 0.6))`.
Mana only. It does not know about courage, damage type, incoming DPS, or her healing ceiling. The
warrior half is `agitate_min_mobs: 2` plus a 100px distance check to the tank — equally blind.

She died twice at fireroamer holding mobs she could not out-heal, with 84% of her mana untouched.
The cap was not the binding constraint and does not measure the one that was.

### 4a. Incoming-damage sampler — prerequisite

A mirror of the outgoing sampler in [`Shared/Combat_Utilities.js`](Shared/Combat_Utilities.js),
keyed on `data.id === character.id` instead of `data.hid`. Records incoming DPS, attacker count by
damage type, and fear band per window. Cheap, additive, and useful on its own for diagnosing deaths.

### 4b. The model

| input | status |
|---|---|
| healing capacity | known — `heal_delivered(character, heal) × frequency`, measured at ~4,230 HP/s |
| burst capacity | known — `partyheal` adds ~3,200 HP/s for ~4s of mana |
| courage headroom | exposed — `courage`/`mcourage`/`pcourage` vs `targets_p`/`_m`/`_u` |
| fear cost | known — the step table above |
| incoming DPS | **from 4a** |

Rule shape: take another mob iff projected incoming stays under healing capacity × safety margin,
**and** fear stays at 0 — or the fear step is explicitly worth paying. The warrior's agitate then
prices against her real headroom rather than a flat mob count.

**Test.** Deaths (the one that matters), plus incoming DPS vs healing capacity from 4a, plus time
spent at fear ≥ 1. Run at fireroamer, which is known to be able to kill her.

**Blast radius.** This one can kill her. Ship behind a config flag, default to current behaviour
first, and compare. Do not ship it together with anything else.

---

## Considered and rejected

Recorded so they are not re-derived.

- **`rpiercing` as a gear direction.** Measured marginal is ~0 at her current 183 — she has already
  all but erased Ulric's 207 and Riva's 283 resistance. The earlier estimate of ~1.4 HP/point assumed
  ~480 resistance and was wrong by an order of magnitude.
- **Chasing the poison quarter.** The ×0.25 on a poisoned target is correct per the source, but
  `poisoned_pct` measured 0.00 at both gscorpion and fireroamer. Poisonous monsters are rare enough
  not to pursue.
- **Loosening the overheal threshold.** Overheal is 17% at rest but only **1.6%** under real load, so
  the `/1.33` allowance self-corrects where it matters. Leave it.

## Open, not scheduled

- **Ulric's burn term** is 1.39× too generous, and the error is sub-linear in proc chance — the
  signature of burn refreshing rather than stacking. Replacing the linear term with an uptime term
  is the fix; it touches shared code that Riva also uses, so it needs a re-measure of both.
- **Ulric's set choice oscillates** every ~9s, pinned to the `weapon_hysteresis_ms` floor, driven by
  a splash estimator that swings 2.6× while delivering a stable 1.738. Smoothing the input beats
  lengthening the timer.
- **Myras cannot out-heal fireroamer ×10 sustainably** — ~4,230 HP/s against ~5,000 incoming. Items
  1–4 give her better odds but do not change that arithmetic; only reducing incoming does.
- **`skill_min_mp_pct: 0.40`** cuts darkblessing during a long crisis, and darkblessing feeds attack
  which feeds heal. Self-reinforcing dip. Observed once, survived.
