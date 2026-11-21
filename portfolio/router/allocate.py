#!/usr/bin/env python3
"""Portfolio router v1: reads ventures/*/VENTURE.yaml and produces a ranked
work queue of where the next unit of agent effort should go.

This implements the heuristic described in README.md — protected explore
budget, and treating an unmeasured venture differently from one measured at
zero. It is a read-only report over the current VENTURE.yaml files; it does
not spend anything or write anything back.

It now also reads portfolio/ledger/*.yaml to surface two informational,
display-only counts per venture — neither is part of `rank()`:

- `ledger_entries` — entries this month recorded with `venture: <name>`
  directly. A reliable count, but as of 2026-08 only ~1 in 5 entries use it;
  most sessions record an aggregated `venture: portfolio` survey entry
  instead, so this alone undercounts most ventures' actual coverage.
- `portfolio_mentions` — entries recorded under `venture: portfolio` whose
  outcome text names this venture by its exact slug. A heuristic, not a
  precise touch count (prose can mention a venture without any work
  happening, or describe work without using its exact slug), but a
  whole-word slug match against a known, distinctive set of venture names
  has a low false-positive/negative rate and is far better than the zero
  these entries otherwise contribute.

Neither count drives ranking yet — see README.md's "Attribution honesty"
section for why that next step is deliberately not automated.

Rows that an open PR already works say so first ("OPEN PR #N (2h old)"),
from the REST pulls list (search as fallback); `--no-claims` skips it.

Usage:
    python3 portfolio/router/allocate.py           # table
    python3 portfolio/router/allocate.py --json     # JSON work queue
    python3 portfolio/router/allocate.py --venture ai-bookkeeper   # one row in full
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from claim_check import REPO, claim_recipe, open_prs  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"
LEDGER_DIR = REPO_ROOT / "portfolio" / "ledger"
SCORES_PATH = REPO_ROOT / "portfolio" / "scoring" / "venture-scores.yaml"
FLAGSHIPS_PATH = REPO_ROOT / "portfolio" / "flagships.yaml"
REQUESTS_PATH = REPO_ROOT / "portfolio" / "requests" / "requests.json"
REQUEST_OPEN = ("building", "accepted", "received")

# Stage at or beyond which a venture is no longer "early" for the protected
# explore-budget split described in README.md.
LATER_STAGES = {"revenue", "scaling"}

EXPLORE_SPLIT_LATER = 0.60
EXPLORE_SPLIT_EARLY = 0.40


@dataclass
class Venture:
    name: str
    stage: str
    mrr: Optional[float]
    monthly_cost: Optional[float]
    monthly_cap: float
    protected: bool
    kill_criteria: list = field(default_factory=list)
    hypotheses: list = field(default_factory=list)
    production_url: Optional[str] = None
    ledger_entries: int = 0
    portfolio_mentions: int = 0
    merit: Optional[float] = None
    # Commits in the last 7 days; filled by main() so rank() stays pure.
    recent_commits: int = 0
    # Set from VENTURE.yaml `consolidated_into: <host>` once this venture's
    # calculation lives in a shared engine; the family task skips it.
    consolidated_into: Optional[str] = None
    # Position in portfolio/flagships.yaml (0 = first) and its next deep
    # milestone; None for every venture not on that list.
    flagship_rank: Optional[int] = None
    flagship_next: Optional[str] = None
    # flagships.yaml `inputs_only: <what is missing>`: every listed item needs
    # a real outside input no session holds, so the flagship ranks after the
    # flagships with buildable work (run-record doc_friction, 2026-11-10: four
    # runs in two hours sent to the top Deepen row found nothing to build).
    flagship_inputs_only: Optional[str] = None
    # flagships.yaml `buildable: <items a cloud session can do now>`: shown
    # ahead of the `next:` history so a run need not read every full `next:`
    # to find a tractable item (run-record doc_friction on this file,
    # 2026-11-11: seven runs read rows 1-4 in full, then took a lower row).
    flagship_buildable: Optional[str] = None
    # flagships.yaml `hosts: [<url>, ...]`: hosts the row's buildable items
    # need. `--venture` probes them each run, because a prose "X answers 403"
    # or "X serves files" note goes stale between sessions (13 reports in 4
    # friction_rank clusters on this file, 2026-11-13..15: raw.pixls.us and
    # archive.org each read both ways within a day).
    flagship_hosts: list = field(default_factory=list)
    # flagships.yaml `not_before: YYYY-MM-DD`: nothing on the row is buildable
    # before that date (an upstream tag, a dataset release). Set only while the
    # date is still ahead; the row then ranks with the inputs_only ones and
    # start_here skips it, and on the date it is a Deepen row again with no edit
    # (four runs in two days left einvoice-preflight, whose only buildable
    # item was dated "after 2026-11-23": run-record doc_friction, 2026-11-18).
    flagship_not_before: Optional[date] = None

    @property
    def flagship(self) -> bool:
        return self.flagship_rank is not None

    @property
    def _first_untested(self) -> Optional[dict]:
        for h in self.hypotheses:
            if isinstance(h, dict) and h.get("status") == "untested" and h.get("claim"):
                return h
        return None

    @property
    def untested_hypothesis(self) -> Optional[str]:
        """The claim text of the first hypothesis still marked untested.

        VENTURE.yaml's hypotheses list is the venture's own record of what
        it needs to learn next. Every venture in the portfolio is currently
        unmeasured, so a generic "push toward the first real measurement"
        task is the same for all of them -- this makes that task specific.
        """
        h = self._first_untested
        return h["claim"] if h else None

    @property
    def blocker(self) -> Optional[str]:
        """Why no agent session can settle this venture's next hypothesis.

        A `customer-contact` claim is settled by a response from someone
        outside this repository -- a purchase, a signup, a download, a
        survey answer. None of that is observable while the venture has no
        `links.production`: there is nothing published for anyone to respond
        to, and publishing is the account owner's decision.

        Returning None means the next task is one a session can actually
        start. The router ranks on this, so undispatchable work stops
        occupying the top of the queue.
        """
        h = self._first_untested
        if h is None:
            return None
        if h.get("evidence") != "customer-contact":
            return None
        if self.production_url:
            return None
        return "not published — no `links.production`, so no customer can respond"

    @property
    def dispatchable(self) -> bool:
        # A flagship's task is a code milestone, which no customer has to answer.
        return self.flagship or self.blocker is None

    @property
    def awaits_visitors(self) -> bool:
        """The next hypothesis needs a response from visitors, and the venture is published.

        Code cannot settle it: the surface is built and live, so the next
        unit of work is distribution or measurement, not another feature.
        Run records (2026-10-19/20) say the top Explore rows kept sending
        sessions to products whose handoff was already shipped.
        """
        h = self._first_untested
        return bool(h and h.get("evidence") == "customer-contact" and self.production_url)

    @property
    def maintain_only(self) -> bool:
        """A calculator that is not a flagship: kept live and fixed when broken,
        never deepened (owner, 2026-10-21)."""
        return not self.flagship and is_calculator(self.name)

    @property
    def measured(self) -> bool:
        return self.mrr is not None

    @property
    def later_stage(self) -> bool:
        return self.stage in LATER_STAGES

    @property
    def needs_decision(self) -> bool:
        """Measured at exactly zero past the point spend should show up."""
        return self.later_stage and self.mrr == 0


def count_ledger_entries(ledger_dir: Path = LEDGER_DIR) -> dict[str, int]:
    """Count ledger entries per venture name across portfolio/ledger/*.yaml.

    Counts only entries with a `venture:` field matching that venture's
    name directly. Entries recorded under `venture: portfolio` (a session
    surveying or fixing several ventures in one cycle) are not attributed
    to the individual ventures they mention in free-text outcomes -- doing
    that reliably would mean parsing prose, not structured data. So this
    undercounts ventures whose work happened inside a portfolio-wide
    survey entry; treat it as a lower bound, not a precise touch count.
    """
    counts: dict[str, int] = {}
    if not ledger_dir.is_dir():
        return counts
    for ledger_path in sorted(ledger_dir.glob("*.yaml")):
        data = _load_yaml(ledger_path)
        for entry in data.get("entries") or []:
            name = entry.get("venture")
            if name:
                counts[name] = counts.get(name, 0) + 1
    return counts


_WARNED_NO_LIBYAML = False


def _load_yaml(path: Path) -> dict:
    """safe_load, through libyaml when installed (the pure-Python parser was 35s of a 60s run)."""
    loader = getattr(yaml, "CSafeLoader", None)
    if loader is None:
        global _WARNED_NO_LIBYAML
        if not _WARNED_NO_LIBYAML:
            _WARNED_NO_LIBYAML = True
            print("(this python's PyYAML has no libyaml: loading ~1,300 VENTURE.yaml takes ~35s. "
                  "Another interpreter is ~15x faster, e.g. /usr/bin/python3.13 or a venv with "
                  "`pip install pyyaml`.)", file=sys.stderr)
        loader = yaml.SafeLoader
    text = _FLAGSHIPS_TEXT if _FLAGSHIPS_TEXT is not None and path == FLAGSHIPS_PATH else path.read_text()
    return yaml.load(text, Loader=loader) or {}


# portfolio/flagships.yaml as origin/main has it, when that is newer than this checkout's copy
# (use_main_flagships). None means read the file.
_FLAGSHIPS_TEXT: Optional[str] = None


def count_portfolio_mentions(
    venture_names: list[str], ledger_dir: Path = LEDGER_DIR
) -> dict[str, int]:
    """Count `venture: portfolio` entries whose outcome text names each venture.

    `count_ledger_entries` only counts entries filed directly under a
    venture's own name, which as of 2026-08 is a small minority (~20%) of
    entries -- most sessions that touch several ventures in one pass record
    a single aggregated `venture: portfolio` entry instead, and those
    contribute nothing to the per-venture count. This recovers a heuristic
    signal from that majority: for each `venture: portfolio` entry, a
    venture is counted once if its exact slug appears as a whole word
    anywhere in that entry's `outcomes` text. Venture slugs
    (`ai-first-markets`, `retail-pilot-intel`, ...) are distinctive enough
    that false-positive substring matches are unlikely; this is still a
    heuristic, not a precise touch count, which is why it is reported
    separately from `ledger_entries` rather than merged into it.
    """
    counts: dict[str, int] = {name: 0 for name in venture_names}
    # Venture slugs are hyphenated (e.g. "ai-first-markets"), and a plain
    # \b boundary treats '-' as a non-word character -- it would match
    # "alpha-venture" inside "alpha-venture-extended" at the second hyphen.
    # Treat '-' as part of the "word" for boundary purposes instead, so a
    # slug only matches when it is not itself part of a longer slug.
    # A slug counts when it equals a whole run of [\w-] characters in the text, which is the same
    # test as the boundary lookarounds. One tokenise per entry replaces ~1,300 regex scans per
    # entry (46s of a 60s run on 2026-10-19).
    plain = {name for name in venture_names if re.fullmatch(r"[\w-]+", name)}
    patterns = {
        name: re.compile(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])")
        for name in venture_names if name not in plain
    }
    if not ledger_dir.is_dir():
        return counts
    for ledger_path in sorted(ledger_dir.glob("*.yaml")):
        data = _load_yaml(ledger_path)
        for entry in data.get("entries") or []:
            if entry.get("venture") != "portfolio":
                continue
            text = "\n".join(str(o) for o in entry.get("outcomes") or [])
            for name in plain.intersection(re.findall(r"[\w-]+", text)):
                counts[name] += 1
            for name, pattern in patterns.items():
                if pattern.search(text):
                    counts[name] += 1
    return counts


def load_merit_scores(scores_path: Path = SCORES_PATH) -> dict[str, float]:
    """Composite merit score per venture from portfolio/scoring/.

    Merit answers "is this business any good"; everything else in this file
    answers "can a session start on it". They are different questions and the
    scoring pass found they do not agree, so merit is used only to order
    ventures that are otherwise tied -- never to promote blocked work above
    work a session can actually pick up.
    """
    if not scores_path.is_file():
        return {}
    doc = _load_yaml(scores_path)
    return {
        v["slug"]: float(v["composite"])
        for v in doc.get("ventures") or []
        if v.get("slug") and v.get("composite") is not None
    }


def load_flagships(path: Path = FLAGSHIPS_PATH) -> dict[str, tuple[int, str]]:
    """{venture: (rank, next milestone)} from portfolio/flagships.yaml.

    The flagships are the few ventures with real depth that most venture runs
    should deepen instead of adding another small tool (owner, 2026-10-20;
    see that file). A missing file means no flagships, not an error.
    """
    if not path.is_file():
        return {}
    out: dict[str, tuple[int, str]] = {}
    for i, entry in enumerate(_load_yaml(path).get("flagships") or []):
        if isinstance(entry, dict) and entry.get("venture"):
            out[entry["venture"]] = (i, str(entry.get("next") or "").strip())
    return out


def load_flagship_field(field: str, path: Path = FLAGSHIPS_PATH) -> dict[str, str]:
    """{venture: text} for flagships that set `field:` (e.g. inputs_only, buildable)."""
    if not path.is_file():
        return {}
    return {
        e["venture"]: " ".join(str(e[field]).split())
        for e in _load_yaml(path).get("flagships") or []
        if isinstance(e, dict) and e.get("venture") and e.get(field)
    }


def load_flagship_hosts(path: Path = FLAGSHIPS_PATH) -> dict[str, list[str]]:
    """{venture: [url, ...]} for flagships that set `hosts:` (a list, or URLs separated by spaces)."""
    if not path.is_file():
        return {}
    out: dict[str, list[str]] = {}
    for e in _load_yaml(path).get("flagships") or []:
        if isinstance(e, dict) and e.get("venture") and e.get("hosts"):
            raw = e["hosts"]
            out[e["venture"]] = [str(h).strip() for h in (raw if isinstance(raw, list) else str(raw).split()) if str(h).strip()]
    return out


# Host names written into a row's prose (`buildable:`/`next:`) are probed too,
# so a row that names a host without listing it in `hosts:` still gets a reading.
# Only real TLDs, so file names (README.md, calc.mjs, flagships.yaml) never match.
_HOST_RE = re.compile(
    r"(?<![\w./@-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+"
    r"(?:org|com|net|gov|edu|io|int|eu|uk|de|fr|it|es|nl|us|ca|au|ch|mx|br|pl|pt|ro|hr|app|dev|info|co|ai|ru))(?![\w-])",
    re.I,
)


# Scripts a `buildable:` names (eval/cord_images.py, eval/srd-fetch.mjs) are
# read for the hosts they fetch from. ai-bookkeeper's row named its CORD fetch
# script but no host, so a session learned huggingface.co was refused only when
# the fetch failed (2 doc-friction reports, 2026-11-17).
_SCRIPT_RE = re.compile(r"(?<![\w/.-])((?:[\w.-]+/)*[\w.-]+\.(?:py|mjs|js|sh))(?![\w-])")
_URL_RE = re.compile(r"https?://([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)", re.I)
SCRIPT_HOSTS_MAX = 4
_NOT_FETCHED = ("localhost", "example.com", "example.org", "opensource.org", "creativecommons.org",
                "spdx.org", "www.w3.org", "doi.org", "schema.org")


def script_hosts(text: str, root: Path) -> list[str]:
    """Host names fetched by the scripts `text` names that exist under `root`.

    Comments count: cord_images.py names its download URL in its usage
    comment. Licence and reference hosts (_NOT_FETCHED) are skipped, and at
    most SCRIPT_HOSTS_MAX are returned so a probe stays a few seconds."""
    out: list[str] = []
    for m in _SCRIPT_RE.finditer(text):
        path = root / m.group(1)
        try:
            if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
                continue
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            for u in _URL_RE.finditer(line):
                name = u.group(1).lower()
                if name not in out and not any(name == h or name.endswith("." + h) for h in _NOT_FETCHED):
                    out.append(name)
    return out[:SCRIPT_HOSTS_MAX]


def row_hosts(v: "Venture", ventures_dir: Path = VENTURES_DIR) -> list[str]:
    """Hosts to probe for flagship `v`: its `hosts:` URLs, then host names its
    prose names, then hosts the scripts its `buildable:` names fetch from."""
    seen: dict[str, str] = {}
    for url in v.flagship_hosts:
        name = re.sub(r"^[a-z]+://", "", url, flags=re.I).split("/", 1)[0].lower()
        seen.setdefault(name, url if "://" in url else "https://" + url)
    for text in (v.flagship_buildable or "", v.flagship_next or ""):
        for m in _HOST_RE.finditer(text):
            name = m.group(1).lower()
            seen.setdefault(name, "https://" + name + "/")
    for name in script_hosts(v.flagship_buildable or "", ventures_dir / v.name):
        seen.setdefault(name, "https://" + name + "/")
    return list(seen.values())


def host_answers(url: str, timeout: float = 6, tries: int = 2) -> bool:
    """True when `url` answers at all (any HTTP status, a 403 from the host included);
    False when the connection or the egress proxy's CONNECT fails every try.
    Same test as research/_shared/pick_track.py's, which the research HOSTS files use."""
    import urllib.error
    import urllib.request
    for _ in range(tries):
        try:
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=timeout).close()
            return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            pass
    return False


def need_hosts(v: "Venture") -> list[str]:
    """The hosts a flagship's buildable work needs: its curated `hosts:` URLs and
    host names its `buildable:` prose names. Not the `next:` prose or the
    scripts' URLs, which `row_hosts` adds for the full report: those name
    reference and legacy hosts (www.buildingsmart-tech.org, refused on
    2026-11-19) whose refusal says nothing about the buildable item."""
    seen: dict[str, str] = {}
    buildable = v.flagship_buildable or ""
    named = {m.group(1).lower() for m in _HOST_RE.finditer(buildable)}
    # A buildable that says it needs "no outside input" outranks a `hosts:`
    # list left over from an earlier item: only hosts its own prose names are
    # probed. On 2026-11-21 chant-forge ("Coda reader, no outside input") was
    # moved behind every reachable row because its old hosts: archive.org was
    # refused, and had 0 merged commits in two days while the 4 rows left in
    # the Start here pool took 22-37 each (process critique, run record notes).
    own_word = bool(_NO_INPUT_RE.search(buildable))
    # A host the prose names only in a clause that says its files are spent
    # ("its CIFF CRWs all read") is not needed by the open item, whether it
    # comes from the prose or from `hosts:`. On 2026-11-21 photo-editing was
    # moved behind every reachable row for raw.pixls.us (named only as "all
    # read") while its open work runs on github.com (backlog P070).
    spent = spent_hosts(buildable)
    named -= spent
    for url in v.flagship_hosts:
        name = re.sub(r"^[a-z]+://", "", url, flags=re.I).split("/", 1)[0].lower()
        if (own_word and name not in named) or name in spent:
            continue
        seen.setdefault(name, url if "://" in url else "https://" + url)
    for name in sorted(named, key=buildable.lower().find):
        seen.setdefault(name, "https://" + name + "/")
    return list(seen.values())


_NO_INPUT_RE = re.compile(r"\bno outside input\b", re.I)
_SPENT_RE = re.compile(r"\b(?:all read|spent|optional)\b", re.I)


def clauses(text: str) -> list[str]:
    """`text` split at top-level `;` and sentence ends (". " or a final "."),
    keeping a parenthesis with the clause it belongs to, so "raw.pixls.us
    (CC0, `curl -L`; its CIFF CRWs all read)" stays one clause."""
    out, cur, depth = [], [], 0
    for i, ch in enumerate(text):
        depth += (ch == "(") - (ch == ")" and depth > 0)
        end = depth == 0 and (ch == ";" or (ch == "." and (i + 1 == len(text) or text[i + 1].isspace())))
        if end:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return [c for c in out if c.strip()]


def spent_hosts(buildable: str) -> set[str]:
    """Hosts `buildable` names only in clauses marked spent (_SPENT_RE)."""
    spent, used = set(), set()
    for c in clauses(buildable):
        names = {m.group(1).lower() for m in _HOST_RE.finditer(c)}
        (spent if _SPENT_RE.search(c) else used).update(names)
    return spent - used


def table_probe(url: str) -> bool:
    """host_answers with one 4 s try, so probing every Deepen row for the table
    costs a few seconds, not the 12 s two 6 s tries take on a host that hangs."""
    return host_answers(url, timeout=4, tries=1)


def refused_rows(ventures: list["Venture"], probe=table_probe) -> dict[str, list[str]]:
    """{flagship: [refused host, ...]} for flagships with a `buildable:` whose
    need_hosts include one `probe` refuses from this session. Each host is
    probed once, in parallel.

    Why: Start here kept naming ai-bookkeeper on 2026-11-19 although its
    buildable receipt items need huggingface.co and `--venture`'s own probe
    said REFUSED; 9 run records that day left the row for that reason (2 for
    photo-editing's raw.pixls.us), each after reading the row. `inputs_only:`
    does not fit, since the same host answers from other sessions (it answered
    from this one), so the demotion is per session, made where the pick is."""
    rows = {v.name: need_hosts(v) for v in ventures if v.flagship and v.flagship_buildable}
    urls = sorted({u for hosts in rows.values() for u in hosts})
    if not urls:
        return {}
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=min(8, len(urls))) as ex:
        ok = dict(zip(urls, ex.map(probe, urls)))
    out = {}
    for name, hosts in rows.items():
        bad = [re.sub(r"^[a-z]+://", "", u, flags=re.I).rstrip("/") for u in hosts if not ok[u]]
        if bad:
            out[name] = bad
    return out


def hosts_line(urls: list[str], answers=host_answers) -> str:
    """One line saying which of `urls` answer from this session right now."""
    if not urls:
        return ""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=min(8, len(urls))) as ex:
        ok = list(ex.map(answers, urls))
    parts = [re.sub(r"^[a-z]+://", "", u, flags=re.I).rstrip("/") + (" answers" if a else " REFUSED")
             for u, a in zip(urls, ok)]
    return ("hosts, probed just now (trust this over any 'answers 403' or 'serves files' note "
            "in the row; reachability changes between sessions): " + "; ".join(parts))


def load_not_before(path: Path = FLAGSHIPS_PATH, today: Optional[date] = None) -> dict[str, date]:
    """{venture: date} for flagships whose `not_before:` date is still ahead of
    `today` (UTC). A past date, or one that does not parse, is left out: the
    row is buildable again (validate.py reports a malformed one)."""
    if not path.is_file():
        return {}
    today = today or datetime.now(timezone.utc).date()
    out = {}
    for e in _load_yaml(path).get("flagships") or []:
        if not (isinstance(e, dict) and e.get("venture") and e.get("not_before")):
            continue
        when = e["not_before"]
        if isinstance(when, str):
            try:
                when = date.fromisoformat(when.strip())
            except ValueError:
                continue
        if isinstance(when, datetime):
            when = when.date()
        if isinstance(when, date) and when > today:
            out[e["venture"]] = when
    return out


def load_inputs_only(path: Path = FLAGSHIPS_PATH) -> dict[str, str]:
    """{venture: what is missing} for flagships marked `inputs_only:`."""
    return load_flagship_field("inputs_only", path)


def load_ventures(
    ventures_dir: Path = VENTURES_DIR,
    ledger_dir: Path = LEDGER_DIR,
    scores_path: Path = SCORES_PATH,
    flagships_path: Path = FLAGSHIPS_PATH,
    today: Optional[date] = None,
) -> list[Venture]:
    ledger_counts = count_ledger_entries(ledger_dir)
    merit_scores = load_merit_scores(scores_path)
    flagships = load_flagships(flagships_path)
    inputs_only = load_inputs_only(flagships_path)
    buildable = load_flagship_field("buildable", flagships_path)
    hosts = load_flagship_hosts(flagships_path)
    not_before = load_not_before(flagships_path, today)
    venture_dirs = sorted(p for p in ventures_dir.iterdir() if p.is_dir())
    names = []
    parsed = []
    for venture_dir in venture_dirs:
        if (venture_dir / "NOT-A-VENTURE").is_file():
            continue
        yaml_path = venture_dir / "VENTURE.yaml"
        if not yaml_path.is_file():
            continue
        data = _load_yaml(yaml_path)
        name = data.get("name", venture_dir.name)
        names.append(name)
        parsed.append((name, data))
    mention_counts = count_portfolio_mentions(names, ledger_dir)
    ventures = []
    for name, data in parsed:
        economics = data.get("economics") or {}
        budget = data.get("budget") or {}
        links = data.get("links") or {}
        flag_rank, flag_next = flagships.get(name, (None, None))
        ventures.append(
            Venture(
                name=name,
                stage=data.get("stage", "idea"),
                mrr=economics.get("mrr"),
                monthly_cost=economics.get("monthly_cost"),
                monthly_cap=float(budget.get("monthly_cap") or 0),
                protected=bool(budget.get("protected", False)),
                kill_criteria=data.get("kill_criteria") or [],
                hypotheses=data.get("hypotheses") or [],
                production_url=links.get("production"),
                ledger_entries=ledger_counts.get(name, 0),
                portfolio_mentions=mention_counts.get(name, 0),
                merit=merit_scores.get(name),
                consolidated_into=data.get("consolidated_into"),
                flagship_rank=flag_rank,
                flagship_next=flag_next,
                flagship_inputs_only=inputs_only.get(name) if flag_rank is not None else None,
                flagship_buildable=buildable.get(name) if flag_rank is not None else None,
                flagship_hosts=hosts.get(name, []) if flag_rank is not None else [],
                flagship_not_before=not_before.get(name) if flag_rank is not None else None,
            )
        )
    return ventures


# A venture with this many commits in 7 days is usually already deep; its
# Explore task needs visitors more than code, so it yields to a shallow one
# (5+ run-record doc_friction reports, 2026-10-18/19: "top rows all saturated").
HOT_COMMITS = 3


def rank(ventures: list[Venture]) -> list[Venture]:
    """Order ventures for the next unit of agent effort.

    Priority:
      1. Measured at $0 MRR at revenue stage or beyond -- this needs a
         decision (kill or fix) before more spend, not blind continuation.
      2. Work a session can actually start. A blocked venture ranked first
         hands every session an impossible task, which is how the queue
         came to be ignored: separate cycles kept concluding in the ledger
         that the top-ranked task was "outside what an unattended session
         can drive", each in prose, none of it reaching the router.
      3. Flagships (portfolio/flagships.yaml), in that file's order. These
         are the ventures with real depth; the owner asked (2026-10-20) for
         more of the work to deepen them rather than add small tools. They
         are exempt from the HOT_COMMITS demotion below, which exists to
         spread effort across shallow ventures, the opposite of what a
         flagship needs. A flagship marked `inputs_only:` (every listed
         item needs a real outside input) ranks after the buildable ones,
         as does one whose `not_before:` date is still ahead.
      4. Not a calculator. Calculators are maintain-only (owner, 2026-10-21,
         `prompts/goals.md` "Direction: depth over calculators"), so they
         sink below every other dispatchable venture and their task says
         fix-if-broken rather than explore or consolidate.
      5. Unmeasured ventures -- still owed their protected explore budget;
         null MRR is "not yet measured", not "measured and failing". Among
         them, ventures with an untested hypothesis come before ones with none:
         "write a hypothesis" is a thin task, and dozens of them at the top
         hid the ventures that had a real claim to test.
      6. Everything else: later stage before earlier stage, then ventures not
         already folded into another (consolidated_into) before those that
         were (their Explore task has no product left to test), then ventures not
         worked heavily this week (HOT_COMMITS+ commits in 7 days) before
         those that were, then by merit score descending, then monthly_cap descending, then least-worked (ledger + mentions), then name for a
         stable order.

    Merit (portfolio/scoring/) sits below dispatchability deliberately. The
    two orderings disagree -- the scoring pass measured the dispatchable
    ventures at a *lower* mean composite than the blocked ones -- so letting
    merit outrank dispatchability would put work no session can start back at
    the top of the queue, which is the failure `dispatchable` was added to
    fix. What merit does is order ventures that are otherwise tied, which
    before this was decided by budget cap: an input the portfolio set, not
    evidence about the venture.
    """

    def sort_key(v: Venture):
        return (
            0 if v.needs_decision else 1,
            0 if v.dispatchable else 1,
            (1 if v.flagship_inputs_only or v.flagship_not_before else 0, v.flagship_rank)
            if v.flagship_rank is not None else (2, 0),
            1 if v.maintain_only else 0,
            1 if v.awaits_visitors else 0,
            0 if not v.measured else 1,
            0 if v.untested_hypothesis else 1,
            0 if v.later_stage else 1,
            1 if v.consolidated_into else 0,
            1 if v.recent_commits >= HOT_COMMITS else 0,
            -(v.merit if v.merit is not None else 0.0),
            -v.monthly_cap,
            v.ledger_entries + v.portfolio_mentions,
            v.name,
        )

    return sorted(ventures, key=sort_key)


# ---------------------------------------------------------------------------
# Calculators
#
# Measured 2026-10-16 (docs/reports/2026-10-16-calculator-glut.md): 121
# `*-bid-calculator` ventures held 63 of the top 100 queue slots, so the queue
# told session after session to polish clone #37. The fix then was to cap each
# template family and hand its top member a "Consolidate" task. The owner,
# 2026-10-21, went further: drop the work that keeps runs on calculators at
# all. So a calculator that is not a flagship sinks below every other
# dispatchable venture and is offered only maintenance.
# ---------------------------------------------------------------------------

def is_calculator(name: str) -> bool:
    """A calculator by its slug: the last word is `calculator` or `estimator`.
    Crude on purpose, like `family_of`: a reader can check it by eye."""
    return name.rsplit("-", 1)[-1] in ("calculator", "estimator")


MAINTAIN_TASK = (
    "Maintain only (owner, 2026-10-21): this is a calculator. Fix it if it is broken "
    "(a failing test, a wrong result, a dead link); otherwise add no features, pages, "
    "comparison pages or consolidation work -- take a flagship or research task instead. "
    "Already-built work for it (an open PR, a stranded branch) can still be merged."
)


NO_HYPOTHESIS_PREFIX = "Explore: no hypothesis recorded"
NO_HYPOTHESIS_ROWS = 3
AWAITING_PREFIX = "Explore (awaiting visitors"
# Rows whose task is the same advice for every member print only their first few;
# the rest fold into one count line (`--all` or `--json` lists them). On
# 2026-11-18 the 661 Maintain-only and 665 awaiting-visitors rows were 545 KB of
# the table's 578 KB, so a plain `allocate.py` overran the tool output cap and a
# session saw the start-here lines plus a truncated wall of calculators.
FOLDED_ROWS = (
    (NO_HYPOTHESIS_PREFIX, NO_HYPOTHESIS_ROWS,
     "more ventures with no hypothesis recorded (identical task)"),
    (AWAITING_PREFIX, 5,
     "more ventures awaiting visitors (each needs distribution or a usage reading, not features)"),
    ("Maintain only", 3,
     "more calculators on Maintain only (fix if broken, otherwise no new work)"),
)
FLAGSHIP_NEXT_CHARS = 500
# validate.py's FLAGSHIP_NEXT_MAX (test_allocate pins the two together). The
# task line prints the current length against it: nothing a flagship run read
# named the cap, and runs that appended to a full `next:` learned it from CI
# (three run records on 2026-11-13).
FLAGSHIP_NEXT_MAX = 2000
# validate.py's FLAGSHIP_BUILDABLE_MAX, pinned the same way: a run's first
# `buildable:` edit failed on the unstated cap (run record, 2026-11-16).
FLAGSHIP_BUILDABLE_MAX = 600


# A `buildable:` item that waits for a date ("After 2026-11-23: rebuild ...")
# is not buildable before it. On 2026-11-18 'Start here' kept sending runs to
# einvoice-preflight, whose only open buildable item was dated after
# 2026-11-23, and each run read the row and left it (run-record doc_friction on
# this file and on portfolio/flagships.yaml, 4 runs in 2 days). The date is
# read from the prose so the gate lifts by itself when the day comes, which an
# `inputs_only:` edit would not.
_DATE_GATE = re.compile(r"\b(?:after|from|once|on or after|not before|no earlier than)\s+"
                        r"(20\d\d-\d\d-\d\d)\b", re.I)


def future_gates(text: str, today: Optional[str] = None) -> list[str]:
    """Sorted dates after `today` (YYYY-MM-DD, UTC today by default) that the
    text gates an item on ("After 2026-11-23: ..."). Past dates gate nothing."""
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return sorted({d for d in _DATE_GATE.findall(text or "") if d > today})


def gate_note(text: str, today: Optional[str] = None) -> str:
    """' (NOT YET: an item here waits until after DATE; ...)' or ''."""
    dates = future_gates(text, today)
    if not dates:
        return ""
    return (f" (NOT YET: an item here is dated after {', '.join(dates)}, so it is not "
            "buildable today; take another item, or another row if none is left)")


def next_budget(v: "Venture") -> str:
    """'1986 of 2000 characters' for a flagship's `next:`."""
    return f"{len(v.flagship_next or '')} of {FLAGSHIP_NEXT_MAX} characters"


def next_task(v: Venture) -> str:
    if v.needs_decision:
        return "Review: measured at $0 MRR past revenue stage -- check against kill_criteria before further spend."
    if v.maintain_only:
        return MAINTAIN_TASK
    if v.flagship:
        milestone = v.flagship_next or "the venture's own roadmap"
        if len(milestone) > FLAGSHIP_NEXT_CHARS:
            # The full history is in flagships.yaml; the queue prints the head.
            milestone = milestone[:FLAGSHIP_NEXT_CHARS].rstrip() + f" ... (full `next:`: allocate.py --venture {v.name})"
        if v.flagship_inputs_only:
            return (
                f"Inputs only (flagship {v.flagship_rank + 1}): every listed item needs a real "
                f"outside input ({v.flagship_inputs_only}). Take it only if you hold one; "
                "otherwise take a Deepen row above. Full list: portfolio/flagships.yaml."
            )
        if v.flagship_not_before:
            return (
                f"Waiting (flagship {v.flagship_rank + 1}): nothing buildable before "
                f"{v.flagship_not_before.isoformat()} (`not_before:` in portfolio/flagships.yaml); "
                "take a Deepen row above. If you find an item buildable today, add it to "
                "`buildable:` and delete `not_before:` in your PR."
            )
        # A slice taken from `buildable:` is rewritten there, not in `next:`;
        # saying only `next:` cost a run a retry (run records, 2026-11-14 and -16).
        buildable_edit = ""
        if v.flagship_buildable:
            milestone = (f"BUILDABLE HERE: {v.flagship_buildable}{gate_note(v.flagship_buildable)}"
                         f" -- Context: {milestone}")
            buildable_edit = (
                " If you landed a BUILDABLE HERE item, rewrite it in `buildable:` instead "
                f"(same tool with `--field buildable`, capped at {FLAGSHIP_BUILDABLE_MAX} characters; "
                "drop the field when nothing buildable is left)."
            )
        return (
            f"Deepen (flagship {v.flagship_rank + 1}): {milestone} "
            "Land a working slice, then rewrite this venture's `next:` in portfolio/flagships.yaml "
            f"(now {next_budget(v)}, validate.py's cap: replace what you landed, don't append; "
            f"`portfolio/router/flagship_field.py {v.name} --replace OLD NEW` edits it across line breaks; "
            "an edit that would pass the cap parks open items from the end of the row to the "
            "venture's NEXT.md by itself, just enough to fit, and says what it moved; `--dry-run` "
            "previews it, `--park ITEM` chooses which, `--history TEXT` moves a finished result you name "
            "to HISTORY.md, `--no-make-room` refuses instead)."
            + buildable_edit
        )
    if not v.measured:
        claim = v.untested_hypothesis
        if claim and v.blocker:
            return f'BLOCKED (unpublished) -- "{claim}"'
        if claim and v.awaits_visitors:
            return (
                f'Explore (awaiting visitors; needs distribution or a usage reading, not more features): "{claim}"'
            )
        if claim:
            return f'Explore: test the untested hypothesis -- "{claim}"'
        if not v.hypotheses:
            return (
                f"{NO_HYPOTHESIS_PREFIX} -- add a `hypotheses:` list to VENTURE.yaml "
                "(`- claim: ...`, `status: untested`; see 1099-k-threshold-checker), then test it."
            )
        return "Explore: every recorded hypothesis is settled -- write the next one in VENTURE.yaml, then test it."
    if v.mrr is not None and v.monthly_cost is not None and v.mrr < v.monthly_cost:
        return "Review: monthly_cost exceeds mrr -- check against kill_criteria."
    return (
        "Continue: if this venture has no public URL, deploy the built surface "
        "(see portfolio/hosting/README.md); otherwise advance the "
        "next documented roadmap task."
    )


def work_queue(ventures: list[Venture]) -> list[dict]:
    return [
        {
            "venture": v.name,
            "stage": v.stage,
            "protected": v.protected,
            "flagship": v.flagship,
            "task": next_task(v),
            "dispatchable": v.dispatchable,
            "blocked_on": v.blocker,
            "spend_ceiling_usd": v.monthly_cap,
            "merit": v.merit,
            "ledger_entries_this_period": v.ledger_entries,
            "portfolio_mentions_this_period": v.portfolio_mentions,
        }
        for v in rank(ventures)
    ]


def decisions_by_merit(ventures: list[Venture]) -> list[dict]:
    """Group blocked ventures by the owner decision that would unblock them,
    ranked by the merit each decision would release.

    The router already records, per venture, *why* no session can start it
    (`Venture.blocker`) and *how good the business looks* (`merit`). What it
    did not do before was add those up the other way: for each owner-gated
    blocker, how much merit is waiting on it. The account-owner decision queue
    (issue #139) is ordered cheapest-first, which was right while nothing was
    known about what each ask releases; the #323 scoring pass then found the
    highest-merit venture sitting behind the ask ranked last for being the
    most expensive. This answers the question that ordering left open -- what
    does clearing each blocker actually release -- so cost and merit-unblocked
    can be read side by side rather than one without the other.

    Only blocked ventures contribute. `total_merit` sums the composites waiting
    on the decision; `top_venture` is the single highest-merit one it would
    release, because one 6.00 venture unblocked can matter more than three
    4.00s, and the sum alone hides that.
    """
    groups: dict[str, list[Venture]] = {}
    for v in ventures:
        if v.dispatchable or v.blocker is None:
            continue
        groups.setdefault(v.blocker, []).append(v)

    rows = []
    for blocker, blocked in groups.items():
        scored = [v for v in blocked if v.merit is not None]
        top = max(scored, key=lambda v: v.merit) if scored else None
        rows.append(
            {
                "decision": blocker,
                "blocked_ventures": len(blocked),
                "merit_scored": len(scored),
                "total_merit": round(sum(v.merit for v in scored), 3),
                "top_venture": top.name if top else None,
                "top_merit": top.merit if top else None,
                "ventures": sorted(v.name for v in blocked),
            }
        )
    rows.sort(
        key=lambda r: (-r["total_merit"], -(r["top_merit"] or 0.0), r["decision"])
    )
    return rows


# The whole run must fit a 120s foreground tool call (run-record doc_friction, 2026-10-19: the
# 120s fetch alone pushed allocate.py into the background with empty output).
FETCH_TIMEOUT_S = 50


def _shallow_fetch(args, cwd, timeout=None):
    """`git fetch <args>` through platform/ci/shallow_repair.py, which drops the bogus
    `.git/shallow` entry a --shallow-since fetch can leave (every later fetch then failed with
    "error in object: unshallow", 2026-11-14). Falls back to a plain fetch if it cannot load."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "platform" / "ci"))
        import shallow_repair
        return shallow_repair.fetch(args, cwd=cwd, timeout=timeout, run=subprocess.run)
    except ImportError:
        return subprocess.run(["git", "fetch", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)


def _history_reaches(cutoff: datetime, cwd: Path) -> bool:
    """True when origin/main's oldest reachable commit is already near `cutoff`, so a fetch adds
    nothing. --shallow-since leaves the clone shallow, so without this every run refetched
    (3 min on 2026-10-19)."""
    out = subprocess.run(["git", "log", "origin/main", "--format=%ct"], capture_output=True, text=True,
                         timeout=20, cwd=cwd).stdout.split()
    return bool(out) and int(out[-1]) <= cutoff.timestamp() + 2 * 86400


def origin_main_behind_head(cwd: Path) -> bool:
    """True when HEAD holds commits GitHub made (squash merges of PRs) that origin/main lacks.

    A cloud container's checkout is current main, but its `origin/main` ref can be a clone-time
    snapshot days behind it (2026-11-13: #13701 from 2026-11-07 while HEAD was #15437). Its
    history still reaches the 7-day window, so `_history_reaches` skipped the fetch and
    `last_landed` printed '154.1h ago' for a venture merged that morning (run-record
    doc_friction on this file, 2026-11-13T08:13; the same stale ref has bitten claim checks,
    run_workflow_locally and session_gate, see refresh_origin_main there). A session's own
    commits have a local committer, so they never trigger a refetch."""
    try:
        out = subprocess.run(
            ["git", "rev-list", "-1", "--committer=noreply@github.com", "origin/main..HEAD"],
            capture_output=True, text=True, timeout=20, cwd=cwd,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return False
    return bool(out)


def deepen_to_window(days: int) -> bool:
    """Make origin/main current, and in a shallow clone reach back `days` days so commit
    counts mean something."""
    here = Path(__file__).resolve().parent
    try:
        shallow = subprocess.run(
            ["git", "rev-parse", "--is-shallow-repository"],
            capture_output=True, text=True, timeout=30, cwd=here,
        ).stdout.strip() == "true"
        stale = origin_main_behind_head(here)
        if stale:
            print("(origin/main is behind this checkout: fetching it so 'last landed' is current)",
                  file=sys.stderr)
        if not shallow:
            if not stale:
                return False
            return _shallow_fetch(["-q", "origin", "main"], cwd=here,
                                  timeout=FETCH_TIMEOUT_S).returncode == 0
        cutoff = datetime.now(timezone.utc) - timedelta(days=days + 1)
        if not stale and _history_reaches(cutoff, here):
            return False
        since = cutoff.strftime("%Y-%m-%d")
        print(f"(shallow clone: fetching main since {since} for 7-day commit counts)", file=sys.stderr)
        return _shallow_fetch(["-q", f"--shallow-since={since}", "origin", "main"],
                              cwd=here, timeout=FETCH_TIMEOUT_S).returncode == 0
    except subprocess.TimeoutExpired:
        # Runs reported 10+ minutes of silence here (2026-10-19); rank on what is local instead.
        print(f"(fetch exceeded {FETCH_TIMEOUT_S}s; 7-day commit counts are partial. "
              "Run `git fetch --unshallow origin main` in the background for full ones.)", file=sys.stderr)
        return False
    except (OSError, subprocess.SubprocessError):
        return False


def refresh_tip(cwd: Path = REPO_ROOT, run=subprocess.run) -> bool:
    """Fetch main when origin/main is not the remote's tip; True when it fetched.

    Why: the flagship rows were read from the clone, and a clone is minutes to
    hours old. Four sessions on 2026-11-16/17 claimed a `next:`/`buildable:`
    item that had merged 1 to 2 minutes earlier (#16518, #16883, #17063 and a
    service-charge item; doc_friction on this file): the table's open-PR column
    is read live, the row text was not. ls-remote costs under a second, and the
    fetch only the commits since the clone."""
    def git(*args, timeout=20):
        return run(["git", *args], capture_output=True, text=True, timeout=timeout, cwd=cwd)
    try:
        remote = git("ls-remote", "origin", "refs/heads/main").stdout.split()
        local = git("rev-parse", "-q", "--verify", "origin/main").stdout.strip()
        if not remote or remote[0] == local:
            return False
        return _shallow_fetch(["-q", "origin", "main"], cwd=cwd, timeout=FETCH_TIMEOUT_S).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


FLAGSHIPS_REL = "portfolio/flagships.yaml"


def main_flagships(cwd: Path = REPO_ROOT, run=subprocess.run) -> tuple[Optional[str], str]:
    """(origin/main's flagships.yaml text, note) when it is newer than this checkout's copy
    and the session has not edited the file itself; (None, note) when the rows shown are
    local though main's differ (the note says so); (None, "") when they agree.

    A session that edits the file (a claim, a parked item) keeps its own copy: its PR
    resolves the difference when it merges main."""
    def git(*args):
        done = run(["git", *args], capture_output=True, text=True, timeout=20, cwd=cwd)
        return done.stdout if done.returncode == 0 else None
    try:
        theirs = git("show", f"origin/main:{FLAGSHIPS_REL}")
        if theirs is None:
            return None, ""
        work = (Path(cwd) / FLAGSHIPS_REL)
        mine = work.read_text() if work.is_file() else None
        if mine == theirs:
            return None, ""
        stale = ("(portfolio/flagships.yaml differs on origin/main and this checkout {why}, so the rows "
                 "below are this checkout's: `git merge origin/main` before taking an item.)")
        if mine != git("show", f"HEAD:{FLAGSHIPS_REL}"):
            return None, stale.format(why="has uncommitted edits to it")
        base = (git("merge-base", "HEAD", "origin/main") or "").strip()
        if not base or git("show", f"{base}:{FLAGSHIPS_REL}") != mine:
            return None, stale.format(why="changed it too (or the shared base is outside this shallow clone)")
        newer = (git("log", "--format=%s", f"{base}..origin/main", "--", FLAGSHIPS_REL) or "").splitlines()
        latest = f"; newest: {newer[0][:120]}" if newer else ""
        return theirs, (f"(flagship rows read from origin/main: {len(newer)} commit(s) to "
                        f"portfolio/flagships.yaml landed after this checkout{latest})")
    except (OSError, subprocess.SubprocessError, UnicodeDecodeError):
        return None, ""


def use_main_flagships(cwd: Path = REPO_ROOT) -> None:
    """Refresh origin/main and read flagship rows from it when it is newer (main_flagships)."""
    global _FLAGSHIPS_TEXT
    refresh_tip(cwd)
    text, note = main_flagships(cwd)
    _FLAGSHIPS_TEXT = text
    if note:
        print(note, file=sys.stderr)


def recent_commits(days: int = 7, deepen: bool = True) -> dict[str, int]:
    """Commits in the last `days` days touching each ventures/<slug>/.

    Display-only: a venture with many recent commits is usually already deep,
    and its Explore task needs visitors more than code (run-record doc_friction,
    2026-10-18/19). Empty when git history is unavailable.

    A shallow clone (every cloud session) holds a few hours of history, so
    every count came out 1-2 and nothing was ever demoted; deepen it to the
    window first (about a minute, far cheaper than --unshallow)."""
    if deepen:
        deepen_to_window(days)
    try:
        out = subprocess.run(
            ["git", "log", f"--since={days}.days", "--name-only", "--format=%x00%H"],
            capture_output=True, text=True, timeout=30, cwd=Path(__file__).resolve().parent,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    return count_by_venture(out, shallow_boundary())


def count_by_venture(log: str, boundary: set[str] = frozenset()) -> dict[str, int]:
    """Count `git log --name-only --format=%x00%H` commits per ventures/<slug>.

    A shallow cut-off commit inside the window lists every file in the tree,
    so it would add one to every venture; it is skipped."""
    counts: dict[str, int] = {}
    for commit in log.split("\0"):
        head, _, _ = commit.lstrip("\n").partition("\n")
        if head.strip() in boundary:
            continue
        slugs = {
            parts[1] for line in commit.splitlines()
            if len(parts := line.split("/", 2)) > 2 and parts[0] == "ventures"
        }
        for slug in slugs:
            counts[slug] = counts.get(slug, 0) + 1
    return counts


OPEN_PR_TIMEOUT_S = 20
OPEN_PR_TITLE_CHARS = 70


def open_pr_titles(timeout: int = OPEN_PR_TIMEOUT_S, pulls=None) -> Optional[list[tuple[int, str, str]]]:
    """Open same-repo PRs as (number, title, created_at), or None if unreadable.

    Concurrent sessions kept taking the same top row because the table did
    not show that an open PR already worked it (run-record doc_friction on
    this file, 2026-11-10/11: #14628, #14678 and rows 3-5 found only by
    searching by hand).

    Read from the REST pulls list, as claim_check.py and pick_track.py do,
    and only then from the search index: the index can lag a new PR by
    minutes, and the claim that matters here is the one opened minutes ago.
    On 2026-11-15 'Start here' sent sessions to shift-roster-builder and
    league-schedule-generator while #16190 (10 min old) and #16173 (15 min
    old) held them, both titled with the slug; the table listed only an
    older PR for the first, so the reader had not seen the new one. Fork PRs
    are not claims (claim_check.decide drops them too)."""
    batch = (pulls or open_prs)()
    if batch is not None:
        rows = []
        for p in batch:
            head_repo = ((p.get("head") or {}).get("repo") or {}).get("full_name") or ""
            if head_repo.lower() != REPO.lower():
                continue
            rows.append((int(p["number"]), str(p.get("title", "")), str(p.get("created_at", ""))))
        return rows
    return _search_pr_titles(timeout)


def _search_pr_titles(timeout: int = OPEN_PR_TIMEOUT_S) -> Optional[list[tuple[int, str, str]]]:
    """The fallback: one `gh api` search call (unauthenticated works in cloud sessions)."""
    try:
        remote = subprocess.run(
            ["git", "remote", "get-url", "origin"], capture_output=True, text=True,
            timeout=5, cwd=REPO_ROOT,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?$", remote)
    if not m:
        return None
    try:
        proc = subprocess.run(
            ["gh", "api", "-X", "GET", "search/issues", "--paginate",
             "-f", f"q=repo:{m.group(1)} is:pr is:open", "-f", "per_page=100",
             "--jq", '.items[] | [.number, .title, .created_at] | @json'],
            capture_output=True, text=True, timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    rows = []
    for line in proc.stdout.splitlines():
        try:
            num, title, created = json.loads(line)
        except (ValueError, TypeError):
            continue
        rows.append((int(num), str(title), str(created)))
    return rows


LANDED_SUBJECT = re.compile(r"\(#(\d+)\)\s*$|^Merge pull request #(\d+)\b")


def main_subjects(n: int = 1000) -> list[str]:
    """Subjects of the last `n` commits on origin/main (HEAD if that ref is missing); [] on errors."""
    for ref in ("origin/main", "HEAD"):
        try:
            out = subprocess.run(["git", "log", ref, "-n", str(n), "--format=%s"], capture_output=True,
                                 text=True, timeout=20, cwd=REPO_ROOT)
        except (OSError, subprocess.SubprocessError):
            return []
        if out.returncode == 0:
            return out.stdout.splitlines()
    return []


def drop_landed(prs: Optional[list[tuple[int, str, str]]],
                subjects=None) -> Optional[list[tuple[int, str, str]]]:
    """`prs` without the ones whose squash ("... (#N)") or merge commit is already on main.

    The table listed #16521 as "OPEN PR (20h old): extend it or pick a different item"
    while its content sat on main as f693694a1 (run-record doc_friction on this file,
    2026-11-17): a squash-merged PR left open by hand, or one GitHub had not closed
    yet, still scared runs off its row. pick_track.landed_on_main does the same for
    research's LAND FIRST list."""
    if not prs:
        return prs
    landed = set()
    for subject in (main_subjects() if subjects is None else subjects):
        m = LANDED_SUBJECT.search(subject)
        if m:
            landed.add(int(m.group(1) or m.group(2)))
    return [pr for pr in prs if pr[0] not in landed]


def claims_by_venture(names, prs: list[tuple[int, str, str]]) -> dict[str, list[tuple[int, str, str]]]:
    """{venture: open PRs whose title names its slug as a whole word}."""
    out: dict[str, list[tuple[int, str, str]]] = {}
    for name in names:
        pat = re.compile(rf"(?<![\w-]){re.escape(name)}(?![\w-])")
        hits = [pr for pr in prs if pat.search(pr[1])]
        if hits:
            out[name] = hits
    return out


# Four hours, not 24 (process critique, 2026-11-19). The last 100 merged PRs
# (GitHub list, closed, newest updated, 2026-11-19 01:39-08:32 UTC) went from
# open to merged in 1 to 140 minutes, most under an hour; none took 4 h. An
# open PR older than that has no live session behind it, yet at 24 h it held
# its row out of the Start here pool for a day: at 08:40 UTC that day
# ai-bookkeeper (#17310, 19 h) and photo-editing (#17515, 5.6 h) were both
# "claimed", leaving two free rows, so two sessions starting together shared
# a row half the time. Collisions caught by claim_check were 4-7% of ventures
# run records each day 2026-11-14..19. A stale PR's item is still guarded:
# claim_check.py keeps its own 24 h window (FRESH_HOURS there).
CLAIM_FRESH_HOURS = 4


def _age_hours(created: str, now: datetime) -> float:
    try:
        return (now - datetime.fromisoformat(created.replace("Z", "+00:00"))).total_seconds() / 3600
    except ValueError:
        return float("inf")


# Six, not three (process run 2026-11-13): about five ventures runs start an
# hour (118 run records on 2026-11-12) and a session takes some 20 minutes to
# open its PR, so ~1.7 others are unclaimed at any moment. A new session's
# chance of sharing a row is then about 1 - exp(-1.7 / spread): 43% over three
# rows, 24% over six. Three still sent two sessions to einvoice-preflight
# within minutes three times on 2026-11-13 (doc_friction on this file). Six of
# the eleven Deepen flagships keeps the pick in the top half of the list.
START_SPREAD = 6


def session_id() -> Optional[str]:
    """This session's id from the harness environment, or None outside one."""
    for key in ("CLAUDE_CODE_REMOTE_SESSION_ID", "CLAUDE_CODE_SESSION_ID"):
        if os.environ.get(key):
            return os.environ[key]
    return None


def start_here(queue: list[dict], claims: Optional[dict[str, list]],
               now: Optional[datetime] = None, session: Optional[str] = None,
               spread: int = START_SPREAD,
               declined: Optional[set] = None,
               refused: Optional[dict] = None) -> Optional[tuple[int, str]]:
    """(row number, venture) of a Deepen flagship row with no open PR younger
    than CLAIM_FRESH_HOURS, or None. Rows marked `inputs_only` are not Deepen
    rows, so they are skipped too. With claims unread (None) nothing is known
    against any row.

    Without a session id the first such row is named. With one, the row is
    picked among the first `spread` such rows by a hash of the id, so sessions
    started in the same few minutes (before either has opened a PR) usually
    get different rows: two sessions took the same sales-agent item in
    parallel three times on 2026-11-11/12 (doc_friction on this file), which
    the open-PR read cannot see. Rows whose `buildable:` waits on a future
    date come after the rest (gate_note), and rows in `declined`
    (declined_rows: recent sessions left them more often than they worked
    them) come last. Rows in `refused` (refused_rows: a host their buildable
    work needs refuses this session) come after the free rows and before the
    dated ones."""
    now = now or datetime.now(timezone.utc)
    declined = declined or set()
    refused = refused or {}
    free, blocked, dated, later = [], [], [], []
    for i, item in enumerate(queue, 1):
        if not (item["flagship"] and item["task"].startswith("Deepen")):
            continue
        hits = (claims or {}).get(item["venture"], [])
        if any(_age_hours(created, now) < CLAIM_FRESH_HOURS for _, _, created in hits):
            continue
        # A row whose BUILDABLE HERE names an item not due yet (gate_note)
        # comes after every free row that does not (see _DATE_GATE).
        if "BUILDABLE HERE" in item["task"] and "(NOT YET: " in item["task"].split(" -- Context: ")[0]:
            dated.append((i, item["venture"]))
            continue
        if item["venture"] in declined:
            later.append((i, item["venture"]))
            continue
        if item["venture"] in refused:
            blocked.append((i, item["venture"]))
            continue
        free.append((i, item["venture"]))
        if session is None or len(free) >= spread:
            break
    # Fall back tier by tier: a dated or declined row joins the session-hash
    # pool only when no row of a better tier is free. Padding the pool with
    # them (the old `free + dated + later`) sent sessions to declined rows
    # whenever fewer than `spread` rows were free: chant-forge, declined with
    # 19 leaves to 10 works, was still Start here for 18:52 on 2026-11-18
    # (doc_friction on this file), since most rows held fresh claims.
    free = (free or blocked or dated or later)[:1 if session is None else spread]
    if not free:
        return None
    if session is None:
        return free[0]
    return free[int(hashlib.sha256(session.encode()).hexdigest(), 16) % len(free)]


def least_claimed(queue: list[dict], claims: Optional[dict[str, list]],
                  now: Optional[datetime] = None, session: Optional[str] = None,
                  spread: int = START_SPREAD) -> Optional[tuple[int, str, int, float]]:
    """(row, venture, newest PR number, its age in hours) for when every Deepen
    row has a fresh claim, else None.

    Why: start_here names nothing once each Deepen row has a PR younger than
    CLAIM_FRESH_HOURS, and with ~16 sessions an hour that is the usual state
    by mid-day. Three sessions between 11:12 and 11:26 UTC on 2026-11-17 found
    rows 1-8 all holding a 0-5 h old PR and read each PR's file list to find
    an item nobody had taken (doc_friction on this file). A claim is one item,
    not the whole row (claim_recipe names the item), so the row whose newest
    claim is oldest is the least contested. Picked among the `spread` least
    contested rows by session id, as start_here does."""
    if claims is None:
        return None
    now = now or datetime.now(timezone.utc)
    rows = []
    for i, item in enumerate(queue, 1):
        if not (item["flagship"] and item["task"].startswith("Deepen")):
            continue
        hits = claims.get(item["venture"], [])
        ages = [(_age_hours(created, now), num) for num, _, created in hits]
        fresh = [a for a in ages if a[0] < CLAIM_FRESH_HOURS]
        if not fresh:
            return None  # a free row exists: start_here names it
        age, num = min(fresh)
        rows.append((-age, i, item["venture"], num, age))
    if not rows:
        return None
    rows.sort()
    rows = rows[:spread]
    pick = rows[0] if session is None else \
        rows[int(hashlib.sha256(session.encode()).hexdigest(), 16) % len(rows)]
    return pick[1], pick[2], pick[3], pick[4]


RUNS_DIR = REPO_ROOT / "prompts" / "runs"
LEFT_WINDOW_DAYS = 2
# A deviation about a claim race says the row was taken, not that it was empty.
_COLLISION = re.compile(r"claim|YIELD|(?:seconds?|minutes?) earlier|same (?:second|minute)"
                        r"|opened .{0,40}earlier|open PR|already", re.I)


def left_rows(names, runs_dir: Path = RUNS_DIR, now: Optional[datetime] = None,
              days: int = LEFT_WINDOW_DAYS) -> dict[str, list[tuple[str, str, str]]]:
    """{flagship: [(date, row taken instead, why)]} from recent run records.

    Why: 'Start here' keeps sending sessions to rows that earlier sessions
    found nothing buildable on, and each one re-reads the full `next:` to
    learn it. Run records' deviations say so (14 such departures from
    2026-11-15 to 11-17, 4 from shift-roster-builder, 6 from ai-bookkeeper;
    three doc-friction reports on this file on 2026-11-17). The same rows
    were also worked successfully 12 to 21 times in two days, so this is a
    hint printed with the pick, not a demotion.

    A departure is a deviation filed against allocate.py or a ventures
    prompt whose `why` names a flagship first that the record's `projects`
    does not include (the first name is the row it was sent to); claim races (claimed, YIELD, opened earlier) are
    skipped. Loose text matching: good enough for a hint, not for ranking."""
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days - 1)).date().isoformat()  # today and yesterday
    names = list(names)
    out: dict[str, list[tuple[str, str, str]]] = {}
    for path in sorted(runs_dir.glob("*.json")):
        date = path.name[:10]
        if date < cutoff:
            continue
        try:
            rec = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict):
            continue
        projects = json.dumps(rec.get("projects"))
        for dev in rec.get("deviations") or []:
            if not isinstance(dev, dict):
                continue
            if not re.search(r"allocate|ventures/prompt", str(dev.get("file", ""))):
                continue
            why = str(dev.get("why", ""))
            if _COLLISION.search(why):
                continue
            named = sorted((why.find(n), n) for n in names if n in why)
            if not named or named[0][1] in projects:
                continue  # names no flagship, or the session worked the row it names first
            took = next((n for n in names if n in projects), "a non-flagship")
            out.setdefault(named[0][1], []).append((date, took, why))
    return out


def worked_rows(names, runs_dir: Path = RUNS_DIR, now: Optional[datetime] = None,
                days: int = LEFT_WINDOW_DAYS) -> dict[str, int]:
    """{flagship: run records in the same window whose `projects` names it}.

    Why: a leave count alone read as "this row is empty". On 2026-11-17
    chant-forge showed 11 departures in three days while 39 records in the
    same days worked it, and a run that took its buildable item reported the
    note "overstates how little is buildable here" (doc_friction on this
    file). The worked count puts the leaves in proportion."""
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days - 1)).date().isoformat()
    names = list(names)
    out: dict[str, int] = {}
    for path in sorted(runs_dir.glob("*.json")):
        if path.name[:10] < cutoff:
            continue
        try:
            rec = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict):
            continue
        projects = json.dumps(rec.get("projects"))
        for n in names:
            if n in projects:
                out[n] = out.get(n, 0) + 1
    return out


DECLINE_MIN_LEAVES = 3


def declined_rows(left: dict[str, list], worked: dict[str, int],
                  min_leaves: int = DECLINE_MIN_LEAVES) -> set:
    """Flagships that recent sessions left more often than they worked, with at
    least `min_leaves` departures (left_rows, worked_rows).

    Why: the 'Left recently' line was only a hint, and 'Start here' sent 16
    sessions to chant-forge on 2026-11-17/18 while 9 records worked it; each
    read the row, agreed with the last leaver and took another (run-record
    doc_friction and deviations on this file, 7 reports in 3 days asking the
    pick to skip such a row). A row most sessions work (einvoice-preflight 6
    left, 18 worked) keeps its place. The demotion lifts by itself when the
    leaves age out of the window or when a `buildable:` refresh gets the row
    worked again."""
    return {n for n, hits in left.items()
            if len(hits) >= min_leaves and len(hits) > worked.get(n, 0)}


def left_note(name: str, left: dict[str, list[tuple[str, str, str]]],
              days: int = LEFT_WINDOW_DAYS, worked: Optional[int] = None,
              has_buildable: bool = False) -> Optional[str]:
    """One line saying how many recent sessions left this row and for what.

    With `worked` (worked_rows) it also says how many worked the row, and the
    advice follows the balance: mostly worked means check the reason, not
    leave on the count; mostly left means mark the row. A row that already
    has `buildable:` is told to refresh that list, not to add one (a
    2026-11-17 report: the advice to add buildable: misfired on such a row)."""
    hits = left.get(name) or []
    if not hits:
        return None
    took: dict[str, int] = {}
    for _, t, _ in hits:
        took[t] = took.get(t, 0) + 1
    where = ", ".join(f"{t} ({n})" for t, n in sorted(took.items(), key=lambda kv: -kv[1]))
    latest = sorted(hits)[-1][2]
    if len(latest) > 220:
        latest = latest[:217].rstrip() + "..."
    counted = ""
    if worked is not None:
        counted = f" In the same days {worked} record(s) worked {name}."
    mark = ("refresh its `buildable:` list (it may name only items that are done or not worth doing) "
            "or add `inputs_only:`" if has_buildable else "add `buildable:` or `inputs_only:` to the row")
    if worked is not None and worked > len(hits):
        advice = ("Most sessions sent here found work, so check that reason against the row "
                  f"before leaving; if it holds, {mark} so the next pick knows.")
    else:
        advice = (f"Check that reason still holds before reading the whole row; if it does, {mark} "
                  "so the next pick knows.")
    return (f"Left recently: {len(hits)} session(s) sent to {name} in the last {days} days (record dates) "
            f"took another row instead (prompts/runs deviations): {where}.{counted} Latest why: "
            f"\"{latest}\" {advice}")


def claim_note(hits: list[tuple[int, str, str]], now: Optional[datetime] = None) -> str:
    """A prefix for the task column naming the open PRs on this venture.

    A PR opened in the last CLAIM_FRESH_HOURS is a live claim by a concurrent
    session ("OPEN PR #N (2h old): title -- ..."); older ones are usually
    stalled and are listed by number only, so they do not scare a run off."""
    now = now or datetime.now(timezone.utc)
    fresh, stale = [], []
    for num, title, created in sorted(hits, key=lambda h: h[2], reverse=True):
        age_h = _age_hours(created, now)
        (fresh if age_h < CLAIM_FRESH_HOURS else stale).append((num, title, age_h))
    note = ""
    if fresh:
        parts = []
        for num, title, age_h in fresh[:2]:
            short = title if len(title) <= OPEN_PR_TITLE_CHARS else title[:OPEN_PR_TITLE_CHARS].rstrip() + "..."
            parts.append(f"#{num} ({age_h:.0f}h old): {short}")
        more = f" (+{len(fresh) - 2} more)" if len(fresh) > 2 else ""
        note = "OPEN PR " + "; ".join(parts) + more + " -- extend it or pick a different item. "
    if stale:
        note += "[older open PRs: " + ", ".join(f"#{n}" for n, _, _ in stale[:3]) + ("..." if len(stale) > 3 else "") + "] "
    return note


def shallow_boundary(cwd: Path = REPO_ROOT) -> set[str]:
    """Hashes of the commits where a shallow clone's history is cut off.

    git treats each one as a root commit, so it "touches" every file in the
    tree: `git log -1 -- ventures/<slug>` names it for any venture untouched
    since, and `--name-only` lists every venture under it."""
    try:
        path = subprocess.run(["git", "rev-parse", "--git-path", "shallow"], capture_output=True,
                              text=True, timeout=10, cwd=cwd).stdout.strip()
        if not path:
            return set()
        return set((Path(cwd) / path).read_text().split())
    except (OSError, subprocess.SubprocessError):
        return set()


def last_landed(name: str, boundary: Optional[set[str]] = None) -> Optional[str]:
    """ISO commit date of the newest commit on main touching ventures/<name>, or None.

    When that commit is the shallow clone's cut-off, the venture last changed
    on or before that date, not on it. Reporting it as a date gave 133 of
    1,353 ventures one shared false "last landed" (2026-11-13; run-record
    doc_friction on this file, "chant-forge ... last landed on main 154.1h
    ago" while its `next:` described work landed that day)."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%H %cI", "origin/main", "--", f"ventures/{name}"],
            capture_output=True, text=True, timeout=15, cwd=REPO_ROOT,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    if not out:
        return None
    sha, _, date = out.partition(" ")
    if sha in (shallow_boundary() if boundary is None else boundary):
        return (f"on or before {date} (where this shallow clone's history starts; "
                "`git fetch --deepen=500 origin main` for the real date)")
    return date


def venture_report(name: str, ventures: list[Venture],
                   claims: Optional[dict[str, list]] = None,
                   landed: Optional[str] = None,
                   now: Optional[datetime] = None,
                   probe=None, left: Optional[dict] = None,
                   worked: Optional[dict[str, int]] = None) -> Optional[str]:
    """One venture's row in full: rank, task with the untruncated flagship
    `next:`, open PRs with their ages and when work last landed.

    The table cuts each flagship's `next:` at FLAGSHIP_NEXT_CHARS, so runs
    grepped flagships.yaml for the rest, and `grep 'slug: <name>'` misses
    because the key is `venture:` (run-record doc_friction on this file,
    2026-11-11). `probe(url) -> bool`, when given, is asked about each host
    the row needs (`row_hosts`). None when `name` is not a venture."""
    now = now or datetime.now(timezone.utc)
    ranked = rank(ventures)
    pos = next((i for i, v in enumerate(ranked) if v.name == name), None)
    if pos is None:
        return None
    v = ranked[pos]
    lines = [f"{v.name}: queue row {pos + 1} of {len(ranked)}, stage {v.stage}, "
             f"{v.recent_commits} commits in 7 days"]
    if v.flagship:
        lines.append(f"Flagship {v.flagship_rank + 1} (portfolio/flagships.yaml)"
                     + (f", inputs only: {v.flagship_inputs_only}" if v.flagship_inputs_only else "")
                     + (f", nothing buildable before {v.flagship_not_before.isoformat()} (`not_before:`)"
                        if v.flagship_not_before else ""))
        if v.flagship_buildable:
            lines.append("buildable here: " + v.flagship_buildable)
        if probe is not None:
            line = hosts_line(row_hosts(v), probe)
            if line:
                lines.append(line)
        lines.append(f"next: ({next_budget(v)}; portfolio/router/validate.py fails a longer one, "
                     "so replace the item you land rather than appending)")
        lines.append(v.flagship_next or "(none written)")
    else:
        lines.append("task: " + next_task(v))
    if v.flagship and left is not None:
        note = left_note(v.name, left, worked=None if worked is None else worked.get(v.name, 0),
                         has_buildable=bool(v.flagship_buildable))
        if note:
            lines.append(note)
    if landed:
        try:
            age_h = (now - datetime.fromisoformat(landed)).total_seconds() / 3600
            lines.append(f"last landed on main: {landed} ({age_h:.1f}h ago)")
        except ValueError:
            lines.append(f"last landed on main: {landed}")
    else:
        lines.append("last landed on main: not in the fetched history")
    if claims is None:
        lines.append("open PRs: not read (search PR titles yourself)")
    else:
        hits = sorted(claims.get(v.name, []), key=lambda h: h[2], reverse=True)
        lines.append(f"open PRs naming it: {len(hits)}")
        for num, title, created in hits:
            lines.append(f"  #{num} opened {created}: {title}")
    return "\n".join(lines)

def requests_line(queue: list[dict], path: Path = REQUESTS_PATH) -> str:
    """One line tying portfolio/requests/requests.json to this table.

    prompt.md puts website requests before flagships, but this table only
    names flagships, so runs reconciled the two by hand (doc_friction,
    2026-11-14, twice). Most open requests are owner-sourced and already are
    flagship rows; say which, and name the ones that are not.
    """
    try:
        reqs = json.loads(path.read_text()).get("requests", [])
    except (OSError, ValueError):
        return ""
    live = [r for r in reqs if r.get("status") in REQUEST_OPEN]
    if not live:
        return ""
    rows = {item["venture"]: i for i, item in enumerate(queue, 1) if item["flagship"]}
    outside = [r for r in live if r.get("source") != "owner"]
    on_rows, off_rows = [], []
    for r in live:
        project = str(r.get("project") or "")
        slug = project.removeprefix("ventures/").strip("/")
        if project.startswith("ventures/") and slug in rows:
            on_rows.append(f"{r.get('id')} = row {rows[slug]} {slug}")
        else:
            off_rows.append(f"{r.get('id')} {project or r.get('title', '?')}")
    parts = [f"Website requests ({len(live)} open in portfolio/requests/requests.json; "
             "prompt.md ranks them before flagships):"]
    if outside:
        parts.append(f"{len(outside)} from outside ({', '.join(str(r.get('id')) for r in outside)}): "
                     "take the oldest before a flagship row (`python3 prompts/ideas.py`).")
    else:
        parts.append("none from outside, so the flagship pick below stands.")
    if on_rows:
        parts.append("Owner requests built through flagship rows: " + "; ".join(on_rows) + ".")
    if off_rows:
        parts.append("Not a flagship row (take one only by choice): " + "; ".join(off_rows) + ".")
    return " ".join(parts)


def folded_kind(task: str) -> Optional[int]:
    """Index into FOLDED_ROWS for a task whose advice is shared by its whole
    class, or None. Claim notes ("OPEN PR ...", "[older open PRs ...]") come
    before the task in the printed row, not in `task`, so they do not hide it."""
    for k, (prefix, _, _) in enumerate(FOLDED_ROWS):
        if task.startswith(prefix):
            return k
    return None


def print_table(ventures: list[Venture], queue: list[dict],
                recent: Optional[dict[str, int]] = None,
                claims: Optional[dict[str, list]] = None,
                show_all: bool = False,
                refused: Optional[dict[str, list[str]]] = None,
                brief: bool = False) -> None:
    later_cap = sum(v.monthly_cap for v in ventures if v.later_stage)
    early_cap = sum(v.monthly_cap for v in ventures if not v.later_stage)
    total_cap = later_cap + early_cap
    print(
        f"Total monthly caps: ${total_cap:.0f} "
        f"(later-stage ${later_cap:.0f}, early-stage ${early_cap:.0f})"
    )
    print(
        f"Target split per README.md: {EXPLORE_SPLIT_LATER:.0%} later-stage / "
        f"{EXPLORE_SPLIT_EARLY:.0%} early-stage"
    )
    ready = sum(1 for item in queue if item["dispatchable"])
    blocked = len(queue) - ready
    summary = f"Dispatchable now: {ready} of {len(queue)} ventures."
    if blocked:
        summary += (
            f" The other {blocked} need a customer response and are unpublished,"
            f" so no session can start them."
        )
    print(summary)
    scored = [item for item in queue if item["merit"] is not None]
    if scored:
        best = max(scored, key=lambda item: item["merit"])
        if not best["dispatchable"]:
            print(
                f"Highest merit ({best['merit']:.2f}, portfolio/scoring/) is "
                f"{best['venture']}, which is blocked. Merit and dispatchability "
                f"do not agree -- see portfolio/scoring/README.md."
            )
    flagships = [item["venture"] for item in queue if item["flagship"]]
    if flagships:
        print(
            f"Flagships ({len(flagships)}, portfolio/flagships.yaml): deepen these before "
            "adding another small tool -- owner, 2026-10-20."
        )
    req = requests_line(queue)
    if req:
        print(req)
    sid = session_id()
    flag_names = [i["venture"] for i in queue if i["flagship"]]
    left, worked = left_rows(flag_names), worked_rows(flag_names)
    declined = declined_rows(left, worked)
    refused = refused or {}
    first = start_here(queue, claims, session=sid, declined=declined, refused=refused)
    if first:
        how = (f"picked by this session's id among the first {START_SPREAD} Deepen flagships"
               if sid else "the first Deepen flagship")
        print(
            f"Start here: row {first[0]}, {first[1]} ({how} with no PR "
            f"opened in the last {CLAIM_FRESH_HOURS} h; `allocate.py --venture {first[1]}` "
            "prints its full `next:` and probes the hosts it needs; a BUILDABLE HERE note says what a session can do with "
            "no outside input; if every item needs a key, account, person or blocked host, add "
            "`inputs_only:` to its portfolio/flagships.yaml row in your PR and take the next "
            "row, so later runs are not sent there). Open your draft PR with the slug in its title "
            "before you read further: that title is the claim the next session's table reads. Then run "
            f"`python3 portfolio/router/claim_check.py {first[1]}`: two sessions that opened "
            "in the same minute both see this row free, and the PR opened first keeps it."
        )
        skipped = sorted(declined - {first[1]})
        if skipped:
            print("Moved behind the other free rows: " + ", ".join(
                f"{n} (left by {len(left[n])}, worked by {worked.get(n, 0)} in the last "
                f"{LEFT_WINDOW_DAYS} days)" for n in skipped)
                + ". Refresh such a row's `buildable:` if you find it has real work.")
        cut = sorted(set(refused) - {first[1]} - declined)
        if cut:
            print("Moved behind the reachable rows (a host its buildable work needs refused this "
                  "session just now; it may answer from another): " + "; ".join(
                      f"{n} ({', '.join(refused[n])} REFUSED)" for n in cut) + ".")
        if first[1] in refused:
            print(f"{first[1]} is named although {', '.join(refused[first[1]])} refused this "
                  "session: no free row's hosts all answer. Check which items need that host.")
        note = left_note(first[1], left, worked=worked.get(first[1], 0),
                         has_buildable=first[1] in load_flagship_field("buildable"))
        if note:
            print(note)
        print(claim_recipe(first[1]))
    else:
        busy = least_claimed(queue, claims, session=sid)
        if busy:
            row, name, num, age = busy
            print(
                f"Start here: row {row}, {name}. Every Deepen flagship has a PR opened in the last "
                f"{CLAIM_FRESH_HOURS} h, so this is "
                + ("one of the least contested (picked by this session's id): " if sid else "the least contested: ")
                + f"its newest is #{num}, {age:.0f} h old. A claim covers one item, not the row: "
                f"take a `buildable:`/`next:` item that no open {name} PR title names "
                f"(`allocate.py --venture {name}`), and check it with "
                f"`python3 portfolio/router/claim_check.py {name} --item \"<item>\"`."
            )
            print(claim_recipe(name))
    if brief:
        # Why: runs read only the summary and Start here lines; the table is
        # ~20 KB of long rows they scroll past (doc_friction 2026-11-18..20).
        print("(table left out by --brief; drop it to see every row)")
        return
    print()
    print(
        f"{'#':<3}{'venture':<32}{'stage':<12}{'cap':>6}{'merit':>7}"
        f"{'ledger':>8}{'mentions':>10}{'7d-commits':>12}  task"
    )
    if recent is None:
        recent = recent_commits()
    shown = [0] * len(FOLDED_ROWS)
    hidden = [0] * len(FOLDED_ROWS)
    for i, item in enumerate(queue, 1):
        kind = folded_kind(item["task"]) if not show_all else None
        if kind is not None:
            shown[kind] += 1
            if shown[kind] > FOLDED_ROWS[kind][1]:
                hidden[kind] += 1
                continue
        merit = f"{item['merit']:.2f}" if item["merit"] is not None else "-"
        print(
            f"{i:<3}{item['venture']:<32}{item['stage']:<12}"
            f"{item['spend_ceiling_usd']:>6.0f}{merit:>7}"
            f"{item['ledger_entries_this_period']:>8}"
            f"{item['portfolio_mentions_this_period']:>10}"
            f"{recent.get(item['venture'], 0):>12}  "
            f"{claim_note(claims[item['venture']]) if claims and item['venture'] in claims else ''}"
            f"{item['task']}"
        )
    for (_, _, label), n in zip(FOLDED_ROWS, hidden):
        if n:
            print(f"... and {n} {label}; `--all` or `--json` lists them.")

    decisions = decisions_by_merit(ventures)
    if decisions:
        print()
        print(
            "Owner decisions ranked by merit unblocked "
            "(pair with cost in issue #139 / channel-inventory.md):"
        )
        print(f"{'merit':>7}{'top':>7}  {'ventures':<10}decision")
        for d in decisions:
            top = f"{d['top_merit']:.2f}" if d["top_merit"] is not None else "-"
            print(
                f"{d['total_merit']:>7.2f}{top:>7}  {d['blocked_ventures']:<10}"
                f"{d['decision']}"
            )
        print(
            "Merit-unblocked orders these; cost does not. The cheapest ask and "
            "the highest-merit one are not the same -- read this beside #139's "
            "cost ordering, not instead of it."
        )
    latest = REPO_ROOT / "portfolio" / "direction" / "LATEST.md"
    if latest.exists():
        print(
            "\nWhere effort actually went, and suggestions towards higher-value work: "
            "portfolio/direction/LATEST.md (daily and weekly reports in portfolio/direction/)."
        )


def post_limits_line() -> str:
    """The blog post front-matter caps, printed under the brief: most venture PRs
    carry a post, and runs met the 160-character description cap only when CI or
    the pre-push hook refused a first draft (friction_rank.py --live, 16 sessions
    on 2026-11-12..15)."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "platform" / "ci"))
    try:
        from check_post_frontmatter import limits_line
    except ImportError:  # a sparse checkout without platform/ci
        return "post front matter: python3 platform/ci/check_post_frontmatter.py --limits"
    return "post " + limits_line()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit the work queue as JSON instead of a table")
    parser.add_argument(
        "--decisions",
        action="store_true",
        help="emit the owner-decision / merit-unblocked rollup as JSON",
    )
    parser.add_argument("--no-deepen", action="store_true",
                        help="skip the shallow-clone fetch; 7-day commit counts may be partial")
    parser.add_argument("--no-claims", action="store_true",
                        help="skip the open-PR lookup (one `gh api` search) that marks rows already being worked")
    parser.add_argument("--no-probe", action="store_true",
                        help="skip probing hosts: the flagship row's (with --venture), or those every "
                             "Deepen row's buildable work needs (the table; a refused one moves its "
                             "row behind the reachable ones for Start here)")
    parser.add_argument("--all", action="store_true",
                        help="print every table row (by default Maintain-only, awaiting-visitors "
                             "and no-hypothesis rows fold into a count after their first few)")
    parser.add_argument("--brief", action="store_true",
                        help="print the summary and Start here lines only, not the ranked table")
    parser.add_argument("--venture", metavar="SLUG",
                        help="print one venture's row in full (untruncated flagship `next:`, open PRs, last landing)")
    args = parser.parse_args(argv)

    if not args.no_deepen:
        use_main_flagships()
    ventures = load_ventures()
    if not ventures:
        print("No ventures with a VENTURE.yaml found.", file=sys.stderr)
        return 1

    if args.decisions:
        print(json.dumps(decisions_by_merit(ventures), indent=2))
        return 0

    recent = recent_commits(deepen=not args.no_deepen)
    for v in ventures:
        v.recent_commits = recent.get(v.name, 0)
    if args.venture:
        claims_one = None
        if not args.no_claims:
            prs = drop_landed(open_pr_titles())
            if prs is not None:
                claims_one = claims_by_venture([args.venture], prs)
        report = venture_report(args.venture, ventures, claims=claims_one,
                                landed=last_landed(args.venture),
                                probe=None if args.no_probe else host_answers,
                                left=left_rows(load_flagships()),
                                worked=worked_rows(load_flagships()))
        if report is None:
            print(f"No venture named {args.venture!r} (ventures/<slug>/VENTURE.yaml).", file=sys.stderr)
            return 1
        print(report)
        print(post_limits_line())
        return 0

    queue = work_queue(ventures)

    claims: Optional[dict[str, list]] = None
    if not args.no_claims:
        prs = drop_landed(open_pr_titles())
        if prs is not None:
            claims = claims_by_venture([item["venture"] for item in queue], prs)
            for item in queue:
                item["open_prs"] = [h[0] for h in claims.get(item["venture"], [])]

    if args.json:
        print(json.dumps(queue, indent=2))
    else:
        if claims is None and not args.no_claims:
            print("(open PRs not read: `gh api` search failed; search PR titles before taking a row)")
        print_table(ventures, queue, recent=recent, claims=claims, show_all=args.all,
                    refused=None if args.no_probe else refused_rows(ventures), brief=args.brief)
        print(post_limits_line())
    return 0


def _reexec_with_libyaml() -> None:
    """Re-run this script under an interpreter whose PyYAML has libyaml (35s -> ~2s).

    Only when run as a script and the current PyYAML lacks libyaml; one hop
    (ALLOCATE_REEXEC) so a bad candidate cannot loop. Silent if none is found.
    """
    if getattr(yaml, "CSafeLoader", None) or os.environ.get("ALLOCATE_REEXEC"):
        return
    probe = "import yaml,sys; sys.exit(0 if getattr(yaml,'CSafeLoader',None) else 1)"
    for cand in ("/usr/bin/python3.13", "/usr/bin/python3.12", "/usr/bin/python3"):
        if cand != sys.executable and os.path.exists(cand) and \
                subprocess.run([cand, "-I", "-c", probe], capture_output=True).returncode == 0:
            os.environ["ALLOCATE_REEXEC"] = "1"
            os.execv(cand, [cand, *sys.argv])


if __name__ == "__main__":
    _reexec_with_libyaml()
    sys.exit(main())
