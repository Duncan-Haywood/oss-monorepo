#!/usr/bin/env python3
"""Find two well-documented dependency-confusion setups in a repository checkout.

    python3 check.py                       # scan the current directory
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## What dependency confusion is

In 2021, researcher Alex Birsan demonstrated that many companies' internal
build tooling would install a same-named *public* package instead of their
own *internal* one -- and got code execution inside Apple, Microsoft, PayPal,
Netflix, Uber, Tesla, and others by publishing decoy packages under their
internal names. The root cause in both ecosystems below is the same shape:
a resolver that is told about two places a package might live, with no rule
that says the internal one always wins.

## The two patterns this catches

**1. pip `--extra-index-url`** -- pip's own documentation names this
explicitly as a risk: "the additional repository can specify a version of a
package which will be installed instead of the one from index-url, so people
can substitute-attack you with this option." When `--extra-index-url` (in a
`requirements*.txt` header, a `pip.conf`/`pip.ini`, or a CI workflow's
`pip install` step) points pip at a private index *in addition to* the
public one, pip compares versions across both and installs whichever is
higher for a given name -- so a public package published under your internal
package's name, at a higher version, wins.

**2. npm unscoped name behind a private registry** -- when a repository's
`.npmrc` sets a bare `registry=` to a private host, that value is the
default for *every* unscoped dependency, public or internal. A teammate (or
a CI runner) without that `.npmrc` in effect resolves the same unscoped name
against the public npm registry instead -- and if nobody has claimed that
name there, an attacker can. npm's own guidance for avoiding this is to
publish internal packages under a scope (`@your-org/name`), because a scope
is bound to an npm org nobody else can publish under.

## What this tool actually does, and does not do

A static, read-only, line-oriented scan over files already on disk -- the
repository root's `requirements*.txt`, `constraints*.txt`, `pip.conf`,
`pip.ini`, and `.github/workflows/*.yml`/`*.yaml` for pattern 1; the
repository root's `package.json` and `.npmrc` for pattern 2. It makes **no
network calls of any kind** -- it never queries npm, PyPI, or any registry to
check whether a name is actually claimed, which is what makes it safe to run
against a private repository's manifests with nothing leaving the machine.
That also means it cannot tell you whether an unscoped or extra-indexed name
is *actually* available for an attacker to claim on the public registry --
only that the configuration shape which made every 2021 dependency-confusion
incident possible is present. **The npm check in particular flags every
unscoped dependency once a private registry is configured, including ones
that are already legitimately public** (a manifest depending on `left-pad`
looks identical, from this tool's read-only view, to one depending on an
internal package of the same shape) -- read each flagged name yourself and
judge which ones your organization actually intends to keep private. It does
not recurse into subdirectories (a monorepo with per-package manifests below
the root needs each scanned separately), and it does not parse `Pipfile`,
`poetry.lock`, `pnpm-lock.yaml`, or `yarn.lock`.

## Classification

  - `pip-extra-index-url` -- a `--extra-index-url` option found in a
    `requirements*.txt`/`constraints*.txt` header line, a `pip.conf`/`pip.ini`
    `[global]`/`[install]` section, or a workflow step invoking `pip`.
  - `npm-unscoped-private-dependency` -- an unscoped (`@scope/`-free)
    dependency or devDependency name in `package.json`, while the repository's
    `.npmrc` sets a bare `registry=` to a host other than the public npm or
    Yarn registries.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

PIP_EXTRA_INDEX_URL = "pip-extra-index-url"
NPM_UNSCOPED_PRIVATE_DEPENDENCY = "npm-unscoped-private-dependency"

RISK_CLASSIFICATIONS = frozenset({PIP_EXTRA_INDEX_URL, NPM_UNSCOPED_PRIVATE_DEPENDENCY})

PUBLIC_NPM_REGISTRIES = frozenset(
    {
        "registry.npmjs.org",
        "registry.yarnpkg.com",
        "npm.pkg.github.com",
    }
)

_EXTRA_INDEX_URL_RE = re.compile(r"--extra-index-url(?:[=\s]+(\S+))?")
_NPM_REGISTRY_RE = re.compile(r"^\s*registry\s*=\s*(\S+)", re.MULTILINE)
_SCOPED_REGISTRY_RE = re.compile(r"^\s*@\S+:registry\s*=", re.MULTILINE)

_PIP_REMEDIATION = (
    "--extra-index-url tells pip to consider a second index in addition to the primary one, "
    "and pip installs whichever index reports the higher version for a given package name -- "
    "pip's own documentation names this as a substitution risk. A public package published "
    "under your internal package's name, at a higher version, would win. Use --index-url with "
    "a single trusted index that proxies or mirrors the packages you need (most private-index "
    "servers support this), or pin exact versions with --require-hashes so an unexpected "
    "package cannot silently substitute."
)

_NPM_REMEDIATION = (
    "This repository's .npmrc sets a private default registry, but an unscoped dependency name "
    "resolves against whatever registry is in effect wherever the install runs -- a machine or "
    "CI runner without this .npmrc falls back to the public npm registry for the same name. If "
    "nobody has claimed it there, anyone can publish a package under that name and have it "
    "installed instead. Publish internal packages under an npm org scope (@your-org/name), "
    "which nobody outside your org can publish under, or claim the unscoped name on the public "
    "registry as an empty placeholder."
)


def _line_number_of(text, needle, start_line=1):
    for offset, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            return offset
    return start_line


def scan_pip_text(text, filename="<pip-config>"):
    """Scan one pip-related file's text for --extra-index-url. Returns findings."""
    findings = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        match = _EXTRA_INDEX_URL_RE.search(line)
        if not match:
            continue
        if line.lstrip().startswith("#"):
            continue
        findings.append(
            {
                "file": filename,
                "line": lineno,
                "type": PIP_EXTRA_INDEX_URL,
                "detail": line.strip(),
                "remediation": _PIP_REMEDIATION,
            }
        )
    return findings


def _npm_private_registry_host(npmrc_text):
    """Return the host set by a bare (unscoped) `registry=` line, or None.

    A scoped override (`@scope:registry=...`) does not change the default for
    unscoped names, so it is not treated as making the repository private.
    """
    match = _NPM_REGISTRY_RE.search(npmrc_text)
    if not match:
        return None
    url = match.group(1)
    host = re.sub(r"^\w+://", "", url).split("/")[0]
    if not host or host in PUBLIC_NPM_REGISTRIES:
        return None
    return host


def scan_npm(package_json_text, npmrc_text, filename="package.json"):
    """Scan a package.json + .npmrc pair. Returns findings."""
    findings = []
    private_host = _npm_private_registry_host(npmrc_text) if npmrc_text else None
    if not private_host:
        return findings

    try:
        manifest = json.loads(package_json_text)
    except (ValueError, TypeError):
        return findings
    if not isinstance(manifest, dict):
        return findings

    names = []
    for key in ("dependencies", "devDependencies", "optionalDependencies"):
        deps = manifest.get(key)
        if isinstance(deps, dict):
            names.extend(n for n in deps if isinstance(n, str))

    for name in sorted(set(names)):
        if name.startswith("@"):
            continue
        lineno = _line_number_of(package_json_text, json.dumps(name))
        findings.append(
            {
                "file": filename,
                "line": lineno,
                "type": NPM_UNSCOPED_PRIVATE_DEPENDENCY,
                "detail": f"unscoped dependency \"{name}\" with private registry {private_host} in .npmrc",
                "remediation": _NPM_REMEDIATION,
            }
        )
    return findings


def discover_pip_files(root):
    """Root-level pip manifests plus `.github/workflows/*.yml`/`*.yaml`."""
    root = Path(root)
    files = sorted(root.glob("requirements*.txt")) + sorted(root.glob("constraints*.txt"))
    for name in ("pip.conf", "pip.ini"):
        candidate = root / name
        if candidate.is_file():
            files.append(candidate)
    workflows_dir = root / ".github" / "workflows"
    if workflows_dir.is_dir():
        files.extend(sorted(workflows_dir.glob("*.yml")) + sorted(workflows_dir.glob("*.yaml")))
    return files


def scan_path(root):
    """Scan a repository checkout for both patterns. Returns a flat list of findings."""
    root = Path(root)
    findings = []

    for path in discover_pip_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_pip_text(text, filename=str(path)))

    package_json = root / "package.json"
    npmrc = root / ".npmrc"
    if package_json.is_file():
        try:
            package_json_text = package_json.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {package_json}: {exc}", file=sys.stderr)
            package_json_text = None
        npmrc_text = npmrc.read_text(encoding="utf-8") if npmrc.is_file() else ""
        if package_json_text is not None:
            findings.extend(scan_npm(package_json_text, npmrc_text, filename=str(package_json)))

    return findings


def has_risk(findings):
    return any(f["type"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root):
    if not findings:
        return f"Scanned {root} for dependency-confusion patterns; no findings."

    pip_findings = [f for f in findings if f["type"] == PIP_EXTRA_INDEX_URL]
    npm_findings = [f for f in findings if f["type"] == NPM_UNSCOPED_PRIVATE_DEPENDENCY]

    lines = []
    for f in pip_findings:
        lines.append(f"!! {f['file']}:{f['line']}  pip-extra-index-url")
        lines.append(f"     line: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")
    for f in npm_findings:
        lines.append(f"!! {f['file']}:{f['line']}  npm-unscoped-private-dependency")
        lines.append(f"     detail: {f['detail']}")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(pip_findings)} pip-extra-index-url finding(s), "
        f"{len(npm_findings)} npm-unscoped-private-dependency finding(s)."
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "path", nargs="?", default=".", help="repository checkout to scan (default: current directory)"
    )
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="output format"
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
    else:
        print(render_text(findings, args.path))

    if args.fail_on_risk and has_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
