"""The record a *subscriber* receives, as distinct from the operator table.

``detect_silence.render`` prints a diagnostic table for whoever is tuning the
detector. It has a column that reads ``MISSED`` beside a register whose dormancy
this watch failed to catch — the detector knows — and nothing carried that to
the person paying to be told. ``portfolio/research/error-rate-disclosure/``
measured that as a missing customer surface, not a missing number, and scored
``public-record-watch`` 9 -> 6 on it.

This module is the missing surface. It exists to make two things visible to a
subscriber that the operator table keeps to itself:

**1. This watch's errors are invisible from outside.** A false alarm announces
itself — you look, the register is fine, you distrust us. A *miss* looks exactly
like good news: you see no alert, and a register that stopped publishing looks
identical to one that never had anything to publish. Held out, this detector
finds 6 of 17 dormancy episodes. So the load-bearing sentence in the record is
not the recall figure, it is what follows from it: **silence from us is not
evidence a register is active**, and the record says so on every page rather
than in a footnote.

**2. Our incentive runs toward missing you.** A nuisance alarm costs us a
subscriber; a miss costs us nothing and cannot be observed. That is the exact
shape ``error-rate-disclosure``'s deduction 3 asks about, and the honest move is
to state it in the artifact rather than to claim it does not apply.

Everything here is rendered from a ``detect_silence.evaluate_all`` result. No
clock is read: ``generated_at`` is supplied by the caller, as in the sibling
probes, so records are reproducible.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass

from detect_silence import QUIET_GROUND_TRUTH_DAYS

TOOL_NAME = "source-silence-detector"
TOOL_VERSION = "0.1.0"

#: A threshold longer than this means the watch cannot report dormancy on any
#: timescale a subscriber plausibly cares about, even though it is nominally
#: watching. Set at one year: deliberately a round human horizon rather than a
#: statistic of the same distribution the threshold is fitted on, for the same
#: reason the holdout's dormancy label is set that way.
#:
#: This is not a hypothetical. The anchor is a high quantile of each source's
#: own gaps, and nearest-rank p99 *is* the maximum for any source with fewer
#: than 100 closed gaps — so `FDA/openfda`, which contributes 9 of the 17
#: dormancy episodes in the holdout, calibrates to a 5.6-year threshold. Its
#: row would otherwise read "no alert" beside a last change months old, which
#: is true and reads as reassurance.
PRACTICAL_HORIZON_DAYS = 365

COVERAGE_STATEMENT = (
    "This watch reports on the PUBLISHING CADENCE of a public register's mirror, "
    "and nothing else. It observes when the mirror last changed and compares that "
    "against how often that same source has changed in its own history. It does "
    "not read the contents of any record, does not know whether a register is "
    "legally obliged to publish, and cannot distinguish a register that has "
    "stopped from one that is merely between publications, a holiday period, or "
    "a mirror whose own sync has broken. A source with too little history to "
    "calibrate is listed below as NOT WATCHED — it is carried in your "
    "subscription and no alarm can fire for it."
)

#: The strongest sentence in the record, kept as its own constant so it cannot
#: be edited away as prose. The gate question for this candidate is whether the
#: customer can tell when the product has failed them, and for this product they
#: structurally cannot; saying so is the whole mitigation available.
SILENCE_CAVEAT = (
    "NO ALERT FROM US IS NOT EVIDENCE THAT A REGISTER IS ACTIVE. This watch "
    "misses roughly two thirds of the dormancy it is asked to find, and a miss "
    "looks exactly like good news from where you are standing: you see nothing "
    "either way. If a register matters to you, check it directly on a schedule "
    "you choose. Treat an alert from us as a prompt to look, and the absence of "
    "one as no information at all."
)


@dataclass(frozen=True)
class AccuracyFigure:
    """One measured error rate, with the direction it runs in.

    Same shape as ``eaa-wcag-triage``'s, deliberately: two probes in this
    directory now disclose accuracy and a subscriber should not have to learn
    two vocabularies. Every field is required because each is a way the number
    misleads if it travels alone.
    """

    metric: str
    value: str
    direction: str
    reads: str
    corpus: str
    measured: str
    source: str
    caveat: str


ACCURACY: tuple = (
    AccuracyFigure(
        metric="detection rate",
        value="6 of 17 (0.35)",
        direction="under-reporting — dormancy this watch never alerts you to",
        reads=(
            "Of 17 historical episodes where a register went dormant, this watch "
            "would have caught 6. Assume it will miss most of what you are "
            "paying it to catch."
        ),
        corpus=(
            "17 dormancy episodes across 9 register mirrors, held out by "
            "leave-one-source-out cross-validation"
        ),
        measured="2026-08-21",
        source="results-holdout-2026-08-21.json",
        caveat=(
            "9 of the 17 episodes come from a single register (FDA/openfda), so "
            "this is closer to a statement about that one source than the count "
            "suggests, and 4 of the 9 sources contribute no episodes at all. "
            "Moving the dormancy threshold from 60 to 365 days moves this figure "
            "between 0.35 and 0.52."
        ),
    ),
    AccuracyFigure(
        metric="detection latency",
        value="110 days (median)",
        direction="late — the alert arrives long after the register went quiet",
        reads=(
            "When this watch does catch a dormancy, expect to hear about it "
            "around three months in, not in the first weeks."
        ),
        corpus="the 6 caught episodes of the 17 held out",
        measured="2026-08-21",
        source="results-holdout-2026-08-21.json",
        caveat=(
            "Median over a small number of catches. Latency and detection rate "
            "trade against false alarms together: catching 14 of 17 instead of 6 "
            "costs roughly 43 days per source per year of being told a register "
            "had stopped when it had not."
        ),
    ),
)

ACCURACY_STATEMENT = (
    "These figures come from replaying this watch over the recorded history of "
    "the mirrors it follows, holding each source out in turn. They describe the "
    "detector, not a promise about your sources. "
    "The conflict you should know about: a false alarm costs us a subscriber, "
    "and a miss costs us nothing and is invisible to you — so our commercial "
    "incentive runs toward tuning this watch to stay quiet. That is why the "
    "detection rate is printed at the top of every record rather than supplied "
    "on request, and why the sources this watch cannot cover at all are listed "
    "by name below."
)


def build_record(result: dict, generated_at: str) -> dict:
    """``result`` is a :func:`detect_silence.evaluate_all` payload.

    ``generated_at`` is an ISO-8601 timestamp supplied by the caller, never read
    from the clock, so a record is reproducible from its inputs.
    """
    totals = result["totals"]
    sources = []
    for name, row in sorted(result["sources"].items()):
        watched = row["final_threshold"] is not None
        sources.append(
            {
                "source": name,
                "watched": watched,
                "state": _state(row, watched),
                "last_change": row["last_change"],
                "alarm_after_days": row["final_threshold"],
                "typical_gap_days": row["median_gap"],
                "longest_historical_gap_days": row["max_gap"],
                "practical_note": _practical_note(row, watched),
            }
        )
    return {
        "tool": {"name": TOOL_NAME, "version": TOOL_VERSION},
        "generated_at": generated_at,
        "window": result["window"],
        "coverage_statement": COVERAGE_STATEMENT,
        "silence_caveat": SILENCE_CAVEAT,
        "accuracy_statement": ACCURACY_STATEMENT,
        "accuracy": [asdict(a) for a in ACCURACY],
        "quiet_threshold_days": QUIET_GROUND_TRUTH_DAYS,
        "summary": {
            "sources": totals["sources"],
            "not_watched": list(totals["never_calibrated"]),
            "effectively_unwatched": sorted(
                s["source"]
                for s in sources
                if s["watched"]
                and s["alarm_after_days"] > PRACTICAL_HORIZON_DAYS
            ),
            "alerting": sorted(
                s["source"] for s in sources if s["state"] == "ALERT: gone quiet"
            ),
        },
        "sources": sources,
    }


def _state(row: dict, watched: bool) -> str:
    """What this record is entitled to say about one source.

    Note what is *not* here. The operator table distinguishes a source that went
    quiet and was caught from one that went quiet and was missed, because it is
    scored against ground truth nobody has at delivery time. A subscriber record
    cannot make that distinction — if the watch knew it had missed something it
    would have alerted — so "no alert" is rendered as exactly that, never as
    "active" or "healthy", which would be a claim this watch cannot support.
    """
    if not watched:
        return "NOT WATCHED: too little history to calibrate"
    if row["quiet_at_window_end"] and row["detected_terminal_silence"]:
        return "ALERT: gone quiet"
    if row["final_threshold"] > PRACTICAL_HORIZON_DAYS:
        return "no alert — but see the threshold"
    return "no alert"


def _practical_note(row: dict, watched: bool) -> str | None:
    """Say when a nominally-watched source is not usefully watched.

    Without this, the worst-covered source in the corpus renders identically to
    the best: "no alert". The threshold is in the table either way, but a
    subscriber should not have to notice that 2060 is a large number and work
    out what it implies about their own coverage.
    """
    if not watched:
        return (
            "No alarm can fire for this source at all — there is not enough "
            "history to calibrate one."
        )
    threshold = row["final_threshold"]
    if threshold > PRACTICAL_HORIZON_DAYS:
        return (
            f"This source alarms only after {threshold}d "
            f"(~{threshold / 365.0:.1f} years) of silence, because its own "
            "publishing history is that irregular. Treat it as effectively "
            "unwatched on any timescale shorter than that."
        )
    return None


def to_markdown(record: dict) -> str:
    summary = record["summary"]
    lines = [
        "# Register watch — subscriber record",
        "",
        f"**Tool:** `{record['tool']['name']}` v{record['tool']['version']}  ",
        f"**Generated:** {record['generated_at']}  ",
        f"**Window:** {record['window']['since']} .. {record['window']['until']}  ",
        f"**Sources:** {summary['sources']} "
        f"({len(summary['not_watched'])} not watched)",
        "",
        _accuracy_headline(record),
        "",
        f"> **{record['silence_caveat']}**",
        "",
        "## What this watch covers",
        "",
        record["coverage_statement"],
    ]
    if summary["not_watched"]:
        lines += [
            "",
            "**Carried in your subscription but NOT watched** — no alarm can fire "
            "for these, because there is not enough history to say what quiet "
            "would even mean:",
            "",
        ]
        lines += [f"- `{name}`" for name in summary["not_watched"]]
    lines += _accuracy_section(record)
    lines += [
        "",
        "## Sources",
        "",
        f"A source is flagged when it has published nothing for longer than its "
        f"own alarm threshold. "
        f'"no alert" means this watch did not fire — see the caveat above for '
        f"what that does and does not tell you.",
        "",
        "| Source | State | Last change | Alarms after | Typical gap | Longest ever |",
        "|---|---|---|---:|---:|---:|",
    ]
    for s in record["sources"]:
        lines.append(
            f"| `{s['source']}` | {s['state']} | {s['last_change'] or '—'} "
            f"| {_days(s['alarm_after_days'])} | {_days(s['typical_gap_days'])} "
            f"| {_days(s['longest_historical_gap_days'])} |"
        )
    notes = [(s["source"], s["practical_note"]) for s in record["sources"] if s["practical_note"]]
    if notes:
        lines += [
            "",
            "### Sources this watch does not usefully cover",
            "",
            "Listed here rather than left to be inferred from the threshold "
            "column, because a row reading \"no alert\" looks the same whether "
            "the watch is working or cannot fire:",
            "",
        ]
        lines += [f"- `{name}` — {note}" for name, note in notes]
    lines.append("")
    return "\n".join(lines)


def _days(value) -> str:
    return "—" if value is None else f"{value:g}d"


def _accuracy_headline(record: dict) -> str:
    figures = record.get("accuracy") or []
    if not figures:
        return "**Accuracy:** not measured for this watch."
    pairs = ", ".join(f"{f['metric']} {f['value']}" for f in figures)
    return (
        f"**Accuracy ({pairs}):** this watch misses most dormancy and reports "
        'late. See "How accurate this watch is" below.'
    )


def _accuracy_section(record: dict) -> list:
    figures = record.get("accuracy") or []
    lines = ["", "## How accurate this watch is", ""]
    if not figures:
        lines.append("No accuracy measurement is recorded for this watch.")
        return lines
    lines += [record["accuracy_statement"], ""]
    for fig in figures:
        lines += [
            f"**{fig['metric'].capitalize()}: {fig['value']}** "
            f"({fig['direction']}), measured {fig['measured']} on {fig['corpus']}.",
            "",
            f"- What it means for you: {fig['reads']}",
            f"- Why it is not the last word: {fig['caveat']}",
            f"- Derivation: `{fig['source']}`",
            "",
        ]
    return lines


def to_json(record: dict) -> str:
    return json.dumps(record, indent=2, sort_keys=True)
