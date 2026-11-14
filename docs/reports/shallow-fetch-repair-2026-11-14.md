---
kind: note
date: 2026-11-14
---
# Shallow clone stops deepening after one `--shallow-since` fetch (2026-11-14)

**Symptom.** `git fetch --shallow-since=...`, `--deepen=N` or `--depth=N` fails with
`fatal: error in object: unshallow <sha>`; tools that fetch history quietly read a short one
(quality `queue` printed "changed since audit: unknown" for every row in this session).

**Cause.** After a first `--shallow-since` fetch, `.git/shallow` can list a commit the fetch never
sent and no fetched commit names as a parent. Reproduced from a fresh `git fetch --depth=1` clone
(git 2.43): `--shallow-since='7 hours ago'` ok, then `--shallow-since=2026-11-12` rc 128. This session's
clone got its bad entry (`2dc457b2b`) the same way, from its first `--shallow-since` fetch.

**Fix.** `python3 platform/ci/shallow_repair.py` drops entries whose object is absent (`--check`
exits 1 if any). After it the same fetch brought 891 commits. In code, `shallow_repair.fetch(args, cwd)`
repairs, fetches, retries once on `unshallow`, and repairs again.

**Wired in:** `quality_metrics.deepen_for` (quality queue), `research/_shared/pick_track.py`
claim check, `portfolio/router/allocate.py` 7-day counts, `portfolio/work/workctl.py coverage`,
`portfolio/direction/report.py`. Not wired (control plane, owner-gated): `prompts/promptctl.py`
measure's 14-day fetch; and `platform/ci/concurrency_tax.py` (uses `unlanded_work.git`, which
already works around it with a separate probe repo).

**History.** 24 run records hit the error, 2026-10-15..10-24 (`grep -l "unshallow [0-9a-f]"
prompts/runs/*.json`); one built a treeless probe repo to avoid it. Fewer since, probably because
fewer tools deepened; the quality queue fetch added on 2026-11-14 met it again on the next run.
