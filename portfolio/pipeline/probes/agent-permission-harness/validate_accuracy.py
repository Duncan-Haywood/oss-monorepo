#!/usr/bin/env python3
"""A real, labeled accuracy measurement for the agent permission harness.

``test_harness.py`` already pins each rule's behaviour on synthetic
fixtures — at least one "fires" case and one "silent" case per rule — but its
test method names are not a corpus anyone can cite a count from, and counting
test methods to get an accuracy figure would itself be error-prone (some
methods assert something other than fire/silent; some rules get more than one
positive or negative case). This script instead defines an explicit, labeled
fixture corpus as *data* — ``CASES`` below — runs every case through
``harness.analyse()`` for real, and reports TP/FP/TN/FN against each case's
target rule.

**What this corpus is, plainly.** Every fixture here is an author-authored
regression fixture: either the exact synthetic workflow snippet already pinned
in ``test_harness.py`` (reused verbatim, and marked ``source="reused"``, so the
same file backs two things: the rule's *behaviour* is pinned in
``test_harness.py`` and the rule's *aggregate accuracy over that behaviour* is
measured here) or a new synthetic case exercising a shape the existing tests do
not already isolate (marked ``source="new"``). None of it is an independently
sourced or held-out corpus — every fixture was written by someone who already
knew which rule it was meant to trip, which is the opposite of an out-of-sample
test. Treat the resulting numbers as a **floor on precision/recall against
cases designed to exercise the rules that exist**, not as an estimate of
accuracy against real-world workflow files or against attack classes none of
the seven rules encodes. That second, larger, genuinely unmeasured gap is
stated in ``harness.render_markdown()``'s own disclosure text, not just here.

**R5 and R6 are posture, not defects** (see ``Finding.severity`` in
``harness.py``): R5 records an inherited write scope and R6 records the
privilege baseline an agent step runs with. Neither is a claim that something
is exploitable, so a "false positive" there does not mean "wrongly flagged an
attacker path" the way it would for R1-R4 or R7. What is still meaningful, and
what this script actually measures uniformly across all seven rules, is
narrower: **does the rule fire exactly when its own documented structural
condition is present in the fixture, and stay silent exactly when it is
not?** That is an implementation-correctness question, not a real-world
security-accuracy claim, and every rule in this file — defect or posture —
admits it the same way, because every rule is a deterministic function of
structural, positively-named evidence (see ``harness.py``'s module docstring
and the per-rule docstrings; no rule infers a defect from an *absence* of
evidence). R7 is a defect rule but is a structural/enumeration check rather
than an injection check, and is included on the same footing as R1-R4 for that
reason — it is still "does this fire on the structural condition it names",
just not an injection payload.

Run:

    python3 validate_accuracy.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import harness  # noqa: E402
from test_harness import build_repo  # noqa: E402


@dataclass(frozen=True)
class Case:
    name: str
    workflows: dict[str, str]
    files: dict[str, str] | None
    rule: str
    should_fire: bool
    source: str  # "reused" (from test_harness.py) or "new"


# --------------------------------------------------------------------------
# R1 — missing referenced script
# --------------------------------------------------------------------------

_R1_GUARDED_WORKFLOW = """
    name: agent
    on: workflow_dispatch
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - run: |
              chmod +x .github/scripts/prepare.sh 2>/dev/null || true
              if [[ -f .github/scripts/prepare.sh ]]; then
                .github/scripts/prepare.sh
              fi
    """

_R1_UNGUARDED_WORKFLOW = """
    name: agent
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: scripts/build.py
    """

_R1_NEW_GUARDED_BIN_WORKFLOW = """
    name: agent
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: |
              bin/deploy.sh 2>/dev/null || true
    """

_R1_NEW_EXISTS_TOOLS_WORKFLOW = """
    name: agent
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: tools/check.py
    """

R1_CASES = [
    Case(
        "R1 fires on a guarded reference to a script absent from the repo",
        {"a.yml": _R1_GUARDED_WORKFLOW}, None,
        "R1-missing-referenced-script", True, "reused",
    ),
    Case(
        "R1 silent when the guarded script actually exists",
        {"a.yml": _R1_GUARDED_WORKFLOW},
        {".github/scripts/prepare.sh": "#!/bin/sh\necho hi\n"},
        "R1-missing-referenced-script", False, "reused",
    ),
    Case(
        "R1 fires on an unguarded reference to a script absent from the repo",
        {"a.yml": _R1_UNGUARDED_WORKFLOW}, None,
        "R1-missing-referenced-script", True, "reused",
    ),
    Case(
        "R1 fires on a guarded bin/ reference absent from the repo",
        {"a.yml": _R1_NEW_GUARDED_BIN_WORKFLOW}, None,
        "R1-missing-referenced-script", True, "new",
    ),
    Case(
        "R1 silent when a tools/ reference exists",
        {"a.yml": _R1_NEW_EXISTS_TOOLS_WORKFLOW},
        {"tools/check.py": "print('x')\n"},
        "R1-missing-referenced-script", False, "new",
    ),
]

# --------------------------------------------------------------------------
# R2 — static output delimiter
# --------------------------------------------------------------------------

_R2_FIRE_CAT = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: |
              {
                echo "body<<PROMPT_EOF"
                cat "$PROMPT_PATH"
                echo "PROMPT_EOF"
              } >> "$GITHUB_OUTPUT"
    """

_R2_SILENT_LITERAL = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: |
              SOMEVAR=1
              {
                echo "body<<EOF"
                echo "a fixed line"
                echo "EOF"
              } >> "$GITHUB_OUTPUT"
    """

_R2_SILENT_RANDOM_DELIM = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: |
              DELIM="EOF_${RANDOM}"
              {
                echo "body<<${DELIM}"
                cat file.txt
                echo "${DELIM}"
              } >> "$GITHUB_OUTPUT"
    """

_R2_NEW_FIRE_CMD_SUBST = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: |
              {
                echo "body<<RESULT_EOF"
                echo "$(git rev-parse HEAD)"
                echo "RESULT_EOF"
              } >> "$GITHUB_OUTPUT"
    """

_R2_NEW_SILENT_ENV_LITERAL = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: |
              {
                echo "VAR<<EOF"
                echo "literal"
                echo "EOF"
              } >> "$GITHUB_ENV"
    """

R2_CASES = [
    Case(
        "R2 fires on file content behind a fixed delimiter into GITHUB_OUTPUT",
        {"a.yml": _R2_FIRE_CAT}, None,
        "R2-static-output-delimiter", True, "reused",
    ),
    Case(
        "R2 silent when the delimited content is literal",
        {"a.yml": _R2_SILENT_LITERAL}, None,
        "R2-static-output-delimiter", False, "reused",
    ),
    Case(
        "R2 silent when the delimiter is generated per run",
        {"a.yml": _R2_SILENT_RANDOM_DELIM}, None,
        "R2-static-output-delimiter", False, "reused",
    ),
    Case(
        "R2 fires on command substitution behind a fixed delimiter",
        {"a.yml": _R2_NEW_FIRE_CMD_SUBST}, None,
        "R2-static-output-delimiter", True, "new",
    ),
    Case(
        "R2 silent on literal content behind a fixed delimiter into GITHUB_ENV",
        {"a.yml": _R2_NEW_SILENT_ENV_LITERAL}, None,
        "R2-static-output-delimiter", False, "new",
    ),
]

# --------------------------------------------------------------------------
# R3 — untrusted expression spliced into a run body
# --------------------------------------------------------------------------

_R3_FIRE_ISSUE_COMMENT = """
    name: demo
    on: issue_comment
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: echo "${{ github.event.comment.body }}"
    """

_R3_SILENT_ENV_INDIRECTION = """
    name: demo
    on: issue_comment
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - env:
              BODY: ${{ github.event.comment.body }}
            run: echo "$BODY"
    """

_R3_SILENT_TRUSTED_CONTEXT = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: echo "${{ github.sha }}"
    """

_R3_NEW_FIRE_PR_TARGET_BODY = """
    name: demo
    on: pull_request_target
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: echo "${{ github.event.pull_request.body }}"
    """

_R3_NEW_SILENT_DISPATCH_INPUT = """
    name: demo
    on: workflow_dispatch
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: echo "${{ github.event.inputs.foo }}"
    """

R3_CASES = [
    Case(
        "R3 fires when issue-comment body is spliced into a run body",
        {"a.yml": _R3_FIRE_ISSUE_COMMENT}, None,
        "R3-untrusted-expression-in-run", True, "reused",
    ),
    Case(
        "R3 silent when the value is passed through env instead",
        {"a.yml": _R3_SILENT_ENV_INDIRECTION}, None,
        "R3-untrusted-expression-in-run", False, "reused",
    ),
    Case(
        "R3 silent on a trusted context (github.sha)",
        {"a.yml": _R3_SILENT_TRUSTED_CONTEXT}, None,
        "R3-untrusted-expression-in-run", False, "reused",
    ),
    Case(
        "R3 fires when a pull_request_target body is spliced into a run body",
        {"a.yml": _R3_NEW_FIRE_PR_TARGET_BODY}, None,
        "R3-untrusted-expression-in-run", True, "new",
    ),
    Case(
        "R3 silent on a workflow_dispatch input (not in the untrusted-context list)",
        {"a.yml": _R3_NEW_SILENT_DISPATCH_INPUT}, None,
        "R3-untrusted-expression-in-run", False, "new",
    ),
]

# --------------------------------------------------------------------------
# R4 — unpinned third-party action in a privileged job
# --------------------------------------------------------------------------

_R4_FIRE_TAG_WITH_SECRET = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: amondnet/vercel-action@v25
            with:
              vercel-token: ${{ secrets.VERCEL_TOKEN }}
    """

_R4_FIRE_WRITE_SCOPE_NO_SECRET = """
    name: demo
    on: push
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - uses: pnpm/action-setup@v4
    """

_R4_SILENT_SHA_PINNED = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
            with:
              token: ${{ secrets.T }}
    """

_R4_SILENT_FIRST_PARTY = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: actions/checkout@v4
            with:
              token: ${{ secrets.T }}
    """

_R4_SILENT_NO_SECRET_NO_WRITE = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: pnpm/action-setup@v4
    """

_R4_NEW_FIRE_BRANCH_REF = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: someorg/someaction@main
            with:
              token: ${{ secrets.TOK }}
    """

_R4_NEW_SILENT_GITHUB_OWNER = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: github/codeql-action/analyze@v3
            with:
              token: ${{ secrets.TOK }}
    """

R4_CASES = [
    Case(
        "R4 fires on a tag-pinned third-party action holding a secret",
        {"a.yml": _R4_FIRE_TAG_WITH_SECRET}, None,
        "R4-unpinned-third-party-action", True, "reused",
    ),
    Case(
        "R4 fires without a secret when the job holds a write scope",
        {"a.yml": _R4_FIRE_WRITE_SCOPE_NO_SECRET}, None,
        "R4-unpinned-third-party-action", True, "reused",
    ),
    Case(
        "R4 silent on a SHA-pinned third-party action",
        {"a.yml": _R4_SILENT_SHA_PINNED}, None,
        "R4-unpinned-third-party-action", False, "reused",
    ),
    Case(
        "R4 silent on a first-party action (actions/*)",
        {"a.yml": _R4_SILENT_FIRST_PARTY}, None,
        "R4-unpinned-third-party-action", False, "reused",
    ),
    Case(
        "R4 silent when the job holds neither a secret nor a write scope",
        {"a.yml": _R4_SILENT_NO_SECRET_NO_WRITE}, None,
        "R4-unpinned-third-party-action", False, "reused",
    ),
    Case(
        "R4 fires on a branch ref (not just a semver tag) holding a secret",
        {"a.yml": _R4_NEW_FIRE_BRANCH_REF}, None,
        "R4-unpinned-third-party-action", True, "new",
    ),
    Case(
        "R4 silent on the other first-party owner (github/*)",
        {"a.yml": _R4_NEW_SILENT_GITHUB_OWNER}, None,
        "R4-unpinned-third-party-action", False, "new",
    ),
]

# --------------------------------------------------------------------------
# R5 — inherited write permission (posture)
# --------------------------------------------------------------------------

_R5_FIRE_INHERITS = """
    name: demo
    on: push
    permissions:
      contents: write
    jobs:
      needs-it:
        permissions:
          contents: write
        steps:
          - run: git push
      does-not:
        steps:
          - run: echo hi
    """

_R5_SILENT_READ_ONLY_FLOOR = """
    name: demo
    on: push
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - run: echo hi
    """

_R5_NEW_SILENT_OWN_MATCHING_BLOCK = """
    name: demo
    on: push
    permissions:
      contents: write
    jobs:
      run:
        permissions:
          contents: write
        steps:
          - run: git push
    """

_R5_NEW_FIRE_WRITE_ALL = """
    name: demo
    on: push
    permissions: write-all
    jobs:
      run:
        steps:
          - run: echo hi
    """

R5_CASES = [
    Case(
        "R5 fires when a job without its own block inherits a write floor",
        {"a.yml": _R5_FIRE_INHERITS}, None,
        "R5-inherited-write-permission", True, "reused",
    ),
    Case(
        "R5 silent when the file-level floor is read-only",
        {"a.yml": _R5_SILENT_READ_ONLY_FLOOR}, None,
        "R5-inherited-write-permission", False, "reused",
    ),
    Case(
        "R5 silent when the job declares its own block, even if it matches the floor",
        {"a.yml": _R5_NEW_SILENT_OWN_MATCHING_BLOCK}, None,
        "R5-inherited-write-permission", False, "new",
    ),
    Case(
        "R5 fires under the write-all shorthand",
        {"a.yml": _R5_NEW_FIRE_WRITE_ALL}, None,
        "R5-inherited-write-permission", True, "new",
    ),
]

# --------------------------------------------------------------------------
# R6 — agent step holds repository write scope (posture)
# --------------------------------------------------------------------------

_R6_FIRE_KNOWN_ACTION_WRITE = """
    name: demo
    on: workflow_dispatch
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
            with:
              prompt: hello
    """

_R6_SILENT_KNOWN_ACTION_READ = """
    name: demo
    on: workflow_dispatch
    permissions:
      contents: read
    jobs:
      run:
        steps:
          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
            with:
              prompt: hello
    """

_R6_NEW_FIRE_TASK_INPUT = """
    name: demo
    on: workflow_dispatch
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - uses: someorg/customrunner@v2
            with:
              task: do the thing
    """

_R6_NEW_SILENT_WRITE_NO_AGENT = """
    name: demo
    on: push
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - run: npm test
    """

R6_CASES = [
    Case(
        "R6 fires when a known agent action runs with a write scope",
        {"a.yml": _R6_FIRE_KNOWN_ACTION_WRITE}, None,
        "R6-agent-holds-write-scope", True, "reused",
    ),
    Case(
        "R6 silent when the same agent action runs without a write scope",
        {"a.yml": _R6_SILENT_KNOWN_ACTION_READ}, None,
        "R6-agent-holds-write-scope", False, "reused",
    ),
    Case(
        "R6 fires via the prompt-input signal (task:) on an unknown action, with write scope",
        {"a.yml": _R6_NEW_FIRE_TASK_INPUT}, None,
        "R6-agent-holds-write-scope", True, "new",
    ),
    Case(
        "R6 silent when the job holds a write scope but runs no agent step at all",
        {"a.yml": _R6_NEW_SILENT_WRITE_NO_AGENT}, None,
        "R6-agent-holds-write-scope", False, "new",
    ),
]

# --------------------------------------------------------------------------
# R7 — agent instruction closure exceeds the prompt input
# --------------------------------------------------------------------------

_R7_WORKFLOW = """
    name: agent
    on: workflow_dispatch
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - run: cat .github/prompts/work.md
          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
            with:
              prompt: ${{ steps.p.outputs.body }}
    """

_R7_PROMPT = """
    Read `CLAUDE.md` first, then each venture's `AGENTS.md`
    and `ventures/<name>/VENTURE.yaml`.
    """

_R7_NOT_AN_AGENT_WORKFLOW = """
    name: not-an-agent
    on: push
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - run: cat .github/prompts/work.md
    """

_R7_NEW_EMPTY_CLOSURE_PROMPT = "Do good work and be careful.\n"

_R7_NEW_MULTI_PROMPT_WORKFLOW = """
    name: agent
    on: workflow_dispatch
    permissions:
      contents: write
    jobs:
      run:
        steps:
          - run: cat .github/prompts/one.md
          - run: cat .github/prompts/two.md
          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
            with:
              prompt: ${{ steps.p.outputs.body }}
    """

R7_CASES = [
    Case(
        "R7 fires when the closure resolves to more files than the prompt itself",
        {"a.yml": _R7_WORKFLOW},
        {
            ".github/prompts/work.md": _R7_PROMPT,
            "CLAUDE.md": "x",
            "ventures/alpha/AGENTS.md": "x",
            "ventures/alpha/VENTURE.yaml": "x",
            "ventures/beta/VENTURE.yaml": "x",
        },
        "R7-agent-instruction-closure", True, "reused",
    ),
    Case(
        "R7 silent when the workflow runs no agent step",
        {"a.yml": _R7_NOT_AN_AGENT_WORKFLOW},
        {".github/prompts/work.md": _R7_PROMPT, "CLAUDE.md": "x"},
        "R7-agent-instruction-closure", False, "reused",
    ),
    Case(
        "R7 silent when the prompt names no resolvable paths (empty closure)",
        {"a.yml": _R7_WORKFLOW},
        {".github/prompts/work.md": _R7_NEW_EMPTY_CLOSURE_PROMPT},
        "R7-agent-instruction-closure", False, "new",
    ),
    Case(
        "R7 fires and sums the closure across more than one prompt file",
        {"a.yml": _R7_NEW_MULTI_PROMPT_WORKFLOW},
        {
            ".github/prompts/one.md": "Read `CLAUDE.md`.\n",
            ".github/prompts/two.md": "Also read `README.md`.\n",
            "CLAUDE.md": "x",
            "README.md": "x",
        },
        "R7-agent-instruction-closure", True, "new",
    ),
]

CASES: list[Case] = (
    R1_CASES + R2_CASES + R3_CASES + R4_CASES + R5_CASES + R6_CASES + R7_CASES
)

#: Every rule id this corpus is meant to exercise, for a test to check against.
RULE_TITLES_CHECK: set[str] = set(harness.RULE_TITLES)


def run_case(case: Case) -> str:
    """Classify one case as TP / FP / TN / FN relative to its target rule."""
    with tempfile.TemporaryDirectory() as raw:
        root = build_repo(Path(raw), case.workflows, case.files)
        findings = harness.analyse(root)
    fired = case.rule in {f.rule for f in findings}
    if case.should_fire:
        return "TP" if fired else "FN"
    return "FP" if fired else "TN"


def measure() -> dict:
    """Run every case and return the aggregate counts, plus the per-case detail."""
    per_case = {}
    counts = {"TP": 0, "FP": 0, "TN": 0, "FN": 0}
    for case in CASES:
        outcome = run_case(case)
        per_case[case.name] = {
            "rule": case.rule,
            "should_fire": case.should_fire,
            "source": case.source,
            "outcome": outcome,
        }
        counts[outcome] += 1

    tp, fp, tn, fn = counts["TP"], counts["FP"], counts["TN"], counts["FN"]
    positive_opportunities = tp + fn  # cases where the rule was meant to fire
    return {
        "total_cases": len(CASES),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": (tp / (tp + fp)) if (tp + fp) else None,
        "recall": (tp / (tp + fn)) if (tp + fn) else None,
        "positive_opportunities": positive_opportunities,
        "per_case": per_case,
    }


def main() -> int:
    result = measure()
    print(json.dumps(result, indent=2))
    print(
        f"\n{result['total_cases']} fixture cases "
        f"({result['tp']} TP, {result['fp']} FP, {result['tn']} TN, {result['fn']} FN)"
    )
    if result["fp"] == 0 and result["fn"] == 0:
        print(
            "0 false positives, 0 false negatives on this fixture corpus "
            f"({result['positive_opportunities']} positive-rule opportunities)."
        )
    else:
        print(
            f"{result['fp']} false positives, {result['fn']} false negatives "
            f"out of {result['positive_opportunities']} positive-rule opportunities."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
