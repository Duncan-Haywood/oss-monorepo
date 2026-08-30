"""The public site's usage signal: what it counts, and what it must never see.

Two halves. The first pins the privacy property at its source — nginx is
configured to write three fields, so no later change to the aggregator can
start reporting an address or a user agent, because none was recorded. The
second is ordinary unit coverage of the reduction from log lines to counts.

No cluster required.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SITE_USAGE = ROOT / "prod" / "site-usage.yaml"
AGGREGATE = ROOT / "prod" / "usage" / "aggregate.py"


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


def test_usage_job_is_synced_and_mounts_the_script_from_git() -> None:
    kustomization = yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())
    assert "site-usage.yaml" in kustomization["resources"]
    generated = {g["name"] for g in kustomization["configMapGenerator"]}
    assert "portfolio-site-usage-script" in generated
    # A name suffix hash would rename the ConfigMap out from under the
    # CronJob, which references it literally.
    assert kustomization["generatorOptions"]["disableNameSuffixHash"] is True

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
    # Which category page someone lands on is the same kind of signal as
    # which tool; collapsing all seven into one "c" row would hide it.
    assert slug_for("/c/marketplace/index.html") == "c/marketplace"
    # Assets say nothing about a person choosing to use a tool, and counting
    # them would scale every number by whatever each page happens to load.
    for asset in ("/amazon-fba-calculator/calc.mjs", "/pf-chrome.css", "/sitemap.xml", "/icon-192.png"):
        assert slug_for(asset) is None, asset


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
