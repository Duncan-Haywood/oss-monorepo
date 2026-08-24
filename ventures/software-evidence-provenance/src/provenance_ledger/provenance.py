"""Turn a release's build inputs into a reproducible evidence bundle, and later
reproduce it.

The failure mode this exists to catch is the quiet one in a release review: a
reviewer signs off on "the manifest, the lockfile, and the artifact" without a
record of *which exact bytes* those were, so a month later nobody can say
whether the thing that shipped is the thing that was reviewed. A green checkmark
is easy to produce; "here is the SHA-256 of every input I looked at, and here is
the one I could not resolve" is not -- and that gap is where a swapped
dependency or a rebuilt artifact slips through unnoticed.

So `build_bundle` records the content hash of every input the customer names,
and every derived check is `pass` / `fail` / `unresolved` -- an input that is
missing, unreadable, or was never given an expected hash is reported as exactly
that, never folded into a generic "ok". `verify_bundle` re-hashes the same
inputs later and reports each one as reproduced / changed / missing /
unresolved, and the overall status is `reproduced` only when every input
reproduced.

This module never fetches anything over the network, never runs a build, never
signs anything, and never asserts that a release is secure, correctly licensed,
or compliant. It records what a set of local files and their hashes show. A
`source.commit` is recorded as a customer-supplied reference and is explicitly
*not* verified against any repository -- nothing here contacts a code host.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Bump only on a breaking change to the bundle shape; `verify_bundle` reads it.
BUNDLE_VERSION = 1

# Read files in bounded chunks so a large artifact never has to sit in memory
# whole just to be hashed.
_HASH_CHUNK_BYTES = 1024 * 1024

PASS = "pass"
FAIL = "fail"
UNRESOLVED = "unresolved"

# Per-input reproduction outcomes.
REPRODUCED = "reproduced"
CHANGED = "changed"
MISSING = "missing"

# Overall verify statuses. `reproduced` is the only one that means "every input
# matched"; the rest each name a specific reason reproduction did not complete.
STATUS_REPRODUCED = "reproduced"
STATUS_CHANGED = "changed"
STATUS_INCOMPLETE = "incomplete"
STATUS_INCONCLUSIVE = "inconclusive"

_LIMITATIONS = [
    "This bundle records the SHA-256 and stat of the input files it was given. "
    "It does not prove those inputs are complete, uncorrupted, unmodified at "
    "their source, or free of vulnerabilities, and it is not a bill of "
    "materials, a signature, or a license or security conclusion.",
    "source.commit and source.url are recorded as customer-supplied references. "
    "Nothing here contacts a code host, so a recorded commit is not verified "
    "to exist, to match the artifact, or to be the commit the artifact was "
    "built from.",
    "A check is only ever about inputs the descriptor named. A role that was "
    "not described is reported as unresolved, never as passing -- an absent "
    "input is not evidence that nothing is missing.",
    "The customer remains responsible for the release decision and for any "
    "security, licensing, or compliance conclusion drawn from these facts.",
]


def _hash_file(path: Path) -> dict[str, Any]:
    """Stat and SHA-256 one file. Never raises on customer-supplied input.

    Returns a mapping with `exists`, and when the file exists and is readable,
    `size_bytes`, `sha256`, and `modified_at`. A path that is missing, is a
    directory, or cannot be read comes back with `sha256: None` and a `note`
    rather than an exception -- the caller reports it as unresolved.
    """
    try:
        if not path.exists():
            return {"exists": False, "sha256": None, "note": "file does not exist"}
        if not path.is_file():
            return {
                "exists": True,
                "sha256": None,
                "note": "path exists but is not a regular file",
            }
        digest = hashlib.sha256()
        size = 0
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(_HASH_CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                digest.update(chunk)
        stat = path.stat()
        modified_at = datetime.fromtimestamp(
            stat.st_mtime, tz=timezone.utc
        ).isoformat(timespec="seconds")
        return {
            "exists": True,
            "size_bytes": size,
            "sha256": digest.hexdigest(),
            "modified_at": modified_at,
        }
    except OSError as exc:
        return {"exists": True, "sha256": None, "note": f"could not read file: {exc}"}


def _record_input(entry: Any, base_dir: Path) -> dict[str, Any]:
    """Resolve, hash, and describe one descriptor input. Never raises."""
    if not isinstance(entry, dict):
        return {
            "role": None,
            "path": None,
            "resolved": False,
            "sha256": None,
            "hash_match": UNRESOLVED,
            "note": f"input entry is {type(entry).__name__}, expected a mapping",
        }

    role = entry.get("role")
    path_str = entry.get("path")
    declared = entry.get("declared_sha256")

    record: dict[str, Any] = {
        "role": role,
        "path": path_str,
        "declared_sha256": declared,
    }

    if not path_str or not isinstance(path_str, str):
        record.update(
            {
                "resolved": False,
                "sha256": None,
                "hash_match": UNRESOLVED,
                "note": "input has no usable `path`",
            }
        )
        return record

    stat = _hash_file(base_dir / path_str)
    record["resolved"] = bool(stat.get("sha256"))
    record["exists"] = stat.get("exists", False)
    for key in ("size_bytes", "sha256", "modified_at", "note"):
        if key in stat:
            record[key] = stat[key]

    if not record.get("sha256"):
        record["hash_match"] = UNRESOLVED
    elif not declared:
        # We hashed it, but the customer gave nothing to check the hash
        # against. That is an unverified observation, not a passed check.
        record["hash_match"] = UNRESOLVED
    elif str(declared).strip().lower() == record["sha256"]:
        record["hash_match"] = "matched"
    else:
        record["hash_match"] = "mismatch"

    return record


def _roll_up(states: list[str]) -> str:
    """Combine per-input check states into one check state.

    fail dominates (a known-bad input is bad regardless of the rest); otherwise
    a check is `pass` only when there is at least one input and none is
    unresolved. An empty or all-unresolved set is `unresolved`, never `pass` --
    the module never turns "nothing to check" into a green result.
    """
    if not states:
        return UNRESOLVED
    if FAIL in states:
        return FAIL
    if all(state == PASS for state in states):
        return PASS
    return UNRESOLVED


def _derive_checks(inputs: list[dict[str, Any]], source: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    commit = source.get("commit")
    checks.append(
        {
            "name": "source_commit_recorded",
            "state": PASS if commit else UNRESOLVED,
            "detail": (
                f"source.commit recorded as {commit!r} (not verified against any "
                "repository)"
                if commit
                else "no source.commit was provided"
            ),
        }
    )

    present_states = [PASS if inp.get("exists") else FAIL for inp in inputs]
    missing = [inp.get("path") for inp in inputs if not inp.get("exists")]
    checks.append(
        {
            "name": "all_inputs_present",
            "state": _roll_up(present_states),
            "detail": (
                "every named input file exists"
                if not missing
                else f"missing input file(s): {', '.join(str(p) for p in missing)}"
            ),
        }
    )

    declared_states = [
        PASS if inp["hash_match"] == "matched" else FAIL
        for inp in inputs
        if inp.get("declared_sha256")
    ]
    mismatched = [
        inp.get("path") for inp in inputs if inp.get("hash_match") == "mismatch"
    ]
    checks.append(
        {
            "name": "declared_hashes_matched",
            "state": _roll_up(declared_states),
            "detail": (
                "no input carried a declared_sha256 to check"
                if not declared_states
                else (
                    "every declared_sha256 matched the file on disk"
                    if not mismatched
                    else f"declared_sha256 mismatch on: {', '.join(str(p) for p in mismatched)}"
                )
            ),
        }
    )

    for role in ("manifest", "lockfile", "artifact"):
        described = [inp for inp in inputs if inp.get("role") == role]
        state = _roll_up([PASS if inp.get("exists") else FAIL for inp in described])
        checks.append(
            {
                "name": f"{role}_present",
                "state": state,
                "detail": (
                    f"no input with role '{role}' was described"
                    if not described
                    else (
                        f"{role} input present"
                        if state == PASS
                        else f"{role} input described but missing on disk"
                    )
                ),
            }
        )

    return checks


def build_bundle(descriptor: Any, base_dir: str | Path = ".") -> dict[str, Any]:
    """Build a reproducible evidence bundle from a release descriptor.

    `descriptor` (all customer-supplied; nothing is fetched or inferred):
      release: str -- a human label for the release, e.g. "acme-api@1.4.2"
      source: {commit: str, url: str} | null -- recorded references, never fetched
      inputs: [ {role: str, path: str, declared_sha256: str | null}, ... ]

    The returned bundle is deterministic given the same file contents: it embeds
    no wall-clock time (`generated_at` is null; the CLI stamps the run
    separately) and reproduction is anchored on content hashes, not mtimes.
    Malformed input is recorded under `problems`, never raised.
    """
    base = Path(base_dir)
    problems: list[str] = []

    if not isinstance(descriptor, dict):
        return {
            "bundle_version": BUNDLE_VERSION,
            "generated_at": None,
            "release": None,
            "source": {},
            "inputs": [],
            "checks": [],
            "problems": [f"descriptor must be a mapping, got {type(descriptor).__name__}"],
            "limitations": list(_LIMITATIONS),
        }

    release = descriptor.get("release")
    if not release:
        problems.append("descriptor has no `release` label")

    source = descriptor.get("source") or {}
    if not isinstance(source, dict):
        problems.append("`source` is not a mapping; treated as absent")
        source = {}

    raw_inputs = descriptor.get("inputs")
    if not isinstance(raw_inputs, list) or not raw_inputs:
        problems.append("`inputs` must be a non-empty list")
        raw_inputs = []

    inputs = [_record_input(entry, base) for entry in raw_inputs]
    checks = _derive_checks(inputs, source)

    return {
        "bundle_version": BUNDLE_VERSION,
        "generated_at": None,
        "release": release,
        "source": {
            "commit": source.get("commit"),
            "url": source.get("url"),
            "verified": False,
        },
        "inputs": inputs,
        "checks": checks,
        "problems": problems,
        "limitations": list(_LIMITATIONS),
    }


def verify_bundle(bundle: Any, base_dir: str | Path = ".") -> dict[str, Any]:
    """Re-hash a bundle's inputs against the files on disk now, and report.

    Each input is `reproduced` (hash matches the bundle), `changed` (a hash is
    recorded but the file now differs), `missing` (the file is gone), or
    `unresolved` (the bundle never recorded a hash to compare). Overall status
    is `reproduced` only when there is at least one input and every one
    reproduced; a single changed input makes it `changed`; missing/unresolved
    with nothing changed makes it `incomplete`. It never reports `reproduced`
    off an absent or unhashed input.
    """
    base = Path(base_dir)

    if not isinstance(bundle, dict) or not isinstance(bundle.get("inputs"), list):
        return {
            "status": STATUS_INCONCLUSIVE,
            "release": None,
            "generated_at": None,
            "findings": [],
            "counts": {},
            "reasons": ["bundle is malformed or has no `inputs` list"],
            "limitations": list(_LIMITATIONS),
        }

    inputs = bundle["inputs"]
    findings: list[dict[str, Any]] = []
    for inp in inputs:
        path_str = inp.get("path") if isinstance(inp, dict) else None
        recorded = inp.get("sha256") if isinstance(inp, dict) else None
        finding = {"role": inp.get("role") if isinstance(inp, dict) else None, "path": path_str}

        if not path_str or recorded is None:
            finding["outcome"] = UNRESOLVED
            finding["detail"] = "bundle recorded no hash for this input; nothing to reproduce"
            findings.append(finding)
            continue

        current = _hash_file(base / path_str)
        if not current.get("exists"):
            finding["outcome"] = MISSING
            finding["detail"] = "input file recorded in the bundle no longer exists"
        elif current.get("sha256") is None:
            finding["outcome"] = UNRESOLVED
            finding["detail"] = current.get("note", "file could not be read")
        elif current["sha256"] == recorded:
            finding["outcome"] = REPRODUCED
            finding["detail"] = "current file matches the recorded SHA-256"
        else:
            finding["outcome"] = CHANGED
            finding["detail"] = (
                f"recorded {recorded[:12]}…, on disk {current['sha256'][:12]}…"
            )
        findings.append(finding)

    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding["outcome"]] = counts.get(finding["outcome"], 0) + 1

    if not findings:
        status = STATUS_INCONCLUSIVE
    elif counts.get(CHANGED):
        status = STATUS_CHANGED
    elif counts.get(MISSING) or counts.get(UNRESOLVED):
        status = STATUS_INCOMPLETE
    elif counts.get(REPRODUCED) == len(findings):
        status = STATUS_REPRODUCED
    else:
        status = STATUS_INCONCLUSIVE

    return {
        "status": status,
        "release": bundle.get("release"),
        "generated_at": None,
        "findings": findings,
        "counts": counts,
        "reasons": _verify_reasons(status, counts),
        "limitations": list(_LIMITATIONS),
    }


def _verify_reasons(status: str, counts: dict[str, int]) -> list[str]:
    if status == STATUS_REPRODUCED:
        return ["every recorded input reproduced against the files on disk"]
    if status == STATUS_CHANGED:
        return [f"{counts.get(CHANGED, 0)} input(s) changed since the bundle was built"]
    if status == STATUS_INCOMPLETE:
        parts = []
        if counts.get(MISSING):
            parts.append(f"{counts[MISSING]} missing")
        if counts.get(UNRESOLVED):
            parts.append(f"{counts[UNRESOLVED]} unresolved")
        return [
            "reproduction is incomplete (" + ", ".join(parts) + "); "
            "this is not a reproduced result"
        ]
    return ["nothing to reproduce, or the bundle was malformed"]


def markdown_bundle(bundle: dict[str, Any]) -> str:
    lines = [
        "# Software evidence bundle",
        "",
        "A record of the input files examined for this release, not a security, "
        "license, or compliance conclusion.",
        "",
        f"**Release:** {bundle.get('release')}",
    ]
    source = bundle.get("source") or {}
    if source.get("commit"):
        lines.append(
            f"**Source commit (recorded, not verified):** `{source['commit']}`"
        )
        if source.get("url"):
            lines.append(f"**Source reference:** {source['url']}")
    lines.extend(["", "## Inputs", "", "| Role | Path | SHA-256 | Declared hash |", "|---|---|---|---|"])
    for inp in bundle.get("inputs", []):
        sha = inp.get("sha256")
        sha_cell = f"`{sha[:16]}…`" if sha else "_unresolved_"
        lines.append(
            f"| {inp.get('role')} | `{inp.get('path')}` | {sha_cell} | {inp.get('hash_match')} |"
        )
    lines.extend(["", "## Checks", "", "| Check | State | Detail |", "|---|---|---|"])
    for check in bundle.get("checks", []):
        lines.append(f"| {check['name']} | **{check['state']}** | {check['detail']} |")
    if bundle.get("problems"):
        lines.extend(["", "## Problems", ""])
        lines.extend(f"- {problem}" for problem in bundle["problems"])
    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {limit}" for limit in bundle.get("limitations", []))
    return "\n".join(lines) + "\n"


def markdown_verification(report: dict[str, Any]) -> str:
    lines = [
        "# Reproduction check",
        "",
        f"**Release:** {report.get('release')}",
        f"**Result: {report['status'].upper()}**",
        "",
    ]
    lines.extend(f"- {reason}" for reason in report.get("reasons", []))
    lines.extend(["", "## Inputs", "", "| Role | Path | Outcome | Detail |", "|---|---|---|---|"])
    for finding in report.get("findings", []):
        lines.append(
            f"| {finding.get('role')} | `{finding.get('path')}` | "
            f"**{finding['outcome']}** | {finding.get('detail', '')} |"
        )
    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {limit}" for limit in report.get("limitations", []))
    return "\n".join(lines) + "\n"
