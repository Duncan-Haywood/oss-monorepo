# Repository Branch Hygiene

A local, read-only scanner for GitHub-heavy teams that need to understand stale
branches before deleting anything. It turns a portable snapshot into a report
and a recovery manifest.

```bash
python3 src/branch_hygiene.py examples/snapshot.json --report report.txt --manifest recovery.json
```

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

If the team already has the `gh` CLI, `--pr-json` closes that gap without any
network call from this tool: export the customer's own pull-request records
once, then resolve them against this same local checkout's ref ancestry.

```bash
gh pr list --state all --json headRefName,state,baseRefName --limit 500 > prs.json
python3 src/branch_hygiene.py --repo /path/to/checkout --pr-json prs.json --report report.txt --manifest recovery.json
```

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
