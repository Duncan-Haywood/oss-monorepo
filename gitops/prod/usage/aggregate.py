#!/usr/bin/env python3
"""Turn the public site's nginx access log into a per-tool daily page count.

Why this exists
---------------
`portfolio/DIRECTION.md` makes usage the portfolio's only honest signal while
everything ships free, and `portfolio/usage/README.md` says a number nobody
wrote down does not exist. Every venture already carries a `usage.mjs`, but all
of them are deliberately `localStorage`-only: the count lives in the visitor's
own browser and never leaves the device. That is the right default for a
contractor's pricing, and it means that on the day `tools.marisstella.dev`
goes live the portfolio still learns nothing about which of its 168 tools
anyone opened. `usage.yaml` would stay `null` forever.

This closes that without asking the browser to transmit anything new. nginx
already receives every request; the only question is what it is allowed to
remember. `portfolio-site.yaml` narrows the access log to three fields — the
timestamp, the status, and the resolved path — and this job reads those lines
back and reduces them to one integer per tool per day.

What it can and cannot see, by construction
-------------------------------------------
The log line it parses has no client address, no user agent, no referrer, and
no query string, so no amount of processing here can recover them: the fields
were never written. Nothing in this file's output can identify or re-identify
a visitor. That satisfies `usage/README.md` rule 1 ("count events, never
people") at the source rather than by promising to discard something later.

Shared bids travel in the URL *fragment* (`share.mjs`), which browsers never
send to a server, so a shared link's numbers are not in the log either.

Reading a page count is also all it does. It writes to exactly one ConfigMap,
by name, and has no other write anywhere in the cluster.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Keep a month of daily rows. `usage/README.md` wants a trend to be visible
# rather than a single overwritten number, and 30 rows of small integers stays
# far inside the 1MiB a ConfigMap may hold.
RETAIN_DAYS = 30

# How far back to ask the kubelet for logs. The job runs shortly after
# midnight UTC and only counts lines dated *yesterday*, so this window has to
# reach back past yesterday's first second with room to spare. 25h does, and
# counting by date rather than by window makes the job idempotent: a retry, or
# a run that fires late, produces the same row rather than a doubled one.
SINCE_SECONDS = 25 * 3600

# The hub is a real destination — it is the page a search result for the
# portfolio itself lands on — but it has no slug, so give it one that cannot
# collide with a venture directory.
HUB_KEY = "_hub"

# Only page-shaped requests count. An `.mjs`, `.css`, `.png` or `sitemap.xml`
# fetch says nothing about a person deciding to use a tool, and counting them
# would inflate every number by whatever each page happens to load.
PAGE_SUFFIX = re.compile(r"(/|\.html)$")

# `$time_iso8601 $status $uri`, exactly as the log_format in
# portfolio-site.yaml emits it. Anything else on the line is not ours to
# guess at, so it is skipped rather than parsed loosely.
LOG_LINE = re.compile(r"^(?P<ts>\d{4}-\d{2}-\d{2})T\S*\s+(?P<status>\d{3})\s+(?P<uri>/\S*)$")


def slug_for(uri: str) -> str | None:
    """The catalogue slug a request path belongs to, or None if it is not a page.

    `try_files` has already resolved the request by the time nginx logs `$uri`,
    so a tool page arrives as `/amazon-fba-calculator/index.html` and the hub
    as `/index.html`. Category pages keep their category (`c/marketplace`)
    rather than collapsing into one `c` row — which of the seven category
    pages a visitor lands on is the same kind of signal as which tool, and
    lumping them together would hide it.
    """
    if not PAGE_SUFFIX.search(uri):
        return None
    parts = [p for p in uri.split("/") if p]
    if not parts or parts == ["index.html"]:
        # "/" and "/index.html" are the same page: the catalogue front page.
        return HUB_KEY
    if len(parts) == 1:
        # A bare root page such as "/404.html" or "/offline.html".
        return parts[0].removesuffix(".html")
    if parts[0] == "c":
        return f"c/{parts[1].removesuffix('.html')}"
    return parts[0]


def count_lines(lines: object, day: str) -> dict[str, int]:
    """Reduce raw log lines to {slug: hits} for one UTC date.

    Filtering by the date *in the line* rather than by the fetch window is what
    makes this safe to re-run. A line that does not parse, is not from `day`,
    or did not serve a page is skipped in silence: a malformed line is not
    worth failing a whole day's count over.
    """
    counts: Counter[str] = Counter()
    for raw in lines:
        match = LOG_LINE.match(raw.strip())
        if not match or match.group("ts") != day:
            continue
        # 200 and 304 are both "the visitor got the page". A 404 or a redirect
        # is not a page view and a 5xx is an outage, not usage.
        if match.group("status") not in ("200", "304"):
            continue
        slug = slug_for(match.group("uri"))
        if slug:
            counts[slug] += 1
    return dict(sorted(counts.items()))


def merge_days(existing: dict[str, Any], day: str, counts: dict[str, int]) -> dict[str, Any]:
    """Fold one day's counts into the stored history, newest-trimmed to RETAIN_DAYS.

    The day is replaced, not added to, so re-running for a date that is already
    present is a no-op rather than a doubling.
    """
    days = dict(existing.get("days") or {})
    days[day] = counts
    kept = dict(sorted(days.items())[-RETAIN_DAYS:])
    return {
        "schema": 1,
        "note": (
            "Aggregate page views of the public tool site. No addresses, user "
            "agents, referrers or query strings are logged upstream, so no "
            "field here derives from one. See portfolio/usage/README.md."
        ),
        "days": kept,
    }


# --- in-cluster wrapper (not exercised by the unit tests) -------------------


def _incluster() -> tuple[str, dict[str, str], ssl.SSLContext]:
    host = os.environ["KUBERNETES_SERVICE_HOST"]
    port = os.environ["KUBERNETES_SERVICE_PORT"]
    sa = Path("/var/run/secrets/kubernetes.io/serviceaccount")
    token = (sa / "token").read_text().strip()
    ctx = ssl.create_default_context(cafile=str(sa / "ca.crt"))
    return f"https://{host}:{port}", {"Authorization": f"Bearer {token}"}, ctx


def _k8s(method: str, path: str, body: dict[str, Any] | None = None, raw_text: bool = False):
    base, headers, ctx = _incluster()
    data = None
    req_headers = dict(headers)
    if body is not None:
        data = json.dumps(body).encode()
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            payload = resp.read()
            if raw_text:
                return resp.status, payload.decode("utf-8", "replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", "replace")
        return exc.code, body_text if raw_text else {"message": body_text}


def main() -> int:
    namespace = os.environ.get("USAGE_NAMESPACE", "prod")
    selector = os.environ.get("USAGE_SELECTOR", "app=portfolio-site")
    container = os.environ.get("USAGE_CONTAINER", "nginx")
    cm_name = os.environ.get("USAGE_CONFIGMAP", "portfolio-site-usage")

    day = os.environ.get("USAGE_DAY") or (
        datetime.now(timezone.utc) - timedelta(days=1)
    ).strftime("%Y-%m-%d")

    status, pods = _k8s(
        "GET",
        f"/api/v1/namespaces/{namespace}/pods?labelSelector={urllib.parse.quote(selector)}",
    )
    if status != 200:
        print(f"usage: cannot list pods ({status}): {pods}", file=sys.stderr)
        return 1

    names = [p["metadata"]["name"] for p in pods.get("items", [])]
    if not names:
        print(f"usage: no pods match {selector} in {namespace}; nothing to count")
        return 0

    # Both replicas serve the same site behind one Service, so a visitor's
    # requests land on either. Summing the two is the site's total; there is no
    # per-pod number worth keeping.
    total: Counter[str] = Counter()
    for name in names:
        log_status, text = _k8s(
            "GET",
            f"/api/v1/namespaces/{namespace}/pods/{name}/log"
            f"?container={container}&sinceSeconds={SINCE_SECONDS}&timestamps=false",
            raw_text=True,
        )
        if log_status != 200:
            # One unreadable pod (restarting, evicted) should not throw away
            # the other's count. Say so and carry on with a partial day.
            print(f"usage: skipping {name}: log read returned {log_status}", file=sys.stderr)
            continue
        total.update(count_lines(text.splitlines(), day))

    cm_status, existing = _k8s("GET", f"/api/v1/namespaces/{namespace}/configmaps/{cm_name}")
    if cm_status != 200:
        print(f"usage: cannot read ConfigMap {cm_name} ({cm_status}): {existing}", file=sys.stderr)
        return 1

    stored: dict[str, Any] = {}
    try:
        stored = json.loads((existing.get("data") or {}).get("usage.json") or "{}")
    except json.JSONDecodeError:
        # A corrupt blob is not worth preserving, and refusing to write would
        # wedge every future run behind a manual edit.
        print(f"usage: {cm_name} held unparseable JSON; starting a fresh history", file=sys.stderr)

    merged = merge_days(stored, day, dict(sorted(total.items())))
    existing["data"] = dict(existing.get("data") or {})
    existing["data"]["usage.json"] = json.dumps(merged, indent=2, sort_keys=True) + "\n"

    put_status, result = _k8s(
        "PUT", f"/api/v1/namespaces/{namespace}/configmaps/{cm_name}", existing
    )
    if put_status not in (200, 201):
        print(f"usage: cannot write {cm_name} ({put_status}): {result}", file=sys.stderr)
        return 1

    print(f"usage: recorded {sum(total.values())} page view(s) across {len(total)} tool(s) for {day}")
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised only in-cluster
    raise SystemExit(main())
