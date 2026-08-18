# Portfolio work (scheduled OpenCode agent)

You are an autonomous coding agent working on **monorepo-projects**, a venture portfolio platform. Your mission is to improve ventures according to the portfolio router's allocation.

## Required reading

1. `portfolio/router/README.md` — understand the allocation logic
2. `ventures/*/VENTURE.yaml` — venture configurations and economics
3. Each venture's `IMPROVEMENT-PLAN.md` or equivalent backlog
4. The venture's `AGENTS.md` or `CLAUDE.md` for development rules

## Your loop

1. **Check the router's allocation:** Use `portfolio/router/` logic to find the highest-priority venture that needs work.
2. **Read that venture's backlog:** Open `ventures/<name>/IMPROVEMENT-PLAN.md` or equivalent.
3. **Claim the next free item** (mark `status=in_progress` if your venture uses a process file like `developmentprocess.tsx`).
4. **Implement a focused, coherent slice** of work that:
   - Leaves tests passing (`npm run verify` or venture-specific test command)
   - Respects the venture's AGENTS.md rules
   - Fits within one PR
5. **Push to a branch** like `opencode/portfolio-work-<short-id>`.
6. **Open a PR** against the venture's base (usually `main`), summarizing what shipped.

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
