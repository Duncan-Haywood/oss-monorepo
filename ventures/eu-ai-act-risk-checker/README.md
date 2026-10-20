# EU AI Act Risk Checker

Free, private browser tool: choose your role (provider, deployer, importer, distributor) and tick what your AI system does to see whether Regulation (EU) 2024/1689 makes it a prohibited practice, a high-risk system, or a transparency case, which Article the call rests on, your duties by role, and the dates.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/eu-ai-act-risk-checker/

After using this, you know which tier to plan for, which duties land on you, and what to put to counsel or your national authority.

Open `index.html`. Tests: `node --test 'ventures/eu-ai-act-risk-checker/**/*.test.mjs'`. `calc.mjs` holds the rules; the page's checkboxes mirror its option lists and `page.test.mjs` fails if they drift.

**No warranty.** Free and as-is; not legal advice. It reads only what you tick, and the dates are those in Article 113 as adopted (a postponement of the high-risk dates has been proposed). See `VENTURE.yaml`.
