# Portfolio Work (OpenCode Agents)

You are part of a distributed agent fleet improving **monorepo-projects**, a venture portfolio with 14+ businesses.

## Start Here

**Read `.github/prompts/agent-entrypoint.md` FIRST.** It defines the strategic allocation system that coordinates all agents (Claude Code, Cursor, OpenCode):
- 85-90% effort → advancing existing businesses (shipping features, fixing bugs)
- 10-15% effort → exploring new ideas (candidate screening, research)
- How to measure progress (by PRs, by category)
- How the portfolio router prioritizes work

This prompt assumes you've read that file.

## Required Reading (In Order)

1. **`.github/prompts/agent-entrypoint.md`** — strategic allocation & full context
2. **`CLAUDE.md`** at repo root — duplicate work prevention, automation policy
3. **Open PRs and recent commits on `main`** — what's already claimed
4. **`portfolio/router/README.md`** — how allocation scoring works
5. Each venture's **`AGENTS.md`** or **`CLAUDE.md`** — their rules
6. The venture's **`IMPROVEMENT-PLAN.md`** — what work is available

## Your loop

**Note:** This workflow runs with an **entrypoint pattern**. One step runs sequentially
before agents start, analyzes repo state, and emits a work plan. You are an executor
of that plan, not an independent discoverer. The guardrails are built into the
entrypoint; trust its decisions.

1. **Check the router's allocation:** `pip install -r portfolio/router/requirements.txt && python3 portfolio/router/allocate.py` to find the highest-priority venture that needs work.
2. **Quick sanity check:** Open PRs exist, but the entrypoint has already flagged overlaps and consolidation needs. If multiple PRs exist for the same venture/topic, check if the entrypoint marked them for consolidation (look at the workflow output). If so, coordinate: extend the strongest one instead of opening a new PR.
3. **Read that venture's backlog:** Open `ventures/<name>/IMPROVEMENT-PLAN.md` or equivalent.
4. **Claim the next free item** (mark `status=in_progress` if your venture uses a process file like `developmentprocess.tsx`).
5. **Implement a focused, coherent slice** of work that:
   - Leaves tests passing (`npm run verify` or venture-specific test command)
   - Respects the venture's AGENTS.md rules
   - Fits within one PR
6. **Push to a branch** like `opencode/portfolio-work-<short-id>`.
7. **Open a PR** against the venture's base (usually `main`), summarizing what shipped.

## Venture structure

Each venture lives in `ventures/<name>/` and carries:
- `VENTURE.yaml` — stage, economics, budget constraints
- `IMPROVEMENT-PLAN.md` or `developmentprocess.tsx` — work queue
- `AGENTS.md` / `CLAUDE.md` — development rules (heed them)
- `src/`, `tests/`, etc. — the actual code

## When the backlog is empty for the top venture

- Check the **next** venture in the router's ranking
- If all high-priority ventures are clear, audit the portfolio for consistency (VENTURE.yaml schema, ledger reconciliation, broken links in router config)

## Hard constraints

- Never fake-complete work — if something is gated by admin setup or external service, skip it and document why
- Follow each venture's quality bar (read their AGENTS.md first)
- Respect budget caps in VENTURE.yaml
- One coherent slice per PR; leave the repo buildable and tests passing
