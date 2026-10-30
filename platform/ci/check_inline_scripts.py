#!/usr/bin/env python3
"""Fail if an inline `<script>` in a venture page has a JavaScript syntax error.

A syntax error in the one inline script of a single-file tool leaves the page
rendering but dead: no calculator, no error. Unit tests that import the logic
never see it. Each classic or module inline script is written to a temp file
and parsed with `node --check`. JSON-LD, importmaps and other data blocks, and
`<script src=...>` tags, are skipped.

    python3 platform/ci/check_inline_scripts.py [--root DIR]   # exit 1 if any bad
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = re.compile(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", re.S | re.I)
TYPE = re.compile(r"""\btype\s*=\s*["']?([^"'\s>]+)""", re.I)


def inline_scripts(html):
    """Yield (line, is_module, source) for each inline JavaScript script."""
    for m in SCRIPT.finditer(html):
        attrs, body = m["attrs"], m["body"]
        if re.search(r"\bsrc\s*=", attrs, re.I) or not body.strip():
            continue
        t = TYPE.search(attrs)
        kind = t[1].lower() if t else ""
        if kind not in ("", "text/javascript", "module"):
            continue
        yield html[: m.start()].count("\n") + 1, kind == "module", body


# One node process parses every script; per-script `node --check` costs ~30 ms
# of startup each (1,600+ scripts, ~50 s). The batch only screens: a script it
# rejects is re-run through `node --check`, so verdicts and messages are those
# of `node --check` (vm.Script is no looser, since a CommonJS wrapper allows a
# top-level `return` that it rejects, never the reverse).
BATCH = r"""
const vm = require('vm');
const items = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const bad = [];
items.forEach(([src, mod], i) => {
  try { mod ? new vm.SourceTextModule(src) : new vm.Script(src); } catch (e) { bad.push(i); }
});
process.stdout.write(JSON.stringify(bad));
"""


def screen(items):
    """Indices of (source, module) items that may have a syntax error."""
    if not items:
        return []
    try:
        r = subprocess.run(["node", "--experimental-vm-modules", "--no-warnings", "-e", BATCH],
                           input=json.dumps(items), capture_output=True, text=True)
        if r.returncode == 0:
            return json.loads(r.stdout)
    except (OSError, ValueError):
        pass
    return list(range(len(items)))


def syntax_error(source, module, tmp):
    p = Path(tmp) / ("s.mjs" if module else "s.js")
    p.write_text(source, encoding="utf8")
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    if r.returncode == 0:
        return None
    lines = [l for l in r.stderr.splitlines() if "Error" in l]
    return (lines[-1] if lines else r.stderr.strip()[-120:])[:140]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    a = ap.parse_args(argv)
    bad = 0
    with tempfile.TemporaryDirectory() as tmp:
        found = []
        for f in sorted(Path(a.root).rglob("*.html")):
            if "node_modules" in f.parts:
                continue
            for line, module, src in inline_scripts(f.read_text(encoding="utf8", errors="replace")):
                found.append((f, line, module, src))
        for i in screen([(src, module) for _, _, module, src in found]):
            f, line, module, src = found[i]
            err = syntax_error(src, module, tmp)
            if err:
                bad += 1
                print(f"{f}:{line}: {err}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
