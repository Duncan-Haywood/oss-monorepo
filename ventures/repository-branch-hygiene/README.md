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

Exit status `2` means a human must review a `shared`, `moved-tip`, or
`uncertain` finding. It never means that a branch is safe to delete. A zero
status means only that this snapshot contains no unresolved ambiguity; the
customer still approves every Git operation.

The scanner distinguishes merged branches, closed-PR branches whose tip moved,
shared refs, protected branches, active work, and uncertain records. It never
talks to GitHub, uploads repository data, or deletes refs. Its output is evidence
for a human approval queue, not deletion advice.

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
