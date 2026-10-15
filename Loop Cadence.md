# Loop Cadence

For each loop the bot runs: how often it ticks, and why that rate matches how urgent its work is.

**The principle.** A loop should tick as fast as its *decision* needs to be fresh, and no faster.
Running faster than that does not make the bot better — it spends `character.cc`, which gates
looting and equipment resolution at 125, and it lets the fast loop win races against slower ones
that matter more.

**Measuring.** `errlog_beat`/`errlog_time` already record `lag <loop>` per loop. Normalising a
loop's total against `lag eventloop` gives its rate relative to elapsed time, which is comparable
across characters even though the raw counters are `max()`-merged peaks from different sessions.

---

## Inventory

Every loop the four characters run, from `al_loops()` on the live build 4327aae (2026-10-16). Every loop goes through the scheduler's `every()`, so `al_loops()` in the console is always the current list, with runs, last lag and last error for each; none had an error. Loops that exist only while something is in progress are not listed: `move monitor` (200ms, one per journey), `wait for death <mob>` (500ms, in a dungeon) and `metrics dashboard` (1000ms, while 📊 is open).

| Loop | Kind | ms | Runs on | Note |
|---|---|---|---|---|
| `main_loop` | automation | 100 | fighters | the main tick |
| `stand_loop` | automation | 100 | Riff | |
| `loop_controller` | automation | 250 | Riff | the merchant task loop |
| `state_cache_loop` | automation | 500 | all four | |
| `dreams watch`, `dungeon entities`, `survey_tick` | automation | 1000 | fighters | |
| `opportunistic_actions_loop` | automation | 1000 | Riff | |
| `dungeon rejoin watch`, `remote_sell_items` | automation | 5000 | fighters | |
| `send updates` | automation | 20000 | all four | |
| `action_loop` | combat | 5 | Riva | §3 |
| `action_loop` | combat | 10 | Ulric, Myras | backs off through `next_action_delay()` |
| `equipment_manager_loop` | combat | 25 | fighters | §4 |
| `skill_loop` | combat | 40 | fighters | §1 |
| `zap_loop` | combat | 40 | Myras | zap's own 200ms cooldown |
| `potion_loop` | safety | 50 | all four | §2 |
| `maintenance_loop` | safety | 2000 | fighters | |
| `periodic reset` | safety | 60000 | all four | the x:55 reload check |
| `bscorpion_kill_logger_loop` | telemetry | 250 | Ulric | |
| `damage windows` | telemetry | 250 | all four | |
| `danger_tick` | telemetry | 250 | fighters | |
| `errlog lag probe` | telemetry | 500 | all four | |
| `boss profile`, `errlog vitals`, `flush damage windows`, `heal window`, `metrics live feed` | telemetry | 1000 | all four | |
| `decision sample`, `ledger` | telemetry | 1000 | fighters | |
| `dungeon telemetry` | telemetry | 2000 | fighters | |
| `errlog flush` | telemetry | 5000 | all four | |
| `prune pid weapons` | telemetry | 10000 | all four | |
| `cc report` | telemetry | 20000 | Ulric | |
| `errlog heartbeat` | telemetry | 60000 | all four | |
| `widget ccmeter` | ui | 200 | all four | |
| `party frames`, `widget bosscontribution`, `widget dpsmeter` | ui | 250 | all four | |
| `pause button`, `widget goldtimer`, `widget xptimer` | ui | 500 | all four | |
| `kill rates`, `prune dps events` | ui | 1000 | all four | |
| `metrics sample` | ui | 5000 | all four | |

The sections below record why the combat and safety rates are what they are.

---

## 1. Ranger `skill_loop` ran at 200Hz — FIXED (2026-09-18)

Measured, normalised against `lag eventloop`:

| | skill_loop | action_loop |
|---|---|---|
| Myras | 0.79× | 1.64× |
| Ulric | 0.80× | 1.68× |
| **Riva** | **3.52×** | 2.22× |

Her skill loop ran **4.4× more often** than the other two characters'. The warrior and healer
default to `TICK_RATE.skill` (40ms); the ranger defaulted to `5`. The `else` branch did back off
(100/20/5 by `min_ms`), but the hot path — `min_ms < ping/10`, meaning a skill is ready or nearly —
fell straight through to the 5ms default. So whenever `huntersmark` or `supershot` was ready but
*not fireable* (`skill_pays`, `affordable`, `above_hp_pct` failing), she re-evaluated
`mark_value`/`supershot_value` two hundred times a second.

Worse, that path called `change_target(target)` unconditionally, and `change_target` **sends to the
server** — so it was network traffic at up to 200Hz, not just local cost.

Fixed by defaulting to `TICK_RATE.skill` like her siblings, and sending `change_target` only when
the target id actually changes. `parent.ctarget` is not referenced anywhere in this codebase, so
the guard tracks the last sent id locally rather than depending on an unverified game internal.

## 2. `potion_loop` ran at 100Hz — FIXED (2026-09-18)

`setTimeout(potion_loop, used_potion ? 2050 : 10)`. The potion cooldown is ~2050ms, so between
drinks it spun **two hundred times**, doing two subtractions and two threshold comparisons each
time, to catch a crossing it could catch at a twentieth of the rate. HP and MP only change on
server ticks anyway.

Now `POTION_POLL_MS = 50`. Worst-case reaction goes from ~10ms to ~50ms, against a ~225ms ping —
so total reaction latency moves from roughly 235ms to 275ms, in a number dominated by the network.
**If survivability ever looks worse, this is one constant to put back.**

## 3. Ranger `action_loop` at 5ms — LEFT ALONE

Warrior and Healer default to 10ms, the Ranger to 5ms, with no evident reason. Aligning it would
halve the tick rate of her damage loop for a 5ms latency change — a small reward against touching
the loop that produces her DPS, so it is recorded rather than changed. `next_action_delay()`
already handles the case where an attack is actually pending.

## 4. `equipment_manager_loop` at 25ms — now justified, and was not before

Worth recording because it inverted. This morning it was the fastest loop in the system doing the
least urgent work, and its speed was actively harmful: it won every race against `panic_check` at
250ms, which is what produced the orb ping-pong.

Since panic moved *into* the resolver, that same 25ms cadence is what makes the panic orb land in a
median of **31ms** — three to four times faster than the old path, which issued the equip from
`panic_check` on the 100ms main tick. The number did not change; what the loop is responsible for
did.

The lesson generalises: a cadence is only wrong relative to what the loop decides. Fix ownership
first, then judge the rate.

---

## Method

1. Enumerate every loop: `al_loops()` in the console lists each one with its kind, rate, runs, last
   lag and last error (since 2026-10-15 every loop goes through the scheduler's `every()`).
2. For each, find its *default* delay — not the backoff branches. The default is what it does on
   the hot path, and the hot path is where the cost is.
3. Normalise `lag <loop>` against `lag eventloop` to get a comparable rate per character.
4. Ask what decision the loop makes and how stale that decision may safely be. Compare.
