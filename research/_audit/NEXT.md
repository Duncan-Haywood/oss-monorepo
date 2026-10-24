# Handoff: finish the research reproducibility audit

For a future agent. The 2026-10-20 run stopped early at the owner's request. Its findings are in
[`README.md`](README.md) and the post `docs/posts/2026-10-20-is-ai-written-research-real-a-reproducibility-audit.md`.
Every partial result is saved next to this file:

| file | what it holds | done |
|---|---|---|
| `runs-alpha-2026-10-20.jsonl` | alphabetical re-run, stopped early | 23 of 761 |
| `runs-random-2026-10-20.jsonl` | seeded random re-run (seed 20261020, 120 s) | 9 of 761 |
| `runs-manual-2026-10-20.jsonl` | `ambient-bandit`, re-run three times by hand | 1 |
| `tests-2026-10-20.jsonl` | `pytest` per project | 231 of 761 |
| `scan-2026-10-20.jsonl` | README and input census | 761 of 761 |
| `handlabel-2026-10-20.md` | hand labels | 40 |
| `audit.json` | the merged table the report quotes | — |

## Steps

1. **Set up** (about 3 minutes):
   ```bash
   pip install numpy scipy matplotlib scikit-learn scikit-fem shapely mujoco cma psutil pytest
   apt-get update -qq && apt-get install -y yosys iverilog verilator
   git worktree add /tmp/tree origin/main
   (cd /tmp/tree/research/accel-pdkprice && sh fetch_pdk.sh pdk)
   (cd /tmp/tree/research/accel-ihpprice && sh fetch_pdk.sh pdk)
   ```
2. **Resume the random re-run.** It skips slugs already in the file, so it continues where it stopped:
   ```bash
   cp research/_audit/runs-random-2026-10-20.jsonl /tmp/runs-random.jsonl
   python3 research/_audit/repro_audit.py run --tree /tmp/tree --out /tmp/runs-random.jsonl \
       --jobs 4 --timeout 600 --seed 20261020 --siblings
   ```
   - Run it with `run_in_background`; the estimate is 3 to 5 hours on 4 cores.
   - Never kill it with `pkill -f repro_audit`. The pattern also matches your own shell, which then dies with exit 144. Use `kill <pid>`.
   - If the session must end first, commit the partial `.jsonl` back here. Any prefix of a seeded random order is still a random sample.
3. **Retry the inconclusive ones** with the README's own commands, then serially with a long limit:
   ```bash
   python3 -c "import json; print(' '.join(r['slug'] for r in map(json.loads, open('/tmp/runs-random.jsonl')) if r['outcome'] in ('error','timeout','missing-dep','no-runner')))" > /tmp/retry
   python3 research/_audit/repro_audit.py run --tree /tmp/tree --out /tmp/runs-readme.jsonl --readme --siblings --jobs 1 --timeout 2400 --only $(cat /tmp/retry)
   ```
   Reset a project first (`git -C /tmp/tree checkout -- research/<slug>`) if an earlier pass rewrote its files.
4. **Investigate every `differs`.** For each one:
   - re-run it twice to see whether it is deterministic;
   - diff it against the committed file;
   - decide whether the README's conclusions still hold.

   Record the verdict in a `runs-manual-*.jsonl` row with a `note`, as was done for `ambient-bandit`. A `differs` is a finding to report, never something to hide by regenerating `results.txt` in the same PR.
5. **Finish the tests:** `python3 research/_audit/repro_audit.py tests --out /tmp/tests.jsonl --jobs 2`. The full run is fine; it takes about an hour.
6. **Rebuild and rewrite:**
   ```bash
   python3 research/_audit/repro_audit.py scan --out /tmp/scan.jsonl
   python3 research/_audit/repro_audit.py report --runs research/_audit/runs-alpha-2026-10-20.jsonl /tmp/runs-random.jsonl /tmp/runs-readme.jsonl research/_audit/runs-manual-2026-10-20.jsonl \
       --scan /tmp/scan.jsonl --tests /tmp/tests.jsonl --out research/_audit/audit.json
   ```
   Then:
   - copy the new `.jsonl` files here with the new date;
   - update every number in `README.md` and in the blog post, compute fresh Wilson intervals, and keep the `swe-audit` pooling explicit;
   - add a dated "Updated" line to the post rather than rewriting its history.
7. **Fix forward, each in its own small PR** (README "Action items" 4 to 7):
   - `appeal-panels`'s float-equality test;
   - `chip-rtl-*` should skip without `verilator`;
   - `forgetting-audit`'s collection error;
   - a `pytest` job for changed projects in `.github/workflows/research-ci.yml`;
   - `ambient-bandit`'s BLAS-dependent `multivariate_normal`;
   - committed outputs for the 7 projects with none.
8. **Second rater.** Label the same 40 projects blind with the definitions in `handlabel-2026-10-20.md`. Report agreement (Cohen's kappa), then label 40 more with seed 20261021.

Checks before merging: `python3 -m pytest -q research/_audit`, `python3 research/_homepage/build.py`,
`python3 platform/ci/check_md_links.py`, `node platform/pages/writing.mjs --out=/tmp/w`.
Follow the run record and landing rules in `prompt.md` and `CLAUDE.md`.
