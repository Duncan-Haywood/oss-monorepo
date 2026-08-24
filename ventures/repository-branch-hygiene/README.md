# Repository Branch Hygiene

A local, read-only scanner for GitHub-heavy teams that need to understand stale
branches before deleting anything. It turns a portable snapshot into a report
and a recovery manifest.

```bash
python3 src/branch_hygiene.py examples/snapshot.json --report report.txt --manifest recovery.json
```

For a checkout you control, the same report can be produced directly from
local branches. This reads refs only and never fetches, pushes, or deletes:

```bash
python3 src/branch_hygiene.py --repo /path/to/checkout --report report.txt --manifest recovery.json
```

The local mode intentionally has no pull-request metadata. Branches that are
not protected or shared are therefore reported as `uncertain`, rather than
being treated as safe to remove. Add `--protect release` for each additional
protected local branch.

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
