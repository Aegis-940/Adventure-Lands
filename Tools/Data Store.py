#!/usr/bin/env python3
"""Builds al_data.sqlite from the sink's .jsonl archives, and reports from it.

    python "Tools/Data Store.py" ingest     bring the database up to date (the sink does this every 15 minutes)
    python "Tools/Data Store.py" rebuild    delete the database and ingest everything again
    python "Tools/Data Store.py" survey     survey results, one row per spot

The .jsonl files are the record. The database is derived from them, so it can be deleted at any time.
Ingest is incremental: each file's byte offset is remembered, and a file that shrank is re-read from
the start.
"""

import json
import os
import re
import sqlite3
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(REPO, "al_data.sqlite")

SCHEMA = """
CREATE TABLE IF NOT EXISTS ingested (file TEXT PRIMARY KEY, offset INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
    character TEXT, t INTEGER, at TEXT, window_s INTEGER, at_spot_s INTEGER, map TEXT, home TEXT,
    survey_spot TEXT, level INTEGER, gold INTEGER, chest_gold INTEGER, xp INTEGER, kills INTEGER,
    spot_gold INTEGER, spot_chest_gold INTEGER, spot_xp INTEGER, spot_kills INTEGER, deaths INTEGER,
    hp_pots INTEGER, mp_pots INTEGER, players_nearby INTEGER, goldm REAL, xpm REAL, luckm REAL,
    kills_by_type TEXT, spot_kills_by_type TEXT, party TEXT, gear TEXT);
CREATE TABLE IF NOT EXISTS survey (
    character TEXT, t INTEGER, at TEXT, spot TEXT, status TEXT, visits INTEGER, at_spot_s INTEGER,
    travel_s INTEGER, deaths INTEGER, holds_lost INTEGER);
CREATE TABLE IF NOT EXISTS tracker (character TEXT, t INTEGER, at TEXT, level INTEGER, monsters TEXT, max TEXT);
CREATE TABLE IF NOT EXISTS tracker_kills (character TEXT, t INTEGER, mtype TEXT, kills INTEGER);
CREATE TABLE IF NOT EXISTS boss_profiles (character TEXT, t INTEGER, at TEXT, boss TEXT, killed INTEGER,
    fight_secs REAL, raw TEXT);
CREATE TABLE IF NOT EXISTS deaths (character TEXT, t INTEGER, at TEXT, msg TEXT);
CREATE TABLE IF NOT EXISTS bscorpion_kills (character TEXT, t INTEGER, at TEXT, secs REAL, avg_secs REAL);
CREATE INDEX IF NOT EXISTS ledger_spot ON ledger (survey_spot, character);
CREATE INDEX IF NOT EXISTS ledger_home ON ledger (home, character);
"""


def count(kills):
    return sum((kills or {}).values())


def add_ledger(db, r):
    spot = r.get("spot") or {}
    potions = r.get("potions") or {}
    db.execute("INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("window_s"), r.get("at_spot_s"), r.get("map"),
        r.get("home"), r.get("survey_spot"), r.get("level"), r.get("gold"), r.get("chest_gold"), r.get("xp"),
        count(r.get("kills")), spot.get("gold"), spot.get("chest_gold"), spot.get("xp"), count(spot.get("kills")),
        r.get("deaths"), potions.get("hp"), potions.get("mp"), r.get("players_nearby"), r.get("goldm"),
        r.get("xpm"), r.get("luckm"), json.dumps(r.get("kills") or {}), json.dumps(spot.get("kills") or {}),
        json.dumps(r.get("party") or []), json.dumps(r.get("gear") or {})))


def add_survey(db, r):
    db.execute("INSERT INTO survey VALUES (?,?,?,?,?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("spot"), r.get("status"), r.get("visits"),
        r.get("at_spot_s"), r.get("travel_s"), r.get("deaths"), r.get("holds_lost")))


def add_tracker(db, r):
    db.execute("INSERT INTO tracker VALUES (?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("level"),
        json.dumps(r.get("monsters") or {}), json.dumps(r.get("max") or {})))
    db.executemany("INSERT INTO tracker_kills VALUES (?,?,?,?)", [
        (r.get("character"), r.get("t"), mtype, n) for mtype, n in (r.get("monsters") or {}).items()])


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
    ("tracker.jsonl", add_tracker, ["tracker", "tracker_kills"]),
    ("boss_profiles.jsonl", add_boss_profile, ["boss_profiles"]),
    ("errors_timeline.jsonl", add_timeline, ["deaths", "bscorpion_kills"]),
]


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
    db = sqlite3.connect(DB)
    db.executescript(SCHEMA)
    return db


def ingest():
    db = connect()
    with db:
        added = {name: ingest_file(db, name, add, tables) for name, add, tables in SOURCES}
    db.close()
    return added


# --------------------------------------------------------------------------------------------------------------------------------- #
# SURVEY REPORT
# --------------------------------------------------------------------------------------------------------------------------------- #

SURVEY_OWNER = "Myras"
GOLD_HEALTHY = 20_000_000
XP_MIN_HEALTHY = 1_000_000
GOLD_BANDS = [(30_000_000, "high"), (20_000_000, "healthy"), (5_000_000, "fair"), (0, "low")]
XP_BANDS = [(1_500_000, "high"), (1_000_000, "average"), (500_000, "fair"), (0, "low")]


def band(value, bands):
    return next(name for floor, name in bands if value >= floor)


def survey_report():
    db = connect()
    status = {}
    for spot, st, at_spot_s, deaths, holds, visits in db.execute(
            "SELECT spot, status, at_spot_s, deaths, holds_lost, visits FROM survey "
            "WHERE spot IS NOT NULL ORDER BY t"):
        status[spot] = (st, at_spot_s, deaths, holds, visits)

    rows = []
    for (spot,) in db.execute("SELECT DISTINCT survey_spot FROM ledger WHERE survey_spot IS NOT NULL"):
        owner = db.execute(
            "SELECT SUM(at_spot_s), SUM(spot_chest_gold), SUM(spot_kills), MAX(players_nearby) "
            "FROM ledger WHERE survey_spot = ? AND character = ?", (spot, SURVEY_OWNER)).fetchone()
        secs, gold, kills, crowd = (owner[0] or 0, owner[1] or 0, owner[2] or 0, owner[3] or 0)
        xp_rates = [xp * 60 / s for xp, s in db.execute(
            "SELECT SUM(spot_xp), SUM(at_spot_s) FROM ledger WHERE survey_spot = ? GROUP BY character", (spot,))
            if s]
        if not secs:
            rows.append((spot, None))
            continue
        gold_hr = gold * 3600 / secs
        xp_min = sum(xp_rates) / len(xp_rates) if xp_rates else 0
        rows.append((spot, {
            "min": secs / 60, "kills_hr": kills * 3600 / secs, "gold_hr": gold_hr, "xp_min": xp_min,
            "score": gold_hr / GOLD_HEALTHY + xp_min / XP_MIN_HEALTHY, "crowd": crowd,
        }))
    db.close()

    measured = sorted([r for r in rows if r[1]], key=lambda r: -r[1]["score"])
    seen = {r[0] for r in rows}
    print("%-11s %-11s %5s %8s %12s %-8s %10s %-8s %6s %6s %5s %6s" % (
        "spot", "status", "min", "kills/h", "gold/h", "", "xp/min", "", "score", "deaths", "holds", "crowd"))
    for spot, m in measured:
        st, _, deaths, holds, _ = status.get(spot, ("running", 0, 0, 0, 0))
        print("%-11s %-11s %5.0f %8.0f %12s %-8s %10s %-8s %6.2f %6s %5s %6d" % (
            spot, st, m["min"], m["kills_hr"], "{:,.0f}".format(m["gold_hr"]), band(m["gold_hr"], GOLD_BANDS),
            "{:,.0f}".format(m["xp_min"]), band(m["xp_min"], XP_BANDS), m["score"], deaths, holds, m["crowd"]))
    for spot, (st, at_spot_s, deaths, holds, visits) in status.items():
        if spot not in seen or not dict(rows).get(spot):
            print("%-11s %-11s %5.0f  (no ledger data at the spot; %s visit(s), %s deaths, %s holds lost)" % (
                spot, st, (at_spot_s or 0) / 60, visits, deaths, holds))
    print("\nscore = gold/hr / 20M + XP/min / 1M (2.0 = healthy on both). Gold is party chest gold seen by %s;"
          " XP/min is the mean across fighters." % SURVEY_OWNER)


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "ingest"
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
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
