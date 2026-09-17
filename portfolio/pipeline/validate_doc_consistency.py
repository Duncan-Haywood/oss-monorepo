#!/usr/bin/env python3
"""Check that a candidate's score is the same number in all three places it is written.

Why this exists
---------------
A candidate's composite and floor live in three files that are edited by
different sessions at different times:

    candidates.yaml                 the machine-readable scores
    candidates/<slug>.md            the write-up's headline, "Composite X . floor Y (dim)"
    README.md                       the ranked table the intake gate routes every session to

Nothing checked that they agree, and they drift apart in a specific, quiet way:
a session that rescores one dimension updates the two files its own argument
touches and leaves the third. That is invisible in the diff of any single pull
request and only appears once two of them land together.

It has already happened. Trial-merging the four open pipeline pull requests onto
`main` on 2026-08-20 (#265, #267, #258, #272 -- clean, in that order) produced a
tree where `candidates.yaml` and `README.md` both scored `mcp-supply-chain-watch`
and `cra-evidence-desk` at 6.75/floor 3, while both write-ups still headlined
7.0/floor 4. #258 lowered defensibility 4->3 in the yaml and the table; #272
separately lowered AI leverage 7->6 in one write-up. Each was right about its own
half. Neither was wrong in isolation, and no check in the repo would have caught
the pair.

The stale number lands in `README.md`'s neighbourhood, which `CLAUDE.md`'s intake
gate makes the first thing a new session reads. A session that opens the write-up
instead of the table gets the superseded score.

Relationship to `validate_candidates.py`
----------------------------------------
Complementary, deliberately non-overlapping. That script (added by #258) checks
`candidates.yaml` against *itself* -- composite is the mean of the eight
dimensions, floor is the minimum, the liability and ethics gates hold, every
dimension at 4 or below carries a named mitigation. It cannot see the prose.

This script checks nothing internal to the yaml and only ever compares one file
to another. Run both; neither subsumes the other.

Reads only the working tree. Writes nothing, fetches nothing, needs no
credentials.

Usage: python3 portfolio/pipeline/validate_doc_consistency.py
"""
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install -r portfolio/router/requirements.txt")

PIPELINE_DIR = Path(__file__).resolve().parent
CANDIDATES_YAML = PIPELINE_DIR / "candidates.yaml"
README = PIPELINE_DIR / "README.md"

# "Scored 2026-08-18. Composite 7.25 · floor 5 (defensibility)." -- the write-up
# headline. Trailing prose after the parenthesis is allowed; several write-ups
# continue the sentence to record a rescore.
HEADLINE = re.compile(r"Composite\s+([\d.]+)\s*·\s*floor\s+(\d+)\s*\(([^)]+)\)")

# "| 3 | [Public-record watch](candidates/public-record-watch.md) | 7.0 | 4 | ... |"
TABLE_ROW = re.compile(
    r"^\|\s*(\d+)\s*\|\s*\[[^\]]+\]\(candidates/([A-Za-z0-9._-]+)\.md\)\s*\|"
    r"\s*([\d.]+)\s*\|\s*(\d+)\s*\|"
)


def normalise_dimension(text):
    """`time_to_revenue` and `time to revenue` are the same dimension.

    Markdown emphasis around the name is stripped too. A write-up that spelled
    its floor as ``(`ai_leverage`)`` -- one file out of 31, every sibling plain
    -- failed here with "headline attributes the floor to `ai leverage`,
    candidates.yaml says ai leverage": two strings that differ only by
    backticks the reader cannot easily see, on a validator whose whole job is
    to tell someone which of three places is stale. Backticks, asterisks and
    underscores-as-emphasis carry no meaning in a dimension name, so they are
    not a disagreement worth failing on.
    """
    return text.strip().strip("`*_").strip().lower().replace("_", " ")


def _display_path(path):
    """Repo-relative where possible, absolute otherwise.

    `relative_to` raises rather than falling back, so a path outside the repo
    root turned this reporting line into a ValueError -- a crash in the branch
    whose only job is to explain what is wrong with a file.
    """
    try:
        return path.relative_to(PIPELINE_DIR.parent.parent)
    except ValueError:
        return path


def parse_headline(path, errors):
    """Return (composite, floor, [dimensions]) from a write-up, or None."""
    match = HEADLINE.search(path.read_text())
    if not match:
        errors.append(
            f"{_display_path(path)}: no "
            "'Composite X · floor Y (dimension)' headline found"
        )
        return None
    dimensions = [normalise_dimension(d) for d in match.group(3).split(",")]
    return float(match.group(1)), int(match.group(2)), dimensions


def parse_table(errors):
    """Return README's ranked table as (rows by slug, rows in file order)."""
    rows = {}
    order = []
    for line in README.read_text().splitlines():
        match = TABLE_ROW.match(line)
        if not match:
            continue
        slug = match.group(2)
        rank, composite, floor = int(match.group(1)), float(match.group(3)), int(match.group(4))
        if slug in rows:
            errors.append(f"README.md: {slug} appears in the table more than once")
            continue
        rows[slug] = (rank, composite, floor)
        order.append((slug, rank, composite, floor))
    return rows, order


def check_write_up(candidate, slug, errors):
    doc_path = PIPELINE_DIR / candidate.get("doc", f"candidates/{slug}.md")
    if not doc_path.exists():
        errors.append(f"candidates.yaml: {slug} points at {doc_path.name}, which does not exist")
        return

    headline = parse_headline(doc_path, errors)
    if headline is None:
        return
    composite, floor, dimensions = headline
    where = f"candidates/{doc_path.name}"

    if composite != float(candidate["composite"]):
        errors.append(
            f"{where}: headline says composite {composite}, "
            f"candidates.yaml says {candidate['composite']}"
        )
    if floor != int(candidate["floor"]):
        errors.append(
            f"{where}: headline says floor {floor}, candidates.yaml says {candidate['floor']}"
        )

    # The headline may name several tied dimensions; the yaml names one. Require
    # the yaml's to be among them rather than demanding an exact string match.
    floor_dimension = normalise_dimension(candidate.get("floor_dimension", ""))
    if floor_dimension and floor_dimension not in dimensions:
        errors.append(
            f"{where}: headline attributes the floor to {', '.join(dimensions)}, "
            f"candidates.yaml says {floor_dimension}"
        )


def check_table_row(candidate, slug, rows, errors):
    if slug not in rows:
        errors.append(f"README.md: {slug} is scored in candidates.yaml but has no table row")
        return
    _, composite, floor = rows[slug]
    if composite != float(candidate["composite"]):
        errors.append(
            f"README.md: table scores {slug} at composite {composite}, "
            f"candidates.yaml says {candidate['composite']}"
        )
    if floor != int(candidate["floor"]):
        errors.append(
            f"README.md: table scores {slug} at floor {floor}, "
            f"candidates.yaml says {candidate['floor']}"
        )


def check_ranking(order, errors):
    """The table is a ranking, so a rescore that does not reorder it is stale.

    `order` is the rows in the order they appear in the file, which is checked
    against the rank numbers printed in them: a session that inserts or rescores
    a row without renumbering leaves the two disagreeing.
    """
    for position, (slug, rank, _, _) in enumerate(order, start=1):
        if rank != position:
            errors.append(
                f"README.md: {slug} is row {position} of the table but is numbered {rank}"
            )

    for (previous_slug, _, previous, _), (slug, _, current, _) in zip(order, order[1:]):
        if current > previous:
            errors.append(
                f"README.md: table is ranked by composite, but {slug} ({current}) "
                f"is listed below {previous_slug} ({previous})"
            )


def main():
    errors = []
    data = yaml.safe_load(CANDIDATES_YAML.read_text())
    candidates = data.get("candidates") or []
    if not candidates:
        sys.exit("candidates.yaml: no candidates found")

    rows, order = parse_table(errors)

    for candidate in candidates:
        slug = candidate.get("slug")
        if not slug:
            errors.append("candidates.yaml: a candidate has no `slug`")
            continue
        check_write_up(candidate, slug, errors)
        check_table_row(candidate, slug, rows, errors)

    scored = {c.get("slug") for c in candidates}
    for slug in rows:
        if slug not in scored:
            errors.append(f"README.md: table lists {slug}, which is not in candidates.yaml")

    check_ranking(order, errors)

    if errors:
        print(
            f"{len(errors)} inconsistency(ies) between candidates.yaml, the write-ups, "
            "and README.md:\n",
            file=sys.stderr,
        )
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        print(
            "\nA candidate's composite and floor must read the same in all three "
            "places. Update whichever is stale.",
            file=sys.stderr,
        )
        return 1

    print(
        f"All {len(candidates)} candidates score identically in candidates.yaml, "
        "their write-ups, and README.md's table."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
