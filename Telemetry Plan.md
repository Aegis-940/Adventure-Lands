# Telemetry Plan

The telemetry is how the party gets min/maxed, so it has to be **complete** (every number a decision needs is recorded), **correct** (each number checked against a second source), and **sized** (every file has a budget and a retention, and each quantity has one owner). Nothing is cut unless it is truly useless: a recorder nobody reads gets a reader, unless there is no question it could answer.

This plan comes from a four-part audit on 10-16 (the sink and its readers, the in-game recorders, the error log and watchdog, and the archived data itself). Every finding marked ✔ was checked against the code by hand as well.

## Status

| Phase | Title | Changes how the party plays | Status |
|-------|-------|------------------------------|--------|
| T0 | Data being lost or corrupted now | none | **done** 2026-10-16 |
| T1 | `compare` and the Data Store | none | not started |
| T2 | The error log and how records reach the sink | none | T2.6 **done** 2026-10-16 |
| T3 | Removing the watchdog | none | **done** 2026-10-16 |
| T4 | Sizes and retention | none | not started |
| T5 | What isn't recorded yet | none | not started |
| T6 | Reports: making the data answer questions | none | not started |
| T7 | Close-out | none | not started |

Nothing here changes a decision the bot makes, so no phase needs a `compare`. Each fix is instead checked against a second source (listed with it), and each commit runs lint, `load` and `check` as usual. The hit handlers are on the hot path, so any change there is also checked in `cc_report` for call cost.

---

## Where it stands

Data leaves the page through one door: `Core Systems/Error Log.js` pushes its rings to the sink every 30s, and the sink writes the archives that `Tools/Data Store.py` ingests into `al_data.sqlite`.

| File | Size | Growth | Read by |
|------|------|--------|---------|
| `snapshots.jsonl` (+ `.old`) | 48 MB + 210 MB | **~100 MB/day** | `Harness.js promote` only (26 fixtures ever promoted) |
| `errors_timeline.jsonl` | 103 MB since 09-29 | ~4.5 MB/day, never trimmed | Data Store keeps `death` and `bscorpion_kill`, ~2% of lines |
| `boss_profiles.jsonl` | 28 MB | 4.4 MB/day | Party Model (latest gear); its SQLite table is never queried |
| `damage.jsonl` | 16 MB | ~17 MB/day | `weapons`, `status` |
| `al_data.sqlite` | 61 MB | ~25 MB/day | every report |
| `ledger.jsonl` | 3.7 MB | 0.75 MB/day | `compare`, `survey`, `status`, `pulls`, Party Model |
| `cc_report.jsonl` | 1.7 MB | 1.9 MB/day | **nothing** |
| `decisions.jsonl` | 0.9 MB | 0.9 MB/day | `skills`, `weapons`, `pulls`, `time`, `status` |
| `heal.jsonl` | 0.7 MB | 0.3 MB/day | **nothing** |
| `target_choice.jsonl` | 47 KB | small | **nothing** |
| `danger.jsonl` | 67 KB | small | `status`, `compare`, `before-danger`, `pulls` |
| `tracker.jsonl`, `survey.jsonl` | small | daily / idle since 10-12 | Party Model / `survey` |
| `errors.json` | 1.4 MB, **at its ceiling** | flat | `status` (last heartbeat, last death), people |
| `watchdog.jsonl` | 2.4 MB | 0.2 MB/day | nobody |

What checked out: the ledger's three fighters' windows line up (within 3s), `chest_gold` agrees across the three to 0.2% over 48h, ledger kills match the daily tracker to 97–100% (the gap is the lost windows below), party damage over kills × scorpion HP comes to 1.009, and every decision window pairs with its ledger window.

---

## T0. Data being lost or corrupted now

1. **✔ Every reload drops the open ledger and decision window.** `kernel_boot()` adds `kernel_teardown` as the first `pagehide` listener (`Kernel.js:45`), before any boot step registers `ledger_flush` (`Farm Ledger.js:235`) or the lifecycle beacon (`Error Log.js:739`). `release_listeners()` removes those mid-dispatch, and a listener removed during dispatch is never called. Since build `4032313` (10-15 08:51) no window shorter than 295s has been written, the last `pagehide` lifecycle record is 10-15 09:01, and each fighter has lost 4.0–4.3% of its time (110–390s holes at each reload). **Fix:** add the teardown listener after the boot steps have run, so it is the last `pagehide` listener. Check: a short window appears at the next reload, and lifecycle `pagehide` records return.
2. **✔ Phantom deaths at boot.** `_ledger_rip`, `_danger_rip` and `_errlog_was_rip` all start `false`, so a character that loads dead records a death with no killer. 6 of the 11 deaths in `danger.jsonl` have `killer: null` and no damage, all within 30s of a reload (10-14 23:55:56, 10-15 09:02:13). **Fix:** seed each from `character.rip` at boot. Check: no killerless death at the next reload. Also worth reading: whether some of those reloads really did get the party killed (Riva died to mummies at 23:55:36, 20s before the pair).
3. **✔ Burn is credited to the wrong weapon.** A burn tick carries no `pid`, so `damage_sampler()` files it under whatever is worn when the tick lands (`Combat Sampling.js:290`). Myras's `lmace/mshield` (no fire) shows burn/direct 0.70, Ulric's `candycanesword` 2.51, and `burn_mult` reaches 8033. **Fix:** remember which weapon set the burn on each target (the hit that applies `burned`), and credit the target's ticks to it. Check: non-fire weapons show zero burn.
4. **Burn-only windows are thrown away** (`if (w.direct > 0)`, `Combat Sampling.js:89`), and **per-weapon `secs` is wall time**, so two weapons swapped within a window both claim the whole window (summed `secs` over 20.7h: Ulric 36.8h, Myras 25.8h). **Fix:** count the seconds each weapon is actually worn (the decision log already does this as `worn_s`), and keep burn-only windows. Check: summed `secs` equals time.
5. **✔ Boss profiles carry the game server as `home`.** `home: character.home` (`Boss Profiler.js:312`) is the game's home server (`USIV`, `ASIAII`), and it overwrites the farm home the record stamp sets. **Fix:** drop the field so the stamp's `home` stands (the server is already in `server`).
6. **✔ Snapshots have no build.** The `build_sha` regex looks for the old jsDelivr `@sha/` URL (`Error Log.js:640`), so it has been null since local serving and the harness falls back to all zeros. **Fix:** read the SHA from `/code/<sha>/`, as `_errlog_build()` does.
7. **Potions are counted as sent, not drunk** (`Maintenance.js:30`). **Fix:** count on the server's confirmation (`pot_timeout` in the reply, or the potion stack going down). Check: drinks per 5 minutes ≤ 147.
8. **Damage we take from our own hits is missed.** Decision Log and Danger Log count a hit only when `id === me`, so damage from a monster's `dreturn` never shows (a reflected shot is re-fired at us and already lands as a hit on us). **Fix:** count `dreturn` on our own hits as damage taken from that monster. `avoid` also counts as a miss, as Boss Profiler already does.
9. **The bscorpion kill logger counts despawns.** Any scorpion that leaves `parent.entities` counts as a kill, including one that walks out of view (`Bscorpion.js:306`). **Fix:** count on `kill_credit` or a killing `hit`. Check: against ledger kills per hour.
10. **`players_nearby` has been 0 in every window since 10-14.** Checked live on 10-16: the count is right (it sees the party and excludes it), and no stranger has been at the bscorpion box. Nothing to fix.

## T1. `compare` and the Data Store

1. **✔ `compare` drops every window with a death.** A window counts only if the fighter spent 95% of it at the spot (`Data Store.py:817`), and a death takes them off it, so 0 of 8 bscorpion death windows pass. A build that gets people killed has its worst windows removed, and the "read danger.jsonl" branch can never fire. **Fix:** count time dead or walking back from a death at the spot as at-spot time, and show deaths and close calls per hour on both sides as a verdict metric.
2. **Gold is 4/3 of party gold.** `spot_gold + spot_chest_gold` adds a fighter's share to the whole chest; `survey` and `status` use `chest_gold` alone. **Fix:** one definition, `chest_gold` (party gold), everywhere.
3. **It can't see a change under ~5%.** At 12 windows a side, 2 SE is about 4.7% on Myras's kills/h. **Fix:** print the smallest change each run could detect, so "same" says how sure it is, and pool the three fighters' XP (they correlate at 0.52) rather than voting on each.
4. **The default tier is `neutral` (6 windows),** but CLAUDE.md asks for `behaviour` (12). Make `behaviour` the default.
5. **The settings warning is noisy.** It compares merchant-only toggles and skips windows from before settings were stamped. Compare only the settings a fighter reads.
6. **`/api/status` runs a full ingest every 15s** while the status page is open, and the sink re-imports Data Store per request. Ingest on the sink's 15-minute timer only.
7. **Every sample table stores its columns and the raw JSON again** (damage: 19.6 MB in SQLite against 15.6 MB as jsonl). Keep the columns; drop `raw` where the columns cover it.
8. **Ingest is fragile.** A file that rotates and then grows past its old offset is silently skipped, and one SQLite error aborts the whole ingest. Track each file's identity as well as its offset, and catch per file.
9. **References to the deleted Overhaul Plan** (`Data Store.py` lines 13, 17, 19, 63, 74, 540, 780; `Error Sink.py` 79, 194) are rewritten to say what each command answers.

## T2. The error log and how records reach the sink

1. **Every push resends everything.** Each 30s POST carries the whole of every ring (~345 KB), and the sink rewrites the 1.5 MB `errors.json` on each one (about 8 a minute, ~1.7 GB/day of rewrites, and 16 `WinError 5` rename failures that each lost a push). **Fix:** push only what the sink hasn't acknowledged. The sink answers with its high-water mark per lane, and the page drops what has been delivered.
2. **The shared 400-entry sample ring can push kept samples out** (damage, heal, cc_report) before they're delivered, especially during the 5-minute backoff. **Fix:** with delivery acknowledged, the ring holds only what is undelivered; give the kept kinds their own budget.
3. **✔ The sink never resets counters.** `counts_since` isn't in the push body (`Error Log.js:510-521`), so the sink `max()`-merges counts forever (Myras has 403 keys, `io flush kb` buckets from 09-18 are still there), and a record whose count reset after 24h is rejected as lower. **Fix:** send `counts_since`, and accept a record with a newer `first`. Correct Diagnostics.md's two traps that assume the reset works.
4. **localStorage holds far more than it needs to.** The page saves its whole state every 5s (128 KB–1 MB per character, sharing one ~5 MB origin quota with every other `AL_*` key), and a failed write goes unnoticed. **Fix:** save only what hasn't reached the sink, plus `records` and `counts`, which must survive a reload. Count a failed write.
5. **Noise on the timeline.** Quiet refusals (30% of recent volume) go on the timeline as well as being counted, and `orb_equip`, a 09-07 diagnostic that fires on every equip of a set containing an orb, has 3,500 records on Myras alone. **Fix:** quiet refusals are counted, not timelined. Retire `orb_equip`; the decision log already records every gear change.
6. **Heartbeats are half of `errors.json`** (`alive`, ~760 KB). Once the watchdog goes (T3), keep only the last beat.
7. **Code that never runs.** The `disconnect` capture has never been recorded once (the iframe dies before it can save), and 15 of Error Log's 21 empty catches sit inside code that already catches (`every()`, `guarded()`, `storage_raw_write`) or around bodies that can't throw. Remove them and lower the baseline.
8. **Diagnostics.md is wrong in four places**: the push interval (30s, not 5s), the event-loop probe rate (2Hz, not 10Hz, so `delta/10` undercounts by 5×), and the bucket and eviction lists, which leave out `alive` and `archive`.
9. **A real error to confirm gone.** `socket hit rime_band_logger: Cannot read properties of undefined (reading 'abilities')` fired 620 times, last at 10-15 09:19.

## T3. Removing the watchdog

The watchdog has reloaded a window 52 times: 50 on 10-08, every ~5 minutes for 12 hours, because Riff's window was showing a docs page; once more for the same reason on 10-10; and once arguably as a rescue (10-11 23:32, though Ulric was still logging). The game's own reload on disconnect works: 28 of the 30 single-character game reloads since 10-11 had the bot running again in 4–18s.

1. **Uninstall the logon task** with `Install Watchdog.ps1 -Uninstall`, which drops the DevTools port but **keeps the anti-throttling flags** (timers in hidden windows need them). Then delete `Watchdog.py` and `Install Watchdog.ps1`, keeping the flags' setup where the sink installer or a note in Design Notes records it.
2. **Remove what only served it:** `main_beat()`/`main_beat_at` (Global Config, Character Runner, Merchant Upkeep), the `alive` heartbeats (to the last beat only, T2.6), and the `network` pseudo-character in `errors.json`. `Code Loader.js`'s beacons stay (changing it means re-pasting all four slots), and so does the sink's lifecycle merge that receives them.
3. **The two reloads nothing recovered** (read 10-16). 10-13 10:20 wasn't one: the loader evaluated and Ulric was alive 23s after the reload. 10-14 04:09 was the old loader, which logged `started` and never resolved the commit from GitHub for 42 minutes. Since 10-15 it reads `/code/main` from this PC with a 5s timeout, retries forever and beacons every failure, so that hang can't recur silently.
4. **Keep the live probe.** The DevTools port stays open (the anti-throttling flags and the port are set together), and my read-only probes borrow `Watchdog.py`'s WebSocket client. A small `Tools/Probe.py` (evaluate an expression in every character page and print the result) replaces it.
5. **Docs and memory:** CLAUDE.md, Architecture, Design Notes and Diagnostics drop the watchdog; the memory notes that say "read watchdog.jsonl first" are rewritten.

## T4. Sizes and retention

Each file gets a budget. The targets below assume the fixes above.

1. **Snapshots: kept as they are, trimmed to 7 days** (the user's call, 10-16). The triggers and contents stay; the sink drops records older than 7 days instead of rotating at 200 MB into a `.old` it overwrites. At ~100 MB a day that holds about 700 MB.
2. **Boss profiles: the three fighters each record** (the user's call, 10-16). Riff stops writing them (he is never on the boss), which removes the fourth copy. Gear stays as it is.
3. **The timeline: trim it to 7 days.** Move `death` (already in `danger.jsonl`) and the kill times (to their own lane, after T0.9) out of the timeline first, then trim it on the sink to the last 7 days. Doing this the other way round would wipe the status page's death and kill-time history.
4. **damage.jsonl, ~17 MB/day.** About 30% of each line is the record stamp (settings, build, home, map, goal, encounters). **Fix:** a 60s window instead of 15s, with the stamp kept; measure how far that cuts it before going further.
5. **SQLite:** drop the duplicated `raw` (T1.7), and drop or use the tables nothing queries (`boss_profiles`, `tracker`, `tracker_monsters`, `heal_windows`, `target_choices`, `cc_reports`) as T6 decides.
6. **`errors.log`** rotates only when the sink starts. Rotate it while running. The ~400 "slow POST" lines an hour should mostly go once pushes are incremental (T2.1); if they don't, find where the 4.6s is spent.
7. **The ledger's `gear` signature** is 40% of each record and rarely changes. Write it only when it changes.

## T5. What isn't recorded yet

These are the numbers the min/maxing needs that no recorder captures. Each one gets a lane and a report (T6).

1. **Loot.** No drop is recorded per chest, monster or luck level; items live only in Session Metrics, in memory. Myras's luck gear can't be valued without it. **Add:** a loot lane, one row per chest (monster, items with quantities, gold, the looter's `luckm` and `goldm`).
2. ~~The economy~~ (not pursued, the user's call, 10-16).
3. **Mana budget.** Only cast spend is recorded. **Add:** per window, mana in (potions, manasteal) and out (attacks, each skill), so a fighter's spare mana is a measured number.
4. **Attack uptime.** Neither `character.frequency` nor time with a target in range but no attack is recorded. **Add:** both to the decision window, so confirmed attacks against possible attacks measures how much DPS is lost to movement, refusals and gaps.
5. **Downtime.** Once T0.1 is fixed, a gap between windows means a character was down. **Add:** a report per character per day of downtime and its cause (reload, death, disconnect).
6. **Call cost for every fighter.** `cc_report` covers Ulric only; Myras and Riva record only `limitdc`. Sample all three.
7. **Dungeons** leave nothing lasting (their samples age out of `errors.json` in 2 hours). **Add:** one record per run (duration, outcome, kills, deaths, loot). Low priority while no dungeon runs.

## T6. Reports

Data nobody reads is only worth keeping if a question needs it. Each lane gets a `Data Store.py` command, and the status page shows the headline numbers.

1. **`heals`** from `heal.jsonl`: Myras's heal delivered, predicted and overheal by kind.
2. **`cc`** from `cc_report.jsonl`: call cost by type per fighter, against the `limitdc` line.
3. **`targets`** from `target_choice.jsonl`: how often the scorer's pick traded against the alternatives. If no question needs it once the report exists, stop recording it.
4. **`loot`, `mana`, `uptime`** from T5.
5. **`compare`** reads the corrected numbers (T1) and shows each side's deaths, close calls, downtime and the change it can detect.
6. **Track 3 review.** With the new numbers, re-read Design Notes' Ideas: skipping overkilled targets (Myras logs about four times Ulric's "Monster already dead" refusals), Riva's panic step-away, walking rather than re-joining on an event's map, contested spawns, and the merchant ideas. Each becomes a measured proposal or goes to Considered and rejected.

## T7. Close-out

Diagnostics.md, Design Notes (Error Log, Combat Sampling, Farm Ledger, Data Store sections) and CLAUDE.md's file map describe the telemetry as it is; this plan is deleted, and anything not done moves to Design Notes' Ideas.

---

## Order

T0 first, since every hour without it loses data, then T2 and T3 (the transport, which T4 and T5 build on), then T1, T4, T5 and T6. T0.1, T0.2, T0.5 and T0.6 are a few lines each and could go in one commit today.

## Decided (10-16)

1. The watchdog is uninstalled and deleted, keeping the anti-throttling flags (T3).
2. Snapshots are kept as they are, and the sink trims them to the last 7 days (T4.1).
3. Boss profiles: the three fighters each record; Riff doesn't (T4.2).
4. Retention: the timeline keeps 7 days; the other archives stay whole.
5. T5 in this order: loot, the mana budget, attack uptime. The economy is not pursued.
6. `compare` counts time dead at the spot as spot time, and deaths per hour are part of the verdict (T1.1).
