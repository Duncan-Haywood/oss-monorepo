# Repository Branch Hygiene

A local, read-only scanner for GitHub-heavy teams that need to understand stale
branches before deleting anything. It turns a portable snapshot into a report
and a recovery manifest.

```bash
python3 src/branch_hygiene.py examples/snapshot.json --report report.txt --manifest recovery.json
```

## Reviewing in the browser

`index.html` is the same classifier running client-side. It exists because the
person who reviews a branch queue is usually not the person with the checkout:
the scanner needs commit ancestry, but reading the resulting queue needs
nothing but the file. Open the page, paste a snapshot, and it produces the same
report, recovery manifest, and approval-queue CSV — with no install, no
account, and nothing uploaded.

Produce the snapshot to paste with:

```bash
python3 src/branch_hygiene.py --repo /path/to/checkout --emit-snapshot > snapshot.json
```

`--emit-snapshot` prints the snapshot and exits, writing no report or manifest,
so redirecting stdout to a file cannot leave two stale outputs beside it. Add
`--pr-json prs.json` (see below) to resolve branches against real pull-request
history rather than reporting them `uncertain`.

The browser port lives in `scan.mjs` and is a deliberate line-by-line port of
`scan()` in `src/branch_hygiene.py`. The two must never disagree about what a
branch is, so `scan.test.mjs` runs both over the same snapshot and compares the
report, manifest, and CSV byte for byte. **If you change a classification rule,
change it in both files in the same commit.**

For spreadsheet review, add `--csv approval-queue.csv`. The export contains
branch metadata, a classification, and a human review action; it deliberately
contains no shell commands and cannot approve or perform deletion.

For a scheduled or CI review, emit a stable summary and fail closed when the
snapshot contains an ambiguous ref:

```bash
python3 src/branch_hygiene.py snapshot.json --format json --fail-on-risk
```

For a spreadsheet or ticket-import workflow, emit one approval-queue row per
branch. The CSV contains branch metadata and a review instruction, never a Git
command:

```bash
python3 src/branch_hygiene.py snapshot.json --format csv > approval-queue.csv
```

The CSV columns are `branch`, `tip`, `classification`, `review_action`,
`reason`, and `commit_count`. Treat every row as a review queue item; even a
`review-delete-candidate` row is not permission to delete a ref.

Exit status `2` means a human must review a `shared`, `moved-tip`, or
`uncertain` finding. It never means that a branch is safe to delete. A zero
status means only that this snapshot contains no unresolved ambiguity; the
customer still approves every Git operation.

For a checkout you control, the same report can be produced directly from
local branches. This reads refs only and never fetches, pushes, or deletes:

```bash
python3 src/branch_hygiene.py --repo /path/to/checkout --report report.txt --manifest recovery.json
```

Local mode has no pull-request metadata by default. Branches that are not
protected or shared are therefore reported as `uncertain`, rather than being
treated as safe to remove. Add `--protect release` for each additional
protected local branch.

**The checkout almost never has the default branch checked out, and this tool
accounts for that rather than guessing from `HEAD`.** A CI job checks out the
PR head; an agent works from its own feature branch. `--repo` reads the
remote's own default from `refs/remotes/origin/HEAD` when it is set, so the
repository's real default branch (`main`, say) is still reported and
protected correctly even while some other branch is checked out. If
`origin/HEAD` was never populated locally — a shallow or branch-only CI fetch
usually leaves it unset, and only `git remote set-head origin -a` (which
contacts the remote) fixes that — the tool falls back to whatever is checked
out and prints a warning to stderr saying so, rather than silently reporting
a guess as the default branch. Pass `--default-branch main` to remove the
guess entirely; it also covers a checkout with no `origin` remote at all, or
one whose remote uses a name other than `main`/`master`.

If the team already has the `gh` CLI, `--pr-json` closes that gap without any
network call from this tool: export the customer's own pull-request records
once, then resolve them against this same local checkout's ref ancestry.

```bash
gh pr list --state all --json headRefName,state,baseRefName --limit 500 > prs.json
python3 src/branch_hygiene.py --repo /path/to/checkout --pr-json prs.json --report report.txt --manifest recovery.json
```

Add `--csv approval-queue.csv` to this command when the team reviews findings in
a spreadsheet or ticketing workflow.

`gh pr list` is the customer's own export step, run with their own
credentials outside this tool; `branch_hygiene.py` only reads the resulting
JSON file from disk and diffs it against local git refs.

The scanner distinguishes merged branches, closed-PR branches whose tip moved,
shared refs, protected branches, active work, and uncertain records. Each
finding includes a non-executable `review_action`, such as
`review-delete-candidate` or `preserve-and-review`, so teams can route work in
an approval queue without turning a report into deletion advice. It never talks
to GitHub, uploads repository data, or deletes refs. The manifest explicitly
marks itself read-only and approval-required.

Keep snapshots customer-owned and remove them when no longer needed. The
optional usage log records only an event name, timestamp, and aggregate count,
never repository names, branch names, commit messages, identifiers, IP
addresses, or file contents.

This is an evidence and planning tool, not legal, security, or compliance advice.
It does not certify repository state, guarantee that a branch is safe to delete,
or perform deletion on a customer's behalf. The customer remains responsible
for reviewing and approving any Git operation.

See `examples/snapshot.json` for the input format.

## Privacy and usage

The scanner is local-first: it reads only the checkout and files you pass to
it, makes no network requests, and does not upload repository data. The
optional `--usage-log` records one aggregate `scan_completed` event and the
finding count in a file you control. It records no repository names, branch
names, commit messages, identifiers, IP addresses, or file contents.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, security, or compliance advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

Open `index.html` for the public landing page. The scanner itself stays
local and never needs that page.

## Customer workflow

1. Export branch names, tips, commit ancestry, protected refs, and the latest
   pull-request records from the customer's existing Git provider tooling.
2. Run the scanner locally or in the customer's CI workspace. Keep the input
   snapshot and generated manifest in customer-controlled storage.
3. Review the text report and preserve the recovery manifest with the review
   record. Resolve ambiguous refs before performing any cleanup outside this
   tool.

The product is free and self-hosted during the learning phase. Usage tracking
is opt-in and aggregate-only when `--usage-log` is supplied; it records an
event name, timestamp, and finding count. There are no API, hosting, or
inference costs beyond the customer's own runner.
