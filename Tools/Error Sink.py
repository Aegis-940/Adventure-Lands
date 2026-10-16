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

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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
# Only the last beat: the status page reads it when the live feed is stale. Downtime is read from the
# gaps between ledger windows.
MAX_ALIVE = 1

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
TRIMMABLE = ("samples", "alive", "timeline", "deaths")

BUCKET_FIELDS = ("records", "samples", "deaths", "timeline", "counts", "alive")

# The store lives in memory and is written to errors.json at most every STORE_WRITE_S. Reading and
# rewriting the whole 1.5 MB file on every POST (about 8 a minute) cost ~1.7 GB of writes a day, and a
# reader holding the file open on Windows (WinError 5) threw away the whole POST's merge.
STORE_LOCK = threading.RLock()
STORE = {}
STORE_DIRTY = threading.Event()
STORE_WRITE_S = 5

LIVE = {}
LIVE_LOCK = threading.Lock()

# The harness's decision fixtures (Tests/Harness.js promote reads them). Posted by errlog_snapshot(),
# appended here and nowhere else: they never touch the page's localStorage.
SNAPSHOT_ARCHIVE = os.path.join(REPO, "snapshots.jsonl")
SNAPSHOT_LOCK = threading.Lock()


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


TIMELINE_ARCHIVE = os.path.join(REPO, "errors_timeline.jsonl")


def archive_timeline(who, entries):
    """Append-only, trimmed to the last week once a day (trim_archives): the store keeps only the last
    MAX_TIMELINE entries, and a freeze's last minutes were pushed out by the next morning's traffic
    before anyone read them."""
    with open(TIMELINE_ARCHIVE, "a", encoding="utf-8") as fh:
        for e in sorted(entries, key=lambda x: x.get("t") or 0):
            stamp = datetime.fromtimestamp((e.get("t") or 0) / 1000).strftime("%Y-%m-%d %H:%M:%S")
            fh.write(json.dumps({"at": stamp, "character": who, **e}, ensure_ascii=False) + "\n")


BOSS_PROFILE_ARCHIVE = os.path.join(REPO, "boss_profiles.jsonl")

# Sample kinds kept for good, one file each. The rest live only in errors.json, about two hours.
# Measured 2026-10-15 from the live rings: damage about 4 MB/day per fighter, heal 1.2, cc_report 0.9 (Ulric),
# target_choice 0.1. weapon_choice (~46 MB/day) and burn_state (~17) are rolled up per window instead.
SAMPLE_ARCHIVES = {
    "boss_profile": BOSS_PROFILE_ARCHIVE,
    "damage": os.path.join(REPO, "damage.jsonl"),
    "heal": os.path.join(REPO, "heal.jsonl"),
    "target_choice": os.path.join(REPO, "target_choice.jsonl"),
    "cc_report": os.path.join(REPO, "cc_report.jsonl"),
}


def archive_sample_kinds(bucket, who, samples):
    """Each kind is written once: a per-kind high-water mark on t, as the page resends its whole ring every push."""
    marks = bucket.setdefault("samples_archived", {"boss_profile": bucket.pop("profiles_archived_to", 0)})
    for kind, path in SAMPLE_ARCHIVES.items():
        fresh = [s for s in samples if s.get("kind") == kind and (s.get("t") or 0) > marks.get(kind, 0)]
        if fresh:
            archive_samples(path, who, fresh)
            marks[kind] = max(s.get("t") or 0 for s in fresh)


def archive_samples(path, who, samples):
    with open(path, "a", encoding="utf-8") as fh:
        for s in sorted(samples, key=lambda x: x.get("t") or 0):
            stamp = datetime.fromtimestamp((s.get("t") or 0) / 1000).strftime("%Y-%m-%d %H:%M:%S")
            fh.write(json.dumps({"at": stamp, "character": who, **s}, ensure_ascii=False) + "\n")


# The page's errlog_archive() lane: one file per kind, each entry written once (the page re-sends its
# whole ring every push, so a per-kind high-water mark on t is what keeps the files duplicate-free).
ARCHIVES = {
    "ledger": os.path.join(REPO, "ledger.jsonl"),
    "tracker": os.path.join(REPO, "tracker.jsonl"),
    "survey_spot": os.path.join(REPO, "survey.jsonl"),
    "danger": os.path.join(REPO, "danger.jsonl"),
    "decisions": os.path.join(REPO, "decisions.jsonl"),
}


def archive_lane(bucket, who, entries):
    marks = bucket.setdefault("archived", {})
    for kind, path in ARCHIVES.items():
        fresh = [e for e in entries if e.get("kind") == kind and (e.get("t") or 0) > marks.get(kind, 0)]
        if fresh:
            archive_samples(path, who, fresh)
            marks[kind] = max(e.get("t") or 0 for e in fresh)


def merge_lifecycle(incoming):
    """A sendBeacon from the page as it is hidden, frozen or resumed. It carries one entry and
    arrives when the page may be about to stop running, so it goes straight to the archive."""
    store = STORE
    who = incoming.get("character", "unknown")
    entry = {"t": incoming["lifecycle"].get("t"), "ctx": "lifecycle", "msg": incoming["lifecycle"].get("msg")}
    bucket = store.setdefault(who, {})
    timeline = bucket.setdefault("timeline", [])
    timeline.append(entry)
    bucket["timeline"] = sorted(timeline, key=lambda x: x.get("t") or 0)[-MAX_TIMELINE:]
    archive_timeline(who, [entry])
    STORE_DIRTY.set()
    return len(store)


def merge(incoming):
    """Merge one character's payload into errors.json."""
    if "lifecycle" in incoming:
        return merge_lifecycle(incoming)
    store = STORE

    who = incoming.get("character", "unknown")
    bucket = store.setdefault(who, {})
    bucket["session"] = incoming.get("session")
    build = incoming.get("build")
    keep_builds = retained_builds(bucket, build)

    recs = bucket.setdefault("records", {})
    for sig, rec in (incoming.get("records") or {}).items():
        prev = recs.get(sig)
        # The browser holds the authoritative count. It only grows within a 24h window, and a newer
        # first means the page started a new window, so its lower count replaces the old one.
        if not prev or rec.get("count", 0) >= prev.get("count", 0) or (rec.get("first") or 0) > (prev.get("first") or 0):
            recs[sig] = rec
    bucket["records"] = prune_records(recs, keep_builds)

    # The counters only ever climb within a window, and a reload resumes them from localStorage, so
    # take the larger of the two. When the browser rolls the window it stamps a newer counts_since,
    # and taking the larger would then pin the old totals forever -- so a newer stamp replaces.
    inc_since = incoming.get("counts_since") or 0
    if inc_since > (bucket.get("counts_since") or 0):
        bucket["counts"] = dict(incoming.get("counts") or {})
        bucket["counts_since"] = inc_since
    else:
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
    fresh = []
    for e in incoming.get("timeline") or []:
        key = (e.get("t"), e.get("msg"))
        if key not in seen and (e.get("t") or 0) > bucket.get("archived_to", 0):
            fresh.append(e)
        seen[key] = e
    bucket["timeline"] = [seen[k] for k in sorted(seen, key=lambda x: x[0] or 0)][-MAX_TIMELINE:]
    if fresh:
        archive_timeline(who, fresh)
        bucket["archived_to"] = max(e.get("t") or 0 for e in fresh)

    # Observations for analysis. The browser ring holds only the most recent few hundred, so the
    # sink is what makes a long run's worth available at once.
    samples = {(s.get("t"), s.get("kind")): s for s in bucket.get("samples", [])}
    for s in incoming.get("samples") or []:
        samples[(s.get("t"), s.get("kind"))] = s
    bucket["samples"] = prune_samples(samples.values())

    archive_sample_kinds(bucket, who, incoming.get("samples") or [])

    archive_lane(bucket, who, incoming.get("archive") or [])

    # Heartbeats answer "was the tab still running", so they must outlive the sample age cut --
    # an overnight freeze is only legible the next morning, hours after SAMPLE_MAX_AGE_H.
    beats = {b.get("t"): b for b in bucket.get("alive", [])}
    for b in incoming.get("alive") or []:
        beats[b.get("t")] = b
    bucket["alive"] = [beats[k] for k in sorted(beats, key=lambda x: x or 0)][-MAX_ALIVE:]

    store["_updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    STORE_DIRTY.set()
    return sum(len(v.get("records", {})) for k, v in store.items() if k != "_updated")


LOG_EVERY_S = 900
_last_said = {}
_posts = {}


# The bot's code, served from this PC: the Code Loader's only source. /code/main is the commit main is on, and
# /code/<sha>/<path> is a .js file as committed at that sha, so one load never mixes two commits. Files come from git,
# never the working tree, so only what has been merged to main can run. GitHub is a backup, not a source.
CODE_KEEP = 4
SLOW_REQUEST_S = 1.0
CODE_LOCK = threading.Lock()
_code_trees = {}


def git(*args, stdin=None):
    return subprocess.run(["git", "-C", REPO] + list(args), input=stdin, capture_output=True, check=True,
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout


def main_sha():
    """Read from the ref file, not `git rev-parse`: a process start on Windows can stall for a second under antivirus."""
    loose = os.path.join(REPO, ".git", "refs", "heads", "main")
    if os.path.exists(loose):
        with open(loose, encoding="ascii") as fh:
            return fh.read().strip()
    with open(os.path.join(REPO, ".git", "packed-refs"), encoding="ascii") as fh:
        for line in fh:
            if line.rstrip().endswith(" refs/heads/main"):
                return line.split()[0]
    raise OSError("no main ref")


def code_tree(sha):
    """Every .js file at sha, read with one ls-tree and one cat-file --batch, kept for the last CODE_KEEP commits."""
    with CODE_LOCK:
        if sha in _code_trees:
            return _code_trees[sha]
        entries = []
        for item in git("ls-tree", "-r", "-z", sha).split(b"\0"):
            if not item:
                continue
            meta, path = item.split(b"\t", 1)
            mode, kind, blob = meta.split()
            if kind == b"blob" and path.endswith(b".js"):
                entries.append((path.decode("utf-8"), blob.decode("ascii")))
        out = git("cat-file", "--batch", stdin="".join(blob + "\n" for _, blob in entries).encode("ascii"))
        files, at = {}, 0
        for path, blob in entries:
            header_end = out.index(b"\n", at)
            size = int(out[at:header_end].split()[2])
            files[path] = out[header_end + 1:header_end + 1 + size]
            at = header_end + 1 + size + 1
        _code_trees[sha] = files
        while len(_code_trees) > CODE_KEEP:
            _code_trees.pop(next(iter(_code_trees)))
        return files


def code_response(route):
    """(body, content type), or None for a 404."""
    rest = urllib.parse.unquote(route[len("/code/"):])
    if rest == "main":
        return main_sha().encode("ascii"), "text/plain; charset=utf-8"
    if rest == "ping.js":
        return b"window.__al_code_ping = Date.now();", "application/javascript; charset=utf-8"
    sha, _, path = rest.partition("/")
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        return None
    body = code_tree(sha).get(path)
    return (body, "application/javascript; charset=utf-8") if body is not None else None


class Handler(BaseHTTPRequestHandler):
    def handle_one_request(self):
        started = time.time()
        super().handle_one_request()
        took = time.time() - started
        if took > SLOW_REQUEST_S:
            print("%s  slow %s %s %.1fs" % (datetime.now().strftime("%H:%M:%S"), getattr(self, "command", "?"),
                                           getattr(self, "path", "?").split("?")[0], took), flush=True)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path.split("?")[0] == "/live":
            return self.live_post()
        if self.path.split("?")[0] == "/snapshot":
            return self.snapshot_post()
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

    def live_post(self):
        """Each character's 📊 session snapshot, once a second. Memory only: the page wants the latest,
        and the ledger already keeps the history."""
        try:
            n = int(self.headers.get("content-length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            with LIVE_LOCK:
                LIVE[payload.get("character", "?")] = payload
            self.send_response(204)
        except Exception as exc:
            print("  ! live: %s" % exc, file=sys.stderr, flush=True)
            self.send_response(400)
        self._cors()
        self.end_headers()

    def snapshot_post(self):
        try:
            n = int(self.headers.get("content-length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            stamp = datetime.fromtimestamp((payload.get("t") or 0) / 1000).strftime("%Y-%m-%d %H:%M:%S")
            with SNAPSHOT_LOCK:
                with open(SNAPSHOT_ARCHIVE, "a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"at": stamp, **payload}, ensure_ascii=False) + "\n")
            self.send_response(204)
        except Exception as exc:
            print("  ! snapshot: %s" % exc, file=sys.stderr, flush=True)
            self.send_response(400)
        self._cors()
        self.end_headers()

    def do_GET(self):
        """The status page at /, its data at /api/status (built fresh by Data Store.py on each call), and the
        characters' live session snapshots at /api/live."""
        try:
            route = self.path.split("?")[0]
            if route in ("/", "/status"):
                with open(STATUS_PAGE, "rb") as fh:
                    body, ctype = fh.read(), "text/html; charset=utf-8"
            elif route == "/api/status":
                body, ctype = json.dumps(load_data_store().status()).encode("utf-8"), "application/json"
            elif route.startswith("/code/"):
                found = code_response(route)
                if not found:
                    self.send_response(404)
                    self._cors()
                    self.end_headers()
                    return
                body, ctype = found
            elif route == "/api/live":
                with LIVE_LOCK:
                    body = json.dumps({"now": int(time.time() * 1000), "characters": LIVE}).encode("utf-8")
                ctype = "application/json"
            else:
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("content-type", ctype)
            self.send_header("cache-control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            print("  ! GET %s: %s" % (self.path, exc), file=sys.stderr, flush=True)
            self.send_response(500)
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
        store = STORE
        if not store:
            return

        before = os.path.getsize(OUT) if os.path.exists(OUT) else 0
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
        STORE_DIRTY.clear()

    print("%s  %s: %.2f MB -> %.2f MB" %
          (datetime.now().strftime("%H:%M:%S"), label, before / 1048576, len(blob) / 1048576),
          flush=True)


DATA_STORE = os.path.join(REPO, "Tools", "Data Store.py")
PARTY_MODEL = os.path.join(REPO, "Tools", "Party Model.js")
STATUS_PAGE = os.path.join(REPO, "Tools", "Status Page.html")


def load_data_store():
    """Loaded per request, so an edit to Data Store.py shows on the page without restarting the sink."""
    spec = importlib.util.spec_from_file_location("data_store", DATA_STORE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_tool(label, argv):
    """A separate process, so a slow or broken tool never holds the store lock or takes the sink down."""
    done = subprocess.run(argv, cwd=REPO, capture_output=True, text=True, timeout=600,
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if done.returncode:
        print("  ! %s failed: %s" % (label, (done.stderr or done.stdout).strip()[-500:]), file=sys.stderr, flush=True)


def refresh_data_store():
    run_tool("data store ingest", [sys.executable, DATA_STORE, "ingest"])
    node = shutil.which("node")
    if node:
        run_tool("party model", [node, PARTY_MODEL, "json"])
    else:
        print("  ! node not found on PATH; party_model.json is not refreshed", file=sys.stderr, flush=True)


# Archives that only answer "what happened lately" keep a week, trimmed once a day. The others (the ledger,
# decisions, danger, damage, heal, boss profilesâ€¦) are kept whole: they are the history the reports read.
TRIM_DAYS = 7
TRIM_EVERY_S = 24 * 3600
TRIMMED = ((TIMELINE_ARCHIVE, STORE_LOCK), (SNAPSHOT_ARCHIVE, SNAPSHOT_LOCK))
_last_trim = 0


def trim_archive(path, lock, days):
    """Keeps the lines stamped in the last `days` days. Every archive line starts {"at": "YYYY-MM-DD HH:MM:SS", so the
    stamp is read without parsing the line. A leftover .old (the snapshot rotation before 10-16) is folded in first."""
    cutoff = datetime.fromtimestamp(time.time() - days * 86400).strftime("%Y-%m-%d %H:%M:%S")
    sources = [f for f in (path + ".old", path) if os.path.exists(f)]
    if not sources:
        return
    with lock:
        before = sum(os.path.getsize(f) for f in sources)
        tmp = path + ".trim"
        with open(tmp, "w", encoding="utf-8") as out:
            for source in sources:
                with open(source, encoding="utf-8") as fh:
                    for line in fh:
                        if line[8:27] >= cutoff:
                            out.write(line)
        os.replace(tmp, path)
        if path + ".old" in sources:
            os.remove(path + ".old")
    print("%s  trimmed %s to %d days: %.0f MB -> %.0f MB" % (datetime.now().strftime("%H:%M:%S"), os.path.basename(path),
                                                            days, before / 1048576, os.path.getsize(path) / 1048576),
          flush=True)


def trim_archives():
    global _last_trim
    if time.time() - _last_trim < TRIM_EVERY_S:
        return
    _last_trim = time.time()
    for path, lock in TRIMMED:
        try:
            trim_archive(path, lock, TRIM_DAYS)
        except Exception as exc:
            print("  ! trim of %s failed: %s" % (os.path.basename(path), exc), file=sys.stderr, flush=True)


def store_writer():
    while True:
        time.sleep(STORE_WRITE_S)
        flush_store()


def flush_store():
    if not STORE_DIRTY.is_set():
        return
    try:
        with STORE_LOCK:
            STORE_DIRTY.clear()
            write_store(STORE)
    except Exception as exc:
        STORE_DIRTY.set()
        print("  ! errors.json write failed, retrying: %s" % exc, file=sys.stderr, flush=True)


def maintenance_loop():
    while True:
        trim_archives()
        rotate_log()
        try:
            refresh_data_store()
        except Exception as exc:
            print("  ! data store refresh failed: %s" % exc, file=sys.stderr, flush=True)
        time.sleep(SWEEP_EVERY_S)
        try:
            sweep("swept")
        except Exception as exc:
            print("  ! sweep failed: %s" % exc, file=sys.stderr, flush=True)


SOURCE = os.path.abspath(__file__)
SOURCE_POLL_S = 5
RESTART = threading.Event()


class Sink(ThreadingHTTPServer):
    # Off, so a second sink fails to bind instead of silently splitting the traffic with the first.
    # That is what keeps a restart from leaving two of these alive.
    allow_reuse_address = False
    # Threaded so the once-a-second live posts and page polls never queue behind an errors.json merge;
    # STORE_LOCK still serialises the merges themselves.
    daemon_threads = True


def bind_server(attempts=20, wait=0.5):
    """Take the port, waiting out the previous process's socket if a restart is still letting go."""
    for _ in range(attempts):
        try:
            return Sink(("127.0.0.1", PORT), Handler)
        except OSError:
            time.sleep(wait)
    return None


def source_mtime():
    try:
        return os.path.getmtime(SOURCE)
    except OSError:
        return 0.0


def restart_watch(server, known):
    """Re-exec when this file changes, so editing the sink is enough to deploy it.

    It runs as a logon task and stays up for weeks, so without this every change needs someone to
    remember a manual restart. The new source is compiled before exec: a half-written or broken
    file leaves the running copy alone rather than taking the sink down with it.
    """
    while True:
        time.sleep(SOURCE_POLL_S)
        seen = source_mtime()
        if not seen or seen == known:
            continue
        known = seen
        try:
            with open(SOURCE, encoding="utf-8") as fh:
                compile(fh.read(), SOURCE, "exec")
        except Exception as exc:
            print("  ! source changed but will not compile, staying on the running copy: %s" % exc,
                  file=sys.stderr, flush=True)
            continue
        print("%s  source changed -- restarting" % datetime.now().strftime("%H:%M:%S"), flush=True)
        # The respawn belongs to the main thread. Doing it here would race: shutdown() lets
        # serve_forever() return, the interpreter reaches the end of __main__, and this daemon
        # thread is killed before it can spawn anything.
        RESTART.set()
        server.shutdown()
        return


LOG_FILE = None


def open_log():
    global LOG_FILE
    if os.path.exists(LOG) and os.path.getsize(LOG) > LOG_MAX_BYTES:
        os.replace(LOG, LOG + ".old")
    LOG_FILE = open(LOG, "a", encoding="utf-8", buffering=1)
    sys.stdout = LOG_FILE
    sys.stderr = LOG_FILE


def rotate_log():
    """The log grows while the sink runs for weeks, so it rotates at LOG_MAX_BYTES on the maintenance timer too, not
    only at start. The file is closed first: Windows won't rename a file that is open."""
    if LOG_FILE is None or os.path.getsize(LOG) <= LOG_MAX_BYTES:
        return
    LOG_FILE.close()
    open_log()


def detach_logging():
    """Under pythonw.exe -- how the logon task runs it -- there is no console and sys.stdout is
    None, which turns the first print() into an AttributeError. Send the log to a file instead."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        open_log()
    except Exception:
        devnull = open(os.devnull, "w")
        sys.stdout = devnull
        sys.stderr = devnull


if __name__ == "__main__":
    detach_logging()
    print("error sink -> %s" % OUT)
    STORE.update(load_store())
    sweep("swept on start")
    threading.Thread(target=store_writer, daemon=True).start()
    threading.Thread(target=maintenance_loop, daemon=True).start()
    httpd = bind_server()
    if httpd is None:
        print("port %d is already served -- another sink owns it, leaving it alone" % PORT,
              file=sys.stderr, flush=True)
        sys.exit(0)
    threading.Thread(target=restart_watch, args=(httpd, source_mtime()), daemon=True).start()
    print("listening on http://127.0.0.1:%d  (ctrl-c to stop)" % PORT, flush=True)
    httpd.serve_forever()
    httpd.server_close()
    flush_store()
    if RESTART.is_set():
        # Not os.execv: on Windows it does not quote, so a path with a space in it -- which this
        # one has -- is split and the replacement process dies on a truncated filename.
        subprocess.Popen([sys.executable, SOURCE], cwd=os.path.dirname(SOURCE), close_fds=True)
