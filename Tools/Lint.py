"""Cheap JS sanity checks for a repo with no runtime, no modules and one global scope.

Run from the repo root:  python Tools/Lint.py

Catches what a brace-balance pass cannot:
  * orphaned ternary else-branches (`foo() : null`) left by a careless edit
  * leftover always-true/false conditions
  * two files declaring the same global, which in this codebase silently
    overwrites one with the other depending on Bootstrapper load order
  * duplicate top-level const/let across classic scripts (a load-time SyntaxError)

Exit code is non-zero when anything is found.
"""
import io
import re
import subprocess
import sys

files = [f for f in subprocess.run(
    ["git", "ls-files", "-z", "*.js"], capture_output=True, text=True
).stdout.split("\0") if f]


def strip_noise(src):
    """Blank out strings, template literals, comments and regex literals."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            while i < n and src[i] != "\n":
                out.append(" ")
                i += 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                out.append("\n" if src[i] == "\n" else " ")
                i += 1
            i += 2
            out.append("  ")
            continue
        if c in "\"'`":
            q = c
            out.append(" ")
            i += 1
            while i < n:
                if src[i] == "\\":
                    out.append("  ")
                    i += 2
                    continue
                if src[i] == q:
                    out.append(" ")
                    i += 1
                    break
                out.append("\n" if src[i] == "\n" else " ")
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


problems = 0

# 1. orphaned ternary else-branches: a statement with " : " but no "?"
for f in files:
    clean = strip_noise(io.open(f, encoding="utf-8-sig").read())
    for lineno, line in enumerate(clean.splitlines(), 1):
        if "?" in line:
            continue
        # This codebase always writes object properties as `key: value` with no space
        # before the colon. A colon preceded by an identifier or closing bracket AND a
        # space is therefore a stranded ternary else-branch, not a property.
        if not re.search(r"[\w\)\]\"']\s+:\s", line):
            continue
        t = line.strip()
        if t.startswith(("case ", "default:", "?", ":")):
            continue
        print(f"ORPHAN TERNARY {f}:{lineno}: {t[:90]}")
        problems += 1

# 2. leftover always-true/false conditions
for f in files:
    clean = strip_noise(io.open(f, encoding="utf-8-sig").read())
    for lineno, line in enumerate(clean.splitlines(), 1):
        # `x === true &&` is a real comparison, not a leftover
        if re.search(r"[=!]==\s*(true|false)\b", line):
            continue
        if re.search(r"\bif \((true|false)\)|&&\s*true\b|\btrue\s*&&|\|\|\s*false\b", line):
            print(f"DEAD CONDITION {f}:{lineno}: {line.strip()[:90]}")
            problems += 1

# 3. duplicate top-level const/let across classic scripts (SyntaxError at load)
seen = {}
for f in files:
    if f.startswith("Character Managers/") or f in ("Code Loader.js", "Bootstrapper.js"):
        continue  # eval'd or standalone, separate scope rules
    clean = strip_noise(io.open(f, encoding="utf-8-sig").read())
    for m in re.finditer(r"^(?:const|let)\s+([A-Za-z_$][\w$]*)", clean, re.M):
        seen.setdefault(m.group(1), []).append(f)
for name, where in sorted(seen.items()):
    if len(set(where)) > 1:
        print(f"DUPLICATE LEXICAL '{name}' in {sorted(set(where))}")
        problems += 1

# 4. two files declaring the same global — whichever loads later silently wins
PER_ROLE = {
    # deliberately one per character; the four never load together
    "CONFIG", "home", "destination", "cache", "state", "equipment_sets",
    "ITEMS_TO_KEEP", "item_order", "PANIC_THRESHOLDS", "EQUIPMENT_RULES",
    "MONSTER_GEAR_OVERRIDES", "BOSS_GEAR_OVERRIDES", "PANIC_BROADCAST_TARGETS", "update_cache",
    "action_loop", "skill_loop", "reposition", "model_prediction", "panicking",
    "panic_external", "panic_since", "request_delivery", "get_character_state",
    "find_best_target", "weapon_choice_context",
}

declared = {}
for f in files:
    if f in ("Bootstrapper.js", "Code Loader.js"):
        continue
    clean = strip_noise(io.open(f, encoding="utf-8-sig").read())
    for pattern in (r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)",
                    r"^var\s+([A-Za-z_$][\w$]*)"):
        for m in re.finditer(pattern, clean, re.M):
            declared.setdefault(m.group(1), set()).add(f)

for name, where in sorted(declared.items()):
    if len(where) < 2 or name in PER_ROLE:
        continue
    if name.startswith("errlog_"):
        continue  # Global Config stubs, replaced by Error Log by design
    roles = {w.split("/")[1] for w in where if w.startswith("Character Managers/")}
    if len(roles) == len(where) and len(roles) > 1:
        continue  # one per character, never loaded together
    print(f"GLOBAL COLLISION '{name}' in {sorted(where)}")
    problems += 1

print(f"\n{len(files)} files checked, {problems} problems")
sys.exit(1 if problems else 0)
