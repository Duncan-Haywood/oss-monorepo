# Stranded Branch Finder

Lists git commits that were pushed to a remote but are in no pull request and
not on `main`. Git only: no token, no API, one Python file, standard library.

**Live page:** https://marisstella.app/stranded-branch-finder/

After using this, you can now **find every pushed branch nobody opened a pull
request for** in one command, which used to take **comparing the branch list
with the pull-request list by hand and still missing branches that kept
growing after their PR closed**.

## Use

```
python3 stranded.py                         # this branch; exit 1 = open a PR
python3 stranded.py --sweep                 # every branch, tips from the last 14 days
python3 stranded.py --sweep --since all --ignore 'dependabot/*'
```

Exit 0 nothing stranded, 1 stranded or unpushed work, 2 could not answer.
Works with GitHub and Gitea (they publish `refs/pull/<n>/head`); not GitLab.
Needs git 2.20+ (partial clone). `lsremote.mjs` is the page's quick check on
`git ls-remote` output (tip versus pull request heads only; the script is the
exact one).

## How it decides

A commit is stranded when it is reachable from the branch, not from the base,
and not from any pull request head. Merge commits are skipped. In a sweep a
branch whose changes are already on the base under other commit ids (squash
merge, cherry-pick) is not reported. Exit 0 does not mean the pull request
merged; git cannot see that.

## Tests

`python3 -m unittest test_stranded` (builds throwaway bare repositories with
real `refs/pull` refs, no mocks) and `node --test '*.test.mjs'`.

## Provenance and measurement

Ported 2026-11-05 from `platform/ci/unlanded_work.py` in this monorepo, with the
repository-specific branch names removed and `--ignore` added. Measured here:
on one day in October 2026, 102 branches held 186 commits in no pull request;
a sweep of tips since 2026-11-03 on this repository returns 2 branches, one of
them the generated `usage-data` branch that `--ignore usage-data` would skip.
No outside user yet; the hypotheses in `VENTURE.yaml` are untested.

MIT licensed. No warranty; review each listed branch before acting, since some
are parked on purpose.
