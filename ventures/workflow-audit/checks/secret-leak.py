#!/usr/bin/env python3
"""Find two documented ways a secret reaches GitHub Actions logs unmasked.

    python3 check.py                       # scan .github/workflows under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --format sarif        # SARIF 2.1.0, for github/codeql-action/upload-sarif
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## Why this is not the same question as "did I `echo` a secret"

GitHub Actions already masks the literal value of a declared `secrets.*` (or
an `env:` var sourced from one) everywhere it appears verbatim in a job's log
output -- including inside `set -x` trace output. Flagging a plain
`run: echo ${{ secrets.TOKEN }}` would mostly be reporting a risk the
platform has already closed. This tool instead checks the two well-documented
ways a secret's value reaches a log or a later step *unmasked*, because both
survive GitHub's own masking by construction:

**1. `transformed-secret`** -- GitHub's own documentation states masking does
not survive a transformation: base64, hex, case-folding, URL-encoding, a
substring, or any other re-encoding produces a *different* string than the
one the runner knows to mask, so the encoded/decoded form prints in plain
text. A `run:` step that pipes a secret-derived value into `base64`,
`openssl`, `xxd`, `basenc`, `iconv`, `tr`, `rev`, or takes a shell substring
of it (`${VAR:offset:len}`) hits this every time, regardless of whether the
result is echoed immediately or captured for later use.

**2. `unmasked-env-export`** -- a value written to `$GITHUB_ENV`,
`$GITHUB_OUTPUT`, or `$GITHUB_STATE` is exported for later steps to read, but
writing it there does not register it with the runner's masking list. Only
the *original* declared secret is auto-masked; a derived or freshly-fetched
token (an OAuth token minted using a secret, a signed URL, a session
cookie) is not a known secret to the runner at all and prints in plain text
the moment any later step echoes it -- unless the workflow calls
`::add-mask::` on it first, which GitHub's own guidance recommends for
exactly this case.

## What this tool actually does, and does not do

A static, read-only, step-scoped line scanner over `.github/workflows/*.yml`
and `*.yaml` files already on disk. It makes **no network calls of any
kind**. It is not a YAML parser (a small indentation-aware scan, the same
design choice `actions-injection-check` and `pinned-actions-check` make and
document) and it does not execute anything it finds. A clean scan is not a
security audit: both patterns have variants a regex/indentation scan cannot
see -- a transform run in a separate step from the one that received the
secret, a custom action that re-exports a secret internally, or a
transformation spelled with a tool this tool does not know about.

## Classification

  - `transformed-secret` -- within one step, a secret-derived value
    (`${{ secrets.* }}` inline, or a step/job `env:` var sourced from one) is
    piped or passed into a text-transforming command in that same step's
    `run:` block.
  - `unmasked-env-export` -- within one step, a secret-derived value is
    written to `$GITHUB_ENV`, `$GITHUB_OUTPUT`, or `$GITHUB_STATE`, and no
    `::add-mask::` line appears anywhere in that same step's `run:` block.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

TRANSFORMED_SECRET = "transformed-secret"
UNMASKED_ENV_EXPORT = "unmasked-env-export"

RISK_CLASSIFICATIONS = frozenset({TRANSFORMED_SECRET, UNMASKED_ENV_EXPORT})

_STEP_ITEM_RE = re.compile(r"^(?P<indent>\s*)-\s")
_ENV_HEADER_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?env:\s*(?:#.*)?$")
_ENV_ENTRY_RE = re.compile(r"^(?P<indent>\s*)([A-Za-z_][A-Za-z0-9_]*):\s*(?P<value>.*)$")

_RUN_BLOCK_START_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?run:\s*[|>][+-]?\s*(?:#.*)?$")
_RUN_SINGLE_RE = re.compile(r"^(?P<indent>\s*)(?:-\s*)?run:\s*(?P<value>.+)$")

_INLINE_SECRET_RE = re.compile(r"\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}")

# Utilities and shell constructs that re-encode text such that GitHub's
# exact-string secret masking no longer matches the result. Word-bounded so
# "tr" and "rev" don't match inside an unrelated identifier.
_TRANSFORM_RE = re.compile(
    r"\bbase64\b|\bopenssl\s+(?:base64|enc)\b|\bxxd\b|\bbasenc\b|\biconv\b|\btr\b|\brev\b"
    r"|\$\{[A-Za-z_][A-Za-z0-9_]*:[0-9]"  # ${VAR:offset...} substring expansion
)

_ENV_FILE_TARGET_RE = re.compile(r'>>\s*"?\$(?:\{)?(GITHUB_ENV|GITHUB_OUTPUT|GITHUB_STATE)(?:\})?"?')

_ADD_MASK_RE = re.compile(r"::add-mask::")


def line_indent(line):
    return len(line) - len(line.lstrip(" "))


def _inline_secret_names(value):
    return bool(_INLINE_SECRET_RE.search(value))


def _collect_steps(lines):
    """Split a workflow file's lines into per-step chunks.

    Returns a list of (start_line_index, end_line_index) 0-based, half-open
    ranges, one per `steps:` list item found anywhere in the file (jobs are
    not distinguished -- a step's env/run pairing never crosses a step
    boundary, so job boundaries do not need to be tracked separately).
    """
    steps = []
    current_start = None
    current_indent = None
    for i, line in enumerate(lines):
        if line.strip() == "":
            continue
        indent = line_indent(line)
        item = _STEP_ITEM_RE.match(line)
        # A new step item at the same indent as the current step's marker
        # closes the current step. A line at a *lesser* indent than the
        # step's own body closes it too (end of the steps: list).
        if current_start is not None:
            if item and indent == current_indent:
                steps.append((current_start, i))
                current_start = i
            elif indent < current_indent:
                steps.append((current_start, i))
                current_start = None
                current_indent = None
        if current_start is None and item:
            # Heuristic: a step item is a mapping with a name:/id:/uses:/run:
            # key, distinguishing it from an arbitrary list item elsewhere
            # (e.g. a matrix value). Cheap enough check for this file class.
            rest = line[item.end():]
            if re.match(r"(?:name|id|uses|run|env|if|with|shell)\s*:", rest):
                current_start = i
                current_indent = indent
    if current_start is not None:
        steps.append((current_start, len(lines)))
    return steps


def _step_secret_env_vars(lines, start, end):
    """Env var names this step's own `env:` block sources from `secrets.*`."""
    names = set()
    # None: not in an env: block. "learning": just saw the header, indent of
    # the first entry line below it sets the block's indent. An int: the
    # established indent of entries in the current env: block.
    env_indent = None
    for i in range(start, end):
        line = lines[i]
        if line.strip() == "":
            continue
        indent = line_indent(line)

        if env_indent == "learning":
            env_indent = indent  # first entry line establishes the indent
        elif env_indent is not None and indent < env_indent:
            env_indent = None

        if env_indent is not None and env_indent != "learning":
            entry = _ENV_ENTRY_RE.match(line)
            if entry and "secrets." in entry.group("value"):
                names.add(entry.group(2))
            continue

        if _ENV_HEADER_RE.match(line):
            env_indent = "learning"
    return names


def _run_block_lines(lines, start, end):
    """(run_text_lines, first_lineno) for this step's run: block, or (None, None)."""
    for i in range(start, end):
        line = lines[i]
        block = _RUN_BLOCK_START_RE.match(line)
        if block:
            block_indent = len(block.group("indent"))
            body = []
            j = i + 1
            while j < end:
                if lines[j].strip() == "":
                    body.append((j, lines[j]))
                    j += 1
                    continue
                if line_indent(lines[j]) <= block_indent:
                    break
                body.append((j, lines[j]))
                j += 1
            return body
        single = _RUN_SINGLE_RE.match(line)
        if single:
            return [(i, line)]
    return []


def _references_secret(line, secret_env_names):
    if _inline_secret_names(line):
        return True
    for name in secret_env_names:
        if re.search(rf"\$\{{?{re.escape(name)}\}}?\b", line):
            return True
    return False


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of finding dicts."""
    findings = []
    lines = text.splitlines()

    for start, end in _collect_steps(lines):
        secret_env_names = _step_secret_env_vars(lines, start, end)
        run_lines = _run_block_lines(lines, start, end)
        if not run_lines:
            continue
        run_text = "\n".join(text for _, text in run_lines)
        has_mask = bool(_ADD_MASK_RE.search(run_text))

        for lineno0, line in run_lines:
            if line.strip().startswith("#"):
                continue
            references_secret = _references_secret(line, secret_env_names)
            if not references_secret:
                continue
            if _TRANSFORM_RE.search(line):
                findings.append(
                    {
                        "file": filename,
                        "line": lineno0 + 1,
                        "type": TRANSFORMED_SECRET,
                        "detail": line.strip(),
                        "remediation": (
                            "GitHub's log masking matches the secret's exact string only -- "
                            "transforming it (base64/hex/case/substring) produces a different "
                            "string that prints unmasked. Avoid re-encoding a secret in a step "
                            "whose output is logged, or explicitly `::add-mask::` the transformed "
                            "value before it can be printed."
                        ),
                    }
                )
            if _ENV_FILE_TARGET_RE.search(line) and not has_mask:
                target = _ENV_FILE_TARGET_RE.search(line).group(1)
                findings.append(
                    {
                        "file": filename,
                        "line": lineno0 + 1,
                        "type": UNMASKED_ENV_EXPORT,
                        "detail": f"{line.strip()}  ({target})",
                        "remediation": (
                            f"Writing to ${target} does not register the value with the "
                            "runner's masking list -- only a declared secrets.* value is "
                            "auto-masked. Add `echo \"::add-mask::$VALUE\"` before this line so "
                            "later steps that print it don't leak it in plain text."
                        ),
                    }
                )

    return findings


def discover_workflow_files(root):
    """`.github/workflows/*.yml` and `*.yaml` under root, sorted for stable output."""
    workflows_dir = Path(root) / ".github" / "workflows"
    if not workflows_dir.is_dir():
        return []
    files = list(workflows_dir.glob("*.yml")) + list(workflows_dir.glob("*.yaml"))
    return sorted(files)


def scan_path(root):
    """Scan every workflow file under root. Returns a flat list of findings."""
    findings = []
    for path in discover_workflow_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=str(path)))
    return findings


def has_risk(findings):
    return any(f["type"] in RISK_CLASSIFICATIONS for f in findings)


_SARIF_RULES = {
    TRANSFORMED_SECRET: {
        "name": "TransformedSecretBypassesMasking",
        "short": "Secret transformed before it can be masked",
        "text": (
            "A step re-encodes (base64/hex/case/substring) a value sourced from "
            "secrets.*, producing a string GitHub's exact-match log masking does "
            "not recognise, so the transformed value can print in plain text."
        ),
    },
    UNMASKED_ENV_EXPORT: {
        "name": "SecretExportedToEnvFileWithoutMask",
        "short": "Secret-derived value exported without ::add-mask::",
        "text": (
            "A step writes a secret-derived value to $GITHUB_ENV, $GITHUB_OUTPUT, "
            "or $GITHUB_STATE without registering it with ::add-mask::, so a later "
            "step that prints it leaks it in plain text."
        ),
    },
}


def _sarif_artifact_uri(path):
    text = str(path)
    if text.startswith("./"):
        text = text[2:]
    return text


def render_sarif(findings, root):
    root_path = str(Path(root).resolve())
    results = []
    for finding in findings:
        file_path = finding["file"]
        try:
            uri = _sarif_artifact_uri(Path(file_path).resolve().relative_to(root_path))
        except ValueError:
            uri = _sarif_artifact_uri(file_path)
        results.append(
            {
                "ruleId": finding["type"],
                "level": "warning",
                "message": {"text": f"{finding['detail']} -- {finding['remediation']}"},
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {"uri": uri},
                            "region": {"startLine": finding["line"]},
                        }
                    }
                ],
            }
        )
    sarif = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "actions-secret-leak-check",
                        "informationUri": "https://duncan-haywood.github.io/monorepo-projects/actions-secret-leak-check/",
                        "rules": [
                            {
                                "id": rule_id,
                                "name": rule["name"],
                                "shortDescription": {"text": rule["short"]},
                                "fullDescription": {"text": rule["text"]},
                                "helpUri": "https://duncan-haywood.github.io/monorepo-projects/actions-secret-leak-check/why-github-actions-secret-masking-fails.html",
                            }
                            for rule_id, rule in _SARIF_RULES.items()
                        ],
                    }
                },
                "results": results,
            }
        ],
    }
    return json.dumps(sarif, indent=2)


def render_text(findings, root):
    if not findings:
        files = discover_workflow_files(root)
        if not files:
            return "No .github/workflows/*.yml or *.yaml files found under " + str(root)
        return f"Scanned {len(files)} workflow file(s); no findings."

    transformed = [f for f in findings if f["type"] == TRANSFORMED_SECRET]
    exported = [f for f in findings if f["type"] == UNMASKED_ENV_EXPORT]

    lines = []
    for f in transformed:
        lines.append(f"!! {f['file']}:{f['line']}  transformed-secret")
        lines.append(f"     line: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")
    for f in exported:
        lines.append(f"!! {f['file']}:{f['line']}  unmasked-env-export")
        lines.append(f"     line: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(transformed)} transformed-secret finding(s), {len(exported)} unmasked-env-export finding(s)."
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "path", nargs="?", default=".", help="directory to scan (default: current directory)"
    )
    parser.add_argument(
        "--format", choices=("text", "json", "sarif"), default="text", help="output format"
    )
    parser.add_argument(
        "--fail-on-risk",
        action="store_true",
        help="exit 2 when any finding exists",
    )
    args = parser.parse_args(argv)

    findings = scan_path(args.path)

    if args.format == "json":
        print(json.dumps(findings, indent=2))
    elif args.format == "sarif":
        print(render_sarif(findings, args.path))
    else:
        print(render_text(findings, args.path))

    if args.fail_on_risk and has_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
