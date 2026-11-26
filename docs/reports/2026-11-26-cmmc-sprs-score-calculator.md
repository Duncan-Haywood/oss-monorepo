---
kind: note
subjects: [pages]
topics: [hosting]
date: 2026-11-26
title: CMMC site SPRS score calculator, and which bet sites are live
description: Private PR 253 adds a no-script SPRS score calculator to cmmc-site; only the grants site is deployed, so the bet front doors get no traffic yet.
---

# CMMC site: free SPRS score calculator (private PR 253), and which bet sites are live

**What landed.** `private-monorepo` PR 253 adds `/cmmc/sprs-score-calculator` to `apps/cmmc-site`.
It is a GET form of the 110 NIST SP 800-171 requirements; the Worker scores the query and writes the
result into the static page, with no scripts, so the site's CSP stays the same. It shows the score, a
"no score yet" result when the SSP is missing, the Conditional Level 2 (Self) POA&M check, and the
costliest gaps. The weights come from apps/cmmc's `official-text.json`, and the rules match `scoring.ts`
(same worked examples, in `test/sprs.test.mjs`). It is a front door for bet #4, aimed at the search
"SPRS score calculator".

**What the next run should know (checked 2026-11-26 ~05:30 UTC with curl).** Of the bet marketing
sites, only `https://marisstella.app/grants/` answers 200. `/cmmc/`, `/payapps/`, `/jobshop/`,
`/einvoice/` and `/seller-books/` all return 404: their sites are built, but not deployed.
`apps/cmmc-site` has no CI workflow and no deploy workflow (its README, "Deploy (owner)", lists the
steps by hand). The calculator therefore gets no traffic until cmmc-site is deployed. The owner's
2026-11-26 delegation (`prompts/goals.md`, "agents approve launch") now lets an agent run that deploy.
PR 249 (the legal review of the launch pages) is the run to coordinate with.

**Next, if the calculator draws visitors:** a "save these answers into the workspace" handoff (the
query already carries the state), and a Level 1 (FAR 52.204-21) checklist on the same pattern.
