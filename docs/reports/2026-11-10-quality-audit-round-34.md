---
kind: milestone
subjects: [open-tennis-robots, interior-door-bid-calculator, wildlife-exclusion-bid-calculator, accel-nsgatune, codesign-agri-pulloff, quality-audit]
date: 2026-11-10
tagged: auto
---
# Quality audit round 34 and the look back: handoff (2026-11-10)

Post: `docs/posts/2026-11-10-quality-audit-round-34.md`. Seed 2026-11-10-c. None of 4 sampled subjects met the bar (the flagship didn't either); running 25 of 150.

New this round, for the next one:
- `python3 platform/ci/quality_audit.py history [--md]`: fix follow-through (audits with a high defect that list a fix PR), re-audit trends, and high defects a later audit re-found in the same file.
- `portfolio/quality/rechecks/2026-11-10-high-defects.json`: every high defect from rounds 1-33 re-checked on main at 42bd6dbf. 44 of 55 entries open (42 of 49 distinct). PR #14428 then fixed two (platform/agents toJson, platform/llm Gemini thinking tokens). Still open and worth a slice each: medicaid-lookback note regex, med-spa and handyman "1,200" parsing, medical-bill-error-checker modifiers, mcp-supply-chain-watch schema-description injection, platform/edge cap SQL untested, quick-pick-survey pooled-interval constants untested.
- README rule "Judge what is served": the build rewrites source llms.txt/sitemap/canonical origins, so check `https://marisstella.app/<slug>/...` before reporting a stale host or relative URL. Rounds 1-33 reported that non-defect about 90 times in 73 files.

Process notes:
- Worktree agents start on an old commit with no `portfolio/quality/`; they reset to origin/main themselves. Tell them to in the brief.
- Main was red four ways when this PR ran (flagship `next:` cap, stale feeder CAD package, hand-edited generated guide, wall-framing ts-check). Any PR touching those paths inherits the failure; expect it.
