#!/usr/bin/env python3
"""Ask the repository's docs a question by topic or project, and keep their tags honest.

The guidance map (`prompts/system.json`) says which file answers which
question, but nothing said which *section* covers a topic, and the 260-odd
agent reports in `docs/reports/` carried no metadata at all: finding "what do
earlier runs know about shallow clones" or "every note on shed-designer" meant
grepping 2,000 posts and guessing. `docs/taxonomy.json` is now the one topic
vocabulary (ids, aliases, and the `path#Heading` sections that cover each);
reports carry front matter (`kind`, `subjects`, `topics`, `date`) from it.

    python3 platform/ci/doc_index.py find shallow-clone     # guidance sections, reports, posts, history
    python3 platform/ci/doc_index.py find shed-designer --json
    python3 platform/ci/doc_index.py topics                  # the vocabulary, with how often each is used
    python3 platform/ci/doc_index.py check                   # exit 1 on a dangling anchor or bad report tags
    python3 platform/ci/doc_index.py backfill [--write]      # add inferred front matter to reports lacking it

A term resolves through topic ids and aliases, spelling-insensitively (case,
hyphens and a trailing plural s are ignored), and through project directory
names under ventures/, research/ and platform/. How to tag a report:
docs/reports/README.md.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAXONOMY = "docs/taxonomy.json"
REPORTS = "docs/reports"
POSTS = "docs/posts"
HISTORY = "docs/history"
PROJECT_DIRS = ("ventures", "research", "platform")
REPORT_FIELDS = ("kind", "subjects", "topics", "date", "status", "superseded_by",
                 "tagged", "title", "description")
STATUSES = ("current", "superseded")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Aliases too common in report titles to tag one on their own; `find` still resolves them.
_GENERIC_WORDS = {"search", "merge", "merging", "posts", "writing", "rules", "owner", "issues", "market",
           "audience", "product", "venture", "ventures", "pages", "deploy", "fetch", "network",
           "github", "usage", "metrics", "score", "legal", "license", "progress", "research",
           "papers", "statistics", "defaults", "guidelines", "prompts", "layers", "instructions",
           "security", "automation", "scripts", "chores", "marketing", "cookies", "checklist",
           "handoff", "handoffs", "reports", "flagship", "flagships", "calculators", "branches",
           "conflicts", "background", "timeout", "timeouts", "python", "overlap", "duplicates",
           "accounts", "honesty", "safety", "ethics", "audit", "progress", "frontmatter", "tags",
           "counter", "measurement", "routes", "tracks", "fabrication", "deployment", "typescript"}


def tag_key(tag: str) -> str:
    """Spelling-insensitive form of a tag (same rule as check_post_frontmatter.tag_key)."""
    k = re.sub(r"[^a-z0-9]", "", tag.lower())
    return k[:-1] if k.endswith("s") and len(k) > 3 else k


GENERIC = {tag_key(w) for w in _GENERIC_WORDS}


# --------------------------------------------------------------------------
# Loading

def load_taxonomy(root: Path = ROOT) -> dict:
    return json.loads((root / TAXONOMY).read_text())


def topic_index(tax: dict) -> dict[str, str]:
    """tag_key of every id and alias -> topic id."""
    out: dict[str, str] = {}
    for t in tax["topics"]:
        for name in [t["id"], *t.get("aliases", [])]:
            out.setdefault(tag_key(name), t["id"])
    return out


def project_slugs(root: Path = ROOT) -> dict[str, str]:
    """Project directory name -> its path, for ventures/, research/ and platform/."""
    out: dict[str, str] = {}
    # The git tree first: a sparse checkout (prompts CI) lacks directories that hold no .md file.
    done = subprocess.run(["git", "-C", str(root), "ls-tree", "-d", "--name-only", "HEAD",
                           *(f"{t}/" for t in PROJECT_DIRS)], capture_output=True, text=True)
    if done.returncode == 0 and done.stdout.strip() and (root / ".git").exists():
        for rel in done.stdout.split():
            top, _, name = rel.partition("/")
            if name and not name.startswith((".", "_")):
                out.setdefault(name, rel)
    for top in PROJECT_DIRS:
        base = root / top
        if not base.is_dir():
            continue
        for d in sorted(base.iterdir()):
            if d.is_dir() and not d.name.startswith((".", "_")):
                out.setdefault(d.name, f"{top}/{d.name}")
    return out


def parse_frontmatter(text: str) -> tuple[dict | None, str]:
    """A flat `key: value` / `key: [a, b]` block between `---` lines, or None."""
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None, text
    meta: dict = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(":")
        if not sep or line.startswith((" ", "#")):
            continue
        v = v.strip()
        if v.startswith("[") and v.endswith("]"):
            meta[k.strip()] = [x.strip().strip("\"'") for x in v[1:-1].split(",") if x.strip()]
        else:
            meta[k.strip()] = v.strip("\"'")
    return meta, text[m.end():]


def render_frontmatter(meta: dict) -> str:
    lines = ["---"]
    for k in REPORT_FIELDS:
        if k not in meta or meta[k] in (None, "", []):
            continue
        v = meta[k]
        lines.append(f"{k}: [{', '.join(v)}]" if isinstance(v, list) else f"{k}: {v}")
    return "\n".join(lines + ["---", ""])


def as_list(v) -> list[str]:
    if v is None or v == "":
        return []
    return v if isinstance(v, list) else [v]


# --------------------------------------------------------------------------
# Headings and anchors

def _norm_heading(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("`", "").strip()).lower()


@lru_cache(maxsize=None)
def headings(path: Path) -> tuple[tuple[int, str, str], ...]:
    """(line number, level marks, normalised text) of every markdown heading outside code fences."""
    out, fenced = [], False
    for i, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
        if line.startswith("```"):
            fenced = not fenced
        m = None if fenced else re.match(r"(#{1,6})\s+(.*)", line)
        if m:
            out.append((i, m.group(1), _norm_heading(m.group(2))))
    return tuple(out)


def resolve_anchor(root: Path, anchor: str) -> tuple[str, str | None, int | None, str | None]:
    """(path, heading text, line, error). A bare path resolves to line 1."""
    path, _, head = anchor.partition("#")
    f = root / path
    if not f.is_file():
        return path, head or None, None, f"{anchor}: no file {path}"
    if not head:
        return path, None, 1, None
    want = _norm_heading(head)
    for line, _, text in headings(f):
        if text.startswith(want):
            return path, text, line, None
    return path, head, None, f"{anchor}: no heading in {path} starts with {head!r}"


@lru_cache(maxsize=None)
def _system(root: Path) -> tuple[list, list]:
    p = root / "prompts" / "system.json"
    if not p.is_file():
        return [], []
    s = json.loads(p.read_text())
    return [layer["id"] for layer in s.get("layers", [])], s.get("docs", [])


def _glob_re(pattern: str) -> re.Pattern[str]:
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out, i = out + "(?:.*/)?", i + 3
        elif pattern.startswith("**", i):
            out, i = out + ".*", i + 2
        elif pattern[i] == "*":
            out, i = out + "[^/]*", i + 1
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return re.compile(out + r"\Z")


def layer_of(root: Path, rel: str) -> str | None:
    """The guidance layer prompts/system.json gives `rel`, if it maps it."""
    _, docs = _system(root)
    for d in docs:
        if d.get("path") == rel:
            return d["layer"]
    for d in docs:
        if "glob" in d and _glob_re(d["glob"]).match(rel):
            return d["layer"]
    return None


# --------------------------------------------------------------------------
# Reports

def report_files(root: Path) -> list[Path]:
    base = root / REPORTS
    return sorted(p for p in base.glob("*.md") if p.name != "README.md") if base.is_dir() else []


def _stem_parts(name: str) -> tuple[str | None, str]:
    """(date from the filename, the rest of the stem with date and track prefixes removed)."""
    stem = name[:-3] if name.endswith(".md") else name
    date = None
    stem = re.sub(r"^polish-", "", stem)
    m = re.match(r"(\d{4}-\d{2}-\d{2})-?", stem)
    if m:
        date, stem = m.group(1), stem[m.end():]
    else:
        m = re.search(r"-(\d{4}-\d{2}-\d{2})$", stem)  # shed-designer-price-gaps-2026-10-30
        if m:
            date, stem = m.group(1), stem[:m.start()]
    return date, stem


def infer_report(name: str, text: str, slugs: dict[str, str], tax: dict) -> dict:
    """Front matter a report's name and title support. Never guesses a date it cannot read."""
    meta, body = parse_frontmatter(text)
    meta = dict(meta or {})
    date, stem = _stem_parts(name)
    if not date:
        m = re.search(r"^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})", body, re.M)
        date = m.group(1) if m else None
    title = meta.get("title") or next((ln[2:].strip() for ln in body.splitlines() if ln.startswith("# ")), "")

    if name.startswith("polish-"):
        kind = "polish"
    elif re.search(r"(^|-)lane\d", stem):
        kind = "lane"
    elif re.search(r"(^|-)(milestone|m\d+[a-z]?)(-|$)", stem):
        kind = "milestone"
    elif stem.endswith("for-agents") or "(agent note)" in title.lower():
        kind = "brief"
    elif date and name.startswith(date):
        kind = "analysis"
    else:
        kind = "note"

    aliases = tax.get("subject_aliases", {})
    known = {**{s: s for s in slugs}, **{a: t for a, t in aliases.items() if t in slugs}}
    subjects: list[str] = []
    for s in sorted(known, key=len, reverse=True):
        if stem == s or stem.startswith(s + "-"):
            subjects.append(known[s])
            break
    for s in sorted(slugs, key=len, reverse=True):  # a hyphenated project name in the title
        if "-" in s and s not in subjects and re.search(rf"(?<![\w-]){re.escape(s)}(?![\w-])", title.lower()):
            subjects.append(s)

    words = re.findall(r"[a-z0-9.]+", f"{stem} {title}".lower())
    grams = {tag_key(w) for w in words}
    grams |= {tag_key("-".join(words[i:i + n])) for n in (2, 3) for i in range(len(words) - n + 1)}
    topics = []
    for t in tax["topics"]:
        rule = t.get("infer", True)  # false: never inferred; a list: only these words
        if rule is False:
            continue
        names = rule if isinstance(rule, list) else [
            t["id"], *(a for a in t.get("aliases", []) if "-" in a or (len(a) >= 5 and tag_key(a) not in GENERIC))]
        if any(tag_key(n) in grams for n in names):
            topics.append(t["id"])

    out = {k: v for k, v in meta.items() if k in REPORT_FIELDS}
    out.setdefault("kind", kind)
    if date:
        out.setdefault("date", date)
    out.setdefault("subjects", subjects)
    out.setdefault("topics", topics)
    out.setdefault("tagged", "auto")
    return out


def backfill(root: Path = ROOT, write: bool = False) -> list[tuple[str, dict]]:
    """Reports without kind/subjects/topics, and the front matter inferred for them."""
    tax, slugs, done = load_taxonomy(root), project_slugs(root), []
    for p in report_files(root):
        text = p.read_text(errors="replace")
        meta, body = parse_frontmatter(text)
        if meta and "kind" in meta:
            continue
        new = infer_report(p.name, text, slugs, tax)
        done.append((p.name, new))
        if write:
            p.write_text(render_frontmatter(new) + body)
    return done


def report_problems(root: Path, p: Path, tax: dict, slugs: dict[str, str]) -> list[str]:
    meta, _ = parse_frontmatter(p.read_text(errors="replace"))
    rel = f"{REPORTS}/{p.name}"
    if meta is None or "kind" not in meta:
        return [f"{rel}: no front matter with `kind` (see docs/reports/README.md; "
                f"`doc_index.py backfill --write` drafts it)"]
    out = []
    ids = {t["id"] for t in tax["topics"]}
    if meta["kind"] not in tax["report_kinds"]:
        out.append(f"{rel}: kind {meta['kind']!r} is not one of {', '.join(tax['report_kinds'])}")
    for t in as_list(meta.get("topics")):
        if t not in ids:
            hint = topic_index(tax).get(tag_key(t))
            out.append(f"{rel}: topic {t!r} is not in {TAXONOMY}" + (f" (did you mean {hint!r}?)" if hint else ""))
    for s in as_list(meta.get("subjects")):
        if s not in slugs:
            out.append(f"{rel}: subject {s!r} is not a directory under {', '.join(PROJECT_DIRS)}")
    if meta.get("date") and not DATE_RE.match(meta["date"]):
        out.append(f"{rel}: date {meta['date']!r} is not YYYY-MM-DD")
    if meta.get("status") and meta["status"] not in STATUSES:
        out.append(f"{rel}: status {meta['status']!r} is not one of {', '.join(STATUSES)}")
    sb = meta.get("superseded_by")
    if sb and not (root / REPORTS / sb).is_file() and not (root / sb).is_file():
        out.append(f"{rel}: superseded_by {sb!r} names no file")
    return out


# --------------------------------------------------------------------------
# Check

def untagged_reports(root: Path = ROOT) -> list[str]:
    """Reports with no `kind` front matter yet: drafted by `backfill --write`."""
    return [f"{REPORTS}/{p.name}" for p in report_files(root)
            if "kind" not in (parse_frontmatter(p.read_text(errors="replace"))[0] or {})]


def check(root: Path = ROOT, strict: bool = False) -> list[str]:
    """Dangling anchors, alias collisions and invalid report tags. A report with no
    front matter at all fails only with `strict`: ~16 agents merge in parallel, and
    one untagged note should not turn every prompts CI run red (it is warned about)."""
    tax, slugs, errors = load_taxonomy(root), project_slugs(root), []
    seen: dict[str, str] = {}
    for t in tax["topics"]:
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", t["id"]):
            errors.append(f"{TAXONOMY}: topic id {t['id']!r} is not kebab-case")
        if not t.get("covered_by"):
            errors.append(f"{TAXONOMY}: topic {t['id']!r} names no section that covers it")
        for name in [t["id"], *t.get("aliases", [])]:
            k = tag_key(name)
            if k in seen and seen[k] != t["id"]:
                errors.append(f"{TAXONOMY}: {name!r} in {t['id']!r} collides with {seen[k]!r}")
            seen.setdefault(k, t["id"])
        for a in t.get("covered_by", []):
            err = resolve_anchor(root, a)[3]
            if err:
                errors.append(f"{TAXONOMY}: topic {t['id']!r}: {err}")
    for alias, target in tax.get("subject_aliases", {}).items():
        if target not in slugs:
            errors.append(f"{TAXONOMY}: subject alias {alias!r} -> {target!r} names no project directory")
    for p in report_files(root):
        probs = report_problems(root, p, tax, slugs)
        if strict or not (len(probs) == 1 and "no front matter" in probs[0]):
            errors += probs
    return errors


# --------------------------------------------------------------------------
# Find

def _posts(root: Path) -> list[tuple[str, str, list[str]]]:
    out = []
    base = root / POSTS
    for p in sorted(base.glob("*.md"), reverse=True) if base.is_dir() else []:
        meta, _ = parse_frontmatter(p.read_text(errors="replace"))
        if meta:
            out.append((f"{POSTS}/{p.name}", meta.get("title", p.stem), as_list(meta.get("tags"))))
    return out


def resolve(term: str, tax: dict, slugs: dict[str, str]) -> tuple[list[str], list[str]]:
    """(topic ids, project subjects) a term names. Falls back to a substring of topic labels."""
    k = tag_key(term)
    idx = topic_index(tax)
    topics = [idx[k]] if k in idx else []
    if not topics:
        low = term.lower()
        topics = [t["id"] for t in tax["topics"] if low in t["label"].lower()]
    aliases = tax.get("subject_aliases", {})
    subjects = [s for s in slugs if tag_key(s) == k]
    if not subjects and term in aliases and aliases[term] in slugs:
        subjects = [aliases[term]]
    return topics, subjects


def find(term: str, root: Path = ROOT, limit: int = 10) -> dict:
    tax, slugs = load_taxonomy(root), project_slugs(root)
    topics, subjects = resolve(term, tax, slugs)
    by_id = {t["id"]: t for t in tax["topics"]}
    order, _ = _system(root)
    rank = {layer: i for i, layer in enumerate(order)}

    guidance = []
    for tid in topics:
        for a in by_id[tid]["covered_by"]:
            path, head, line, err = resolve_anchor(root, a)
            if not err:
                guidance.append({"topic": tid, "path": path, "line": line, "heading": head,
                                 "layer": layer_of(root, path) or "doc"})
    guidance.sort(key=lambda g: (rank.get(g["layer"], len(rank)), g["path"], g["line"] or 0))

    want_keys = {tag_key(n) for tid in topics for n in [tid, *by_id[tid].get("aliases", [])]}
    want_keys |= {tag_key(s) for s in subjects}
    reports = []
    for p in report_files(root):
        meta, body = parse_frontmatter(p.read_text(errors="replace"))
        meta = meta or {}
        hit_t = [t for t in as_list(meta.get("topics")) if t in topics]
        hit_s = [s for s in as_list(meta.get("subjects")) if s in subjects]
        if hit_t or hit_s:
            title = meta.get("title") or next((ln[2:].strip() for ln in body.splitlines() if ln.startswith("# ")), p.stem)
            reports.append({"path": f"{REPORTS}/{p.name}", "date": meta.get("date"), "kind": meta.get("kind"),
                            "title": title, "status": meta.get("status", "current")})
    reports.sort(key=lambda r: (r["status"] == "current", r["date"] or ""), reverse=True)  # current, newest first

    posts = [{"path": path, "title": title} for path, title, tags in _posts(root)
             if want_keys & {tag_key(t) for t in tags}]
    hist_base = root / HISTORY
    names = {term.lower(), *topics, *subjects}  # a whole hyphen-separated run of the file name
    pats = [re.compile(rf"(^|-){re.escape(n)}(-|$)") for n in names]
    history = [f"{HISTORY}/{p.name}" for p in sorted(hist_base.glob("*.md"), reverse=True)
               if any(rx.search(p.stem.lower()) for rx in pats)] if hist_base.is_dir() else []

    return {"term": term, "topics": [{"id": t, "label": by_id[t]["label"]} for t in topics],
            "projects": [{"name": s, "path": slugs[s]} for s in subjects],
            "guidance": guidance, "reports": reports[:limit], "reports_total": len(reports),
            "posts": posts[:limit], "posts_total": len(posts), "history": history[:limit]}


def print_find(r: dict) -> None:
    if not (r["topics"] or r["projects"]):
        print(f"{r['term']!r} names no topic or project. `doc_index.py topics` lists the vocabulary.")
        return
    for t in r["topics"]:
        print(f"topic {t['id']}: {t['label']}")
    for p in r["projects"]:
        print(f"project {p['name']}: {p['path']}/")
    if r["guidance"]:
        print("\nGuidance (highest precedence first):")
        for g in r["guidance"]:
            where = f"{g['path']}:{g['line']}"
            print(f"  [{g['layer']}] {where}" + (f"  \"{g['heading']}\"" if g["heading"] else ""))
    if r["reports"]:
        print(f"\nAgent reports ({r['reports_total']}, newest first):")
        for x in r["reports"]:
            flag = "" if x["status"] == "current" else f" ({x['status']})"
            print(f"  {x['date'] or '          '}  {x['path']}{flag}  {x['title'][:70]}")
    if r["posts"]:
        print(f"\nPosts ({r['posts_total']}, newest first):")
        for x in r["posts"]:
            print(f"  {x['path']}  {x['title'][:70]}")
    if r["history"]:
        print("\nHistory:")
        for h in r["history"]:
            print(f"  {h}")


def topic_counts(root: Path = ROOT) -> list[tuple[str, str, int, int]]:
    tax = load_taxonomy(root)
    idx = topic_index(tax)
    rep: dict[str, int] = {}
    for p in report_files(root):
        meta, _ = parse_frontmatter(p.read_text(errors="replace"))
        for t in as_list((meta or {}).get("topics")):
            rep[t] = rep.get(t, 0) + 1
    post: dict[str, int] = {}
    for _, _, tags in _posts(root):
        for t in {idx[k] for k in (tag_key(x) for x in tags) if k in idx}:
            post[t] = post.get(t, 0) + 1
    return [(t["id"], t["label"], rep.get(t["id"], 0), post.get(t["id"], 0)) for t in tax["topics"]]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("find", help="guidance sections, reports, posts and history for a topic or project")
    p.add_argument("term")
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--json", action="store_true")
    sub.add_parser("topics", help="the topic vocabulary, with report and post counts")
    p = sub.add_parser("check", help="exit 1 on a dangling anchor, an alias collision or a bad report tag")
    p.add_argument("--strict", action="store_true", help="also fail on a report with no front matter")
    p = sub.add_parser("backfill", help="infer front matter for reports that lack it")
    p.add_argument("--write", action="store_true")
    a = ap.parse_args(argv)
    root = a.root.resolve()

    if a.cmd == "find":
        r = find(a.term, root, a.limit)
        print(json.dumps(r, indent=1)) if a.json else print_find(r)
        return 0 if (r["topics"] or r["projects"]) else 1
    if a.cmd == "topics":
        print(f"{'topic':22} {'reports':>7} {'posts':>6}  label")
        for tid, label, nr, np_ in topic_counts(root):
            print(f"{tid:22} {nr:7} {np_:6}  {label}")
        return 0
    if a.cmd == "check":
        errs = check(root, a.strict)
        untagged = [] if a.strict else untagged_reports(root)
        if untagged:
            print(f"doc_index: {len(untagged)} report(s) without front matter "
                  f"(`doc_index.py backfill --write` drafts it): {', '.join(untagged)}", file=sys.stderr)
        for e in errs:
            print(e)
        print(f"doc_index: {len(errs)} problem(s)" if errs else "doc_index: ok", file=sys.stderr)
        return 1 if errs else 0
    if a.cmd == "backfill":
        done = backfill(root, a.write)
        for name, meta in done:
            print(f"{name}: kind={meta['kind']} date={meta.get('date', '-')} "
                  f"subjects={meta['subjects']} topics={meta['topics']}")
        print(f"{'wrote' if a.write else 'would write'} front matter on {len(done)} report(s)", file=sys.stderr)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
