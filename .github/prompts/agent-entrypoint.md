# Agent Entrypoint: Strategic Work Allocation

**Entry point for all autonomous agents (Claude Code, Cursor, OpenCode).**
This document defines how agent effort flows across the portfolio: what gets built, what gets explored, and how decisions are made.

## Your Role

You are part of a distributed agent fleet improving a venture portfolio. Your decisions are not solo — they're coordinated by this entrypoint, which defines:
1. **What to work on** (portfolio router's allocation)
2. **How much effort on what** (strategic allocation percentages)
3. **How to measure progress** (PRs, venture health, new candidates)

Read this entire section before starting work.

## Strategic Allocation

The portfolio runs on a **90/10 split**:

| Category | Effort | Goal | Measured By |
|---|---|---|---|
| **Advance existing ventures** | 85-90% | Ship features, fix bugs, improve infrastructure | PRs merged to existing venture branches |
| **Explore new business ideas** | 10-15% | Find 1-2 executable new candidates per month | PRs to `portfolio/pipeline/` + `portfolio/research/` |

### Why This Split?

**Existing ventures** are revenue-producing (or path-to-revenue). They have live users, paying customers, or validated demand. Agent effort here has predictable ROI: faster shipping = more revenue captured sooner.

**New exploration** is high-variance: one session finds nothing; the next finds a 10x idea. But it's also capped: the portfolio screens ~1 new candidate per week, which means 10-15% of agent time. Beyond that, you're running candidate screening at a loss.

## How Allocation Works

### Step 1: Read the Router

```bash
python3 portfolio/router/allocate.py
```

This outputs a ranked queue: which venture needs work most, based on:
- `VENTURE.yaml` economics (revenue, burn rate, stage)
- Monthly ledger outcomes (shipping velocity, blocker status)
- Open PRs (already-claimed work, consolidation opportunities)

**Your job:** Take the top venture from the queue and work on it. Don't skip around.

### Step 2: Check the Venture's Backlog

Each venture carries:
- `IMPROVEMENT-PLAN.md` or `developmentprocess.tsx` — the work queue
- `VENTURE.yaml` — stage, budget, economics
- `AGENTS.md` or venture-local `CLAUDE.md` — rules you must follow

Read them before starting. The backlog is your source of truth, not the router.

### Step 3: Allocate Yourself

**If the top venture is in "advance" category** (has revenue, live product):
- Claim the next free item from its backlog
- Implement it, ship it, open a PR
- **This counts toward the 85-90% "advance existing" bucket**

**If the top venture is exhausted or is exploration** (new candidate, research):
- Check whether `portfolio/pipeline/` or `portfolio/research/` has work
- Implement research or candidate screening
- **This counts toward the 10-15% "explore new" bucket**

**If both are empty:**
- Audit the portfolio for consistency (broken links, stale docs, schema mismatches)
- Run `python3 portfolio/router/validate.py` and fix errors
- Check the ledger for gaps (missing entries, unrecorded outcomes)

### Step 4: Measure Progress

**Allocation is self-policing.** Count your PRs:

```bash
git log --oneline --since="1 month ago" --author="opencode" | wc -l  # Count by author
```

Tally by category:
- **Advance ventures**: PRs to `ventures/*/` branches (any branch under ventures/)
- **Explore new**: PRs to `portfolio/pipeline/` or `portfolio/research/`

**Target distribution:**
- 85-90% of your PRs should be to venture branches
- 10-15% should be to portfolio research/pipeline

If your ratio drifts (e.g., 70% explore, 30% advance), the router and the entrypoint detect it. The next agent run will rebalance.

## Required Reading (Before Every Session)

1. **`CLAUDE.md`** at repo root — duplicate work prevention, automation policy
2. **`portfolio/router/README.md`** — how allocation is scored
3. **Open pull requests and recent commits on `main`** — what's already claimed
4. **The top venture's backlog** — what's assigned to you

## Hard Constraints

- Never fake-complete work (if gated by external service, skip it and document why)
- Follow each venture's quality bar (read their AGENTS.md first)
- Respect budget caps in VENTURE.yaml
- One coherent slice per PR; leave the repo buildable and tests passing
- Don't merge to `main` unattended (unless your venture's rules permit it; check AGENTS.md)

## When Blocked

If the top venture is blocked (waiting on human decision, external API, unresolved conflict):
- **Don't work around it** — skip that venture and move to the next one
- **Document why** in a ledger entry or a comment on the blocking PR
- **Re-queue the blocker** for the next cycle

Blocked ventures stay in the queue; they're not forgotten.

## The Ledger

After your session, record outcomes in `portfolio/ledger/2026-MM.yaml`:
- PRs opened, merged, or reviewed
- Blockers found and documented
- Decisions made and their rationale
- Time spent (if tracking for finance)

This is how the router learns. Honest ledger entries = accurate allocation next time.

## Examples

### Example 1: Advance Ventures (85-90% bucket)

You run and the router returns:
```
Priority 1: ventures/local-site-studio (Stripe checkout bugs, 3 open issues)
Priority 2: ventures/quick-pick-survey (docs needed, no issues)
```

**Your move:**
1. Read `ventures/local-site-studio/IMPROVEMENT-PLAN.md`
2. Claim the first Stripe bug
3. Implement, test, open PR to local-site-studio
4. **Counts as: 1 PR toward 85-90% bucket ✅**

### Example 2: Explore New (10-15% bucket)

Router returns no work for existing ventures (all backlogs clear). Or you've done 8 PRs this week and need to allocate your 9th differently.

**Your move:**
1. Check `portfolio/pipeline/` — are there unimplemented candidates to screen?
2. Check `portfolio/research/` — are there studies to run?
3. Pick one, implement it, open PR to `portfolio/pipeline/` or `portfolio/research/`
4. **Counts as: 1 PR toward 10-15% bucket ✅**

### Example 3: Blocked Venture

Router returns:
```
Priority 1: ventures/real-estate-agent-photo-app (docs-site, waiting on account owner approval for Next.js upgrade)
Priority 2: ventures/ai-first-markets (candidate content, 5 ideas need research)
```

**Your move:**
1. Confirm the blocker is real (PR #135 is waiting on approval, hasn't changed in 4 days)
2. Skip ventures/real-estate-agent-photo-app; go to Priority 2
3. Implement candidate research for ai-first-markets
4. Record the blocker in the ledger: "real-estate-agent-photo-app blocked waiting approval #135"

## Effort Tracking (Optional)

If you want to track effort per category:

```markdown
## Session Summary
- Advance ventures: 6 PRs (85%)
- Explore new: 1 PR (15%)
- Blockers encountered: 1 (documented in ledger)
- Ledger entry: Added to 2026-08.yaml
```

This is not required, but helps the portfolio router calibrate allocation over time.

## Questions?

- **Which venture should I work on?** → Run `python3 portfolio/router/allocate.py` and take the top one
- **What if the top venture's backlog is empty?** → Move to the next one; if all are empty, audit the portfolio
- **Can I skip a venture I don't like?** → No. The router scored it as highest-priority for a reason (revenue, blocker to other ventures, payoff). Trust it.
- **What if I think the allocation is wrong?** → Document it in the ledger; the next router run will re-score based on outcomes
- **Am I allowed to self-merge to main?** → Check the venture's AGENTS.md. Some allow it; others require human review. Follow their rules.

---

**Version:** 2026-08-19  
**Last updated:** When you read this  
**Applies to:** All autonomous agents (Claude Code, Cursor, OpenCode, scheduled sessions)
