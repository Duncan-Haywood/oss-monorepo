#!/usr/bin/env python3
"""Has any product here ever been *measured*, and does the prose say so honestly?

## Why this exists

`portfolio/usage/usage.yaml` is the file this portfolio steers by. Its README
is blunt about the stakes: "Revenue is zero by design right now -- everything
ships free and full-feature -- so **usage is the only honest signal about which
product deserves more of the fleet's time.**"

Eleven places in the tree read that file and report it as **zero observed
users**. Measured 2026-09-11, that is not what it contains:

    live_url_visitors      399 readings      null: 399    zero: 0    positive: 0

Not one reading of zero. Four hundred readings of *nothing*. The visitor signal
has never been taken, on any product, on any day.

That is the same defect this repository has recorded against
`portfolio/ledger/infra_state.yaml` ("a reading older than its staleness window
is *unknown*, never 'up' -- an absent measurement must not read as a healthy
one"), against the 2026-09-05 Pages reading that reasoned from an *absence*,
and against `guard_state.py` ("a skip is a green that means nothing ran").
Here it runs in the opposite direction and is worse, because the absence reads
as a *negative result* rather than a positive one: "we measured and nobody
came" is evidence, and it is evidence this portfolio does not have.

The two readings license opposite decisions, which is the whole reason this
file exists:

  - *measured zero* says the product, the niche, or the copy is wrong. It
    licenses retiring a tool, declaring an archetype saturated, and treating
    distribution as a solved question that returned a bad answer.
  - *never measured* says nothing about the product at all. It licenses
    exactly one thing: go and get a reading.

The first conclusion has already been drawn from the second's data. It is the
kind of error that is invisible in a diff, because every individual sentence
asserting it is a faithful restatement of the sentence before it.

## Why the signal is null, which is not a defect in the file

Nobody was careless. `usage.yaml`'s own README names the reason and it is
structural:

  - **GitHub Pages exposes no server-side visitor analytics.** Since
    2026-10-20 the route to a reading is `platform/edge/`, a free Cloudflare
    Worker the owner deploys once (README, "Feedback and visit counts from
    the live site"); until then nothing can count a visit to the site.
  - The counters that do exist are **local-first, opt-in, and off by default**,
    so they only ever report from a machine we do not own. A zero from one is
    "the counter was never switched on", not "the feature went unused".
  - Sitemap enumeration cannot happen from this origin at all -- see
    `pages_state.py`'s `indexing` row -- so there is no reason to expect
    traffic yet even if it could be counted.

So `null` is the honest entry and the file is right to carry it. What is wrong
is every sentence downstream that renders it as a measurement.

## What "positive" means here, and why it is not users

Thirty signal readings in the file are greater than zero, across six products.
None of them is an external user, and a tool that reported "6 products show
usage" would be repeating this whole mistake one level up:

  - `portfolio-pages` carries thirteen of them, and they are **build
    statistics** -- `tools_published: 40`, `pages_carrying_saved_bids: 234`.
    A page carrying a panel is a fact about the build, not about a visitor.
  - The other five are each a single `1` dated the day that counter was added
    (`local_preflights: 1`, `local_scans: 1`, ...). That is the author running
    their own tool once. A self-test is not adoption.

`DIRECTION.md` tells every session that "**Any product with a nonzero signal --
a real visitor, a return visit, a completed export -- now outranks every other
candidate for this session's time.**" That rule has never fired and, on this
data, cannot: the only nonzero signals are build counts and self-tests. A gate
that never opens is a gate nobody uses -- `supersede_check.py`'s header records
the same lesson from the other direction.

## What this reports

A reading, never a claim.

    visitors    never-measured   no `live_url_visitors` reading exists anywhere
                measured         at least one real number was recorded

    events      self-test-only   every positive signal is a build statistic or
                                 a lone 1 on the day it was added
                external         something looks like a real third party

    claims      honest           no steering document asserts a measurement
                                 the data does not support
                overclaimed      one or more do -- each is named

## The check

    python3 platform/ci/usage_state.py                   # report, exits 0
    python3 platform/ci/usage_state.py --require-honest  # exits 1 on overclaim

`--require-honest` fails only while BOTH halves hold: the visitor signal has
never been measured, *and* a steering document says the file records zero
users. Record one real reading and the claim becomes true and the check goes
quiet on its own. Fix the sentence and it goes quiet immediately. It is a gate
that opens, in both directions, which is the property this repository keeps
finding it needs and keeps having to add after the fact.

It deliberately does **not** scan the dated ledger files under
`portfolio/ledger/`. Those are append-only history: a ledger entry that said
"zero users" on 2026-09-02 is a record of what a session believed that day, and
rewriting it would destroy the evidence of how this spread. Steering documents
are different -- they are read as current, every run, by every agent.

**`portfolio/ledger/asks.yaml` is the exception, and it was missed for two days
(added 2026-09-13).** The rule above was written as "skip `portfolio/ledger/`",
which is a statement about a *directory*, and the property that actually
matters is whether a file is read as current. `asks.yaml` lives in that
directory and is not history at all: it is the live source `decision_queue.py`
renders, so every sentence in it is shown to the account owner as present-tense
fact on every run. Measured that day, its `pages-custom-domain` ask read
"`portfolio/usage/usage.yaml` records zero visitors across all 200 products",
and this check reported `claims honest` with the overclaim sitting on the most
decision-bearing surface in the repository -- the one page whose whole purpose
is telling the owner which of these products is worth their next hour.

That is the worst place for this particular error, because of which way it
cuts. "Never measured" licenses exactly one thing: go get a reading. "Records
zero" is evidence *against* the products, and it licenses retiring them. A
guard that is correct about everything it happens to look at is the shape of
hole this repository keeps paying for, so the glob below names the file rather
than the directory.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
USAGE_YAML = REPO_ROOT / "portfolio" / "usage" / "usage.yaml"

# The signal that answers "did a stranger reach this product at all".
VISITOR_SIGNAL = "live_url_visitors"

# Products whose positive signals are statistics about the build itself rather
# than about anyone using a product. `portfolio-pages` IS the build.
BUILD_STATISTIC_SLUGS = frozenset({"portfolio-pages"})

# Documents read as current instruction by every session. The *dated* ledger
# files are excluded on purpose -- see the module docstring. `asks.yaml` is in
# that directory but is not history: `decision_queue.py` renders it to the
# owner as current fact, so it belongs here.
STEERING_GLOBS = (
    "CLAUDE.md",
    "portfolio/ledger/asks.yaml",
    "AGENTS.md",
    "PRODUCT_PLAYBOOK.md",
    "portfolio/DIRECTION.md",
    "portfolio/usage/README.md",
    "portfolio/research/README.md",
    "portfolio/pipeline/distribution-first.md",
    "platform/marketing/README.md",
    "platform/ci/pages_state.py",
)

# "records zero observed users", "still records zero visitors across ...".
# Anchored on a verb of *recording* so that an honest sentence -- "no visitor
# reading has ever been taken" -- does not trip it, and neither does a
# quotation that is explicitly labelled as the mistake.
#
# `[^.]` rather than `[^.\n]`, and matched against the whole file rather than
# line by line, because the claim wraps: CLAUDE.md:1111 ends a line on "still
# recorded" and opens the next with "zero observed users across all 184
# products". A line-scanner reports that file clean, which is the precise shape
# of hole this repository keeps paying for -- a guard that is correct about
# everything it happens to look at.
CLAIM_RE = re.compile(
    r"(record(?:s|ed|ing)?|report(?:s|ed|ing)?|show(?:s|ed|ing)?|contain(?:s|ed)?)"
    r"[^.]{0,80}?zero\s+(?:observed\s+)?(?:users|visitors)",
    re.IGNORECASE,
)

# A passage that quotes the error in order to correct it is not the error.
#
# "used to" unqualified is deliberate: it is how every correction in this
# repository is written ("this paragraph used to say", "that sentence used to
# end", "this clause used to open"), and enumerating the verbs means the guard
# fires on the next session's phrasing instead of on the defect. The cost of
# the broad form is that a sentence could smuggle a live claim past it by
# mentioning "used to" nearby; the cost of the narrow form is a guard that
# cries wolf at its own documentation until someone deletes it.
EXEMPT_RE = re.compile(
    r"(used to\b|do not restate|do not read this as|this paragraph replaces|"
    r"superseded|is not what it contains|never measured|records no such|"
    r"not measured-as-zero|the sentence this corrects|# noqa: usage-claim)",
    re.IGNORECASE,
)


def load_products(path: Path = USAGE_YAML) -> list[dict]:
    data = yaml.safe_load(path.read_text()) or {}
    return list(data.get("products") or [])


def visitor_readings(products: list[dict]) -> tuple[int, list[float]]:
    """Return (total readings of the visitor signal, the non-null ones)."""
    total = 0
    real: list[float] = []
    for product in products:
        for reading in product.get("readings") or []:
            signals = reading.get("signals") or {}
            if VISITOR_SIGNAL not in signals:
                continue
            total += 1
            value = signals[VISITOR_SIGNAL]
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                real.append(value)
    return total, real


def positive_signals(products: list[dict]) -> list[tuple[str, str, float, str]]:
    """Every signal reading greater than zero, as (slug, signal, value, date)."""
    out: list[tuple[str, str, float, str]] = []
    for product in products:
        slug = product.get("slug", "?")
        for reading in product.get("readings") or []:
            for name, value in (reading.get("signals") or {}).items():
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    continue
                if value > 0:
                    out.append((slug, name, value, str(reading.get("as_of", "?"))))
    return out


def classify_positives(
    positives: list[tuple[str, str, float, str]],
) -> tuple[list, list]:
    """Split positive readings into (not-external, possibly-external).

    Two things are not adoption: a statistic about the build, and a lone `1`
    recorded on the day the counter was added, which is the author running
    their own tool once.
    """
    not_external, possibly = [], []
    for row in positives:
        slug, _name, value, _date = row
        if slug in BUILD_STATISTIC_SLUGS or value == 1:
            not_external.append(row)
        else:
            possibly.append(row)
    return not_external, possibly


def find_claims(root: Path = REPO_ROOT) -> list[tuple[str, int, str]]:
    """Steering documents asserting that usage.yaml *records* zero users.

    Matched against the whole file, not line by line, so a claim that wraps
    across a line break is still caught. The exemption is evaluated over the
    matched span plus one full line on either side, because a correction's
    "used to say" marker routinely sits on the line before the quotation it
    introduces or the line after it.
    """
    hits: list[tuple[str, int, str]] = []
    for rel in STEERING_GLOBS:
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text()
        for match in CLAIM_RE.finditer(text):
            line_no = text.count("\n", 0, match.start()) + 1
            # Start of the line before the match, end of the line after it.
            this_line_start = text.rfind("\n", 0, match.start()) + 1
            context_start = text.rfind("\n", 0, max(this_line_start - 1, 0)) + 1
            this_line_end = text.find("\n", match.end())
            if this_line_end == -1:
                context_end = len(text)
            else:
                next_end = text.find("\n", this_line_end + 1)
                context_end = len(text) if next_end == -1 else next_end
            context = text[context_start:context_end]
            if EXEMPT_RE.search(context):
                continue
            phrase = " ".join(match.group(0).split())
            hits.append((rel, line_no, phrase))
    return hits


def build_report(root: Path = REPO_ROOT) -> dict:
    products = load_products(root / "portfolio" / "usage" / "usage.yaml")
    total, real = visitor_readings(products)
    positives = positive_signals(products)
    not_external, possibly = classify_positives(positives)
    claims = find_claims(root)

    visitors = "measured" if real else "never-measured"
    events = "external" if possibly else "self-test-only"
    # An overclaim needs both halves: an unsupported sentence AND no data.
    honest = not (claims and visitors == "never-measured")

    return {
        "products": len(products),
        "visitor_readings": total,
        "visitor_real": real,
        "visitors": visitors,
        "events": events,
        "not_external": not_external,
        "possibly_external": possibly,
        "claims": claims,
        "claims_verdict": "honest" if honest else "overclaimed",
        "honest": honest,
    }


def render(report: dict) -> str:
    lines = ["Usage state — has anything here ever actually been measured?", ""]

    lines.append(f"  products          {report['products']} with usage rows")

    if report["visitors"] == "never-measured":
        lines.append(f"  visitors          never-measured")
        lines.append(
            f"                    {report['visitor_readings']} readings of "
            f"`{VISITOR_SIGNAL}`, every one null. Not one reading of zero."
        )
        lines.append(
            "                    GitHub Pages exposes no server-side analytics, the"
        )
        lines.append(
            "                    platform/edge counter is not deployed yet, and the local counters are"
        )
        lines.append(
            "                    opt-in and off by default, so they report from machines we"
        )
        lines.append(
            "                    do not own. `null` is the honest entry. It is NOT a zero."
        )
    else:
        lines.append(
            f"  visitors          measured — {len(report['visitor_real'])} real reading(s): "
            f"{report['visitor_real']}"
        )

    lines.append("")
    if report["events"] == "self-test-only":
        lines.append("  events            self-test-only")
        lines.append(
            f"                    {len(report['not_external'])} positive signal reading(s), none of them a"
        )
        lines.append(
            "                    third party: build statistics, plus a lone `1` on the day"
        )
        lines.append(
            "                    each counter was added (the author running it once)."
        )
    else:
        lines.append(
            f"  events            external — {len(report['possibly_external'])} reading(s) that may be real:"
        )
        for slug, name, value, date in report["possibly_external"][:10]:
            lines.append(f"                      {slug}: {name} = {value}  ({date})")

    lines.append("")
    lines.append(f"  claims            {report['claims_verdict']}")
    if report["claims"]:
        lines.append(
            "                    steering document(s) call the null a measurement:"
        )
        for rel, number, text in report["claims"]:
            snippet = text if len(text) <= 88 else text[:85] + "..."
            lines.append(f"                      {rel}:{number}")
            lines.append(f"                        {snippet}")
    else:
        lines.append(
            "                    no steering document reports the null as an observed zero"
        )

    lines.append("")
    lines.append("  next")
    if not report["honest"]:
        lines.append(
            "    Correct the sentences above: usage.yaml records NO visitor measurement,"
        )
        lines.append(
            "    not a measurement of zero. The two license opposite decisions — one says"
        )
        lines.append(
            "    the product is wrong, the other says go and get a reading."
        )
    elif report["visitors"] == "never-measured":
        lines.append(
            "    Nothing is overclaimed. The visitor signal is still unmeasurable on this"
        )
        # Point at the row that owns this list rather than keeping a second
        # copy of it. This block named two owner fixes and went stale on
        # 2026-09-17, the day `pages_state.py` gained a third and cheaper one
        # (a robots.txt at the user Pages site root) -- the same
        # import-don't-restate failure CLAUDE.md records three times over,
        # and the reason a session reading only this tool would have been
        # told to wait for a domain it does not need.
        lines.append(
            "    origin. `python3 platform/ci/pages_state.py` owns that list and prints"
        )
        lines.append(
            "    it cheapest-first under `indexing` -- read it there rather than from a"
        )
        lines.append(
            "    second copy here. Until one of them lands, do not read these rows as"
        )
        lines.append("    evidence about any product's worth.")
    else:
        lines.append("    A real reading exists — rank it per DIRECTION.md.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--require-honest",
        action="store_true",
        help="exit 1 if a steering document reports the null as an observed zero",
    )
    args = parser.parse_args(argv)

    report = build_report()
    print(render(report))

    if args.require_honest and not report["honest"]:
        print(
            "\nFAIL: usage.yaml has never recorded a visitor measurement, and the"
            "\n      document(s) above describe that null as an observed zero.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
