#!/usr/bin/env python3
"""Discrete-event model of PR review policies for a repo run by short agent sessions.

Each PR is opened by a session that leaves soon after; a defect may ride along.
Policies differ in who reviews, when, and whether anyone is still around to act
on "changes requested". The model counts, per simulated day:

  landed         PRs whose change reached main
  orphaned       PRs a reviewer sent back after the author left (nobody to finish them)
  backlog        PRs still waiting for a first review at the end of the window
  p50/p90 ttm    minutes from "ready" to on main
  escaped        defects that reached main and were never caught in the window
  exposure_h     defect-hours on main (merge -> fix landing), caught or not
  review_min     reviewer minutes spent (a proxy for tokens)

Policies:
  none        merge on green (today)
  async       blocking review by a later session; author waits up to --author-wait,
              then leaves; an approval arriving later auto-merges, a change request
              arriving later orphans the PR
  async-fix   as async, but the reviewer fixes what it finds and merges (owns landing)
  insession   the authoring session runs an independent reviewer on its own diff
              before merging, then fixes what it finds
  postmerge   merge on green; audit sessions review merged PRs (risk-first), and
              open fix-forward PRs for what they find
  hybrid      insession for high-risk PRs, postmerge for the rest

Parameters are flags; defaults are the values measured in the 2026-10-24 report
(docs/reports/2026-10-24-pr-review-without-dead-branches.md). Stdlib only.
"""
from __future__ import annotations

import argparse
import heapq
import json
import random
import statistics

DAY = 24 * 60.0


def simulate(policy: str, a: argparse.Namespace, seed: int) -> dict:
    rng = random.Random(seed)
    horizon = a.days * DAY
    # PR arrivals (minutes), Poisson.
    t, prs = 0.0, []
    while True:
        t += rng.expovariate(a.prs_per_day / DAY)
        if t > horizon:
            break
        risky = rng.random() < a.risky_share
        p_def = a.defect_rate_risky if risky else a.defect_rate
        prs.append({"t": t, "risky": risky, "defect": rng.random() < p_def})

    landed, orphans, backlog, ttm, exposure, escaped, review_min = 0, 0, 0, [], 0.0, 0, 0.0

    def detect(pr) -> bool:
        return pr["defect"] and rng.random() < a.detect

    if policy in ("none", "insession", "postmerge", "hybrid"):
        audit_queue = []  # (priority, merge_time, idx)
        for i, pr in enumerate(prs):
            pre = policy == "insession" or (policy == "hybrid" and pr["risky"])
            extra = 0.0
            caught = False
            if pre:
                extra += a.review_minutes
                review_min += a.review_minutes
                if detect(pr):
                    caught = True
                    extra += a.fix_minutes
            merge_t = pr["t"] + a.ci_minutes + extra
            landed += 1
            ttm.append(merge_t - pr["t"])
            if pr["defect"] and not caught:
                if policy in ("postmerge", "hybrid") and not pre:
                    heapq.heappush(audit_queue, (0 if pr["risky"] else 1, merge_t, i))
                else:
                    escaped += 1
                    exposure += horizon - merge_t
            elif policy in ("postmerge", "hybrid") and not pre:
                heapq.heappush(audit_queue, (0 if pr["risky"] else 1, merge_t, i))
        if policy in ("postmerge", "hybrid"):
            # Audit sessions arrive as a Poisson stream; each audits up to K merged PRs,
            # risky first, then oldest first.
            pending = sorted(audit_queue)
            pending_heap: list = []
            t = 0.0
            j = 0
            by_time = sorted(audit_queue, key=lambda x: x[1])
            while True:
                t += rng.expovariate(a.review_sessions_per_day / DAY)
                if t > horizon:
                    break
                while j < len(by_time) and by_time[j][1] <= t:
                    heapq.heappush(pending_heap, by_time[j])
                    j += 1
                for _ in range(a.k_per_session):
                    if not pending_heap:
                        break
                    _, mt, i = heapq.heappop(pending_heap)
                    review_min += a.review_minutes
                    pr = prs[i]
                    if pr["defect"]:
                        if detect(pr):
                            fix_t = t + a.review_minutes + a.fix_minutes + a.ci_minutes
                            exposure += fix_t - mt
                        else:
                            escaped += 1
                            exposure += horizon - mt
            leftover = list(pending_heap) + by_time[j:]
            del pending
            for _, mt, i in leftover:
                if prs[i]["defect"]:
                    escaped += 1
                    exposure += horizon - mt
    else:  # async, async-fix
        # Reviewer sessions arrive; each takes up to K ready PRs, oldest first.
        events = []
        t = 0.0
        while True:
            t += rng.expovariate(a.review_sessions_per_day / DAY)
            if t > horizon:
                break
            events.append(t)
        queue: list = []
        j = 0
        order = sorted(range(len(prs)), key=lambda i: prs[i]["t"])
        reviewed = set()
        for rt in events:
            while j < len(order) and prs[order[j]]["t"] + a.ci_minutes <= rt:
                queue.append(order[j])
                j += 1
            take, queue = queue[: a.k_per_session], queue[a.k_per_session:]
            for i in take:
                pr = prs[i]
                reviewed.add(i)
                review_min += a.review_minutes
                ready = pr["t"] + a.ci_minutes
                author_gone = rt - ready > a.author_wait
                found = detect(pr)
                if found:
                    if policy == "async-fix":
                        merge_t = rt + a.review_minutes + a.fix_minutes + a.ci_minutes
                    elif not author_gone:
                        merge_t = rt + a.review_minutes + a.fix_minutes + a.ci_minutes
                    else:
                        orphans += 1
                        continue
                else:
                    merge_t = rt + a.review_minutes
                landed += 1
                ttm.append(merge_t - pr["t"])
                if pr["defect"] and not found:
                    escaped += 1
                    exposure += horizon - merge_t
        # PRs never reviewed within the window are open, not landed: a growing
        # backlog when review capacity is below the arrival rate.
        backlog = sum(1 for i in order if i not in reviewed)

    days = a.days
    ttm.sort()
    q = lambda p: ttm[min(len(ttm) - 1, int(p * (len(ttm) - 1)))] if ttm else float("nan")
    return {
        "landed": landed / days,
        "orphaned": orphans / days,
        "backlog": backlog / days,
        "p50_ttm": q(0.5),
        "p90_ttm": q(0.9),
        "escaped": escaped / days,
        "exposure_h": exposure / 60 / days,
        "review_min": review_min / days,
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--policy", default="all")
    p.add_argument("--days", type=float, default=7)
    p.add_argument("--seeds", type=int, default=20)
    p.add_argument("--prs-per-day", type=float, default=317)
    p.add_argument("--ci-minutes", type=float, default=0.4, help="ready -> merge with no review (measured p50)")
    p.add_argument("--defect-rate", type=float, default=0.5)
    p.add_argument("--defect-rate-risky", type=float, default=0.8)
    p.add_argument("--risky-share", type=float, default=0.27)
    p.add_argument("--detect", type=float, default=0.6, help="chance a review catches a present defect")
    p.add_argument("--review-minutes", type=float, default=1)
    p.add_argument("--fix-minutes", type=float, default=5)
    p.add_argument("--author-wait", type=float, default=15, help="minutes an author session waits for review")
    p.add_argument("--review-sessions-per-day", type=float, default=48)
    p.add_argument("--k-per-session", type=int, default=5)
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    pols = ["none", "async", "async-fix", "insession", "postmerge", "hybrid"] if a.policy == "all" else [a.policy]
    rows = {}
    for pol in pols:
        runs = [simulate(pol, a, s) for s in range(a.seeds)]
        rows[pol] = {k: round(statistics.mean(r[k] for r in runs), 1) for k in runs[0]}
    if a.json:
        print(json.dumps(rows, indent=1))
    else:
        cols = list(next(iter(rows.values())))
        print(f"{'policy':<10} " + " ".join(f"{c:>11}" for c in cols))
        for pol, r in rows.items():
            print(f"{pol:<10} " + " ".join(f"{r[c]:>11}" for c in cols))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
