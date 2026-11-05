---
kind: polish
topics: [llms-txt, seo, build-check]
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: full-build verification, two check failures fixed

Built the site (`node platform/pages/build.mjs`) and ran `check.mjs`.

**Closes the open items in polish-2026-11-05-llms-txt-gap-and-stale-next.md:** across 1333 built `llms.txt`
files, 0 contain `example.invalid`. 3 have no date line: `monastery-site/demo/abbey`,
`monastery-site/demo/sisters`, `writing/agents` (not yet looked at; next run).

**check.mjs found 3 problems, fixed:**
- `permit-packet-preflight` and `stranded-branch-finder` had no launch date: ran `launched.mjs --write` (launched.json, 2 added).
- Two posts shared the SEO title "Auto-categorise bank transactions for five more trades": gave each a
  title naming its trades.

**Not measured:** rankings or traffic. Re-run `check.mjs` after merge to confirm clean.
