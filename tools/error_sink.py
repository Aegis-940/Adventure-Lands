#!/usr/bin/env python3
"""Local sink for the bot's error recorder.

The game runs in a browser and cannot write to disk, so Shared/Error_Log.js POSTs its records
here and this appends them to errors.json in the repo root — where Claude can read them on request
without anyone copying anything out of a console.

Run it and leave it:

    python tools/error_sink.py

Stdlib only, listens on 127.0.0.1 so nothing outside this machine can reach it, and the bot fails
silently when it isn't running (backing off to a retry every 5 minutes), so starting it is always
optional.
"""

import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8787
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "errors.json")


MAX_DEATHS = 50
MAX_TIMELINE = 300
MAX_SAMPLES = 5000


def merge(incoming):
    """Merge one character's payload into errors.json."""
    store = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as fh:
                store = json.load(fh)
        except Exception:
            store = {}

    who = incoming.get("character", "unknown")
    bucket = store.setdefault(who, {})
    bucket["session"] = incoming.get("session")

    recs = bucket.setdefault("records", {})
    for sig, rec in (incoming.get("records") or {}).items():
        prev = recs.get(sig)
        # The browser holds the authoritative count; for a signature it only ever grows.
        if not prev or rec.get("count", 0) >= prev.get("count", 0):
            recs[sig] = rec

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
    bucket["samples"] = [samples[k] for k in sorted(samples, key=lambda x: x[0] or 0)][-MAX_SAMPLES:]

    store["_updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(store, fh, indent=1, sort_keys=True)
    os.replace(tmp, OUT)  # atomic, so a read never sees a half-written file
    return sum(len(v.get("records", {})) for k, v in store.items() if k != "_updated")


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
            total = merge(payload)
            who = payload.get("character", "?")
            got = len(payload.get("records") or {})
            deaths = len(payload.get("deaths") or [])
            print("%s  %-8s %3d records, %d deaths in; %d stored" %
                  (datetime.now().strftime("%H:%M:%S"), who, got, deaths, total), flush=True)
            self.send_response(200)
        except Exception as exc:
            print("  ! %s" % exc, file=sys.stderr, flush=True)
            self.send_response(500)
        self._cors()
        self.end_headers()

    def log_message(self, *args):
        pass  # the prints above are the log; suppress the default request spam


if __name__ == "__main__":
    print("error sink -> %s" % OUT)
    print("listening on http://127.0.0.1:%d  (ctrl-c to stop)" % PORT, flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
