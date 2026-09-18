# Loop Cadence

A worklist. For each loop the bot runs: how often it ticks, and whether that rate matches how
urgent its work actually is.

**The principle.** A loop should tick as fast as its *decision* needs to be fresh, and no faster.
Running faster than that does not make the bot better — it spends `character.cc`, which gates
looting and equipment resolution at 125, and it lets the fast loop win races against slower ones
that matter more.

**Measuring.** `errlog_beat`/`errlog_time` already record `lag <loop>` per loop. Normalising a
loop's total against `lag eventloop` gives its rate relative to elapsed time, which is comparable
across characters even though the raw counters are `max()`-merged peaks from different sessions.

---

## Inventory

| Loop | Cadence | Verdict |
|---|---|---|
| `action_loop` (Warrior, Healer) | 10ms, backs off via `next_action_delay()` | ok |
| `action_loop` (Ranger) | **5ms** | asymmetric — see below |
| `skill_loop` (Warrior, Healer) | `TICK_RATE.skill` 40ms | ok |
| `skill_loop` (Ranger) | **5ms, no backoff on the hot path** | **fixed** |
| `potion_loop` | **10ms** between drinks | **fixed** |
| `equipment_manager_loop` | `TICK_RATE.equipment` 25ms | now justified — see below |
| `main_tick` | `TICK_RATE.main` 100ms | ok |
| `maintenance_loop` | 2000ms | ok |
| `monitor_movement` | 200ms | ok |
| `state_cache_loop` | 100ms | ok |
| `prim_farm_loop` / `prim_orbit_loop` / kill logger | 100 / 80–500 / 250ms | ok |
| Merchant task loop / upkeep | 250 / 1000ms | ok |
| Combat Sampling tickers | 250 / 1000 / 10000ms | ok |
| Error Log vitals / lag probe | 1000 / 100ms | ok |
| `anniversary_loop` | 2000ms, 400ms while travelling | ok |

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

1. Enumerate every loop: self-rescheduling `setTimeout`, `setInterval`, and `while (true)` with an
   `await delay()`.
2. For each, find its *default* delay — not the backoff branches. The default is what it does on
   the hot path, and the hot path is where the cost is.
3. Normalise `lag <loop>` against `lag eventloop` to get a comparable rate per character.
4. Ask what decision the loop makes and how stale that decision may safely be. Compare.
