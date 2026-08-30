# monorepo-projects

A single repository for the whole venture portfolio, plus the shared agent
platform that works on it.

**Strategy:** [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) — build
products people use (free, full-feature, usage-tracked), ship fast, minimize
variable cost. **Current priority:** deploy what is already on `main` before
building another product. **Host:** GitHub Pages for static tools, existing
Hetzner boxes for processes — [`portfolio/hosting/`](portfolio/hosting/README.md).
Agent instructions: [`AGENTS.md`](AGENTS.md). How to build one:
[`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md). What to count and where it
lands: [`portfolio/usage/`](portfolio/usage/README.md).

The operating priority is product value over administrative throughput. Existing
work should be triaged proportionately, then the next session should leave a
stranger with a runnable workflow, measured only with privacy-conscious,
off-switchable event counts. A blocked CI provider or owner-only deployment
permission is a dependency to report, not a reason to substitute more process
work for building.

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
infra/        OpenTofu for the existing hel1 pair (cpx52 + cpx22)
bootstrap/    one-time k3s + Argo CD (laptop SSH, not cloud-init)
gitops/       App-of-Apps, AppProjects, prod/staging/agents
```

Actions secrets for that stack (names only): `HETZNERSSHKEY`,
`HETZNERREADAPIKEY`. `CLAUDETRIGGERAPIKEY` is the Claude routine
trigger, not GitOps. Table: [`infra/OWNER_CHECKLIST.md`](infra/OWNER_CHECKLIST.md).

### ventures/

Each venture is self-contained and carries a `VENTURE.yaml` at its root. That
file is the interface between "this business exists" and "the router knows
about it" — adding a venture means adding that file; nothing else needs to
change.

Venture directories are kept cleanly bounded so a venture can be extracted
with `git filter-repo` if it is ever sold or spun off.

`ubuntu-agent-server` (shared agent-hosting infra, not itself
revenue-seeking) intentionally has no `VENTURE.yaml` — it is not a
business the router should allocate profit-seeking effort to. It carries a
`NOT-A-VENTURE` file recording why. `ai-first-markets` carries one too, for
the same reason and by the same rule, but keeps its `VENTURE.yaml`: it is the
portfolio's own scoring engine rather than a business, and its retained
hypothesis record is the evidence that reclassification rests on. Whether either
belongs under `ventures/` at all, or should move to
`platform/`/elsewhere, is still an open structural decision; the marker does
not settle it.

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

A reclassified directory **keeps** its row in
[`portfolio/scoring/venture-scores.yaml`](portfolio/scoring/venture-scores.yaml),
where it is reported as `reclassified` and excluded from the ranking and the
dispatchable/blocked means. A score is a record about a business, not an input
to allocation, so removing the row would delete the evidence the
reclassification was decided on. `score_ventures.py --check` enforces both
halves: every *allocated* venture must be scored, and a scored slug must name a
directory that carries a `VENTURE.yaml` — marker or not.

### platform/

The processes that are the same across ventures: agent definitions, skills,
reusable CI. If a procedure is being copy-pasted between ventures, it belongs
here instead.

### portfolio/

`ledger/` records revenue, cost, agent-hours, and outcomes per venture.
`router/` reads the ledger plus each `VENTURE.yaml` and decides where agent
effort goes next. See [portfolio/router/README.md](portfolio/router/README.md)
for how allocation works and why it is not a pure ROI maximizer.

`usage/` holds usage readings per product — the signal the portfolio steers by
while everything is free. See [usage/README.md](portfolio/usage/README.md) for
what may be counted (events, never people) and what a reading of zero means.

`pipeline/` holds businesses that have been researched and scored but are **not**
ventures yet — the stage before `ventures/`, so starting one is a decision made
against evidence. A candidate graduates per its `graduate_as` field — a
`venture` when someone writes `ventures/<name>/VENTURE.yaml`, a `product-line`
when its slug is listed under `product_lines` in its host venture's — and until
one of those is true, no budget flows to it. See
[pipeline/README.md](portfolio/pipeline/README.md) for both paths, the
`NOT-A-VENTURE` precedence, and what a `product_lines` entry does not do. Its write-ups are internal research notes carrying unverified
claims, not published content — see
[portfolio/pipeline/README.md](portfolio/pipeline/README.md).

`scoring/` ranks the ventures the portfolio **does** own, on the same six
dimensions `ventures/ai-first-markets` applies to its idea library — so a
venture, a candidate, and a hypothetical idea can all be read against each
other. The router consumes the composite as a tiebreaker. See
[portfolio/scoring/README.md](portfolio/scoring/README.md) for what the first
pass found, including why merit and the router's dispatchable/blocked split
disagree.

## Product-first operating direction

The portfolio prioritizes shipping useful, free software products over
administrative throughput. New work should start from a narrow customer problem,
ship a runnable vertical slice, measure anonymous feature events without PII,
and preserve the legal, privacy, and safety guardrails in
[`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md). Pull requests are reviewed in
proportion to risk and merged when their relevant checks are green.

The venture list is allowed to grow when a new candidate is materially
different from existing products and can be launched without new spend or
payment collection. Adjacent improvements should still land in the closest
existing venture to avoid duplicate products.

## History

Ventures were merged in with `git subtree`, so each one's full commit history
is preserved and attributed. The original standalone repositories still exist
and were not deleted.

## Product-first execution

The current operating direction is to ship useful, free, local-first software
for narrow customer problems, measure anonymous feature usage, and improve what
people return to. New products should leave a stranger able to complete one
valuable task without an account, payment, or a paid dependency. See
[`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) and
[`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) for the launch checklist, safety
guardrails, and opportunity-selection criteria.
