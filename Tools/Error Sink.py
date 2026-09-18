#!/usr/bin/env python3
"""Local sink for the bot's error recorder.

The game runs in a browser and cannot write to disk, so "Core Systems/Error Log.js" POSTs its
records here and this appends them to errors.json in the repo root — where Claude can read them on
request without anyone copying anything out of a console.

Run it and leave it:

    python "Tools/Error Sink.py"

Or install it as a logon task so it is always up, and never has to be remembered:

    powershell -ExecutionPolicy Bypass -File "Tools/Install Error Sink.ps1"

Stdlib only, listens on 127.0.0.1 so nothing outside this machine can reach it, and the bot fails
silently when it isn't running (backing off to a retry every 5 minutes), so starting it is always
optional.
"""

import json
import os
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8787
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "errors.json")
LOG = os.path.join(REPO, "errors.log")
LOG_MAX_BYTES = 1_000_000


MAX_DEATHS = 20
MAX_TIMELINE = 100
# Per KIND, not per character. A single character's cap lets the noisiest kind evict every other:
# the healer pushes ~10 target_choice/sec, which turned over a 5000-entry ring every six minutes
# and left 29 of her cluster samples alive. Capping per kind makes the window depend on the
# sampling rate of that kind alone.
MAX_SAMPLES_PER_KIND = 250

# A record names a line of code. Once that line has been edited the record describes something that
# no longer exists, so records are kept only for the build that produced them and the one before it
# -- the previous build stays so a deploy does not blank the evidence for the bug it was meant to
# fix. Ninety-seven builds had accumulated before this existed, and the three largest belonged to
# code deleted days earlier.
RETAIN_BUILDS = 2
RECORD_MAX_AGE_H = 12
# Samples carry no build, so age is the only handle on them. They are 74% of the file.
SAMPLE_MAX_AGE_H = 2

# Every limit above is per character and per kind, so none of them bounds the file, which is the
# thing that actually has to stay readable. This is the one that does: over the ceiling, the
# longest list loses its oldest quarter, repeatedly, until the store fits.
MAX_BYTES = 1_500_000

# Evicted in this order, and a later field is only touched once every earlier one is empty, so the
# cheap observations go long before the record of a death does.
TRIMMABLE = ("samples", "timeline", "deaths")

BUCKET_FIELDS = ("records", "samples", "deaths", "timeline", "counts")

# The maintenance sweep and a POST both rewrite the whole store, and the server is single-threaded
# only with respect to requests.
STORE_LOCK = threading.RLock()


def serialise(store):
    return json.dumps(store, sort_keys=True, separators=(",", ":"))


def enforce_ceiling(store):
    while True:
        blob = serialise(store)
        if len(blob) <= MAX_BYTES:
            return blob

        trimmed = False
        for field in TRIMMABLE:
            worst, worst_n = None, 0
            for who, bucket in store.items():
                if not isinstance(bucket, dict):
                    continue
                n = len(bucket.get(field) or [])
                if n > worst_n:
                    worst, worst_n = who, n
            if worst_n:
                victim = store[worst][field]
                del victim[:max(1, len(victim) // 4)]
                trimmed = True
                break

        if not trimmed:
            return blob


def cutoff_ms(hours):
    return (time.time() - hours * 3600) * 1000


def retained_builds(bucket, build):
    """Track the builds this character has reported under, newest last."""
    seen = bucket.setdefault("builds", [])
    if build and (not seen or seen[-1] != build):
        seen.append(build)
    del seen[:-RETAIN_BUILDS]
    return set(seen)


def prune_records(recs, keep_builds):
    # build is stamped when a signature is first seen and never rewritten, so it dates the
    # introduction, not the last sighting. Pruning on it drops signatures that are still firing
    # every second under current code. last_build is the one that answers "is this still live".
    cut = cutoff_ms(RECORD_MAX_AGE_H)
    return {
        sig: r for sig, r in recs.items()
        if (not keep_builds or (r.get("last_build") or r.get("build")) in keep_builds)
        and (r.get("last") or 0) >= cut
    }


def prune_samples(samples):
    cut = cutoff_ms(SAMPLE_MAX_AGE_H)
    by_kind = {}
    for s in sorted(samples, key=lambda s: s.get("t") or 0):
        if (s.get("t") or 0) < cut:
            continue
        by_kind.setdefault(s.get("kind"), []).append(s)
    kept = [s for group in by_kind.values() for s in group[-MAX_SAMPLES_PER_KIND:]]
    return sorted(kept, key=lambda s: s.get("t") or 0)


def load_store():
    if not os.path.exists(OUT):
        return {}
    try:
        with open(OUT, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def write_store(store):
    blob = enforce_ceiling(store)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        # Not indented: this file is read by tooling, and pretty-printing it cost a third of its size.
        fh.write(blob)
    # os.replace loses to any reader holding errors.json open on Windows (WinError 5), and the
    # caller's except discards the whole payload when it does. Retry briefly rather than drop it.
    for attempt in range(5):
        try:
            os.replace(tmp, OUT)  # atomic, so a read never sees a half-written file
            break
        except OSError:
            if attempt == 4:
                raise
            time.sleep(0.2)
    return blob


def merge(incoming):
    """Merge one character's payload into errors.json."""
    store = load_store()

    who = incoming.get("character", "unknown")
    bucket = store.setdefault(who, {})
    bucket["session"] = incoming.get("session")
    build = incoming.get("build")
    keep_builds = retained_builds(bucket, build)

    recs = bucket.setdefault("records", {})
    for sig, rec in (incoming.get("records") or {}).items():
        prev = recs.get(sig)
        # The browser holds the authoritative count; for a signature it only ever grows.
        if not prev or rec.get("count", 0) >= prev.get("count", 0):
            recs[sig] = rec
    bucket["records"] = prune_records(recs, keep_builds)

    # Same rule for the high-volume outcome counters: monotonic per bucket within a session, and a
    # reload restarts them from whatever localStorage held, so take the larger of the two.
    counts = bucket.setdefault("counts", {})
    for k, v in (incoming.get("counts") or {}).items():
        try:
            counts[k] = max(int(v), int(counts.get(k, 0)))
        except (TypeError, ValueError):
            counts[k] = v

    # Deaths and timeline accumulate across reloads, which the browser's own ring cannot do --
    # a reload wipes its buffer, and a reload is exactly what follows the interesting failures.
    deaths = {d.get("t"): d for d in bucket.get("deaths", [])}
    for d in incoming.get("deaths") or []:
        deaths[d.get("t")] = d
    bucket["deaths"] = [deaths[k] for k in sorted(deaths)][-MAX_DEATHS:]

    seen = {(e.get("t"), e.get("msg")): e for e in bucket.get("timeline", [])}
    for e in incoming.get("timeline") or []:
        seen[(e.get("t"), e.get("msg"))] = e
    bucket["timeline"] = [seen[k] for k in sorted(seen, key=lambda x: x[0] or 0)][-MAX_TIMELINE:]

    # Observations for analysis. The browser ring holds only the most recent few hundred, so the
    # sink is what makes a long run's worth available at once.
    samples = {(s.get("t"), s.get("kind")): s for s in bucket.get("samples", [])}
    for s in incoming.get("samples") or []:
        samples[(s.get("t"), s.get("kind"))] = s
    bucket["samples"] = prune_samples(samples.values())

    store["_updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write_store(store)
    return sum(len(v.get("records", {})) for k, v in store.items() if k != "_updated")


LOG_EVERY_S = 900
_last_said = {}
_posts = {}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            n = int(self.headers.get("content-length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            with STORE_LOCK:
                total = merge(payload)
            who = payload.get("character", "?")
            got = len(payload.get("records") or {})
            deaths = len(payload.get("deaths") or [])
            # One line per POST was ~880/hour with four characters up and nothing ever read it.
            # Summarise per character per minute instead; the file is a heartbeat, not a record.
            now = time.time()
            _posts[who] = _posts.get(who, 0) + 1
            if now - _last_said.get(who, 0) >= LOG_EVERY_S:
                _last_said[who] = now
                print("%s  %-8s %3d records, %d deaths, %d stored  (%d posts since last line)" %
                      (datetime.now().strftime("%H:%M:%S"), who, got, deaths, total, _posts[who]),
                      flush=True)
                _posts[who] = 0
            self.send_response(200)
        except Exception as exc:
            print("  ! %s" % exc, file=sys.stderr, flush=True)
            self.send_response(500)
        self._cors()
        self.end_headers()

    def log_message(self, *args):
        pass  # the prints above are the log; suppress the default request spam


SWEEP_EVERY_S = 900


def sweep(label):
    """Prune every character, not just the one whose payload arrived.

    Merging only prunes the poster, so a character that stops posting -- renamed, parked, or the run
    simply ended -- keeps its last state forever without this. A sink that is meant to stay up for
    weeks cannot do that only at startup, so the maintenance thread calls this on a timer too.
    """
    with STORE_LOCK:
        if not os.path.exists(OUT):
            return
        store = load_store()
        if not store:
            return

        before = os.path.getsize(OUT)
        for bucket in store.values():
            if not isinstance(bucket, dict):
                continue
            bucket["records"] = prune_records(bucket.get("records") or {}, set(bucket.get("builds") or []))
            bucket["samples"] = prune_samples(bucket.get("samples") or [])
            bucket["deaths"] = (bucket.get("deaths") or [])[-MAX_DEATHS:]
            bucket["timeline"] = (bucket.get("timeline") or [])[-MAX_TIMELINE:]

        # A probe, a typo or a retired character leaves a bucket behind that holds nothing. It costs
        # nothing to keep and reads as a character, so drop it; a real poster rebuilds its own.
        for who in [w for w, b in store.items()
                    if isinstance(b, dict) and not any(b.get(f) for f in BUCKET_FIELDS)]:
            del store[who]

        blob = write_store(store)

    print("%s  %s: %.2f MB -> %.2f MB" %
          (datetime.now().strftime("%H:%M:%S"), label, before / 1048576, len(blob) / 1048576),
          flush=True)


def maintenance_loop():
    while True:
        time.sleep(SWEEP_EVERY_S)
        try:
            sweep("swept")
        except Exception as exc:
            print("  ! sweep failed: %s" % exc, file=sys.stderr, flush=True)


def detach_logging():
    """Under pythonw.exe -- how the logon task runs it -- there is no console and sys.stdout is
    None, which turns the first print() into an AttributeError. Send the log to a file instead."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > LOG_MAX_BYTES:
            os.replace(LOG, LOG + ".old")
        fh = open(LOG, "a", encoding="utf-8", buffering=1)
        sys.stdout = fh
        sys.stderr = fh
    except Exception:
        devnull = open(os.devnull, "w")
        sys.stdout = devnull
        sys.stderr = devnull


if __name__ == "__main__":
    detach_logging()
    print("error sink -> %s" % OUT)
    sweep("swept on start")
    threading.Thread(target=maintenance_loop, daemon=True).start()
    print("listening on http://127.0.0.1:%d  (ctrl-c to stop)" % PORT, flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
