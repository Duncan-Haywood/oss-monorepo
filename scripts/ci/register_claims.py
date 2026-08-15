#!/usr/bin/env python3
r"""Makes a register's load-bearing prose a checked claim, and its `issue:` resolve.

Every register in this repository is machine-checked on its *counts* and unread
on its *sentences*. `scripts/ci/audit_exceptions.py` requires `reason` and
`compensating_control` to be non-empty and never reads a word of either;
`scripts/ci/image_tags.py` and `scripts/ci/sast_scan.py` require `issue` to be
present and never open the document it names. So the shape this repository keeps
finding — a required field that drifts while every count stays green — has been
sitting in the one place whose whole purpose is to hold an argument.

It had drifted. Measured at HEAD on 2026-08-06, before this control existed:

  * IMG-006 and IMG-007 said "Restricted to internal cluster admin access" of
    two `codercom/code-server` releases that each declare a public Traefik
    ingress with a Let's Encrypt production certificate — `code.marisstella.dev`
    and `opencode.marisstella.dev` — and are gated by a `PASSWORD` env var, not
    by the network. `scripts/ci/image_tags.py`'s own module docstring says so.
  * IMG-005 said "Every `helm_release` in `platform/terraform/` renders this
    chart". Five of fourteen do.
  * IMG-008 said overrides are "validated at deploy time". `variables.tf`
    contains no `validation` block at all.
  * IMG-010 said "The public site does not come from this image" of a manifest
    Argo CD syncs with `selfHeal`, behind the apex ingress, whose `:latest` tag
    `homepage-ci.yml` moves and calls the release in a comment.
  * EXC-007 said "Every one of the eight raises `AnalysisLoaderError`". Two do.
  * EXC-001 said "The generator itself is linted and typechecked". `docs-site`
    has no ESLint configuration and does not depend on ESLint, and the
    generator is a `.mjs` outside the tsconfig `include`.
  * EXC-013 said "the workflows unset the provider API keys before handing
    control to the agent". Two of the three do; the Claude one injects
    `ANTHROPIC_API_KEY` into the bypassed step and unsets it only when an OAuth
    token is also present.
  * Eight `issue:` values pointed at anchors that were never written:
    `docs/EXCEPTION-REGISTER.md#exc-011` … `#exc-014` and
    `docs/SAST.md#sast-001`, `#sast-002`, `#sast-004`, `#sast-005`.

None of that failed anything. Every count was correct the whole time.

# The pattern this extends

`platform/image-tag-exceptions.yaml` already carries the answer, in exactly one
of its ninety-odd entries. IMG-001 declares

    claims:
      no_build_path: true

and `image_release_path.verify_exception_claims` re-derives it, failing the gate
when an image the entry says nobody builds acquires a producer. That is the
right shape and this file does not invent a second one: it keeps the `claims:`
key, keeps `no_build_path` where it is derived, and adds a *declarative* form so
a claim can be written for a sentence whose evidence is a file rather than a
purpose-built analysis.

A declarative claim is a name mapped to a `sentence` plus exactly one predicate:

    claims:
      admin_access_is_not_network_restricted:
        sentence: >-
          reachable from the public internet
        present:
          path: platform/terraform/agent_platform.tf
          pattern: 'host\s*=\s*"code\.marisstella\.dev"'

Two properties make this hold rather than decorate:

  1. `sentence` must actually appear in the entry's own prose, compared with
     whitespace normalised. Without that the predicate and the paragraph drift
     apart and the claim becomes a second unread field — the failure this
     control exists to end, reproduced one level down.
  2. A predicate whose glob matches no tracked file FAILS. A vacuous glob is a
     passing gate; deleting the evidence must not be how a claim turns green.

Predicates, deliberately few:

  * `present`  — at least `at_least` (default 1) lines match `pattern`.
  * `absent`   — no line matches. The glob must still match a tracked file.
  * `count`    — exactly `equals` lines match.
  * `no_file`  — no tracked file matches the glob. The one case where absence
                 of a file is itself the evidence.
  * `precedes` — every one of exactly `equals` lines matching `after` has a line
                 matching `before` within `within` lines above it. This is the
                 shape "each suppression sits behind a guard", which no
                 line-at-a-time predicate can say.

Paths are globbed against `git ls-files`, never the filesystem. A control that
walks the working tree counts the developer's build output and reports a
different number in a clean clone.

# The other half: `issue:` must resolve

An `issue:` is the link between an accepted exception and the plan to remove it.
Four controls require the field and none has ever opened it, so eight of them
named sections nobody wrote. This resolves each one: the file must be tracked,
and a `#fragment` must match the GitHub-style slug of a heading in it.

Usage:
    python3 scripts/ci/register_claims.py           # audit, exit 1 on failure
    python3 scripts/ci/register_claims.py --report  # measure, always exit 0
    python3 scripts/ci/register_claims.py --json    # machine-readable
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

# The least number of checked claims this repository must carry. A floor, not a
# ceiling: it exists so the remedy for a claim that went red can never be to
# delete the claim. Watched in the RISING direction by
# `scripts/ci/cap_ratchet.py` — lowering it is the weakening, and is refused
# there rather than argued here.
MIN_CHECKED_CLAIMS = 14


class ClaimError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass(frozen=True)
class RegisterSpec:
    """A register, where its entries live, and which fields hold its argument.

    `prose_fields` is what a `sentence` is checked against. It is per-register
    because the registers disagree: the exception and image registers argue in
    `reason` plus `compensating_control`, the SAST baseline in `reason` alone,
    and the kill-criteria register in `missing_signal`.
    """

    path: str
    entries_key: str
    prose_fields: Tuple[str, ...]
    #: Whether the document itself carries a top-level `issue:` to resolve.
    document_issue: bool = False


REGISTERS: Tuple[RegisterSpec, ...] = (
    RegisterSpec(
        path="platform/exception-register.yaml",
        entries_key="exceptions",
        prose_fields=("reason", "compensating_control"),
    ),
    RegisterSpec(
        path="platform/image-tag-exceptions.yaml",
        entries_key="exceptions",
        prose_fields=("reason", "compensating_control"),
    ),
    RegisterSpec(
        path="platform/sast-baseline.yaml",
        entries_key="baseline",
        prose_fields=("reason",),
    ),
    RegisterSpec(
        path="portfolio/kill-criteria-register.yaml",
        entries_key="gaps",
        prose_fields=("missing_signal",),
        document_issue=True,
    ),
)


@dataclass(frozen=True)
class DerivedClaim:
    """A claim whose evidence is an analysis, not a regex, and who computes it.

    `no_build_path` is the precedent this file extends. Its truth is "does any
    workflow in this repository build the image this manifest names", which is
    `image_release_path`'s whole subject and is not expressible as a pattern.
    So it stays there and is named here, and `derived_by` is checked to still
    mention it — a delegation nothing verifies is how a claim comes to be
    checked by neither side.
    """

    name: str
    derived_by: str
    why: str


DERIVED_CLAIMS: Tuple[DerivedClaim, ...] = (
    DerivedClaim(
        name="no_build_path",
        derived_by="scripts/ci/image_release_path.py",
        why=(
            "whether an image the entry says nobody builds has acquired a producer; "
            "re-derived by `verify_exception_claims`, which already walks every "
            "workflow to answer it"
        ),
    ),
)

@dataclass(frozen=True)
class Enrollment:
    """An entry whose sentence was found false, and the claim that caught it.

    `MIN_CHECKED_CLAIMS` is an aggregate and an aggregate has slack: with 27
    claims standing, deleting one entry's still leaves the floor met. That is
    the move this refuses. Every id below is a sentence that was live and untrue
    on 2026-08-06 — the places where the temptation to clear a red by deleting
    the claim is concentrated, because the claim is the only thing that ever
    noticed.

    Earned one entry at a time, deliberately, rather than "every entry must
    carry a claim": a blanket rule would be a region in which the claim may
    quietly be untrue, and would push the next author toward a decorative
    predicate to satisfy it.
    """

    register: str
    entry_id: str
    claim: str
    why: str


ENROLLED: Tuple[Enrollment, ...] = (
    Enrollment(
        register="platform/image-tag-exceptions.yaml",
        entry_id="IMG-005",
        claim="helm_releases_rendering_this_chart",
        why="said every `helm_release` renders this chart; five of fourteen do",
    ),
    Enrollment(
        register="platform/image-tag-exceptions.yaml",
        entry_id="IMG-006",
        claim="ingress_is_public",
        why="said 'internal cluster admin access' of a public `code.marisstella.dev`",
    ),
    Enrollment(
        register="platform/image-tag-exceptions.yaml",
        entry_id="IMG-007",
        claim="ingress_is_public",
        why="the same sentence, on a public `opencode.marisstella.dev`",
    ),
    Enrollment(
        register="platform/image-tag-exceptions.yaml",
        entry_id="IMG-008",
        claim="validation_refuses_a_moving_tag",
        why=(
            "claimed a deploy-time validation `variables.tf` did not contain, then "
            "recorded that absence as an `absent` claim until 2026-08-16, when the "
            "validation was written and the claim went red as designed; this is its "
            "successor and asserts the rule is still there"
        ),
    ),
    Enrollment(
        register="platform/image-tag-exceptions.yaml",
        entry_id="IMG-010",
        claim="argocd_reconciles_this_manifest",
        why=(
            "said the public site does not come from this image, of a manifest Argo "
            "CD syncs with `selfHeal` behind the apex ingress"
        ),
    ),
    Enrollment(
        register="platform/exception-register.yaml",
        entry_id="EXC-001",
        claim="no_lint_config_exists",
        why=(
            "said the generator is linted, in a venture with no ESLint configuration "
            "and no ESLint dependency"
        ),
    ),
    Enrollment(
        register="platform/exception-register.yaml",
        entry_id="EXC-007",
        claim="every_ignore_sits_behind_a_raising_guard",
        why="said all eight raise `AnalysisLoaderError`; two do",
    ),
    Enrollment(
        register="platform/exception-register.yaml",
        entry_id="EXC-013",
        claim="claude_unsets_unconditionally",
        why=(
            "said all three workflows unset the provider key; the Claude one unset "
            "it only when an OAuth token was also present until 2026-08-16, when the "
            "unset became unconditional and `claude_unset_is_conditional` went red "
            "as designed; this is its successor"
        ),
    ),
)


PREDICATE_KINDS = ("present", "absent", "count", "no_file", "precedes")

#: Fields a claim mapping may carry beside its single predicate.
CLAIM_META_FIELDS = ("sentence",)

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


@dataclass
class Finding:
    severity: str  # "error"
    code: str
    where: str
    message: str
    remedy: str

    def format_line(self) -> str:
        return f"[ERROR] {self.where}\n        {self.message}\n        → {self.remedy}"


@dataclass
class Measurement:
    """What the audit saw, for `--report` and for the tests."""

    checked_claims: int = 0
    derived_claims: int = 0
    entries: int = 0
    issue_refs: int = 0
    claims_by_entry: Dict[str, List[str]] = field(default_factory=dict)


def tracked_files(repo_root: Path) -> List[str]:
    """Tracked paths only.

    `git ls-files` rather than a filesystem walk: a claim must not be satisfiable
    by an untracked file on one machine, and a control that reads the working
    tree reports a different number in a clean clone than in a developer's.
    """
    env = {
        **os.environ,
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_NOSYSTEM": "1",
    }
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise ClaimError(
            "git ls-files failed; this control reads tracked paths and cannot "
            "fall back to the working tree without changing what it measures: "
            + result.stderr.decode("utf-8", "replace").strip()
        )
    return [name for name in result.stdout.decode("utf-8").split("\0") if name]


def glob_tracked(tracked: Sequence[str], pattern: str) -> List[str]:
    """fnmatch over tracked paths, where `*` also crosses `/`.

    Same semantics as the `path` glob in `platform/exception-register.yaml`, so
    a claim's glob and its entry's glob mean the same thing.
    """
    return sorted(name for name in tracked if fnmatch.fnmatch(name, pattern))


def read_lines(repo_root: Path, relative: str) -> List[str]:
    try:
        return (repo_root / relative).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise ClaimError(f"{relative} could not be read as UTF-8 text: {error}")


def normalise(text: str) -> str:
    """Collapse whitespace so a folded YAML scalar compares as one sentence.

    A `>-` block re-wraps whenever anyone reflows the file, so comparing raw
    text would make a claim fail on a line break. Case is preserved: the
    sentences name identifiers, and `AnalysisLoaderError` is not
    `analysisloadererror`.
    """
    return " ".join(text.split())


def slugify_heading(text: str) -> str:
    """GitHub's anchor slug for a Markdown heading.

    Backticks, punctuation and colons are dropped, spaces become hyphens. This
    is what makes `## Next 30 days: prove releases and operations` reachable as
    `#next-30-days-prove-releases-and-operations`.
    """
    slug = text.strip().lower()
    slug = slug.replace("`", "")
    slug = re.sub(r"[^\w\s-]", "", slug, flags=re.UNICODE)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug


def heading_slugs(lines: Sequence[str]) -> List[str]:
    slugs: List[str] = []
    fenced = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            fenced = not fenced
            continue
        if fenced:
            continue
        match = HEADING_RE.match(line)
        if match:
            slugs.append(slugify_heading(match.group(2)))
    return slugs


def compile_pattern(where: str, name: str, raw: Any) -> re.Pattern:
    if not isinstance(raw, str) or not raw:
        raise ClaimError(f"{where}: claim `{name}` needs a non-empty regex")
    try:
        return re.compile(raw)
    except re.error as error:
        raise ClaimError(f"{where}: claim `{name}` has an invalid regex: {error}")


def matching_lines(
    repo_root: Path, files: Sequence[str], pattern: re.Pattern
) -> List[str]:
    """Locations of every line matching `pattern`, one entry per line.

    Per line, not per match: a claim reads as a statement about places in the
    source, and two matches on one line are one place.
    """
    hits: List[str] = []
    for relative in files:
        for number, line in enumerate(read_lines(repo_root, relative), start=1):
            if pattern.search(line):
                hits.append(f"{relative}:{number}")
    return hits


def _require_int(where: str, name: str, spec: Dict[str, Any], key: str, default: Any):
    if key not in spec:
        if default is None:
            raise ClaimError(f"{where}: claim `{name}` is missing `{key}`")
        return default
    value = spec[key]
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ClaimError(
            f"{where}: claim `{name}` `{key}` must be a non-negative integer"
        )
    return value


def evaluate_predicate(
    repo_root: Path,
    tracked: Sequence[str],
    where: str,
    name: str,
    kind: str,
    spec: Any,
) -> Optional[str]:
    """Return a failure sentence, or None when the claim holds.

    Raises `ClaimError` for a predicate that is malformed rather than false. A
    claim nobody can evaluate is not a claim that passed.
    """
    if not isinstance(spec, dict):
        raise ClaimError(f"{where}: claim `{name}` `{kind}` must be a mapping")
    glob = spec.get("path")
    if not isinstance(glob, str) or not glob:
        raise ClaimError(f"{where}: claim `{name}` needs a `path` glob")
    files = glob_tracked(tracked, glob)

    if kind == "no_file":
        if spec.keys() - {"path"}:
            raise ClaimError(
                f"{where}: claim `{name}` `no_file` takes only `path`; "
                f"got {sorted(spec.keys() - {'path'})}"
            )
        if files:
            return (
                f"claims no tracked file matches `{glob}`, but "
                f"{len(files)} does: {', '.join(files[:5])}"
            )
        return None

    # Every other predicate reads files, so an empty glob is a claim with no
    # evidence behind it. Passing it would make deleting the evidence the
    # cheapest way to turn a red claim green.
    if not files:
        return (
            f"`{glob}` matches no tracked file, so the predicate has nothing to "
            "read. An unevaluable claim is not a claim that holds"
        )

    if kind == "precedes":
        before = compile_pattern(where, name, spec.get("before"))
        after = compile_pattern(where, name, spec.get("after"))
        within = _require_int(where, name, spec, "within", None)
        expected = _require_int(where, name, spec, "equals", None)
        seen = 0
        unguarded: List[str] = []
        for relative in files:
            lines = read_lines(repo_root, relative)
            for index, line in enumerate(lines):
                if not after.search(line):
                    continue
                seen += 1
                window = lines[max(0, index - within) : index]
                if not any(before.search(candidate) for candidate in window):
                    unguarded.append(f"{relative}:{index + 1}")
        problems = []
        if seen != expected:
            problems.append(
                f"expected {expected} site(s) matching `{after.pattern}` under "
                f"`{glob}`, found {seen}"
            )
        if unguarded:
            problems.append(
                f"{len(unguarded)} of them have no line matching "
                f"`{before.pattern}` within {within} line(s) above: "
                + ", ".join(unguarded[:5])
            )
        return "; ".join(problems) if problems else None

    pattern = compile_pattern(where, name, spec.get("pattern"))
    hits = matching_lines(repo_root, files, pattern)

    if kind == "present":
        at_least = _require_int(where, name, spec, "at_least", 1)
        if len(hits) < at_least:
            return (
                f"expected at least {at_least} line(s) matching "
                f"`{pattern.pattern}` under `{glob}`, found {len(hits)}"
            )
        return None

    if kind == "absent":
        if hits:
            return (
                f"expected no line matching `{pattern.pattern}` under `{glob}`, "
                f"found {len(hits)}: {', '.join(hits[:5])}"
            )
        return None

    if kind == "count":
        expected = _require_int(where, name, spec, "equals", None)
        if len(hits) != expected:
            return (
                f"expected exactly {expected} line(s) matching "
                f"`{pattern.pattern}` under `{glob}`, found {len(hits)}"
                + (f": {', '.join(hits[:5])}" if hits else "")
            )
        return None

    raise ClaimError(f"{where}: claim `{name}` has unknown predicate `{kind}`")


def entry_prose(entry: Dict[str, Any], spec: RegisterSpec) -> str:
    return normalise(
        " ".join(str(entry.get(field_name) or "") for field_name in spec.prose_fields)
    )


def check_claims(
    repo_root: Path,
    tracked: Sequence[str],
    spec: RegisterSpec,
    entry: Dict[str, Any],
    identifier: str,
    measurement: Measurement,
) -> List[Finding]:
    where = f"{spec.path} ({identifier})"
    claims = entry.get("claims")
    if claims is None:
        return []
    if not isinstance(claims, dict):
        return [
            Finding(
                severity="error",
                code="malformed-claims",
                where=where,
                message="`claims` must be a mapping of claim name to predicate",
                remedy=(
                    "Write `claims: {<name>: {sentence: ..., <predicate>: {...}}}`, "
                    "or `<name>: true` for a claim listed in DERIVED_CLAIMS."
                ),
            )
        ]

    derived_by_name = {claim.name: claim for claim in DERIVED_CLAIMS}
    findings: List[Finding] = []

    for name, value in claims.items():
        # The derived form the `claims:` key was introduced with. Its evidence
        # lives in another module; all this file checks is that the module still
        # names it, so the delegation cannot outlive the deriver.
        if name in derived_by_name:
            derived = derived_by_name[name]
            measurement.derived_claims += 1
            measurement.claims_by_entry.setdefault(identifier, []).append(name)
            deriver = repo_root / derived.derived_by
            if not deriver.is_file():
                findings.append(
                    Finding(
                        severity="error",
                        code="deriver-missing",
                        where=where,
                        message=(
                            f"claim `{name}` is derived by {derived.derived_by}, "
                            "which does not exist"
                        ),
                        remedy=(
                            "Restore the deriver or make the claim declarative. A "
                            "claim whose checker is gone is checked by nobody."
                        ),
                    )
                )
            elif name not in deriver.read_text(encoding="utf-8"):
                findings.append(
                    Finding(
                        severity="error",
                        code="deriver-stale",
                        where=where,
                        message=(
                            f"claim `{name}` is registered as derived by "
                            f"{derived.derived_by}, which no longer mentions it"
                        ),
                        remedy=(
                            "Re-derive the claim there, or move it to a declarative "
                            "predicate here. Delegation to a module that dropped the "
                            "claim leaves it checked by neither side."
                        ),
                    )
                )
            continue

        if not isinstance(value, dict):
            findings.append(
                Finding(
                    severity="error",
                    code="unknown-claim",
                    where=where,
                    message=(
                        f"claim `{name}` is `{value!r}`, but it is not in "
                        "DERIVED_CLAIMS and carries no predicate"
                    ),
                    remedy=(
                        "A bare value is only accepted for a claim another control "
                        "re-derives. Give this one a `sentence` and one of "
                        f"{', '.join(PREDICATE_KINDS)}, or register the deriver."
                    ),
                )
            )
            continue

        measurement.checked_claims += 1
        measurement.claims_by_entry.setdefault(identifier, []).append(name)

        kinds = [kind for kind in PREDICATE_KINDS if kind in value]
        unknown = set(value) - set(PREDICATE_KINDS) - set(CLAIM_META_FIELDS)
        if unknown:
            findings.append(
                Finding(
                    severity="error",
                    code="unknown-claim-field",
                    where=where,
                    message=f"claim `{name}` has unrecognised field(s): "
                    + ", ".join(sorted(unknown)),
                    remedy=(
                        "A misspelled predicate is a claim that checks nothing. "
                        f"Use one of {', '.join(PREDICATE_KINDS)}."
                    ),
                )
            )
            continue
        if len(kinds) != 1:
            findings.append(
                Finding(
                    severity="error",
                    code="ambiguous-claim",
                    where=where,
                    message=(
                        f"claim `{name}` declares {len(kinds)} predicates "
                        f"({', '.join(kinds) or 'none'}); exactly one is required"
                    ),
                    remedy=(
                        "Split it into two named claims. One name, one predicate, "
                        "so a failure says which half of the sentence went false."
                    ),
                )
            )
            continue

        sentence = value.get("sentence")
        if not isinstance(sentence, str) or not sentence.strip():
            findings.append(
                Finding(
                    severity="error",
                    code="claim-without-sentence",
                    where=where,
                    message=f"claim `{name}` has no `sentence`",
                    remedy=(
                        "Quote the words from `reason` or `compensating_control` "
                        "that this predicate stands behind. A predicate bound to no "
                        "prose leaves the prose exactly as unread as before."
                    ),
                )
            )
        elif normalise(sentence) not in entry_prose(entry, spec):
            findings.append(
                Finding(
                    severity="error",
                    code="sentence-not-in-prose",
                    where=where,
                    message=(
                        f"claim `{name}` quotes “{normalise(sentence)}”, which "
                        f"appears in none of: {', '.join(spec.prose_fields)}"
                    ),
                    remedy=(
                        "Make the quote an exact substring of the entry's own "
                        "argument. If the prose was edited, edit the claim with it "
                        "— a claim that drifts off its sentence checks nothing the "
                        "reader is reading."
                    ),
                )
            )

        try:
            failure = evaluate_predicate(
                repo_root, tracked, where, name, kinds[0], value[kinds[0]]
            )
        except ClaimError as error:
            findings.append(
                Finding(
                    severity="error",
                    code="malformed-claim",
                    where=where,
                    message=str(error),
                    remedy="Fix the predicate. An unevaluable claim is not a pass.",
                )
            )
            continue
        if failure:
            findings.append(
                Finding(
                    severity="error",
                    code="claim-false",
                    where=where,
                    message=f"claim `{name}` no longer holds: {failure}",
                    remedy=(
                        "The entry's argument has stopped being true. Correct the "
                        "sentence and the predicate together, or remove the "
                        "exception the argument was buying. Do not delete the claim "
                        "— that is the state this control was written to end."
                    ),
                )
            )
    return findings


def check_issue(
    repo_root: Path,
    tracked_set: frozenset,
    where: str,
    raw: Any,
    measurement: Measurement,
) -> List[Finding]:
    if raw is None:
        return []
    measurement.issue_refs += 1
    reference = str(raw).strip()
    if not reference:
        return []
    if reference.startswith(("http://", "https://")):
        return [
            Finding(
                severity="error",
                code="unresolvable-issue",
                where=where,
                message=f"issue `{reference}` is a URL this control cannot open",
                remedy=(
                    "Point at a tracked document and heading in this repository. An "
                    "off-repo link is a reference nothing here can keep honest."
                ),
            )
        ]

    document, _, fragment = reference.partition("#")
    if document not in tracked_set:
        return [
            Finding(
                severity="error",
                code="dangling-issue-document",
                where=where,
                message=f"issue `{reference}` names `{document}`, which is not tracked",
                remedy=(
                    "Point at a file that exists. The issue is the link between an "
                    "accepted exception and the plan to remove it; when it resolves "
                    "to nothing there is no plan."
                ),
            )
        ]
    if not fragment:
        return []

    slugs = heading_slugs(read_lines(repo_root, document))
    if fragment.lower() not in slugs:
        return [
            Finding(
                severity="error",
                code="dangling-issue-anchor",
                where=where,
                message=(
                    f"issue `{reference}` names an anchor `{document}` does not "
                    f"contain; it has {len(slugs)} heading(s), none slugging to "
                    f"`{fragment}`"
                ),
                remedy=(
                    f"Write the section, or repoint the reference at a heading that "
                    "exists. An anchor nobody wrote reads as a filed plan and is not "
                    "one."
                ),
            )
        ]
    return []


def audit(repo_root: Path) -> Tuple[List[Finding], Measurement]:
    tracked = tracked_files(repo_root)
    tracked_set = frozenset(tracked)
    findings: List[Finding] = []
    measurement = Measurement()

    for spec in REGISTERS:
        path = repo_root / spec.path
        if not path.is_file():
            raise ClaimError(
                f"{spec.path} is missing. This control reads it; a register that is "
                "not there is a failure, not an empty result."
            )
        try:
            document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as error:
            raise ClaimError(f"{spec.path} is not valid YAML: {error}") from error
        if not isinstance(document, dict):
            raise ClaimError(f"{spec.path} must be a mapping")

        if spec.document_issue:
            findings.extend(
                check_issue(
                    repo_root,
                    tracked_set,
                    f"{spec.path} (document)",
                    document.get("issue"),
                    measurement,
                )
            )

        entries = document.get(spec.entries_key)
        if entries is None:
            raise ClaimError(f"{spec.path} has no `{spec.entries_key}` list")
        if not isinstance(entries, list):
            raise ClaimError(f"{spec.path}: `{spec.entries_key}` must be a list")

        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise ClaimError(f"{spec.path}: entry[{index}] must be a mapping")
            measurement.entries += 1
            identifier = str(
                entry.get("id")
                or entry.get("venture")
                or entry.get("criterion")
                or f"entry[{index}]"
            )
            findings.extend(
                check_issue(
                    repo_root,
                    tracked_set,
                    f"{spec.path} ({identifier})",
                    entry.get("issue"),
                    measurement,
                )
            )
            findings.extend(
                check_claims(
                    repo_root, tracked, spec, entry, identifier, measurement
                )
            )

    for enrollment in ENROLLED:
        declared = measurement.claims_by_entry.get(enrollment.entry_id)
        if declared is None:
            findings.append(
                Finding(
                    severity="error",
                    code="enrolled-entry-missing",
                    where=f"{enrollment.register} ({enrollment.entry_id})",
                    message=(
                        f"is enrolled for claim `{enrollment.claim}` but the entry "
                        "carries no claims, or no longer exists"
                    ),
                    remedy=(
                        f"This entry {enrollment.why}. If the exception is gone, "
                        "remove its ENROLLED row in the same change and say so; if "
                        "it is still here, restore the claim."
                    ),
                )
            )
        elif enrollment.claim not in declared:
            findings.append(
                Finding(
                    severity="error",
                    code="enrolled-claim-removed",
                    where=f"{enrollment.register} ({enrollment.entry_id})",
                    message=(
                        f"no longer declares `{enrollment.claim}`; it declares "
                        + ", ".join(sorted(declared))
                    ),
                    remedy=(
                        f"This entry {enrollment.why}, and that claim is what caught "
                        "it. Deleting a claim to clear a red returns the sentence to "
                        "being unread. Correct the entry instead."
                    ),
                )
            )

    total = measurement.checked_claims + measurement.derived_claims
    if total < MIN_CHECKED_CLAIMS:
        findings.append(
            Finding(
                severity="error",
                code="claims-below-floor",
                where="platform/ (registers)",
                message=(
                    f"{total} checked claim(s) across the registers, below the floor "
                    f"of {MIN_CHECKED_CLAIMS}"
                ),
                remedy=(
                    "Restore the claim that was removed. The floor exists so the "
                    "remedy for a claim that went red can never be to delete it; "
                    "lowering it is refused by `scripts/ci/cap_ratchet.py`."
                ),
            )
        )
    return findings, measurement


def build_report(measurement: Measurement) -> str:
    lines = ["=== Register claims ==="]
    lines.append(
        f"{measurement.checked_claims} declarative + {measurement.derived_claims} "
        f"derived claim(s) over {measurement.entries} entries "
        f"(floor {MIN_CHECKED_CLAIMS})."
    )
    lines.append(f"{measurement.issue_refs} `issue:` reference(s) resolved.")
    for identifier in sorted(measurement.claims_by_entry):
        lines.append(
            f"  {identifier}: {', '.join(sorted(measurement.claims_by_entry[identifier]))}"
        )
    return "\n".join(lines)


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check register claims and `issue:` references."
    )
    parser.add_argument("--report", action="store_true", help="Measure, exit 0.")
    parser.add_argument("--json", action="store_true", help="Emit findings as JSON.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        findings, measurement = audit(REPO_ROOT)
    except ClaimError as error:
        print(f"[ERROR] {error}", file=sys.stderr)
        return 1

    if args.report:
        print(build_report(measurement))
        return 0

    if args.json:
        print(json.dumps([asdict(finding) for finding in findings], indent=2))
    else:
        print("=== Register Claim Audit ===")
        if not findings:
            print(build_report(measurement))
        else:
            for finding in findings:
                print(finding.format_line())
            print()
            print(f"{len(findings)} issue(s).")

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
