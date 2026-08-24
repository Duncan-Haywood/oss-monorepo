# Branch hygiene probe

This is a local, read-only scanner for GitHub branch inventory exports. It turns
an inventory into an approval queue and a portable recovery manifest before any
cleanup is considered. It does not call GitHub, request credentials, or delete
refs.

## Run it

```sh
python3 cli.py examples/repository.json --markdown report.md --manifest recovery.json
```

The input is intentionally a small JSON export rather than a GitHub-specific
API response. An adapter can produce it from a repository later without
changing the safety-critical classifier. The required shape is:

```json
{
  "repository": "acme/widgets",
  "default_branch": "main",
  "branches": [
    {
      "name": "feature/example",
      "tip": "abc123",
      "commits": ["abc123"],
      "protected": false,
      "shared_by": [],
      "pull_request": {
        "number": 42,
        "state": "closed",
        "merged": false,
        "tip_moved_after_close": true
      }
    }
  ],
  "default_commits": ["main-sha"]
}
```

Every proposed action includes the current tip, classification, related PR,
commit set, and a restore command. Missing or contradictory metadata is marked
`uncertain`, never converted into a deletion recommendation. The report is an
evidence aid, not a statement that a branch is safe to remove.

## Boundaries

- Keep the scan read-only and customer-authorized.
- Treat protected, shared, moved-tip, and uncertain refs as review-only.
- The tool never deletes, pushes, or certifies repository state.
- Do not put tokens, commit contents, email addresses, or IP addresses in the
  export or report.

This probe is an experiment for the repository-branch-hygiene candidate. It is
not a hosted service or a promise of automated cleanup.
