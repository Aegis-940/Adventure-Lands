#!/usr/bin/env python3
"""Builds al_data.sqlite from the sink's .jsonl archives, and reports from it.

    python "Tools/Data Store.py" ingest     bring the database up to date (the sink does this every 15 minutes)
    python "Tools/Data Store.py" rebuild    delete the database and ingest everything again
    python "Tools/Data Store.py" survey     survey results, one row per spot
    python "Tools/Data Store.py" status     the status page's JSON
    python "Tools/Data Store.py" compare A B [--home H] [--tier neutral|behaviour]
                                            two builds (7-char SHA) or time ranges (2026-10-14T21:00..2026-10-14T23:55)
                                            at the same home: per-window rates, change, and a verdict
    python "Tools/Data Store.py" skills|weapons|pulls|time|before-danger [--hours N | --build SHA | --range A..B]
                                            [--home H] [--who NAME] [--last N]
                                            the questions of Overhaul Plan 4: is each skill worth its mana, which
                                            weapon pair does better, how big a pull is safe, where the time goes,
                                            and the decisions before each death or close call
    python "Tools/Data Store.py" experiment NAME [--hours N | --build SHA | --range A..B]
                                            an experiment's variants against each other (Overhaul 4.6)

Also kept, one table each: damage.jsonl, heal.jsonl, target_choice.jsonl, cc_report.jsonl (Overhaul 4.1).

The .jsonl files are the record. The database is derived from them, so it can be deleted at any time.
Ingest is incremental: each file's byte offset is remembered, and a file that shrank is re-read from
the start.
"""

import json
import os
import re
import sqlite3
import statistics
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(REPO, "al_data.sqlite")

SCHEMA = """
CREATE TABLE IF NOT EXISTS ingested (file TEXT PRIMARY KEY, offset INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
    character TEXT, t INTEGER, at TEXT, window_s INTEGER, at_spot_s INTEGER, map TEXT, home TEXT,
    survey_spot TEXT, level INTEGER, gold INTEGER, chest_gold INTEGER, xp INTEGER, kills INTEGER,
    spot_gold INTEGER, spot_chest_gold INTEGER, spot_xp INTEGER, spot_kills INTEGER, deaths INTEGER,
    hp_pots INTEGER, mp_pots INTEGER, players_nearby INTEGER, goldm REAL, xpm REAL, luckm REAL,
    kills_by_type TEXT, spot_kills_by_type TEXT, party TEXT, gear TEXT, build TEXT);
CREATE TABLE IF NOT EXISTS survey (
    character TEXT, t INTEGER, at TEXT, spot TEXT, status TEXT, visits INTEGER, at_spot_s INTEGER,
    travel_s INTEGER, deaths INTEGER, build TEXT);
CREATE TABLE IF NOT EXISTS tracker (character TEXT, t INTEGER, at TEXT, level INTEGER, monsters TEXT, max TEXT);
CREATE TABLE IF NOT EXISTS tracker_monsters (character TEXT, t INTEGER, mtype TEXT, kills INTEGER, score REAL,
    account_score REAL, account_holder TEXT);
CREATE TABLE IF NOT EXISTS boss_profiles (character TEXT, t INTEGER, at TEXT, boss TEXT, killed INTEGER,
    fight_secs REAL, raw TEXT);
CREATE TABLE IF NOT EXISTS deaths (character TEXT, t INTEGER, at TEXT, msg TEXT);
CREATE TABLE IF NOT EXISTS danger (character TEXT, t INTEGER, at TEXT, event TEXT, map TEXT, home TEXT, goal TEXT,
    killer TEXT, min_hp_pct INTEGER, low_for_s INTEGER, damage_10s INTEGER, targeting INTEGER, mp_pct INTEGER,
    panicking INTEGER, raw TEXT, build TEXT);
CREATE TABLE IF NOT EXISTS bscorpion_kills (character TEXT, t INTEGER, at TEXT, secs REAL, avg_secs REAL);
CREATE INDEX IF NOT EXISTS ledger_spot ON ledger (survey_spot, character);
CREATE INDEX IF NOT EXISTS ledger_home ON ledger (home, character);
"""


# Every archived record carries these from Overhaul 4.2 on (empty before): what the page was doing when it wrote it.
CONTEXT_COLUMNS = ["home", "map", "goal", "encounters", "variant", "settings"]

# Columns added after a table was first created, so an existing database gains them on connect.
ADDED_COLUMNS = {
    "ledger": ["build", "goal", "encounters", "variant", "variant_start", "settings"],
    "survey": ["build"],
    "danger": ["build", "encounters", "variant", "settings"],
    "decisions": ["settings"],
}

# Sample kinds the sink keeps (Overhaul 4.1): file, table, and the fields worth a column. Everything is also in raw.
SAMPLE_TABLES = [
    ("damage.jsonl", "damage_windows", ["weapon", "secs", "direct", "splash", "burn", "hits", "splashes", "ticks",
                                        "attack", "crit", "buffs", "boss_pct", "off_home_pct"]),
    ("heal.jsonl", "heal_windows", ["secs", "single_casts", "single_delivered", "single_predicted", "single_overheal",
                                    "party_hits", "party_delivered", "party_predicted", "party_overheal", "mp_cost"]),
    ("target_choice.jsonl", "target_choices", ["mob", "pool", "chosen_score", "runner_up_score", "chosen_value",
                                               "best_value", "traded"]),
    ("cc_report.jsonl", "cc_reports", ["total", "climit", "by_method"]),
]
ADDED_COLUMNS.update({table: ["settings"] for _, table, _ in SAMPLE_TABLES})


def sample_schema():
    out = []
    for _, table, fields in SAMPLE_TABLES:
        columns = ["character", "t INTEGER", "at"] + fields + ["build"] + CONTEXT_COLUMNS + ["raw"]
        out.append("CREATE TABLE IF NOT EXISTS %s (%s);" % (table, ", ".join(columns)))
        out.append("CREATE INDEX IF NOT EXISTS %s_t ON %s (character, t);" % (table, table))
    return "\n".join(out)


def cell(value):
    return json.dumps(value) if isinstance(value, (dict, list)) else value


def insert(db, table, row):
    names = list(row)
    db.execute("INSERT INTO %s (%s) VALUES (%s)" % (table, ", ".join(names), ", ".join("?" * len(names))),
               [cell(row[n]) for n in names])


def context(r):
    return {name: r.get(name) for name in ["build"] + CONTEXT_COLUMNS}


def sample_adder(table, fields):
    def add(db, r):
        row = {"character": r.get("character"), "t": r.get("t"), "at": r.get("at")}
        row.update({f: r.get(f) for f in fields})
        row.update(context(r))
        row["raw"] = r
        insert(db, table, row)
    return add


def count(kills):
    return sum((kills or {}).values())


def add_ledger(db, r):
    spot = r.get("spot") or {}
    potions = r.get("potions") or {}
    row = {
        "character": r.get("character"), "t": r.get("t"), "at": r.get("at"), "window_s": r.get("window_s"),
        "at_spot_s": r.get("at_spot_s"), "survey_spot": r.get("survey_spot"), "level": r.get("level"),
        "gold": r.get("gold"), "chest_gold": r.get("chest_gold"), "xp": r.get("xp"), "kills": count(r.get("kills")),
        "spot_gold": spot.get("gold"), "spot_chest_gold": spot.get("chest_gold"), "spot_xp": spot.get("xp"),
        "spot_kills": count(spot.get("kills")), "deaths": r.get("deaths"), "hp_pots": potions.get("hp"),
        "mp_pots": potions.get("mp"), "players_nearby": r.get("players_nearby"), "goldm": r.get("goldm"),
        "xpm": r.get("xpm"), "luckm": r.get("luckm"), "kills_by_type": r.get("kills") or {},
        "spot_kills_by_type": spot.get("kills") or {}, "party": r.get("party") or [], "gear": r.get("gear") or {},
        "variant_start": r.get("variant_start"),
    }
    row.update(context(r))
    insert(db, "ledger", row)


def add_survey(db, r):
    db.execute("INSERT INTO survey VALUES (?,?,?,?,?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("spot"), r.get("status"), r.get("visits"),
        r.get("at_spot_s"), r.get("travel_s"), r.get("deaths"), r.get("build")))


def add_tracker(db, r):
    db.execute("INSERT INTO tracker VALUES (?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("level"),
        json.dumps(r.get("monsters") or {}), json.dumps(r.get("max") or {})))
    kills = r.get("monsters") or {}
    diff = r.get("monsters_diff")
    best = (r.get("max") or {}).get("monsters") or {}
    rows = []
    for mtype in set(kills) | set(best):
        account = best.get(mtype) or [None, None]
        score = kills.get(mtype, 0) + diff.get(mtype, 0) if diff is not None else None
        rows.append((r.get("character"), r.get("t"), mtype, kills.get(mtype, 0), score, account[0], account[1]))
    db.executemany("INSERT INTO tracker_monsters VALUES (?,?,?,?,?,?,?)", rows)


def add_danger(db, r):
    row = {
        "character": r.get("character"), "t": r.get("t"), "at": r.get("at"), "event": r.get("event"),
        "killer": r.get("killer"), "min_hp_pct": 0 if r.get("event") == "death" else r.get("min_hp_pct"),
        "low_for_s": r.get("low_for_s"), "damage_10s": r.get("damage_10s"), "targeting": r.get("targeting"),
        "mp_pct": r.get("mp_pct"), "panicking": 1 if r.get("panicking") else 0, "raw": r,
    }
    row.update(context(r))
    insert(db, "danger", row)


def add_boss_profile(db, r):
    db.execute("INSERT INTO boss_profiles VALUES (?,?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("boss"), 1 if r.get("killed") else 0,
        r.get("fight_secs"), json.dumps(r)))


KILL_LINE = re.compile(r"([\d.]+)s avg ([\d.]+)s")


def add_timeline(db, r):
    ctx = r.get("ctx")
    if ctx == "death":
        db.execute("INSERT INTO deaths VALUES (?,?,?,?)", (r.get("character"), r.get("t"), r.get("at"), r.get("msg")))
    elif ctx == "bscorpion_kill":
        m = KILL_LINE.match(r.get("msg") or "")
        if m:
            db.execute("INSERT INTO bscorpion_kills VALUES (?,?,?,?,?)",
                       (r.get("character"), r.get("t"), r.get("at"), float(m.group(1)), float(m.group(2))))


SOURCES = [
    ("ledger.jsonl", add_ledger, ["ledger"]),
    ("survey.jsonl", add_survey, ["survey"]),
    ("tracker.jsonl", add_tracker, ["tracker", "tracker_monsters"]),
    ("danger.jsonl", add_danger, ["danger"]),
    ("boss_profiles.jsonl", add_boss_profile, ["boss_profiles"]),
    ("errors_timeline.jsonl", add_timeline, ["deaths", "bscorpion_kills"]),
] + [(name, sample_adder(table, fields), [table]) for name, table, fields in SAMPLE_TABLES]


def ingest_file(db, name, add, tables):
    path = os.path.join(REPO, name)
    if not os.path.exists(path):
        return 0
    row = db.execute("SELECT offset FROM ingested WHERE file = ?", (name,)).fetchone()
    offset = row[0] if row else 0
    if os.path.getsize(path) < offset:
        for table in tables:
            db.execute("DELETE FROM %s" % table)
        offset = 0

    added = 0
    with open(path, "rb") as fh:
        fh.seek(offset)
        for raw in fh:
            if not raw.endswith(b"\n"):
                break
            offset += len(raw)
            try:
                add(db, json.loads(raw))
                added += 1
            except ValueError:
                continue
    db.execute("INSERT OR REPLACE INTO ingested VALUES (?, ?)", (name, offset))
    return added


def connect():
    db = sqlite3.connect(DB, timeout=60)
    db.executescript(SCHEMA + sample_schema() + DECISION_SCHEMA)
    for table, columns in ADDED_COLUMNS.items():
        have = [c[1] for c in db.execute("PRAGMA table_info(%s)" % table)]
        for column in columns:
            if column not in have:
                db.execute("ALTER TABLE %s ADD COLUMN %s" % (table, column))
    return db


def ingest():
    """Takes the write lock before reading any offset, so two ingests at once (the sink's sweep and a status
    request) run one after the other instead of both inserting the same lines."""
    db = connect()
    with db:
        db.execute("BEGIN IMMEDIATE")
        added = {name: ingest_file(db, name, add, tables) for name, add, tables in SOURCES}
    db.close()
    return added


# --------------------------------------------------------------------------------------------------------------------------------- #
# SURVEY REPORT
# --------------------------------------------------------------------------------------------------------------------------------- #

SURVEY_OWNER = "Myras"
BANDS = [(1.25, "high"), (0.8, "average"), (0.5, "fair"), (0, "low")]
REFERENCE_MIN_MINUTES = 10


def band(ratio):
    return next(name for floor, name in BANDS if ratio >= floor)


def farm_reference(measured):
    """The yardstick every rate is judged by: the median gold/hr and XP/min across the farm spots measured for at
    least REFERENCE_MIN_MINUTES at the spot (every measured spot while none has that long). `measured` is
    (spot, rates) pairs; a spot measured both by the survey and as a farm target counts once, from whichever
    has more minutes."""
    best = {}
    for spot, r in measured:
        if r and (spot not in best or r["minutes"] > best[spot]["minutes"]):
            best[spot] = r
    pool = {s: r for s, r in best.items() if r["minutes"] >= REFERENCE_MIN_MINUTES} or best
    if not pool:
        return None
    return {"gold_hr": round(statistics.median(r["gold_hr"] for r in pool.values())),
            "xp_min": round(statistics.median(r["xp_min"] for r in pool.values())), "spots": sorted(pool)}


def judge(rates, ref):
    """Bands are the ratio to the reference median; score is the two ratios summed, so 2.0 is a typical spot."""
    if rates and ref:
        gold = rates["gold_hr"] / ref["gold_hr"] if ref["gold_hr"] else 0
        xp = rates["xp_min"] / ref["xp_min"] if ref["xp_min"] else 0
        rates.update(gold_band=band(gold), xp_band=band(xp), score=round(gold + xp, 2))
    return rates


def spot_rates(db, column, value, since_t=0):
    """At-the-spot rates for the ledger windows where `column` = value. Party gold and kills come from the
    survey owner's windows (chest gold is the whole chest, so one character's view is the party's); XP/min
    is the mean of each fighter's own rate."""
    owner = db.execute(
        "SELECT SUM(at_spot_s), SUM(spot_chest_gold), SUM(spot_kills), MAX(players_nearby) "
        "FROM ledger WHERE %s = ? AND character = ? AND t >= ?" % column, (value, SURVEY_OWNER, since_t)).fetchone()
    secs, gold, kills, crowd = (owner[0] or 0, owner[1] or 0, owner[2] or 0, owner[3] or 0)
    if not secs:
        return None
    xp_rates = [xp * 60 / s for xp, s in db.execute(
        "SELECT SUM(spot_xp), SUM(at_spot_s) FROM ledger WHERE %s = ? AND t >= ? GROUP BY character" % column,
        (value, since_t)) if s]
    deaths = db.execute("SELECT SUM(deaths) FROM ledger WHERE %s = ? AND t >= ?" % column,
                        (value, since_t)).fetchone()[0] or 0
    gold_hr = gold * 3600 / secs
    xp_min = sum(xp_rates) / len(xp_rates) if xp_rates else 0
    return {
        "minutes": round(secs / 60, 1), "kills_hr": round(kills * 3600 / secs), "gold_hr": round(gold_hr),
        "xp_min": round(xp_min), "crowd": crowd, "deaths": deaths,
    }


def survey_rows(db, state):
    """One row per spot with a result or ledger data. The live survey state, when there is one, decides which
    spots are still on the list and what their status is: a spot dropped from the list disappears, and a spot
    put back with survey_retry() shows as pending or running rather than its old result. A spot's rates count
    only the ledger windows since its latest retry, and everything since the latest survey_reset(). Without a
    live state, only spots with a recorded status are listed: a ledger window alone cannot say whether its spot
    is still on the list."""
    reset_t = db.execute("SELECT MAX(t) FROM survey WHERE status = 'reset'").fetchone()[0] or 0
    since = {}
    status = {}
    for t, spot, st, at_spot_s, deaths, visits in db.execute(
            "SELECT t, spot, status, at_spot_s, deaths, visits FROM survey WHERE spot IS NOT NULL AND t >= ? ORDER BY t",
            (reset_t,)):
        if st == "retry":
            since[spot] = t
            status[spot] = {"status": "pending", "visits": visits}
            continue
        status[spot] = {"status": st, "clock_min": round((at_spot_s or 0) / 60, 1), "visit_deaths": deaths,
                        "visits": visits}
    spots = set(status)
    if state:
        spots |= {s for (s,) in db.execute("SELECT DISTINCT survey_spot FROM ledger WHERE survey_spot IS NOT NULL AND t >= ?",
                                           (reset_t,))}
        listed = {p["type"]: p for p in state.get("spots") or []}
        current = None if state.get("complete") else (state["spots"][state["index"]]["type"])
        spots &= set(listed)
        for spot in spots:
            p = listed[spot]
            status[spot] = {**status.get(spot, {}), "status": "running" if spot == current else p["status"],
                            "visits": p.get("visits")}
    return [{"spot": spot, **status.get(spot, {"status": "running"}),
             "rates": spot_rates(db, "survey_spot", spot, since.get(spot, reset_t))}
            for spot in spots]


def farm_rates(db, errors, now_ms):
    """Every farming rate the reports show, judged against one reference built from the survey's spots and the
    last 7 days' farm targets."""
    by_home = []
    for (home,) in db.execute("SELECT DISTINCT home FROM ledger WHERE home IS NOT NULL").fetchall():
        rates = spot_rates(db, "home", home, now_ms - 7 * 24 * HOUR_MS)
        if rates and rates["minutes"] >= 1:
            by_home.append({"home": home, **rates})
    survey = survey_rows(db, survey_state(errors))
    ref = farm_reference([(r["home"], r) for r in by_home] + [(r["spot"], r["rates"]) for r in survey])
    for r in by_home:
        judge(r, ref)
    for r in survey:
        judge(r["rates"], ref)
    return {
        "reference": ref,
        "last_hour": judge(overall_rates(db, now_ms - HOUR_MS), ref),
        "last_day": judge(overall_rates(db, now_ms - 24 * HOUR_MS), ref),
        "by_home": sorted(by_home, key=lambda r: -r.get("score", -1)),
        "survey": sorted(survey, key=lambda r: -(r["rates"] or {}).get("score", -1)),
    }


def survey_report():
    db = connect()
    farm = farm_rates(db, read_json(ERRORS), int(time.time() * 1000))
    db.close()
    rows, ref = farm["survey"], farm["reference"]
    print("%-11s %-11s %5s %8s %12s %-8s %10s %-8s %6s %6s %6s" % (
        "spot", "status", "min", "kills/h", "gold/h", "", "xp/min", "", "score", "deaths", "crowd"))
    for r in rows:
        m = r["rates"]
        if not m:
            print("%-11s %-11s %5.0f  (no ledger data at the spot; %s visit(s))" % (
                r["spot"], r["status"], r.get("clock_min") or 0, r.get("visits")))
            continue
        print("%-11s %-11s %5.0f %8d %12s %-8s %10s %-8s %6.2f %6s %6d" % (
            r["spot"], r["status"], m["minutes"], m["kills_hr"], "{:,}".format(m["gold_hr"]), m["gold_band"],
            "{:,}".format(m["xp_min"]), m["xp_band"], m["score"], m["deaths"], m["crowd"]))
    if ref:
        print("\nReference: the median of %d measured spots (%s): %s gold/h, %s XP/min." % (
            len(ref["spots"]), ", ".join(ref["spots"]), "{:,}".format(ref["gold_hr"]), "{:,}".format(ref["xp_min"])))
        print("Bands are the ratio to it: high >= 1.25x, average >= 0.8x, fair >= 0.5x, low below."
              " score = gold ratio + XP ratio (2.0 = typical on both).")
    print("Gold is party chest gold seen by %s; XP/min is the mean across fighters." % SURVEY_OWNER)


# --------------------------------------------------------------------------------------------------------------------------------- #
# STATUS — everything the status page shows, as one JSON document
# --------------------------------------------------------------------------------------------------------------------------------- #

ERRORS = os.path.join(REPO, "errors.json")
MODEL = os.path.join(REPO, "party_model.json")
CHARACTERS = ["Ulric", "Myras", "Riva", "Riff"]
HOUR_MS = 3600 * 1000


def read_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def live(errors):
    out = []
    for name in CHARACTERS:
        bucket = (errors or {}).get(name) or {}
        deaths = bucket.get("deaths") or []
        out.append({"character": name, "beat": (bucket.get("alive") or [None])[-1],
                    "last_death": deaths[-1].get("t") if deaths else None})
    return out


def overall_rates(db, since_t):
    owner = db.execute("SELECT SUM(window_s), SUM(chest_gold), SUM(kills) FROM ledger WHERE character = ? AND t >= ?",
                       (SURVEY_OWNER, since_t)).fetchone()
    secs, gold, kills = owner[0] or 0, owner[1] or 0, owner[2] or 0
    if not secs:
        return None
    xp_rates = [xp * 60 / s for xp, s in db.execute(
        "SELECT SUM(xp), SUM(window_s) FROM ledger WHERE t >= ? GROUP BY character", (since_t,)) if s]
    xp_min = sum(xp_rates) / len(xp_rates) if xp_rates else 0
    gold_hr = gold * 3600 / secs
    return {"minutes": round(secs / 60), "gold_hr": round(gold_hr), "xp_min": round(xp_min),
            "kills_hr": round(kills * 3600 / secs)}


def survey_state(errors):
    samples = [s for s in ((errors or {}).get(SURVEY_OWNER) or {}).get("samples") or [] if s.get("kind") == "survey_state"]
    return samples[-1] if samples else None


def trends(db, now_ms):
    kills = [{"t": int(t), "avg_secs": round(a, 1), "n": n} for t, a, n in db.execute(
        "SELECT (t / ?) * ?, AVG(secs), COUNT(*) FROM bscorpion_kills WHERE t >= ? AND secs < 120 "
        "GROUP BY t / ? ORDER BY 1", (HOUR_MS, HOUR_MS, now_ms - 72 * HOUR_MS, HOUR_MS))]
    deaths = [{"day": d, "n": n} for d, n in db.execute(
        "SELECT substr(at, 1, 10), COUNT(*) FROM deaths WHERE t >= ? GROUP BY 1 ORDER BY 1", (now_ms - 14 * 24 * HOUR_MS,))]
    return {"bscorpion_kill_secs": kills, "deaths_per_day": deaths}


DANGER_EVENTS = 60
DANGER_MATCH_MS = 15000


def danger(db, now_ms):
    """Deaths and close calls, newest first. Deaths from the timeline before the danger log existed (or from a
    character not running it) appear without detail, unless a detailed death of the same character is within 15s."""
    events = []
    detailed = []
    for raw, t, who in db.execute("SELECT raw, t, character FROM danger ORDER BY t DESC LIMIT ?", (DANGER_EVENTS,)):
        r = json.loads(raw)
        events.append(r)
        if r.get("event") == "death":
            detailed.append((who, t))
    for who, t, at, msg in db.execute("SELECT character, t, at, msg FROM deaths ORDER BY t DESC LIMIT ?", (DANGER_EVENTS,)):
        if any(w == who and abs(t - dt) < DANGER_MATCH_MS for w, dt in detailed):
            continue
        events.append({"event": "death", "character": who, "t": t, "at": at, "note": msg, "detail": False})
    events.sort(key=lambda e: -(e.get("t") or 0))
    counts = {}
    for label, since in (("day", now_ms - 24 * HOUR_MS), ("week", now_ms - 7 * 24 * HOUR_MS)):
        logged = db.execute("SELECT character, t FROM deaths WHERE t >= ?", (since,)).fetchall()
        extra = [(w, t) for w, t in db.execute("SELECT character, t FROM danger WHERE event = 'death' AND t >= ?", (since,))
                 if not any(lw == w and abs(lt - t) < DANGER_MATCH_MS for lw, lt in logged)]
        deaths = len(logged) + len(extra)
        close = db.execute("SELECT COUNT(*) FROM danger WHERE event = 'close_call' AND t >= ?", (since,)).fetchone()[0]
        counts[label] = {"deaths": deaths, "close_calls": close}
    return {"events": events[:DANGER_EVENTS], "counts": counts}


POTION_CD_S = 2.05
POTION_MP = 500


def mana_measured(db, now_ms):
    """Each fighter's potion use as a share of the 2.05s potion limit, last hour and last day."""
    out = []
    for (who,) in db.execute("SELECT DISTINCT character FROM ledger ORDER BY character").fetchall():
        row = {"character": who}
        for label, since in (("hour", now_ms - HOUR_MS), ("day", now_ms - 24 * HOUR_MS)):
            secs, mp, hp = db.execute("SELECT SUM(window_s), SUM(mp_pots), SUM(hp_pots) FROM ledger WHERE character = ? AND t >= ?",
                                      (who, since)).fetchone()
            row[label] = None if not secs else {"cap_pct": round((mp + hp) * POTION_CD_S / secs * 100),
                                                "mp_s": round(mp * POTION_MP / secs), "minutes": round(secs / 60)}
        out.append(row)
    return out


def model():
    m = read_json(MODEL)
    if not m:
        return None
    top_slots = []
    for who, slots in (m.get("slots") or {}).items():
        for slot, s in slots.items():
            best = next((b for b in s.get("best") or [] if b["gain_pct"] > 0.05), None)
            if best:
                top_slots.append({"character": who, "slot": slot, "worn": s["worn"], **best})
    top_slots.sort(key=lambda r: -r["gain_pct"])
    return {
        "generated": m.get("generated"), "monster": m.get("monster"), "calibration": m.get("calibration"), "mana": m.get("mana"),
        "upgrades": (m.get("upgrades") or [])[:12], "achievements": (m.get("achievements") or [])[:20],
        "slots": top_slots[:15], "assumptions": m.get("assumptions"),
    }


def status():
    ingest()
    now_ms = int(time.time() * 1000)
    errors = read_json(ERRORS)
    db = connect()
    farm = farm_rates(db, errors, now_ms)
    out = {
        "generated": now_ms,
        "live": live(errors),
        "farming": {k: farm[k] for k in ("reference", "last_hour", "last_day", "by_home")},
        "survey": {"state": survey_state(errors), "results": farm["survey"]},
        "trends": trends(db, now_ms),
        "danger": danger(db, now_ms),
        "mana": mana_measured(db, now_ms),
        "model": model(),
        "decisions": decisions_status(db, now_ms),
    }
    db.close()
    return out


# --------------------------------------------------------------------------------------------------------------------------------- #
# DECISIONS — Overhaul 4.5: what each fighter chose and what came of it, per ledger window, and the questions asked of it
# --------------------------------------------------------------------------------------------------------------------------------- #

DECISION_FIELDS = ["casts", "values", "actions", "pulls", "bursts", "gear", "panics", "outcomes", "taken", "worn_s", "goal_s"]
DECISION_SCHEMA = """
CREATE TABLE IF NOT EXISTS decisions (character TEXT, t INTEGER, at TEXT, window_s INTEGER, panic_s REAL,
    casts TEXT, cast_values TEXT, actions TEXT, pulls TEXT, bursts TEXT, gear TEXT, panics TEXT, outcomes TEXT,
    taken TEXT, worn_s TEXT, goal_s TEXT, build TEXT, home TEXT, map TEXT, goal TEXT, encounters TEXT, variant TEXT);
CREATE INDEX IF NOT EXISTS decisions_t ON decisions (character, t);
"""
PAIR_MS = 2000


def add_decisions(db, r):
    row = {"character": r.get("character"), "t": r.get("t"), "at": r.get("at"), "window_s": r.get("window_s"),
           "panic_s": r.get("panic_s")}
    for field in DECISION_FIELDS:
        row["cast_values" if field == "values" else field] = r.get(field) or {}
    row.update(context(r))
    insert(db, "decisions", row)


def period(flags):
    """--build SHA, --range start..end (local time), or --hours N (default 24); optionally --home H and --who NAME."""
    where, args = [], []
    if flags.get("--build"):
        where.append("build = ?")
        args.append(flags["--build"][:7])
    elif flags.get("--range"):
        clause, values, _ = compare_selector(flags["--range"])
        where.append(clause)
        args.extend(values)
    else:
        where.append("t >= ?")
        args.append(int(time.time() * 1000) - int(float(flags.get("--hours", 24)) * HOUR_MS))
    if flags.get("--home"):
        where.append("home = ?")
        args.append(flags["--home"])
    if flags.get("--who"):
        where.append("character = ?")
        args.append(flags["--who"])
    return " AND ".join(where), tuple(args)


def decision_rows(db, flags):
    where, args = period(flags)
    names = ["character", "t", "window_s", "panic_s", "cast_values"] + [f for f in DECISION_FIELDS if f != "values"]
    out = []
    for row in db.execute("SELECT %s FROM decisions WHERE %s ORDER BY t" % (", ".join(names), where), args):
        r = dict(zip(names, row))
        for f in names[4:]:
            r[f] = json.loads(r[f] or "{}")
        r["values"] = r.pop("cast_values")
        out.append(r)
    return out


def by_character(rows):
    out = {}
    for r in rows:
        out.setdefault(r["character"], []).append(r)
    return out


def hours(rows):
    return sum(r["window_s"] or 0 for r in rows) / 3600.0 or None


def skills_summary(rows):
    """Per character and per skill or shot: how often it was chosen and confirmed, what it cost, what it did, and the
    value it was cast for. Confirmed casts are per cooldown group (3shot and 5shot count under attack)."""
    out = []
    for who, mine in sorted(by_character(rows).items()):
        h = hours(mine)
        if not h:
            continue
        total = {}
        for r in mine:
            for section in ("casts", "values", "actions", "outcomes"):
                for name, fields in r[section].items():
                    slot = total.setdefault(name, {})
                    for k, v in fields.items():
                        slot[section + "." + k] = slot.get(section + "." + k, 0) + v
        for name, t in sorted(total.items(), key=lambda kv: -kv[1].get("outcomes.damage", 0)):
            uses = t.get("values.n") or t.get("actions.n") or t.get("casts.n") or 0
            damage = t.get("outcomes.damage", 0)
            predicted = t.get("values.predicted")
            out.append({
                "character": who, "skill": name, "hours": round(h, 2),
                "chosen_h": round(t.get("actions.n", t.get("values.n", 0)) / h, 1),
                "confirmed_h": round(t.get("casts.n", 0) / h, 1),
                "mana_h": round(t.get("casts.mana", 0) / h),
                "penalty_s_h": round(t.get("casts.penalty_ms", 0) / 1000.0 / h, 1),
                "damage_h": round(damage / h),
                "damage_per_use": round(damage / uses) if uses and damage else None,
                "kills_h": round(t.get("outcomes.kills", 0) / h, 1),
                "miss_pct": round(100.0 * t.get("outcomes.misses", 0) / t["outcomes.hits"], 1) if t.get("outcomes.hits") else None,
                "pulls_h": round(t.get("actions.pulls", 0) / h, 1),
                "predicted_per_cast": round(predicted / t["values.n"]) if predicted and t.get("values.n") else None,
                "realised_vs_predicted": round(damage / predicted, 2) if predicted and damage else None,
            })
    return out


def weapons_summary(db, rows, flags):
    """Per character and weapon pair: share of time worn (decision windows), and realised damage per hit with its
    splash and burn shares (Combat Sampling's per-weapon windows, which attribute each hit to the weapon that fired it).
    Those windows run 15s from a weapon's first hit, not for as long as it is worn, so damage per second is not given."""
    worn = {}
    for r in rows:
        for label, s in r["worn_s"].items():
            worn[(r["character"], label)] = worn.get((r["character"], label), 0) + s
    totals = {}
    for (who, _), s in worn.items():
        totals[who] = totals.get(who, 0) + s
    where, args = period(flags)
    measured = {}
    for who, weapon, secs, direct, splash, burn, hits in db.execute(
            "SELECT character, weapon, secs, direct, splash, burn, hits FROM damage_windows WHERE %s" % where, args):
        m = measured.setdefault((who, weapon), [0, 0, 0, 0, 0, 0])
        m[0] += secs or 0
        m[1] += direct or 0
        m[2] += splash or 0
        m[3] += burn or 0
        m[4] += hits or 0
        m[5] += 1
    out = []
    for key in sorted(set(worn) | set(measured)):
        who, weapon = key
        m = measured.get(key)
        out.append({
            "character": who, "weapon": weapon,
            "worn_pct": round(100.0 * worn.get(key, 0) / totals[who], 1) if totals.get(who) else None,
            "windows": m[5] if m else 0,
            "per_hit": round((m[1] + m[2] + m[3]) / m[4]) if m and m[4] else None,
            "splash_pct": round(100.0 * m[2] / (m[1] + m[2] + m[3]), 1) if m and m[1] + m[2] + m[3] else None,
            "burn_pct": round(100.0 * m[3] / (m[1] + m[2] + m[3]), 1) if m and m[1] + m[2] + m[3] else None,
        })
    return out


def close_calls_near(db, who, start, end):
    return db.execute("SELECT COUNT(*) FROM danger WHERE character = ? AND event = 'close_call' AND t > ? AND t <= ?",
                      (who, start, end)).fetchone()[0]


def pulls_summary(db, rows):
    """Windows grouped by the most monsters already on the puller when she pulled: how many such windows, how many
    pulls, and what followed (close calls in the window, damage taken and MP potions per hour)."""
    groups = {}
    for r in rows:
        if not r["pulls"]:
            continue
        top = max(int(k) for k in r["pulls"])
        g = groups.setdefault((r["character"], top), {"windows": 0, "pulls": 0, "secs": 0, "close": 0, "taken": 0, "mp_pots": 0})
        g["windows"] += 1
        g["pulls"] += sum(r["pulls"].values())
        g["secs"] += r["window_s"] or 0
        g["close"] += close_calls_near(db, r["character"], r["t"] - (r["window_s"] or 0) * 1000, r["t"])
        g["taken"] += (r["taken"] or {}).get("damage", 0)
        pots = db.execute("SELECT mp_pots FROM ledger WHERE character = ? AND ABS(t - ?) < ?",
                          (r["character"], r["t"], PAIR_MS)).fetchone()
        g["mp_pots"] += (pots[0] or 0) if pots else 0
    out = []
    for (who, top), g in sorted(groups.items()):
        h = g["secs"] / 3600.0 or None
        out.append({"character": who, "max_aggro_at_pull": "%d+" % top if top >= 10 else top, "windows": g["windows"],
                    "pulls_h": round(g["pulls"] / h, 1) if h else None,
                    "close_calls_per_window": round(g["close"] / g["windows"], 2),
                    "taken_h": round(g["taken"] / h) if h else None,
                    "mp_pots_h": round(g["mp_pots"] / h) if h else None})
    return out


def time_summary(rows):
    out = []
    for who, mine in sorted(by_character(rows).items()):
        total = sum(sum(r["goal_s"].values()) for r in mine) or None
        if not total:
            continue
        goals = {}
        for r in mine:
            for label, s in r["goal_s"].items():
                goals[label] = goals.get(label, 0) + s
        shares = sorted(((round(100.0 * s / total, 1), label) for label, s in goals.items()), reverse=True)
        out.append({"character": who, "hours": round(total / 3600.0, 2),
                    "panic_pct": round(100.0 * sum(r["panic_s"] or 0 for r in mine) / total, 1),
                    "goals": [{"goal": label, "pct": pct} for pct, label in shares]})
    return out


def before_danger(db, flags, limit=10):
    where, args = period(flags)
    out = []
    for raw, in db.execute("SELECT raw FROM danger WHERE %s ORDER BY t DESC LIMIT ?" % where, args + (limit,)):
        r = json.loads(raw)
        out.append({k: r.get(k) for k in ("at", "character", "event", "map", "goal", "min_hp_pct", "damage_10s",
                                          "targeting", "killer", "decisions")})
    return out


def print_rows(rows, columns):
    if not rows:
        print("  no data for this period")
        return
    widths = [max(len(c), *(len(str(r.get(c) if r.get(c) is not None else "-")) for r in rows)) for c in columns]
    print("  " + "  ".join(c.ljust(w) for c, w in zip(columns, widths)))
    for r in rows:
        print("  " + "  ".join(str(r.get(c) if r.get(c) is not None else "-").ljust(w) for c, w in zip(columns, widths)))


def question_report(command, flags):
    ingest()
    db = connect()
    rows = decision_rows(db, flags)
    print("%s: %d decision windows (%s)" % (command, len(rows), ", ".join("%s %s" % kv for kv in flags.items()) or "last 24 h"))
    if command == "skills":
        print_rows(skills_summary(rows), ["character", "skill", "chosen_h", "confirmed_h", "mana_h", "penalty_s_h", "damage_h",
                                          "damage_per_use", "kills_h", "miss_pct", "pulls_h", "predicted_per_cast",
                                          "realised_vs_predicted"])
    elif command == "weapons":
        print_rows(weapons_summary(db, rows, flags), ["character", "weapon", "worn_pct", "windows", "per_hit", "splash_pct",
                                                      "burn_pct"])
    elif command == "pulls":
        print_rows(pulls_summary(db, rows), ["character", "max_aggro_at_pull", "windows", "pulls_h", "close_calls_per_window",
                                             "taken_h", "mp_pots_h"])
    elif command == "time":
        for t in time_summary(rows):
            print("  %s  %.2f h, panicking %s%%" % (t["character"], t["hours"], t["panic_pct"]))
            for g in t["goals"]:
                print("      %5.1f%%  %s" % (g["pct"], g["goal"]))
    elif command == "before-danger":
        for e in before_danger(db, flags, int(flags.get("--last", 10))):
            print("  %s %s %s at %s (%s), low %s%%, %s damage in 10s, %s on them%s" % (
                e["at"], e["character"], e["event"], e["map"], e["goal"], e["min_hp_pct"], e["damage_10s"], e["targeting"],
                ", killer " + e["killer"] if e.get("killer") else ""))
            for d in e.get("decisions") or []:
                extra = ", ".join("%s %s" % (k, v) for k, v in d.items() if k not in ("kind", "name", "ms_ago"))
                print("      -%5.1fs  %-6s %s%s" % (d["ms_ago"] / 1000.0, d["kind"], d["name"], "  (" + extra + ")" if extra else ""))
            if not e.get("decisions"):
                print("      (no decisions recorded: before Overhaul 4.3)")
    db.close()


def decisions_status(db, now_ms):
    flags = {"--hours": 24}
    rows = decision_rows(db, flags)
    return {"skills": skills_summary(rows), "weapons": weapons_summary(db, rows, flags)}


SOURCES.append(("decisions.jsonl", add_decisions, ["decisions"]))


# --------------------------------------------------------------------------------------------------------------------------------- #
# BUILD COMPARISON — the overhaul's live check: one build against another at the same home, full windows at the spot only
# --------------------------------------------------------------------------------------------------------------------------------- #

COMPARE_MIN_WINDOWS = {"neutral": 6, "behaviour": 12}
COMPARE_PARTY_PROXY = "Myras"
COMPARE_FIGHTERS = ("Ulric", "Myras", "Riva")
COMPARE_MIN_CHANGE = 0.02


def compare_selector(arg):
    """A 7+ hex build SHA, or a local-time range 'start..end' (either side may be empty)."""
    if re.fullmatch(r"[0-9a-f]{7,40}", arg):
        return "build = ?", (arg[:7],), arg[:7]
    start, _, end = arg.partition("..")
    to_ms = lambda s: int(time.mktime(time.strptime(s, "%Y-%m-%dT%H:%M")) * 1000)
    lo = to_ms(start) if start else 0
    hi = to_ms(end) if end else 2 ** 53
    return "t >= ? AND t < ?", (lo, hi), arg


def compare_windows(db, where, args, home, who):
    return db.execute(
        "SELECT window_s, spot_kills, spot_xp, spot_gold + spot_chest_gold, deaths, hp_pots, mp_pots FROM ledger "
        "WHERE %s AND home = ? AND character = ? AND window_s BETWEEN 280 AND 320 AND at_spot_s >= window_s * 0.95"
        % where, args + (home, who)).fetchall()


def compare_settings(db, where, args, home):
    """The non-default ⚙️ settings the windows ran with; records from before settings were stamped are left out."""
    return sorted(r[0] for r in db.execute("SELECT DISTINCT settings FROM ledger WHERE %s AND home = ?" % where,
                                           args + (home,)) if r[0] is not None)


def per_hour(rows, i):
    return [r[i] * 3600.0 / r[0] for r in rows if r[i] is not None]


def compare_metric(a, b):
    """Change in the mean, and the change's standard error, both as fractions of A's mean."""
    if len(a) < 2 or len(b) < 2:
        return None
    ma, mb = statistics.mean(a), statistics.mean(b)
    if not ma:
        return None
    se = (statistics.variance(a) / len(a) + statistics.variance(b) / len(b)) ** 0.5
    return {"a": ma, "b": mb, "change": (mb - ma) / ma, "se": se / ma}


def metric_verdict(m):
    if not m:
        return "n/a"
    if abs(m["change"]) <= max(2 * m["se"], COMPARE_MIN_CHANGE):
        return "same"
    return "better" if m["change"] > 0 else "worse"


def compare_report(arg_a, arg_b, home=None, tier="neutral"):
    ingest()
    db = connect()
    wa, xa, label_a = compare_selector(arg_a)
    wb, xb, label_b = compare_selector(arg_b)
    if not home:
        row = db.execute("SELECT home, COUNT(*) FROM ledger WHERE %s GROUP BY home ORDER BY 2 DESC LIMIT 1" % wb,
                         xb).fetchone()
        home = row[0] if row else None
    if not home:
        print("no ledger windows for %s" % label_b)
        return "not enough data"

    need = COMPARE_MIN_WINDOWS[tier]
    print("compare at %s, %s tier (at least %d full windows at the spot per build)" % (home, tier, need))
    print("  A = %s    B = %s" % (label_a, label_b))
    sa, sb = compare_settings(db, wa, xa, home), compare_settings(db, wb, xb, home)
    if sa and sb and sa != sb:
        print("  settings differ, so this compares more than the code: A %s    B %s" % (
            " | ".join(x or "defaults" for x in sa), " | ".join(x or "defaults" for x in sb)))
    verdicts = []
    deaths_b = 0
    for who in COMPARE_FIGHTERS:
        ra, rb = compare_windows(db, wa, xa, home, who), compare_windows(db, wb, xb, home, who)
        deaths_b += sum(r[4] or 0 for r in rb)
        print("  %s: %d / %d windows" % (who, len(ra), len(rb)))
        metrics = [("xp/h", 2)]
        if who == COMPARE_PARTY_PROXY:
            metrics = [("kills/h", 1), ("xp/h", 2), ("gold/h", 3)]
        for name, i in metrics + [("mp pots/h", 6)]:
            m = compare_metric(per_hour(ra, i), per_hour(rb, i))
            v = metric_verdict(m) if len(ra) >= need and len(rb) >= need else "not enough data"
            if m:
                print("    %-10s %12.1f -> %12.1f  %+6.1f%%  (2 SE %4.1f%%)  %s" % (
                    name, m["a"], m["b"], 100 * m["change"], 200 * m["se"], v))
            if name in ("kills/h", "xp/h"):
                verdicts.append(v)

    close = db.execute("SELECT COUNT(*) FROM danger WHERE %s AND home = ? AND event = 'close_call'" % wb,
                       xb + (home,)).fetchone()[0]
    print("  B: %d deaths at the spot, %d close calls" % (deaths_b, close))

    if "not enough data" in verdicts:
        verdict = "not enough data"
    elif "worse" in verdicts:
        verdict = "worse"
    elif deaths_b:
        verdict = "read danger.jsonl before calling it"
    elif "better" in verdicts:
        verdict = "better"
    else:
        verdict = "same"
    print("verdict: %s" % verdict)
    db.close()
    return verdict


def variant_of(variants, name):
    for part in (variants or "").split(","):
        key, _, value = part.partition("=")
        if key == name:
            return value
    return None


def experiment_report(name, flags):
    """An experiment's variants against each other, from full ledger windows at the spot that started and ended on the
    same variant, at the home most of them were at. The first two variants (alphabetical) are A and B."""
    ingest()
    db = connect()
    flags = dict(flags)
    if not any(k in flags for k in ("--hours", "--build", "--range")):
        flags["--hours"] = 24 * 30
    where, args = period(flags)
    rows = db.execute(
        "SELECT character, home, variant_start, variant, window_s, spot_kills, spot_xp, spot_gold + spot_chest_gold, deaths, "
        "hp_pots, mp_pots, t FROM ledger WHERE %s AND window_s BETWEEN 280 AND 320 AND at_spot_s >= window_s * 0.95" % where,
        args).fetchall()
    kept = [r for r in rows if variant_of(r[2], name) is not None and variant_of(r[2], name) == variant_of(r[3], name)]
    if not kept:
        print("experiment %s: no full windows at the spot with one variant throughout" % name)
        db.close()
        return "not enough data"
    homes = {}
    for r in kept:
        homes[r[1]] = homes.get(r[1], 0) + 1
    home = max(homes, key=homes.get)
    kept = [r for r in kept if r[1] == home]
    labels = sorted({variant_of(r[2], name) for r in kept})
    print("experiment %s at %s: variants %s" % (name, home, ", ".join(labels)))
    if len(labels) < 2:
        print("verdict: not enough data (one variant seen)")
        db.close()
        return "not enough data"
    a, b = labels[0], labels[1]
    need = COMPARE_MIN_WINDOWS["behaviour"]
    verdicts = []
    for who in COMPARE_FIGHTERS:
        ra = [r[4:11] for r in kept if r[0] == who and variant_of(r[2], name) == a]
        rb = [r[4:11] for r in kept if r[0] == who and variant_of(r[2], name) == b]
        print("  %s: %s %d / %s %d windows" % (who, a, len(ra), b, len(rb)))
        metrics = [("xp/h", 2)]
        if who == COMPARE_PARTY_PROXY:
            metrics = [("kills/h", 1), ("xp/h", 2), ("gold/h", 3)]
        for metric, i in metrics + [("mp pots/h", 6)]:
            m = compare_metric(per_hour(ra, i), per_hour(rb, i))
            v = metric_verdict(m) if len(ra) >= need and len(rb) >= need else "not enough data"
            if m:
                print("    %-10s %12.1f -> %12.1f  %+6.1f%%  (2 SE %4.1f%%)  %s" % (
                    metric, m["a"], m["b"], 100 * m["change"], 200 * m["se"], v))
            if metric in ("kills/h", "xp/h"):
                verdicts.append(v)
    for label in (a, b):
        close = sum(1 for (variant,) in db.execute(
            "SELECT variant FROM danger WHERE event = 'close_call' AND home = ? AND %s" % where, (home,) + args)
            if variant_of(variant, name) == label)
        deaths = sum(r[8] or 0 for r in kept if variant_of(r[2], name) == label)
        print("  %s: %d deaths at the spot, %d close calls" % (label, deaths, close))
    verdict = ("not enough data" if "not enough data" in verdicts else "worse" if "worse" in verdicts
               else "better" if "better" in verdicts else "same")
    print("verdict (%s against %s): %s" % (b, a, verdict))
    db.close()
    return verdict


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "ingest"
    if command == "compare":
        args = sys.argv[2:]
        flags = {args[i]: args[i + 1] for i in range(len(args) - 1) if args[i].startswith("--")}
        plain = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
        if len(plain) != 2:
            print(__doc__)
            sys.exit(2)
        compare_report(plain[0], plain[1], flags.get("--home"), flags.get("--tier", "neutral"))
        return
    if command == "experiment" and len(sys.argv) > 2:
        args = sys.argv[3:]
        experiment_report(sys.argv[2], {args[i]: args[i + 1] for i in range(0, len(args) - 1, 2) if args[i].startswith("--")})
        return
    if command in ("skills", "weapons", "pulls", "time", "before-danger"):
        args = sys.argv[2:]
        question_report(command, {args[i]: args[i + 1] for i in range(0, len(args) - 1, 2) if args[i].startswith("--")})
        return
    if command == "rebuild":
        if os.path.exists(DB):
            os.remove(DB)
        command = "ingest"
    if command == "ingest":
        for name, n in ingest().items():
            if n:
                print("%-22s +%d" % (name, n))
    elif command == "survey":
        ingest()
        survey_report()
    elif command == "status":
        print(json.dumps(status(), indent=1))
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
