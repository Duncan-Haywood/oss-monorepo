"""The public site's usage signal: what it counts, and what it must never see.

Two halves. The first pins the privacy property at its source — nginx is
configured to write four fields, none of which is caller-supplied, so no later
change to the aggregator can start reporting an address, a user agent, or a
string a visitor put in a URL, because none was recorded. The second is
ordinary unit coverage of the reduction from log lines to counts.

No cluster required.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
SITE_USAGE = ROOT / "prod" / "site-usage.yaml"
AGGREGATE = ROOT / "prod" / "usage" / "aggregate.py"

# Enough of a venture for `discoverSurfaces` to publish it: an entry page with
# a title and a description. Everything else the builder adds itself.
FIXTURE_INDEX = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Widget Fee Calculator | Know your margin before you list</title>
<meta name="description" content="Work out the marketplace fee on a widget
sale and the price that protects your margin, free and in your browser.">
</head><body><h1>Widget fee calculator</h1>
<p>Enter your sale price and see what actually lands.</p>
<a href="worked-example.html">A worked example</a>
</body></html>
"""

FIXTURE_SUBPAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>How much does a widget sale really leave? | Worked example</title>
<meta name="description" content="A full worked example of a widget sale, fee
by fee, so you can see where the margin goes before you list.">
</head><body><h1>A worked example</h1><p>Fee by fee.</p></body></html>
"""


def _write_fixture_venture(venture: Path, *, nested: bool) -> None:
    """A minimal publishable venture, authored flat or under `site/`."""
    web_root = venture / "site" if nested else venture
    web_root.mkdir(parents=True, exist_ok=True)
    (web_root / "index.html").write_text(FIXTURE_INDEX, encoding="utf-8")
    (web_root / "worked-example.html").write_text(FIXTURE_SUBPAGE, encoding="utf-8")


def _load_aggregate():
    spec = importlib.util.spec_from_file_location("site_usage_aggregate", AGGREGATE)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _docs() -> dict[str, dict]:
    return {d["kind"]: d for d in yaml.safe_load_all(SITE_USAGE.read_text()) if d}


def _nginx_conf() -> str:
    docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-site.yaml").read_text()))
    configmap = next(d for d in docs if d and d["kind"] == "ConfigMap")
    return configmap["data"]["default.conf"]


def _cron_minute_of_day(schedule: str) -> int:
    """Minutes past midnight for a `M H * * *` schedule. Daily crons only."""
    minute, hour, dom, month, dow = schedule.split()
    assert (dom, month, dow) == ("*", "*", "*"), f"not a plain daily schedule: {schedule}"
    return int(hour) * 60 + int(minute)


# --- the ordering the usage signal depends on ------------------------------


def test_the_site_refresh_restarts_only_after_usage_has_been_counted() -> None:
    # `portfolio-site-refresh` does a rollout restart, which replaces both
    # pods and deletes the nginx access log this job reads out of them --
    # `?previous=true` cannot recover it, because a rollout does not reuse a
    # pod. So the aggregator must run first on any given day, or it counts a
    # day whose log has already been thrown away.
    #
    # This inverted for real: until 2026-08-31 the refresh ran at 04:17 and
    # the aggregator at 00:31 counting *yesterday*, so the only pods alive at
    # 00:31 had started at 04:17 the previous morning and every daily row
    # silently dropped 00:00-04:17 -- 18% of every day, always the same hours.
    # Caught before the site was public, so no real reading was affected.
    refresh_docs = yaml.safe_load_all((ROOT / "prod" / "portfolio-site.yaml").read_text())
    refresh = next(
        d for d in refresh_docs if d and d["kind"] == "CronJob" and d["metadata"]["name"] == "portfolio-site-refresh"
    )
    aggregate = _docs()["CronJob"]

    agg_at = _cron_minute_of_day(aggregate["spec"]["schedule"])
    refresh_at = _cron_minute_of_day(refresh["spec"]["schedule"])
    assert agg_at < refresh_at, (
        f"the refresh ({refresh['spec']['schedule']}) must not restart the pods before "
        f"the aggregator ({aggregate['spec']['schedule']}) has read them"
    )

    # The aggregator's own late-start window has to fit inside that gap, or a
    # delayed run could still begin after the restart and record a near-empty
    # day as a real one.
    latest_start = agg_at + aggregate["spec"]["startingDeadlineSeconds"] // 60
    assert latest_start < refresh_at, (
        f"a maximally delayed aggregation could start at minute {latest_start}, "
        f"after the {refresh_at} restart"
    )

    # Everything between midnight and the restart is the part of the new day
    # the log will not survive to report. It cannot be zero -- a day can only
    # be counted once it has closed -- but it should stay small, and it is a
    # deliberate number rather than a leftover.
    assert refresh_at <= 90, f"the refresh at minute {refresh_at} discards that much of every day"


# --- the privacy property, asserted where it is actually enforced ----------


def test_access_log_records_no_field_that_describes_a_visitor() -> None:
    # nginx's stock `combined` format logs $remote_addr, $http_user_agent and
    # $http_referer. On a static site with no account and no cookie that is a
    # visitor's IP, device fingerprint and browsing history sitting in a pod
    # log for no reason. The whole basis of `usage/README.md` rule 1 here is
    # that those fields are never written, so assert the absence rather than
    # trusting a comment.
    conf = _nginx_conf()
    log_format = next(line for line in conf.splitlines() if line.strip().startswith("log_format "))
    for banned in (
        "$remote_addr",
        "$remote_user",
        "$binary_remote_addr",
        "$http_user_agent",
        "$http_referer",
        "$http_x_forwarded_for",
        "$args",
        "$query_string",
        "$request",  # carries the raw query string; $uri does not
        "$cookie",
    ):
        assert banned not in log_format, f"{banned} would identify or profile a visitor"
    assert "$time_iso8601" in log_format
    assert "$status" in log_format
    assert "$uri" in log_format
    # `$arg_<name>` is on the banned list in spirit but not by string: it would
    # write whatever a caller put in the URL straight into the log. The embed
    # bit is logged through a mapped variable precisely so it cannot, and that
    # substitution is the whole safety property -- assert it directly rather
    # than trusting the comment beside it.
    assert "$arg_" not in log_format, (
        "an $arg_ variable logs caller-supplied text; map it to a fixed set of "
        "values and log the mapped variable instead"
    )


def test_the_embed_bit_cannot_carry_anything_a_caller_chose() -> None:
    # The fourth log field distinguishes a view served inside somebody else's
    # page from a direct visit. It reads a query parameter, which is
    # attacker-controlled, so the only thing standing between that and
    # arbitrary text in the log is that the map has a fixed, closed set of
    # outputs. A third row added later without noticing -- or a `default
    # $arg_pfEmbed` -- would quietly turn this into `$args` by another name.
    conf = _nginx_conf()
    start = conf.index("map $arg_pfEmbed $portfolio_embed_view")
    block = conf[start : conf.index("}", start)]
    # `<key> <value>;` per row, with the value optionally quoted.
    values = [
        m.group(1)
        for m in (
            re.match(r'\s*\S+\s+"?([^";]*)"?\s*;\s*$', line)
            for line in block.splitlines()[1:]
            if line.strip()
        )
        if m
    ]
    assert values, "the embed map has no rows"
    assert set(values) <= {"-", "embed"}, f"unexpected mapped value(s): {values}"
    assert "$" not in "".join(values), "a mapped value must be a literal, never a variable"


def test_the_privacy_format_is_the_one_actually_used() -> None:
    # A log_format nothing references leaves the default in force, which is
    # the exact bug this is meant to fix — and it would look fixed.
    conf = _nginx_conf()
    assert "access_log /dev/stdout privacy;" in conf
    # log_format is only valid in the `http` context, and this file is
    # included from inside it. Declared under `server {` nginx refuses to
    # start, taking the site down rather than degrading.
    assert conf.index("log_format privacy") < conf.index("server {")


# --- least privilege ------------------------------------------------------


def test_usage_job_may_write_exactly_one_configmap_and_create_nothing() -> None:
    rules = _docs()["Role"]["rules"]
    cm_rules = [r for r in rules if "configmaps" in r["resources"]]
    assert len(cm_rules) == 1
    assert cm_rules[0]["resourceNames"] == ["portfolio-site-usage"]
    assert sorted(cm_rules[0]["verbs"]) == ["get", "update"]
    # `create` cannot be narrowed by name, which is why the ConfigMap is
    # seeded in git rather than made by the job.
    for rule in rules:
        assert "create" not in rule["verbs"]
        assert "delete" not in rule["verbs"]
        assert "*" not in rule["verbs"]
    # Log access is read-only and namespaced. Pod names change on every
    # rollout so it cannot also be narrowed by name.
    log_rules = [r for r in rules if "pods/log" in r["resources"]]
    assert log_rules and all(r["verbs"] == ["get"] for r in log_rules)


def test_usage_counts_survive_an_argo_sync() -> None:
    # Git holds an empty seed. Without this the next reconcile would restore
    # it over a month of counts — the same trap `governor-state` avoids.
    app = yaml.safe_load((ROOT / "apps" / "prod.yaml").read_text())
    ignored = app["spec"]["ignoreDifferences"]
    assert any(
        d["kind"] == "ConfigMap"
        and d["name"] == "portfolio-site-usage"
        and "/data" in d["jsonPointers"]
        for d in ignored
    )
    # ignoreDifferences on its own only changes what counts as OutOfSync in
    # the diff view — it does nothing during an actual sync. With selfHeal
    # on, every automated reconcile would still overwrite /data back to the
    # empty seed unless RespectIgnoreDifferences=true is also set, the same
    # requirement `test_agents_app_does_not_reset_governor_state` pins for
    # governor-state. This entry existed without its syncOption counterpart
    # from the day it was added (#2228) until this test caught it.
    assert "RespectIgnoreDifferences=true" in app["spec"]["syncPolicy"]["syncOptions"]
    # Defense in depth, matching governor-state.yaml's own annotations.
    docs = [d for d in yaml.safe_load_all((ROOT / "prod" / "site-usage.yaml").read_text()) if d]
    configmap = next(d for d in docs if d["kind"] == "ConfigMap" and d["metadata"]["name"] == "portfolio-site-usage")
    assert configmap["metadata"]["annotations"]["argocd.argoproj.io/sync-options"] == "RespectIgnoreDifferences=true"


def test_usage_job_is_synced_and_mounts_the_script_from_git() -> None:
    kustomization = yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())
    assert "site-usage.yaml" in kustomization["resources"]
    generated = {g["name"] for g in kustomization["configMapGenerator"]}
    assert "portfolio-site-usage-script" in generated
    # A name suffix hash would rename the ConfigMap out from under the
    # CronJob, which references it literally.
    #
    # Read from this generator's own `options` rather than from a
    # namespace-wide `generatorOptions:` block, which is where it lived until
    # 2026-09-02. The front door added the first generated ConfigMap that a
    # Deployment mounts, and that one needs the hash — kustomize 5.4 cannot
    # re-enable it per generator once it is disabled globally, so the
    # exception had to move to the generator that wants it.
    by_name = {g["name"]: g for g in kustomization["configMapGenerator"]}
    assert by_name["portfolio-site-usage-script"]["options"]["disableNameSuffixHash"] is True

    pod = _docs()["CronJob"]["spec"]["jobTemplate"]["spec"]["template"]["spec"]
    mounted = {v["configMap"]["name"] for v in pod["volumes"] if "configMap" in v}
    assert "portfolio-site-usage-script" in mounted
    assert pod["serviceAccountName"] == "portfolio-site-usage"
    container = pod["containers"][0]
    assert container["securityContext"]["readOnlyRootFilesystem"] is True
    assert container["securityContext"]["capabilities"]["drop"] == ["ALL"]


# --- the reduction --------------------------------------------------------


def test_slug_for_buckets_pages_and_ignores_assets() -> None:
    slug_for = _load_aggregate().slug_for
    assert slug_for("/amazon-fba-calculator/index.html") == "amazon-fba-calculator"
    assert slug_for("/amazon-fba-calculator/") == "amazon-fba-calculator"
    assert slug_for("/") == "_hub"
    assert slug_for("/index.html") == "_hub"
    assert slug_for("/about/index.html") == "about"
    # The comparison index, on both hosts' spellings: the catalogue host
    # serves it as a directory, the apex rewrites `/compare/` to a flat
    # `compare.html` key, and both must land in the one "compare" row or the
    # page reads as two different surfaces in the usage table.
    assert slug_for("/compare/index.html") == "compare"
    assert slug_for("/compare.html") == "compare"
    # Which category page someone lands on is the same kind of signal as
    # which tool; collapsing all seven into one "c" row would hide it.
    assert slug_for("/c/marketplace/index.html") == "c/marketplace"
    assert slug_for("/c/index.html") == "c"  # the Tools index, not a category named "index"
    # Assets say nothing about a person choosing to use a tool, and counting
    # them would scale every number by whatever each page happens to load.
    for asset in ("/amazon-fba-calculator/calc.mjs", "/pf-chrome.css", "/sitemap.xml", "/icon-192.png"):
        assert slug_for(asset) is None, asset


def test_every_published_tool_is_reachable_by_slug_for() -> None:
    """The aggregator's URL assumptions, checked against URLs the builder emits.

    `slug_for` is the whole of the usage signal: whatever it returns becomes a
    row in the ConfigMap, and whatever it collapses is lost with no error
    anywhere. Its other test asserts on paths a human typed into this file,
    which is exactly the shape that cannot catch the failure that matters --
    `build.mjs` is a separate tree in a separate language, and nothing today
    ties its published URL layout to the parser that reads it back.

    That failure is silent and total. `slug_for` never raises and, for any
    page-shaped path, never returns None; it just returns the first path
    segment. So if the builder ever moved products under a shared prefix
    (`/tools/<slug>/`, a locale root, a version root), every tool would bucket
    into one row named after the prefix. `check.mjs` would still pass -- the
    links all resolve -- the site would look right, and the portfolio's only
    metric while everything is free would quietly become a single number. The
    first hint would be someone reading the ConfigMap weeks later.

    So build a real (small) site with the real builder and assert the
    round-trip: the URL the catalogue advertises for a tool must parse back to
    that same tool's slug, and no published page may land in a bucket the
    catalogue cannot explain.
    """
    node = shutil.which("node")
    if node is None:  # pragma: no cover - depends on the runner's toolchain
        pytest.skip("node is required to run the site builder")

    slug_for = _load_aggregate().slug_for
    build_mjs = REPO_ROOT / "platform" / "pages" / "build.mjs"

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        ventures = root / "ventures"
        out = root / "out"

        # Two ventures, because the flattening of an authored `site/` subdir
        # into `/<slug>/` is itself part of the URL contract under test.
        _write_fixture_venture(ventures / "widget-fee-calculator", nested=False)
        _write_fixture_venture(ventures / "nested-bid-calculator", nested=True)

        proc = subprocess.run(
            [
                node,
                "--input-type=module",
                "-e",
                "const m = await import(process.env.BUILD_MJS);\n"
                "await m.buildSite({\n"
                "  venturesDir: process.env.VENTURES_DIR,\n"
                "  outDir: process.env.OUT_DIR,\n"
                "  baseUrl: 'https://tools.example.com/',\n"
                "});\n",
            ],
            env={
                **os.environ,
                "BUILD_MJS": build_mjs.as_uri(),
                "VENTURES_DIR": str(ventures),
                "OUT_DIR": str(out),
            },
            capture_output=True,
            text=True,
            timeout=300,
        )
        assert proc.returncode == 0, f"build.mjs failed:\n{proc.stdout}\n{proc.stderr}"

        catalog = json.loads((out / "catalog.json").read_text())
        tools = catalog["tools"]
        assert tools, "the fixture build published no tools"

        # 1. The advertised URL for a tool parses back to that tool.
        for tool in tools:
            path = urllib.parse.urlparse(tool["url"]).path
            assert slug_for(path) == tool["slug"], (
                f"catalog advertises {tool['url']} for {tool['slug']!r}, "
                f"but the usage aggregator would record it as "
                f"{slug_for(path)!r}"
            )

        # 2. Every published page lands in a bucket the catalogue explains.
        #    `_hub` and the root pages are named here rather than derived,
        #    so adding a new top-level page is a deliberate edit to this list
        #    and not something that silently grows a row.
        known = (
            {t["slug"] for t in tools}
            | {f"c/{c['id']}" for c in catalog["categories"]}
            # `guides` is the deliberate edit this comment asks for: the guides
            # index (`build.mjs`'s `GUIDES_PATH`) is a top-level page the build
            # writes about the site, so `slug_for` gives it a row of its own,
            # exactly as it does for `about` and `compare`. That row is wanted
            # — whether an informational query sends anyone to the index is the
            # question the page exists to answer — so it is named here rather
            # than folded onto the hub.
            # `research` is the research portfolio's homepage, published by
            # build.mjs at RESEARCH_PATH, a top-level page like `about`.
            # `engineering` is the engineering status page (engineering.mjs),
            # another top-level page about the site rather than a tool.
            # `writing` is the essays index and its posts (writing.mjs); every
            # post counts toward the one `writing` row.
            # `c` is the Tools index at `c/` (every category, plus the
            # browse-by-type pages `c/apps` and `c/cli`).
            # `updates` and `changelog` are the open-book pages (updates.mjs):
            # what shipped, what is in progress and the direction, each a row.
            # `ask` is the site assistant's page (assistant.mjs), a top-level
            # page about the site like `about`.
            # `lab` is the experiments section (lab.mjs); every experiment
            # counts toward the one `lab` row.
            # `feedback` is the report-a-problem page (build.mjs FEEDBACK_PATH);
            # its row says how many visitors reached the form at all.
            # `stories` is the fiction section (stories.mjs), one row.
            # `custom-development` is the open custom development page
            # (build.mjs CUSTOM_DEV_PATH): how to request a tool, and the queue.
            | {"_hub", "c", "c/apps", "c/cli", "about", "ask", "compare", "guides", "research", "engineering", "writing",
               "updates", "changelog", "lab", "feedback", "custom-development", "stories", "404", "offline"}
        )
        for page in sorted(out.rglob("*.html")):
            uri = "/" + page.relative_to(out).as_posix()
            bucket = slug_for(uri)
            assert bucket in known, (
                f"{uri} would be counted as {bucket!r}, which is neither a "
                f"catalogue slug, a category page, nor a known root page"
            )

        # 3. A tool's own sub-pages count towards that tool, not somewhere
        #    else. This is what makes a per-tool number mean "visits to this
        #    tool" rather than "visits to its front page".
        example = out / "widget-fee-calculator" / "worked-example.html"
        assert example.is_file(), "fixture sub-page was not published"
        assert slug_for("/widget-fee-calculator/worked-example.html") == "widget-fee-calculator"


def test_count_lines_ignores_other_days_so_a_rerun_is_not_a_double_count() -> None:
    module = _load_aggregate()
    lines = [
        "2026-08-29T23:59:59+00:00 200 /amazon-fba-calculator/index.html",
        "2026-08-30T00:00:01+00:00 200 /amazon-fba-calculator/index.html",
        "2026-08-30T00:00:02+00:00 200 /amazon-fba-calculator/index.html",
        "2026-08-30T00:00:03+00:00 200 /etsy-profit-calculator/index.html",
    ]
    assert module.count_lines(lines, "2026-08-30") == {
        "amazon-fba-calculator": 2,
        "etsy-profit-calculator": 1,
    }
    assert module.count_lines(lines, "2026-08-29") == {"amazon-fba-calculator": 1}


def test_count_lines_counts_a_served_page_and_nothing_else() -> None:
    module = _load_aggregate()
    lines = [
        "2026-08-30T10:00:00+00:00 200 /roof-bid-calculator/index.html",
        "2026-08-30T10:00:01+00:00 304 /roof-bid-calculator/index.html",  # cached; still a visit
        "2026-08-30T10:00:02+00:00 404 /roof-bid-calculator/index.html",
        "2026-08-30T10:00:03+00:00 500 /roof-bid-calculator/index.html",
        "2026-08-30T10:00:04+00:00 301 /roof-bid-calculator/index.html",
        "garbage that is not a log line",
        "",
    ]
    assert module.count_lines(lines, "2026-08-30") == {"roof-bid-calculator": 2}


def test_an_embedded_view_is_counted_apart_from_a_direct_visit() -> None:
    """The one question the embed widget exists to answer.

    `platform/pages/embed.mjs` (#2561) is the only distribution channel here
    that does not depend on ranking in search. Whether anyone actually embedded
    a tool is unanswerable if a framed view and a direct visit land in the same
    row: 300 hits could be 300 people finding it in search or one popular embed
    on a trade forum, and those imply opposite next moves.

    Note what the log line looks like. `$uri` is resolved *past* the query
    string, so `/<slug>/?pfEmbed=1` and `/<slug>/` both log as
    `/<slug>/index.html` -- which is why the distinction has to arrive in a
    field of its own and cannot be recovered from the path.
    """
    module = _load_aggregate()
    lines = [
        "2026-08-31T10:00:00+00:00 200 /deck-bid-calculator/index.html -",
        "2026-08-31T10:00:01+00:00 200 /deck-bid-calculator/index.html embed",
        "2026-08-31T10:00:02+00:00 200 /deck-bid-calculator/index.html embed",
        # A tool's deep pages carry the split too: an embedder can frame one.
        "2026-08-31T10:00:03+00:00 200 /deck-bid-calculator/worked-example.html embed",
        # Not a page, framed or otherwise.
        "2026-08-31T10:00:04+00:00 200 /deck-bid-calculator/calc.mjs embed",
        # A framed view that 404d is not a view.
        "2026-08-31T10:00:05+00:00 404 /deck-bid-calculator/index.html embed",
    ]
    assert module.count_lines(lines, "2026-08-31") == {
        "deck-bid-calculator": 1,
        "embed/deck-bid-calculator": 3,
    }


def test_a_three_field_line_still_counts_during_a_rollout() -> None:
    """Backward compatibility, and it is not hypothetical.

    A rollout replaces the two pods one at a time, so for the length of one
    deploy this job reads three-field lines from the old pod and four-field
    lines from the new one in the same batch. Requiring the fourth field would
    silently drop half of that day's traffic -- the kind of gap that shows up
    as an unexplained dip in a chart weeks later. The old lines count as
    ordinary visits, which is exactly what they were before the field existed.
    """
    module = _load_aggregate()
    lines = [
        "2026-08-31T10:00:00+00:00 200 /deck-bid-calculator/index.html",
        "2026-08-31T10:00:01+00:00 200 /deck-bid-calculator/index.html embed",
    ]
    assert module.count_lines(lines, "2026-08-31") == {
        "deck-bid-calculator": 1,
        "embed/deck-bid-calculator": 1,
    }


def test_only_the_exact_embed_value_splits_a_row() -> None:
    """Anything the map cannot emit reads as an ordinary visit.

    nginx's map has two outcomes and neither is caller-supplied, so these
    values cannot reach the log today. Pinning the behaviour anyway is what
    keeps a future widening of that map from silently minting rows named after
    whatever a stranger put in the URL.
    """
    module = _load_aggregate()
    for value in ("1", "true", "Embed", "embed=1", "embedded", "../../etc"):
        line = f"2026-08-31T10:00:00+00:00 200 /deck-bid-calculator/index.html {value}"
        assert module.count_lines([line], "2026-08-31") == {"deck-bid-calculator": 1}, value


def test_merge_days_replaces_a_day_and_keeps_a_month() -> None:
    module = _load_aggregate()
    history = {"days": {f"2026-07-{d:02d}": {"a": d} for d in range(1, 29)}}
    merged = module.merge_days(history, "2026-08-01", {"a": 99})
    assert merged["days"]["2026-08-01"] == {"a": 99}
    # Re-running the same day overwrites rather than accumulating.
    again = module.merge_days(merged, "2026-08-01", {"a": 99})
    assert again["days"]["2026-08-01"] == {"a": 99}
    assert len(again["days"]) == len(merged["days"])
    # And the window stays bounded, oldest first out.
    for day in range(2, 20):
        merged = module.merge_days(merged, f"2026-08-{day:02d}", {"a": day})
    assert len(merged["days"]) == module.RETAIN_DAYS
    assert max(merged["days"]) == "2026-08-19"


def test_the_front_door_is_counted_apart_from_the_catalogue_hub() -> None:
    """Two front pages, two rows.

    `slug_for` returns the hub key for `/index.html` whichever pod served it,
    because the path is the same on both hostnames. Folding the apex front
    door in without a key of its own would answer "did anyone find the
    portfolio" and "did anyone browse the catalogue" with one number, and
    nothing downstream could take them apart again.
    """
    module = _load_aggregate()
    lines = [
        "2026-09-02T10:00:00+00:00 200 /index.html",
        "2026-09-02T10:01:00+00:00 200 /index.html",
        "2026-09-02T10:02:00+00:00 304 /index.html",
    ]
    counts = module.count_lines(lines, "2026-09-02")
    assert counts == {module.HUB_KEY: 3}

    # The same three lines, read from each pod in turn.
    assert module.fold_for_app(counts, "portfolio-site") == {module.HUB_KEY: 3}
    assert module.fold_for_app(counts, "portfolio-front") == {module.FRONT_KEY: 3}
    assert module.HUB_KEY != module.FRONT_KEY


def test_the_front_doors_own_pages_still_collapse_to_one_row() -> None:
    # Anything from that pod that is not a mirrored tool, a category page, or
    # the About page is the front page: its fallback is `try_files
    # /index.html =404`, so `$uri` resolves to the same page whatever was
    # requested. The mirror and category pages are keyed by `__`, and About is
    # its own explicit slug (see `test_the_about_page_gets_its_own_row`
    # below); these three slugs carry none of that, so they fold as before.
    module = _load_aggregate()
    counts = {"a": 2, "b": 5, module.HUB_KEY: 1}
    assert module.fold_for_app(counts, "portfolio-front") == {module.FRONT_KEY: 8}


def test_the_about_page_gets_its_own_row_rather_than_folding_into_the_front_page() -> None:
    """`about.html` has its own `location` block, not the catch-all's.

    `default.conf`'s `^/about/?$` resolves through `try_files /about.html`, a
    distinct `location` from the bare `location /` the front page falls
    through to -- so, unlike "a", "b" and `HUB_KEY` above, this slug is not an
    accident of the catch-all and deserves its own row for the same reason a
    category page does: "did anyone read the page that explains what this
    host does and does not log" is a different question from "did anyone land
    on the front page", and folding the two into one row would make both
    unanswerable.
    """
    module = _load_aggregate()
    lines = [
        "2026-09-03T10:00:00+00:00 200 /index.html",
        "2026-09-03T10:01:00+00:00 200 /about.html",
        "2026-09-03T10:02:00+00:00 200 /about.html",
        "2026-09-03T10:03:00+00:00 200 /job-margin-variance__index.html",
    ]
    counts = module.count_lines(lines, "2026-09-03")
    assert module.fold_for_app(counts, "portfolio-front") == {
        module.FRONT_KEY: 1,
        module.FRONT_ABOUT_KEY: 2,
        f"{module.FRONT_TOOL_PREFIX}job-margin-variance": 1,
    }
    assert module.FRONT_ABOUT_KEY == "_front/about"
    # The tools host's own About page (`build.mjs`'s) is a different page on a
    # different host and must not share this row: `APP_KEYS["portfolio-site"]`
    # is `None`, so its lines keep `slug_for`'s bare "about" key untouched.
    assert module.fold_for_app({"about": 4}, "portfolio-site") == {"about": 4}


def test_each_mirrored_tool_gets_its_own_row_rather_than_vanishing_into_the_front_key() -> None:
    """The apex serves 14 tools as well as its front page, and they must differ.

    Before the mirror this pod served one page, so one key for the whole pod
    was right. Folding the tools onto it now would recreate, inside this pod,
    the exact conflation `FRONT_KEY` was added to prevent — and it would hide
    the only evidence that mirroring the tools was worth doing.
    """
    module = _load_aggregate()
    # The shapes nginx actually logs: `$uri` after `try_files` resolved
    # `/tools/<slug>/<file>` onto the flattened ConfigMap key.
    lines = [
        "2026-09-02T10:00:00+00:00 200 /index.html",
        "2026-09-02T10:01:00+00:00 200 /job-margin-variance__index.html",
        "2026-09-02T10:02:00+00:00 200 /job-margin-variance__index.html",
        # A sub-page of the same venture rolls onto the venture's row, matching
        # how the tools host treats `/slug/page.html`.
        "2026-09-02T10:03:00+00:00 200 /job-margin-variance__why-it-cost-more.html",
        "2026-09-02T10:04:00+00:00 200 /seller-net-sheet__index.html",
    ]
    counts = module.count_lines(lines, "2026-09-02")
    assert module.fold_for_app(counts, "portfolio-front") == {
        module.FRONT_KEY: 1,
        f"{module.FRONT_TOOL_PREFIX}job-margin-variance": 3,
        f"{module.FRONT_TOOL_PREFIX}seller-net-sheet": 1,
    }


def test_each_category_page_keeps_its_own_row_rather_than_folding_into_one() -> None:
    """`/c/trades/` and `/c/logistics/` are different pages and must count apart.

    A category page's logged `$uri` carries `MIRROR_SEPARATOR` exactly as a
    mirrored tool's does, because `try_files` resolves `/c/trades/` onto the
    flattened ConfigMap key `/c__trades.html`. Split on the separator like a
    tool, all seven collapse onto a single `_front/c` row — which reads in the
    stored history as a venture called `c` that does not exist, and loses the
    signal the pages were published for: which category a visitor browses is
    the same question as which tool they open.
    """
    module = _load_aggregate()
    lines = [
        "2026-09-02T10:00:00+00:00 200 /index.html",
        "2026-09-02T10:01:00+00:00 200 /c__trades.html",
        "2026-09-02T10:02:00+00:00 200 /c__trades.html",
        "2026-09-02T10:03:00+00:00 200 /c__logistics.html",
        # A real mirrored tool alongside them, so the two branches are shown
        # not to capture each other's lines.
        "2026-09-02T10:04:00+00:00 200 /job-margin-variance__index.html",
    ]
    counts = module.count_lines(lines, "2026-09-02")
    assert module.fold_for_app(counts, "portfolio-front") == {
        module.FRONT_KEY: 1,
        f"{module.FRONT_TOOL_PREFIX}c/trades": 2,
        f"{module.FRONT_TOOL_PREFIX}c/logistics": 1,
        f"{module.FRONT_TOOL_PREFIX}job-margin-variance": 1,
    }
    # And the name matches what the catalogue host calls the same page, so one
    # page is one name whichever host served it.
    assert module.slug_for("/c/trades/index.html") == "c/trades"


def test_a_mirrored_tools_row_cannot_be_confused_with_the_catalogues() -> None:
    # While both hosts serve the same tool, a shared bare `<slug>` row would mix
    # a visit to the apex copy with a visit to the catalogue's -- and whether
    # the mirror earns its keep is exactly that difference.
    module = _load_aggregate()
    assert module.FRONT_TOOL_PREFIX.startswith(module.FRONT_KEY)
    counts = module.count_lines(
        ["2026-09-02T10:00:00+00:00 200 /job-margin-variance__index.html"], "2026-09-02"
    )
    row = next(iter(module.fold_for_app(counts, "portfolio-front")))
    assert row == "_front/job-margin-variance"
    assert row != "job-margin-variance"


def test_the_mirrors_non_page_assets_are_not_counted_as_views() -> None:
    # `calc.mjs` and `LICENSE` are fetched by the page, not visited. `slug_for`
    # already drops anything without a page suffix; this pins that the mirror's
    # flattened names did not accidentally start looking like pages.
    module = _load_aggregate()
    lines = [
        "2026-09-02T10:00:00+00:00 200 /job-margin-variance__calc.mjs",
        "2026-09-02T10:00:01+00:00 200 /job-margin-variance__usage.mjs",
        "2026-09-02T10:00:02+00:00 200 /job-margin-variance__LICENSE",
    ]
    assert module.count_lines(lines, "2026-09-02") == {}


def test_a_pod_with_no_views_adds_no_row() -> None:
    # A slug with no views is absent from a day rather than present as 0, and
    # the front door follows the same rule -- `total[key] += 0` would have
    # inserted one.
    module = _load_aggregate()
    assert module.fold_for_app({}, "portfolio-front") == {}
    assert module.fold_for_app({}, "portfolio-site") == {}


def test_an_unrecognised_workload_contributes_nothing() -> None:
    # Guessing a key would put an unexplained row in a file whose whole value
    # is that every row means something. `main` reports the pod on stderr.
    module = _load_aggregate()
    assert module.fold_for_app({"x": 3}, "something-else") == {}
    assert module.fold_for_app({"x": 3}, None) == {}


def test_the_selector_and_the_key_map_name_the_same_workloads() -> None:
    """The one way this silently loses a workload's traffic.

    A selector that matches a pod `APP_KEYS` does not know skips it (counted
    nowhere, reported only on stderr); a key for an app the selector never
    matches is a row that can never appear. Either drift is invisible in
    production, so it is pinned here.
    """
    module = _load_aggregate()
    cron = next(
        doc
        for doc in yaml.safe_load_all(SITE_USAGE.read_text())
        if doc and doc.get("kind") == "CronJob"
    )
    env = {
        e["name"]: e["value"]
        for e in cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]["env"]
    }
    selector = env["USAGE_SELECTOR"]
    named = {part.strip() for part in selector.split("(")[1].rstrip(")").split(",")}
    assert named == set(module.APP_KEYS)

    # And every app named there is really a workload in this namespace, with
    # that label on its pods.
    labels = set()
    for path in (ROOT / "prod").glob("*.yaml"):
        for doc in yaml.safe_load_all(path.read_text()):
            if doc and doc.get("kind") == "Deployment":
                labels.add(doc["spec"]["template"]["metadata"]["labels"]["app"])
    assert named <= labels, f"{named - labels} is selected but no Deployment carries it"
