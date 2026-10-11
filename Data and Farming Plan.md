# Data and Farming Plan

Four goals, one data foundation:

1. Make the data we collect usable in one place (and display it on a status page).
2. Rank kill-count achievements by value per hour of farming.
3. Rank equipment upgrades by damage per gold.
4. Find the best monster spot for gold/hr, XP/hr and both combined, by surveying spawns.

Goals 2–4 all need numbers we do not keep today, so the foundation (Workstream 0) comes first.

## Status

| Workstream | State |
|---|---|
| 0a–0d data foundation | **Built 2026-10-11**: `Error Log.js` (archive lane, `game_response` off the timeline), `Farm Ledger.js`, `Error Sink.py`, `Tools/Data Store.py` |
| 1 survey | **Built 2026-10-11**: `Farm Survey.js`, `*SURVEY*` in Settings. Not yet run in-game |
| 2 achievements | **Built 2026-10-11**: `node "Tools/Party Model.js" achievements`. Hours fill in as the survey measures kill rates |
| 3 equipment | **Built 2026-10-11**: `Tools/Party Model.js` (`calibrate`, `slots`, `upgrades`) |
| 4 status page | **Built 2026-10-11**: `http://127.0.0.1:8787/` while the sink runs (`Tools/Status Page.html`) |

How each part works is in `Design Notes.md` (`Farm Ledger.js`, `Farm Survey.js`, `Error Log.js`, `Data Store.py`).

**To run the survey:** set all three fighters' farm target to `*SURVEY*` in Settings. `survey_status()` in Myras's console shows progress; `python "Tools/Data Store.py" survey` prints the results.

---

## Decisions

| Topic | Decision |
|---|---|
| Gold/hr bands | Low ≈ 5M, healthy ≈ 20M, high > 30M |
| XP bands (per **minute**) | Low ≈ 500k, average ≈ 1M, high > 1.5M |
| Combined score | `gold_per_hr / 20M + xp_per_min / 1M` (2.0 = healthy on both) |
| Drop value | Ignored |
| Buff normalisation | None; buffs balance out over the survey |
| Candidate monsters | Around bscorpion and below, no bosses. Draft list below, hand-edited before the survey runs |
| Time per spot | 30 minutes of at-spot data. No shuffling, no control visits back to bscorpion |
| Bosses and events | The survey yields to World Events as farming does now. Time away does not count; the visit resumes afterwards |
| Safety | 2 deaths at the spot in one visit marks the spot **unsafe** and the survey moves on |
| Occupied spawns | Another player at the spawn on arrival: skip it, retry after the rest of the list. Still occupied on retry: mark it **occupied** and move on |
| Farm target | New `*SURVEY*` farm target. While the survey is incomplete it resolves to the current survey spot; once complete it resolves to `bscorpion` |
| Running time | Unattended, overnight, as long as it needs |
| `game_response` archiving | Stop archiving these lines |

---

## What we collect today

Measured on 2026-10-11:

- `errors_timeline.jsonl`: 81 MB over 12 days (458k lines). By `ctx`: `game_response` 50.6 MB (243k lines, 197k of them Myras), `quiet` 8.7 MB, `orb_equip` 7.0 MB, `game_log` 6.2 MB, `boss_watch` 4.2 MB. The useful structured lines are small: `death` (186), `map` (154), `bscorpion_kill` (6,154, e.g. `33.1s avg 31.3s/14`), `rime_watch`, `lifecycle`.
- `boss_profiles.jsonl`: the only structured data archived permanently (144 fights, each with gear and measured attack/frequency/crit/burn).
- `errors.json` samples (`damage`, `heal`, `target_choice`, `weapon_choice`, `cc_report`, `burn_state`, `dungeon`, `dungeon_event`, `exchange`, `heal_choice`) expire after `SAMPLE_MAX_AGE_H = 2` in `Error Sink.py`.
- Gold Meter, XP Meter and Kill Tracker keep in-memory rolling windows only. Every tab reload, including the periodic one in `Maintenance.js`, wipes them.

Nothing records gold/hr, XP/hr or kills/hr per spot, and nothing records kill counts toward achievements.

---

## Workstream 0: Data foundation

### 0a. Stop archiving `game_response`

`Error Log.js` (~line 370) records every `exception`, `cant` and `not_ready` reply as a `game_response` record, which the sink archives to the timeline. Drop them from the archive, but keep per-type counts in `errors.json` so the refusal rates (equip `not_ready`, attack cooldowns) are still visible. This removes ~60% of the timeline's growth.

### 0b. Farm ledger

Each fighter writes one `ledger` sample every 5 minutes through `errlog_sample()`, and the sink appends them to `ledger.jsonl` the same way it archives boss profiles (`archive_boss_profiles()` in `Error Sink.py`).

Fields:

- `character`, `t`, window length
- `map`, `home` (farm target), `survey_spot` (when surveying), `at_spot` (seconds spent at the spot in the window)
- `gold`: summed from opened chests, the same source as the Gold Meter (`Gold Meter.js:54`). **Not** the wallet delta: fighters send gold to Riff (`Loot Management.js:127`), so the wallet undercounts
- `xp`: `character.xp` delta, carried across level-ups with `G.levels`
- `kills`: per `mtype`, from `kill_credit`
- `deaths`, potions used
- `players_nearby`: other players within the spawn area (for the occupied rule)
- `party_present`, short gear signature
- `goldm`, `xpm`, `luckm` (recorded, not used for normalisation)

About 1 MB/day across all characters.

### 0c. Tracker snapshot

Once a day per fighter, emit the game's `tracker` socket call and archive the reply to `tracker.jsonl`. It returns `monsters` (kill counts per type) and `max` (`player.max_stats`). The server answers only while the character carries a tracker. `tracker` is in `ITEMS_TO_KEEP_BASE` and `do_not_bank`, but confirm each fighter actually has one in the bag.

### 0d. One queryable store

The sink, or a `Tools/` script, builds a SQLite file (Python stdlib `sqlite3`) from the `.jsonl` archives: `ledger`, `boss_profiles`, `tracker`, `deaths`, `bscorpion_kills`. The `.jsonl` files stay the source of truth; the database is rebuilt from them and is what every report and the status page read.

---

## Workstream 1: Survey (goal 4)

### Farm target

- Add `*SURVEY*` to the Settings window's farm-target options (`monster_options()` lists `LOCATIONS` keys today).
- `farm_target_for()` resolves `*SURVEY*` to the current survey spot, or to `bscorpion` when the survey is complete.
- Survey state (spot list, current index, per-spot status and accumulated at-spot seconds) lives in localStorage. All characters' iframes share it, so one character owns the writes (Myras, as `MOVEMENT_LEADER`) and the others read.

### Changing spot at runtime

`home` and `destination` are set once at load in each `<Role> Config.js` (`var home = farm_target_for(...)`, `var destination = home_destination(home)`). Saving Settings changes them by reloading all four characters (`Settings Window.js:154-160`). The survey needs one of:

- **Reload per spot change**: the proven path, roughly every 30 minutes.
- **Reassign `home`/`destination` at runtime**: lighter, but every reader of `home` must be checked first (`Bscorpion Camp.js`, `Movement Manager.js:891`, the fireroamer cases in `Healer Movement.js` and `Warrior Skills.js`, `Dungeon Runner.js:60`, `Combat Sampling.js:70`, `Equipment Manager.js:514`).

**Decided: runtime reassignment.** Every reader looks `home`/`destination` up when it runs; the only cache, `active_dungeon()`, never sees a survey spot. `switch_home()` in `Farm Survey.js` reassigns both.

### Visit rules

1. Travel to the spot. Ledger windows count toward it only while `at_spot`. A spot not reached after 20 minutes of travel (event detours excluded) is marked `unreachable`.
2. On arrival, if another player is at the spawn, mark the spot `skipped` and move on. Skipped spots are retried after the rest of the list; a second failure marks the spot `occupied`.
3. Collect 30 minutes of at-spot time. Boss/event detours pause the clock; the visit resumes afterwards.
4. 2 fighter deaths at the spot in one visit marks it `unsafe`. Deaths while travelling or on a boss detour don't count.
5. After the last spot (and the retries), mark the survey complete; `*SURVEY*` now resolves to `bscorpion`.

### Spot-specific code

Only bscorpion (`Bscorpion Camp.js`) and fireroamer have bespoke handling. Every other spot runs on generic farming, so the survey is also a test of how generic farming copes. A spot that dies to positioning rather than damage is a code problem, not a bad spot.

### Draft spot list (hand-edit before running)

Run in this order. Filter used: not a boss or co-op monster, on a normal map, HP ≤ ~bscorpion, attack ≤ 1.25× bscorpion, HP ≥ 20k.

| # | Monster | Map × count | HP | Attack | Armor / res | XP | XP/HP | Respawn | `LOCATIONS` | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | bscorpion | desertland ×1 | 577k | 3,200 phys | 500 / 240 | 635k | 1.10 | 6s | yes | Current camp |
| 2 | oneeye | ***REJECTED***
| 3 | pinkgoblin | ***REJECTED*** (10-11: the party can't out-damage its self-healing)
| 4 | sparkbot | uhills ×4 | 325k | 754 mag | 140 / 160 | 400k | 1.23 | 6s | **no** | Needs a `LOCATIONS` entry |
| 5 | targetron | uhills ×4 | 325k | 377 phys | 160 / 140 | 400k | 1.23 | 6s | yes | |
| 6 | harpy | ***REJECTED***
| 7 | xscorpion | halloween ×6 | 140k | 720 phys | 400 / 0 | 172k | 1.23 | 16s | yes | |
| 8 | odino | mforest ×7 | 165k | 550 phys | 135 / 65 | 140k | 0.85 | 3s | yes | |
| 9 | plantoid | desertland ×4 ×2 | 120k | 640 phys | 160 / 190 | 96k | 0.80 | 18s | yes | |
| 10 | fireroamer | desertland ×4 + ×2 | 84k | 320 mag | 120 / 320 | 64k | 0.76 | 2s | yes | Burn |
| 11 | pppompom | level2n ×6 + ×7 | 64k | 920 phys | 0 / 480 | 62k | 0.97 | 4s | yes | Poison |
| 12 | dryad | mforest ×6 | 80k | 400 mag | 65 / 100 | 60k | 0.75 | 2s | yes | Tangle |
| 13 | wolf | winterland ×7 | 48k | 480 phys | 300 / 200 | 49k | 1.02 | 12s | yes | |
| 14 | gscorpion | desertland ×6 | 32k | 120 phys | 300 / 0 | 48k | 1.50 | 6s | yes | |
| 15 | bigbird | main ×5 | 32k | 480 phys | 0 / 0 | 30k | 0.94 | 12s | yes | |
| 16 | scorpion | main ×6 | 24k | 100 phys | 200 / 0 | 20k | 0.83 | 6s | yes | |

Excluded by the filter: training dummies; single long-respawn monsters (mvampire 18 min, fvampire 24 min, skeletor 16 min, mechagnome 8 min); ent (8M HP); everything under 20k HP.

13 spots × 30 min ≈ 6.5 hours of at-spot time, plus travel and event detours: about one to two nights. The list in code is `SURVEY_SPOTS` in `Farm Survey.js`. sparkbot now has a `LOCATIONS` entry (its spawn box centre). sparkbot and targetron share one uhills spawn area, so their results will overlap.

### Results

One row per spot: status (`done` / `occupied` / `unsafe`), at-spot minutes, kills/hr, gold/hr, XP/min, deaths, gold band, XP band, combined score. Reported from the SQLite store and shown on the status page.

---

## Workstream 2: Achievement ranking (goal 2)

**Milestones are in monster score, not kills.** The server compares each threshold in `G.monsters[m].achievements` (`[score, "stat", stat, amount]`) with `max(own score, account best)`, where own score is `monsters[m] + monsters_diff[m]` and the account best is `max_stats.monsters[m][0]`.

**Score per kill** (`calculate_monster_score()`, server.js) starts at 1, then:

| Condition | Score |
|---|---|
| Each other fighter of ours in the party | +0.3 |
| Our merchant within 600px of the scoring character | −0.2, plus −0.1 more as a party merchant |
| The scoring character is over 600px from the monster and has under 1% of the credit | −0.3 |

On a coop monster every adjustment is halved. So with Ulric, Myras and Riva partied and Riff away, every kill scores **1.6** for each fighter: Myras's 61,534 bscorpion kills × 1.6 ≈ 98,450, against the account best of 98,112. A Riff delivery within 600px drops it to 1.3 for its duration.

- **Progress:** the tracker snapshot. Own score needs `monsters_diff`, which the snapshot archives from 10-11 on (`tracker_monsters.score`; the first three snapshots predate it); the account best (`account_score`) is in every snapshot.
- **Rate:** score/hr = kills/hr from the ledger × the score per kill (1.6 for a normal party; measured per monster as Δscore ÷ Δkills between two snapshots).
- **Value:** % party damage per stat point, from the combat model (Workstream 3).
- **Rank:** value of the reward ÷ hours of farming still needed (score still needed ÷ score/hr).

Examples: bscorpion +0.5 dex at 1k and 10k score (both reached: account best 98,112); plantoid +5 resistance at 1M (account best 718,717, so about 176k more kills at 1.6); mrpumpkin +10 apiercing at 50k (account best 905); ent +25 attack at 100k.

---

## Workstream 3: Equipment ranking (goal 3)

The optimizer discussed on 2026-10-11, damage only at first, for Ulric and Riva:

- A Node script in `Tools/` that loads `data.js` and the game's `calculate_item_properties()` (from `common_functions.js`), so item levels, class extras (Scorpion Seal's warrior block), set counts and ability `attr0` sums are the game's own.
- Gear from the latest `boss_profiles.jsonl` entry, checked against measured attack, frequency and crit. The ring-analysis prototype matched crit but explained only ~1,200 of Ulric's measured ~2,230 attack (achievements and buffs are not modelled), so the report always prints that gap.
- Reports: best item per slot against a named monster; "+1 on a worn item" ranked by party damage per gold.
- Every assumed ability mechanic is listed in the output (e.g. `sunder` procs like `burn`; not in the public server source).
- Confirm recommendations against `bscorpion_kill` timings.

---

## Workstream 4: Status page (goal 1)

The sink already runs an HTTP server; it serves a local page that reads the SQLite store:

- Live: each character's HP/MP, map, current activity, last death.
- Farming: gold/hr and XP/min, today and per spot; survey progress and results.
- Achievements: progress toward the next milestone per monster, and the ranked list.
- Upgrades: the equipment ranking.
- Trends: bscorpion kill time, deaths by cause.

---

## Order

1. **0a–0d**: archive clean-up, ledger, tracker snapshot, SQLite store.
2. **Workstream 1**: survey (also supplies kills/hr for Workstream 2).
3. **Workstream 2**: achievement ranking.
4. **Workstream 4**: status page, over whatever data exists by then.
5. **Workstream 3**: equipment ranking.

## To confirm during implementation

- Each fighter carries a tracker. *The snapshot logs `⚠️ Tracker snapshot skipped: no tracker in the bag` when one doesn't.*
- ~~Whether achievement progress is account-wide (`max_stats`) and how party kills are credited.~~ **Account-wide, and measured in monster score, not kills.** See Workstream 2. The first snapshots (10-11 18:59) give each fighter its own kill count (bscorpion: Ulric 61,305, Myras 61,534, Riva 61,248) and the same `max.monsters.bscorpion = [98112, "Myras"]`: the account's best score with the character who holds it.
- ~~Reload vs runtime reassignment for changing spot.~~ Runtime reassignment.
- ~~That nothing in `Diagnostics.md`'s workflow depends on archived `game_response` lines.~~ It reads `records`, which still hold them.
- ~~`sparkbot` needs a `LOCATIONS` entry before it can be surveyed.~~ Added.
