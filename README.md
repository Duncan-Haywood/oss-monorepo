# monorepo-projects

A single repository for the whole venture portfolio, plus the shared agent
platform that works on it.

The point of consolidating: agent automation is repo-scoped. In a polyrepo
setup every new venture costs a fresh onboarding pass across every agent
surface (Claude Code, Cursor, Antigravity, CI). Here a new venture is a new
directory that inherits the platform automatically.

## Layout

```
ventures/     one directory per business; each has a VENTURE.yaml
platform/     shared agent definitions, skills, and CI — versioned once
portfolio/    the ledger and the router that allocates agent effort
```

## Security & Quality Assurance

Repository-wide security scanning and verification run on pull requests, `main`, and a weekly schedule.
- **Unified Verification Suite**: Execute `bash scripts/verify-all.sh` to run security policy scans, secret/vulnerability audits, Node/Python tests, and Terraform validations across all ventures locally or in CI.
- **Security Policy**: See [SECURITY.md](SECURITY.md) for vulnerability reporting
  guidelines and [docs/security/ROADMAP.md](docs/security/ROADMAP.md) for the
  active Gitea security roadmap. Remaining third-party Action and container
  digest pinning is tracked there.

### ventures/

Each venture is self-contained and carries a `VENTURE.yaml` at its root. That
file is the interface between "this business exists" and "the router knows
about it" — adding a venture means adding that file; nothing else needs to
change.

Venture directories are kept cleanly bounded so a venture can be extracted
with `git filter-repo` if it is ever sold or spun off.

### platform/

The processes that are the same across ventures: agent definitions, skills,
reusable CI. If a procedure is being copy-pasted between ventures, it belongs
here instead.

### portfolio/

`ledger/` records revenue, cost, agent-hours, and outcomes per venture.
`router/` reads the ledger plus each `VENTURE.yaml` and decides where agent
effort goes next. See [portfolio/router/README.md](portfolio/router/README.md)
for how allocation works and why it is not a pure ROI maximizer.

## History

Ventures were merged in with `git subtree`, so each one's full commit history
is preserved and attributed. The original standalone repositories still exist
and were not deleted.
