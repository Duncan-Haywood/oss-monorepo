# Repository Branch Hygiene

A local, read-only scanner for GitHub-heavy teams that need to understand stale
branches before deleting anything. It turns a portable snapshot into a report
and a recovery manifest.

```bash
python3 src/branch_hygiene.py examples/snapshot.json --report report.txt --manifest recovery.json
```

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
