#!/usr/bin/env python3
"""Fail when the live site has not been rebuilt for longer than deploys allow.

The deploy (`.github/workflows/portfolio-pages.yml`) runs on every merge and
every three hours, and each build writes `version.json` with its commit and
build time (`platform/pages/build.mjs`, `buildVersion`). A healthy site is
therefore never much more than three hours old. On 2026-11-03 every deploy
failed for over an hour while the site kept answering 200, so an uptime
probe saw nothing: staleness is the failure to watch, not status codes.

Exit 0: fresh, or unknown (site unreachable from here, or no version.json
deployed yet); the reason is printed. Exit 1: stale, with where to look.
`main_health.py` runs this with every other check_*.py.

    python3 platform/ci/check_site_fresh.py [--url URL] [--max-hours H]
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

SITE = "https://marisstella.app/"
# Three hours between scheduled deploys, plus a build of up to an hour.
MAX_HOURS = 4.5
RUNBOOK = "portfolio/hosting/README.md, \"When the site stops updating\""


def fetch_version(url, timeout=20):
    """(version dict, None) or (None, reason it could not be read)."""
    req = urllib.request.Request(url.rstrip("/") + "/version.json",
                                 headers={"User-Agent": "site-freshness-check"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        return None, f"version.json answered HTTP {e.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return None, f"site unreachable from here ({e})"
    except ValueError as e:
        return None, f"version.json is not JSON ({e})"


def verdict(version, now, max_hours=MAX_HOURS):
    """(exit code, message) for a parsed version.json."""
    try:
        built = datetime.fromisoformat(str(version["built_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return 1, f"version.json has no readable built_at: {version!r}"
    age = (now - built).total_seconds() / 3600
    sha = str(version.get("sha", "unknown"))[:12]
    if age > max_hours:
        return 1, (f"STALE: the live site was built {age:.1f} h ago (commit {sha}), over the "
                   f"{max_hours} h a healthy deploy allows. Deploys are failing or paused; "
                   f"see {RUNBOOK}.")
    return 0, f"fresh: built {age:.1f} h ago from commit {sha}"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--url", default=SITE)
    ap.add_argument("--max-hours", type=float, default=MAX_HOURS)
    args = ap.parse_args(argv)
    version, why = fetch_version(args.url)
    if version is None:
        print(f"check_site_fresh: unknown, {why}; not failing")
        return 0
    code, message = verdict(version, datetime.now(timezone.utc), args.max_hours)
    print(f"check_site_fresh: {message}")
    return code


if __name__ == "__main__":
    sys.exit(main())
