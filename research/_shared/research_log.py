#!/usr/bin/env python3
"""Read a research LOG.md without reading all of it, and pick the next free milestone label.

    python3 research/_shared/research_log.py latest marine-hull        # the newest entry
    python3 research/_shared/research_log.py latest marine-hull -n 3   # the newest three
    python3 research/_shared/research_log.py labels marine-hull        # last label, next free one, reuses
    python3 research/_shared/research_log.py labels marine-hull --ref origin/main   # also count main's

A project is a slug under research/ or a path to a LOG.md. Entries are the `## ` headings
(research/CLAUDE.md: `## <date> · <title>`, newest first).

Why (run records, prompts/runs/*.json doc_friction): 16 of the 35 research logs are over
40 KB and marine-hull's is ~370 KB, so "read the newest entries of its LOG.md"
(PROGRAMMES.md, step 1) overflowed a tool read and runs reached for sed ranges (2026-11-12);
some logs are not strictly newest first, so a `tail` showed the oldest entries (2026-11-02,
11-04, 11-05); and milestone labels were reused (marine-hull's 6z on 2026-11-07 and 11-12,
its 5h/5i on two studies, 2026-11-05), so picking the next one took a grep through every
heading, and a run renamed its pre-registered 11b to 11c after a sibling session landed 11b
first (2026-11-12). `latest` orders entries by their heading dates, whatever the file's
order. `labels` prints the next label not used in the working tree or, with `--ref`, on that
ref (fetch main first: `git fetch --depth=1 origin main`).

Labels are read from the heading: `Milestone 6zp`, `Session 80`, `Batch 22`, `Step 2`, `M2`.
Consecutive entries sharing a label (a plan and its outcome, "M2 (part)") are one
milestone; a label that comes back after other labels, on dates more than `--gap` days apart
(default 2), is a reuse. On 2026-11-12 that found 37 in 4 logs (marine-hull 28,
aerolog-scaling 7, heavy-hydraulics 1, llm-coding-inference 1), each read by hand: two
different studies under one label. Reuses are reported, not failed (renaming old entries
would break the references to them); always exits 0 when the LOG.md exists.
"""
import argparse
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[1]
DATE = re.compile(r"\b(20\d\d-\d\d-\d\d)\b")
LABEL = re.compile(r"\b(Milestone|Session|Batch|Step|M)\s?(\d+[a-z]*)\b(?![-\d])")


def log_path(project):
    p = Path(project)
    if p.suffix == ".md":
        return p
    if (p / "LOG.md").is_file():
        return p / "LOG.md"
    return RESEARCH / project.strip("/").removeprefix("research/") / "LOG.md"


def entries(text):
    """[(index, heading, body_lines)] for each `## ` section, in file order."""
    out, cur = [], None
    for line in text.splitlines():
        if line.startswith("## "):
            cur = (len(out), line[3:].strip(), [])
            out.append(cur)
        elif cur is not None:
            cur[2].append(line)
    return out


def entry_date(heading):
    m = DATE.search(heading)
    return m.group(1) if m else ""


def label(heading):
    """('Milestone', '6zp') or None."""
    m = LABEL.search(heading)
    return (m.group(1), m.group(2)) if m else None


def newest(text, n=1):
    """The n newest entries by heading date; ties keep the file's order for newest-first
    files and reverse it for oldest-first ones (most files put the newest on top)."""
    es = entries(text)
    dated = [e for e in es if entry_date(e[1])]
    if not dated:
        return es[:n]
    oldest_first = entry_date(dated[0][1]) < entry_date(dated[-1][1])
    key = (lambda e: (entry_date(e[1]), e[0])) if oldest_first else (lambda e: (entry_date(e[1]), -e[0]))
    return sorted(es, key=key, reverse=True)[:n]


def bump(lab):
    """The label after `lab`: 117 -> 118, 11h -> 11i, 6zp -> 6zq, 6z -> 6za, 7az -> 7aza."""
    m = re.fullmatch(r"(\d+)([a-z]*)", lab)
    num, letters = m.group(1), m.group(2)
    if not letters:
        return str(int(num) + 1)
    if letters[-1] < "z":
        return num + letters[:-1] + chr(ord(letters[-1]) + 1)
    return num + letters + "a"


def next_free(lab, used):
    cand = bump(lab)
    while cand in used:
        cand = bump(cand)
    return cand


def reuses(heads, gap=2):
    """{label: sorted dates} for labels used by two separate studies: the label comes back
    after other labels intervened (in file order) and on dates more than `gap` days apart.
    Consecutive entries sharing a label (a plan and its outcome, "Milestone 3 (part)" over
    a week) are one milestone, not a reuse."""
    runs, dates, last = {}, {}, None
    for h in heads:
        lab, d = label(h), entry_date(h)
        m = LABEL.search(h)
        if not lab or h[m.end():].lstrip().startswith("("):
            continue  # "M2 (part)", "Milestone 6 (paper format)": one milestone in parts
        lab = lab[1]
        if lab != last:
            runs[lab] = runs.get(lab, 0) + 1
        last = lab
        if d:
            dates.setdefault(lab, set()).add(d)
    out = {}
    for lab, n in runs.items():
        ds = sorted(dates.get(lab, ()))
        if n > 1 and ds and (date.fromisoformat(ds[-1]) - date.fromisoformat(ds[0])).days > gap:
            out[lab] = ds
    return out


def ref_text(path, ref):
    try:
        rel = path.resolve().relative_to(RESEARCH.parent)
    except ValueError:
        return ""
    r = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=RESEARCH.parent,
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def labels_report(text, extra="", gap=2):
    heads = [e[1] for e in entries(text)]
    extra_heads = [e[1] for e in entries(extra)] if extra else []
    used = {label(h)[1] for h in heads + extra_heads if label(h)}
    lines = []
    top = next((e for e in newest(text + "\n" + extra, 50) if label(e[1])), None)
    if top is None:
        lines.append("no labelled headings (Milestone N, Session N, Batch N, Step N, MN)")
    else:
        kind, lab = label(top[1])
        kind += "" if kind == "M" else " "
        lines.append(f"newest label: {kind}{lab} ({entry_date(top[1]) or 'undated'})")
        lines.append(f"next free:    {kind}{next_free(lab, used)}")
    for lab, ds in sorted(reuses(heads + extra_heads, gap).items()):
        lines.append(f"reused:       {lab} on {', '.join(ds)}")
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("latest", help="print the newest entries")
    a.add_argument("project")
    a.add_argument("-n", type=int, default=1)
    a.add_argument("--headings", action="store_true", help="headings only")
    b = sub.add_parser("labels", help="newest label, next free label, reused labels")
    b.add_argument("project")
    b.add_argument("--ref", help="also count labels on this git ref, e.g. origin/main")
    b.add_argument("--gap", type=int, default=2)
    args = ap.parse_args(argv)
    path = log_path(args.project)
    if not path.is_file():
        print(f"no LOG.md at {path}", file=sys.stderr)
        return 2
    text = path.read_text(errors="replace")
    if args.cmd == "latest":
        for _, head, body in newest(text, args.n):
            print(f"## {head}")
            if not args.headings:
                print("\n".join(body).rstrip() + "\n")
        return 0
    extra = ref_text(path, args.ref) if args.ref else ""
    if args.ref and not extra:
        print(f"note: {args.ref} has no {path.name} for this project (or the ref is not fetched)",
              file=sys.stderr)
    print("\n".join(labels_report(text, extra, args.gap)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
