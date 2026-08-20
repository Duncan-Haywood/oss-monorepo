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
portfolio/    the ledger, the router that allocates agent effort, and the
              candidate pipeline of researched-but-not-started businesses
```

### ventures/

Each venture is self-contained and carries a `VENTURE.yaml` at its root. That
file is the interface between "this business exists" and "the router knows
about it" — adding a venture means adding that file; nothing else needs to
change.

Venture directories are kept cleanly bounded so a venture can be extracted
with `git filter-repo` if it is ever sold or spun off.

`mat-470-real-analysis` (private personal coursework) and
`ubuntu-agent-server` (shared agent-hosting infra, not itself
revenue-seeking) intentionally have no `VENTURE.yaml` — neither is a
business the router should allocate profit-seeking effort to. Each carries a
`NOT-A-VENTURE` file recording why. Whether they belong under `ventures/` at
all, or should move to `platform/`/elsewhere, is still an open structural
decision; the marker does not settle it.

`VENTURE.yaml` is what the router reads, so it is schema-checked in CI:

```
pip install -r portfolio/router/requirements.txt
python3 portfolio/router/validate.py
```

Every directory under `ventures/` must have either a valid `VENTURE.yaml` or
a `NOT-A-VENTURE` file, so a new venture cannot go silently invisible to the
router. A `NOT-A-VENTURE` marker is authoritative even when a `VENTURE.yaml`
is still present in the same directory — the router (`allocate.py`), the
scorer (`score_ventures.py`), and `validate.py` all skip such a directory.
That makes reclassifying a directory out of profit-seeking allocation a
single-file change (drop the marker in) rather than a simultaneous edit
across all three tools.

### platform/

The processes that are the same across ventures: agent definitions, skills,
reusable CI. If a procedure is being copy-pasted between ventures, it belongs
here instead.

### portfolio/

`ledger/` records revenue, cost, agent-hours, and outcomes per venture.
`router/` reads the ledger plus each `VENTURE.yaml` and decides where agent
effort goes next. See [portfolio/router/README.md](portfolio/router/README.md)
for how allocation works and why it is not a pure ROI maximizer.

`pipeline/` holds businesses that have been researched and scored but are **not**
ventures yet — the stage before `ventures/`, so starting one is a decision made
against evidence. A candidate graduates only when someone writes
`ventures/<name>/VENTURE.yaml`; until then the router cannot see it and no budget
flows to it. Its write-ups are internal research notes carrying unverified
claims, not published content — see
[portfolio/pipeline/README.md](portfolio/pipeline/README.md).

`scoring/` ranks the ventures the portfolio **does** own, on the same six
dimensions `ventures/ai-first-markets` applies to its idea library — so a
venture, a candidate, and a hypothetical idea can all be read against each
other. The router consumes the composite as a tiebreaker. See
[portfolio/scoring/README.md](portfolio/scoring/README.md) for what the first
pass found, including why merit and the router's dispatchable/blocked split
disagree.

## History

Ventures were merged in with `git subtree`, so each one's full commit history
is preserved and attributed. The original standalone repositories still exist
and were not deleted.
