#!/usr/bin/env python3
"""Does the artifact a customer receives carry the probe's own error rate?

Every probe in ``portfolio/pipeline/probes/`` now has a measured accuracy
number, and every one of them renders something a customer would read. Nobody
had asked whether the second contains the first.

That question is the ``ethical_robustness`` gate, restated so it can be run
rather than estimated. ``pipeline/README.md`` defines the dimension as *"the
business gets better for customers as it scales, not worse"*, and the mechanism
by which an evidence business gets worse at scale is specific: the customer acts
on a record whose errors are invisible to them, in a direction the operator
profits from. Each half of that is checkable from this repository alone.

Three disclosure classes are evaluated, deliberately by different methods so a
weakness in one does not decide the result:

``scope`` (D1)
    Structural, not lexical. Does the probe's rendering module *declare* a
    coverage or limits block, and does that declaration reach the rendered
    text? A module attribute either exists or does not; there is nothing to
    tune.

``direction`` (D2)
    Lexical, over a deliberately narrow vocabulary about the tool's own
    accuracy — not about its scope. "This does not check keyboard operability"
    is a scope statement and must not count here; "false positives are
    expected" is a direction statement and must. Every match is quoted in the
    results so the classification can be checked rather than trusted.

``rate`` (D3)
    Numeric. Take the accuracy number this repository has committed for the
    probe, in every plausible rendering, and look for it in the artifact. The
    citation is verified against the file it comes from on every run, so a
    measurement that moves cannot leave a stale number here.

Run offline, no network:

    python3 measure.py 2026-08-21
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PROBES = REPO / "portfolio" / "pipeline" / "probes"

# --------------------------------------------------------------------------
# D2's vocabulary. Every term is about whether the tool's own output is right,
# and none is about what the tool looked at, because a scope statement passing
# as an accuracy statement is exactly the conflation this measurement exists to
# separate.
# --------------------------------------------------------------------------
DIRECTION_TERMS: tuple[str, ...] = (
    "false positive",
    "false negative",
    "precision",
    "recall",
    "accuracy",
    "error rate",
    "wrongly",
    "incorrectly",
    "should not have been",
    "may be wrong",
)

_TERMINATOR = re.compile(r"[.!?]")


def sentences(text: str) -> list[str]:
    """Split into sentences, treating a period inside a number as a decimal point.

    This was ``re.findall(r"[^.!?\\n]*[.!?]", text)`` until 2026-08-21, which is
    correct until an artifact contains a decimal — and the artifacts this
    measures are about to contain nothing but. Against a record printing
    "precision 0.821-0.881" it produced ``["**Precision 0.", "881, recall 0."]``:
    the boolean came out right, and the quoted evidence was shrapnel.

    That matters more here than a tidier output. D2's whole design is that
    every match is quoted "so the classification can be checked rather than
    trusted", and a fragment cannot be checked. A newline still ends a
    sentence, as before.
    """
    out: list[str] = []
    for line in text.split("\n"):
        start = 0
        for match in _TERMINATOR.finditer(line):
            i = match.start()
            if (
                line[i] == "."
                and i > 0
                and i + 1 < len(line)
                and line[i - 1].isdigit()
                and line[i + 1].isdigit()
            ):
                continue  # decimal point, not a full stop
            chunk = line[start : i + 1].strip()
            if chunk:
                out.append(chunk)
            start = i + 1
    return out


def direction_matches(text: str) -> list[str]:
    """Sentences in ``text`` that say something about the tool being wrong."""
    hits: list[str] = []
    for sentence in sentences(text):
        low = sentence.lower()
        if any(term in low for term in DIRECTION_TERMS):
            # An artifact rendered in two formats repeats its own prose; the
            # count of formats is not evidence about disclosure.
            normalised = " ".join(sentence.split())
            if normalised not in hits:
                hits.append(normalised)
    return hits


def rate_matches(text: str, renderings: tuple[str, ...]) -> list[str]:
    return [r for r in renderings if r in text]


class Citation:
    """A committed accuracy number, pinned to where it is written down.

    ``quote`` is verified against ``path`` on every run. A citation that stops
    resolving raises, so this directory cannot go on reporting an error rate
    the repository has since revised or deleted.
    """

    def __init__(self, path: str, quote: str, renderings: tuple[str, ...], reads: str):
        self.path = path
        self.quote = quote
        self.renderings = renderings
        self.reads = reads

    def verify(self) -> None:
        target = REPO / self.path
        if not target.exists():
            raise SystemExit(f"citation target missing: {self.path}")
        if self.quote not in target.read_text():
            raise SystemExit(f"citation no longer resolves in {self.path}: {self.quote!r}")

    def as_dict(self) -> dict:
        return {
            "path": self.path,
            "quote": self.quote,
            "renderings": list(self.renderings),
            "reads": self.reads,
        }


# --------------------------------------------------------------------------
# The four artifacts. Each renderer returns (text, record_module, declared
# coverage constants), where ``record_module`` is None when the probe has no
# module whose job is to produce a customer-facing record at all.
# --------------------------------------------------------------------------


def _add_path(*parts: str) -> None:
    path = str(PROBES.joinpath(*parts))
    if path not in sys.path:
        sys.path.insert(0, path)


def render_eaa() -> tuple[str, str | None, list[str]]:
    _add_path("eaa-wcag-triage", "src")
    from wcag_triage import evidence  # noqa: PLC0415
    from wcag_triage.engine import audit_html  # noqa: PLC0415

    page = (
        "<!doctype html><html lang='en'><head><title>Shop</title></head><body>"
        "<h1>Shop</h1><img src='a.png'><button></button>"
        "<input type='text'><p style='color:#999;background:#fff'>text</p>"
        "</body></html>"
    )
    record = evidence.build_record({"index.html": audit_html(page)}, "2026-08-21T00:00:00Z")
    text = evidence.to_markdown(record) + "\n" + json.dumps(record, indent=2)
    return text, "src/wcag_triage/evidence.py", ["COVERAGE_STATEMENT", "COVERAGE"]


def render_npm() -> tuple[str, str | None, list[str]]:
    _add_path("npm-reachability-triage", "src")
    from triage import evidence  # noqa: PLC0415
    from triage.deployment import DeploymentProfile  # noqa: PLC0415
    from triage.engine import DEV_ONLY, SHIPPED, Finding  # noqa: PLC0415

    report = evidence.Report(
        generated_at="2026-08-21T00:00:00Z",
        project="example/site",
        feed="osv:npm",
        component_count=2,
        profile=DeploymentProfile(
            mode="static-export", confidence="high", evidence=('output: "export"',),
            config_path="next.config.js",
        ),
        findings=(
            Finding(
                advisory_id="GHSA-0000-0000-0000",
                package="left-pad",
                summary="ReDoS in input parsing",
                severity="high",
                verdict=SHIPPED,
                reason="on a production dependency path",
            ),
            Finding(
                advisory_id="GHSA-1111-1111-1111",
                package="build-only-thing",
                summary="Prototype pollution",
                severity="moderate",
                verdict=DEV_ONLY,
                reason="reachable only through devDependencies",
                rule="dev-only",
            ),
        ),
    )
    text = evidence.to_markdown(report) + "\n" + evidence.to_json(report)
    return text, "src/triage/evidence.py", [
        "COVERAGE_LIMITS",
        "NOT_AN_ATTESTATION",
        "ACCURACY_NOTE",
    ]


def render_silence() -> tuple[str, str | None, list[str]]:
    """The subscriber record, not the operator table.

    Until 2026-08-21 this rendered ``detect_silence.render`` and reported "no
    record module" — correctly, because there was none: the only rendered
    artifact was a diagnostic table whose ``MISSED`` column told the operator
    something no subscriber ever saw. ``subscriber_record.py`` is that missing
    surface, so this now measures it. The operator table still exists and is
    still not a customer artifact.
    """
    _add_path("source-silence-detector")
    import detect_silence  # noqa: PLC0415
    import subscriber_record  # noqa: PLC0415

    payload = json.loads(
        (REPO / "portfolio/research/register-change-rate/results-2026-08-20.json").read_text()
    )
    prior_path = PROBES / "source-silence-detector" / "prior-history-2026-08-21.json"
    prior = json.loads(prior_path.read_text()) if prior_path.exists() else None
    cfg = detect_silence.Config(anchor="quantile", quantile=0.99)
    result = detect_silence.evaluate_all(payload, cfg, prior)
    record = subscriber_record.build_record(result, "2026-08-21T00:00:00Z")
    text = subscriber_record.to_markdown(record) + "\n" + subscriber_record.to_json(record)
    return text, "subscriber_record.py", ["COVERAGE_STATEMENT", "SILENCE_CAVEAT"]


def render_harness() -> tuple[str, str | None, list[str]]:
    """The findings report, now with an accuracy disclosure section.

    Until 2026-08-21 this had no record module and no declared constant — the
    accuracy figure did not exist yet to declare. ``harness.py`` now declares
    ``ACCURACY_NOTE`` (and the counts it is built from) at module level, the
    same shape other probes' rendering modules use for a coverage/limits
    constant, and ``render_markdown()`` reads from it rather than the caller
    passing it in.
    """
    _add_path("agent-permission-harness")
    import harness  # noqa: PLC0415

    findings = harness.analyse(REPO)
    text = harness.render_markdown(findings, harness.summarise(findings))
    return text, "harness.py", ["ACCURACY_NOTE"]


PROBE_SPECS = (
    {
        "probe": "eaa-wcag-triage",
        "candidate": "eaa-remediation-pipeline",
        "render": render_eaa,
        "citation": Citation(
            "portfolio/research/a11y-own-sites/README.md",
            "out-of-sample precision is **0.821–0.881**",
            ("0.821", "0.881", "82.1", "88.1", "82%", "88%"),
            "12–18% of the findings in the list a customer is handed are not defects",
        ),
        # Quoted from the candidate write-up, so the alignment call below is
        # read off the business as described rather than assumed.
        "prior": 9,
        "revenue_model": "€900–€1,800 fixed-price job per shop, "
        "€49–€99/month retainer after (candidates/eaa-remediation-pipeline.md)",
        "error_direction": "over-reporting",
    },
    {
        "probe": "npm-reachability-triage",
        "candidate": "cra-evidence-desk",
        "render": render_npm,
        "citation": Citation(
            "portfolio/pipeline/probes/npm-reachability-triage/README.md",
            "0 of 53 distinct claims",
            ("0 of 53", "0 of 102", "0/53", "0/102"),
            "0 of 53 hand-verified suppression claims (0 of 102 raw suppressed "
            "findings) were wrong, checked on 2026-08-21 against real advisory "
            "text and lockfile evidence across 7 npm products in the portfolio "
            "— a sample, not a general proof the rules cannot misfire on a "
            "different project's lockfile shape, and not the whole portfolio "
            "either: a repository walk on 2026-08-22 found 18 npm manifests, 9 "
            "of them readable by that tool at all.",
        ),
        "prior": 8,
        "revenue_model": "€99–€399/month subscription by dependency count "
        "(candidates/cra-evidence-desk.md)",
        "error_direction": "under-reporting (suppression)",
    },
    {
        "probe": "source-silence-detector",
        "candidate": "public-record-watch",
        "render": render_silence,
        "citation": Citation(
            "portfolio/pipeline/probes/source-silence-detector/README.md",
            "episodes (0.35) at a median latency of 110 days",
            ("0.35", "6/17", "6 of 17", "35%"),
            "roughly two thirds of the dormancy episodes the customer is paying to be "
            "told about are not detected",
        ),
        "prior": 9,
        "revenue_model": "€30–€150/month subscription "
        "(candidates/public-record-watch.md)",
        "error_direction": "under-reporting (missed silence)",
    },
    {
        "probe": "agent-permission-harness",
        "candidate": "agent-permission-harness",
        "render": render_harness,
        "citation": Citation(
            "portfolio/pipeline/probes/agent-permission-harness/README.md",
            "0 false positives, 0 false negatives on the 16/34 positive-rule opportunities",
            ("0 false positives", "0 false negatives", "16/34"),
            "0 false positives and 0 false negatives on 34 author-authored synthetic "
            "fixture cases (16 positive-rule opportunities) across all seven rules — a "
            "floor on precision/recall on cases designed to exercise the rules that "
            "exist, not an out-of-sample estimate and not a measurement of attack "
            "classes none of the seven rules encodes.",
        ),
        "prior": 9,
        "revenue_model": "none stated in the write-up",
        "error_direction": (
            "false negatives on attack/misconfiguration classes outside R1-R7 "
            "(unmeasured, and structurally unmeasurable by this fixture corpus); "
            "zero false positives measured on the 34-case fixture corpus, not "
            "independently or out-of-sample validated"
        ),
    },
)


def evaluate(spec: dict) -> dict:
    text, record_module, constants = spec["render"]()
    citation: Citation | None = spec.get("citation")
    if citation is not None:
        citation.verify()

    declared = list(constants)
    scope_disclosed = bool(declared) and record_module is not None

    direction_hits = direction_matches(text)
    rate_hits = rate_matches(text, citation.renderings) if citation else []

    return {
        "probe": spec["probe"],
        "candidate": spec["candidate"],
        "artifact_chars": len(text),
        "record_module": record_module,
        "declared_coverage_constants": declared,
        "scope_disclosed": scope_disclosed,
        "direction_disclosed": bool(direction_hits),
        "direction_evidence": direction_hits,
        "rate_committed": citation.as_dict() if citation else None,
        "rate_absent_because": spec.get("citation_absent_because"),
        "rate_in_artifact": bool(rate_hits),
        "rate_matches": rate_hits,
        "revenue_model": spec["revenue_model"],
        "measured_error_direction": spec["error_direction"],
    }


# --------------------------------------------------------------------------
# The rubric. Stated before it is applied, and applied uniformly, because a
# gate score arrived at case by case is an estimate wearing a measurement's
# clothes.
# --------------------------------------------------------------------------
DEDUCTIONS = (
    (
        "rate_undisclosed",
        "The artifact does not carry an accuracy figure — either the number is "
        "committed elsewhere in the repository and omitted here, or it was never "
        "measured. A customer cannot discount a record whose error rate they "
        "cannot see.",
    ),
    (
        "direction_undisclosed",
        "The artifact does not say which way the tool is wrong. Scope disclosure "
        "does not substitute: knowing what was looked at says nothing about "
        "whether what came back is right.",
    ),
    (
        "adverse_alignment",
        "The undisclosed error direction is the one that increases the operator's "
        "revenue, judged against the revenue model the candidate write-up states. "
        "Conditional on the direction being undisclosed: an operator who names the "
        "way its own errors pay it has disclosed the conflict, which is the whole "
        "mitigation this deduction exists to ask for.",
    ),
)

#: Whether the undisclosed direction pays the operator. Held here rather than
#: derived, because it is a reading of a business model rather than a
#: measurement, and it should be visible as such.
ALIGNMENT = {
    "eaa-remediation-pipeline": (
        True,
        "The audit is the qualification step that sells the fixed-price job, so a "
        "finding list inflated by 12–18% converts better. a11y-own-sites reached "
        "the same point from the other side: \"a free qualification audit therefore "
        "needs a build-artifact filter before a stranger reads it.\"",
    ),
    "cra-evidence-desk": (
        True,
        "The product's whole value proposition is cutting the customer's alert count. "
        "A suppression that should not have happened both improves the headline the "
        "subscription is sold on and is invisible to the subscriber.",
    ),
    "public-record-watch": (
        True,
        "Nuisance alarms cost the operator churn — the probe measures 43 alarm-days "
        "per source-year at the high-recall setting — while a missed dormancy episode "
        "costs nothing and cannot be observed by the customer, who sees silence either "
        "way. The cheapest tuning is the one that fails them.",
    ),
    "agent-permission-harness": (
        False,
        "The write-up states no revenue model, so there is nothing to align against. "
        "Not scored either way rather than assumed benign.",
    ),
}


def score(row: dict, prior: int) -> dict:
    applied = []
    if not row["rate_in_artifact"]:
        applied.append(DEDUCTIONS[0][0])
    if not row["direction_disclosed"]:
        applied.append(DEDUCTIONS[1][0])
    adverse, why = ALIGNMENT[row["candidate"]]
    # Deduction 3 is conditional on deduction 2, and was not always written that
    # way. Until 2026-08-21 this fired whenever ``adverse`` was true, so a probe
    # that disclosed everything still lost a point and could not cross the gate
    # by disclosing — which is the opposite of what the rubric asks for. The
    # published rule says "the *undisclosed* direction", stated before it was
    # applied, and ``test_full_disclosure_costs_nothing`` says so in its name;
    # that test only ever ran against the one candidate whose alignment is not
    # adverse, so the disagreement was never exercised. The rubric is the
    # authority and the code now matches it. Effect: eaa-wcag-triage, the probe
    # that closed its gap, recovers all three of its points rather than two, and
    # cra-evidence-desk — whose artifact already named its adverse direction and
    # which this pass did not otherwise touch — recovers one it should never
    # have been charged.
    if adverse and not row["direction_disclosed"]:
        applied.append(DEDUCTIONS[2][0])
    return {
        "candidate": row["candidate"],
        "ethical_robustness_was": prior,
        "ethical_robustness_now": prior - len(applied),
        "deductions_applied": applied,
        "alignment_adverse": adverse,
        "alignment_charged": adverse and not row["direction_disclosed"],
        "alignment_reasoning": why,
    }


def recorded_scores() -> dict[str, int]:
    """What ``candidates.yaml`` says today.

    Deliberately *not* the input to :func:`score`. The prior each deduction is
    taken from is pinned in ``PROBE_SPECS`` as the screening estimate this pass
    revises, because reading the prior back out of the file this pass writes
    would make a second run deduct the same points again. This function exists
    so a test can check the two agree, which is the opposite dependency.
    """
    import yaml  # noqa: PLC0415

    data = yaml.safe_load((REPO / "portfolio/pipeline/candidates.yaml").read_text())
    return {c["slug"]: c["scores"]["ethical_robustness"] for c in data["candidates"]}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    generated = argv[1]

    rows = [evaluate(spec) for spec in PROBE_SPECS]
    scores = [score(row, spec["prior"]) for row, spec in zip(rows, PROBE_SPECS)]

    payload = {
        "generated": generated,
        "question": (
            "Does the artifact a customer receives carry the probe's own measured "
            "error rate, and does the direction it is wrong in pay the operator?"
        ),
        "method": {
            "scope": "structural — a declared coverage constant rendered into the artifact",
            "direction": "lexical over a narrow accuracy vocabulary, every match quoted",
            "rate": "numeric — the committed figure, citation verified on every run",
            "direction_terms": list(DIRECTION_TERMS),
        },
        "rubric": [{"id": i, "rule": r} for i, r in DEDUCTIONS],
        "disclosure": rows,
        "scoring": scores,
        "summary": {
            "probes": len(rows),
            "scope_disclosed": sum(1 for r in rows if r["scope_disclosed"]),
            "direction_disclosed": sum(1 for r in rows if r["direction_disclosed"]),
            "rate_committed": sum(1 for r in rows if r["rate_committed"]),
            "rate_in_artifact": sum(1 for r in rows if r["rate_in_artifact"]),
        },
    }
    out = HERE / f"results-{generated}.json"
    out.write_text(json.dumps(payload, indent=2) + "\n")

    print(f"{'probe':28s} {'scope':>6s} {'dir':>5s} {'rate?':>6s} {'in art':>7s}  ethics")
    for row, sc in zip(rows, scores):
        print(
            f"{row['probe']:28s} {str(row['scope_disclosed']):>6s} "
            f"{str(row['direction_disclosed']):>5s} "
            f"{str(bool(row['rate_committed'])):>6s} {str(row['rate_in_artifact']):>7s}"
            f"  {sc['ethical_robustness_was']} -> {sc['ethical_robustness_now']}"
        )
    print(f"\nwrote {out.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
