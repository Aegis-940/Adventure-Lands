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

**Status:** not started. Do this first — pure upside, no survivability risk.

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

## 2. Healer circle speed

**Status:** not started. Small, and fixes a provable defect.

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
