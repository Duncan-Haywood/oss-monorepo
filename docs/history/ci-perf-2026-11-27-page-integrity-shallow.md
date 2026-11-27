# Page integrity: one-commit checkout, history blobs pinned as fixtures (2026-11-27)

Perf track, version 0, item 2 ("a fresh reading of the runner pool"). No
agent-workable `perf:` backlog item (P063, P064, P086 are owner rows). Item 4
first: bet #1's front door, `ventures/pay-app-guides`, has no page over 23 kB
gzip (`module-exclusive.mjs` on all 30 pages) and its suite runs in 5.2 s
(`suite_file_times.py`), so neither is a lever.

## Reading (before)

`python3 platform/ci/ci_profile.py --runs 300 --top 20`, 2026-11-27 03:35 to
03:56 UTC: 229 job-minutes, **88 of them checkout**. The four workflows that
spend half or more of a minute-plus job before their first real step are
Security gate, CI policy, Conflict markers (all `priv-*`, owner-gated) and
**Page integrity: median job 60 s, checkout median 39 s (65%)**, 7 jobs in 300
runs. It is the only non-`priv-*` workflow that still checks out with
`fetch-depth: 0`.

That full history existed for two tests in
`platform/webcheck/page-integrity.test.mjs`, which `git show` six old blobs:
the cut-list-optimizer page at the three commits where it shipped dead plus
the repair, and the 3PL page before and after its fix. Everything else in the
job reads only the working tree.

Local fetch of `main` from GitHub through the session proxy, fresh repo, no
checkout (`clonebench.sh` in the session scratchpad, method below):

| fetch | time | `.git` |
|---|---:|---:|
| `--filter=blob:none` (all commits and trees, the old job) | 18.5 s | 131 MB |
| `--depth=1 --filter=blob:none` (the new job) | 1.2 s | 3.6 MB |

The sparse blob checkout after the fetch is the same in both.

## Change

- The six blobs are committed as `platform/webcheck/fixtures/*.html.blob`
  (76 kB in all; `.blob`, not `.html`, so no page sweep mistakes them for a
  live page). `.gitattributes` marks them `-text` so no conversion touches the
  bytes.
- The test's `readHistoryBlobs` reads the fixture and asserts its git blob id
  (sha1 over `blob <len>\0` + bytes) equals the id pinned in the test, so a
  fixture one byte off fails; the ids are `git rev-parse <rev>:<path>` from
  the real commits. A new test, `pinned fixtures are byte-identical to the
  shipped blobs`, checks every id and, where the clone carries the history,
  also compares each fixture with `git show <rev>:<path>`; on a shallow clone
  only that cross-check is skipped.
- The two history tests no longer skip on a shallow clone: they now run in
  every web session too, where before they skipped.
- `page-integrity-ci.yml`: `fetch-depth: 0` → `1`, keeping `filter: blob:none`
  and the sparse list; comments updated.

## Verification

- With the six commits fetched into this clone: `node --test
  platform/webcheck/*.test.mjs` 65/65 before the change; 66/66 after (the new
  fixture test), 0 skipped.
- Mutation: one changed byte in `cut-list-optimizer-1a8feb3.html.blob` fails
  both the fixture test and `catches the real defect ...`; restored, the blob
  id matches again.
- `node platform/webcheck/check_pages.mjs`: 4,527 pages checked, all sound
  (the sweep reads `ventures/**/*.html` only).
- After number: the PR's own Page integrity run (checkout step), recorded in
  the run record.

## Not changed, ranked for the next run

1. **Security gate** (43 job-minutes in 300 runs, checkout 49%, scanner
   install 10 min total) is the largest consumer; `priv-security-gate.yml` is
   owner-gated. A cached or prebuilt scanner image is the lever.
2. **CI policy** (88% checkout) and **Conflict markers** (80%) look like
   one-commit-plus-diff jobs paying for history; both `priv-*`.
3. **ventures tests** (36 min, `node --test in each touched venture`):
   per-suite, see `run_venture_tests.py --times` (its timings date from
   2026-11-17; `--write-times` refreshes them).
4. `pay-app-guides` pages and suite: already small and fast (above).
