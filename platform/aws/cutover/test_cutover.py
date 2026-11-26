"""Tests for the cutover orchestrator, against the fakes (no network).

    python3 -m pytest platform/aws/cutover -q
"""

from __future__ import annotations

import copy
import datetime as dt
import importlib.util
import io
import json
import shutil
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


C = load("cutover_under_test", HERE / "cutover.py")
F = load("cutover_fakes_under_test", HERE / "fakes.py")
WORLD = json.loads((HERE / "fixtures" / "world.json").read_text())
TOKEN = WORLD["aws"]["secrets"]["cutover/cloudflare-api-token"]
PADDLE_KEY = json.loads(WORLD["aws"]["secrets"]["cutover/paddle-api-key"])["api_key"]


def ctx_for(tmp_path, world=None, plan_only=False, exported=True):
    stack = tmp_path / "stack"
    stack.mkdir(exist_ok=True)
    if exported:
        shutil.copy(HERE / "fixtures" / "inventory.generated.json", stack / "inventory.generated.json")
    else:
        (stack / "inventory.generated.json").write_text('{"exported": false, "hosts": {}}')
    out = io.StringIO()
    ctx = F.build(HERE / "fixtures", C.load_config(), plan_only=plan_only, state_file=str(tmp_path / "state.json"),
                  module=C, world_data=world if world is not None else copy.deepcopy(WORLD), stack=stack)
    ctx.out = out
    return ctx


def reopen(tmp_path, ctx, plan_only=False):
    """A later run: the same world and state, a new process."""
    nxt = F.build(HERE / "fixtures", C.load_config(), plan_only=plan_only, state_file=str(tmp_path / "state.json"),
                  module=C, world_data=ctx.world.d, stack=ctx.stack)
    nxt.out = ctx.out
    return nxt


def advance(ctx, **kw):
    ctx.clock.sleep(dt.timedelta(**kw).total_seconds())


def new_token(ctx, hours=24):
    """What the owner does before a later run: a fresh token with an end date."""
    exp = ctx.clock.now() + dt.timedelta(hours=hours)
    ctx.world.cf["token"] = {"id": "tok-fake-2", "status": "active", "expires_on": exp.strftime("%Y-%m-%dT%H:%M:%SZ")}


def go(ctx, *stages, only=None):
    return C.run(ctx, list(stages), only, ctx.stack)


def host_shape(ctx, host):
    cf = ctx.world.cf
    if any(d["hostname"] == host for d in cf["domains"]):
        return "custom-domain"
    recs = [r for r in cf["records"] if r["name"] == host and r["type"] in ("A", "AAAA", "CNAME")]
    if not recs:
        return "absent"
    return f"{recs[0]['type']} {recs[0]['content']}"


# ------------------------------------------------------------ checksums ----

def test_checksum_matches_the_lambda_vectors():
    v = json.loads((HERE / "canon_vectors.json").read_text())
    for n, s in v["numbers"]:
        assert C.canon_value(float(n) if isinstance(n, float) else n) == s
        assert C.js_number(float(n)) == s
    for case in v["rows"]:
        assert C.row_digest(case["row"]) == case["digest"]
    assert C.table_checksum(v["table"]["rows"]) == {"count": v["table"]["count"], "sha256": v["table"]["sha256"]}


def test_checksum_is_type_erased_and_order_free():
    assert C.row_digest({"id": 7, "f": 1}) == C.row_digest({"id": "7", "f": True})
    assert C.row_digest({"a": None}) != C.row_digest({"a": ""})
    rows = [{"id": i} for i in range(5)]
    assert C.table_checksum(rows) == C.table_checksum(list(reversed(rows)))
    assert C.table_checksum(rows) != C.table_checksum(rows[1:])
    assert C.canon_value(2**64 + 1) == str(2**64 + 1)   # D1 integers beyond 2^53 stay exact


# --------------------------------------------------------------- config ----

def test_real_config_loads():
    cfg = C.load_config()
    names = [a["name"] for a in cfg["apps"]]
    assert names[:2] == ["site", "grants-redirect"]
    assert "shift-roster" in names


@pytest.mark.parametrize("mutate, msg", [
    (lambda a: a.update(name="Bad Name"), "app name"),
    (lambda a: a.update(hosts=["evil.example.com"]), "outside"),
    (lambda a: a.update(aws={"kind": "s3", "account": "apps"}), "aws.kind"),
    (lambda a: a.update(data={"d1_database": "x", "product": "postgres; drop"}), "product"),
    (lambda a: a.update(data={"d1_database": "x", "product": "pp"}, freeze=False), "always frozen"),
    (lambda a: a.update(paddle={"notification_setting_id": "ntfset_1", "aws_destination": "https://evil.example.com/"}), "AWS https URL"),
])
def test_config_validation(mutate, msg):
    cfg = C.load_config()
    a = copy.deepcopy(cfg["apps"][0])
    mutate(a)
    cfg["apps"] = [a]
    with pytest.raises(C.CutoverError, match=msg):
        C.validate_config(cfg)


def test_duplicate_hosts_are_refused():
    cfg = C.load_config()
    cfg["apps"].append({**copy.deepcopy(cfg["apps"][0]), "name": "copy"})
    with pytest.raises(C.CutoverError, match="repeated"):
        C.validate_config(cfg)


# ---------------------------------------------------------------- export ----

def test_export_inventories_without_secrets(tmp_path):
    ctx = ctx_for(tmp_path, exported=False)
    assert go(ctx, "export") == 0
    inv = json.loads((ctx.stack / "inventory.generated.json").read_text())
    imports = (ctx.stack / "imports.generated.tf").read_text()
    assert inv["hosts"]["marisstella.app"] == {"kind": "worker_custom_domain", "id": "cd0000site", "service": "monorepo-projects-site", "environment": "production"}
    assert inv["hosts"]["app.demo.marisstella.app"]["kind"] == "record"
    assert inv["hosts"]["www.marisstella.app"] == {"kind": "absent"}
    # Records owned by custom domains or by switch.tf are not imported twice.
    assert "rec00001aaaa" not in imports and "rec00003cccc" not in imports
    assert 'id = "f1e2d3c4b5a69788f1e2d3c4b5a69788/rec00004dddd"' in imports          # the MX
    assert "cloudflare_email_routing_rule." in imports and "cloudflare_r2_bucket.site_assets" in imports
    assert 'id = "zones/f1e2d3c4b5a69788f1e2d3c4b5a69788/rs0000redir"' in imports
    assert "cloudflare_workers_script" not in imports and "cloudflare_pages_project" not in imports
    everything = "".join(p.read_text() for p in ctx.stack.iterdir()) + ctx.out.getvalue()
    assert "supersecret-value-never-exported" not in everything
    assert TOKEN not in everything
    assert (ctx.stack / "resources.generated.tf").exists()


def test_export_matches_the_committed_fixture(tmp_path):
    ctx = ctx_for(tmp_path, exported=False)
    go(ctx, "export")
    assert json.loads((ctx.stack / "inventory.generated.json").read_text()) == json.loads((HERE / "fixtures" / "inventory.generated.json").read_text())


def test_unreadable_parts_are_reported_not_fatal(tmp_path):
    w = copy.deepcopy(WORLD)
    w["fail"]["unreadable"] = [f"/accounts/{w['cloudflare']['zone']['account']['id']}/r2/buckets"]
    ctx = ctx_for(tmp_path, world=w, exported=False)
    assert go(ctx, "export") == 0
    assert "NOT READ" in ctx.out.getvalue() and "R2 buckets" in ctx.out.getvalue()


@pytest.mark.parametrize("token, msg", [
    ({"id": "t", "status": "active"}, "no expiry"),
    ({"id": "t", "status": "active", "expires_on": "2026-12-31T00:00:00Z"}, "the limit is 72 h"),
    ({"id": "t", "status": "disabled", "expires_on": "2026-12-02T00:00:00Z"}, "not active"),
])
def test_long_lived_or_dead_tokens_are_refused(tmp_path, token, msg):
    w = copy.deepcopy(WORLD)
    w["cloudflare"]["token"] = token
    ctx = ctx_for(tmp_path, world=w, exported=False)
    assert go(ctx, "export") == 1
    assert msg in ctx.out.getvalue()


def test_every_run_rechecks_the_token(tmp_path):
    ctx = ctx_for(tmp_path)
    assert go(ctx, "prepare") == 0
    advance(ctx, hours=31)                      # the fixture token's end date passes
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "switch") == 1
    assert "make a new one" in ctx.out.getvalue()
    assert all(a["status"] == "pending" for a in ctx.state["apps"].values())


# --------------------------------------------------------- the happy path ----

def full_run(tmp_path, world=None):
    ctx = ctx_for(tmp_path, world=world)
    assert go(ctx, "prepare") == 0, ctx.out.getvalue()
    advance(ctx, hours=1, minutes=1)           # the demo app's lowered TTL
    ctx = reopen(tmp_path, ctx)
    code = go(ctx, "switch", "verify")
    return ctx, code


def test_prepare_switch_verify(tmp_path):
    ctx, code = full_run(tmp_path)
    assert code == 0, ctx.out.getvalue()
    st = ctx.state
    assert all(a["status"] == "switched" for a in st["apps"].values())
    assert st["global"]["verified_at"]
    assert host_shape(ctx, "marisstella.app") == "CNAME d111111abcdef8.cloudfront.net"
    assert host_shape(ctx, "app.demo.marisstella.app") == "CNAME d-dmo0000001.execute-api.us-east-1.amazonaws.com"
    w = ctx.world.d
    d1 = w["cloudflare"]["d1"][0]["tables"]
    pg = w["aws"]["pg"]["demo_paid"]["tables"]
    for t in d1:
        assert C.table_checksum(pg[t]["rows"]) == C.table_checksum(d1[t]["rows"])
    assert w["paddle"]["settings"]["ntfset_01demo"]["destination"].endswith(".on.aws/")
    fw = [r for r in w["cloudflare"]["rulesets"] if r["phase"] == "http_request_firewall_custom"]
    assert all(not r["rules"] for r in fw), "writes are unfrozen"
    assert w["aws"]["sent"] == ["ToAddresses=success@simulator.amazonses.com"]
    # The ACM record for hub was written before its switch, and kept.
    assert any(r["name"] == "_h1a2.hub.marisstella.app" for r in w["cloudflare"]["records"])
    # MX and the Email Routing records are untouched.
    assert any(r["type"] == "MX" for r in w["cloudflare"]["records"])
    # Every DNS change was a targeted apply of the switch resources.
    assert all(a["scoped"] for a in ctx.tofu.applies[1:])


def test_secrets_never_reach_logs_or_state(tmp_path):
    ctx, _ = full_run(tmp_path)
    text = ctx.out.getvalue() + "\n".join(ctx.summary) + (tmp_path / "state.json").read_text()
    for secret in (TOKEN, PADDLE_KEY, "supersecret-value-never-exported"):
        assert secret not in text
    # Customer data never enters the run state either: counts and digests only.
    assert "a@example.com" not in (tmp_path / "state.json").read_text()


def test_switch_is_idempotent(tmp_path):
    ctx, _ = full_run(tmp_path)
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "switch") == 0
    assert not ctx.tofu.applies, "a finished switch is not applied again"


def test_switch_refuses_before_prepare(tmp_path):
    ctx = ctx_for(tmp_path)
    assert go(ctx, "switch") == 1
    assert "zero-diff" in ctx.out.getvalue()


def test_prepare_refuses_without_an_export(tmp_path):
    ctx = ctx_for(tmp_path, exported=False)
    assert go(ctx, "prepare") == 1
    assert "no export yet" in ctx.out.getvalue()


def test_prepare_refuses_when_cloudflare_drifted_since_export(tmp_path):
    w = copy.deepcopy(WORLD)
    w["cloudflare"]["records"].append({"id": "new1", "name": "new.marisstella.app", "type": "A", "content": "192.0.2.9", "proxied": False, "ttl": 300})
    ctx = ctx_for(tmp_path, world=w)
    assert go(ctx, "prepare") == 1
    assert "re-run export" in ctx.out.getvalue()


def test_prepare_refuses_a_non_empty_postgres_table(tmp_path):
    w = copy.deepcopy(WORLD)
    w["aws"]["pg"]["demo_paid"]["tables"]["customers"]["rows"] = [{"id": 99, "email": "x", "name": "x", "created_at": "x"}]
    ctx = ctx_for(tmp_path, world=w)
    assert go(ctx, "prepare") == 1
    assert "already has 1 rows" in ctx.out.getvalue()


def test_prepare_refuses_when_the_aws_endpoint_is_missing(tmp_path):
    w = copy.deepcopy(WORLD)
    w["aws"]["cloudfront"][0]["aliases"].remove("www.marisstella.app")
    ctx = ctx_for(tmp_path, world=w)
    assert go(ctx, "prepare") == 1
    assert "no CloudFront distribution" in ctx.out.getvalue()


# ------------------------------------------------- failures and rollback ----

def test_dns_failure_rolls_the_app_back_and_a_rerun_finishes(tmp_path):
    w = copy.deepcopy(WORLD)
    w["fail"]["apply"] = {"host": "app.demo.marisstella.app"}
    ctx, code = full_run(tmp_path, world=w)
    assert code == 1
    demo = ctx.state["apps"]["demo-paid"]
    assert demo["status"] == "rolled_back"
    assert host_shape(ctx, "app.demo.marisstella.app") == "A 192.0.2.50"
    assert ctx.world.d["paddle"]["settings"]["ntfset_01demo"]["destination"].startswith("https://demo-paid.example.workers.dev")
    fw = [r for r in ctx.world.cf["rulesets"] if r["phase"] == "http_request_firewall_custom"]
    assert all(not r["rules"] for r in fw)
    # Apps before it stay switched.
    assert ctx.state["apps"]["site"]["status"] == "switched"
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "switch", "verify") == 0, ctx.out.getvalue()
    assert ctx.state["apps"]["demo-paid"]["status"] == "switched"
    pg = ctx.world.d["aws"]["pg"]["demo_paid"]["tables"]
    assert len(pg["invoices"]["rows"]) == 7, "the re-copy replaced the first attempt's rows"


def test_copy_failure_midway_resumes_with_a_full_recopy(tmp_path):
    w = copy.deepcopy(WORLD)
    w["fail"]["import_batch"] = {"table": "invoices", "batch": 1}
    old = C.BATCH_BYTES
    C.BATCH_BYTES = 120                        # several batches for seven rows
    try:
        ctx, code = full_run(tmp_path, world=w)
        assert code == 1 and "connection reset" in ctx.out.getvalue()
        assert ctx.state["apps"]["demo-paid"]["status"] == "rolled_back"
        ctx = reopen(tmp_path, ctx)
        assert go(ctx, "switch") == 0, ctx.out.getvalue()
    finally:
        C.BATCH_BYTES = old
    d1 = ctx.world.cf["d1"][0]["tables"]["invoices"]["rows"]
    assert C.table_checksum(ctx.world.d["aws"]["pg"]["demo_paid"]["tables"]["invoices"]["rows"]) == C.table_checksum(d1)


def test_a_write_during_the_freeze_fails_the_copy_check(tmp_path):
    ctx = ctx_for(tmp_path)
    go(ctx, "prepare")
    advance(ctx, hours=2)
    ctx = reopen(tmp_path, ctx)
    real = C.copy_app_data

    def copy_then_write(c, app):
        out = real(c, app)
        c.world.cf["d1"][0]["tables"]["customers"]["rows"].append({"id": 4, "email": "late@example.com", "name": None, "created_at": "x"})
        return out

    C.copy_app_data = copy_then_write
    try:
        assert go(ctx, "switch") == 1
    finally:
        C.copy_app_data = real
    assert "changed during the freeze" in ctx.out.getvalue()
    assert ctx.state["apps"]["demo-paid"]["status"] == "rolled_back"
    assert host_shape(ctx, "app.demo.marisstella.app") == "A 192.0.2.50"


def test_verify_failure_rolls_every_app_back(tmp_path):
    w = copy.deepcopy(WORLD)
    w["fail"]["crawl_404"] = ["/b/"]
    ctx, code = full_run(tmp_path, world=w)
    assert code == 1
    assert "rolling back every switched app" in ctx.out.getvalue()
    assert all(a["status"] == "rolled_back" for a in ctx.state["apps"].values())
    assert host_shape(ctx, "marisstella.app") == "custom-domain"
    assert host_shape(ctx, "grants.marisstella.app") == "custom-domain"
    assert host_shape(ctx, "hub.marisstella.app") == "absent"
    assert "verified_at" not in ctx.state["global"]


def test_paddle_test_failure_rolls_back(tmp_path):
    w = copy.deepcopy(WORLD)
    w["fail"]["paddle_test"] = True
    ctx, code = full_run(tmp_path, world=w)
    assert code == 1 and "Paddle test event answered [500]" in ctx.out.getvalue()
    assert ctx.world.d["paddle"]["settings"]["ntfset_01demo"]["destination"].startswith("https://demo-paid.example.workers.dev")


def test_unhealthy_host_rolls_back_only_that_app(tmp_path):
    w = copy.deepcopy(WORLD)
    w["fail"]["unhealthy"] = ["markets.marisstella.app"]
    ctx, code = full_run(tmp_path, world=w)
    assert code == 1
    assert ctx.state["apps"]["ai-first-markets"]["status"] == "rolled_back"
    assert ctx.state["apps"]["listing-lens"]["status"] == "switched"
    assert host_shape(ctx, "markets.marisstella.app") == "absent"


def test_manual_rollback_reports_rows_written_on_aws(tmp_path):
    ctx, _ = full_run(tmp_path)
    ctx.world.d["aws"]["pg"]["demo_paid"]["tables"]["customers"]["rows"].append({"id": 4, "email": "new@example.com", "name": "N", "created_at": "x"})
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "rollback", only="demo-paid") == 0
    demo = ctx.state["apps"]["demo-paid"]
    assert demo["status"] == "rolled_back"
    assert demo["reconcile"][0]["rows"] == {"customers": 1}
    assert host_shape(ctx, "app.demo.marisstella.app") == "A 192.0.2.50"


# ------------------------------------------------------------ plan mode ----

def test_plan_mode_changes_nothing(tmp_path):
    ctx = ctx_for(tmp_path, plan_only=True)
    before = copy.deepcopy(ctx.world.d)
    assert go(ctx, "prepare", "switch", "verify") == 0, ctx.out.getvalue()
    assert ctx.world.d == before
    assert not (tmp_path / "state.json").exists()
    assert not ctx.tofu.applies
    assert all(m == "GET" or p.endswith("/query") for m, p in ctx.cf.calls)
    out = ctx.out.getvalue()
    assert "switch (plan): 8 Cloudflare change(s)" in out
    assert "demo-paid: freeze -> copy D1 -> Postgres" in out


def test_plan_mode_clients_refuse_writes(tmp_path):
    ctx = ctx_for(tmp_path, plan_only=True)
    with pytest.raises(C.CutoverError, match="plan mode"):
        ctx.cf.request("DELETE", "/zones/x")
    with pytest.raises(C.CutoverError):
        ctx.aws.invoke("apps:operate", "saas-starter-db-admin", {"action": "import"})
    with pytest.raises(C.CutoverError, match="plan mode"):
        ctx.tofu.apply({})


# ---------------------------------------------------------------- retire ----

def test_retire_waits_for_the_cooloff_then_deletes_only_what_is_listed(tmp_path, monkeypatch):
    ctx, code = full_run(tmp_path)
    assert code == 0
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "retire") == 1 and "cool-off until" in ctx.out.getvalue()
    advance(ctx, days=8)
    new_token(ctx)
    retire = HERE / "retire.json"
    orig = retire.read_text()
    monkeypatch.setattr(C, "HERE", tmp_path)
    (tmp_path / "retire.json").write_text(json.dumps({"workers": ["grant-autopilot", "demo-paid"], "tofu_destroy": ["cloudflare_d1_database.demo_paid"]}))
    ctx.world.d["tofu"]["removed_from_config"] = ["cloudflare_d1_database.demo_paid"]
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "retire") == 0, ctx.out.getvalue()
    names = {s["name"] for s in ctx.world.cf["scripts"]}
    assert names == {"monorepo-projects-site", "legacy-redirects"}
    assert retire.read_text() == orig


def test_retire_refuses_unlisted_deletions_and_routed_workers(tmp_path, monkeypatch):
    ctx, _ = full_run(tmp_path)
    advance(ctx, days=8)
    new_token(ctx)
    monkeypatch.setattr(C, "HERE", tmp_path)
    (tmp_path / "retire.json").write_text(json.dumps({"workers": [], "tofu_destroy": []}))
    ctx.world.d["tofu"]["removed_from_config"] = ["cloudflare_email_routing_rule.support_er000000"]
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "retire") == 1 and "does not list as deletions" in ctx.out.getvalue()
    (tmp_path / "retire.json").write_text(json.dumps({"workers": ["legacy-redirects"], "tofu_destroy": []}))
    ctx.world.d["tofu"].pop("removed_from_config", None)
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "retire") == 1 and "Workers still routed" in ctx.out.getvalue()


def test_retire_refuses_when_d1_still_takes_writes(tmp_path, monkeypatch):
    ctx, _ = full_run(tmp_path)
    advance(ctx, days=8)
    new_token(ctx)
    ctx.world.cf["d1"][0]["tables"]["customers"]["rows"].append({"id": 9, "email": "z", "name": "z", "created_at": "z"})
    monkeypatch.setattr(C, "HERE", tmp_path)
    (tmp_path / "retire.json").write_text(json.dumps({"workers": [], "tofu_destroy": []}))
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "retire") == 1 and "something still writes to Cloudflare" in ctx.out.getvalue()


# ---------------------------------------------------------- secrets end ----

def test_delete_secrets(tmp_path):
    ctx = ctx_for(tmp_path)
    assert go(ctx, "delete-secrets") == 0
    assert ctx.world.d["aws"]["secrets"] == {}
    assert sum(e["stage"] == "delete-secrets" for e in ctx.state["history"]) == 2
    ctx = reopen(tmp_path, ctx)
    assert go(ctx, "delete-secrets") == 0 and "not present" in ctx.out.getvalue()


def test_cli_dry_run(tmp_path, capsys):
    shutil.copytree(HERE / "fixtures", tmp_path / "fx")
    assert C.main(["--fixtures", str(tmp_path / "fx"), "--state", str(tmp_path / "s.json"), "--plan", "prepare", "switch"]) == 0
    assert "switch (plan)" in capsys.readouterr().out


# ---------------------------------------------------- the agent-run path ----

def test_budget_stops_before_an_app_that_would_not_fit(tmp_path):
    ctx = ctx_for(tmp_path)
    assert go(ctx, "prepare") == 0
    advance(ctx, hours=1, minutes=1)
    ctx = reopen(tmp_path, ctx)
    ctx.budget_minutes = 12               # room for about one app plus verify
    assert go(ctx, "switch") == 1
    out = ctx.out.getvalue()
    assert "time budget" in out and "switched apps stay switched" in out
    statuses = [a["status"] for a in ctx.state["apps"].values()]
    assert "switched" in statuses and "pending" in statuses and "rolled_back" not in statuses


def test_cli_apply_flag_and_report(tmp_path, capsys):
    shutil.copytree(HERE / "fixtures", tmp_path / "fx")
    state, report = str(tmp_path / "s.json"), tmp_path / "report.md"
    assert C.main(["--fixtures", str(tmp_path / "fx"), "--state", state, "prepare"]) == 0
    w = json.loads((tmp_path / "s.world.json").read_text())
    w["now"] = "2026-12-01T16:10:00Z"     # past the demo app's lowered TTL
    (tmp_path / "s.world.json").write_text(json.dumps(w))
    assert C.main(["--fixtures", str(tmp_path / "fx"), "--state", state, "--apply", "--report", str(report)]) == 0
    text = report.read_text()
    assert "Result: OK" in text and "- demo-paid: switched" in text and "min budget" in text
    assert TOKEN not in text
    assert C.main(["--fixtures", str(tmp_path / "fx"), "--state", state, "--rollback", "--app", "site"]) == 0
    assert json.loads(Path(state).read_text())["apps"]["site"]["status"] == "rolled_back"


def test_cli_needs_a_stage():
    with pytest.raises(SystemExit):
        C.main([])
