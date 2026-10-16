# Liability Audit roadmap

A long-running project with two halves. The **automated** half is rules that
find exposure in files. The **agent** half is a playbook (`AGENT.md`) for an
AI coding agent: it triages each finding, fixes the clear ones and brings
judgment calls to a person. Both run inside this repository, inside other
people's companies on their own infrastructure, and as a self-hosted service
someone deploys for their organisation.

## Where it is (v0, 2026-10-16)

- 14 rules across privacy, consumer protection, AI disclosure, IP, security
  and spend, each with evidence, the rule or law behind it, and a fix.
- CLI (`scan`, `sweep`, `rules`) with text, Markdown, JSON and SARIF output
  and `--fail-on`. A browser page scans a local folder and uploads nothing.
- First sweep of this repository (1,274 products, 506 research projects).
  Its false positives became test cases. The one real class of exposure it
  found was that the one-click deploy templates had no cloud budget alarm.
  That is fixed in the same change, as an optional monthly budget per cloud.

## Next

1. **Run on every PR here.** The venture's CI already writes a sweep of
   every venture to its job summary. Add a non-blocking report job that posts
   `--format md` for changed ventures. Use `--fail-on high` once the
   false-positive rate on real PRs is known.
2. **More rules, each with positive and negative fixtures:**
   - cookie banners that load trackers before a choice is made (reads script order);
   - children's data signals (COPPA / UK Age Appropriate Design Code);
   - accessibility statements for EU public-facing services (European Accessibility Act);
   - `robots.txt` / AI-crawler policy versus the site's stated terms;
   - payment code that runs live by default (no env flag);
   - unbounded autoscaling (`max_replicas` / `maxReplicas` absent or huge) and public buckets.
3. **Rule packs by jurisdiction and sector.** EU, UK, US-CA and others,
   chosen with `--pack`, so the "why" text cites the law that applies to the
   deployer.
4. **Evidence pack export.** A dated, signed JSON + HTML bundle of
   findings, triage decisions and fixes that a team can hand to an auditor
   or investor. Triage decisions live in a committed `liability-audit.json`
   (accepted, with who and when).
5. **Self-hosted service.** A GitHub App or webhook receiver that the
   deployer runs in their own account. It scans each push and comments on
   PRs, with one-click deploy through `platform/deploy`. Nothing passes
   through anything of ours.
6. **Optional AI triage on the deployer's key** (`platform/llm/byok.mjs`,
   capped by LLM Spend Guard). It explains a finding in context and drafts
   the fix. The deterministic report stays the product.

## Business model

MIT code that anyone runs. The business is the convenience around it:
one-click self-hosting, rule packs, and the evidence pack a small company
otherwise pays a consultant for. That is the portfolio's model
(`prompts/goals.md`, Mission): we host nothing and hold no one's code.
