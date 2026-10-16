#!/usr/bin/env python3
"""Evaluates a JavaScript expression in each character's bot frame over the client's DevTools port, and prints the result.

    python Tools/Probe.py "character.hp"
    python Tools/Probe.py "al_loops().filter(l => l.error)" --name Myras
    python Tools/Probe.py --file probe.js

The expression sees the bot frame as `w` and its globals directly (`character`, `al_boot()`, …); a Promise is awaited.
Read-only by intent: it is how the bot is checked live without a reload. The port is opened by the client flags in the
registry (Design Notes → Tools → the client flags)."""

import argparse
import base64
import json
import os
import re
import select
import socket
import struct
import sys
import time
import urllib.request

PORT = 9222
TIMEOUT_S = 20


class Socket:
    def __init__(self, url):
        host, port, path = re.match(r"ws://([^:/]+):(\d+)(/.*)", url).groups()
        self.sock = socket.create_connection((host, int(port)), timeout=TIMEOUT_S)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(("GET %s HTTP/1.1\r\nHost: %s:%s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
                           % (path, host, port, key)).encode())
        self.buf = bytearray()
        self.parts = []
        while b"\r\n\r\n" not in self.buf:
            if not self._fill(TIMEOUT_S):
                raise TimeoutError("handshake")
        head, _, rest = bytes(self.buf).partition(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise ConnectionError(head.split(b"\r\n")[0].decode(errors="replace"))
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
                raise ConnectionError("closed by the client")
            self.parts.append(payload)
            if fin:
                text = b"".join(self.parts).decode("utf-8", "replace")
                self.parts = []
                return text

    def close(self):
        self.sock.close()


def wrap(body):
    return ("(async () => {\n"
            "\tfor (const f of document.querySelectorAll('iframe')) {\n"
            "\t\tconst w = f.contentWindow;\n"
            "\t\tif (!w || !w.al_boot) continue;\n"
            "\t\twith (w) { return await (%s); }\n"
            "\t}\n"
            "\treturn 'no bot frame';\n"
            "})()") % body


def character_pages():
    pages = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % PORT, timeout=5))
    for page in pages:
        m = re.search(r"adventure\.land/character/([^/]+)/", page.get("url", ""))
        if page.get("type") == "page" and m:
            yield m.group(1), page["webSocketDebuggerUrl"]


def evaluate(url, expression):
    s = Socket(url)
    try:
        s.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                           "params": {"expression": expression, "returnByValue": True, "awaitPromise": True}}))
        deadline = time.monotonic() + TIMEOUT_S
        while time.monotonic() < deadline:
            message = s.recv(deadline - time.monotonic())
            if message is None:
                break
            reply = json.loads(message)
            if reply.get("id") != 1:
                continue
            result = reply.get("result") or {}
            if "exceptionDetails" in result:
                return "ERROR " + result["exceptionDetails"].get("exception", {}).get("description", "?")
            return result.get("result", {}).get("value")
        return "TIMEOUT"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("expression", nargs="?")
    parser.add_argument("--file")
    parser.add_argument("--name", action="append", help="only this character (repeatable)")
    args = parser.parse_args()
    body = open(args.file, encoding="utf-8").read() if args.file else args.expression
    if not body:
        parser.error("an expression or --file is required")
    for name, url in character_pages():
        if args.name and name not in args.name:
            continue
        print("%s: %s" % (name, json.dumps(evaluate(url, wrap(body)), ensure_ascii=False)))


if __name__ == "__main__":
    sys.exit(main())
