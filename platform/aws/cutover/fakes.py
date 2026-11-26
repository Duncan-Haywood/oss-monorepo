"""In-memory Cloudflare, AWS, Paddle, HTTP and OpenTofu for dry runs.

Loaded by path only when cutover.py gets --fixtures (never in the workflow).
The world is fixtures/world.json; with --state it is saved beside the state
file, so a dry run can be split across invocations like the real one.
Failure injection: world["fail"] (see test_cutover.py).
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import shutil
import tempfile
import urllib.parse
from pathlib import Path


class World:
    def __init__(self, data: dict, path: Path | None):
        self.d, self.path = data, path

    def save(self):
        if self.path:
            self.path.write_text(json.dumps(self.d, indent=1, sort_keys=True))

    @property
    def cf(self):
        return self.d["cloudflare"]

    def fail(self, key):
        return self.d.setdefault("fail", {}).get(key)

    def aws_targets(self) -> set:
        a = self.d["aws"]
        return {d["domain"] for d in a["cloudfront"]} | {g["target"] for g in a["apigateway"].values()}

    def endpoint_hosts(self) -> dict:
        """Hostname -> AWS endpoint it points at in (fake) Cloudflare DNS."""
        aws = self.aws_targets()
        return {r["name"]: r["content"] for r in self.cf["records"] if r["type"] == "CNAME" and r["content"] in aws}


class FakeCloudflare:
    def __init__(self, world: World, plan_only: bool, module):
        self.w, self.plan_only, self.m = world, plan_only, module
        self.calls: list[tuple[str, str]] = []

    def all(self, path, params=None):
        r = self.request("GET", path, params=params)
        return r if isinstance(r, list) else [r]

    def request(self, method, path, body=None, params=None):
        m, cf = self.m, self.w.cf
        if self.plan_only and method != "GET" and not path.endswith("/query"):
            raise m.CutoverError(f"plan mode: refused {method} {path}")
        self.calls.append((method, path))
        z, a = cf["zone"]["id"], cf["zone"]["account"]["id"]
        if path == "/user/tokens/verify":
            return cf["token"]
        if path == "/zones":
            return [cf["zone"]] if (params or {}).get("name") == cf["zone"]["name"] else []
        routes = {
            f"/zones/{z}/dns_records": lambda: cf["records"],
            f"/accounts/{a}/workers/domains": lambda: cf["domains"],
            f"/zones/{z}/workers/routes": lambda: cf["routes"],
            f"/accounts/{a}/workers/scripts": lambda: [{"id": s["name"]} for s in cf["scripts"]],
            f"/zones/{z}/email/routing": lambda: cf["email_routing"],
            f"/zones/{z}/email/routing/rules": lambda: cf["email_rules"],
            f"/zones/{z}/email/routing/rules/catch_all": lambda: cf["catch_all"],
            f"/accounts/{a}/r2/buckets": lambda: {"buckets": cf["r2"]},
            f"/accounts/{a}/d1/database": lambda: [{"uuid": d["uuid"], "name": d["name"]} for d in cf["d1"]],
            f"/accounts/{a}/pages/projects": lambda: cf["pages"],
            f"/accounts/{a}/rum/site_info/list": lambda: cf["analytics"],
            f"/zones/{z}/rulesets": lambda: [r for r in cf["rulesets"] if r["phase"] != "http_request_firewall_custom"],
        }
        if method == "GET" and path in routes:
            if path in (self.w.fail("unreadable") or []):
                raise m.CutoverError(f"GET {path}: HTTP 403 10000: Authentication error")
            return copy.deepcopy(routes[path]())
        if method == "GET" and path.startswith(f"/accounts/{a}/workers/scripts/") and path.endswith("/settings"):
            name = path.split("/")[-2]
            return copy.deepcopy(next(s for s in cf["scripts"] if s["name"] == name)["settings"])
        if method == "DELETE" and path.startswith(f"/accounts/{a}/workers/scripts/"):
            name = path.rsplit("/", 1)[1]
            before = len(cf["scripts"])
            cf["scripts"] = [s for s in cf["scripts"] if s["name"] != name]
            if len(cf["scripts"]) == before:
                raise m.NotFound(path)
            return {}
        # D1
        if method == "POST" and "/d1/database/" in path and path.endswith("/query"):
            uuid = path.split("/")[-2]
            db = next(d for d in cf["d1"] if d["uuid"] == uuid)
            return [{"results": d1_exec(db, body["sql"], body.get("params") or [], m), "success": True}]
        # Freeze rules: the custom firewall entrypoint
        ep = f"/zones/{z}/rulesets/phases/http_request_firewall_custom/entrypoint"
        fw = [r for r in cf["rulesets"] if r["phase"] == "http_request_firewall_custom"]
        if path == ep and method == "GET":
            if not fw:
                raise m.NotFound(path)
            return copy.deepcopy(fw[0])
        if path == ep and method == "PUT":
            rules = [{**r, "id": f"rule-{i}"} for i, r in enumerate(body["rules"])]
            cf["rulesets"].append({"id": "fw-entry", "phase": "http_request_firewall_custom", "kind": "zone", "name": "default", "rules": rules})
            return cf["rulesets"][-1]
        if fw and path == f"/zones/{z}/rulesets/{fw[0]['id']}/rules" and method == "POST":
            fw[0].setdefault("rules", []).insert(0, {**{k: v for k, v in body.items() if k != "position"}, "id": f"rule-{len(fw[0]['rules']) + 10}"})
            return fw[0]
        if fw and path.startswith(f"/zones/{z}/rulesets/{fw[0]['id']}/rules/") and method == "DELETE":
            rid = path.rsplit("/", 1)[1]
            fw[0]["rules"] = [r for r in fw[0]["rules"] if r["id"] != rid]
            return fw[0]
        raise m.CutoverError(f"fake Cloudflare has no {method} {path}")


def d1_exec(db: dict, sql: str, params: list, m) -> list[dict]:
    tables = db["tables"]
    if sql.startswith("SELECT name FROM sqlite_master"):
        return [{"name": t} for t in sorted(tables)]
    if sql.startswith("PRAGMA table_info"):
        t = sql.split('"')[1]
        return [{"cid": i, "name": c} for i, c in enumerate(tables[t]["columns"])]
    if sql.startswith("SELECT count(*)"):
        return [{"n": len(tables[sql.split('"')[1]]["rows"])}]
    if sql.startswith("SELECT * FROM"):
        t = sql.split('"')[1]
        limit, off = params
        return copy.deepcopy(tables[t]["rows"][off:off + limit])
    raise m.CutoverError(f"fake D1 cannot run {sql[:40]}")


class FakeAws:
    def __init__(self, world: World, plan_only: bool, module):
        self.w, self.plan_only, self.m = world, plan_only, module
        self.region = "us-east-1"
        self.calls: list[tuple[str, list]] = []

    def call(self, role, args):
        self.calls.append((role, args))
        a, m = self.w.d["aws"], self.m
        if self.plan_only and role == "apps:operate":
            raise m.CutoverError("the plan role cannot assume cutover-operate")
        key = " ".join(args[:2])
        if key == "cloudfront list-distributions":
            return {"DistributionList": {"Items": [
                {"DomainName": d["domain"], "Aliases": {"Items": d["aliases"]}, "ViewerCertificate": {"ACMCertificateArn": d["cert"]}}
                for d in a["cloudfront"]]}}
        if key == "apigatewayv2 get-domain-name":
            g = a["apigateway"].get(args[3])
            if not g:
                raise m.CutoverError("NotFoundException")
            return {"DomainNameConfigurations": [{"ApiGatewayDomainName": g["target"], "CertificateArn": g["cert"]}]}
        if key == "apigatewayv2 get-api-mappings":
            return {"Items": [{"ApiId": a["apigateway"][args[3]]["api"]}]}
        if key == "acm describe-certificate":
            c = a["certs"][args[3]]
            return {"Certificate": {"Status": c["status"], "DomainValidationOptions": [
                {"ResourceRecord": {"Name": r["name"], "Value": r["value"], "Type": "CNAME"}} for r in c.get("records", [])]}}
        if key == "sesv2 get-email-identity":
            return {"VerifiedForSendingStatus": a.get("ses_verified", False)}
        if key == "sesv2 send-email":
            to = args[args.index("--destination") + 1]
            if not to.endswith("@simulator.amazonses.com"):
                raise m.CutoverError("AccessDenied: only the simulator")
            a.setdefault("sent", []).append(to)
            return {"MessageId": "m-1"}
        if key == "secretsmanager describe-secret":
            if args[3] not in a.get("app_secrets", []):
                raise m.CutoverError("ResourceNotFoundException")
            return {"Name": args[3]}
        if key == "route53 list-hosted-zones-by-name":
            return {"HostedZones": []}
        raise m.CutoverError(f"fake AWS has no {key}")

    def secret(self, name):
        return self.w.d["aws"]["secrets"].get(name)

    def delete_secret(self, name):
        return self.w.d["aws"]["secrets"].pop(name, None) is not None

    def invoke(self, role, function, payload):
        m = self.m
        if role != "apps:operate" or self.plan_only:
            raise m.CutoverError("only cutover-operate may invoke db-admin")
        if function != "saas-starter-db-admin":
            raise m.CutoverError("AccessDenied: only db-admin")
        pg = self.w.d["aws"]["pg"][payload["product"]]["tables"]
        act = payload["action"]
        if act == "inspect":
            return {"tables": {t: {"columns": v["columns"], "count": len(v["rows"])} for t, v in pg.items()}}
        if act == "import":
            f = self.w.fail("import_batch")
            if f and f["table"] == payload["table"] and f["batch"] == payload["batch"] and not f.get("done"):
                f["done"] = True
                raise m.CutoverError("db-admin import: connection reset")
            t = pg[payload["table"]]
            if payload["batch"] == 0 and t["rows"]:
                if not payload.get("replace"):
                    raise m.CutoverError(f"db-admin import: table {payload['table']} already has rows; refusing to copy over them")
                t["rows"] = []
            t["rows"] += [dict(zip(payload["columns"], r)) for r in payload["rows"]]
            return {"inserted": len(payload["rows"])}
        if act == "finish":
            return {"sequences": []}
        if act == "checksum":
            return {"tables": {t: m.table_checksum(pg[t]["rows"]) for t in payload["tables"]}}
        raise m.CutoverError("unknown action")


class FakePaddle:
    def __init__(self, world: World, plan_only: bool, module):
        self.w, self.plan_only, self.m = world, plan_only, module

    def request(self, method, path, body=None):
        p, m = self.w.d["paddle"], self.m
        if self.plan_only and method != "GET":
            raise m.CutoverError(f"plan mode: refused {method} {path}")
        if path.startswith("/notification-settings/"):
            s = p["settings"][path.rsplit("/", 1)[1]]
            if method == "PATCH":
                s["destination"] = body["destination"]
            return dict(s)
        if path == "/simulations" and method == "POST":
            p["sim"] = {"id": "ntfsim_1", "setting": body["notification_setting_id"]}
            return {"id": "ntfsim_1"}
        if path.endswith("/runs") and method == "POST":
            return {"id": "ntfsimrun_1"}
        if "/runs/" in path:
            dest = p["settings"][p["sim"]["setting"]]["destination"]
            ok = dest.startswith("https://") and ".on.aws/" in dest and not self.w.fail("paddle_test")
            return {"status": "completed", "events": [{"response": {"status_code": 200 if ok else 500}}]}
        raise m.CutoverError(f"fake Paddle has no {method} {path}")


class FakeHttp:
    def __init__(self, world: World):
        self.w = world

    def get(self, url):
        u = urllib.parse.urlparse(url)
        host, a = u.hostname, self.w.d["aws"]
        aws_hdr = {"x-amz-cf-id": "fake", "content-type": "text/html"}
        native = {d["domain"] for d in a["cloudfront"]} | {f"{g['api']}.execute-api.us-east-1.amazonaws.com" for g in a["apigateway"].values()}
        if host in native:
            return 200, aws_hdr, b"ok"
        if host in self.w.endpoint_hosts():
            if host in (self.w.fail("unhealthy") or []):
                return 502, aws_hdr, b""
            if u.path == "/sitemap.xml":
                body = "".join(f"<url><loc>https://{host}{p}</loc></url>" for p in ("/", "/a/", "/b/"))
                return 200, aws_hdr, f"<urlset>{body}</urlset>".encode()
            if u.path in (self.w.fail("crawl_404") or []):
                return 404, aws_hdr, b""
            return 200, aws_hdr, b"ok"
        return 200, {"cf-ray": "fake", "server": "cloudflare"}, b"from cloudflare"

    def post(self, url, body):
        return 401 if ".on.aws/" in url else 0



class FakeTofu:
    """The Cloudflare stack, modelled on its switch.tf: each switchable host is
    its exported shape or an AWS CNAME, plus ACM records. Applying changes the
    fake Cloudflare world."""

    def __init__(self, world: World, stack: Path, plan_only: bool, module):
        self.w, self.stack, self.plan_only, self.m = world, stack, plan_only, module
        self.applies: list[dict] = []

    def _inv(self):
        return json.loads((self.stack / "inventory.generated.json").read_text())

    def _desired(self, tfvars):
        inv, out = self._inv(), {}
        for h, v in inv.get("hosts", {}).items():
            t = tfvars.get("targets", {}).get(h, "cloudflare")
            if t == "aws":
                out[h] = ("aws", tfvars["aws_targets"][h])
            elif v["kind"] == "worker_custom_domain":
                out[h] = ("domain", v["service"])
            elif v["kind"] == "record":
                ttl = min(v["ttl"], tfvars.get("ttl_cap") or v["ttl"]) if not v["proxied"] else v["ttl"]
                out[h] = ("record", v["content"], ttl)
            else:
                out[h] = ("absent",)
        return out

    def _current(self):
        cf, out = self.w.cf, {}
        for h in self._inv().get("hosts", {}):
            d = next((x for x in cf["domains"] if x["hostname"] == h), None)
            recs = [r for r in cf["records"] if r["name"] == h and r["type"] in ("A", "AAAA", "CNAME")]
            if d:
                out[h] = ("domain", d["service"])
            elif recs and recs[0]["type"] == "CNAME" and recs[0]["content"] in self.w.aws_targets():
                out[h] = ("aws", recs[0]["content"])
            elif recs:
                out[h] = ("record", recs[0]["content"], recs[0]["ttl"])
            else:
                out[h] = ("absent",)
        return out

    def plan(self, tfvars, targets=None, generate_out=None, lock=True):
        if generate_out:
            (self.stack / generate_out).write_text("# resources generated by tofu plan -generate-config-out (fake)\n")
        changes = []
        adopted = self.w.d.get("tofu", {}).get("adopted", False)
        if tfvars.get("adopt") and not adopted:
            changes += [{"address": "cloudflare_zone.zone", "actions": ["no-op"], "importing": True}]
            changes += [{"address": f"switch[{h}]", "actions": ["no-op"], "importing": True} for h in self._inv().get("hosts", {})]
        cur, want = self._current(), self._desired(tfvars)
        for h in want:
            if cur.get(h) != want[h]:
                changes.append({"address": f"switch[{h}]", "actions": ["update"], "importing": False})
        have_acm = {(r["name"], r["content"]) for r in self.w.cf["records"] if r["type"] == "CNAME"}
        for r in tfvars.get("acm_validation_records", []):
            if (r["name"].rstrip("."), r["value"].rstrip(".")) not in have_acm:
                changes.append({"address": f"cloudflare_dns_record.acm[{r['name']}]", "actions": ["create"], "importing": False})
        for addr in self.w.fail("drift") or []:
            changes.append({"address": addr, "actions": ["update"], "importing": False})
        for addr in self.w.d.get("tofu", {}).get("removed_from_config", []):
            changes.append({"address": addr, "actions": ["delete"], "importing": False})
        if not changes:
            changes = [{"address": "cloudflare_zone.zone", "actions": ["no-op"], "importing": False}]
        return changes

    def apply(self, tfvars, targets=None):
        m = self.m
        if self.plan_only:
            raise m.CutoverError("plan mode: refused tofu apply")
        f = self.w.fail("apply")
        if f and not f.get("done") and any(v == "aws" for v in tfvars.get("targets", {}).values()) and f.get("host") in [h for h, v in tfvars["targets"].items() if v == "aws"]:
            f["done"] = True
            raise m.CutoverError("tofu apply failed: fake API error")
        changes = self.plan(tfvars, targets)
        cf, inv = self.w.cf, self._inv()
        for h, want in self._desired(tfvars).items():
            cf["domains"] = [d for d in cf["domains"] if d["hostname"] != h]
            cf["records"] = [r for r in cf["records"] if not (r["name"] == h and r["type"] in ("A", "AAAA", "CNAME"))]
            v = inv["hosts"][h]
            if want[0] == "aws":
                cf["records"].append({"id": f"new-{h}", "name": h, "type": "CNAME", "content": want[1], "proxied": False, "ttl": tfvars.get("aws_record_ttl", 60)})
            elif want[0] == "domain":
                cf["domains"].append({"id": f"cd-{h}", "hostname": h, "service": v["service"], "environment": v.get("environment"), "zone_id": cf["zone"]["id"]})
            elif want[0] == "record":
                cf["records"].append({"id": v["id"], "name": h, "type": v["type"], "content": v["content"], "proxied": v["proxied"], "ttl": want[2]})
        for r in tfvars.get("acm_validation_records", []):
            name, value = r["name"].rstrip("."), r["value"].rstrip(".")
            if not any(x["name"] == name and x["content"] == value for x in cf["records"]):
                cf["records"].append({"id": f"acm-{name}", "name": name, "type": "CNAME", "content": value, "proxied": False, "ttl": 300})
            for c in self.w.d["aws"]["certs"].values():   # ACM validates once its record exists
                if any(x["name"].rstrip(".") == name for x in c.get("records", [])):
                    c["status"] = "ISSUED"
        self.w.d.setdefault("tofu", {})["adopted"] = True
        self.w.d["tofu"].pop("removed_from_config", None)
        self.applies.append({"targets": dict(tfvars.get("targets", {})), "scoped": bool(targets)})
        self.w.save()
        return changes


class FakeClock:
    def __init__(self, world: World):
        self.w = world

    def now(self):
        return dt.datetime.fromisoformat(self.w.d["now"].replace("Z", "+00:00"))

    def sleep(self, s):
        t = self.now() + dt.timedelta(seconds=s)
        self.w.d["now"] = t.strftime("%Y-%m-%dT%H:%M:%SZ")


class SavingState:
    """FileState that also saves the fake world, so CLI runs chain."""

    def __init__(self, path: Path | None, world: World):
        self.path, self.w, self.mem = path, world, None

    def load(self):
        if self.path and self.path.exists():
            return json.loads(self.path.read_text())
        return copy.deepcopy(self.mem)

    def save(self, state):
        if self.path:
            self.path.write_text(json.dumps(state, indent=1, sort_keys=True))
        else:
            self.mem = copy.deepcopy(state)
        self.w.save()


def build(fixtures: Path, cfg: dict, plan_only: bool, state_file: str | None, module, world_data: dict | None = None, stack: Path | None = None):
    """A Ctx over fakes. The stack directory is a scratch copy holding the
    inventory, so export can write to it without touching the repository."""
    state_path = Path(state_file) if state_file else None
    world_path = state_path.with_suffix(".world.json") if state_path else None
    if world_data is None:
        if world_path and world_path.exists():
            world_data = json.loads(world_path.read_text())
        else:
            world_data = json.loads((fixtures / "world.json").read_text())
    world = World(world_data, world_path)
    if stack is None:
        stack = (state_path.parent / "stack") if state_path else Path(tempfile.mkdtemp(prefix="cutover-stack-"))
        stack.mkdir(parents=True, exist_ok=True)
        inv = fixtures / "inventory.generated.json"
        if not (stack / "inventory.generated.json").exists() and inv.exists():
            shutil.copy(inv, stack / "inventory.generated.json")
    extra = fixtures / "apps.extra.json"
    if extra.exists():
        names = {a["name"] for a in cfg["apps"]}
        cfg = {**cfg, "apps": cfg["apps"] + [a for a in json.loads(extra.read_text())["apps"] if a["name"] not in names]}
        module.validate_config(cfg)
    secrets = world.d["aws"]["secrets"]
    paddle = FakePaddle(world, plan_only, module) if secrets.get(module.SECRET_PADDLE) else None
    ctx = module.Ctx(cfg, FakeCloudflare(world, plan_only, module), paddle, FakeAws(world, plan_only, module), FakeHttp(world),
                     FakeTofu(world, stack, plan_only, module), SavingState(state_path, world), FakeClock(world), plan_only=plan_only, stack=stack)
    ctx.world = world
    return ctx
