#!/usr/bin/env python3
"""Cloudflare -> AWS cutover orchestrator (README.md beside this file).

Stages, each idempotent and resumable from the run state (S3, or a local file):

  export    inventory the Cloudflare account; write inventory.generated.json and
            imports.generated.tf into platform/aws/stacks/cloudflare, then let
            `tofu plan -generate-config-out` write resources.generated.tf
  prepare   adopt the committed config into state and prove a zero diff; find
            each app's AWS endpoint and certificate (writing ACM validation
            records if needed); check AWS health; lower TTLs; dry-run the data
            copy; check the email identity and the Paddle receiver
  switch    per app: freeze writes at Cloudflare's edge, copy D1 -> Postgres and
            verify counts and checksums, repoint Paddle, move DNS, check health,
            unfreeze. Any failure rolls that app back automatically
  verify    every app's health from AWS, a zero-diff plan, email, Paddle test
            event, a sitemap crawl; any failure rolls every switched app back
  rollback  by hand: every switched app back to Cloudflare
  retire    after the cool-off: delete what retire.json and the plan agree on
  delete-secrets  remove the cutover/* secrets from AWS Secrets Manager

    python3 -I platform/aws/cutover/cutover.py --plan prepare switch   # read-only preview
    python3 -I platform/aws/cutover/cutover.py prepare switch verify
    python3 -I platform/aws/cutover/cutover.py --fixtures platform/aws/cutover/fixtures prepare switch verify

Standard library only: it runs in a privileged job, where every file it loads
must be owner-owned (platform/ci/ci_policy_check.py), and nothing is installed.
No secret value and no row of customer data is ever printed or written to the
state: the state holds counts, checksums, IDs and timestamps.
"""

from __future__ import annotations

import argparse
import datetime as dt
import decimal
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
STACK = REPO / "platform" / "aws" / "stacks" / "cloudflare"
CF_API = "https://api.cloudflare.com/client/v4"
PADDLE_API = {"live": "https://api.paddle.com", "sandbox": "https://sandbox-api.paddle.com"}
SECRET_CLOUDFLARE = "cutover/cloudflare-api-token"
SECRET_PADDLE = "cutover/paddle-api-key"
STATE_KEY = "cloudflare/cutover-state.json"
MAX_TOKEN_HOURS = 72
FREEZE_PHASE = "http_request_firewall_custom"
SWITCH_TARGETS = [
    "terraform_data.inputs",
    "cloudflare_workers_custom_domain.host",
    "cloudflare_dns_record.host",
    "cloudflare_dns_record.aws",
    "cloudflare_dns_record.acm",
]
APP_NAME = re.compile(r"^[a-z][a-z0-9-]{1,40}$")
PRODUCT = re.compile(r"^[a-z][a-z0-9_]{1,40}$")
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
AWS_ACCOUNTS = ("shared-infra", "apps")
BATCH_BYTES = 4_000_000  # under Lambda's 6 MB synchronous payload
# The owner's window: credentials valid for an hour, the whole switch well inside it.
# Per-app estimates, measured against the fakes plus the real waits in wait_served.
APP_SWITCH_MINUTES = 4
VERIFY_MINUTES = 5
PROXY_TOKEN = "proxy-injected-cloudflare-token"  # replaced by the session's network secret


class CutoverError(Exception):
    pass


class NotFound(CutoverError):
    pass


# --------------------------------------------------------------- config ----


def load_config(root: Path = HERE) -> dict:
    """apps.json plus every apps.d/*.json (one file per app or product line,
    so sessions adding apps do not edit the same file)."""
    base = json.loads((root / "apps.json").read_text(encoding="utf-8"))
    apps = list(base.get("apps", []))
    for f in sorted((root / "apps.d").glob("*.json")):
        apps += json.loads(f.read_text(encoding="utf-8")).get("apps", [])
    cfg = {
        "zone": base["zone"],
        "apps": apps,
        "cooloff_days": int(base.get("cooloff_days", 7)),
        "route53_track": bool(base.get("route53_track", False)),
        "email_from": base.get("email_from", f"cutover-check@{base['zone']}"),
    }
    validate_config(cfg)
    return cfg


def validate_config(cfg: dict) -> None:
    zone = cfg["zone"]
    names, hosts = set(), set()
    for a in cfg["apps"]:
        n = a.get("name", "")
        if not APP_NAME.match(n) or n in names:
            raise CutoverError(f"app name {n!r} is not unique or not [a-z][a-z0-9-]")
        names.add(n)
        if not a.get("hosts"):
            raise CutoverError(f"{n}: no hosts")
        for h in a["hosts"]:
            if h in hosts or not (h == zone or h.endswith("." + zone)):
                raise CutoverError(f"{n}: host {h!r} is repeated or outside {zone}")
            hosts.add(h)
        aws = a.get("aws") or {}
        if aws.get("kind") not in ("cloudfront", "apigateway") or aws.get("account") not in AWS_ACCOUNTS:
            raise CutoverError(f"{n}: aws.kind must be cloudfront|apigateway and aws.account one of {AWS_ACCOUNTS}")
        if not str(a.get("health", "")).startswith("/"):
            raise CutoverError(f"{n}: health must be a path")
        d = a.get("data")
        if d is not None:
            if not d.get("d1_database") or not PRODUCT.match(d.get("product", "")):
                raise CutoverError(f"{n}: data needs d1_database and a product database name")
            if a.get("freeze") is False:
                raise CutoverError(f"{n}: an app with data is always frozen while it is copied")
        p = a.get("paddle")
        if p is not None:
            if not str(p.get("notification_setting_id", "")).startswith("ntfset_"):
                raise CutoverError(f"{n}: paddle.notification_setting_id must be ntfset_...")
            if not re.match(r"^https://[a-z0-9.-]+\.(on\.aws|amazonaws\.com)/", p.get("aws_destination", "")):
                raise CutoverError(f"{n}: paddle.aws_destination must be an AWS https URL")


def app_freezes(app: dict) -> bool:
    return bool(app.get("freeze", app.get("data") is not None))


# ------------------------------------------------------------ checksums ----
# The same canonical, type-erased digest as
# platform/aws/stacks/saas-starter/runtime/src/data-copy.mjs (canon_vectors.json).


def js_number(x: float) -> str:
    """A float spelled the way JavaScript's String(x) spells it."""
    if x != x or x in (float("inf"), float("-inf")):
        raise CutoverError("non-finite number")
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    d = decimal.Decimal(repr(abs(x)))
    digits = "".join(map(str, d.as_tuple().digits)).rstrip("0") or "0"
    exp = d.as_tuple().exponent + (len(d.as_tuple().digits) - len(digits))
    k = len(digits)
    n = k + exp
    if k <= n <= 21:
        s = digits + "0" * (n - k)
    elif 0 < n <= 21:
        s = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        s = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        s = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + s


def canon_value(v) -> str:
    if v is None:
        return "\u0000N"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return js_number(v)
    if isinstance(v, (bytes, bytearray)):
        return bytes(v).hex()
    if isinstance(v, list) and all(isinstance(b, int) and not isinstance(b, bool) and 0 <= b < 256 for b in v):
        return bytes(v).hex()
    if isinstance(v, (list, dict)):
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)
    return str(v)


def row_digest(row: dict) -> str:
    text = "\u001f".join(f"{k}={canon_value(row[k])}" for k in sorted(row))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def table_checksum(rows: list[dict]) -> dict:
    digests = sorted(row_digest(r) for r in rows)
    return {"count": len(rows), "sha256": hashlib.sha256("\n".join(digests).encode("utf-8")).hexdigest()}


# -------------------------------------------------------------- clients ----


def _json_request(url: str, method: str, headers: dict, body=None, timeout: int = 60):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={**headers, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read() or b"{}")
        except ValueError:
            payload = {}
        return e.code, payload


class Cloudflare:
    """The Cloudflare API with the run's token. Writes are refused in plan mode."""

    def __init__(self, token: str, plan_only: bool):
        self._headers = {"Authorization": f"Bearer {token}"}
        self.plan_only = plan_only

    def request(self, method: str, path: str, body=None, params=None):
        if self.plan_only and method != "GET" and not path.endswith("/query"):
            raise CutoverError(f"plan mode: refused {method} {path}")
        url = CF_API + path + ("?" + urllib.parse.urlencode(params) if params else "")
        status, payload = _json_request(url, method, self._headers, body)
        if status == 404:
            raise NotFound(f"{method} {path}: not found")
        if status >= 400 or not payload.get("success", False):
            errs = "; ".join(f"{e.get('code')}: {e.get('message')}" for e in payload.get("errors", []))
            raise CutoverError(f"{method} {path}: HTTP {status} {errs}"[:500])
        return payload.get("result")

    def all(self, path: str, params=None) -> list:
        out, page = [], 1
        while True:
            url = CF_API + path + "?" + urllib.parse.urlencode({**(params or {}), "page": page, "per_page": 100})
            status, payload = _json_request(url, "GET", self._headers)
            if status == 404:
                raise NotFound(f"GET {path}: not found")
            if status >= 400 or not payload.get("success", False):
                raise CutoverError(f"GET {path}: HTTP {status}")
            result = payload.get("result") or []
            out += result if isinstance(result, list) else [result]
            info = payload.get("result_info") or {}
            if not info.get("total_pages") or page >= info["total_pages"]:
                return out
            page += 1


class Paddle:
    def __init__(self, api_key: str, environment: str, plan_only: bool):
        if environment not in PADDLE_API:
            raise CutoverError("the Paddle secret's environment must be live or sandbox")
        self._base = PADDLE_API[environment]
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self.plan_only = plan_only

    def request(self, method: str, path: str, body=None):
        if self.plan_only and method != "GET":
            raise CutoverError(f"plan mode: refused {method} {path}")
        status, payload = _json_request(self._base + path, method, self._headers, body)
        if status >= 400:
            err = (payload.get("error") or {}).get("detail", "")
            raise CutoverError(f"Paddle {method} {path}: HTTP {status} {err}"[:300])
        return payload.get("data")


class Aws:
    """The aws CLI (preinstalled on GitHub's runners). The management
    credentials come from the job's web identity; member accounts through the
    cutover roles (stacks/cutover-access)."""

    ROLES = {"shared-infra:read": ("shared-infra", "cutover-read"), "apps:read": ("apps", "cutover-read"), "apps:operate": ("apps", "cutover-operate")}

    def __init__(self, region: str, plan_only: bool, run_id: str):
        self.region, self.plan_only, self.run_id = region, plan_only, run_id
        self._creds: dict[str, dict] = {}
        self._accounts: dict[str, str] | None = None
        # One AWS account, no Organization (stacks/cutover-access single_account):
        # every call runs with the caller's own role.
        self.single_account = os.environ.get("CUTOVER_SINGLE_ACCOUNT") == "true"

    def _run(self, args: list[str], env=None, check=True):
        p = subprocess.run(["aws", *args, "--region", self.region, "--output", "json"], capture_output=True, text=True, env=env, timeout=300)
        if check and p.returncode != 0:
            raise CutoverError(f"aws {' '.join(args[:2])}: {p.stderr.strip()[:400]}")
        return p

    def accounts(self) -> dict[str, str]:
        if self._accounts is None:
            out = json.loads(self._run(["organizations", "list-accounts"]).stdout)
            self._accounts = {a["Name"]: a["Id"] for a in out["Accounts"] if a.get("Status", "ACTIVE") == "ACTIVE"}
        return self._accounts

    def _env(self, role: str):
        if role == "mgmt" or self.single_account:
            return None
        if role not in self._creds:
            account, name = self.ROLES[role]
            arn = f"arn:aws:iam::{self.accounts()[account]}:role/cutover/{name}"
            out = json.loads(self._run(["sts", "assume-role", "--role-arn", arn, "--role-session-name", f"cutover-{self.run_id}"[:64]]).stdout)
            c = out["Credentials"]
            env = {k: v for k, v in os.environ.items() if not k.startswith("AWS_") or k in ("AWS_DEFAULT_REGION", "AWS_REGION")}
            env.update(AWS_ACCESS_KEY_ID=c["AccessKeyId"], AWS_SECRET_ACCESS_KEY=c["SecretAccessKey"], AWS_SESSION_TOKEN=c["SessionToken"])
            self._creds[role] = env
        return self._creds[role]

    def call(self, role: str, args: list[str]):
        p = self._run(args, env=self._env(role))
        return json.loads(p.stdout) if p.stdout.strip() else None

    def secret(self, name: str) -> str | None:
        p = self._run(["secretsmanager", "get-secret-value", "--secret-id", name, "--query", "SecretString"], check=False)
        if p.returncode != 0:
            if "ResourceNotFoundException" in p.stderr:
                return None
            raise CutoverError(f"could not read a cutover credential entry: {p.stderr.strip()[:200]}")
        return json.loads(p.stdout)

    def delete_secret(self, name: str) -> bool:
        p = self._run(["secretsmanager", "delete-secret", "--secret-id", name, "--force-delete-without-recovery"], check=False)
        if p.returncode != 0 and "ResourceNotFoundException" not in p.stderr:
            raise CutoverError(f"could not delete a cutover credential entry: {p.stderr.strip()[:200]}")
        return p.returncode == 0

    def invoke(self, role: str, function: str, payload: dict) -> dict:
        if self.plan_only and payload.get("action") not in ("inspect", "checksum"):
            raise CutoverError("plan mode: refused a writing db-admin action")
        with tempfile.TemporaryDirectory() as td:
            pin, pout = Path(td, "in.json"), Path(td, "out.json")
            os.chmod(td, 0o700)
            pin.write_text(json.dumps(payload))
            meta = json.loads(self._run(["lambda", "invoke", "--function-name", function, "--cli-binary-format", "raw-in-base64-out",
                                          "--payload", f"fileb://{pin}", str(pout)], env=self._env(role)).stdout)
            result = json.loads(pout.read_text() or "{}")
        if meta.get("FunctionError"):
            raise CutoverError(f"db-admin {payload.get('action')}: {str(result.get('errorMessage', ''))[:300]}")
        return result


class Http:
    def get(self, url: str, timeout: int = 20):
        req = urllib.request.Request(url, headers={"User-Agent": "cutover-check"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(2_000_000)
        except urllib.error.HTTPError as e:
            return e.code, {k.lower(): v for k, v in e.headers.items()}, b""
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            return 0, {}, str(e).encode()[:200]

    def post(self, url: str, body: bytes, timeout: int = 20):
        req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": "cutover-check"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
        except (urllib.error.URLError, TimeoutError, OSError):
            return 0


class Tofu:
    """OpenTofu on the Cloudflare stack. The token reaches it only through
    this process's environment."""

    def __init__(self, stack: Path, token: str, plan_only: bool, backend: dict | None):
        self.stack, self.plan_only, self.backend = stack, plan_only, backend
        self._env = {**os.environ, "CLOUDFLARE_API_TOKEN": token, "TF_IN_AUTOMATION": "1", "TF_INPUT": "0"}
        self._inited = False
        self._td = tempfile.mkdtemp(prefix="cutover-tofu-")

    def _tofu(self, args: list[str], check=True):
        p = subprocess.run(["tofu", f"-chdir={self.stack}", *args], capture_output=True, text=True, env=self._env, timeout=1800)
        if check and p.returncode != 0:
            raise CutoverError(f"tofu {args[0]} failed:\n{(p.stdout + p.stderr)[-3000:]}")
        return p

    def init(self):
        if self._inited:
            return
        args = ["init", "-input=false", "-lockfile=readonly"]
        if self.backend:
            args += [f"-backend-config={k}={v}" for k, v in self.backend.items()]
        else:
            args += ["-backend=false"]
        self._tofu(args)
        self._inited = True

    def _varfile(self, tfvars: dict) -> str:
        path = Path(self._td, "cutover.tfvars.json")
        path.write_text(json.dumps(tfvars, sort_keys=True))
        return str(path)

    def plan(self, tfvars: dict, targets=None, generate_out: str | None = None, lock: bool = True) -> list[dict]:
        self.init()
        out = str(Path(self._td, "tfplan"))
        args = ["plan", "-input=false", "-no-color", f"-var-file={self._varfile(tfvars)}", f"-out={out}"]
        args += [f"-target={t}" for t in targets or []]
        if generate_out:
            args.append(f"-generate-config-out={generate_out}")
        if self.plan_only or not lock:
            args.append("-lock=false")
        self._tofu(args)
        shown = json.loads(self._tofu(["show", "-json", out]).stdout)
        return [
            {"address": c["address"], "actions": c["change"]["actions"], "importing": bool(c["change"].get("importing"))}
            for c in shown.get("resource_changes", [])
        ]

    def apply(self, tfvars: dict, targets=None) -> list[dict]:
        if self.plan_only:
            raise CutoverError("plan mode: refused tofu apply")
        changes = self.plan(tfvars, targets)
        self._tofu(["apply", "-input=false", "-no-color", str(Path(self._td, "tfplan"))])
        return changes


class S3State:
    def __init__(self, aws: Aws, bucket: str, kms_key: str | None):
        self.aws, self.bucket, self.kms_key = aws, bucket, kms_key

    def load(self) -> dict | None:
        with tempfile.TemporaryDirectory() as td:
            out = Path(td, "state.json")
            p = self.aws._run(["s3api", "get-object", "--bucket", self.bucket, "--key", STATE_KEY, str(out)], check=False)
            if p.returncode != 0:
                if "NoSuchKey" in p.stderr:
                    return None
                raise CutoverError(f"could not read the run state: {p.stderr.strip()[:200]}")
            return json.loads(out.read_text())

    def save(self, state: dict) -> None:
        with tempfile.TemporaryDirectory() as td:
            f = Path(td, "state.json")
            f.write_text(json.dumps(state, indent=1, sort_keys=True))
            args = ["s3api", "put-object", "--bucket", self.bucket, "--key", STATE_KEY, "--body", str(f), "--server-side-encryption", "aws:kms"]
            if self.kms_key:
                args += ["--ssekms-key-id", self.kms_key]
            self.aws._run(args)


class FileState:
    def __init__(self, path: Path):
        self.path = path

    def load(self):
        return json.loads(self.path.read_text()) if self.path.exists() else None

    def save(self, state):
        self.path.write_text(json.dumps(state, indent=1, sort_keys=True))


class Clock:
    def now(self) -> dt.datetime:
        return dt.datetime.now(dt.timezone.utc)

    def sleep(self, s: float) -> None:
        time.sleep(s)


# -------------------------------------------------------------- context ----


def iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


class Ctx:
    def __init__(self, cfg, cf, paddle, aws, http, tofu, store, clock, plan_only=False, stack=STACK, out=None):
        self.cfg, self.cf, self.paddle, self.aws, self.http, self.tofu = cfg, cf, paddle, aws, http, tofu
        self.store, self.clock, self.plan_only, self.stack, self.out = store, clock, plan_only, stack, out
        self.summary: list[str] = []
        self.state = store.load() or {"version": 1, "global": {"steps": {}}, "apps": {}, "history": []}
        for a in cfg["apps"]:
            self.state["apps"].setdefault(a["name"], {"status": "pending", "steps": {}})
        self.inventory = None
        self.credential_expiry = ""
        self.timings: list[tuple[str, float]] = []
        self.started = clock.now()
        self.budget_minutes = 60.0

    # logging: never a secret, never a row
    def log(self, msg: str) -> None:
        print(msg, file=self.out or sys.stdout, flush=True)

    def note(self, msg: str) -> None:
        self.log(msg)
        self.summary.append(msg)

    def event(self, stage: str, what: str) -> None:
        self.state["history"].append({"at": iso(self.clock.now()), "stage": stage, "event": what})

    def save(self) -> None:
        if not self.plan_only:
            self.store.save(self.state)

    def gsteps(self) -> dict:
        return self.state["global"]["steps"]

    def asteps(self, app: str) -> dict:
        return self.state["apps"][app]["steps"]

    def step(self, steps: dict, name: str, fn):
        """Run fn once; a resumed run skips a step whose result is recorded."""
        if name in steps:
            return steps[name]
        t0 = self.clock.now()
        result = fn()
        took = round((self.clock.now() - t0).total_seconds(), 1)
        self.timings.append((name, took))
        if self.plan_only:
            return result
        steps[name] = {"at": iso(self.clock.now()), "seconds": took, **(result or {})}
        self.save()
        return steps[name]

    # --- inventory and tofu inputs
    def load_inventory(self) -> dict:
        if self.inventory is None:
            self.inventory = json.loads((self.stack / "inventory.generated.json").read_text())
        return self.inventory

    def switched_hosts(self, extra_app: str | None = None, without_app: str | None = None) -> dict:
        targets = {}
        for a in self.cfg["apps"]:
            st = self.state["apps"][a["name"]]
            on_aws = (st["status"] == "switched" or a["name"] == extra_app) and a["name"] != without_app
            for h in a["hosts"]:
                targets[h] = "aws" if on_aws else "cloudflare"
        return targets

    def tfvars(self, targets: dict) -> dict:
        g = self.state["global"]
        return {
            "targets": targets,
            "aws_targets": g.get("endpoints", {}),
            "acm_validation_records": g.get("acm_records", []),
            "ttl_cap": g.get("ttl_cap", 0),
        }

    def app(self, name: str) -> dict:
        return next(a for a in self.cfg["apps"] if a["name"] == name)


# ---------------------------------------------------------------- export ----


def _try(fn, missing: list, what: str):
    try:
        return fn()
    except CutoverError as e:
        missing.append(f"{what}: {str(e)[:160]}")
        return None


def slug(*parts: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", "_".join(p.lower() for p in parts if p)).strip("_")
    return s if s[:1].isalpha() else "r_" + s


def check_token(ctx: Ctx) -> dict:
    """The owner's design: a token that expires within 72 hours. Refuse any other."""
    t = ctx.cf.request("GET", "/user/tokens/verify")
    if t.get("status") != "active":
        raise CutoverError("the Cloudflare token is not active")
    exp = t.get("expires_on")
    if not exp:
        raise CutoverError("the Cloudflare token has no expiry; create it with a 24-48 h expiry (README.md, Owner steps)")
    left = (parse_iso(exp) - ctx.clock.now()).total_seconds() / 3600
    if left <= 0.25:
        raise CutoverError("the Cloudflare token expires within 15 minutes (or has): make a new one")
    if left > MAX_TOKEN_HOURS:
        raise CutoverError(f"the Cloudflare token expires in {left:.0f} h; the limit is {MAX_TOKEN_HOURS} h")
    return str(exp)


def inventory_account(ctx: Ctx) -> dict:
    cf, zone_name = ctx.cf, ctx.cfg["zone"]
    zones = cf.request("GET", "/zones", params={"name": zone_name})
    if len(zones or []) != 1:
        raise CutoverError(f"expected one zone {zone_name}, got {len(zones or [])}")
    zone = zones[0]
    zid, acct = zone["id"], zone["account"]["id"]
    missing: list[str] = []
    records = cf.all(f"/zones/{zid}/dns_records")
    domains = [d for d in (_try(lambda: cf.all(f"/accounts/{acct}/workers/domains"), missing, "Workers custom domains") or []) if d.get("zone_id") == zid]
    routes = _try(lambda: cf.all(f"/zones/{zid}/workers/routes"), missing, "Workers routes") or []
    scripts = []
    for s in _try(lambda: cf.all(f"/accounts/{acct}/workers/scripts"), missing, "Workers scripts") or []:
        name = s.get("id") or s.get("script_name")
        settings = _try(lambda: cf.request("GET", f"/accounts/{acct}/workers/scripts/{name}/settings"), missing, f"Worker {name} settings") or {}
        # Binding names and types only: a secret_text binding's value never leaves Cloudflare.
        scripts.append({"name": name, "bindings": sorted(({"name": b.get("name"), "type": b.get("type")} for b in settings.get("bindings", [])), key=lambda b: str(b["name"]))})
    inv = {
        "exported": True,
        "exported_at": iso(ctx.clock.now()),
        "account_id": acct,
        "zone": {"id": zid, "name": zone_name, "name_servers": zone.get("name_servers", [])},
        "records": [{k: r.get(k) for k in ("id", "name", "type", "content", "proxied", "ttl", "priority", "comment")} for r in records],
        "workers_custom_domains": [{k: d.get(k) for k in ("id", "hostname", "service", "environment")} for d in domains],
        "workers_routes": [{k: r.get(k) for k in ("id", "pattern", "script")} for r in routes],
        "workers_scripts": scripts,
        "email_routing": _try(lambda: {k: v for k, v in (cf.request("GET", f"/zones/{zid}/email/routing") or {}).items() if k in ("enabled", "status", "name")}, missing, "Email Routing settings"),
        "email_routing_rules": [{k: r.get(k) for k in ("id", "name", "enabled", "matchers", "actions")} for r in _try(lambda: cf.all(f"/zones/{zid}/email/routing/rules"), missing, "Email Routing rules") or []],
        "email_routing_catch_all": _try(lambda: cf.request("GET", f"/zones/{zid}/email/routing/rules/catch_all"), missing, "Email Routing catch-all"),
        "r2_buckets": [{k: b.get(k) for k in ("name", "location", "jurisdiction")} for b in (_try(lambda: cf.request("GET", f"/accounts/{acct}/r2/buckets"), missing, "R2 buckets") or {}).get("buckets", [])],
        "d1_databases": [{k: d.get(k) for k in ("uuid", "name")} for d in _try(lambda: cf.all(f"/accounts/{acct}/d1/database"), missing, "D1 databases") or []],
        "pages_projects": [{"name": p.get("name"), "domains": p.get("domains", [])} for p in _try(lambda: cf.all(f"/accounts/{acct}/pages/projects"), missing, "Pages projects") or []],
        "web_analytics_sites": [{k: s.get(k) for k in ("site_tag", "host")} for s in _try(lambda: cf.all(f"/accounts/{acct}/rum/site_info/list"), missing, "Web Analytics") or []],
        "rulesets": [{k: r.get(k) for k in ("id", "name", "phase", "kind")} for r in (_try(lambda: cf.all(f"/zones/{zid}/rulesets"), missing, "zone rulesets") or []) if r.get("kind") == "zone"],
        "unreadable": missing,
        "not_imported": {
            "workers_scripts": "secret bindings and code would enter state, which github-plan reads; inventoried by name and binding type, deleted by retire",
            "pages_projects": "deployment configs can hold secret environment variables",
            "api_tokens": "values are never exported; scopes are documented in platform/aws/cutover/README.md",
            "zone_settings": "dozens of defaults; nothing the move changes",
        },
    }
    inv["hosts"] = classify_hosts(ctx.cfg, inv)
    return inv


def classify_hosts(cfg: dict, inv: dict) -> dict:
    hosts = {}
    by_domain = {d["hostname"]: d for d in inv["workers_custom_domains"]}
    for a in cfg["apps"]:
        for h in a["hosts"]:
            if h in by_domain:
                d = by_domain[h]
                hosts[h] = {"kind": "worker_custom_domain", "id": d["id"], "service": d["service"], "environment": d.get("environment")}
                continue
            recs = [r for r in inv["records"] if r["name"] == h and r["type"] in ("A", "AAAA", "CNAME")]
            if not recs:
                hosts[h] = {"kind": "absent"}
            elif len(recs) == 1:
                r = recs[0]
                hosts[h] = {"kind": "record", "id": r["id"], "type": r["type"], "content": r["content"], "proxied": bool(r["proxied"]), "ttl": r["ttl"], "comment": r.get("comment")}
            else:
                raise CutoverError(f"{h} has {len(recs)} address records; switch.tf moves one record or one custom domain per host")
    return hosts


def import_blocks(inv: dict) -> str:
    zid, acct = inv["zone"]["id"], inv["account_id"]
    app_hosts = set(inv["hosts"])
    domain_hosts = {d["hostname"] for d in inv["workers_custom_domains"]}
    blocks: list[tuple[str, str]] = [("cloudflare_zone.zone", zid)]
    for r in inv["records"]:
        if r["name"] in domain_hosts and r["type"] in ("A", "AAAA"):
            continue  # owned by its Workers custom domain
        if r["name"] in app_hosts and r["type"] in ("A", "AAAA", "CNAME"):
            continue  # switch.tf manages it
        blocks.append((f"cloudflare_dns_record.{slug(r['type'], r['name'], r['id'][:8])}", f"{zid}/{r['id']}"))
    for d in inv["workers_custom_domains"]:
        if d["hostname"] not in app_hosts:
            blocks.append((f"cloudflare_workers_custom_domain.{slug(d['hostname'], d['id'][:8])}", f"{acct}/{d['id']}"))
    for r in inv["workers_routes"]:
        blocks.append((f"cloudflare_workers_route.{slug(r['pattern'], r['id'][:8])}", f"{zid}/{r['id']}"))
    if inv.get("email_routing"):
        blocks.append(("cloudflare_email_routing_settings.zone", zid))
    for r in inv["email_routing_rules"]:
        blocks.append((f"cloudflare_email_routing_rule.{slug(r.get('name') or 'rule', r['id'][:8])}", f"{zid}/{r['id']}"))
    if inv.get("email_routing_catch_all"):
        blocks.append(("cloudflare_email_routing_catch_all.zone", zid))
    for b in inv["r2_buckets"]:
        blocks.append((f"cloudflare_r2_bucket.{slug(b['name'])}", f"{acct}/{b['name']}/{b.get('jurisdiction') or 'default'}"))
    for d in inv["d1_databases"]:
        blocks.append((f"cloudflare_d1_database.{slug(d['name'])}", f"{acct}/{d['uuid']}"))
    for s in inv["web_analytics_sites"]:
        blocks.append((f"cloudflare_web_analytics_site.{slug(s.get('host') or 'site', s['site_tag'][:8])}", f"{acct}/{s['site_tag']}"))
    for r in inv["rulesets"]:
        blocks.append((f"cloudflare_ruleset.{slug(r['phase'], r['id'][:8])}", f"zones/{zid}/{r['id']}"))
    head = (f"# Generated by platform/aws/cutover/cutover.py export at {inv['exported_at']}.\n"
            "# Re-run the export instead of editing. resources.generated.tf holds the\n"
            "# matching configuration (tofu plan -generate-config-out).\n")
    return head + "".join(f'\nimport {{\n  to = {to}\n  id = "{i}"\n}}\n' for to, i in blocks)


def stage_export(ctx: Ctx, out_dir: Path) -> None:
    inv = inventory_account(ctx)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "inventory.generated.json").write_text(json.dumps(inv, indent=2, sort_keys=True) + "\n")
    (out_dir / "imports.generated.tf").write_text(import_blocks(inv))
    gen = out_dir / "resources.generated.tf"
    if gen.exists():
        gen.unlink()
    if out_dir.resolve() == ctx.stack.resolve():
        ctx.inventory = inv
        ctx.tofu.plan({**ctx.tfvars({}), "adopt": True}, generate_out=gen.name, lock=False)
    n_imports = (out_dir / "imports.generated.tf").read_text().count("import {")
    ctx.note(f"export: zone {inv['zone']['name']}, {len(inv['records'])} records, {len(inv['workers_custom_domains'])} custom domains, "
             f"{len(inv['workers_scripts'])} Workers, {len(inv['d1_databases'])} D1, {len(inv['r2_buckets'])} R2; {n_imports} import blocks; "
             f"credential expires {ctx.credential_expiry}")
    for h, v in inv["hosts"].items():
        ctx.note(f"export: {h}: {v['kind']}")
    for m in inv["unreadable"]:
        ctx.note(f"export: NOT READ (token lacks the permission?) {m}")
    ctx.event("export", f"{n_imports} import blocks")
    ctx.save()


# --------------------------------------------------------------- prepare ----


def find_endpoint(ctx: Ctx, app: dict, host: str) -> dict:
    aws = app["aws"]
    role = f"{aws['account']}:read"
    if aws["kind"] == "cloudfront":
        out = ctx.aws.call(role, ["cloudfront", "list-distributions"])
        for d in (out or {}).get("DistributionList", {}).get("Items", []) or []:
            if host in (d.get("Aliases", {}).get("Items") or []):
                cert = d.get("ViewerCertificate", {}).get("ACMCertificateArn")
                return {"target": d["DomainName"], "check_url": f"https://{d['DomainName']}", "cert": cert, "cert_role": role}
        raise CutoverError(f"{host}: no CloudFront distribution has it as an alias (apply the site stack first)")
    out = ctx.aws.call(role, ["apigatewayv2", "get-domain-name", "--domain-name", host])
    cfg = (out or {}).get("DomainNameConfigurations") or []
    if not cfg:
        raise CutoverError(f"{host}: no API Gateway custom domain (apply the app's stack first)")
    maps = ctx.aws.call(role, ["apigatewayv2", "get-api-mappings", "--domain-name", host]) or {}
    items = maps.get("Items") or []
    if not items:
        raise CutoverError(f"{host}: the API Gateway domain has no API mapping")
    api = items[0]["ApiId"]
    return {"target": cfg[0]["ApiGatewayDomainName"], "check_url": f"https://{api}.execute-api.{ctx.aws.region}.amazonaws.com",
            "cert": cfg[0].get("CertificateArn"), "cert_role": role}


def cert_status(ctx: Ctx, ep: dict) -> tuple[str, list[dict]]:
    if not ep.get("cert"):
        raise CutoverError(f"{ep['target']}: no ACM certificate attached")
    c = ctx.aws.call(ep["cert_role"], ["acm", "describe-certificate", "--certificate-arn", ep["cert"]])["Certificate"]
    recs = [{"name": o["ResourceRecord"]["Name"], "value": o["ResourceRecord"]["Value"]}
            for o in c.get("DomainValidationOptions", []) if o.get("ResourceRecord")]
    return c["Status"], recs


def aws_served(headers: dict) -> bool:
    return any(h in headers for h in ("x-amz-cf-id", "apigw-requestid", "x-amzn-requestid"))


def prepare_global(ctx: Ctx) -> None:
    inv = ctx.load_inventory()
    if not inv.get("exported"):
        raise CutoverError("platform/aws/stacks/cloudflare has no export yet: run the export stage and merge its files first")
    g = ctx.gsteps()

    # Checked on every prepare, not recorded: Cloudflare may change between runs.
    def current():
        live = inventory_account(ctx)
        drift = []
        if live["hosts"] != inv["hosts"]:
            drift.append("switchable hosts")
        key = lambda r: (r["name"], r["type"], str(r["content"]), bool(r["proxied"]))
        if sorted(map(key, live["records"])) != sorted(map(key, inv["records"])):
            drift.append("DNS records")
        if drift:
            raise CutoverError(f"Cloudflare changed since the export ({', '.join(drift)}): re-run export and merge it")
        return {"checked": True}

    current()

    def adopt():
        changes = ctx.tofu.plan({**ctx.tfvars({}), "adopt": True})
        bad = [c for c in changes if c["actions"] != ["no-op"]]
        if bad:
            raise CutoverError("the committed Cloudflare config does not match the account; fix resources.generated.tf until only imports remain:\n"
                               + "\n".join(f"  {c['address']}: {'/'.join(c['actions'])}" for c in bad[:40]))
        n = sum(c["importing"] for c in changes)
        if ctx.plan_only:
            ctx.note(f"prepare (plan): {n} resources would be adopted into state, nothing else changes")
            return {"imported": n}
        ctx.tofu.apply({**ctx.tfvars({}), "adopt": True})
        ctx.note(f"prepare: adopted {n} Cloudflare resources into state")
        return {"imported": n}

    ctx.step(g, "adopt", adopt)

    def zero():
        changes = [c for c in ctx.tofu.plan(ctx.tfvars(ctx.switched_hosts())) if c["actions"] != ["no-op"]]
        if changes:
            raise CutoverError("plan against Cloudflare is not empty: " + ", ".join(c["address"] for c in changes[:20]))
        ctx.note("prepare: tofu plan against Cloudflare shows zero changes")
        return {"at": iso(ctx.clock.now()), "zero": True}

    result = zero()
    if not ctx.plan_only:
        g["zero-diff"] = result
        ctx.save()


def prepare_app(ctx: Ctx, app: dict) -> None:
    s, name = ctx.asteps(app["name"]), app["name"]
    g = ctx.state["global"]
    inv = ctx.load_inventory()

    def endpoints():
        eps = {h: find_endpoint(ctx, app, h) for h in app["hosts"]}
        g.setdefault("endpoints", {}).update({h: e["target"] for h, e in eps.items()})
        g.setdefault("endpoint_details", {}).update(eps)
        for h, e in eps.items():
            ctx.note(f"prepare: {name}: {h} -> {e['target']}")
        return {"hosts": list(eps)}

    ctx.step(s, "endpoints", endpoints)
    eps = {h: g["endpoint_details"][h] for h in app["hosts"]}

    def certs():
        pending = []
        existing = {(r["name"].rstrip("."), str(r["content"]).rstrip(".")) for r in inv["records"] if r["type"] == "CNAME"}
        for h, ep in eps.items():
            status, recs = cert_status(ctx, ep)
            if status == "ISSUED":
                continue
            if status != "PENDING_VALIDATION":
                raise CutoverError(f"{h}: certificate is {status}")
            pending += [r for r in recs if (r["name"].rstrip("."), r["value"].rstrip(".")) not in existing]
        known = g.setdefault("acm_records", [])
        new = [r for r in pending if r not in known]
        if new:
            if ctx.plan_only:
                ctx.note(f"prepare (plan): {name}: would add {len(new)} ACM validation record(s) in Cloudflare")
                return {"issued": False}
            known += new
            ctx.tofu.apply(ctx.tfvars(ctx.switched_hosts()), targets=SWITCH_TARGETS)
            ctx.note(f"prepare: {name}: wrote {len(new)} ACM validation record(s)")
        deadline = ctx.clock.now() + dt.timedelta(minutes=30)
        while pending and not ctx.plan_only:
            if all(cert_status(ctx, ep)[0] == "ISSUED" for ep in eps.values()):
                break
            if ctx.clock.now() > deadline:
                raise CutoverError(f"{name}: certificates not issued after 30 minutes; re-run prepare later (the records stay)")
            ctx.clock.sleep(30)
        return {"issued": True}

    ctx.step(s, "certificates", certs)

    def health():
        for h, ep in eps.items():
            st, hdr, _ = ctx.http.get(ep["check_url"] + app["health"])
            if st != 200:
                raise CutoverError(f"{name}: {ep['check_url']}{app['health']} answered {st} from AWS before the switch")
        ctx.note(f"prepare: {name}: AWS answers {app['health']} with 200")
        return {"ok": True}

    ctx.step(s, "aws-health", health)

    def ttl():
        olds = [v["ttl"] for h in app["hosts"] for v in [inv["hosts"].get(h, {})] if v.get("kind") == "record" and not v.get("proxied")]
        high = [t for t in olds if t > 300]
        if not high:
            return {"wait_until": iso(ctx.clock.now())}
        if ctx.plan_only:
            ctx.note(f"prepare (plan): {name}: would lower TTL {max(high)} -> 300 and wait {max(high)} s before switching")
            return {}
        g["ttl_cap"] = 300
        ctx.tofu.apply(ctx.tfvars(ctx.switched_hosts()), targets=SWITCH_TARGETS)
        until = ctx.clock.now() + dt.timedelta(seconds=max(high))
        ctx.note(f"prepare: {name}: TTL lowered to 300; switch waits until {iso(until)}")
        return {"wait_until": iso(until)}

    ctx.step(s, "ttl", ttl)

    if app.get("data"):
        def data_dry_run():
            d = app["data"]
            tables = d1_tables(ctx, d)
            # The plan role cannot invoke db-admin at all, so the Postgres side is checked at prepare proper.
            pg = None if ctx.plan_only else ctx.aws.invoke("apps:operate", d.get("function", "saas-starter-db-admin"),
                                                           {"action": "inspect", "product": d["product"]})
            report = []
            for t, cols in tables.items():
                count = d1_count(ctx, d, t)
                if pg is not None:
                    target = pg["tables"].get(t)
                    if target is None:
                        raise CutoverError(f"{name}: Postgres database {d['product']} has no table {t} (run the app's migrations first)")
                    lacking = [c for c in cols if c not in target["columns"]]
                    if lacking:
                        raise CutoverError(f"{name}: {t} lacks columns {lacking} in Postgres")
                    if target["count"] and not d.get("replace_existing"):
                        raise CutoverError(f"{name}: Postgres {t} already has {target['count']} rows; set data.replace_existing if they are seed rows")
                report.append(f"{t}={count}")
            ctx.note(f"prepare: {name}: D1 {d['d1_database']} -> Postgres {d['product']}: {', '.join(report) or 'no tables'}")
            return {"tables": len(tables)}

        if ctx.plan_only:
            data_dry_run()
        else:
            ctx.step(s, "data-dry-run", data_dry_run)

    if app.get("paddle"):
        def paddle_ready():
            p = app["paddle"]
            if ctx.paddle is None:
                raise CutoverError(f"{name}: Paddle repoint configured but the Paddle key (cutover/paddle-api-key) is not in Secrets Manager")
            ns = ctx.paddle.request("GET", f"/notification-settings/{p['notification_setting_id']}")
            if not ctx.plan_only and p.get("webhook_secret"):
                ctx.aws.call("apps:operate", ["secretsmanager", "describe-secret", "--secret-id", p["webhook_secret"]])
            code = ctx.http.post(p["aws_destination"], b"{}")
            if not 400 <= code < 500:
                raise CutoverError(f"{name}: the AWS webhook receiver answered an unsigned POST with {code}; expected a 4xx refusal")
            ctx.note(f"prepare: {name}: Paddle setting found; AWS receiver refuses unsigned events ({code})")
            return {"original_destination": ns["destination"]}

        ctx.step(s, "paddle-ready", paddle_ready)

    if not ctx.plan_only:
        ctx.state["apps"][name]["prepared_at"] = iso(ctx.clock.now())
        ctx.save()


def email_check(ctx: Ctx, send: bool) -> str:
    out = ctx.aws.call("apps:read", ["sesv2", "get-email-identity", "--email-identity", ctx.cfg["zone"]]) or {}
    if not out.get("VerifiedForSendingStatus"):
        return "SES identity not verified yet: apps keep their current email provider (no change in this run)"
    if not send or ctx.plan_only:
        return "SES identity verified"
    ctx.aws.call("apps:operate", ["sesv2", "send-email", "--from-email-address", ctx.cfg["email_from"],
                                  "--destination", "ToAddresses=success@simulator.amazonses.com",
                                  "--content", json.dumps({"Simple": {"Subject": {"Data": "cutover check"}, "Body": {"Text": {"Data": "cutover check"}}}})])
    return "SES identity verified; a send to the mailbox simulator was accepted"


def stage_prepare(ctx: Ctx, only: str | None) -> None:
    prepare_global(ctx)
    for a in ctx.cfg["apps"]:
        if only and a["name"] != only:
            continue
        prepare_app(ctx, a)
    ctx.note("prepare: email: " + email_check(ctx, send=False))
    ctx.event("prepare", "done")
    ctx.save()


# ------------------------------------------------------------------ data ----


def d1_query(ctx: Ctx, d: dict, sql: str, params=None) -> list[dict]:
    inv = ctx.load_inventory()
    db = next((x for x in inv["d1_databases"] if x["name"] == d["d1_database"]), None)
    if db is None:
        raise CutoverError(f"D1 database {d['d1_database']} is not in the export")
    res = ctx.cf.request("POST", f"/accounts/{inv['account_id']}/d1/database/{db['uuid']}/query", {"sql": sql, "params": params or []})
    return res[0]["results"]


def d1_tables(ctx: Ctx, d: dict) -> dict[str, list[str]]:
    rows = d1_query(ctx, d, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
                            "AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name")
    out = {}
    for r in rows:
        t = r["name"]
        if t in d.get("exclude_tables", []):
            continue
        if not IDENT.match(t):
            raise CutoverError(f"D1 table name {t[:70]!r} is not a plain identifier")
        out[t] = [c["name"] for c in d1_query(ctx, d, f'PRAGMA table_info("{t}")')]
    return out


def d1_count(ctx: Ctx, d: dict, t: str) -> int:
    return int(d1_query(ctx, d, f'SELECT count(*) AS n FROM "{t}"')[0]["n"])


def d1_rows(ctx: Ctx, d: dict, t: str, page: int = 500) -> list[dict]:
    rows, off = [], 0
    while True:
        try:
            got = d1_query(ctx, d, f'SELECT * FROM "{t}" ORDER BY rowid LIMIT ? OFFSET ?', [page, off])
        except CutoverError:
            got = d1_query(ctx, d, f'SELECT * FROM "{t}" ORDER BY 1 LIMIT ? OFFSET ?', [page, off])
        rows += got
        if len(got) < page:
            return rows
        off += page


def batches(columns: list[str], rows: list[dict]):
    batch, size = [], 0
    for r in rows:
        vals = [r.get(c) for c in columns]
        n = len(json.dumps(vals))
        if batch and size + n > BATCH_BYTES:
            yield batch
            batch, size = [], 0
        batch.append(vals)
        size += n
    yield batch


def copy_app_data(ctx: Ctx, app: dict) -> dict:
    d = app["data"]
    fn = d.get("function", "saas-starter-db-admin")
    st = ctx.asteps(app["name"]).setdefault("copy-progress", {})
    tables = d1_tables(ctx, d)
    for t, cols in tables.items():
        rec = st.get(t) or {}
        if rec.get("status") == "copied":
            continue
        rows = d1_rows(ctx, d, t)
        replace = rec.get("status") == "copying" or bool(d.get("replace_existing"))
        st[t] = {"status": "copying", **table_checksum(rows)}
        ctx.save()
        for i, b in enumerate(batches(cols, rows)):
            ctx.aws.invoke("apps:operate", fn, {"action": "import", "product": d["product"], "table": t, "columns": cols,
                                                "rows": b, "batch": i, "replace": replace and i == 0})
        st[t]["status"] = "copied"
        ctx.save()
    ctx.aws.invoke("apps:operate", fn, {"action": "finish", "product": d["product"], "tables": list(tables)})
    return {"tables": {t: {"count": v["count"], "sha256": v["sha256"]} for t, v in st.items()}}


def verify_app_data(ctx: Ctx, app: dict, copied: dict) -> dict:
    d = app["data"]
    pg = ctx.aws.invoke("apps:operate", d.get("function", "saas-starter-db-admin"),
                        {"action": "checksum", "product": d["product"], "tables": list(copied["tables"])})["tables"]
    for t, want in copied["tables"].items():
        live = table_checksum(d1_rows(ctx, d, t))
        if live != want:
            raise CutoverError(f"{app['name']}: D1 {t} changed during the freeze ({want['count']} -> {live['count']} rows)")
        if pg.get(t) != want:
            got = pg.get(t) or {}
            raise CutoverError(f"{app['name']}: Postgres {t} has {got.get('count')} rows / checksum mismatch against D1's {want['count']}")
    ctx.note(f"switch: {app['name']}: {len(copied['tables'])} table(s) copied; row counts and checksums match")
    return {"verified": True}


# ---------------------------------------------------------------- freeze ----


def freeze_expr(app: dict) -> str:
    hosts = " ".join(f'"{h}"' for h in app["hosts"])
    return f'(http.host in {{{hosts}}} and not http.request.method in {{"GET" "HEAD" "OPTIONS"}})'


def freeze(ctx: Ctx, app: dict) -> None:
    zid, ref = ctx.load_inventory()["zone"]["id"], f"cutover-freeze-{app['name']}"
    rule = {"ref": ref, "description": f"cutover: write freeze for {app['name']} (platform/aws/cutover)",
            "expression": freeze_expr(app), "action": "block", "enabled": True}
    try:
        rs = ctx.cf.request("GET", f"/zones/{zid}/rulesets/phases/{FREEZE_PHASE}/entrypoint")
    except NotFound:
        ctx.cf.request("PUT", f"/zones/{zid}/rulesets/phases/{FREEZE_PHASE}/entrypoint", {"rules": [rule]})
        return
    if any(r.get("ref") == ref for r in rs.get("rules") or []):
        return
    ctx.cf.request("POST", f"/zones/{zid}/rulesets/{rs['id']}/rules", {**rule, "position": {"index": 1}})


def unfreeze(ctx: Ctx, app: dict) -> None:
    zid, ref = ctx.load_inventory()["zone"]["id"], f"cutover-freeze-{app['name']}"
    try:
        rs = ctx.cf.request("GET", f"/zones/{zid}/rulesets/phases/{FREEZE_PHASE}/entrypoint")
    except NotFound:
        return
    for r in rs.get("rules") or []:
        if r.get("ref") == ref:
            ctx.cf.request("DELETE", f"/zones/{zid}/rulesets/{rs['id']}/rules/{r['id']}")


# ---------------------------------------------------------------- switch ----


def wait_served(ctx: Ctx, app: dict, minutes: int = 10) -> None:
    deadline = ctx.clock.now() + dt.timedelta(minutes=minutes)
    for h in app["hosts"]:
        while True:
            # What answers decides, not what a resolver says: the apex is
            # flattened (A records, never a CNAME), and caches lag either way.
            st, hdr, _ = ctx.http.get(f"https://{h}{app['health']}")
            if st == 200 and aws_served(hdr):
                break
            if ctx.clock.now() > deadline:
                raise CutoverError(f"{h}: not served from AWS after {minutes} min (HTTP {st})")
            ctx.clock.sleep(15)


def switch_app(ctx: Ctx, app: dict) -> None:
    name, s = app["name"], ctx.asteps(app["name"])
    st = ctx.state["apps"][name]
    if st["status"] == "switched":
        return
    if not st.get("prepared_at"):
        raise CutoverError(f"{name}: not prepared; run prepare first")
    wait = s.get("ttl", {}).get("wait_until")
    if wait and ctx.clock.now() < parse_iso(wait):
        raise CutoverError(f"{name}: lowered TTLs expire at {wait}; switch after that")
    if ctx.plan_only:
        return
    try:
        if app_freezes(app):
            ctx.step(s, "freeze", lambda: (freeze(ctx, app), {"frozen": True})[1])
        if app.get("data"):
            copied = ctx.step(s, "copy", lambda: copy_app_data(ctx, app))
            ctx.step(s, "copy-verify", lambda: verify_app_data(ctx, app, copied))
        if app.get("paddle"):
            def repoint():
                p = app["paddle"]
                ctx.paddle.request("PATCH", f"/notification-settings/{p['notification_setting_id']}", {"destination": p["aws_destination"]})
                return {"destination": "aws"}
            ctx.step(s, "paddle", repoint)
        ctx.step(s, "dns", lambda: {"changes": len(ctx.tofu.apply(ctx.tfvars(ctx.switched_hosts(extra_app=name)), targets=SWITCH_TARGETS))})
        st["status"] = "switching-dns"
        ctx.save()
        ctx.step(s, "health", lambda: (wait_served(ctx, app), {"ok": True})[1])
        st["status"] = "switched"
        st["switched_at"] = iso(ctx.clock.now())
        if app_freezes(app):
            unfreeze(ctx, app)
            s["unfrozen"] = {"at": iso(ctx.clock.now())}
        ctx.note(f"switch: {name}: {', '.join(app['hosts'])} served from AWS")
        ctx.event("switch", f"{name} switched")
        ctx.save()
    except CutoverError as e:
        ctx.note(f"switch: {name}: FAILED ({e}); rolling back")
        rollback_app(ctx, app, str(e))
        raise


def stage_switch(ctx: Ctx, only: str | None) -> None:
    if "zero-diff" not in ctx.gsteps() and not ctx.plan_only:
        raise CutoverError("prepare has not passed its zero-diff check")
    if ctx.plan_only:
        changes = ctx.tofu.plan(ctx.tfvars({h: "aws" for a in ctx.cfg["apps"] if not only or a["name"] == only for h in a["hosts"]}), targets=SWITCH_TARGETS)
        moved = [c for c in changes if c["actions"] != ["no-op"]]
        ctx.note(f"switch (plan): {len(moved)} Cloudflare change(s) would move DNS to AWS:")
        for c in moved:
            ctx.note(f"    {'/'.join(c['actions'])} {c['address']}")
        for a in ctx.cfg["apps"]:
            if not only or a["name"] == only:
                steps = (["freeze"] if app_freezes(a) else []) + (["copy D1 -> Postgres", "verify counts + checksums"] if a.get("data") else []) \
                    + (["repoint Paddle"] if a.get("paddle") else []) + ["DNS", "health"] + (["unfreeze"] if app_freezes(a) else [])
                ctx.note(f"switch (plan): {a['name']}: " + " -> ".join(steps))
        return
    for a in ctx.cfg["apps"]:
        if only and a["name"] != only:
            continue
        if ctx.state["apps"][a["name"]]["status"] != "switched":
            left = ctx.budget_minutes - (ctx.clock.now() - ctx.started).total_seconds() / 60
            need = APP_SWITCH_MINUTES * (2 if a.get("data") else 1)
            if left < need + VERIFY_MINUTES:
                raise CutoverError(f"time budget: {left:.0f} min left, {a['name']} needs about {need} plus {VERIFY_MINUTES} for verify; "
                                   "stopping before it (switched apps stay switched; re-run with fresh credentials to continue)")
        switch_app(ctx, a)


# ---------------------------------------------------------------- verify ----


def crawl(ctx: Ctx, host: str, limit: int = 100) -> int:
    st, hdr, body = ctx.http.get(f"https://{host}/sitemap.xml")
    if st != 200:
        raise CutoverError(f"{host}/sitemap.xml answered {st}")
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body.decode("utf-8", "replace"))
    if "<sitemapindex" in body.decode("utf-8", "replace"):
        inner = []
        for sm in sorted(locs)[:5]:
            s2, _, b2 = ctx.http.get(sm)
            if s2 == 200:
                inner += re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", b2.decode("utf-8", "replace"))
        locs = inner
    urls = [u for u in sorted(set(locs)) if urllib.parse.urlparse(u).hostname == host][:limit]
    bad = []
    for u in urls:
        s3, h3, _ = ctx.http.get(u)
        if s3 != 200 or not aws_served(h3):
            bad.append(f"{u} ({s3})")
    if bad:
        raise CutoverError(f"crawl of {host}: {len(bad)} of {len(urls)} failed: {', '.join(bad[:5])}")
    return len(urls)


def stage_verify(ctx: Ctx) -> None:
    switched = [a for a in ctx.cfg["apps"] if ctx.state["apps"][a["name"]]["status"] == "switched"]
    if ctx.plan_only:
        ctx.note(f"verify (plan): health, crawl, zero-diff, email and Paddle checks for {len(ctx.cfg['apps'])} app(s); any failure rolls back")
        return
    try:
        for a in switched:
            for h in a["hosts"]:
                st, hdr, _ = ctx.http.get(f"https://{h}{a['health']}")
                if st != 200 or not aws_served(hdr):
                    raise CutoverError(f"{h}{a['health']}: HTTP {st}, served by AWS: {aws_served(hdr)}")
            if a.get("crawl"):
                for h in a["hosts"]:
                    ctx.note(f"verify: {a['name']}: crawled {crawl(ctx, h)} sitemap URL(s) on {h}, all 200 from AWS")
        changes = [c for c in ctx.tofu.plan(ctx.tfvars(ctx.switched_hosts())) if c["actions"] != ["no-op"]]
        if changes:
            raise CutoverError("Cloudflare drifted from code after the switch: " + ", ".join(c["address"] for c in changes[:20]))
        ctx.note("verify: tofu plan against Cloudflare shows zero changes")
        ctx.note("verify: email: " + email_check(ctx, send=True))
        for a in switched:
            if a.get("paddle"):
                ctx.note(f"verify: {a['name']}: " + paddle_test(ctx, a))
        if ctx.cfg["route53_track"]:
            ctx.note("verify: " + route53_diff(ctx))
    except CutoverError as e:
        ctx.note(f"verify: FAILED ({e}); rolling back every switched app")
        for a in reversed(switched):
            rollback_app(ctx, a, f"verify: {e}")
        raise
    ctx.state["global"]["verified_at"] = iso(ctx.clock.now())
    ctx.event("verify", f"{len(switched)} app(s) verified")
    ctx.save()


def paddle_test(ctx: Ctx, app: dict) -> str:
    p = app["paddle"]
    sim = ctx.paddle.request("POST", "/simulations", {"notification_setting_id": p["notification_setting_id"],
                                                      "type": p.get("test_event", "subscription.created"), "name": f"cutover {app['name']}"})
    run = ctx.paddle.request("POST", f"/simulations/{sim['id']}/runs")
    for _ in range(20):
        got = ctx.paddle.request("GET", f"/simulations/{sim['id']}/runs/{run['id']}?include=events")
        if got.get("status") == "completed":
            codes = [((e.get("response") or {}).get("status_code")) for e in got.get("events") or []]
            if codes and all(isinstance(c, int) and 200 <= c < 300 for c in codes):
                return f"Paddle test event delivered to AWS ({codes})"
            raise CutoverError(f"{app['name']}: Paddle test event answered {codes}")
        ctx.clock.sleep(5)
    raise CutoverError(f"{app['name']}: Paddle simulation did not complete")


def route53_diff(ctx: Ctx) -> str:
    """Optional full-exit track: Route 53's copy of the zone against Cloudflare's."""
    out = ctx.aws.call("shared-infra:read", ["route53", "list-hosted-zones-by-name", "--dns-name", ctx.cfg["zone"]])
    zones = [z for z in out.get("HostedZones", []) if z["Name"].rstrip(".") == ctx.cfg["zone"]]
    if not zones:
        raise CutoverError("route53_track is on but there is no hosted zone")
    rr = ctx.aws.call("shared-infra:read", ["route53", "list-resource-record-sets", "--hosted-zone-id", zones[0]["Id"]])
    with tempfile.TemporaryDirectory() as td:
        Path(td, "cf.json").write_text(json.dumps({"result": ctx.load_inventory()["records"]}))
        Path(td, "r53.json").write_text(json.dumps(rr))
        p = subprocess.run([sys.executable, "-I", str(REPO / "platform/aws/stacks/dns/scripts/zone_diff.py"),
                            "--cloudflare", str(Path(td, "cf.json")), "--route53", str(Path(td, "r53.json"))], capture_output=True, text=True)
    if p.returncode != 0:
        raise CutoverError("zone_diff.py: " + p.stdout.strip()[-800:])
    return "zone_diff.py: " + (p.stdout.strip().splitlines() or ["0 difference(s)"])[-1]


# -------------------------------------------------------------- rollback ----


def rollback_app(ctx: Ctx, app: dict, reason: str) -> None:
    name, s = app["name"], ctx.asteps(app["name"])
    st = ctx.state["apps"][name]
    if app_freezes(app):
        freeze(ctx, app)
    if "dns" in s:
        ctx.tofu.apply(ctx.tfvars(ctx.switched_hosts(without_app=name)), targets=SWITCH_TARGETS)
    if "paddle" in s:
        orig = s.get("paddle-ready", {}).get("original_destination")
        if orig:
            ctx.paddle.request("PATCH", f"/notification-settings/{app['paddle']['notification_setting_id']}", {"destination": orig})
    if "copy" in s and "dns" in s:
        pg = ctx.aws.invoke("apps:operate", app["data"].get("function", "saas-starter-db-admin"),
                            {"action": "inspect", "product": app["data"]["product"]})["tables"]
        written = {t: pg.get(t, {}).get("count", 0) - v["count"] for t, v in s["copy"]["tables"].items()}
        written = {t: n for t, n in written.items() if n}
        if written:
            ctx.note(f"rollback: {name}: rows written on AWS after the switch, to reconcile by hand: {written}")
            st.setdefault("reconcile", []).append({"at": iso(ctx.clock.now()), "rows": written})
    if app_freezes(app):
        unfreeze(ctx, app)
    # A later attempt copies every table again over what this one left in Postgres.
    for rec in s.get("copy-progress", {}).values():
        rec["status"] = "copying"
    keep = {k: v for k, v in s.items() if k in ("endpoints", "certificates", "aws-health", "ttl", "data-dry-run", "paddle-ready", "copy-progress")}
    st["steps"] = keep
    st["status"] = "rolled_back"
    st.setdefault("rollbacks", []).append({"at": iso(ctx.clock.now()), "reason": reason[:300]})
    ctx.note(f"rollback: {name}: back on Cloudflare; writes unfrozen")
    ctx.event("rollback", f"{name}: {reason[:120]}")
    ctx.save()


def stage_rollback(ctx: Ctx, only: str | None) -> None:
    if ctx.plan_only:
        ctx.note("rollback (plan): every switched app back to Cloudflare")
        return
    for a in reversed(ctx.cfg["apps"]):
        if (not only or a["name"] == only) and ctx.state["apps"][a["name"]]["status"] in ("switched", "switching-dns"):
            rollback_app(ctx, a, "manual rollback")


# ---------------------------------------------------------------- retire ----


def stage_retire(ctx: Ctx) -> None:
    g = ctx.state["global"]
    if not g.get("verified_at"):
        raise CutoverError("retire: verify has not passed")
    ready = parse_iso(g["verified_at"]) + dt.timedelta(days=ctx.cfg["cooloff_days"])
    if ctx.clock.now() < ready:
        raise CutoverError(f"retire: cool-off until {iso(ready)}")
    if any(ctx.state["apps"][a["name"]]["status"] != "switched" for a in ctx.cfg["apps"]):
        raise CutoverError("retire: every app must be switched")
    plan = json.loads((HERE / "retire.json").read_text())
    live = inventory_account(ctx)
    for a in ctx.cfg["apps"]:
        for h in a["hosts"]:
            if live["hosts"].get(h, {}).get("kind") != "record" or live["hosts"][h].get("content") != g["endpoints"][h]:
                raise CutoverError(f"retire: {h} does not point at AWS in Cloudflare")
        if a.get("data"):
            for t, v in ctx.asteps(a["name"]).get("copy", {}).get("tables", {}).items():
                n = d1_count(ctx, a["data"], t)
                if n != v["count"]:
                    raise CutoverError(f"retire: D1 {t} has {n} rows, {v['count']} were copied: something still writes to Cloudflare")
    changes = [c for c in ctx.tofu.plan(ctx.tfvars(ctx.switched_hosts())) if c["actions"] != ["no-op"]]
    allowed = set(plan.get("tofu_destroy", []))
    bad = [c["address"] for c in changes if c["actions"] != ["delete"] or c["address"] not in allowed]
    if bad:
        raise CutoverError("retire: the plan has changes retire.json does not list as deletions: " + ", ".join(bad[:20]))
    used = {r["script"] for r in live["workers_routes"]} | {d["service"] for d in live["workers_custom_domains"]}
    still = [w for w in plan.get("workers", []) if w in used]
    if still:
        raise CutoverError(f"retire: Workers still routed: {still}")
    if ctx.plan_only:
        ctx.note(f"retire (plan): would delete {len(changes)} resource(s) and Workers {plan.get('workers', [])}")
        return
    if changes:
        ctx.tofu.apply(ctx.tfvars(ctx.switched_hosts()))
    for w in plan.get("workers", []):
        try:
            ctx.cf.request("DELETE", f"/accounts/{live['account_id']}/workers/scripts/{w}")
        except NotFound:
            pass
    g["retired_at"] = iso(ctx.clock.now())
    ctx.note(f"retire: deleted {len(changes)} resource(s) and {len(plan.get('workers', []))} Worker(s)")
    ctx.event("retire", "done")
    ctx.save()


def delete_secrets(ctx: Ctx) -> None:
    # Logged by label: the entry names are not secret, but nothing derived from
    # a credential variable goes to the log, the summary or the state.
    for label, entry in (("Cloudflare token", SECRET_CLOUDFLARE), ("Paddle key", SECRET_PADDLE)):
        if ctx.plan_only:
            continue
        gone = ctx.aws.delete_secret(entry)
        ctx.note(f"delete-secrets: {label}: {'deleted' if gone else 'not present'}")
        if gone:
            ctx.event("delete-secrets", label)
    ctx.save()


# ------------------------------------------------------------------ main ----

STAGE_ORDER = ["export", "prepare", "switch", "verify", "rollback", "retire", "delete-secrets"]
# The agent-run spelling (docs/runbooks/cutover-run-day.md): --apply is switch then verify.
FLAG_STAGES = {"apply": ["switch", "verify"], "verify": ["verify"], "rollback": ["rollback"]}


def build_real(args, cfg) -> Ctx:
    region = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
    run_id = os.environ.get("GITHUB_RUN_ID", "local")
    aws = Aws(region, args.plan, run_id)
    needs_cf = any(s != "delete-secrets" for s in args.stages)
    if args.credentials == "environment":
        # The run session's network secret for api.cloudflare.com replaces this
        # placeholder in flight; a token in the environment works too.
        token = os.environ.get("CLOUDFLARE_API_TOKEN") or PROXY_TOKEN
        raw = os.environ.get("CUTOVER_PADDLE_SECRET_JSON")
    else:
        token = aws.secret(SECRET_CLOUDFLARE)
        if needs_cf and not token:
            raise CutoverError("the Cloudflare token (cutover/cloudflare-api-token) is not in Secrets Manager (README.md, Owner steps)")
        raw = aws.secret(SECRET_PADDLE)
    # Never printed, logged or stored: the values go only into request headers
    # and the tofu subprocess's environment (tests check the log, summary and state).
    token = (token or "").strip()
    paddle = None
    if raw:
        p = json.loads(raw)
        paddle = Paddle(p["api_key"], p.get("environment", "live"), args.plan)
    bucket = os.environ.get("CUTOVER_STATE_BUCKET")
    if not bucket:
        raise CutoverError("CUTOVER_STATE_BUCKET is not set (the Cloudflare stack's state lives there in every mode)")
    kms = os.environ.get("CUTOVER_STATE_KMS")
    backend = {"bucket": bucket, "key": "cloudflare/terraform.tfstate", "region": region, **({"kms_key_id": kms} if kms else {})}
    tofu = Tofu(STACK, token, args.plan, backend)
    store = FileState(Path(args.state_file)) if args.state_file else S3State(aws, bucket, kms)
    return Ctx(cfg, Cloudflare(token, args.plan), paddle, aws, Http(), tofu, store, Clock(), plan_only=args.plan)


def build_fake(args, cfg) -> Ctx:
    spec = importlib.util.spec_from_file_location("cutover_fakes", HERE / "fakes.py")
    fakes = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fakes)
    import types
    return fakes.build(Path(args.fixtures), cfg, plan_only=args.plan, state_file=args.state, module=types.SimpleNamespace(**globals()))


def run(ctx: Ctx, stages: list[str], only: str | None, export_out: Path) -> int:
    code = 0
    try:
        if any(s != "delete-secrets" for s in stages):
            # Every run that holds the token checks it first (the owner's 24-48 h rule).
            ctx.credential_expiry = check_token(ctx)
        for s in stages:
            if s == "export":
                stage_export(ctx, export_out)
            elif s == "prepare":
                stage_prepare(ctx, only)
            elif s == "switch":
                stage_switch(ctx, only)
            elif s == "verify":
                stage_verify(ctx)
            elif s == "rollback":
                stage_rollback(ctx, only)
            elif s == "retire":
                stage_retire(ctx)
            elif s == "delete-secrets":
                delete_secrets(ctx)
    except CutoverError as e:
        ctx.note(f"STOPPED: {e}")
        code = 1
    finally:
        took = (ctx.clock.now() - ctx.started).total_seconds() / 60
        ctx.summary.append(f"time: {took:.1f} of {ctx.budget_minutes:.0f} min budget; slowest steps: "
                           + ", ".join(f"{n} {s:.0f}s" for n, s in sorted(ctx.timings, key=lambda t: -t[1])[:5]))
        if getattr(ctx, "report_path", None):
            Path(ctx.report_path).write_text(
                f"# Cutover report: {' '.join(stages)}{' (plan only)' if ctx.plan_only else ''}\n\n"
                f"Result: {'OK' if code == 0 else 'STOPPED'} at {iso(ctx.clock.now())}\n\n"
                + "".join(f"- {line}\n" for line in ctx.summary)
                + "\n## App status\n\n" + "".join(f"- {n}: {a['status']}\n" for n, a in ctx.state["apps"].items()))
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as f:
                f.write(f"### Cutover: {' '.join(stages)}{' (plan only)' if ctx.plan_only else ''}\n\n")
                f.write("".join(f"- {line}\n" for line in ctx.summary) + "\n")
    return code


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("stages", nargs="*", choices=STAGE_ORDER)
    ap.add_argument("--apply", action="store_true", help="switch then verify (the agent-run path)")
    ap.add_argument("--verify", action="store_true", help="verify only")
    ap.add_argument("--rollback", action="store_true", help="every switched app back to Cloudflare")
    ap.add_argument("--credentials", choices=["secrets-manager", "environment"], default="secrets-manager",
                    help="secrets-manager (the workflow) or environment: the Cloudflare token from the proxy's network "
                         "secret or CLOUDFLARE_API_TOKEN, AWS from the default chain (aws login)")
    ap.add_argument("--state-file", help="keep the run state in this file instead of S3 (a rehearsal; the real run keeps S3 so a workflow run can resume it)")
    ap.add_argument("--budget-minutes", type=float, default=60.0, help="stop before an app that would not fit (default 60)")
    ap.add_argument("--report", help="write a Markdown report here at the end")
    ap.add_argument("--plan", action="store_true", help="read-only preview: no Cloudflare, AWS, Paddle or state writes")
    ap.add_argument("--app", help="limit prepare/switch/rollback to one app")
    ap.add_argument("--fixtures", help="dry run against fixture files (fakes.py), no network")
    ap.add_argument("--state", help="with --fixtures: the run state file")
    ap.add_argument("--export-out", default=str(STACK), help="where export writes its generated files")
    args = ap.parse_args(argv)
    for flag, stages in FLAG_STAGES.items():
        if getattr(args, flag):
            args.stages = list(args.stages) + stages
    if not args.stages:
        ap.error("name a stage, or --apply / --verify / --rollback")
    args.stages = sorted(set(args.stages), key=STAGE_ORDER.index)
    try:
        cfg = load_config()
        if args.app and args.app not in {a["name"] for a in cfg["apps"]}:
            raise CutoverError(f"no app {args.app}")
        ctx = build_fake(args, cfg) if args.fixtures else build_real(args, cfg)
    except CutoverError as e:
        print(f"STOPPED: {e}", file=sys.stderr)
        return 1
    ctx.budget_minutes = args.budget_minutes
    ctx.report_path = args.report
    return run(ctx, args.stages, args.app, Path(args.export_out))


if __name__ == "__main__":
    sys.exit(main())
