#!/usr/bin/env python3
"""Which code forges does this environment reach, and on which surface?

`egress-reachability/` established that a reachability verdict belongs to a
*surface*, not to a host, and found a fourth surface nobody had asked: git's
smart-HTTP transport, which answers for `github.com` even though every GitHub
HTTP surface is scope-denied.

That finding was measured on one forge. This probe asks it of twenty, because
"git is a fourth surface and is not scoped" is one sentence away from being read
as "git works", and the difference decides which primary sources a product built
here can actually read.

Read-only. Standard library plus `git`. No credential is sent, no account is
touched, nothing is written to any remote, nothing is published, nothing spends.

    python3 probe_forges.py --probe -o results-YYYY-MM-DD.json
    python3 probe_forges.py --recompute-from results-YYYY-MM-DD.json   # no network

`--recompute-from` re-derives every table in README.md from the saved JSON, so a
reviewer can check the finding without re-running the probe.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REACHABLE = "reachable"
EGRESS_DENIED = "egress_denied"
SCOPE_DENIED = "scope_denied"
ERROR = "error"

# Lifted verbatim from egress-reachability/consolidate.py. This environment
# denies egress in signatures that are *not* distinguishable by status code, and
# at least three prior passes misread one of them as an origin answer. Sharing
# the signature list rather than restating it keeps the two directories from
# drifting into disagreeing about what a denial looks like.
TUNNEL_SIGNATURES = (
    "tunnel connection failed",
    "connect tunnel failed",
    "cannot connect to proxy",
    "connect_rejected",
    "host not in allowlist",
    "add this host to your network egress settings",
    "no rule allows host",
    "request blocked",
)

SCOPE_SIGNATURES = (
    "not enabled for this session",
    "bound to their configured repositories",
    "sessions are bound to",
)

# A git fetch that reaches an origin which then demands credentials is a
# *reachable* host: the 401 is the origin's own opinion, exactly as the HTTP
# table treats a 401/403/404 body from an origin. Recording these separately
# matters because the probe deliberately sends no credential, so an auth prompt
# is the expected shape of "reached a private or missing repo".
GIT_AUTH_SIGNATURES = (
    "could not read username",
    "authentication failed",
    "terminal prompts disabled",
    "you may not have access to this repository",
    "repository not found",
)

GIT_TIMEOUT_S = 45
HTTP_TIMEOUT_S = 30

# Each target names one forge and the surfaces it exposes. `git` is a public
# repository chosen for being unrelated to this session's own repo -- the point
# of the GitHub finding was that git reaches repositories the session has no
# scope over, and a probe against our own repo would not test that.
#
# `api` and `raw` are the forge's HTTP surfaces. They are probed independently
# because the whole reason this directory exists is that surfaces on one host
# return different verdicts: GitHub is scope-denied on HTTP and reachable on
# git, and until this pass nobody had checked whether any other forge splits the
# other way.
TARGETS = [
    {
        "host": "github.com",
        "forge": "GitHub",
        "git": "https://github.com/cisagov/kev-data.git",
        "api": "https://api.github.com/repos/cisagov/kev-data",
        "raw": "https://raw.githubusercontent.com/cisagov/kev-data/main/README.md",
        "note": "Prior pass measured the git surface here. Re-probed to confirm the split holds.",
    },
    {
        "host": "codeload.github.com",
        "forge": "GitHub (archive host)",
        "git": "https://codeload.github.com/cisagov/kev-data.git",
        "note": "Second GitHub git endpoint; scope-denied on its archive surface.",
    },
    {
        "host": "gitlab.com",
        "forge": "GitLab.com",
        "git": "https://gitlab.com/gitlab-org/gitlab-runner.git",
        "api": "https://gitlab.com/api/v4/projects?per_page=1",
        "raw": "https://gitlab.com/gitlab-org/gitlab-runner/-/raw/main/README.md",
        "note": "Recorded `reachable` in the 92-host table on its bare root only; no surface below the root had ever been probed.",
    },
    {
        "host": "bitbucket.org",
        "forge": "Bitbucket Cloud",
        "git": "https://bitbucket.org/tildeslash/monit.git",
        "api": "https://api.bitbucket.org/2.0/repositories/tildeslash/monit",
        "raw": "https://bitbucket.org/",
        "note": "Absent from the 92-host table entirely.",
    },
    {
        "host": "codeberg.org",
        "forge": "Codeberg (Forgejo)",
        "git": "https://codeberg.org/forgejo/forgejo.git",
        "api": "https://codeberg.org/api/v1/repos/forgejo/forgejo",
        "note": "Largest non-commercial forge; absent from the table.",
    },
    {
        "host": "gitea.com",
        "forge": "Gitea",
        "git": "https://gitea.com/gitea/tea.git",
        "api": "https://gitea.com/api/v1/repos/gitea/tea",
    },
    {
        "host": "git.sr.ht",
        "forge": "SourceHut",
        "git": "https://git.sr.ht/~sircmpwn/hare",
    },
    {
        "host": "salsa.debian.org",
        "forge": "Debian Salsa (GitLab CE)",
        "git": "https://salsa.debian.org/debian/hello.git",
        "api": "https://salsa.debian.org/api/v4/projects?per_page=1",
        "note": "Tests whether the GitLab verdict is about the software or the host.",
    },
    {
        "host": "gitlab.gnome.org",
        "forge": "GNOME (GitLab CE)",
        "git": "https://gitlab.gnome.org/GNOME/glib.git",
        "api": "https://gitlab.gnome.org/api/v4/projects?per_page=1",
    },
    {
        "host": "gitlab.freedesktop.org",
        "forge": "freedesktop.org (GitLab CE)",
        "git": "https://gitlab.freedesktop.org/mesa/mesa.git",
    },
    {
        "host": "framagit.org",
        "forge": "Framagit (GitLab CE)",
        "git": "https://framagit.org/framasoft/framadate/framadate.git",
    },
    {
        "host": "invent.kde.org",
        "forge": "KDE Invent (GitLab CE)",
        "git": "https://invent.kde.org/frameworks/kirigami.git",
    },
    {
        "host": "opendev.org",
        "forge": "OpenDev (Gitea)",
        "git": "https://opendev.org/openstack/nova",
    },
    {
        "host": "git.kernel.org",
        "forge": "kernel.org (cgit)",
        "git": "https://git.kernel.org/pub/scm/git/git.git",
    },
    {
        "host": "git.savannah.gnu.org",
        "forge": "GNU Savannah",
        "git": "https://git.savannah.gnu.org/git/bash.git",
    },
    {
        "host": "git.launchpad.net",
        "forge": "Launchpad",
        "git": "https://git.launchpad.net/ubuntu/+source/bash",
    },
    {
        "host": "git.code.sf.net",
        "forge": "SourceForge",
        "git": "https://git.code.sf.net/p/monit/code",
    },
    {
        "host": "huggingface.co",
        "forge": "Hugging Face (git-backed datasets)",
        "git": "https://huggingface.co/datasets/fka/awesome-chatgpt-prompts",
        "note": "Egress-denied on HTTP in the 92-host table. Datasets are git repos, so the git surface is a distinct question.",
    },
    {
        "host": "android.googlesource.com",
        "forge": "Google Git (Gerrit)",
        "git": "https://android.googlesource.com/platform/build",
    },
    {
        "host": "go.googlesource.com",
        "forge": "Go (Gerrit)",
        "git": "https://go.googlesource.com/go",
    },
    {
        "host": "example.com",
        "forge": "CONTROL",
        "git": "https://example.com/control/control.git",
        "api": "https://example.com/",
        "note": "Control. `primary-source-egress/` established that nobody had run one, and that without it a denial is not evidence about the host.",
    },
]


def classify(text: str, status=None) -> str:
    """Classify a probe outcome from its response text.

    Order matters: an egress denial can arrive *as* an HTTP 403, so the
    signature check has to run before any status-code reasoning.
    """
    low = (text or "").lower()
    if any(sig in low for sig in TUNNEL_SIGNATURES):
        return EGRESS_DENIED
    if any(sig in low for sig in SCOPE_SIGNATURES):
        return SCOPE_DENIED
    if any(sig in low for sig in GIT_AUTH_SIGNATURES):
        return REACHABLE
    if isinstance(status, int) and status > 0:
        return REACHABLE
    return ERROR


def probe_git(url: str) -> dict:
    """`git ls-remote` against a public repo. Sends no credential."""
    env = dict(os.environ)
    # Without this git blocks on a terminal prompt when an origin returns 401,
    # which would turn "reached the origin" into a hang rather than a result.
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_ASKPASS"] = ""
    try:
        proc = subprocess.run(
            ["git", "-c", "credential.helper=", "ls-remote", "--heads", url],
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_S,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return {"surface": "git", "url": url, "verdict": ERROR, "detail": "timeout"}
    except FileNotFoundError:
        return {"surface": "git", "url": url, "verdict": ERROR, "detail": "git not installed"}

    if proc.returncode == 0:
        refs = len([ln for ln in proc.stdout.splitlines() if ln.strip()])
        return {"surface": "git", "url": url, "verdict": REACHABLE, "refs": refs, "detail": f"{refs} refs"}

    detail = (proc.stderr or proc.stdout).strip().splitlines()
    detail = detail[0][:300] if detail else f"exit {proc.returncode}"
    return {"surface": "git", "url": url, "verdict": classify(detail), "detail": detail}


def probe_http(url: str) -> dict:
    """Plain GET. Any origin answer -- including 401/403/404/410 -- is reachable."""
    req = urllib.request.Request(url, headers={"User-Agent": "portfolio-research/forge-surface"})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
            return {"surface": "http", "url": url, "verdict": REACHABLE, "status": resp.status,
                    "detail": f"HTTP {resp.status}"}
    except urllib.error.HTTPError as exc:
        # The body is the only thing separating an in-band egress denial from a
        # genuine origin 403. Read it before deciding.
        try:
            body = exc.read(2048).decode("utf-8", "replace")
        except Exception:
            body = ""
        verdict = classify(body, exc.code)
        return {"surface": "http", "url": url, "verdict": verdict, "status": exc.code,
                "detail": f"HTTP {exc.code}: {body.strip()[:200]}" if verdict != REACHABLE else f"HTTP {exc.code}"}
    except urllib.error.URLError as exc:
        detail = str(exc.reason)[:300]
        return {"surface": "http", "url": url, "verdict": classify(detail), "detail": detail}
    except Exception as exc:  # noqa: BLE001 - a probe reports failures, it does not raise them
        detail = f"{type(exc).__name__}: {exc}"[:300]
        return {"surface": "http", "url": url, "verdict": classify(detail), "detail": detail}


def probe_target(target: dict) -> dict:
    record = {k: target[k] for k in ("host", "forge") if k in target}
    if "note" in target:
        record["note"] = target["note"]
    surfaces = {}
    if "git" in target:
        surfaces["git"] = probe_git(target["git"])
    for name in ("api", "raw"):
        if name in target:
            surfaces[name] = probe_http(target[name])
    record["surfaces"] = surfaces
    return record


def derive(payload: dict) -> dict:
    """Re-derive every reported claim from saved records. No network."""
    rows = []
    for rec in payload.get("targets", []):
        surfaces = rec.get("surfaces", {})
        verdicts = {name: s.get("verdict") for name, s in surfaces.items()}
        reachable = [n for n, v in verdicts.items() if v == REACHABLE]
        rows.append({
            "host": rec.get("host", ""),
            "forge": rec.get("forge", ""),
            "verdicts": verdicts,
            "git": verdicts.get("git"),
            "n_surfaces": len(verdicts),
            "n_reachable": len(reachable),
            # A host "splits" when its surfaces disagree. That is the whole
            # question this directory was opened to answer.
            "splits": 0 < len(reachable) < len(verdicts),
            "note": rec.get("note", ""),
        })

    control = [r for r in rows if r["forge"] == "CONTROL"]
    forges = [r for r in rows if r["forge"] != "CONTROL"]
    git_rows = [r for r in forges if r["git"] is not None]

    return {
        "measured_at": payload.get("measured_at", ""),
        "rows": rows,
        "forges": forges,
        "control_ok": bool(control) and all(
            v == EGRESS_DENIED for r in control for v in r["verdicts"].values()
        ),
        "n_forges": len(forges),
        "git_reachable": [r for r in git_rows if r["git"] == REACHABLE],
        "git_denied": [r for r in git_rows if r["git"] == EGRESS_DENIED],
        "splits": [r for r in forges if r["splits"]],
    }


def render(d: dict) -> str:
    out = []
    add = out.append
    add(f"Forge surface reachability — measured {d['measured_at']}")
    add("")
    add(f"  forges probed ......... {d['n_forges']}")
    add(f"  git surface reachable . {len(d['git_reachable'])}")
    add(f"  git surface denied .... {len(d['git_denied'])}")
    add(f"  hosts whose surfaces disagree . {len(d['splits'])}")
    add(f"  control (example.com) denied on every surface . {d['control_ok']}")
    add("")
    add(f"{'host':<28} {'git':<14} {'api':<14} {'raw':<14}")
    add("-" * 72)
    for r in d["rows"]:
        v = r["verdicts"]
        add(f"{r['host']:<28} {v.get('git', '-') or '-':<14} "
            f"{v.get('api', '-') or '-':<14} {v.get('raw', '-') or '-':<14}")
    add("")
    add("git-reachable forges: " + (", ".join(r["host"] for r in d["git_reachable"]) or "none"))
    add("hosts whose surfaces disagree: " + (", ".join(r["host"] for r in d["splits"]) or "none"))
    return "\n".join(out)


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--probe", action="store_true", help="measure (needs network)")
    ap.add_argument("-o", "--json", help="write raw records here")
    ap.add_argument("--recompute-from", help="re-derive the tables from saved records, offline")
    ap.add_argument("--as-of", help="date stamp for the record (YYYY-MM-DD)")
    args = ap.parse_args(argv)

    if args.recompute_from:
        print(render(derive(json.loads(Path(args.recompute_from).read_text()))))
        return 0

    if not args.probe:
        ap.error("pass --probe to measure, or --recompute-from to re-derive offline")

    payload = {
        "measured_at": args.as_of or "",
        "method": (
            "Per host, each surface probed independently: `git ls-remote --heads` against an "
            "unrelated public repository (no credential sent, GIT_TERMINAL_PROMPT=0), and plain "
            "GETs against the forge's API and raw-file surfaces. Read-only; nothing written to "
            "any remote. Verdicts classified on the response body, never on status code alone."
        ),
        "targets": [],
    }

    for target in TARGETS:
        print(f"… {target['host']}", file=sys.stderr, flush=True)
        payload["targets"].append(probe_target(target))
        # Written after every host: a run that dies on the twentieth forge
        # should still leave the first nineteen measured.
        if args.json:
            Path(args.json).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")

    if args.json:
        Path(args.json).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(render(derive(payload)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
