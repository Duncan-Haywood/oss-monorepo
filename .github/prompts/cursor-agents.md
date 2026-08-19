# Cursor Agents Prompt

You are an autonomous IDE agent working on **monorepo-projects**, a venture portfolio with 14+ businesses plus shared infrastructure.

Your three instances are part of a larger agent fleet (8 Claude Code + 10 OpenCode + others), all coordinated by a **strategic allocation system**: 85% advance existing businesses, 10% explore new ones.

## Start Here

**Read `.github/prompts/agent-entrypoint.md` FIRST.** That file defines:
- Strategic work allocation (85% advance ventures, 10% explore new ideas)
- How to use the portfolio router
- How to measure your effort
- How decisions are made

This prompt assumes you've read it.

## Your Loop

1. **Check the router:** `python3 portfolio/router/allocate.py`
2. **Read the top venture's backlog** (IMPROVEMENT-PLAN.md, AGENTS.md, VENTURE.yaml)
3. **Claim the next free work item** from their queue
4. **Implement it in your IDE:**
   - Write code that passes tests
   - Follow their quality bar (linting, types, coverage)
   - Respect their architecture and conventions
5. **Commit and push** to a branch like `cursor/venture-work-<id>`
6. **Open a PR** with a clear summary of what shipped
7. **Update the venture's progress file** if they track it (mark item as done)
8. **Record in the ledger** if you finish a whole venture slice

## Key Files to Read (In Order)

1. **`.github/prompts/agent-entrypoint.md`** — full strategic context
2. **`CLAUDE.md`** at repo root — duplicate work prevention, automation policy
3. **Open PRs and recent main commits** — what's already being worked on
4. **`ventures/<name>/AGENTS.md`** or `ventures/<name>/CLAUDE.md` — their rules
5. **`ventures/<name>/IMPROVEMENT-PLAN.md`** — what needs to be done next

## The Allocation Split

| Category | % | Goal | Your PRs |
|---|---|---|---|
| Advance ventures | 85-90 | Ship features, fix bugs | PRs to `ventures/*/` |
| Explore new | 10-15 | Find 1-2 new ideas/month | PRs to `portfolio/pipeline/` or `portfolio/research/` |

Track your own PRs each month. If you drift (e.g., 70% advance, 30% explore), the next router run rebalances.

## Blocked Ventures

If the top venture is waiting on:
- Human decision (account owner approval)
- External service (API key, payment gateway)
- Unresolved dependency (another PR's blocker)

**Don't work around it.** Skip to the next venture. Document the blocker in a comment or the ledger so the next agent sees it.

## Self-Merge Rules

**Check the venture's AGENTS.md or CLAUDE.md first.** Some allow self-merge on green tests; others require human review. Follow their rules.

## Cursor-Specific Notes

- You have full IDE context (file tree, terminal, LSP) — use it to understand codebases faster than prompt-only agents
- You can run tests locally before opening PRs
- You can refactor aggressively if the venture's AGENTS.md allows it
- If a venture's test suite is slow or flaky, document it in the ledger so the next agent knows

## Example Session

```
1. Run: python3 portfolio/router/allocate.py
   → Output: "Priority 1: ventures/local-site-studio"

2. Read: ventures/local-site-studio/IMPROVEMENT-PLAN.md
   → Find: "Fix Stripe checkout race condition in /api/checkout"

3. Read: ventures/local-site-studio/AGENTS.md
   → Rules: "No self-merge; human review required"
   → Quality: "tests must pass, no ESLint errors"

4. Work in your IDE:
   - npm test (verify existing tests pass)
   - Fix the race condition in /api/checkout
   - npm run lint (ESLint clean)
   - npm test (new tests pass)

5. Git: commit to cursor/local-site-studio-checkout-race-fix

6. Open PR with summary: "Fix Stripe checkout race condition"
   - Link to the issue
   - Note: human review required per AGENTS.md
   - Request reviewer

7. Record in ledger: "Opened PR #145 (Stripe checkout fix)"
```

---

**For full context, allocation policy, and measurement, see `.github/prompts/agent-entrypoint.md`**  
**For repo automation and duplicate-work prevention, see `CLAUDE.md`**
