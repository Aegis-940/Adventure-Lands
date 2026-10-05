#!/usr/bin/env python3

import base64
import glob
import json
import os
import re
import select
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime

PORT = 9222
LOCK_PORT = 8788
SINK_URL = "http://127.0.0.1:8787/errors"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS = os.path.join(REPO, "watchdog.jsonl")
STATUS = os.path.join(REPO, "watchdog.json")
LOG = os.path.join(REPO, "watchdog.log")
PAUSE = os.path.join(REPO, "watchdog.pause")
LOG_MAX_BYTES = 1_000_000
SOURCE = os.path.abspath(__file__)

LIST_EVERY_S = 15
CHECK_EVERY_S = 30
CALL_TIMEOUT_S = 10
STALE_S = 300
MAX_RELOADS_PER_HOUR = 4
LOG_REPEAT_S = 600

NET_ROUND_PINGS = 1800
NET_RETRY_S = 60
NET_MIN_MISSES = 2
NET_NOTIFY_S = 3
GAME_HOST = "de.adventure.land"
NORD_LOGS = os.path.join(os.environ.get("LOCALAPPDATA", ""), "NordVPN", "logs")
NORD_CONNECTED = re.compile(r"VpnConnectionState change: Connected - .*?\(([\w.-]+)\)")
UPLINK = ("$r = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Where-Object InterfaceAlias -notlike 'Nord*' | "
          "Sort-Object RouteMetric | Select-Object -First 1; "
          "\"$($r.NextHop) $((Get-NetIPAddress -InterfaceIndex $r.ifIndex -AddressFamily IPv4).IPAddress)\"")

WANTED = {
    "Page.frameRequestedNavigation",
    "Page.frameNavigated",
    "Page.frameDetached",
    "Page.javascriptDialogOpening",
    "Page.javascriptDialogClosed",
    "Inspector.targetCrashed",
    "Inspector.targetReloadedAfterCrash",
    "Inspector.detached",
    "Network.requestWillBeSent",
    "Network.responseReceived",
    "Network.loadingFailed",
    "Log.entryAdded",
}
METHOD = re.compile(r'\{"method":"([^"]+)"')

PROBE = """(() => {
    const out = {
        url: location.href,
        name: typeof character === "object" && character ? character.name || null : null,
        connected: typeof socket === "object" && socket ? !!socket.connected : null,
        visibility: document.visibilityState,
        beat: null,
        frames: 0
    };
    for (const f of document.querySelectorAll("iframe")) {
        try {
            const beat = f.contentWindow.eval("typeof main_beat_at === 'number' ? main_beat_at : (typeof _errlog === 'object' && _errlog.alive.length ? _errlog.alive[_errlog.alive.length - 1].t : null)");
            out.frames++;
            if (beat) out.beat = Math.max(out.beat || 0, beat);
        } catch (e) {}
    }
    return out;
})()"""

WRITE_LOCK = threading.Lock()
PAGES_LOCK = threading.Lock()
PAGES = {}
NET_LOCK = threading.Lock()
NET = {}
NET_PROCS = []


def stamp(t=None):
    return datetime.fromtimestamp(t or time.time()).strftime("%Y-%m-%d %H:%M:%S")


def beacon(who, msg):
    body = json.dumps({"character": who, "build": "watchdog",
                       "lifecycle": {"t": int(time.time() * 1000), "msg": "watchdog " + msg}}).encode()
    try:
        req = urllib.request.Request(SINK_URL, data=body, headers={"content-type": "application/json"})
        urllib.request.urlopen(req, timeout=2).close()
    except Exception:
        pass


def record(page, kind, notify=True, who=None, **fields):
    named = page.who if page else who
    who = named or (("?" + page.id[:6]) if page else "host")
    entry = {"at": stamp(), "character": who, "kind": kind, **fields}
    if page:
        entry["target"] = page.id[:8]
    line = json.dumps(entry, ensure_ascii=False)
    with WRITE_LOCK:
        with open(EVENTS, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        print("%s  %-8s %-24s %s" % (entry["at"][11:], who, kind,
                                     json.dumps(fields, ensure_ascii=False)[:300]), flush=True)
    if notify and named:
        threading.Thread(target=beacon, daemon=True,
                         args=(named, kind + " " + json.dumps(fields, ensure_ascii=False)[:400])).start()


def powershell(command):
    return subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, text=True,
                          timeout=30, creationflags=subprocess.CREATE_NO_WINDOW).stdout.strip()


def vpn_endpoint():
    for path in sorted(glob.glob(os.path.join(NORD_LOGS, "app-2*.log")), reverse=True):
        with open(path, encoding="utf-8", errors="replace") as fh:
            found = NORD_CONNECTED.findall(fh.read())
        if found:
            return found[-1], socket.gethostbyname(found[-1])
    return None, None


def net_targets():
    gateway, local = (powershell(UPLINK).split() + [None, None])[:2]
    server, endpoint = vpn_endpoint()
    targets = [
        ("router", gateway, None, "LAN only"),
        ("isp", endpoint if local else None, local, "outside the tunnel to VPN server %s" % server),
        ("tunnel", "1.1.1.1", None, "through the tunnel, nearby exit"),
        ("game", socket.gethostbyname(GAME_HOST), None, "through the tunnel to %s" % GAME_HOST),
    ]
    return [t for t in targets if t[1]]


def net_observe(label, ok, line):
    now = time.time()
    outage = None
    with NET_LOCK:
        s = NET[label]
        if ok:
            if s["down_since"] and s["misses"] >= NET_MIN_MISSES:
                outage = {"target": label, "host": s["host"], "since": stamp(s["down_since"]),
                          "seconds": round(now - s["down_since"]), "misses": s["misses"], "error": s["error"],
                          "others_down": sorted(k for k, v in NET.items() if k != label and v["down_since"])}
                s["last_outage"] = "%s for %ss" % (outage["since"], outage["seconds"])
            s.update(up=True, down_since=None, misses=0)
        else:
            if not s["down_since"]:
                s["down_since"] = now
                s["error"] = line[:80]
            s["misses"] += 1
            s["up"] = False
    if outage:
        record(None, "net_outage", who="network", notify=outage["seconds"] >= NET_NOTIFY_S, **outage)


def net_ping(label, host, source):
    args = ["ping", "-n", str(NET_ROUND_PINGS), "-w", "1000"] + (["-S", source] if source else []) + [host]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
                            creationflags=subprocess.CREATE_NO_WINDOW)
    NET_PROCS.append(proc)
    try:
        for line in proc.stdout:
            line = line.strip()
            if not line or line.startswith(("Pinging", "Ping statistics", "Packets", "Approximate", "Minimum")):
                continue
            net_observe(label, line.startswith("Reply from") and "unreachable" not in line, line)
    finally:
        proc.kill()
        NET_PROCS.remove(proc)


def net_probe():
    while True:
        try:
            targets = net_targets()
        except Exception as exc:
            record(None, "net_probe_failed", who="network", notify=False, error=str(exc))
            time.sleep(NET_RETRY_S)
            continue
        record(None, "net_probe", who="network", notify=False,
               targets={label: "%s (%s)" % (host, why) for label, host, _, why in targets})
        threads = []
        for label, host, source, _ in targets:
            with NET_LOCK:
                NET.setdefault(label, {"down_since": None, "misses": 0, "error": None, "last_outage": None,
                                       "up": None})["host"] = host
            t = threading.Thread(target=net_ping, args=(label, host, source), daemon=True)
            t.start()
            threads.append(t)
        for t in threads:
            t.join()


class Socket:
    def __init__(self, url):
        host, port, path = re.match(r"ws://([^:/]+):(\d+)(/.*)", url).groups()
        self.sock = socket.create_connection((host, int(port)), timeout=CALL_TIMEOUT_S)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(("GET %s HTTP/1.1\r\nHost: %s:%s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
                           % (path, host, port, key)).encode())
        self.buf = bytearray()
        self.parts = []
        while b"\r\n\r\n" not in self.buf:
            if not self._fill(CALL_TIMEOUT_S):
                raise TimeoutError("handshake")
        head, _, rest = bytes(self.buf).partition(b"\r\n\r\n")
        status = head.split(b"\r\n")[0].decode(errors="replace")
        if " 101 " not in status:
            raise ConnectionError(status)
        self.buf = bytearray(rest)

    def _fill(self, timeout):
        ready, _, _ = select.select([self.sock], [], [], max(0, timeout))
        if not ready:
            return False
        chunk = self.sock.recv(1 << 20)
        if not chunk:
            raise ConnectionError("closed")
        self.buf += chunk
        return True

    def _frame(self):
        b = self.buf
        if len(b) < 2:
            return None
        fin, op, n, at = b[0] & 0x80, b[0] & 0x0F, b[1] & 0x7F, 2
        if n == 126:
            if len(b) < 4:
                return None
            n, at = struct.unpack(">H", b[2:4])[0], 4
        elif n == 127:
            if len(b) < 10:
                return None
            n, at = struct.unpack(">Q", b[2:10])[0], 10
        if len(b) < at + n:
            return None
        payload = bytes(b[at:at + n])
        del b[:at + n]
        return fin, op, payload

    def _send(self, op, data):
        mask = os.urandom(4)
        n = len(data)
        if n < 126:
            head = struct.pack(">BB", 0x80 | op, 0x80 | n)
        elif n < 65536:
            head = struct.pack(">BBH", 0x80 | op, 0x80 | 126, n)
        else:
            head = struct.pack(">BBQ", 0x80 | op, 0x80 | 127, n)
        self.sock.sendall(head + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data)))

    def send(self, text):
        self._send(1, text.encode("utf-8"))

    def recv(self, timeout):
        deadline = time.monotonic() + timeout
        while True:
            frame = self._frame()
            if frame is None:
                if not self._fill(deadline - time.monotonic()):
                    return None
                continue
            fin, op, payload = frame
            if op == 9:
                self._send(10, payload)
                continue
            if op == 10:
                continue
            if op == 8:
                raise ConnectionError("closed by browser")
            self.parts.append(payload)
            if fin:
                text = b"".join(self.parts).decode("utf-8", "replace")
                self.parts = []
                return text

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def short_url(url):
    return urllib.parse.unquote((url or "").rsplit("/", 1)[-1])[:80]


def summarise_initiator(init):
    out = {"type": init.get("type")}
    if init.get("url"):
        out["url"] = init["url"]
        out["line"] = init.get("lineNumber")
    frames = []
    stack = init.get("stack")
    while stack and len(frames) < 8:
        for f in stack.get("callFrames") or []:
            frames.append("%s %s:%s" % (f.get("functionName") or "(anon)", short_url(f.get("url")),
                                        f.get("lineNumber")))
        stack = stack.get("parent")
    if frames:
        out["stack"] = frames[:8]
    return out


class Page(threading.Thread):
    def __init__(self, target):
        super().__init__(daemon=True)
        self.id = target["id"]
        self.ws_url = "ws://127.0.0.1:%d/devtools/page/%s" % (PORT, self.id)
        self.who = None
        self.next_id = 0
        self.main_frame = None
        self.armed = False
        self.state = "unknown"
        self.last_fresh = time.time()
        self.last_nav = time.time()
        self.reloads = []
        self.gave_up = False
        self.dialog = None
        self.probe = {}
        self.log_seen = {}

    def run(self):
        self.ws = None
        try:
            self.ws = Socket(self.ws_url)
            for method, params in (("Page.enable", {}), ("Inspector.enable", {}), ("Log.enable", {}),
                                   ("Network.enable", {"maxTotalBufferSize": 1_000_000,
                                                       "maxResourceBufferSize": 100_000})):
                try:
                    self.call(method, params)
                except RuntimeError as exc:
                    record(self, "enable_failed", method=method, error=str(exc))
            self.main_frame = self.call("Page.getFrameTree")["frameTree"]["frame"]["id"]
            record(self, "watching", notify=False)
            next_check = 0
            while True:
                if time.time() >= next_check:
                    self.check()
                    next_check = time.time() + CHECK_EVERY_S
                text = self.ws.recv(1)
                if text:
                    self.dispatch(text)
        except Exception as exc:
            record(self, "detached", error="%s: %s" % (type(exc).__name__, exc))
        finally:
            if self.ws:
                self.ws.close()
            with PAGES_LOCK:
                if PAGES.get(self.id) is self:
                    del PAGES[self.id]

    def call(self, method, params=None, timeout=CALL_TIMEOUT_S):
        self.next_id += 1
        mine = self.next_id
        self.ws.send(json.dumps({"id": mine, "method": method, "params": params or {}}))
        deadline = time.monotonic() + timeout
        while True:
            text = self.ws.recv(deadline - time.monotonic())
            if text is None:
                raise TimeoutError(method)
            msg = self.dispatch(text)
            if msg and msg.get("id") == mine:
                if "error" in msg:
                    raise RuntimeError(msg["error"].get("message"))
                return msg.get("result") or {}

    def dispatch(self, text):
        m = METHOD.match(text)
        if m:
            method = m.group(1)
            if method not in WANTED:
                return None
            if method.startswith("Network.") and '"type":"Document"' not in text:
                return None
        msg = json.loads(text)
        if "method" in msg:
            self.event(msg["method"], msg.get("params") or {})
            return None
        return msg

    def event(self, method, p):
        if method == "Page.frameNavigated":
            f = p.get("frame") or {}
            main = not f.get("parentId")
            if main:
                self.last_nav = time.time()
            record(self, "navigated" if main else "frame_navigated", url=f.get("url"),
                   unreachable=f.get("unreachableUrl"), frame=(f.get("id") or "")[:8])
        elif method == "Page.frameRequestedNavigation":
            record(self, "navigation_requested", reason=p.get("reason"), url=p.get("url"),
                   disposition=p.get("disposition"), main=p.get("frameId") == self.main_frame)
        elif method == "Page.frameDetached":
            record(self, "frame_detached", frame=(p.get("frameId") or "")[:8], reason=p.get("reason"))
        elif method == "Page.javascriptDialogOpening":
            self.dialog = p
            record(self, "dialog_opened", type=p.get("type"), message=p.get("message"))
        elif method == "Page.javascriptDialogClosed":
            self.dialog = None
            record(self, "dialog_closed", result=p.get("result"))
        elif method.startswith("Inspector."):
            record(self, method.split(".", 1)[1], reason=p.get("reason"))
        elif method == "Network.requestWillBeSent":
            record(self, "document_request", url=p.get("request", {}).get("url"),
                   main=p.get("frameId") == self.main_frame,
                   initiator=summarise_initiator(p.get("initiator") or {}))
        elif method == "Network.responseReceived":
            r = p.get("response") or {}
            record(self, "document_response", url=r.get("url"), status=r.get("status"),
                   main=p.get("frameId") == self.main_frame, notify=r.get("status", 200) >= 400)
        elif method == "Network.loadingFailed":
            record(self, "document_failed", error=p.get("errorText"), canceled=p.get("canceled"),
                   blocked=p.get("blockedReason"))
        elif method == "Log.entryAdded":
            e = p.get("entry") or {}
            if e.get("level") != "error" and e.get("source") != "intervention":
                return
            key = (e.get("source"), (e.get("text") or "")[:200])
            now = time.time()
            if now - self.log_seen.get(key, 0) < LOG_REPEAT_S:
                return
            self.log_seen[key] = now
            record(self, "browser_log", notify=False, source=e.get("source"), level=e.get("level"),
                   text=(e.get("text") or "")[:500], url=short_url(e.get("url")))

    def check(self):
        now = time.time()
        try:
            probe = self.call("Runtime.evaluate", {"expression": PROBE, "returnByValue": True})
            probe = (probe.get("result") or {}).get("value") or {}
        except TimeoutError:
            probe = {"unresponsive": True}
        except RuntimeError as exc:
            probe = {"error": str(exc)}
        if probe.get("name"):
            self.who = probe["name"]
        self.probe = probe
        beat = (probe.get("beat") or 0) / 1000
        beating = now - beat < STALE_S
        if probe.get("unresponsive"):
            state = "unresponsive"
        elif probe.get("error"):
            state = "error"
        elif not beating:
            state = "no_heartbeat"
        elif probe.get("connected") is False:
            state = "disconnected"
        else:
            state = "alive"
        if state != self.state:
            record(self, "state", state=state, was=self.state, url=probe.get("url"),
                   beat_age_s=round(now - beat) if beat else None, connected=probe.get("connected"),
                   visibility=probe.get("visibility"))
            self.state = state
        if state == "alive":
            self.last_fresh = now
            self.gave_up = False
            if not self.armed:
                self.armed = True
                record(self, "armed", notify=False)
            return
        if not self.armed:
            return
        quiet = now - max(self.last_fresh, self.last_nav)
        if quiet >= STALE_S:
            self.recover(quiet)

    def recover(self, quiet):
        now = time.time()
        self.reloads = [t for t in self.reloads if now - t < 3600]
        if len(self.reloads) >= MAX_RELOADS_PER_HOUR:
            if not self.gave_up:
                self.gave_up = True
                record(self, "giving_up", reloads_last_hour=len(self.reloads), state=self.state)
            return
        self.last_nav = now
        if os.path.exists(PAUSE):
            record(self, "would_reload", quiet_s=round(quiet), state=self.state)
            return
        try:
            if self.dialog:
                self.call("Page.handleJavaScriptDialog", {"accept": True})
            self.call("Page.reload")
            self.reloads.append(now)
            record(self, "reloaded", quiet_s=round(quiet), state=self.state, url=self.probe.get("url"))
        except (TimeoutError, RuntimeError) as exc:
            record(self, "reload_failed", quiet_s=round(quiet), state=self.state, error=str(exc))

    def status(self, now):
        beat = (self.probe.get("beat") or 0) / 1000
        return {
            "target": self.id[:8],
            "name": self.who,
            "state": self.state,
            "armed": self.armed,
            "url": self.probe.get("url"),
            "beat_age_s": round(now - beat) if beat else None,
            "last_nav_s": round(now - self.last_nav),
            "reloads_last_hour": len([t for t in self.reloads if now - t < 3600]),
        }


def list_targets():
    with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % PORT, timeout=5) as res:
        return [t for t in json.load(res) if t.get("type") == "page"]


def write_status(up):
    now = time.time()
    with PAGES_LOCK:
        pages = [p.status(now) for p in PAGES.values()]
    with NET_LOCK:
        network = {label: {"host": s["host"], "up": s["up"], "last_outage": s["last_outage"],
                           "down_for_s": round(now - s["down_since"]) if s["down_since"] else 0}
                   for label, s in NET.items()}
    blob = json.dumps({"updated": stamp(now), "browser": up, "paused": os.path.exists(PAUSE),
                       "network": network, "pages": sorted(pages, key=lambda p: p["name"] or "")}, indent=1)
    tmp = STATUS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(blob)
    try:
        os.replace(tmp, STATUS)
    except OSError:
        pass


def source_mtime():
    try:
        return os.path.getmtime(SOURCE)
    except OSError:
        return 0.0


def source_changed(known):
    seen = source_mtime()
    if not seen or seen == known:
        return known, False
    try:
        with open(SOURCE, encoding="utf-8") as fh:
            compile(fh.read(), SOURCE, "exec")
    except Exception as exc:
        print("  ! source changed but will not compile, staying on the running copy: %s" % exc, flush=True)
        return seen, False
    return seen, True


def hold_instance_lock(attempts=20, wait=0.5):
    for _ in range(attempts):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("127.0.0.1", LOCK_PORT))
            s.listen(1)
            return s
        except OSError:
            s.close()
            time.sleep(wait)
    return None


def detach_logging():
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


def main():
    detach_logging()
    lock = hold_instance_lock()
    if lock is None:
        print("another watchdog holds 127.0.0.1:%d -- leaving it alone" % LOCK_PORT, flush=True)
        return
    print("%s  watchdog on 127.0.0.1:%d -> %s" % (stamp(), PORT, EVENTS), flush=True)
    known = source_mtime()
    threading.Thread(target=net_probe, daemon=True).start()
    browser_up = None
    while True:
        try:
            targets = list_targets()
            up = True
        except OSError:
            targets = []
            up = False
        if up != browser_up:
            record(None, "browser", who="host", notify=False, reachable=up, port=PORT)
            browser_up = up
        with PAGES_LOCK:
            for t in targets:
                if t["id"] not in PAGES:
                    page = Page(t)
                    PAGES[t["id"]] = page
                    page.start()
        write_status(up)
        known, changed = source_changed(known)
        if changed:
            print("%s  source changed -- restarting" % stamp(), flush=True)
            lock.close()
            for proc in list(NET_PROCS):
                proc.kill()
            subprocess.Popen([sys.executable, SOURCE], cwd=os.path.dirname(SOURCE), close_fds=True)
            os._exit(0)
        time.sleep(LIST_EVERY_S)


if __name__ == "__main__":
    main()
