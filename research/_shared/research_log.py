#!/usr/bin/env python3
"""Read a research LOG.md without reading all of it, and pick the next free milestone label.

    python3 research/_shared/research_log.py latest marine-hull        # the newest entry
    python3 research/_shared/research_log.py latest marine-hull -n 3   # the newest three
    python3 research/_shared/research_log.py labels marine-hull        # last label, next free one, reuses
    python3 research/_shared/research_log.py labels marine-hull --ref origin/main   # also count main's
    python3 research/_shared/research_log.py labels marine-hull --ref origin/main --prs   # and open PRs'
    python3 research/_shared/research_log.py chain marine-hull         # sub-steps of the newest milestone

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

`labels` also prints the next free hypothesis number (H1, H2, ...), and `--prs` counts
labels and hypotheses in the LOG.md of every open same-repo PR titled research/<slug>.
Why: nothing allocated hypothesis numbers, so two parallel runs of one programme
pre-registered the same ones and the later lander renumbered them at merge, which rewrites
a pre-registration after the fact: sensing-selfcal's 3b and 4s both planned H104-H107
(renumbered H108-H112, 2026-11-16), a heavy-hydraulics-style 5g renumbered H51-H55
(2026-11-13); main alone could not show either, since the sibling had not merged yet.

`chain` counts the sub-steps under the newest milestone number (6, 6a, ..., 6zzzk) and the
log entries since a heading last named a paper step. Why: a research run reported on
2026-11-18 (PR #17327) that marine-hull's last ten milestones were single-knob reruns
(6zzz to 6zzzh) and that nothing in the draw said when a chain had hit diminishing returns.
A scan of the 21 logs with five or more labelled entries that day found 12 whose newest
number had 10+ sub-steps: marine-hull 100 (6, 2026-10-29..11-18), cell-fidelity 98 (5, no
paper/ directory), llm-coding-inference 58, aerolog-scaling 40 (log entries; distinct labels:
89, 49, 56 and 40). A long chain is not wrong
in itself (a design sweep can need it); the count is a cue, and the call stays the run's.
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
# A hypothesis id: H then digits (H12-i counts as H12), not H5d-i (milestone 5d's own
# numbering), H2O or "H100 GPU".
HYP = re.compile(r"(?<![\w/-])H(\d{1,4})(?!\w)(?!\s*(?:GPU|SXM|PCIe|NVL)s?\b)")
# Only lines that read as a hypothesis: a list item opening with it, or hypothesis wording.
HYP_LINE = re.compile(r"^\s*[-*]\s*(\*\*)?H\d|hypothes|\b(held|refuted|supported|"
                      r"pre-?regist|prediction|bar)\b", re.I)


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


def hypotheses(text):
    """{number: first line naming it} for hypothesis ids on hypothesis-like lines."""
    out = {}
    for line in text.splitlines():
        if "H" in line and HYP_LINE.search(line):
            for m in HYP.finditer(line):
                out.setdefault(int(m.group(1)), line.strip())
    return out


def open_pr_logs(slug, fetch=None):
    """[(pr number, LOG.md text)] for open same-repo PRs titled research/<slug>..., except
    this run's own. Best effort: [] when the API or raw host does not answer."""
    import pick_track as pt
    titles = pt._open_pr_titles("duncan-haywood/oss-monorepo", 100) or []
    fetch = fetch or _raw_log
    out = []
    for n, title in titles:
        if not re.match(rf"research/{re.escape(slug)}(?![\w-])", title) or pt.is_own_pr(n):
            continue
        if pt._FORK.get(n):  # a fork's text is not ours to plan from (CLAUDE.md, "Public repository")
            continue
        text = fetch(pt._HEADS.get(n, ""), slug)
        if text:
            out.append((n, text))
    return out


def _raw_log(branch, slug):
    import urllib.parse
    import urllib.request
    if not branch:
        return ""
    url = ("https://raw.githubusercontent.com/duncan-haywood/oss-monorepo/"
           f"{urllib.parse.quote(branch)}/research/{slug}/LOG.md")
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return ""


def pr_lines(prs, base):
    """One line per open PR: the labels and hypotheses it adds over `base`."""
    used = {label(e[1])[1] for e in entries(base) if label(e[1])}
    have = set(hypotheses(base))
    lines = []
    for n, text in prs:
        labs = sorted({label(e[1])[1] for e in entries(text) if label(e[1])} - used)
        hyps = sorted(set(hypotheses(text)) - have)
        if labs or hyps:
            lines.append(f"open PR #{n}: " + ", ".join(
                ([f"labels {' '.join(labs)}"] if labs else [])
                + ([f"H{hyps[0]}-H{hyps[-1]}" if len(hyps) > 1 else f"H{hyps[0]}"] if hyps else [])))
    return lines


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
    hyps = hypotheses(text + "\n" + extra)
    if hyps:
        top = max(hyps)
        lines.append(f"hypotheses:   highest H{top} ({hyps[top][:70]})")
        lines.append(f"next free:    H{top + 1} (when this LOG numbers hypotheses across milestones)")
    return lines


# A heading that reports writing the paper, not one that merely says "paper" (aerolog-scaling's
# "census paper weights" is a model term, not a write-up step).
# `· Paper: ...` / `· Paper sync ...` headings and "(a writing step, no experiment)" milestones
# count too: missing them made pick_track's CHAIN cue say "32 entries since a paper step" one
# entry after `Paper: Section 6.1` landed (llm-coding-inference, 2026-11-19; 3 friction reports).
PAPER_STEP = re.compile(r"\bpaper (section|step|draft|catch-up)|\bfull paper\b|\bDRAFT\.md\b|"
                        r"\bmanuscript\b|\bwrite-up step\b|\bthe paper draft\b|"
                        r"·\s*paper\b|\bwriting step\b", re.I)


def chain(text):
    """(number, n_substeps, first_label, last_label, first_date, last_date, since_paper) for the
    newest milestone number of a LOG.md, or None with fewer than two labelled entries.
    n_substeps counts distinct labels `<number>[a-z]*`; since_paper is how many entries (newest
    first) come before the newest PAPER_STEP heading, None when no heading names one."""
    es = newest(text, 10 ** 6)
    labelled = [(label(e[1])[1], entry_date(e[1])) for e in es if label(e[1])]
    if len(labelled) < 2:
        return None
    num = re.match(r"\d+", labelled[0][0]).group(0)
    same = [(lab, d) for lab, d in labelled if re.fullmatch(num + r"[a-z]*", lab)]
    labs = list(dict.fromkeys(lab for lab, _ in same))
    dates = sorted(d for _, d in same if d)
    since = next((i for i, e in enumerate(es) if PAPER_STEP.search(e[1])), None)
    return (num, len(labs), labs[-1], labs[0], dates[0] if dates else "", dates[-1] if dates else "", since)


def chain_report(text, has_paper_dir=True):
    c = chain(text)
    if c is None:
        return ["no labelled headings to chain"]
    num, n, first, last, d0, d1, since = c
    out = [f"milestone {num}: {n} label(s), {first}..{last}" + (f", {d0}..{d1}" if d0 else "")]
    if since is None:
        out.append("paper step: no heading names one" + ("" if has_paper_dir else " (and no paper/ directory)"))
    else:
        out.append(f"paper step: {since} entr{'y' if since == 1 else 'ies'} since the newest heading naming one")
    return out


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
    b.add_argument("--prs", action="store_true",
                   help="also count labels and hypotheses in open research/<slug> PRs' LOG.md")
    b.add_argument("--gap", type=int, default=2)
    c = sub.add_parser("chain", help="sub-steps under the newest milestone number, entries since a paper step")
    c.add_argument("project")
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
    if args.cmd == "chain":
        print("\n".join(chain_report(text, (path.parent / "paper").is_dir())))
        return 0
    extra = ref_text(path, args.ref) if args.ref else ""
    if args.ref and not extra:
        print(f"note: {args.ref} has no {path.name} for this project (or the ref is not fetched)",
              file=sys.stderr)
    prs = []
    if args.prs:
        slug = path.resolve().parent.name
        prs = open_pr_logs(slug)
        extra += "".join("\n" + t for _, t in prs)
    print("\n".join(labels_report(text, extra, args.gap)))
    if args.prs:
        base = text + "\n" + (ref_text(path, args.ref) if args.ref else "")
        found = pr_lines(prs, base)
        print("\n".join(found) if found else
              "open PRs:     none adds a label or hypothesis (or the API did not answer)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
