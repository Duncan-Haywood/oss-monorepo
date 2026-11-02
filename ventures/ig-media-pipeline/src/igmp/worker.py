"""`igmp worker`: the loop a cloud machine runs, continuously.

One cycle (`run_cycle`):

  lease     take (or renew) `lease.json`, so two workers never own the state at once; a cycle is
            skipped while another worker holds it, and the lease is renewed in the background
            while a long cycle runs
  restore   when the lease was just taken: the state from the bucket (`cloud.restore_state`)
  mirror    `library/` from the bucket into a local folder; its roots become `cfg.library_roots`
  pipeline  every stage (`cli.pipeline`, "run") with the configured backend behind a daily token
            budget (`budget.py`); a budget stop ends the stages cleanly and is noted
  push      outputs to the bucket, then a consistent snapshot of the database
  status    `status.json` and a self-contained `status.html` in the bucket

Every step is caught on its own, logged and written into the status, so one failure never stops
the loop. `serve` runs a cycle every `worker_interval_s` seconds; it refuses the claude-code
backend (the Claude plan belongs on the owner's own Mac) unless `worker_allow_plan = true`.

Settings (config.toml, read through `cfg.extra`): worker_interval_s (600), worker_tokens_per_day
(2_000_000), worker_calls_per_day (none), worker_task_tokens (estimate per batch task; default: the
running average), worker_lease_s (1800, at least twice the interval), worker_library_dir
(default `<state_dir>/../library`), worker_allow_plan (false).
"""
from __future__ import annotations

import html
import json
import logging
import os
import secrets
import signal
import socket
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .budget import BudgetedJudge, BudgetExhausted, TokenBudget
from .config import Config

log = logging.getLogger(__name__)

DEFAULT_INTERVAL_S = 600
DEFAULT_TOKENS_PER_DAY = 2_000_000
DEFAULT_LEASE_S = 1800
COUNT_TABLES = ("assets", "metrics", "scores", "edits", "reels", "carousels", "astro", "jobs")
SHIPPED_TABLES = ("edits", "reels", "carousels")


def _x(cfg: Config) -> dict:
    return cfg.extra or {}


def interval_s(cfg: Config) -> int:
    return int(_x(cfg).get("worker_interval_s", DEFAULT_INTERVAL_S))


def lease_s(cfg: Config, interval: int | None = None) -> int:
    return max(int(_x(cfg).get("worker_lease_s", DEFAULT_LEASE_S)), 2 * (interval or interval_s(cfg)))


def library_dir(cfg: Config) -> Path:
    d = _x(cfg).get("worker_library_dir")
    return Path(d).expanduser() if d else cfg.state_dir.parent / "library"


def make_budget(cfg: Config, store) -> TokenBudget:
    x = _x(cfg)
    calls = x.get("worker_calls_per_day")
    est = x.get("worker_task_tokens")
    return TokenBudget(store, int(x.get("worker_tokens_per_day", DEFAULT_TOKENS_PER_DAY)),
                       calls_per_day=int(calls) if calls else None, task_estimate=int(est) if est else None)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _jsonable(v):
    try:
        return json.loads(json.dumps(v, default=str))
    except (TypeError, ValueError):
        return str(v)


def counts(store) -> dict:
    """Rows per table, and how many edits / reels / carousels shipped."""
    out: dict = {}
    with store.lock:
        for t in COUNT_TABLES:
            try:
                out[t] = store.db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            except Exception:
                out[t] = None
        for t in SHIPPED_TABLES:
            try:
                out[f"{t}_shipped"] = store.db.execute(
                    f"SELECT COUNT(*) FROM {t} WHERE json_extract(value, '$.status') = 'shipped'").fetchone()[0]
            except Exception:
                pass
    return out


class _Heartbeat:
    """Renews the lease while a long cycle runs (batches can take hours). `lost` turns true when
    another worker took it meanwhile; the cycle then leaves the state snapshot to that worker."""

    def __init__(self, cloud, bucket, owner: str, ttl: int):
        self.cloud, self.bucket, self.owner, self.ttl = cloud, bucket, owner, ttl
        self.lost = False
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, name="igmp-lease", daemon=True)

    def _run(self) -> None:
        while not self._stop.wait(max(5, self.ttl // 3)):
            try:
                if not self.cloud.renew_lease(self.bucket, self.owner, self.ttl):
                    log.error("worker: lost the lease to another worker")
                    self.lost = True
                    return
            except Exception as e:          # a network blip: try again next beat
                log.warning("worker: lease renewal failed: %s", e)

    def __enter__(self):
        self._t.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._t.join(timeout=5)


def run_cycle(cfg: Config, bucket, *, owner: str, budget: TokenBudget | None = None,
              pipeline: Callable | None = None, mirror_dir: Path | None = None, held: bool = False,
              interval: int | None = None, judge_factory: Callable | None = None) -> dict:
    """One worker cycle; returns the status it wrote. `held`: this worker held the lease after its
    last cycle (renew it, keep the local state) rather than taking it fresh (take it, restore)."""
    from . import cloud

    t0 = time.monotonic()
    started = _now()
    interval = interval or interval_s(cfg)
    ttl = lease_s(cfg, interval)
    status: dict = {"owner": owner, "host": socket.gethostname(), "started": _iso(started), "errors": [],
                    "steps": {}}

    def failed(step: str, e: BaseException) -> None:
        log.error("worker: %s failed: %s", step, e, exc_info=True)
        status["errors"].append({"step": step, "error": f"{type(e).__name__}: {e}",
                                 "trace": traceback.format_exc(limit=6)[-2000:]})

    # --- lease ---------------------------------------------------------------------------------
    try:
        got = held and cloud.renew_lease(bucket, owner, ttl)
        status["lease"] = "renewed" if got else None
        if not got:
            got = cloud.acquire_lease(bucket, owner, ttl)
            status["lease"] = "acquired" if got else "held-by-other"
    except Exception as e:
        failed("lease", e)
        status["lease"] = "error"
        got = False
    if not got:
        # another worker owns the state (or the bucket is unreachable): its status stays as it is
        status["skipped"] = ("another worker holds the lease" if status["lease"] == "held-by-other"
                             else "the lease could not be checked")
        status["finished"] = _iso(_now())
        status["duration_s"] = round(time.monotonic() - t0, 1)
        log.info("worker: cycle skipped: %s", status["skipped"])
        return status

    with _Heartbeat(cloud, bucket, owner, ttl) as beat:
        if status["lease"] == "acquired":
            try:
                status["restore"] = cloud.restore_state(cfg, bucket)
            except Exception as e:
                failed("restore", e)

        # --- library mirror ----------------------------------------------------------------------
        dest = Path(mirror_dir) if mirror_dir else library_dir(cfg)
        try:
            m = cloud.mirror_library(cfg, bucket, dest)
            roots = [Path(r) for r in (m.get("roots") or [])]
            if roots:
                cfg.library_roots = roots
            status["steps"]["mirror"] = {k: v for k, v in m.items() if k != "roots"}
            status["library_roots"] = [str(r) for r in cfg.library_roots]
        except Exception as e:
            failed("mirror", e)

        # --- the stages --------------------------------------------------------------------------
        store = None
        judge = None
        try:
            from .store import Store
            store = Store(cfg.db_path)
            budget = budget if budget is not None else make_budget(cfg, store)
            if judge_factory is None:
                from .judge import backend as judge_factory
            judge = BudgetedJudge(judge_factory(cfg), budget)
            if pipeline is None:
                from .cli import pipeline
            p0 = time.monotonic()
            try:
                pipeline(cfg, store, "run", judge=judge)
            finally:
                status["steps"]["pipeline_s"] = round(time.monotonic() - p0, 1)
        except BudgetExhausted as e:
            log.warning("worker: stages stopped by the token budget: %s", e)
            status["budget_stop"] = str(e)
        except Exception as e:
            failed("pipeline", e)
        if judge is not None:
            status["deferred_tasks"] = judge.deferred
            if judge.stopped and "budget_stop" not in status:
                status["budget_stop"] = "batches trimmed to the daily budget"
        if budget is not None:
            try:
                status["budget"] = budget.summary()
                # the names `igmp cloud status` reads
                status["tokens_today"], status["tokens_cap"] = status["budget"]["tokens"], status["budget"]["cap"]
            except Exception as e:
                failed("budget", e)
        if store is not None:
            try:
                status["counts"] = counts(store)
            except Exception as e:
                failed("counts", e)
            try:
                store.db.close()            # the snapshot reads the file; nothing writes it now
            except Exception:
                pass

        # --- push --------------------------------------------------------------------------------
        try:
            status["steps"]["push"] = _jsonable(cloud.push_outputs(cfg, bucket))
        except Exception as e:
            failed("push", e)
        if beat.lost:
            status["errors"].append({"step": "snapshot", "error": "lease lost during the cycle; "
                                     "the state snapshot is left to the worker that holds it"})
        else:
            try:
                obj = cloud.snapshot_state(cfg, bucket)
                status["steps"]["snapshot"] = {"key": getattr(obj, "key", None), "size": getattr(obj, "size", None)}
            except Exception as e:
                failed("snapshot", e)
        if beat.lost:
            status["lease"] = "lost"

    finished = _now()
    status["finished"] = status["finished_at"] = _iso(finished)
    status["duration_s"] = round(time.monotonic() - t0, 1)
    status["next_cycle"] = _iso(finished + timedelta(seconds=interval))
    write_status(cfg, bucket, status)
    return status


def write_status(cfg: Config, bucket, status: dict) -> None:
    """status.json and status.html to the bucket (and a local copy in state_dir); never raises."""
    body = json.dumps(_jsonable(status), indent=1, sort_keys=True).encode()
    page = status_html(status).encode()
    try:
        cfg.state_dir.mkdir(parents=True, exist_ok=True)
        (cfg.state_dir / "worker-status.json").write_bytes(body)
    except Exception as e:
        log.warning("worker: local status not written: %s", e)
    for key, data, ctype in (("status.json", body, "application/json"),
                             ("status.html", page, "text/html; charset=utf-8")):
        try:
            bucket.put_bytes(key, data, content_type=ctype)
        except Exception as e:
            log.error("worker: %s not written: %s", key, e)
            status["errors"].append({"step": f"write {key}", "error": f"{type(e).__name__}: {e}"})


def status_html(s: dict) -> str:
    """A plain page a phone can read: no scripts, no external files, light and dark."""
    e = lambda v: html.escape("" if v is None else str(v))   # noqa: E731
    b = s.get("budget") or {}
    cap, used = b.get("cap"), b.get("tokens") or 0
    pct = min(100, round(100 * used / cap)) if cap else 0
    rows = "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in (s.get("counts") or {}).items())
    errs = s.get("errors") or []
    err_html = ("".join(f"<li><b>{e(x.get('step'))}</b>: {e(x.get('error'))}</li>" for x in errs)
                if errs else "<li>none</li>")
    state = ("skipped: " + e(s["skipped"])) if s.get("skipped") else (
        "stopped by the daily token budget" if s.get("budget_stop") else ("errors" if errs else "ok"))
    budget_line = (f"{used:,} of {cap:,} tokens ({pct}%), {b.get('calls', 0):,} calls, day {e(b.get('day'))} UTC"
                   if cap else f"{used:,} tokens, {b.get('calls', 0):,} calls (no cap)") if b else "not measured"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>igmp worker status</title>
<style>
:root {{ --bg:#ffffff; --fg:#1b1b1b; --muted:#5f5f5f; --line:#dddddd; --bar:#2d6cdf; --bad:#b3261e; }}
@media (prefers-color-scheme: dark) {{
  :root {{ --bg:#141414; --fg:#ececec; --muted:#a3a3a3; --line:#333333; --bar:#7aa7ff; --bad:#ff8a80; }}
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:16px; background:var(--bg); color:var(--fg);
  font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }}
main {{ max-width:40rem; margin:0 auto; }}
h1 {{ font-size:1.3rem; margin:0 0 .25rem; }}
h2 {{ font-size:1rem; margin:1.5rem 0 .5rem; }}
p, li {{ overflow-wrap:anywhere; }}
.muted {{ color:var(--muted); }}
table {{ width:100%; border-collapse:collapse; }}
th, td {{ text-align:left; padding:.3rem .2rem; border-bottom:1px solid var(--line); }}
td {{ text-align:right; font-variant-numeric:tabular-nums; }}
.meter {{ height:.6rem; background:var(--line); border-radius:.3rem; overflow:hidden; }}
.meter span {{ display:block; height:100%; width:{pct}%; background:var(--bar); }}
.errors li {{ color:var(--bad); }}
</style></head>
<body><main>
<h1>igmp worker</h1>
<p class="muted">{state}</p>
<p>Last cycle: {e(s.get('started'))} UTC, {e(s.get('duration_s'))} s<br>
Next cycle: {e(s.get('next_cycle') or 'when the lease is free')} UTC<br>
Worker: {e(s.get('owner'))} (lease {e(s.get('lease'))})</p>
<h2>Tokens today</h2>
<p>{budget_line}</p>
<div class="meter" role="img" aria-label="{pct}% of today's token cap"><span></span></div>
{f'<p class="muted">{e(s.get("deferred_tasks"))} tasks wait for a later cycle.</p>' if s.get('deferred_tasks') else ''}
<h2>Library and outputs</h2>
<table>{rows or '<tr><td>no counts</td></tr>'}</table>
<h2>Errors this cycle</h2>
<ul class="errors">{err_html}</ul>
</main></body></html>
"""


def serve(cfg: Config, *, once: bool = False, interval: int | None = None,
          sleep: Callable[[float], None] = time.sleep) -> int:
    """Run cycles until stopped (SIGTERM or Ctrl-C), releasing the lease on the way out."""
    if cfg.backend != "api" and not _x(cfg).get("worker_allow_plan"):
        log.error("worker: refusing backend %r: the cloud worker uses backend = \"api\" (an Anthropic API key "
                  "under a daily token cap). The claude-code backend runs on your Claude plan and belongs on "
                  "your own Mac; set worker_allow_plan = true only if this machine is yours.", cfg.backend)
        return 2
    if cfg.backend == "api" and not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        log.error("worker: backend = \"api\" needs ANTHROPIC_API_KEY in the environment (see deploy/README.md)")
        return 2
    from . import cloud
    from .bucket import open_bucket
    bucket = open_bucket(cfg)
    if bucket is None:
        log.error("worker: cloud_url is not set; the worker needs a bucket (see docs/CLOUD.md)")
        return 2
    interval = int(interval or interval_s(cfg))
    owner = f"{socket.gethostname()}:{os.getpid()}:{secrets.token_hex(4)}"
    log.info("worker %s: bucket %r, a cycle every %d s", owner, bucket, interval)

    class _Stop(BaseException):         # not an Exception: run_cycle's step handlers must not catch it
        pass

    def on_term(signum, frame):
        raise _Stop()

    old = None
    if threading.current_thread() is threading.main_thread():
        old = signal.signal(signal.SIGTERM, on_term)
    held = False
    code = 0
    try:
        while True:
            st = run_cycle(cfg, bucket, owner=owner, held=held, interval=interval)
            held = st.get("lease") in ("acquired", "renewed")
            code = 1 if st.get("errors") else 0
            if once:
                break
            sleep(interval)
    except (_Stop, KeyboardInterrupt):
        log.info("worker: stopping")
        code = 0
    finally:
        try:                            # release_lease only gives up a lease this owner holds
            cloud.release_lease(bucket, owner)
        except Exception as e:
            log.warning("worker: lease not released (it expires by itself): %s", e)
        if old is not None:
            signal.signal(signal.SIGTERM, old)
    return code


def cli_worker(cfg: Config, args) -> int:
    """`igmp worker [--once] [--interval S]`."""
    return serve(cfg, once=bool(getattr(args, "once", False)), interval=getattr(args, "interval", None))
