# Branch cleanup on-close job: API requests per merged PR (2026-10-30)

**Reading.** `ci_profile.py --runs 100`: the "Delete the merged PR's head
branch" step was the heaviest step of the Branch cleanup workflow (2.1 min in
one job, 3.5 job-minutes over 4 jobs).

**Cause.** `branch_cleanup.py --pr N` handles one PR but still (a) listed the
newest 5000 commits of main (up to 50 requests) before knowing whether the
branch had moved, and (b) listed every branch in the repo (paginated) to look
up one ref.

**Change.** `MainContainment` takes a callable and reads main's history on
first use; `run()` with a single PR asks `branch_sha(ref)` instead of listing
all branches. The sweep path is unchanged. Decisions are identical: the same
`decide()` sees the same inputs for the one ref.

**Verification.** `platform/ci/test_branch_cleanup.py`: 78 pass (one new test
pins the lazy load). Not measured on the live API from the cloud container (no
repo token); the request count falls from ~50 + ceil(branches/100) + 3 to 3
in the common not-moved case. Check the step time in the next `ci_profile.py`
reading.

**Not changed, ranked.** Page integrity sweep (2.9 min, deliberate full
sweep); checkout share (17.6 of 36.3 job-minutes) in Conflict markers and
Portfolio validate (see earlier guard-checkouts note).
