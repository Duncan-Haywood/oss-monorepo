"""Time compare_and_write_production_job_status on plans of N photo assets.

Run from ventures/photo-editing: PYTHONPATH=src python3 tools/bench_status_writes.py 100 500 2000
(docs/history/ci-perf-2026-11-20-production-status-plan-memo.md)."""

import sys
import tempfile
import time

from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_status import (
    ProductionJobStatus,
    compare_and_write_production_job_status,
    initialize_production_status_manifest,
)


def bench(n, writes=20):
    assets = [MediaAsset(path=f"media/IMG_{i:05d}.JPG", media_type="photo") for i in range(n)]
    plan = build_production_plan(assets, "bench")
    with tempfile.TemporaryDirectory() as tmp:
        initialize_production_status_manifest(tmp, trusted_plan=plan)
        free = [j for j in plan.jobs if not j.depends_on][:writes]
        t = time.perf_counter()
        for j in free:
            compare_and_write_production_job_status(
                tmp,
                trusted_plan=plan,
                updated_status=ProductionJobStatus(
                    job_id=j.job_id,
                    state="running",
                    worker_adapter="local",
                    attempts=1,
                    updated_at="2026-11-20T00:00:00Z",
                ),
                expected_state="pending",
                expected_attempts=0,
            )
        dt = (time.perf_counter() - t) / len(free)
    return len(plan.jobs), dt


for n in map(int, sys.argv[1:]):
    jobs, dt = bench(n)
    print(f"assets={n} jobs={jobs} ms/write={dt * 1000:.2f} est_shoot_s={dt * jobs * 2:.1f}")
