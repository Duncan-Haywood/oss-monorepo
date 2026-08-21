#!/usr/bin/env python3
"""What the pipeline's own measurement record says about its unmeasured scores.

    python3 portfolio/pipeline/score_sensitivity.py

`rescore-2026-08-20.md` recorded a pattern — every dimension anyone measured
fell, one point, and none rose — and drew one conclusion from it: read the
unmeasured *candidates* as upper bounds. That reading is about candidates. The
record is also, and more sharply, about *dimensions*, and nobody has looked at
it that way. This script does the arithmetic.

It reads `candidates.yaml` and reports four things:

1. **Coverage.** Which of the eight dimensions have ever been measured, on how
   many of the candidates. The answer is not uniform, and the shape of the
   non-uniformity is the finding.
2. **Direction.** Every recorded revision, its size, and what a sign test over
   them is and is not entitled to say.
3. **Rank sensitivity.** Apply the observed bias to the unmeasured cells *of
   the dimensions where it was actually observed*, and see whether the ranking
   moves. Adjusting a dimension nobody has measured, on evidence from a
   different dimension, is the category error this directory keeps making; the
   scope restriction is the point.
4. **Gate sensitivity.** The same bias extrapolated to the two gate dimensions
   — clearly labelled as extrapolation, because it is one — and which
   candidates cross the gate under it.

No network, no model call, no dependency beyond PyYAML. Exits non-zero if
`candidates.yaml` is shaped in a way it cannot read, so a malformed
`measured:` block fails loudly rather than being silently dropped from the
sample.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

import yaml

DIMENSIONS = [
    "ai_leverage",
    "autonomous_ops",
    "time_to_revenue",
    "gross_margin",
    "defensibility",
    "distribution",
    "liability_containment",
    "ethical_robustness",
]

# README.md: ethics and liability are gates, not weights.
GATE_DIMENSIONS = ["liability_containment", "ethical_robustness"]
GATE_MINIMUM = 5

# Every `measured:` block in candidates.yaml opens by stating the revision it
# applied, e.g. "7 -> 6, PR #207 step 2. ...". That prefix is the machine-
# readable part; the rest is the derivation for a human. Parsed strictly: a
# block that does not open this way is an error, not a skip, because a silently
# dropped revision would bias the very sample this script measures.
REVISION_RE = re.compile(r"^\s*(\d+)\s*->\s*(\d+)\b")


@dataclass(frozen=True)
class Revision:
    """A dimension that stopped being an estimate, and which way it moved."""

    slug: str
    dimension: str
    was: int
    now: int

    @property
    def delta(self) -> int:
        return self.now - self.was


@dataclass(frozen=True)
class Candidate:
    slug: str
    verdict: str
    scores: dict
    measured: frozenset  # dimensions with a recorded revision
    examined: frozenset  # dimensions examined and deliberately not revised

    @property
    def settled(self) -> frozenset:
        """Dimensions where someone has actually looked."""
        return self.measured | self.examined


def load(path: Path) -> tuple[list[Candidate], list[Revision]]:
    doc = yaml.safe_load(path.read_text())
    raw = doc.get("candidates") or []
    if not raw:
        raise ValueError(f"{path}: no candidates found")

    candidates: list[Candidate] = []
    revisions: list[Revision] = []

    for entry in raw:
        slug = entry.get("slug") or "<no slug>"
        scores = entry.get("scores") or {}
        missing = [d for d in DIMENSIONS if d not in scores]
        if missing:
            raise ValueError(f"{slug}: missing dimensions {missing}")

        measured = entry.get("measured") or {}
        for dimension, prose in measured.items():
            if dimension not in DIMENSIONS:
                raise ValueError(f"{slug}: measured block names unknown dimension {dimension!r}")
            match = REVISION_RE.match(str(prose))
            if not match:
                raise ValueError(
                    f"{slug}: measured.{dimension} does not open with "
                    f"'<was> -> <now>'; cannot read the revision it applied"
                )
            was, now = int(match.group(1)), int(match.group(2))
            if now != scores[dimension]:
                raise ValueError(
                    f"{slug}: measured.{dimension} says the score is now {now}, "
                    f"but scores.{dimension} is {scores[dimension]}"
                )
            revisions.append(Revision(slug, dimension, was, now))

        examined = entry.get("flagged_unmeasured") or {}
        for dimension in examined:
            if dimension not in DIMENSIONS:
                raise ValueError(
                    f"{slug}: flagged_unmeasured names unknown dimension {dimension!r}"
                )

        candidates.append(
            Candidate(
                slug=slug,
                verdict=str(entry.get("verdict") or ""),
                scores={d: scores[d] for d in DIMENSIONS},
                measured=frozenset(measured),
                examined=frozenset(examined),
            )
        )

    return candidates, revisions


def composite(scores: dict) -> Fraction:
    """Exact mean, so a tie is a tie and not a floating-point near-tie."""
    return Fraction(sum(scores[d] for d in DIMENSIONS), len(DIMENSIONS))


def ranking(rows: list[tuple[str, Fraction]]) -> dict:
    """Competition ranking: equal composites share a rank."""
    ordered = sorted(rows, key=lambda r: (-r[1], r[0]))
    ranks: dict = {}
    for index, (slug, value) in enumerate(ordered):
        previous = [s for s, v in ordered[:index] if v == value]
        ranks[slug] = ranks[previous[0]] if previous else index + 1
    return ranks


def adjust(candidate: Candidate, dimensions: list[str], delta: int) -> dict:
    """Apply `delta` to the named dimensions where nobody has looked yet."""
    adjusted = dict(candidate.scores)
    for dimension in dimensions:
        if dimension in candidate.settled:
            continue
        adjusted[dimension] = max(0, min(10, adjusted[dimension] + delta))
    return adjusted


def fmt(value: Fraction) -> str:
    return f"{float(value):.3f}".rstrip("0").rstrip(".")


def report(candidates: list[Candidate], revisions: list[Revision]) -> list[str]:
    out: list[str] = []
    say = out.append

    say("Score sensitivity — what the measurement record licenses")
    say("")

    # ---------------------------------------------------------------- coverage
    say("1. MEASUREMENT COVERAGE")
    say("")
    say(f"   {len(revisions)} recorded revision(s) across {len(candidates)} candidates.")
    say("")
    measured_dims = [d for d in DIMENSIONS if any(d in c.measured for c in candidates)]
    for dimension in DIMENSIONS:
        revised = [c.slug for c in candidates if dimension in c.measured]
        looked = [c.slug for c in candidates if dimension in c.examined]
        gate = " (gate)" if dimension in GATE_DIMENSIONS else ""
        note = f"{len(revised)}/{len(candidates)} revised"
        if looked:
            note += f", {len(looked)} examined and left alone"
        say(f"   {dimension:<22}{gate:<7} {note}")
    say("")
    untouched_gates = [
        d for d in GATE_DIMENSIONS
        if not any(d in c.settled for c in candidates)
    ]
    say(
        f"   Every revision falls in {len(measured_dims)} of {len(DIMENSIONS)} dimensions: "
        + ", ".join(measured_dims)
        + "."
    )
    if untouched_gates:
        cells = len(untouched_gates) * len(candidates)
        say(
            f"   The {len(untouched_gates)} gate dimension(s) — {', '.join(untouched_gates)} — "
            f"have never been"
        )
        say(
            f"   measured on any candidate. All {cells} gate scores are still screening estimates,"
        )
        say("   and the gates are what decide admission rather than rank.")
    say("")

    # --------------------------------------------------------------- direction
    say("2. DIRECTION OF REVISION")
    say("")
    for revision in sorted(revisions, key=lambda r: (r.slug, r.dimension)):
        say(
            f"   {revision.slug:<26} {revision.dimension:<22} "
            f"{revision.was} -> {revision.now}  ({revision.delta:+d})"
        )
    say("")
    down = [r for r in revisions if r.delta < 0]
    sizes = {abs(r.delta) for r in revisions}
    say(f"   {len(down)}/{len(revisions)} downward; magnitudes {sorted(sizes)}.")
    if len(down) == len(revisions) and revisions:
        p_one_sided = Fraction(1, 2 ** len(revisions))
        say(
            f"   Sign test, one-sided, if the revisions were independent: "
            f"p = {float(p_one_sided):.4f}."
        )
    say("")
    say("   What that number is not entitled to say, stated here so the next pass")
    say("   does not quote it as more than it is:")
    say("   - The revisions are not independent. Several share a dimension, and")
    say("     several share the pass that measured them.")
    say("   - The sample is revisions, not measurements. A pass that measured a")
    say("     dimension and left the score alone records no revision, so")
    say("     confirmations are close to invisible in this file.")
    examined_total = sum(len(c.examined) for c in candidates)
    plural = "" if examined_total == 1 else "s"
    say(
        f"     {examined_total} such case{plural} recorded explicitly "
        f"(`flagged_unmeasured`); any others are not."
    )
    # The magnitude used to be uniformly 1, and this sentence used to say so as
    # fixed prose. The first ethical_robustness measurement revised by 2 and 3,
    # so it is derived now: what the record supports is a direction plus the
    # smallest magnitude ever observed, not a constant.
    span = "by one" if sizes == {1} else f"by {min(sizes)} to {max(sizes)} points"
    say("   - So the claim this supports is the narrow one: *when a score in these")
    if len(down) == len(revisions):
        say(f"     dimensions is revised, it is revised downward, {span}*. Not:")
        say("     measurement always lowers a score.")
    else:
        say("     dimensions is revised, it moves*. The record holds revisions in")
        say("     both directions, so it licenses no claim about which way.")
    say("")

    bias = -1 if down and len(down) == len(revisions) and sizes == {1} else 0
    rank_stable = None

    # --------------------------------------------------------- rank sensitivity
    say("3. RANK SENSITIVITY (bias applied only where it was observed)")
    say("")
    if bias == 0:
        say("   No single consistent bias in the record; nothing to apply.")
        if len(sizes) > 1:
            say(f"   Every revision is downward, but the magnitudes are {sorted(sizes)},")
            say("   so there is no single number to carry to the cells nobody has")
            say("   looked at. The extrapolation is withheld rather than set to zero:")
            say("   an unlooked-at cell is not thereby confirmed.")
        say("")
        # Sections 4 and the verdict do not depend on the extrapolation for the
        # part that matters — where the *measured* gate scores actually sit —
        # and this used to return here, which meant a second measured dimension
        # silently deleted the report's conclusion.
    else:
        say(
            f"   Applying {bias:+d} to {', '.join(measured_dims)} on every candidate where"
        )
        say("   that dimension has not been looked at.")
        say("")
    if bias:
        before = [(c.slug, composite(c.scores)) for c in candidates]
        after_scores = {c.slug: adjust(c, measured_dims, bias) for c in candidates}
        after = [(c.slug, composite(after_scores[c.slug])) for c in candidates]
        rank_before, rank_after = ranking(before), ranking(after)
        by_slug = {c.slug: c for c in candidates}

        say(f"   {'candidate':<26} {'composite':>9} {'adjusted':>9}   {'rank':>9}   floor")
        for slug, value in sorted(before, key=lambda r: (-r[1], r[0])):
            adjusted = dict(after).get(slug, value)
            move = f"{rank_before[slug]} -> {rank_after[slug]}"
            floor_after = min(after_scores[slug][d] for d in DIMENSIONS)
            say(
                f"   {slug:<26} {fmt(value):>9} {fmt(adjusted):>9}   {move:>9}   "
                f"{min(by_slug[slug].scores.values())} -> {floor_after}"
            )
        say("")
        displacement = max(abs(rank_after[s] - rank_before[s]) for s in rank_before)
        top_before = [s for s, r in rank_before.items() if r == 1]
        top_after = [s for s, r in rank_after.items() if r == 1]
        say(f"   Largest rank displacement: {displacement} position(s).")
        say(
            f"   Top of the table {'unchanged' if set(top_before) == set(top_after) else 'CHANGES'}: "
            f"{', '.join(sorted(top_before))} -> {', '.join(sorted(top_after))}."
        )
        say("")
        rank_stable = displacement <= 2 and set(top_before) == set(top_after)
        if rank_stable:
            say("   So the bias the pipeline has spent five passes measuring does not")
            say("   change what to work on. Further rank-scoring has no decision value —")
            say("   that was argued in rescore-2026-08-20.md and this is the arithmetic.")
        else:
            say("   The middle of the table now moves under the extrapolation, which it")
            say("   did not while every revision was one point. The top is still the same")
            say("   candidate, so what to work on is unchanged; what has stopped holding")
            say("   is the stronger claim that the ordering below it is insensitive.")
        say("")

    # --------------------------------------------------------- gate sensitivity
    say("4. GATE SENSITIVITY (extrapolation, not measurement)")
    say("")
    if bias:
        say(f"   The same {bias:+d}, applied to {', '.join(GATE_DIMENSIONS)}. It is run")
        say("   because the gates reject regardless of composite, so an error there")
        say("   changes an admission decision rather than an ordering.")
    else:
        say("   No extrapolation to run — section 3 found no single magnitude to")
        say("   carry. What survives without one is where the gate scores already")
        say("   sit, which is a reading of the file rather than an inference from it.")
    say("")
    # Which half of this is extrapolation is no longer fixed. Once a gate
    # dimension has been measured, applying the observed bias to its unlooked
    # cells is the same operation section 3 performs, and only the gates
    # nobody has touched are still an extrapolation across families.
    if bias and untouched_gates:
        say(f"   Extrapolation for {', '.join(untouched_gates)}: no measurement has")
        say("   ever been taken there, so this carries the bias across dimension")
        say("   families and is labelled as such.")
    for dimension in (d for d in GATE_DIMENSIONS if d not in untouched_gates):
        count = len([c for c in candidates if dimension in c.measured])
        if bias:
            say(f"   Observed bias for {dimension}: measured on")
            say(f"   {count} candidate(s), so this is section 3's operation, not an "
                "extrapolation.")
        else:
            say(f"   {dimension}: measured on {count} candidate(s); the scores below "
                "are those measurements.")
    say("")
    crossings: list[str] = []
    margins: list[str] = []
    for candidate in sorted(candidates, key=lambda c: c.slug):
        adjusted = adjust(candidate, GATE_DIMENSIONS, bias) if bias else candidate.scores
        for dimension in GATE_DIMENSIONS:
            was, now = candidate.scores[dimension], adjusted[dimension]
            if was >= GATE_MINIMUM > now:
                crossings.append(f"{candidate.slug}: {dimension} {was} -> {now}")
            elif was in (GATE_MINIMUM, GATE_MINIMUM + 1):
                where = ("at the gate" if was == GATE_MINIMUM
                         else "one above the gate")
                how = ("measured" if dimension in candidate.settled else "unmeasured")
                margins.append(
                    f"{candidate.slug}: {dimension} {where} ({was}, {how})")

    if crossings:
        say(f"   {len(crossings)} candidate-dimension(s) would cross below the gate:")
        for line in crossings:
            say(f"     - {line}")
    elif bias:
        say("   No candidate crosses the gate under the extrapolation.")
    say("")
    if margins:
        say("   Sitting within one point of the gate:")
        for line in margins:
            say(f"     - {line}")
        say("")

    build_now = [c for c in candidates if c.verdict == "build-now"]
    for candidate in build_now:
        liability = candidate.scores["liability_containment"]
        if "liability_containment" not in candidate.settled:
            say(
                f"   {candidate.slug} is the only verdict this pipeline calls "
                f"build-now, and"
            )
            say(
                f"   its liability_containment is an unmeasured {liability} against a "
                f"gate of {GATE_MINIMUM}."
            )
    say("")
    say("VERDICT")
    say("")
    # Was fixed prose reading "confined to the dimensions that decide rank".
    # That stopped being true the moment a gate dimension was measured, and
    # fixed prose cannot notice. Derived from the same blocks as everything
    # else now.
    revised_dims = sorted({r.dimension for r in revisions})
    gates_revised = [d for d in GATE_DIMENSIONS if d in revised_dims]
    direction = "one-directional" if len(down) == len(revisions) else "mixed in direction"
    say(f"   The measurement record is real, {direction}, and covers "
        f"{len(revised_dims)} of {len(DIMENSIONS)}")
    if gates_revised:
        say(f"   dimensions, {len(gates_revised)} of them a gate: "
            f"{', '.join(gates_revised)}.")
    else:
        say("   dimensions, none of them a gate.")
    if rank_stable is None:
        say("   Section 3 had no single magnitude to extrapolate with, so the")
        say("   ranking's sensitivity is untested this run rather than confirmed.")
    else:
        say(f"   Under section 3's extrapolation the ranking is "
            f"{'insensitive' if rank_stable else 'no longer insensitive'}.")
    say("")
    # This verdict used to be fixed prose ending "No pass has attempted one."
    # A pass then attempted one, and fixed prose cannot notice that. It is
    # derived from the same `measured:` blocks as every other section now, so
    # the script stops asking for work that has been done.
    settled_gates = [d for d in GATE_DIMENSIONS if d not in untouched_gates]
    if not settled_gates:
        say("   It says nothing about the dimensions that decide admission, which")
        say("   have never been measured on any candidate.")
        say("")
        say("   The next scoring measurement worth paying for is therefore a gate")
        say("   measurement, not another rank measurement. No pass has attempted one.")
    else:
        for dimension in settled_gates:
            revised = sorted(c.slug for c in candidates if dimension in c.measured)
            say(f"   {dimension} has now been measured, on {len(revised)}")
            say(f"   candidate(s): {', '.join(revised)}.")
        if untouched_gates:
            say("")
            say(f"   {', '.join(untouched_gates)} remains unmeasured on every")
            say("   candidate, and is the remaining gate measurement worth paying for.")
        at_gate = sorted(
            c.slug for c in candidates
            if any(c.scores[d] == GATE_MINIMUM for d in GATE_DIMENSIONS)
        )
        if at_gate:
            say("")
            say(f"   Sitting *on* a gate, where one more measured point rejects:")
            say(f"     {', '.join(at_gate)}")

    return out


def main() -> int:
    path = Path(__file__).with_name("candidates.yaml")
    try:
        candidates, revisions = load(path)
    except ValueError as error:
        print(f"cannot read {path}: {error}")
        return 1
    for line in report(candidates, revisions):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
