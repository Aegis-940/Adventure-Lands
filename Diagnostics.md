# Diagnostics

How to read what the bot records, what we currently know, and the work outstanding on making
failures visible.

This exists because on 2026-09-18 four confident conclusions were drawn from `errors.json` and all
four were wrong — not from careless reading, but from not knowing what each bucket captures and
what it silently drops. The first section is the antidote.

---

## Reading `errors.json`

`Core Systems/Error Log.js` records in the browser and flushes every 5s to `Tools/Error Sink.py`,
which merges each character's payload into `errors.json` at the repo root. Both ends prune, and
they prune differently. **Absence of evidence in this file is almost never evidence of absence.**

### The buckets

| Bucket | What it is | Client cap | Store cap / pruning |
|---|---|---|---|
| `records` | One entry per distinct message signature, with a count | 200 | last **2 builds**, last **12h** |
| `counts` | Monotonic named counters | none | never pruned, merged with `max()` |
| `timeline` | Ordered `{t, ctx, msg}` events | 80 | last **100**, keyed `(t, msg)` |
| `deaths` | Death snapshots + 10s of vitals + last 15 heals | 6 | last **20**, keyed `t` |
| `samples` | Structured observations by kind | 400 | **250 per kind**, last **2h** |

A record's signature is `ctx + "|" + message with every digit replaced by #`, truncated to 200
chars. Two messages differing only in numbers share one record.

The client's 200-record cap evicts the **least recently seen** signatures on each flush, so a rare
but important signature can be pushed out by noisier ones before it ever reaches the sink. That is
a second way a record can be absent without the event having stopped.

### The seven traps

**1. `records` are build-scoped.** A record survives only if its `last_build` is one of the last
two builds this character reported under (`RETAIN_BUILDS = 2`). Deploy twice and the evidence for
the bug you were chasing is gone. A missing record does **not** mean the event stopped happening.

**2. `counts` are lifetime running totals, and dividing one by a session length is wrong.** The
browser restores `counts` from `localStorage` on start, so a reload continues them rather than
resetting; the sink then merges with `max(incoming, stored)` so the value can never go down. A
counter therefore spans every session since localStorage was last cleared — often days.

**To get a rate you must take a delta between two readings**, and divide by the *elapsed* time
between them, not by the current session. `lag eventloop` is the usable clock: its probe ticks at
10Hz, so `delta(lag eventloop) / 10` is seconds of actual running time, gaps and reloads excluded.

This trap was walked into twice in one session, the second time within minutes of correcting the
first: 190 scare gate evaluations were divided by a 65-minute session and reported as "a panic
every 20 seconds". The true figure, from `records[].first`/`last` on the panic signature, was **one
per 13.4 minutes over 67 hours** — a claim the operator falsified instantly from the game itself.
Ground truth beat the telemetry because the telemetry was read wrong.

**3. Some counters have no producer.** `skill:scare:ok`, `skill:partyheal:ok` and friends come from
a `use_skill` wrapper that no longer exists in the source. Nothing ever decrements them, so they
look like live telemetry. **Grep for the producer before trusting any counter.**

**4. `game_log` is filtered by prefix.** The wrapper records a message only if it starts with
`⚠️`, `❌`, `🛑` or `[`. Anything else — `Using Scare!`, `✅ Panic over: …`, every informational
line — is never recorded at all. The `[` case was added on 2026-09-18; before that, all five
`[PANIC]` and `[BAIL]` diagnostics were silently dropped, which is what made a working panic system
look broken for several hours.

**5. `where` is the *first* sighting, not the last.** `records[sig].where` is captured when the
signature is first seen and never updated, while `last` and `last_build` do update. A record whose
count is in the thousands has one context snapshot, from whenever it first fired.

**6. `game_response` is filtered too.** Only `exception`, `cant` and `not_ready` responses are
recorded. Every other server rejection is invisible.

**7. Truncation and eviction.** Record messages cap at 400 chars, timeline messages at 160. Over
1.5MB the sink repeatedly drops the oldest quarter of the longest list, in the order
`samples` → `timeline` → `deaths`. A gap in the timeline may be eviction rather than quiet.

### Which bucket answers which question

- **"Did this ever happen?"** — `counts`, if a producer exists in the current source. Otherwise
  `records`, and only within the build window.
- **"In what order?"** — `timeline`. It accumulates across reloads in the store, unlike the
  browser's own ring.
- **"How often?"** — a *delta* between two `counts` readings over `delta(lag eventloop)/10`
  seconds. Never a raw `counts` value over a session length. For a message rather than a counter,
  `records[].count` over `first`..`last` is a real rate over a real window.
- **"What was the state?"** — `deaths[].leading_up_to_it` (1Hz vitals), `deaths[].recent_heals`,
  and `samples`.
- **"Why did this branch not run?"** — nothing, usually. That is the gap the instrumentation pass
  below is meant to close.

---

## What we know

Each entry says how it was established, so it can be challenged rather than inherited.

### Confirmed and fixed

**Equipment rules fought panic over the orb slot.** `resolve_equipment()` runs every 25ms at
priority 20; panic claims at 100 but releases between episodes, and the rules resolver reclaimed
the slot on its next tick. Riva showed `panic -> orb` 19,778 against `orb -> orb` 19,211.
*Method: `orb_equip` records, before and after.* After the fix: 4 and 4 over 165s — one swap per
panic. Fixed in `c59575f` (rules stand down while `panicking`).

**The healer released party panic on any disabled tick.** `healer_on_disabled()` cleared panic
whenever `is_disabled(character)` was true, so panic flapped on and off mid-fight.
*Method: death timeline showed panic toggling at t-8472/-8054/-7986/-159.* Now releases only on
`character.rip`. Fixed in `c59575f`.

**About one in five of Riva's cupid heals was thrown away.** `mainhand_intent()` reports a weapon
swap the moment it is requested, so the heal branch fired while the old bow was still worn and the
server rejected it as `no_pvp` — 3,135 against 14,485 attempts.
*Method: `cupid heal raced the bow swap` counter against `await cupid <250`, same bucket type.*
The heal branch now checks the worn mainhand; the attack branch still uses the intent. Fixed in
`ab3f4cb`.

**`game_log`'s prefix filter hid the panic diagnostics.** See trap 4. Fixed in `0485135`.

**Panic and scare work.** The probe in `panic_check` reports
`scare blocked cd=true can_use=false jacko=true orb=jacko`, count **1** per character over 15
minutes, while Riva panicked 11 times in that window. The jacko equips correctly and the gate
refuses only on scare's own 5s cooldown. *Method: `errlog_count` probe, which bypasses `game_log`
entirely.* Earlier claims that scare never fired were artefacts of traps 1, 3 and 4.

### Retracted

Recorded so they are not repeated:

- *"Scare has never fired in 237 panics"* — inferred from absence in `records` (trap 1).
- *"Scare has been firing, here are the counts"* — read from `skill:scare:ok`, an orphan counter
  (trap 3).
- *"The equip is not failing, because no failure was logged"* — `[PANIC]` lines were filtered
  (trap 4).
- *"Myras's gloves swap widened Riva's cupid swap window"* — different characters. The equip
  cooldown is per-character; Riva's channel is idle at one bounce per 25.5s.
- *"Myras panics every 20 seconds"* — summed two cumulative counters and divided by one session
  (trap 2). Real rate: one per 13.4 minutes across 67 hours. Falsified by the operator from the
  game before the telemetry was re-read.
- *"The 200Hz loops were costing `cc`"* — plausible and unchecked. Observed cc peaks at 72, 61 and
  42 against a ceiling of 125. The `change_target` spam was real; the `cc` cost was not.
- *"Removing the self partyheal is an efficiency win"* — `partyheal` ignores heal power entirely
  (flat 800 at her level, 400 mp) but runs on its own 200ms cooldown beside the attack timer that
  gates `heal`. It is a second healing channel, not a worse first one. The efficiency argument only
  holds when mana binds, and hers never does — she died with 6,070 of 7,220 mp. Reverted in
  `2703d5f`.

### Open

**Why the healer dies at the plantoid camp with the guard working.** Panic fires, scare fires, and
she still died at 11:47 and 11:48 on 2026-09-18 — full HP to dead in five seconds against ~3,500
incoming. Not yet distinguished: plantoids re-acquiring inside scare's 5s cooldown, immediate
re-pull via `effective_aggro_cap()`, or too little runway at a 40% trigger.

**Panic frequency is itself the symptom.** Panic is meant to be uncommon. Myras panicked four times
in the 21 seconds before dying. Whatever the guard does once it fires, needing it that often is the
defect.

**Myras's equip channel runs at roughly 133% of capacity.** The gold-gloves swap while looting is
by design — two equips per 3s loot cycle against a server that accepts one per 2s. Her `not_ready`
responses arrive at a metronomic 2.07s, which is what saturation looks like. Not a bug; recorded
so it is not rediscovered as one. Riva's channel, by contrast, is idle.

---

## Making failure loud

The codebase currently has **157 `catch` blocks, 38 of them completely empty, and 7 `errlog_count`
call sites.** Every bug above that took hours to find was silent; the one that took ninety seconds
had been given a name by whoever wrote it.

The principle: **a failure that is not counted is not a failure you will find.** Counting is
cheaper than guarding, and unlike a guard it does not destroy the evidence for its own cause.

### Known silent paths

- `resolve_equipment_bail_reason()` computes a precise reason the resolver is not running, and the
  caller discards it: `if (resolve_equipment_bail_reason()) return;`
- `batch_equip()` returns `0` for both "nothing needed doing" and "the item was not in the bags".
- `equip_apply()` and `equip_apply_slots()` return `false` on several paths; most callers ignore
  the return value.
- `equip_claim()` returns `null` when outranked; callers treat that as an ordinary skip.
- `wait_until_equipped()` throws on timeout into a `[PANIC]` log — visible only since `0485135`.
- 38 empty `catch (e) { }` blocks.
- Guard clauses throughout that `return` without recording why.

### Order of work

1. Equipment path first — it is where we are blindest and where two of today's bugs lived.
2. Then panic and combat loops.
3. Empty catches last; they are the most numerous and the least likely to be load-bearing.

Prefer `errlog_count("<subsystem> <what was refused> <why>")`. Keep the cardinality low enough that
the bucket names stay readable — booleans and short enums, not numbers, which the signature
normaliser would collapse anyway.

### Paying guards off

Guards accumulate because nothing removes them. When a root cause is fixed, delete the guard that
was compensating for it in the same change. Today's net was three lines changed and two removed;
that is the shape to aim for.
