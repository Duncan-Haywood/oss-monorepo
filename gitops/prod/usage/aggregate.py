#!/usr/bin/env python3
"""Turn the public nginx access logs into a per-page daily count.

Why this exists
---------------
`portfolio/DIRECTION.md` makes usage the portfolio's only honest signal while
everything ships free, and `portfolio/usage/README.md` says a number nobody
wrote down does not exist. Every venture already carries a `usage.mjs`, but all
of them are deliberately `localStorage`-only: the count lives in the visitor's
own browser and never leaves the device. That is the right default for a
contractor's pricing, and it means that on the day `tools.marisstella.dev`
goes live the portfolio still learns nothing about which of its 175 tools
anyone opened. `usage.yaml` would stay `null` forever.

This closes that without asking the browser to transmit anything new. nginx
already receives every request; the only question is what it is allowed to
remember. `portfolio-site.yaml` narrows the access log to three fields — the
timestamp, the status, and the resolved path — and this job reads those lines
back and reduces them to one integer per tool per day.

Since 2026-09-02 it reads two workloads, not one: the tools site, and the apex
front door added by `portfolio-front.yaml`, whose nginx writes the same narrow
format. The front door's visits land on their own key rather than on the hub's
— see APP_KEYS for why conflating them would make both numbers unreadable.

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

# The path segment the comparison index and its per-product pages live under,
# on both hosts. Matches `COMPARE_PATH` in `platform/pages/build.mjs`, which is
# what generates them; this file cannot import from a JavaScript module, so the
# agreement is pinned by `gitops/tests/test_site_usage.py` instead.
COMPARE_DIR = "compare"

# Only page-shaped requests count. An `.mjs`, `.css`, `.png` or `sitemap.xml`
# fetch says nothing about a person deciding to use a tool, and counting them
# would inflate every number by whatever each page happens to load.
PAGE_SUFFIX = re.compile(r"(/|\.html)$")

# Views served inside somebody else's page are counted under their own prefix
# rather than added to the tool's row.
#
# The embed widget (#2561, #2567) is the only distribution channel here that
# does not depend on ranking in search, and the one question it has to answer
# is whether anyone actually embedded a tool. That is unanswerable if an
# embedded view is indistinguishable from a direct visit: 300 hits could be 300
# people finding it in search or one popular embed on a trade forum, and those
# imply opposite next moves. A prefix, so the rows sort together, and one that
# cannot collide with a venture directory -- `slug_for` returns no key
# containing "/" except the category pages, which use `c/`.
EMBED_PREFIX = "embed/"

# The apex front door gets its own row rather than being added to the hub's.
#
# `gitops/prod/portfolio-front.yaml` (2026-09-02) serves marisstella.dev and
# www.marisstella.dev — a different page, on a different hostname, from the
# tools hub. Both resolve to `/index.html`, so `slug_for` returns HUB_KEY for
# each of them and folding the two pods together would add apex visits to the
# hub's row: two numbers that answer opposite questions ("did anyone find the
# portfolio" vs "did anyone browse the catalogue") reported as one, with no way
# to separate them afterwards. That is why the front door shipped unmeasured
# rather than mismeasured, and this is the key that fixes it.
#
# `/healthz` sets `access_log off`, so probes never reach this file at all.
#
# **Changed when the apex tool mirror landed.** This comment used to end "one
# key for the whole pod, not a path breakdown, because there is only ever one
# path: that pod's nginx does `try_files /index.html =404`, so every request it
# counts logs the same URI. A per-path split would be fiction." That was true
# and is not any more. `front-door-tools.mjs` mirrors 1321 complete ventures onto
# that same pod, so it now serves the front page *and* those tools, and folding
# them all onto one key would recreate — inside this pod — exactly the
# conflation this key was added to prevent: "did anyone find the portfolio" and
# "did anyone use a mirrored tool" as one number.
#
# That number is also the only evidence the mirror is worth serving, so losing
# it would leave the experiment unmeasurable.
FRONT_KEY = "_front"

# The prefix a mirrored tool's row gets, e.g. `_front/job-margin-variance`.
#
# Prefixed rather than sharing the catalogue's bare `<slug>` row, even though
# it is the same tool: while both hosts serve it, one row would mix a visit to
# the apex copy with a visit to the catalogue's, and the two are not the same
# question — whether the mirror earns its keep is precisely the difference.
# It sorts beside `_front` for free, and it disappears with the mirror.
FRONT_TOOL_PREFIX = f"{FRONT_KEY}/"

# The apex's own About & privacy page (`gitops/prod/front-door/about.html`,
# 2026-09-03) gets its own row rather than folding into `FRONT_KEY`.
#
# When `FRONT_KEY`'s comment above was written, "the front page" and "anything
# this pod resolves through its catch-all" were the same set: `location /`
# does `try_files /index.html`, and that was the only page-shaped thing this
# host served outside the mirror and the category pages. `about.html` broke
# that: it has its own `location ~ "^/about/?$" { try_files /about.html; }` in
# `default.conf`, so `$uri` resolves to a page that is not `index.html` and is
# not mirrored or category content either. Left unhandled it fell through to
# the `else` branch below like the front page does, silently merging "did
# anyone land on the front page" with "did anyone read the page that explains
# what this host does and does not log" -- the exact conflation the category
# and mirrored-tool branches exist to prevent for their own pages.
FRONT_ABOUT_SLUG = "about"
FRONT_ABOUT_KEY = f"{FRONT_TOOL_PREFIX}about"

# How a mirrored file's logged `$uri` maps back to its venture.
#
# nginx logs `$uri` *after* `try_files` resolves, and the mirror's locations
# resolve `/tools/<slug>/<file>` to the flattened ConfigMap key `/<slug>__<file>`
# — so that is the shape in the log, not the URL the visitor typed. The `__`
# separator is what makes this unambiguous: a real path on the tools host never
# contains one. Verified against a live nginx serving the real config, which
# logged `/job-margin-variance__index.html` for a request to
# `/tools/job-margin-variance/`.
MIRROR_SEPARATOR = "__"

# How a category browse page's logged `$uri` maps back to its category.
#
# Same mechanism as `MIRROR_SEPARATOR` above and the same reason: nginx logs
# `$uri` after `try_files`, and the apex's `^/c/(?<cat>…)/?$` block resolves
# `/c/trades/` to the flattened ConfigMap key `/c__trades.html`. A ConfigMap key
# cannot contain `/`, which is why the URL and the key differ at all.
#
# `c` is a reserved path prefix on the catalogue host (see `CATEGORY_PATH_PREFIX`
# in `platform/pages/build.mjs`, which reserves it precisely so a venture can
# never be called `c`), so this prefix cannot collide with a mirrored tool.
FRONT_CATEGORY_PREFIX = f"c{MIRROR_SEPARATOR}"

# How a per-product comparison page's logged `$uri` maps back to its product.
#
# Exactly the mechanism `FRONT_CATEGORY_PREFIX` documents, one page type later:
# the apex's `^/compare/(?<vs>…)/?$` block resolves `/compare/jobber/` to the
# flattened ConfigMap key `/vs__jobber.html`, because a ConfigMap key cannot
# contain `/`.
#
# It needs a branch of its own for the reason the category one does, and the
# failure it prevents is the same shape but louder. Without it `vs__jobber`
# contains `MIRROR_SEPARATOR`, so the mirrored-tool branch below splits on it
# and files the hit under `_front/vs` — a venture called `vs` that does not
# exist, accumulating the traffic of all fourteen product pages in the stored
# history under a name nothing in the tree explains.
#
# `vs` is safe as a prefix because a mirrored key is `<venture-slug>__<file>`
# and no venture is called `vs`; `compareProductKey` in
# `platform/marketing/front-door.mjs` picked the prefix and this is the reader
# half of that choice.
FRONT_COMPARE_PREFIX = f"vs{MIRROR_SEPARATOR}"

# Which key a pod's counted lines belong to, chosen by its `app` label.
#
# `None` means "use `slug_for`'s own keys, unprefixed" — the tools site, whose
# rows predate this map and must keep the names the stored history already
# uses. A string means every counted line from that pod lands on that one key.
# A pod whose label is in neither case is skipped rather than guessed at: the
# selector below only matches these two, so an unknown app means someone
# widened the selector without deciding what its lines mean.
APP_KEYS: dict[str, str | None] = {
    "portfolio-site": None,
    "portfolio-front": FRONT_KEY,
}

# Both apps, in one API call. A set-based selector rather than two list calls
# so there is one code path and one place a pod can go missing from.
DEFAULT_SELECTOR = "app in (portfolio-site,portfolio-front)"

# The value nginx's `$portfolio_embed_view` map writes for a framed view. Two
# outcomes exist and this is the one that counts; anything else (including the
# `-` placeholder, and including a line from a pod that has not rolled onto the
# new format yet) reads as an ordinary visit.
EMBED_FIELD = "embed"

# `$time_iso8601 $status $uri $portfolio_embed_view`, exactly as the log_format
# in portfolio-site.yaml emits it. Anything else on the line is not ours to
# guess at, so it is skipped rather than parsed loosely.
#
# The fourth field is optional in this pattern and that is deliberate, not
# laziness. A rollout replaces the two pods one at a time, so for the length of
# one deploy the aggregator reads three-field lines from the old pod and
# four-field lines from the new one in the same batch. Requiring the field
# would silently drop half of that day; making it optional counts every line
# and merely attributes the old pod's embedded views to the tool's own row,
# which is exactly what happened before this field existed.
LOG_LINE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2})T\S*\s+(?P<status>\d{3})\s+(?P<uri>/\S*)"
    r"(?:\s+(?P<embed>\S+))?$"
)


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
        # `/c/index.html` is the Tools index that lists every category: its own
        # `c` row, not a category called "index".
        if parts[1] == "index.html":
            return "c"
        return f"c/{parts[1].removesuffix('.html')}"
    if parts[0] == COMPARE_DIR and len(parts) > 2:
        # `/compare/jobber/index.html` — one of the comparison index's
        # per-product pages. Kept apart from the index itself, and from each
        # other, for the reason the category pages are: whether a product page
        # earns the search traffic the 167-entry index could not is the entire
        # question those pages were written to answer, and folding them onto a
        # single `compare` row would leave it unanswerable. `len(parts) > 2`
        # rather than `== 3` so a future sub-page under a product still rolls
        # onto its product rather than falling through to the bare index row.
        return f"{COMPARE_DIR}/{parts[1]}"
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
            # The prefix is applied here rather than inside `slug_for` on
            # purpose: `slug_for` answers "which page is this", which is a
            # property of the path alone, and the other caller in the tests
            # relies on that. Whether it was framed is a property of the
            # request, and it arrives in a different field.
            if match.group("embed") == EMBED_FIELD:
                slug = f"{EMBED_PREFIX}{slug}"
            counts[slug] += 1
    return dict(sorted(counts.items()))


def fold_for_app(counts: dict[str, int], app: str | None) -> dict[str, int]:
    """The rows one pod's counts contribute to the day, given its `app` label.

    Split out of `main` so the decision that matters is testable without a
    cluster: `main`'s own body is API calls around this.

    A pod whose app maps to `None` keeps `slug_for`'s keys. An unrecognised app
    contributes nothing — the caller reports it; guessing a key would put an
    unexplained row in a file whose whole value is that every row means
    something.

    A pod that maps to a string used to collapse onto that single key, because
    it served a single page. The apex now serves the front page, the mirrored
    tools, the category pages and its own About page, so its lines split:
    anything carrying `MIRROR_SEPARATOR` is a mirrored venture or a category
    page and gets its own `_front/<slug>` or `_front/c/<id>` row, the About
    page (`FRONT_ABOUT_SLUG`) gets `FRONT_ABOUT_KEY`, and everything else --
    which is the front page, since that pod's remaining fallback is
    `try_files /index.html` -- stays on the bare key.
    """
    if app not in APP_KEYS:
        return {}
    key = APP_KEYS[app]
    if key is None:
        return dict(counts)
    folded: dict[str, int] = {}
    for slug, hits in counts.items():
        if slug.startswith(FRONT_CATEGORY_PREFIX):
            # A category browse page. It carries `MIRROR_SEPARATOR` like a
            # mirrored tool does — `/c/trades/` resolves through `try_files` to
            # `/c__trades.html` — but splitting on the separator the way the
            # branch below does would put all seven onto one `_front/c` row,
            # which reads in the stored history as a venture called `c` that
            # does not exist. Which category a visitor browses is the same kind
            # of signal as which tool they open, so each keeps its own row.
            #
            # Spelled `_front/c/<id>` so it sorts beside the tools it lists and
            # matches the `c/<id>` key `slug_for` already gives these pages on
            # the catalogue host — one page, one name, whichever host served it.
            row = f"{FRONT_TOOL_PREFIX}c/{slug[len(FRONT_CATEGORY_PREFIX):]}"
        elif slug.startswith(FRONT_COMPARE_PREFIX):
            # A per-product comparison page. Before the mirrored-tool branch
            # for the same reason the category one is: `vs__jobber` carries
            # `MIRROR_SEPARATOR`, so falling through would file it under a
            # venture called `vs`. See `FRONT_COMPARE_PREFIX`.
            #
            # Spelled `_front/compare/<product>` so it sorts beside the index's
            # own row and matches the `compare/<product>` key `slug_for` gives
            # the same page on the catalogue host — one page, one name,
            # whichever host served it.
            row = f"{FRONT_TOOL_PREFIX}{COMPARE_DIR}/{slug[len(FRONT_COMPARE_PREFIX):]}"
        elif MIRROR_SEPARATOR in slug:
            # `slug_for` has already stripped `.html`, so a mirrored entry page
            # arrives as `<slug>__index` and a sub-page as `<slug>__<name>`.
            # Both belong to the venture, matching how the tools host rolls a
            # tool's sub-pages onto its own row.
            row = f"{FRONT_TOOL_PREFIX}{slug.split(MIRROR_SEPARATOR, 1)[0]}"
        elif slug == FRONT_ABOUT_SLUG:
            # `about.html` carries no `MIRROR_SEPARATOR` -- it is a flat
            # ConfigMap key, not a flattened `<slug>__<file>` one -- so without
            # this branch it falls to `else` below and merges into the front
            # page's count. See `FRONT_ABOUT_KEY`.
            row = FRONT_ABOUT_KEY
        else:
            row = key
        folded[row] = folded.get(row, 0) + hits
    return {row: hits for row, hits in sorted(folded.items()) if hits}


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
            "Aggregate page views of the public tool site, plus the apex "
            "front door under the key _front, each tool the apex mirrors "
            "under _front/<slug>, each category browse page it serves under "
            "_front/c/<category>, and its own About page under _front/about. "
            "No addresses, user agents, referrers or query strings are logged "
            "upstream, so no field here derives from one. See "
            "portfolio/usage/README.md."
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
    selector = os.environ.get("USAGE_SELECTOR", DEFAULT_SELECTOR)
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

    # (pod name, its `app` label). The label is what decides which key the
    # pod's lines land on — see APP_KEYS.
    found = [
        (p["metadata"]["name"], (p["metadata"].get("labels") or {}).get("app"))
        for p in pods.get("items", [])
    ]
    if not found:
        print(f"usage: no pods match {selector} in {namespace}; nothing to count")
        return 0

    # Replicas of one app serve the same page behind one Service, so a
    # visitor's requests land on either. Summing them is that app's total;
    # there is no per-pod number worth keeping. Summing across *apps* is a
    # different matter, which is what APP_KEYS is for.
    total: Counter[str] = Counter()
    for name, app in found:
        if app not in APP_KEYS:
            print(f"usage: skipping {name}: app={app!r} has no key in APP_KEYS", file=sys.stderr)
            continue
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
        total.update(fold_for_app(count_lines(text.splitlines(), day), app))

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
