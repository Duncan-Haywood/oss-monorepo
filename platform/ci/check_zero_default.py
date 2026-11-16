#!/usr/bin/env python3
"""Flag page scripts that turn a typed 0 into the example value.

A field read as

    leadDays: parseFloat($("#lead").value) || 45

falls back to 45 when the field is blank, which is what the author meant, but
also when the visitor types 0, because 0 is falsy in JavaScript. The page
then computes with 45 while the field shows 0, and nothing says so. On the
insurance commission reconciler (explore run, 2026-11-16) a broker who set
the rate tolerance to 0 to see every rate difference got a 0.25-point
tolerance instead, and a lag of 0 days became 30, inside a `Math.max(0, ...)`
that shows the author wanted 0 to be allowed.

A read is flagged when all of these hold, in an .html file:

* it casts a field's `.value` (`Number(...)`, `parseFloat(...)`,
  `parseInt(..., 10)` or unary `+`) and follows it with `|| <non-zero number>`;
* the field is an `<input>` in the same file, found by its id;
* that input does not refuse 0 itself: it has no `min` above 0.

Where 0 is meaningless for the field (a count of cleaners, a batch size), the
fallback is harmless; mark the line with a `zero-default:` comment giving the
reason, or give a `type=number` input `min="1"`, and the read is accepted.
Library code (.mjs, .js) is out of scope: it has no field, and its callers
are the pages this reads. check_blank_defaults.py covers the related case of
a blank field swapped for DEFAULTS[k] unseen.

Exit 1 lists each hit.  Usage: python3 platform/ci/check_zero_default.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}

# `<getter>("#id").value` then an optional `, 10` and a closing paren, then
# `|| <number>`. The getter is whatever the page calls ($, byId,
# document.getElementById, document.querySelector, ...).
READ = re.compile(
    r"""\(\s*(['"])\#?(?P<id>[\w-]+)\1\s*\)\s*\.value"""
    r"""(?P<tail>\s*(?:,\s*10\s*)?\)|)"""
    r"""\s*\|\|\s*(?P<fb>-?\d*\.?\d+)""")
OK_MARK = re.compile(r"zero-default:")
INPUT_TAG = re.compile(r"<input\b[^>]*>", re.I)
ATTR = re.compile(r"""\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""")


def inputs_by_id(text):
    out = {}
    for m in INPUT_TAG.finditer(text):
        attrs = {a.group(1).lower(): next(g for g in a.groups()[1:] if g is not None)
                 for a in ATTR.finditer(m.group(0))}
        if "id" in attrs:
            out.setdefault(attrs["id"], attrs)
    return out


def refuses_zero(attrs):
    try:
        return float(attrs.get("min", "")) > 0
    except ValueError:
        return False


def scan_text(text):
    """(line, field id, fallback) for each read that swaps a typed 0 unseen."""
    fields = inputs_by_id(text)
    lines = text.splitlines()
    hits = []
    for m in READ.finditer(text):
        if float(m.group("fb")) == 0:
            continue
        start = text.rfind("\n", 0, m.start()) + 1
        before = text[start:m.start()]
        # unary plus reads `+$("#x").value || 1` with no closing paren;
        # the function casts need it.
        if m.group("tail").strip():
            if not re.search(r"(?:Number|parseFloat|parseInt)\s*\(\s*[\w.$]+\s*$", before):
                continue
        elif not re.search(r"\+\s*[\w.$]+\s*$", before):
            continue
        attrs = fields.get(m.group("id"))
        if attrs is None or refuses_zero(attrs):
            continue
        if attrs.get("type", "text").lower() in {"checkbox", "radio", "hidden"}:
            continue
        n = text.count("\n", 0, m.start()) + 1
        if OK_MARK.search(lines[n - 1]):
            continue
        hits.append((n, m.group("id"), m.group("fb")))
    return hits


def scan(roots):
    hits = []
    for root in roots:
        root = pathlib.Path(root)
        files = [root] if root.is_file() else sorted(root.rglob("*.html"))
        for p in files:
            if SKIP_PARTS & set(p.parts):
                continue
            for n, fid, fb in scan_text(p.read_text(encoding="utf-8", errors="replace")):
                hits.append(f"{p}:{n}: #{fid} || {fb}")
    return hits


def main(argv):
    roots = argv or [ROOT / "ventures"]
    hits = scan(roots)
    for h in hits:
        print(f"{h}: a typed 0 is computed as the fallback; test for a blank field instead, "
              "or mark the line `zero-default: <why 0 is meaningless here>`")
    if hits:
        print(f"{len(hits)} field read(s) turn a typed 0 into the example value")
        return 1
    print("zero defaults: no field read turns a typed 0 into the example value")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
