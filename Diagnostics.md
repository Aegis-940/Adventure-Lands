# Diagnostics

How to read what the bot records in `errors.json`, and the mistakes that reading it has already cost.

This exists because on 2026-09-18 four confident conclusions were drawn from `errors.json` and all
four were wrong: not from careless reading, but from not knowing what each bucket captures and
what it silently drops. The `.jsonl` archives and `al_data.sqlite` are described in Design Notes
(`Error Log.js`, `Data Store.py`); this is about the flight recorder.

---

## Reading `errors.json`

`Core Systems/Error Log.js` records in the browser and flushes every 5s to `Tools/Error Sink.py`,
which merges each character's payload into `errors.json` at the repo root. Both ends prune, and
they prune differently. **Absence of evidence in this file is almost never evidence of absence.**

### The buckets

| Bucket | What it is | Client cap | Store cap / pruning |
|---|---|---|---|
| `records` | One entry per distinct message signature, with a count | 200 | last **2 builds**, last **12h** |
| `counts` | Named counters, rolling 24h window (`counts_since`) | **400 keys**, then `counts overflow` | `max()` merge, replaced when `counts_since` advances |
| `timeline` | Ordered `{t, ctx, msg}` events | 80 | last **100**, keyed `(t, msg)` |
| `deaths` | Death snapshots + 10s of vitals + last 15 heals | 6 | last **20**, keyed `t` |
| `samples` | Structured observations by kind | 400 | **250 per kind**, last **2h** |

A record's signature is `ctx + "|" + message with every digit replaced by #`, truncated to 200
chars. Two messages differing only in numbers share one record.

The client's 200-record cap evicts the **least recently seen** signatures on each flush, so a rare
but important signature can be pushed out by noisier ones before it ever reaches the sink. That is
a second way a record can be absent without the event having stopped.

### The traps

**1. `records` are build-scoped.** A record survives only if its `last_build` is one of the last
two builds this character reported under (`RETAIN_BUILDS = 2`). Deploy twice and the evidence for
the bug you were chasing is gone. A missing record does **not** mean the event stopped happening.

**2. `counts` and `records[].count` roll on a 24h window; dividing one by a session length is
still wrong.** The browser restores both from `localStorage`, so a reload continues them rather
than resetting. Since 2026-09-18 each rolls once its window passes 24h — a record resets
`count`/`first`, and the whole `counts` bucket clears and re-stamps `counts_since`. So a counter
spans *at most* a day, never the 67 hours that used to be possible, but it still spans far more
than one session.

**To get a rate you must take a delta between two readings**, and divide by the *elapsed* time
between them, not by the current session. `lag eventloop` is the usable clock: its probe ticks at
10Hz, so `delta(lag eventloop) / 10` is seconds of actual running time, gaps and reloads excluded.

This trap was walked into twice in one session, the second time within minutes of correcting the
first: 190 scare gate evaluations were divided by a 65-minute session and reported as "a panic
every 20 seconds". The true figure, from `records[].first`/`last` on the panic signature, was **one
per 13.4 minutes over 67 hours** — a claim the operator falsified instantly from the game itself.
Ground truth beat the telemetry because the telemetry was read wrong.

**3. A counter can outlive its producer.** Counts restore from `localStorage`, so a counter whose
code was deleted keeps its last value for up to a day and looks like live telemetry (`skill:scare:ok`
did, in 2026-09). **Grep for the producer before trusting any counter.**

**4. Only `event`, `warn` and `error` log lines are recorded.** `log_msg()` records those levels
and nothing at `info` or `debug`, so check a call's level before concluding that a line never fired.
Before 2026-10-16 lines were recorded by their leading emoji, and before 2026-09-18 the `[PANIC]` and
`[BAIL]` lines weren't recorded at all, which made a working panic system look broken for hours.

**5. `where` is the *first* sighting, not the last.** `records[sig].where` is captured when the
signature is first seen and never updated, while `last` and `last_build` do update. A record whose
count is in the thousands has one context snapshot, from whenever it first fired.

**6. `game_response` is filtered too.** Only `exception`, `cant` and `not_ready` responses are
recorded. Every other server rejection is invisible. Since 2026-10-11 even those are `records` only:
they never reach the timeline, so `errors_timeline.jsonl` holds them only up to that date.

**7. Truncation and eviction.** Record messages cap at 400 chars, timeline messages at 160. Over
1.5MB the sink repeatedly drops the oldest quarter of the longest list, in the order
`samples` → `timeline` → `deaths`. A gap in the timeline may be eviction rather than quiet.

### Every capture is capped

No dataset here may grow without a ceiling. Audited 2026-09-18:

| Capture | Ceiling |
|---|---|
| `records` | 200 signatures, LRU evicted; `count`/`first` roll at 24h |
| `counts` | 400 keys, then everything lands in `counts overflow`; values roll at 24h |
| `timeline` | 80 entries, no signature above a quarter of them |
| `deaths` | 6 client / 20 store, rolling — deliberately no age limit |
| `samples` | 400 client / 250 per kind / 2h |
| whole file | 1.5MB, oldest quarter of the longest list dropped |
| DPS meter events | 5-minute window |
| `swap_trick_history` | 30 per monster type |

Two ways an unbounded *key family* can sneak in, both now closed: a counter name
interpolating a raw value (`io flush kb 163` produced **242 of Myras's 326 keys** before it was
bucketed), and one interpolating an error message (`heal:<outcome>` fell back to a 60-char slice).
When adding a counter, the name must come from a fixed set, a bucketed number, or a bounded enum.

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
- **"Why did this branch not run?"**: only a counter someone gave it (see Making failure loud), or
  the decision log's window for the seconds in question (`decisions.jsonl`, and the last 10s on every
  danger record).

---

## Retracted conclusions

Each was drawn from the recorder and was wrong. They are kept so the same reading isn't repeated:

- *"Scare has never fired in 237 panics"*: inferred from absence in `records` (trap 1).
- *"Scare has been firing, here are the counts"*: read from an orphan counter (trap 3).
- *"The equip is not failing, because no failure was logged"*: the `[PANIC]` lines weren't recorded (trap 4).
- *"Myras panics every 20 seconds"*: two cumulative counters summed and divided by one session
  (trap 2). The real rate was one per 13.4 minutes across 67 hours, and the user falsified the claim
  from the game before the telemetry was re-read.
- *"The 200Hz loops were costing `cc`"*: plausible and unchecked. Observed cc peaks were 72, 61 and
  42 against a ceiling of 125.
- *"Removing the self partyheal is an efficiency win"*: `partyheal` ignores heal power (a flat 800 at
  her level) but has its own 200ms cooldown beside the attack timer that gates `heal`. It's a second
  healing channel, not a worse first one. Reverted in `2703d5f`.
- *"Equips are rate-limited to one per 2s"*: the metronomic `not_ready` replies were potions.
  Equipment has no cooldown; only an explicit `not_ready` for an equip, for the ms it quotes, is real.

---

## Making failure loud

**A failure that isn't counted is a failure you won't find.** Counting is cheaper than guarding, and
unlike a guard it doesn't destroy the evidence for its own cause.

- The kernel already catches and reports: every `every()` body runs through `run_loop` and every
  socket handler through `guarded()`, both into `catcher`, which records it and counts it in
  `al_loops()`. A try/catch inside them only adds a way to lose the error. Lint counts empty catches
  (`empty_catch`) and `console.error` calls (`console_error`) on the ratchet, so neither can grow.
- To record why a branch didn't run, prefer `errlog_count("<subsystem> <what was refused> <why>")`.
  The name must come from a fixed set, a bucketed number or a short enum: a counter name with a raw
  value in it (`io flush kb 163` once made 242 of Myras's 326 keys) or an error message in it is an
  unbounded key family.
- When a root cause is fixed, delete the guard that compensated for it in the same change.
