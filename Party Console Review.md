# Party Console Review

A comparison of [Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console)
(`characters/` and the TypeScript under `runtime/` it is compiled from, at `ecbf152`, 2026-10-02) against this
repo at `b5a6236`, 2026-10-05. Six areas were reviewed independently; every claim was checked against both
codebases, and many against the game's own client and server source.

Most of the value is **defects in our code that the comparison exposed**, not features to copy: their bot is
largely a coordinator server issuing orders, so much of it does not port.

Line numbers are ours unless prefixed `theirs:`. Their paths are relative to the repo root.

**Rating key**
- **Size** — S: an hour or less, one file. M: a few files or a new mechanism. L: a new feature.
- **Risk** — what can go wrong in the live game if the change is wrong.
- **Benefit** — what it buys, with the evidence behind it.

---

## Summary

| Area | Item | Size | Risk | Benefit |
|---|---|---|---|---|
| Movement | [M1 Travel never escalates — the winterland trap](#m1) | S–M | Low–Med | **High** |
| Movement | [M2 Search cap kills searches that would succeed](#m2) | S | Low | Med |
| Movement | [M3 Stuck-escape guards block the escape](#m3) | S | Low | Med |
| Movement | [M4 Movement is invisible to the flight recorder](#m4) | S | None | Med |
| Movement | [M5 Followers jitter at the follow distance](#m5) | S | Low | Low–Med |
| Movement | [M6 Shared cruise speed for travel](#m6) | M | Med | Low–Med |
| Movement | [M7 Detour for a blocked melee approach](#m7) | S–M | Low | Low |
| Tank | [T1 Damage-projection gate for absorb, pulls, agitate](#t1) | M | Med | **High** |
| Tank | [T2 Emergency partyheal on projected HP](#t2) | S | Low | Med |
| Tank | [T3 Stop pulling while a fighter is down](#t3) | S | Low | Med |
| Tank | [T4 Followers freeze when the tank dies](#t4) | M | Med | Med |
| Tank | [T5 Emergency stomp on Myras's attackers](#t5) | S–M | Low | Med |
| Tank | [T6 Curse the party's target, keep an MP floor](#t6) | S | Low | Low–Med |
| Tank | [T7 Scare depends on an orb swap](#t7) | M | Med | Med |
| Targeting | [G1 One sticky, shared focus target](#g1) | M | Med | **High** |
| Targeting | [G2 Myras chases nearly dead mobs](#g2) | M | Low | Med |
| Targeting | [G3 Don't hit other players' monsters](#g3) | S | Low | Low–Med |
| Targeting | [G4 Reflection rules from game data](#g4) | S | Low | Low |
| Targeting | [G5 Move when the camp is contested](#g5) | L | Med | Low now |
| Skills | [K1 Supershot gate](#k1) | S | None | Low |
| Skills | [K2 Party damage already in flight](#k2) | M | Low | Low–Med |
| Skills | [K3 Crit in expected damage](#k3) | S | Low | Low |
| Skills | [K4 mp_reduction in skill costs](#k4) | S | None | Low |
| Survival | [S1 MP-first potions while panicking](#s1) | S | Low | Med |
| Survival | [S2 Retreat step for Riva in panic](#s2) | M | Med | Low–Med |
| Survival | [S3 Free regen skills](#s3) — withdrawn | — | — | None |
| Events | [E1 `join` teleports the party back to the entrance](#e1) | S | Low | Med |
| Events | [E2 Crabxx engage gate (lost fix)](#e2) | S | Low | Med |
| Events | [E3 Monster Hunt quests](#e3) | L | Med | Med |
| Merchant | [R1 Scroll grades lose gold](#r1) | S / M | Low | **High** |
| Merchant | [R2 We vendor what we upgrade, and shiny items](#r2) | S | Low | **High** |
| Merchant | [R3 Bank is full; basement never used](#r3) | S each | Low | **High** |
| Merchant | [R4 mluck strangers](#r4) | S | Low | Med |
| Merchant | [R5 Seashells may block the exchange queue](#r5) | S | Low | Unknown |
| Merchant | [R6 Lucky upgrade slot](#r6) | S → M | Low | Low–Med |
| Merchant | [R7 Stat scrolls on worn gear](#r7) | S | Low | Med |
| Merchant | [R8 Best-level gathering tool](#r8) | S | None | Low |
| Merchant | [R9 Giveaways](#r9) | S | Low | Low |
| Merchant | [R10 Gold for merchant XP](#r10) | S | Low | Med |
| Infra | [I1 Watchdog heartbeat isn't the main loop](#i1) | S | Low | **High** |
| Infra | [I2 No timeout on Bootstrapper requests](#i2) | S | Low | Med |
| Infra | [I3 Fall back to the last good commit, not `@main`](#i3) | S | Low | Med |
| Infra | [I4 Use `on_destroy` for Disengage](#i4) | S–M | Low | Low |
| Infra | [I5 Fishing/mining cooldown lost on reload](#i5) | S | Low | Low–Med |
| Looting | [L1 Gold booster swaps for chests that can't benefit](#l1) | S | Low | Med |
| Config | [C1 Crab farm spot typo](#c1) | S | None | Med |
| Config | [C2 Other farm spots outside their spawn box](#c2) | S | None | Low |
| Infra | [I6 Tracktrix on every fighter](#i6) | S | None | Low |

**Done:** M1–M7 (all of Movement); T1–T7 (all of Tank survival). M1 now casts the town teleport while
walking continues (`channel_walk()`), cancels it when the journey that wanted it ends, and M6 cruise
applies to all three fighters. T7's cause was not a server refusal — the `not_ready` replies were potions —
but the rules loop re-sending the jacko swap from a stale inventory view, which flipped the orb back.
Also done: K2, K3, K4, S1, I1, I2, C1, C2. S1 found the potion loop drinking HP and MP in the same tick —
they share one cooldown, so the second was always refused (the 60k `not_ready` lines). C2: only `rat` was a
real error (sign flip, `y: 430` → `-430`); stoneworm, wolfie and mechagnome deliberately sit between their
spawn boxes. S3 withdrawn (see below). E2: crabxx has no engage gate at all now and Myras kites it
(Design Notes → `World Events.js`, kiting).

**Suggested order:** M1 + M3 + I1 + C1 first (small, and each is failing today) → R1 + R2 + R3 (merchant gold) →
T1, then G1, one at a time so each can be measured → the rest.

---

## Movement

### <a id="m1"></a>M1 — Travel never escalates: the winterland trap
**Size** S–M · **Risk** Low–Med · **Benefit** High

**What happened (2026-10-05).** Myras stood at winterland (819,426) from 16:03 to 16:22 with travel goals for
Mr. Pumpkin, then the cave, then home, and never moved. The ice golem `join` teleports everyone to (820,425)
(server `al_server.js:10479-10482`). Flood-filling the game's 15px grid from there exhausts after **91 nodes**
and reaches no door, transporter or spawn — a walled pocket. Replaying the game's pathfinder offline: "path not
found" in 14 ms; with `smart.use_town = true` it finds town → walk → transporter in 158 ms.

**Ours.** When the search fails the game sets `smart.moving=false` and calls `on_done(false,"failed")`, but
`smarter_move` has replaced `on_done` with a no-op (`Movement Manager.js:104`). The monitor records "movement
stopped" (`:127`), the arbiter treats it as `drifted` (`:232`) and reissues the identical search every
`TRAVEL_REISSUE_MS` 3s (`:258`). Every reissue nulls the stall anchor (`:266`), so `TRAVEL_STALL_MS` (8s) can
never fire. No counter, no escalation, no log line (label never changes).

**Theirs.** Routes allow town by default (theirs: `party-member.js:980` `use_town: options.town !== false`); the
planner fails explicitly ("Native planner found no route", `:157`); recovery is capped at two retries and turns
town off after a town error (`:934-942`); a town cast is only attempted when `can_use("use_town")`, with a 12s
timeout (`:272-275`, `:385-391`).

**Fix.**
1. In `monitor_movement`, report "no path" when `!smart.moving && smart.searching && !smart.found`.
2. In the arbiter, count failures per goal label (no-path, stall, search overrun); reset on a label change or
   real progress; stop nulling the anchor on reissue.
3. On the second failure, reissue with `smart.use_town = true` — set from a `smarter_move` option and restored in
   `complete()`, never mid-search (the concern in commit 9ac7a8b).
4. Only when `monsters_targeting_me() === 0`. Log every escalation.

Followers go through the same arbiter, so Ulric and Riva escape the same way.

**Risk.** A heal or equip during the 3s channel cancels it (server: hit ~3700, attack/heal ~3020, any
equip 6542/6607/6865, more than 5 attackers 5283); the native walker then re-searches and the failure cap bounds
the loop.

### <a id="m2"></a>M2 — The 20s search cap kills searches that would succeed
**Size** S · **Risk** Low · **Benefit** Med

`TRAVEL_SEARCH_MAX_MS 20000` (`Movement Manager.js:157, 242, 258`) aborts and restarts from scratch. Measured
offline (CPU): winterland spawn → Dorr 8.7s / 47k nodes; winterland spawn → halloween 12.4s / 64k nodes. In a
visible window the pathfinder only works 40 ms in every 80 ms (`runner_functions.js:2720`), so those take ≥17s
and ≥25s of wall time — the halloween one **can never finish** under the cap. Theirs: 30s, then an explicit
failure (theirs: `party-member.js:128,135`).

**Fix.** Raise to ~60s and count an overrun as a failure feeding M1. Also make `travel_searching()` (`:169-171`)
use `smart.searching && !smart.found` — today it uses `plot.length`, so the last walking leg counts as searching
and switches stall detection off.

### <a id="m3"></a>M3 — Stuck-escape guards block the escape
**Size** S · **Risk** Low · **Benefit** Med

`stuck_escape_check` (`Movement Manager.js:287-327`):
- returns on `in_dungeon()` (`:299`), which is true for **any** dungeon mode, even on an overworld map — it was
  disabled for the whole cave gather 16:07–16:16;
- refuses if **any** monster is within 300px (`:317-320`) — the iceroamer boundary is 276px from the pocket, so
  monsters that cannot reach her blocked it;
- needs 60s still, then waits 5 min without checking the cast landed (`:279-280`);
- followers skip it whenever the leader is visible and alive (`:291-293`).

**Fix.** Use `G.maps[map].instance || character.cave` instead of `in_dungeon()`; refuse only when something is
targeting her (and when more than 5 are); start the cooldown only once she is within 150 of the spawn
(theirs: `shared.js:14293-14301`). Keep it as the backstop behind M1.

### <a id="m4"></a>M4 — Movement is invisible to the flight recorder
**Size** S · **Risk** None · **Benefit** Med

`Error Log.js:299-300` only records game-log lines starting ⚠️ ❌ 🛑 🎂 or `[`, so every 🧭 and 🚨 line is lost.
The per-minute `alive` sample has no x/y and no pathfinder state. The winterland incident had to be rebuilt from
three timestamps.

**Fix.** Record 🧭 and 🚨; add `x`, `y`, `smart.searching`, `smart.found`, `smart.plot.length` and the M1 failure
count to the sample. Theirs de-duplicates repeats within 10s with a count (theirs: `party-member.js:459-475`).

### <a id="m5"></a>M5 — Followers jitter at the follow distance
**Size** S · **Risk** Low · **Benefit** Low–Med

`follow_goal` targets a point exactly `follow_distance` (15px) from the leader and counts arrival at the same
15px (`Party Cohesion.js:134-139`; `approach`, `Movement Manager.js:339-344`). Landing at 15.0x is never
"arrived", so a `move()` goes out every 100 ms tick — Ulric sat in `follow-close` for 18 minutes.

**Fix.** Aim at ~0.8× the distance, or give arrival a few pixels of tolerance.

### <a id="m6"></a>M6 — Shared cruise speed for travel
**Size** M · **Risk** Med · **Benefit** Low–Med

`cruise(speed)` is a server-side speed cap. Theirs sets every member to the slowest member's speed for travel and
releases with `cruise(500)` on combat handoff, arrival and failure (theirs: `shared.js:14084-14098`). The
`cruise()` promise may never resolve — watch `character.speed`.

For us: the tank stops fighting the cohesion hold (250/120) and arrives with her damage dealers. Needs `speed` in
the state cache and a release on **every** exit path, including the moment anything targets her, so she never
kites capped. Only worth it if measured speeds actually differ.

### <a id="m7"></a>M7 — Detour for a blocked melee approach
**Size** S–M · **Risk** Low · **Benefit** Low

`warrior_close_in` (`Warrior Movement.js:47-51`) calls `local_move`, which silently does nothing when blocked.
Theirs: if an approach gains less than 8 units in 1.5s, `recoverFormationCorner` (theirs: `shared.js:14670-14719`)
tries 64 points (16 directions × 80/160/320/640) for a two-leg detour, at most once a second, and never calls the
pathfinder mid-combat.

---

## Tank survival (Myras)

Myras repeatedly dies with 3,000–6,000 MP left. `Combat Plan.md:336` records the same at fireroamer ("84% of her
mana untouched … the cap was not the binding constraint"). She is out-damaged, not out of mana.

### <a id="t1"></a>T1 — Damage-projection gate for absorb, pulls and agitate
**Size** M · **Risk** Med · **Benefit** High

**Ours.** `handle_absorb` (`Healer Skills.js:120-144`) absorbs from the first ally with a monster on them, every
400 ms, never looking at her HP, the damage already on her, or the pack size. It is not bounded by
`effective_aggro_cap()` (`Healer Combat.js:87-96`, which only limits her untargeted pulls at `:59-65`).
Ulric's `handle_agitate` (`Warrior Skills.js:168-204`) dumps everything in 320px onto him, which absorb then moves
to her — an uncapped aggro path. Panic `aggro: 99` (`Healer Config.js:72`) never stops it.

**Theirs.** `incomingDps` (theirs: `runtime/characters/skills/damage.ts:50-56`) sums over monsters targeting the
actor `attack × frequency × damage_multiplier(magical ? resistance : armor) × 1.1`. `safeTransfer`
(`damage.ts:58-63`) allows taking aggro only if `hp − 2 × (current + added) > 0.3 × max_hp`. `absorbDecision`
(`protection.ts:5-13`) also needs one heal's MP left afterwards and takes the lowest-HP ally first.

**Fix.**
- `Combat Formulas.js`: `monster_dps_on(m, entity)` — damage type from `G.monsters[m.mtype].damage_type`
  (magical → resistance, physical → armor, pure → none; theirs wrongly treats pure as armor), × 0.8 when
  `m.s.cursed`, × 1.1. `incoming_dps(entity)` sums it over monsters targeting that entity.
- `can_take_more(added)`: `hp − 2 × max(0, incoming + added − self_heal_rate) > 0.3 × max_hp`, with
  `self_heal_rate = heal_delivered(character, character.heal) × character.frequency` (~4,230 HP/s measured).
  The heal term is ours, not theirs — without it ~5,000 incoming blocks absorb even at full HP below ~14.3k max.
- Use it in `handle_absorb` (sort allies by HP%, skip any whose attackers fail), in Myras's untargeted pull
  (`where: m => can_take_more(monster_dps_on(m, character))`), and in `handle_agitate`.
- Confirm in the console that monster entities carry `attack` and `frequency`.

**Risk.** When absorb is refused, Ulric keeps the mobs. Ship behind a config flag; measure deaths and time spent
feared (`Combat Plan.md:359`).

### <a id="t2"></a>T2 — Emergency partyheal on projected HP
**Size** S (after T1) · **Risk** Low · **Benefit** Med

`party_heal_emergency` (`Healer Skills.js:181-185`) fires when she is below 50% or two allies are at or below 35%.
Panic starts at 40%, so the window is 10 points; a burst from 70% to 0 in two seconds never triggers it. Theirs:
`endangered` = `dps > 0 && (hp% < 0.6 || hp − 2 × dps < 0.3 × max_hp)` (`damage.ts:64-67`).

**Fix.** Add `|| hp − 2 × max(0, incoming_dps(character) − self_heal_rate) < 0.3 × max_hp` to the self branch.
Partyheal has its own cooldown and doesn't share `attack`, so it stacks with `heal` and costs only MP — the
resource she dies holding. Side note: `party_heal_outvalues_single` (`:187-203`) treats the two as alternatives,
so the non-emergency path almost never fires.

### <a id="t3"></a>T3 — Stop pulling while a fighter is down
**Size** S · **Risk** Low · **Benefit** Med

`effective_aggro_cap()` (`Healer Combat.js:87-96`) scales only with MP; she keeps pulling to `aggro_cap: 5` while
Ulric or Riva is dead or walking back from town. Theirs: no new pulls after a farming death
(theirs: `scripts/combat-disengagement.cjs:63-81`).

**Fix.** Return 0 when any `COHESION_FOLLOWERS` state-cache entry has `rip`, or is on a different map while she is
not travelling. Her defensive targeting (`:67-72`) still covers anything already on the party.

### <a id="t4"></a>T4 — Followers freeze when the tank dies
**Size** M · **Risk** Med · **Benefit** Med

When Myras dies, `should_pause_combat_loop()` returns `leader.rip` (`Combat Utilities.js:156-158`) so Ulric and
Riva stop attacking; `follow_goal()` returns null so they stand still; and `healer_on_disabled` releases party
panic (`Healer Movement.js:5-8`). They hold her aggro with nothing answering it for ~10s (21:31:34 death →
21:31:45 moving, 10-02). Theirs: survivors finish only if every attacker is ≤25% HP and every survivor ≥50%,
otherwise escape at once; resume when everyone is alive at 50%+ with no threats
(`combat-disengagement.cjs:61-101`).

**Fix.** When the leader is dead, either keep fighting (attackers all ≤25%, self ≥50%) or `set_panic(true, "tank
down")` so scare fires. After she respawns, the existing cross-map `follow_goal()` walks them to her.

**Risk.** It touches the pause predicate every loop reads.

### <a id="t5"></a>T5 — Emergency stomp on Myras's attackers
**Size** S–M · **Risk** Low · **Benefit** Med · **Needs your OK** (re-enables commented-out code)

Theirs: `emergencyWarriorStomp` (theirs: `shared.js:14391-14423`) — basher equipped, enough MP, the warrior has
2+ monsters on him or any member is below 60%, and at least one monster within 400 targets a party member; skips
`tinyp`. Ours: commented out (`Warrior Skills.js:30-32`, tank HP < 30%); `handle_stomp` (`:70-96`) still uses
the old awaited unequip/equip chain behind `COOLDOWNS.weapon_swap`.

A 3.2s stun on everything within 400 for 120 MP — three seconds of zero incoming for her. Ulric owns a +8 basher
(`Warrior Config.js:114`). Trigger on T1's `endangered(tank)` or tank HP < 60% with one of her attackers within
400 of Ulric; rewrite the swap like `handle_cleave` (`:113-124`). Bosses may resist the stun.

### <a id="t6"></a>T6 — Curse the party's target, and keep an MP floor
**Size** S · **Risk** Low · **Benefit** Low–Med

`handle_curse` (`Healer Skills.js:90-118`) curses the highest-HP home mob with any target, never checks
`s.cursed`, and doesn't prefer what Ulric or Riva are hitting — the +20% damage taken can land on a mob nobody is
damaging. Its only gate is `mp ≥ 400 + panic_mp_reserve()`. Theirs (`priest.ts:2-32`) skips cursed and `tinyp`,
needs MP > 50% and the party ≥ 90% HP, and curses the party's current target; `eligibility.ts:38,78` blocks any
non-survival spend below `max(35% max_mp, 2 × heal + partyheal)`.

**Fix.** Prefer `get_player("Ulric").target` / `get_player("Riva").target`; skip `s.cursed`; keep MP ≥
`max(0.35 × max_mp, 2 × mp_cost + G.skills.partyheal.mp)` after the cast. Optionally, under pressure, curse the
largest damage source on her instead (curse is `output −20`).

### <a id="t7"></a>T7 — Scare depends on an orb swap
**Size** M · **Risk** Med · **Benefit** Med

Our only escape action, scare, needs the jacko orb equipped. "panic waiting for orb" is counted 2,683–4,891 times
per fighter. On 10-02 at 21:31 Myras died with 3,857 MP after scare failed `skill_cant_slot` because the orb swap
had been refused `not_ready` for ~90s. Theirs uses no gear to escape. Worth an investigation of why the swap is
refused, and whether jacko should simply stay on when a fight is going badly.

---

## Targeting

### <a id="g1"></a>G1 — One sticky, shared focus target
**Size** M · **Risk** Med · **Benefit** High

**Ours.** `update_cache()` re-runs `find_best_target()` every 50 ms (`CACHE_TTL`, `Global Config.js:196`);
nothing is sticky. `normalise()` (`Targeting.js:79-89`) stretches each term to 0..1 across the pool, so a 1%
difference gets full weight. Ulric's weights are `{ damage: 1, protects: 1, close: 0.05 }`; when every mob is on
Myras, `protects` is equal for all and drops out, leaving `damage` — which rises with mob HP (burn window
`min(5000, ttk)`, `Combat Formulas.js:126-127`; `direct = min(hit, hp)`, `Targeting.js:46`). So Ulric favours the
**healthiest** mob; Riva sorts by the same value (`Ranger Combat.js:45-62`). Telemetry: in Ulric's 23
`target_choice` samples `protects` was 1 once, and chosen HP ranged 6–100%.

**Why it matters.** Spreading damage evenly costs the tank N²·H/D mob-seconds of being hit; killing in turn costs
N(N+1)/2 · H/D. At her cap of 5 that is 25 vs 15 — **about 67% more incoming damage and mana**.

**Theirs.** The target can't change while a fight is unfinished (theirs: `shared.js:13156`); the current target is
kept first, then the oldest engaged fight (`queue.ts:93-98`); a pre-agreed next target is promoted the instant the
current one dies (`successor-client.ts:49-61`).

**Fix, peer-to-peer.** A `focus` pick in `Targeting.js`: the lowest time-to-kill among mobs targeting a
`DUNGEON_PARTY` member, held until dead or gone. Reuse what exists: `broadcast_target()`
(`Healer Combat.js:10-22`), the `dungeon_focus` CM handler (`Character Messaging.js:50`) and
`dungeon_focus_target()` (`Dungeon Runner.js:200-208`). Broadcast `{focus, next}` so followers switch on death
without waiting for a message. Riva puts the focus first in `in_range` (multishot still spreads); Myras uses it for
protect attacks and leaves her pull logic alone.

**Risk.** Some burn value is lost on mobs that die sooner. Measure her mana and damage taken before and after.

### <a id="g2"></a>G2 — Myras chases nearly dead mobs
**Size** M · **Risk** Low · **Benefit** Med

`protect_weights: { hp_low: 1 }` (`Healer Config.js:13`) sends her to the weakest mob on Ulric: 73 of her 102
`target_choice` samples picked a mob under 1% HP (sample biased toward trades), and she has **1,041** "Monster
already dead" rejections against 231 for Ulric and 102 for Riva. G1 removes most of this. Optionally, a ledger of
in-flight party shots from the `action` socket event (`Combat Sampling.js:128-143` already listens) to skip a mob
whose pending damage covers its HP.

### <a id="g3"></a>G3 — Don't hit other players' monsters
**Size** S · **Risk** Low · **Benefit** Low–Med

Ulric's pool is unfiltered outside dungeons (`warrior_may_engage()`, `Warrior Combat.js:75`), as is Myras's last
fallback (`Healer Combat.js:75`); Riva's `attack_if_targeted` treats any target as aggroed
(`Ranger Combat.js:14-16`). Theirs: `isExternallyClaimedMonster()` (theirs: `shared.js:12556-12567`) skips a
monster targeting someone outside the party, exempting cooperative and event monsters. One `monsters_matching`
option, used in Ulric's call and Myras's fallback.

### <a id="g4"></a>G4 — Reflection rules from game data
**Size** S · **Risk** Low · **Benefit** Low

Theirs (theirs: `runtime/characters/roles/monster-attack-policy.ts:1-15`): porcupine blocks physical attackers with
range under 75; `slenderman`, `tiger`, `goblin` block magical basic attacks. Ours: `Porcupine Guard.js` covers
Ulric on porcupines only; Myras (magical) has no reflection check. Add `attack_backfires(mob)` to `Targeting.js`
reading `G.monsters[mtype].reflection` / `.dreturn`. Verify the values in the console first; the Guard's weapon
swap stays.

### <a id="g5"></a>G5 — Move when the camp is contested
**Size** L · **Risk** Med · **Benefit** Low now

Theirs relocates only when another player recently fought in our zone, 120s have passed since the last move,
every member has a fresh report, none sees a target monster, and the competitor is still there
(theirs: `farm-competition.ts:62-97`, `farm-areas.ts:116-170`), using spawn boxes and a 5×5 search grid
(`farming-zones.js:137-184`). Low value today: bscorpion and porcupine each have one spawn area. Pays for bat (6
areas), cgoo (3), mole/stoneworm/fireroamer/plantoid/iceroamer (2).

---

## Skills and damage maths

### <a id="k1"></a>K1 — Supershot gate
**Size** S · **Risk** None · **Benefit** Low

Ours: `above_hp_pct(target, 0.85)` (`Ranger Skills.js:107`, `Ranger Config.js:20`) — on a boss, supershot only
fires above 85% HP, once or twice a fight. Theirs (`offense.ts:34`): fire if remaining HP ≥ 0.5 × supershot
damage. Replace with `target.hp ≥ 0.5 × estimate_my_damage(target, G.skills.supershot.damage_multiplier)`; keep
`skill_pays` and the bscorpion wait. Check whether supershot has a `range_multiplier`.

### <a id="k2"></a>K2 — Party damage already in flight
**Size** M · **Risk** Low · **Benefit** Low–Med

Theirs (`projectiles.ts`): an in-flight map from `action` events (`pid`, `damage × defense multiplier × 0.9`,
expiring at `eta`, cleared on `hit`); `usefulDamage = min(hp − incoming, dmg)` ranks multishot targets and the
supershot/mark gates. Ours caps at `mob.hp` but can't see Ulric's hits or Riva's own previous volley. **Measure
first:** count `action` pids that never get a `hit`; build only if the waste is material.

### <a id="k3"></a>K3 — Crit in expected damage
**Size** S · **Risk** Low · **Benefit** Low

Theirs (`damage.ts:32,45-47`): × `1 + min(1, crit/100) × (critdamage/100 + 1)` for attacks and skills with
`procs`. Ours: `SET_PROFILE_FIELDS` (`Equipment Valuation.js:46`) omits crit, so sets differing in crit are
mis-valued. Confirm the server crit formula first.

### <a id="k4"></a>K4 — mp_reduction in skill costs
**Size** S · **Risk** None · **Benefit** Low

Theirs: `ceil(mp × (1 − mp_reduction/100))` (`eligibility.ts:4-7`). Ours uses raw `G.skills.X.mp`. Only matters
if any of our gear carries `mp_reduction`.

---

## Survival

### <a id="s1"></a>S1 — MP-first potions while panicking
**Size** S · **Risk** Low · **Benefit** Med

`potion_loop` drinks HP first below 50% for non-healers (`Maintenance.js:21-22`). Ulric's "scare no mp" counter
is **819** (Myras 6, Riva 0). Theirs restores mana first during escape until the escape skill's cost is covered
(theirs: `shared.js:60-73`). While `panicking && character.mp < G.skills.scare.mp`, take the MP branch first.
Potions only; equipment untouched.

### <a id="s2"></a>S2 — Retreat step for Riva in panic
**Size** M · **Risk** Med · **Benefit** Low–Med

Panic only scares (`Party Management.js:82-131`); movement carries on, and in an event `event_step()` still closes
to `range × 0.8`. Riva's deaths happen while panicking, several with `targeting: 0` where scare does nothing.
Theirs steps 40px every 100 ms in whichever of four directions passes `can_move_to` and is farthest from the
nearest enemy (theirs: `shared.js:270-277`). Use `make_distance_from_monsters_scorer()` in `movement_local()` when
panicking and the scare is spent. **Never on Myras** (a tank must not leave a pull); watch heal range.

### <a id="s3"></a>S3 — Free regen skills
**Withdrawn — the assessment was wrong.**

`G.skills.regen_hp` / `regen_mp` are in `cooldown_group: "potion"` with `cooldown_multiplier: 2`: each one locks
both potions and both regens for 4s (a potion locks them for 2s) and restores only 50 HP / 100 MP. And
`use("hp")` / `use("mp")` with no potion in the bag already fall back to exactly that regen. Casting regen is
therefore strictly worse than a potion while potions last, and redundant once they run out.

---

## Events and bosses

### <a id="e1"></a>E1 — `join` teleports the party back to the entrance
**Size** S · **Risk** Low · **Benefit** Med

`event_goal` (`World Events.js:44-50`) sends `join` every 5s whenever the boss isn't visible — **even on the event
map** — and returns `null` in between so other goals take over. The server teleports anyone more than 200px (crabxx,
franky) or 100px (icegolem) from the fixed entry back to it (`al_server.js:10471-10481`). Theirs joins only when
not yet joined or on another map (theirs: `shared.js:11799`) and walks to `S[name].x/y` (`:11480-11483`).

**Fix.** If `character.map === parent.S[name].map`, return a walk goal to `S[name].x/y` instead of joining.

### <a id="e2"></a>E2 — Crabxx engage gate (a lost fix)
**Size** S · **Risk** Low · **Benefit** Med · **Needs a decision** (see below)

`boss_engageable()` (`Combat Utilities.js:120-127`) requires HP ≤ 95% of `G.monsters[name].hp`, and crabxx is
listed at 0.95 (`Global Config.js:112`). Our own API reference says crabxx takes 1 damage per hit while any crabx
lives, so it sits near 100% and the party never engages. Commit `c7a1906` fixed exactly this ("the party watched
two EU crabxx die without moving") — but only in `Server Watch.js`, since deleted; `cf273e7` separately reverted a
join-at-full-HP change bundled with kiting.

**Fix.** Engageable if `data.target` is set, or HP has moved below `data.max_hp`, or it is under the threshold;
prefer `data.max_hp` over `G.monsters[name].hp` (`:105`).

### <a id="e3"></a>E3 — Monster Hunt quests
**Size** L · **Risk** Med · **Benefit** Med

We have none. `interact("monsterhunt")` takes and hands in; progress is `character.s.monsterhunt =
{id, c, ms, sn}`. Their rules (theirs: `docs/hunt-recovery.md`): refill at Daisy only when every existing quest
has 25+ minutes left; a death blacklists that monster; two deaths in a run end the hunt.

---

## Merchant

### <a id="r1"></a>R1 — Hand-picked scroll grades lose gold
**Size** S (edit rows) / M (preview) · **Risk** Low · **Benefit** High

Server rule: a scroll above the item's grade gives `probability × 1.2 + 0.01` for upgrades (cap
`min(op + 0.36, op × 3)`), `× 1.1 + 0.001` for compounds. Theirs always uses the item's own grade
(theirs: `shared.js:3364, 3386, 3432, 6714`). Ours: `scroll_for()` (`Merchant Upgrading.js:95-99`) uses
hand-set `scroll0_until` / `scroll1_until` (profiles `:8-55`).

Expected value per attempt (valued at the cost to rebuild the item with normal scrolls):

| Item and level | Our pick | EV per attempt | Only worth it if the result sells above |
|---|---|---|---|
| dexbelt / strbelt / intbelt L2–L3 | `cscroll2` | −7.2M to −8.7M | 218M / 345M |
| cring / cearring L2 | `cscroll2` | −6.8M to −7.4M | 218M |
| ololipop / glolipop L5–L6 | `scroll2` on a grade-0 item | −1.6M | 17.8M |
| crossbow / basher L4–L6, hbow L6 | `scroll2` | −0.4M to −1.5M | 12M+ |
| fireblade / firebow / firestaff L6 | `scroll2` | ≈ −1M | 27M |
| coat / pants L8 | `scroll2` | ≈ −0.8M | 65M |
| rings, amulets, earrings L1–L2 | `cscroll1` | −0.1M to −0.2M | — |
| low-level `scroll1` on grade-0 items | `scroll1` | ≈ −35k each | — |

Offerings that also lose: offeringp on wingedboots L5 (−280k), harbringer L4 (−175k), cring/cearring/molesteeth
at L0 (−290k to −370k).

**Fix (S).** Edit those rows down to the item's grade. **Fix (M).** Call `upgrade(i, s, off, true)` /
`compound(..., true)` for both grades — the server's preview returns `chance` including grace — and take the
higher scroll only when the chance gain × result value beats the extra cost. Rare drops (cring, cearring, orbs)
can sell above rebuild cost; check them against the break-even column.

### <a id="r2"></a>R2 — We vendor what we upgrade, and shiny items
**Size** S · **Risk** Low · **Benefit** High · **Needs a decision** (see below)

`SELLABLE_ITEMS` (`Loot Management.js:322-335`) includes broom, harbringer, quiver, all 14 str/dex/int rings,
earrings, amulets and belts, skullamulet and wbook0 — all also in `UPGRADE_PROFILE` / `COMBINE_PROFILE`.
`sellable()` (`Merchant Inventory.js:29-31`) matches by name only. `auto_upgrade` ends with `sell_items()`
(`Merchant Upgrading.js:603`) and so does `sell_while_idle` (`Merchant Stand.js:46`), so freshly compounded +1 to
+3 jewellery goes to the NPC right after we paid for the scrolls. Riff also sells shiny/glitched items (`item.p`);
the fighters already skip them (`Loot Management.js:339`). Theirs keys sale rules on `name@+level` and matches
level, stat and `p` (theirs: `shared.js:5005-5017, 5104-5116`).

**Fix.** Add `!item.level && !item.p` to `sellable()`.

### <a id="r3"></a>R3 — The bank is full and the basement is never used
**Size** S each · **Risk** Low · **Benefit** High

`errors_timeline.jsonl`: 78 × `bank_store coat: bank_full`, ~40 more for intamulet, dexbelt, ololipop and others.
The game's `bank_store()` with no pack only uses packs on the current floor; `bank_items` always stands on `bank`
(items0–7). `has_enough_bank_space()` (`Merchant Inventory.js:5-19`) counts free slots on **every** floor, so the
gates think there is room. `upgrade_buy: ["coat"]` buys with no cap. Theirs deposits to the floor of a matching
stack (theirs: `party-member.js:1292-1316`), merges partial stacks with `bank_swap` without using inventory
(`:1325-1333`), compacts on every visit (`shared.js:3548-3558`), and counts finished copies in storage against
production targets.

**Fix.**
1. On `bank_full`, go to `bank_b` (`withdraw_item` already has `BANK_LOC2`) and retry.
2. Count free space per floor.
3. Skip `buy_for_upgrade` once N max-level copies exist in bank + bag.
4. In `consolidate_stack_group` (`Bank Sort Order.js:291`), try `bank_swap(pack, donor, target)` first when the
   full quantity fits.

### <a id="r4"></a>R4 — Cast mluck on strangers
**Size** S · **Risk** Low · **Benefit** Med

Server: any player whose `mluck.f` is Riff gives Riff a copy of each looted item 2% of the time; a stranger's mluck
can be overwritten unless it is `strong` (same owner). Theirs buffs up to 4 non-merchants within 200 every 750 ms,
refreshes below 10 minutes, and skips another merchant's `strong` buff (theirs: `shared.js:4868-4926`). Ours: party
only (`Merchant Party.js:40-61`). Add the scan to `decide_opportunistic_actions` (`Merchant Upkeep.js:70`); mluck
is 10 MP, 100 ms cooldown, range 320; HOME is in town, where the traffic is.

### <a id="r5"></a>R5 — Seashells may block the exchange queue
**Size** S · **Risk** Low · **Benefit** Unknown · **Needs a check** (see below)

`seashell` is a quest item: the server requires being within 400 of the fisherman at (−1572, 552) unless carrying
a computer. We exchange at HOME (−87, −96), ~1,600 away. `find_bag_exchangeable` (`Merchant Exchange.js:25-36`)
returns the first target in config order — seashell is second — so a failing seashell blocks every later target,
and `should_run_exchange` (`:96-103`) refuses new fetches while it sits in the bag. 227 seashells were withdrawn on
10-03 at 10:18; there is no exchange telemetry to confirm failure. Theirs routes quest items to their quest NPC
(theirs: `shared.js:7258-7265, 7336`).

### <a id="r6"></a>R6 — Lucky upgrade slot
**Size** S to log, M to use · **Risk** Low · **Benefit** Low–Med

Confirmed in the server upgrade handler: `if (data.item_num == player.p.item_num && Math.random() < 0.6) result =
max(rand/10000, result × 0.975 − 0.012)`. The slot is random 0–41, hidden, upgrade scrolls only. Success chance
0.024 → 0.032 (+32%), 0.07 → 0.079 (+12%), 0.25 → 0.26 (+4.5%). Discovery (rotate the least-sampled slot, stop at
99.9% with ≥100 samples) needs a median ~11.8k upgrade rolls (~21k at p90), read from `q_data` `p.nums`.
Step 1: a passive `q_data` logger (also measures Riff's upgrade volume). Step 2: swap the item into the slot under
test before upgrading (`swap` is free) — only if the volume makes 12k rolls realistic.

### <a id="r7"></a>R7 — Stat scrolls on worn gear
**Size** S (one-off) · **Risk** Low · **Benefit** Med

Items with a `stat` field only get the bonus once `item.stat_type` is set. Ours with `stat`: Riva's coat+9
(`Ranger Config.js:98`), Myras's mshield+8 and supermittens+7 (`Healer Config.js:90,96`). Cost `[1,10,100,1000]`
scrolls by grade at 8,000g each; all three are grade 2, so 100 scrolls = 800k each. We currently vendor
`vitscroll`. Check `character.slots.chest.stat_type` (and offhand, gloves) in the console first.

### <a id="r8"></a>R8 — Best-level gathering tool
**Size** S · **Risk** None · **Benefit** Low

The server destroys the rod or pickaxe on a successful catch with chance `breaks/100` — 1% at +0, falling 0.064
per level. Theirs equips the highest level (theirs: `shared.js:8725-8732`); ours takes the first match
(`Merchant Gear.js:61`).

### <a id="r9"></a>R9 — Giveaways
**Size** S · **Risk** Low · **Benefit** Low

Scan visible stands for trade slots with `item.giveaway` and call `join_giveaway`; the server requires same map,
in range, one entry per account (theirs: `shared.js:7681-7719`).

### <a id="r10"></a>R10 — Gold for merchant XP
**Size** S · **Risk** Low · **Benefit** Med

At the `lostandfound` NPC, merchants get 3.2–4.8 XP per gold donated. Levels 40→60 cost ~41–62M; 60→70 ~256–383M.
Level 60 unlocks massproductionpp (one tenth of the time instead of half); level 70 unlocks massexchangepp.
Check Riff's level. Theirs: `merchantDonate` (theirs: `shared.js:8226-8259`).

---

## Infrastructure and loading

### <a id="i1"></a>I1 — The watchdog heartbeat isn't the main loop
**Size** S · **Risk** Low · **Benefit** High

The heartbeat runs on its own timer (`setInterval(_errlog_heartbeat, 60000)`, `Error Log.js:20, 453`), and
`Watchdog.py:75` reads `_errlog.alive[...].t` with `STALE_S = 300`. Two silent-idle cases:
- **Load abort:** a critical-script abort (`Bootstrapper.js:184, 195`) happens after `Error Log.js` has loaded in
  the parallel batch, so its timer keeps beating.
- **Hung await:** `main_tick` awaits `s.pre_move()` (`Character Runner.js:139`; Riva's awaits `buy`/`consume`) and
  `handle_looting()` (`:147`, which awaits `shift()`). Game promises have no timeout (`push_deferred`,
  `al_common.js:463-472`), so one that never resolves stops the main loop for good.

Theirs sets the healthy timestamp only at the end of a successful main tick (theirs: `shared.js:10010, 10033`) and
recovers after 20s without one (`steam-bridge.js:302-306`).

**Fix.** Set `window.__al_main_beat_at = Date.now()` beside `errlog_beat("main_loop")` (`Character Runner.js:121`)
and in Riff's `loop_controller` (`Merchant Task Loop.js:135`, which has no beat today); have the watchdog read it
with ~120s staleness. `main_tick` beats even when paused, disabled or dead, so no false positives — but Riff must
beat too or the watchdog will reload him.

### <a id="i2"></a>I2 — No timeout on Bootstrapper requests
**Size** S · **Risk** Low · **Benefit** Med

The script `ajax` (`Bootstrapper.js:128`), the text fetch (`:149`) and `getJSON` (`:210`) have no `timeout`. A
half-open connection during a network stall (the 10-01 freeze class) means `.fail` never fires and `Promise.all`
waits forever. `Code Loader.js:56-61` already uses 8s; theirs uses 6s (theirs: `universal-loader.js:65-68`).
Add `timeout: 10000` to all three so the existing retry path runs.

### <a id="i3"></a>I3 — Fall back to the last good commit, not `@main`
**Size** S · **Risk** Low · **Benefit** Med

On a GitHub API failure both `Code Loader.js:85-88` and `Bootstrapper.js:219-223` fall back to `@main` — the
source of the mixed builds CLAUDE.md describes. Save the last resolved SHA in localStorage (shared by all four
windows) and use it on a 403: worst case the whole bot is one commit behind, never mixed. (Their sha256-checked
bundle manifest needs a build step and doesn't port.)

### <a id="i4"></a>I4 — Use the game's `on_destroy` hook for Disengage
**Size** S–M · **Risk** Low · **Benefit** Low

`stop_runner` calls `on_destroy` before removing the code iframe (`functions.js:2558-2560`); `disconnect()` does
not (`game.js:381-382`), so pagehide stays the hook for that path. Today `Code Loader.js:36` refuses a second
iframe in the same tab and our `parent.socket` handlers stay attached after a manual Disengage. An `on_destroy`
that removes the `parent.socket._*` handlers, restores `add_log` and clears `parent.__AL_LOAD_STARTED__` would make
Engage work without a reload. The two anonymous handlers in `Error Log.js` (`:363, 376`) would need names.

### <a id="i5"></a>I5 — Fishing/mining cooldown lost on reload
**Size** S · **Risk** Low · **Benefit** Low–Med (only if gathering is on)

The server's rejection carries the remaining time (`fail_response("cooldown", ..., { ms })`,
`al_server.js:8384-8388`) but the client never updates `next_skill` (`game.js:2267-2269`). Fishing's
`reuse_cooldown` is 48 minutes. After the periodic reload, `is_on_cooldown("fishing")` reads false, so Riff walks
out, retries 15 × 2s (`Merchant Gathering.js:61-67`), sells, banks, idles, and `should_run_fishing` (`:110-115`)
fires again until the real cooldown ends. Theirs persists `cooldownUntil` from `error.ms`
(theirs: `shared.js:9054-9058, 10187`). Persist `Date.now() + e.ms` per skill with `storage_write` and check it in
`should_run_*`. Both toggles default off (`Merchant Config.js:16-17`).

### <a id="i6"></a>I6 — Tracktrix on every fighter
**Size** S · **Risk** None · **Benefit** Low

Kill-count achievement bonuses only apply `if (player.tracker)` — set by holding the `tracker` item — using the
higher of your own and the account's best count (`al_server.js:1173-1205`). Bscorpion gives +10 mp at 10 and 100
kills, +0.5 dex at 1k and 10k; porcupine gives `dreturn` 0.5 at 100k. We keep `tracker` in slot 0
(`Loot Management.js:11-12`); confirm in-game that Ulric, Myras and Riva each hold one.

---

## Looting

### <a id="l1"></a>L1 — The gold booster swaps for chests that can't benefit
**Size** S · **Risk** Low · **Benefit** Med

Server: opening a chest more than 400px away, or older than 8 minutes, drops the gold multiplier to 1
(`al_server.js:9551-9558`); another map counts as 9,999,999px (`al_common.js:1104`); the opener's multiplier applies
to every member's share (`:9754`). The client keeps other-map chests (`game.js:6614-6636, 6817-6820`).

Ours opens every cached chest at any distance or map (`Loot Management.js:225-230`); `get_num_chests()` counts
other-map chests (`Combat Utilities.js:76-78`). Each `shift` adds 240 ms of `penalty_cd` to the next skill
(`al_server.js:8288`; `al_sfuncs.js:2874-2891`) — ~480 ms of Myras's heal tempo per loot pass, and with
`target_count: 99` (`Global Config.js:125`) it happens mid-fight. Theirs loots only same map, same instance,
≤400px, two per pass, with backoffs on rejection (theirs: `shared.js:4779-4828`).

**Fix.** Swap to the gold booster only when a chest on this map is within 400px; open far or other-map chests
without swapping; use a real `target_count`; optionally drain nearby chests before a disengage/travel goal.

---

## Config

### <a id="c1"></a>C1 — Crab farm spot typo
**Size** S · **Risk** None · **Benefit** Med

`Global Config.js:29` has `crab: [{ map: "main", x: -11840, y: -37 }]`. The crab spawn box on `main` spans x −1353
to −1052, so the point is 10,487px outside it — almost certainly meant −1184.

### <a id="c2"></a>C2 — Other farm spots outside their spawn box
**Size** S · **Risk** None · **Benefit** Low

Every `LOCATIONS` entry was checked against the spawn data. Also outside their box: `rat` (mansion, 430px — worth a
look), `stoneworm` (54px), `mechagnome` (91px), `wolfie` (84px). `bscorpion` (42px) is the camp, intentional.

---

## Where ours is already as good or better

- **Heal maths.** Ours models halved resistance, self-heal ignoring resistance, poison × 0.25 and the partyheal
  level ladder, checked at 0.9966 accuracy; `heal_wanted` heals only when the missing HP justifies it. Theirs calls
  `heal()` at a flat 90%.
- **Partyheal trigger** fires on her own HP below 50% alone; theirs needs two members at or below 50%.
- **Riva's shot choice** prices mana and models armour, piercing, splash, burn and manasteal; theirs takes the
  highest summed damage. **Hunter's mark** (amp × party DPS × min(duration, TTK), priced) beats their 3s-of-DPS rule.
- **Target value.** Our scorer models armour, burn, splash and multishot mana; theirs sorts by fixed priority then
  distance. (The *stickiness* is theirs — see G1.)
- **Attack timing.** `ms_to_next_skill()` subtracts minimum ping on every read; attack-cooldown rejections are 0.4%
  for Ulric. At most ~1% is on the table.
- **Escape triggers.** Theirs has no automatic HP/MP/aggro escape (a dashboard button). Our triggers with party
  broadcast, the trapped-while-travelling case and `Dungeon Escape.js` are stronger.
- **Potion thresholds.** Theirs drinks only below 50% HP / 20% MP, which would zero Myras's aggro cap.
- **Following.** Our followers head for the leader's destination with an 80px leash and a 250/120 hold that
  tightens when someone is in danger; theirs walks to the leader's last known position.
- **Diagnostics.** Error Log, the sink and the DevTools watchdog go well beyond their status phase.
- **Reload model.** We reload the whole tab, so no stale closures survive. Theirs needs generation checks
  everywhere and still leaks: their `parent.socket.emit` and `render_tracker` wrappers are restored only in
  `stop()`, which never runs when the game replaces the iframe — the same bug class as our `add_log` freeze.
- **Socket listeners** on `parent.socket._x`, removed before re-adding, equal their registry.
- **Merchant.** Higher scrolls where they actually pay (fire weapons L7 with `scroll2` +0.9M to +1.7M, pouchbow
  L6–L8, offeringp on grade-2 items such as mshield L3–L7 +0.8M to +62M); massexchangepp first; the offeringp
  grace pass (≈ break-even — keep, don't extend).
- **Cave of Many Dreams.** Theirs still votes by hand and never leaves the final floor automatically.

## Not portable

- The coordinator and everything it owns: the shared combat queue, claims, evidence states, convoy protocol,
  rendezvous, rare-monster control, farm-competition decisions, status/command POSTs.
- Their WASM pathfinder (ALClient / alpathfinder) and geometry fingerprinting — needs a build pipeline.
- The Steam bridge (several characters in one client, realm switching, rewriting `code_cache`).
- The sha256 bundle manifest, the dashboard catalogs and valuation, ALData, Ponty, BankBoi, production journals.
- Mage-based rescue (Blink, Magiport) and classes we don't run (mage, rogue, paladin).
- Deconstruction: of our vendored items only pmaceofthedead dismantles, into one mbones (16g).

## Decisions needed

1. **T5** — re-enable Ulric's commented-out stomp as an emergency stun on Myras's attackers?
2. **R2** — +0 jewellery: compound it or vendor it? The fighters remote-sell it today, so the compound pipeline
   gets almost none.
3. **E2** — `cf273e7` reverted a join-at-full-HP change bundled with kiting. Which half was the problem?
4. **R5** — does Riff carry a computer? If not, seashells may be blocking his exchange queue.
5. **R7** — check `stat_type` on Riva's coat and Myras's shield and gloves before buying scrolls.
