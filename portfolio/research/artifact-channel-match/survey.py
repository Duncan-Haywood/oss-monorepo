#!/usr/bin/env python3
"""Join what this repository actually builds against where it is allowed to publish.

Every prior run in the reachability chain measured *channels*: which registry
hosts answer, which are proxy-blocked, which are one allowlist entry away.
None of them measured the other side of the join -- whether this portfolio has
an artifact that could be published to a channel it has been asking for.

This script does that join:

  1. Walk the repository for build manifests and classify each by ecosystem.
  2. Decide, per manifest, whether it is a *publishable package* or an
     *application*. An application with a `package.json` is not an npm package;
     `"private": true` makes npm refuse the publish outright.
  3. Load the per-endpoint verdicts from `publish-endpoint-reachability`.
  4. Report, per ecosystem: artifacts here x publish path open?

Read-only, stdlib-only, no network, no credentials. The verdicts come from a
saved probe result rather than being re-measured here, so this script is
offline and its output is re-derivable from the two inputs.

  python3 survey.py                        # survey repo, join, print
  python3 survey.py --out results.json     # ... and save
  python3 survey.py --recompute-from results.json   # re-derive from saved
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
DEFAULT_VERDICTS = (
    HERE.parents[0] / "publish-endpoint-reachability" / "results-2026-08-24.json"
)

# Directories that never contain this repository's own artifacts.
SKIP_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "out", "vendor",
    ".venv", "venv", "__pycache__", ".pytest_cache", "coverage", ".turbo",
}

# manifest filename (or suffix, prefixed with '*') -> ecosystem
MANIFEST_ECOSYSTEM = {
    "pyproject.toml": "Python",
    "setup.py": "Python",
    "package.json": "JavaScript/TypeScript",
    "composer.json": "PHP",
    "Gemfile": "Ruby",
    "*.gemspec": "Ruby",
    "Cargo.toml": "Rust",
    "mix.exs": "Elixir",
    "*.csproj": ".NET",
    "*.nuspec": ".NET",
    "Package.swift": "Swift",
    "monkey.jungle": "Monkey C",
}

# ecosystem -> (channel, the endpoint a publish actually writes to)
# Endpoint URLs match `publish-endpoint-reachability`'s target list exactly.
ECOSYSTEM_PUBLISH = {
    "Python": ("PyPI", "https://upload.pypi.org/legacy/"),
    "JavaScript/TypeScript": ("npm", "https://registry.npmjs.org/-/npm/v1/user"),
    "PHP": ("Packagist", "https://packagist.org/api/create-package"),
    "Ruby": ("RubyGems", "https://rubygems.org/api/v1/gems"),
    "Rust": ("crates.io", "https://crates.io/api/v1/crates/new"),
    "Elixir": ("Hex", "https://hex.pm/api/packages"),
    ".NET": ("NuGet", "https://www.nuget.org/api/v2/package"),
    # No central registry a publish writes to; SwiftPM resolves from git.
    "Swift": (None, None),
    # Connect IQ store; not in the probed endpoint set.
    "Monkey C": (None, None),
}

# The registries Ask 0 (issue #139) offers to buy a token on.
ASK0_CHANNELS = {"Packagist", "RubyGems", "crates.io", "Hex"}


def _matches(name, pattern):
    return name.endswith(pattern[1:]) if pattern.startswith("*") else name == pattern


def classify(name):
    """Return the ecosystem a manifest filename belongs to, or None."""
    for pattern, ecosystem in MANIFEST_ECOSYSTEM.items():
        if _matches(name, pattern):
            return ecosystem
    return None


def is_publishable(ecosystem, path):
    """Is this manifest a publishable package, or an application/config?

    Only the two ecosystems where the distinction is machine-checkable are
    judged; everything else is reported as unknown rather than guessed at.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None, "unreadable"

    if ecosystem == "JavaScript/TypeScript":
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None, "unparseable"
        if data.get("private") is True:
            return False, 'package.json sets "private": true; npm refuses to publish'
        if "name" not in data:
            return False, "package.json has no name field"
        return True, "publishable in principle"

    if ecosystem == "Python":
        if path.name == "setup.py":
            return True, "publishable in principle"
        # A pyproject.toml is packageable when it declares a distribution name.
        has_project_name = False
        in_project = False
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("["):
                in_project = stripped == "[project]"
                continue
            if in_project and stripped.startswith("name"):
                has_project_name = True
                break
        if has_project_name:
            return True, "publishable in principle"
        return False, "pyproject.toml declares no [project] name (tooling config only)"

    return None, "not machine-checked for this ecosystem"


def discover(root):
    """Walk `root` and return one record per build manifest found."""
    root = Path(root)
    found = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        ecosystem = classify(path.name)
        if ecosystem is None:
            continue
        publishable, reason = is_publishable(ecosystem, path)
        found.append({
            "path": str(path.relative_to(root)),
            "ecosystem": ecosystem,
            "publishable": publishable,
            "reason": reason,
        })
    return found


def load_verdicts(path):
    """url -> {verdict, http_code} from a publish-endpoint-reachability result."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {
        t["url"]: {"verdict": t["verdict"], "http_code": t.get("http_code")}
        for t in data["targets"]
    }


def join(manifests, verdicts):
    """Per ecosystem: artifacts present, and whether its publish path is open."""
    rows = []
    ecosystems = sorted({m["ecosystem"] for m in manifests} | set(ECOSYSTEM_PUBLISH))
    for ecosystem in ecosystems:
        mine = [m for m in manifests if m["ecosystem"] == ecosystem]
        channel, url = ECOSYSTEM_PUBLISH.get(ecosystem, (None, None))
        entry = verdicts.get(url) if url else None
        rows.append({
            "ecosystem": ecosystem,
            "channel": channel,
            "publish_endpoint": url,
            "publish_verdict": entry["verdict"] if entry else None,
            "publish_http_code": entry["http_code"] if entry else None,
            "publish_path_open": (entry["verdict"] == "REACHED") if entry else None,
            "manifests": len(mine),
            "publishable_packages": sum(1 for m in mine if m["publishable"] is True),
            "applications_only": sum(1 for m in mine if m["publishable"] is False),
            "on_ask0_menu": channel in ASK0_CHANNELS,
        })
    return rows


def summarise(rows):
    """The three sets the join exists to separate."""
    shippable = [
        r for r in rows if r["publish_path_open"] and r["publishable_packages"] > 0
    ]
    built_but_blocked = [
        r for r in rows
        if r["publish_path_open"] is False and r["publishable_packages"] > 0
    ]
    open_but_empty = [
        r for r in rows if r["publish_path_open"] and r["publishable_packages"] == 0
    ]
    ask0_with_artifacts = [
        r for r in rows if r["on_ask0_menu"] and r["publishable_packages"] > 0
    ]
    return {
        "shippable_today": [r["ecosystem"] for r in shippable],
        "built_but_publish_blocked": [r["ecosystem"] for r in built_but_blocked],
        "publish_open_but_nothing_built": [r["ecosystem"] for r in open_but_empty],
        "ask0_channels_with_a_publishable_artifact": [
            r["channel"] for r in ask0_with_artifacts
        ],
    }


def render(rows, summary):
    out = []
    out.append(
        f"{'ecosystem':22s} {'channel':11s} {'publish path':22s} "
        f"{'pkgs':>5s} {'apps':>5s}  ask0"
    )
    out.append("-" * 78)
    for r in rows:
        verdict = r["publish_verdict"] or "no central registry"
        if r["publish_http_code"] is not None:
            verdict = f"{verdict} {r['publish_http_code']}"
        out.append(
            f"{r['ecosystem']:22s} {(r['channel'] or '-'):11s} {verdict:22s} "
            f"{r['publishable_packages']:5d} {r['applications_only']:5d}  "
            f"{'yes' if r['on_ask0_menu'] else '-'}"
        )
    out.append("")
    out.append(f"publishable today (artifact + open path): "
               f"{', '.join(summary['shippable_today']) or 'NONE'}")
    out.append(f"built, but publish path blocked:          "
               f"{', '.join(summary['built_but_publish_blocked']) or 'none'}")
    out.append(f"publish path open, nothing built:         "
               f"{', '.join(summary['publish_open_but_nothing_built']) or 'none'}")
    out.append(f"Ask 0 channels with a publishable artifact here: "
               f"{', '.join(summary['ask0_channels_with_a_publishable_artifact']) or 'NONE'}")
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(REPO_ROOT),
                        help="repository root to survey")
    parser.add_argument("--verdicts", default=str(DEFAULT_VERDICTS),
                        help="publish-endpoint-reachability result JSON")
    parser.add_argument("--out", help="write the joined result here")
    parser.add_argument("--recompute-from",
                        help="re-derive the summary from a saved result, offline")
    args = parser.parse_args(argv)

    if args.recompute_from:
        payload = json.loads(Path(args.recompute_from).read_text(encoding="utf-8"))
        rows = payload["rows"]
        print(render(rows, summarise(rows)))
        return 0

    manifests = discover(args.root)
    verdicts = load_verdicts(args.verdicts)
    rows = join(manifests, verdicts)
    summary = summarise(rows)
    print(render(rows, summary))

    if args.out:
        payload = {
            "root": str(Path(args.root).resolve().name),
            "verdicts_source": str(Path(args.verdicts).name),
            "manifests": manifests,
            "rows": rows,
            "summary": summary,
        }
        Path(args.out).write_text(json.dumps(payload, indent=2) + "\n",
                                  encoding="utf-8")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
