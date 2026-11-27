#!/usr/bin/env python3
"""Count the Cloudflare cron triggers the repository's Workers configure, against the plan's limit.

Cloudflare counts cron triggers per *account* (Free: 5, Paid: 1,000), and every schedule string
on every Worker counts. Over the limit, the deploy that pushes the sixth one fails its trigger
update, and nothing before that tells the session adding a cron (backlog P097).

Two numbers:

- *deployed*: schedules on Workers a workflow deploys (a `.github/workflows/*.yml` that runs
  `wrangler deploy` with `working-directory:` the config's folder). Over the limit is a failure:
  those deploys will collide on the account.
- *configured*: every schedule in every `wrangler*.jsonc|json|toml` (not `*.test.*`). Over the
  limit is a warning (exit 0) until `--strict`, which CI passes since P098 brought the count to
  the limit: a schedule a Worker configures gets deployed sooner or later, so the PR adding it is
  where it should fail. The fix it names: a Durable Object alarm, which is not a cron trigger.

The limit comes from `portfolio/hosting/cloudflare-plan.json`.

    python3 platform/ci/cron_budget.py [--root DIR] [--strict] [--json]
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    tomllib = None

ROOT = Path(__file__).resolve().parents[2]
PLAN = Path("portfolio/hosting/cloudflare-plan.json")
SKIP_DIRS = {".git", "node_modules", "dist", "_site", ".wrangler", "__pycache__"}
CONFIG_RE = re.compile(r"^wrangler[^/]*\.(jsonc|json|toml)$")
WORKDIR_RE = re.compile(r"""working-directory:\s*["']?([^\s"'#]+)""")


def strip_jsonc(text):
    """Drop // and /* */ comments outside strings, and trailing commas, so json.loads reads it."""
    out, i, n, in_str = [], 0, len(text), False
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == '"':
                in_str = False
            i += 1
        elif c == '"':
            in_str = True
            out.append(c)
            i += 1
        elif text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def load_config(path):
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".toml":
        if tomllib is None:
            raise RuntimeError("Python 3.11+ is needed to read " + str(path))
        return tomllib.loads(text)
    return json.loads(strip_jsonc(text))


def schedules(cfg):
    """[(worker label, cron)] for the top level and each `env.<name>` (each env is its own Worker)."""
    out = []
    base = cfg.get("name") or "?"
    for c in ((cfg.get("triggers") or {}).get("crons") or []):
        out.append((base, c))
    for env, ecfg in (cfg.get("env") or {}).items():
        if not isinstance(ecfg, dict):
            continue
        label = ecfg.get("name") or f"{base}-{env}"
        for c in ((ecfg.get("triggers") or {}).get("crons") or []):
            out.append((label, c))
    return out


def find_configs(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for f in sorted(filenames):
            if CONFIG_RE.match(f) and ".test." not in f:
                yield Path(dirpath) / f


def deployed_dirs(root):
    """Folders (relative, posix) a workflow runs `wrangler deploy` in, by its `working-directory:` lines."""
    out = set()
    wf = root / ".github" / "workflows"
    if not wf.is_dir():
        return out
    for p in sorted(wf.glob("*.y*ml")):
        text = p.read_text(encoding="utf-8")
        if "wrangler deploy" not in text:
            continue
        for m in WORKDIR_RE.finditer(text):
            out.add(m.group(1).removeprefix("./").rstrip("/") or ".")
    return out


def scan(root):
    root = Path(root)
    deploy = deployed_dirs(root)
    rows = []
    for path in find_configs(root):
        rel = path.relative_to(root)
        try:
            cfg = load_config(path)
        except (ValueError, RuntimeError) as e:
            rows.append({"config": rel.as_posix(), "error": str(e)})
            continue
        for worker, cron in schedules(cfg):
            rows.append({
                "config": rel.as_posix(),
                "worker": worker,
                "cron": cron,
                "deployed": rel.parent.as_posix() in deploy,
            })
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--strict", action="store_true", help="also fail when the configured total is over")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    root = Path(a.root)
    plan = json.loads((root / PLAN).read_text(encoding="utf-8"))
    limit = int(plan["cron_triggers_per_account"])
    rows = scan(root)
    errors = [r for r in rows if "error" in r]
    crons = [r for r in rows if "error" not in r]
    deployed = [r for r in crons if r["deployed"]]
    if a.json:
        print(json.dumps({"plan": plan.get("workers_plan"), "limit": limit, "configured": len(crons),
                          "deployed": len(deployed), "rows": rows}, indent=2))
    else:
        for r in crons:
            mark = "deployed" if r["deployed"] else "by hand / not deployed"
            print(f"  {r['cron']:<14} {r['worker']:<22} {r['config']}  ({mark})")
        print(f"cron triggers: {len(deployed)} deployed by a workflow, {len(crons)} configured; "
              f"Workers {plan.get('workers_plan')} allows {limit} per account ({PLAN})")
    for r in errors:
        print(f"::error file={r['config']}::cannot read Worker config: {r['error']}")
    fail = bool(errors)
    if len(deployed) > limit:
        print(f"::error title=Cron triggers over the account limit::{len(deployed)} schedules on "
              f"workflow-deployed Workers, {limit} allowed: the last deploy's trigger update will fail. "
              "Run the job on a Durable Object alarm instead (alarms are not cron triggers; "
              "ventures/payapps/apps/payapps-site/src/worker/purge-clock.ts is the pattern), fold it "
              f"into another Worker's scheduled handler, or the owner moves the account to Workers Paid "
              f"and {PLAN} says so.")
        fail = True
    if len(crons) > limit:
        print(f"::warning title=Cron triggers configured over the account limit::{len(crons)} schedules "
              f"configured, {limit} allowed. CI runs --strict, so this fails: move one to a Durable Object "
              "alarm (ventures/*/apps/*-site/src/purge-clock.mjs is the pattern) or fold it into "
              "another Worker's scheduled handler.")
        fail = fail or a.strict
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
