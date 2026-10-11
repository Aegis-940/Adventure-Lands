#!/usr/bin/env python3
"""Builds al_data.sqlite from the sink's .jsonl archives, and reports from it.

    python "Tools/Data Store.py" ingest     bring the database up to date (the sink does this every 15 minutes)
    python "Tools/Data Store.py" rebuild    delete the database and ingest everything again
    python "Tools/Data Store.py" survey     survey results, one row per spot
    python "Tools/Data Store.py" status     the status page's JSON

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
    kills_by_type TEXT, spot_kills_by_type TEXT, party TEXT, gear TEXT);
CREATE TABLE IF NOT EXISTS survey (
    character TEXT, t INTEGER, at TEXT, spot TEXT, status TEXT, visits INTEGER, at_spot_s INTEGER,
    travel_s INTEGER, deaths INTEGER);
CREATE TABLE IF NOT EXISTS tracker (character TEXT, t INTEGER, at TEXT, level INTEGER, monsters TEXT, max TEXT);
CREATE TABLE IF NOT EXISTS tracker_monsters (character TEXT, t INTEGER, mtype TEXT, kills INTEGER, score REAL,
    account_score REAL, account_holder TEXT);
CREATE TABLE IF NOT EXISTS boss_profiles (character TEXT, t INTEGER, at TEXT, boss TEXT, killed INTEGER,
    fight_secs REAL, raw TEXT);
CREATE TABLE IF NOT EXISTS deaths (character TEXT, t INTEGER, at TEXT, msg TEXT);
CREATE TABLE IF NOT EXISTS danger (character TEXT, t INTEGER, at TEXT, kind TEXT, map TEXT, home TEXT, goal TEXT,
    killer TEXT, min_hp_pct INTEGER, low_for_s INTEGER, damage_10s INTEGER, targeting INTEGER, mp_pct INTEGER,
    panicking INTEGER, raw TEXT);
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
    db.execute("INSERT INTO survey VALUES (?,?,?,?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("spot"), r.get("status"), r.get("visits"),
        r.get("at_spot_s"), r.get("travel_s"), r.get("deaths")))


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
    db.execute("INSERT INTO danger VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        r.get("character"), r.get("t"), r.get("at"), r.get("kind"), r.get("map"), r.get("home"), r.get("goal"),
        r.get("killer"), 0 if r.get("kind") == "death" else r.get("min_hp_pct"), r.get("low_for_s"), r.get("damage_10s"),
        r.get("targeting"), r.get("mp_pct"), 1 if r.get("panicking") else 0, json.dumps(r)))


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
    only the ledger windows since its latest retry, and everything since the latest survey_reset()."""
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
    spots = {s for (s,) in db.execute("SELECT DISTINCT survey_spot FROM ledger WHERE survey_spot IS NOT NULL AND t >= ?",
                                      (reset_t,))}
    spots |= set(status)
    if state:
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
        if r.get("kind") == "death":
            detailed.append((who, t))
    for who, t, at, msg in db.execute("SELECT character, t, at, msg FROM deaths ORDER BY t DESC LIMIT ?", (DANGER_EVENTS,)):
        if any(w == who and abs(t - dt) < DANGER_MATCH_MS for w, dt in detailed):
            continue
        events.append({"kind": "death", "character": who, "t": t, "at": at, "note": msg, "detail": False})
    events.sort(key=lambda e: -(e.get("t") or 0))
    counts = {}
    for label, since in (("day", now_ms - 24 * HOUR_MS), ("week", now_ms - 7 * 24 * HOUR_MS)):
        logged = db.execute("SELECT character, t FROM deaths WHERE t >= ?", (since,)).fetchall()
        extra = [(w, t) for w, t in db.execute("SELECT character, t FROM danger WHERE kind = 'death' AND t >= ?", (since,))
                 if not any(lw == w and abs(lt - t) < DANGER_MATCH_MS for lw, lt in logged)]
        deaths = len(logged) + len(extra)
        close = db.execute("SELECT COUNT(*) FROM danger WHERE kind = 'close_call' AND t >= ?", (since,)).fetchone()[0]
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
    }
    db.close()
    return out


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
    elif command == "status":
        print(json.dumps(status(), indent=1))
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
