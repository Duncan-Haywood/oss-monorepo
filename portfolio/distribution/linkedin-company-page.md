# LinkedIn company page: Maris Stella Labs

Paste-ready copy for the owner's LinkedIn company page (owner, 2026-10-31:
"rebranding my company maris stella labs on linkedin as the company that runs
this repo. I'm founder of it."). Creating or editing the page is the owner's
job: publishing under the portfolio's public name is owner-only (`goals.md`,
"Guardrails"). This file only supplies the text.

Every figure below was counted on 2026-10-31. Recount before pasting, and do
not round up:

| Claim | How it was counted |
|---|---|
| 1,300+ tools | `node platform/agents/tools.mjs search ""` → `"total": 1306` |
| 1,000+ research projects | `ls research \| grep -v '^_\|\.' \| wc -l` → 1058 directories |
| MIT licensed | `LICENSE` |
| Site | https://marisstella.app/ answered 200 |

Do not add customer counts, user numbers, testimonials, revenue or "trusted
by" lines. Usage is unmeasured (`portfolio/usage/usage.yaml`), so there is
nothing to back them.

## Fields

- **Name:** Maris Stella Labs
- **Page URL:** linkedin.com/company/maris-stella-labs (pick a different slug if this one is taken)
- **Website:** https://marisstella.app/?ref=linkedin
- **Industry:** Software Development
- **Company size:** 1 employee (choose LinkedIn's smallest band, "2-10", only if that is true)
- **Type:** Self-employed, or Privately Held if the company is registered
- **Founded:** use the year the company was actually formed
- **Specialties** (LinkedIn allows 20):
  open source software, small business tools, AI agents, autonomous
  software development, bookkeeping software, pricing calculators,
  self-hosted software, MCP tools, open research, reproducible research,
  AI hardware research, robotics research

## Tagline (max 120 characters)

Pick one:

1. `Free, open-source tools and open research, built in public by AI agents.` (73)
2. `1,300+ free MIT-licensed tools for small businesses, built in public by AI agents.` (82)
3. `An open-source lab where AI agents build tools for small businesses and publish open research.` (94)

Option 1 stays true as the counts change. Option 2 makes a stronger hook,
but the number has to be kept current.

## About / Overview (max 2,000 characters)

> Maris Stella Labs builds free, open-source software for small businesses,
> freelancers and the people starting one, and publishes open research
> anyone can build on.
>
> Everything is built in public by AI coding agents working in a single
> repository, with the founder setting the direction. Every change goes
> through automated tests and checks before it ships, and the history of
> every merge is public.
>
> What's there today:
>
> • 1,300+ browser tools: quoting and pricing for trades, marketplace fee
> calculators, restaurant costing, contracts, compliance checks and
> back-office money. No account needed.
> • Deeper products, including an AI bookkeeper: a double-entry ledger that
> learns from your categorisations, reconciles to your bank statement and
> exports to QuickBooks and Xero.
> • Self-hostable business apps: open-source alternatives to paid SaaS that
> you run on your own server.
> • Tools for AI agents: the same calculators as a command line and an MCP
> server, so Claude, Cursor and other agents can call them.
> • Open research: 1,000+ reproducible projects with code, on topics from
> AI accelerators and chip design to robotics, digital twins and markets.
>
> All of it is MIT licensed. Use it, change it, or run your own copy as a
> business of your own.
>
> Have an idea for a tool? Bring it to us and the agents will build it in
> public, for free.
>
> https://marisstella.app/?ref=linkedin
> Source: https://github.com/duncan-haywood/oss-monorepo

About 1,560 characters. Before pasting, check that "every change goes
through automated tests" still holds (CI runs on every PR; see
`.github/prompts/verify-and-merge.md`), and check that the bookkeeper's export
claim still matches `portfolio/flagships.yaml`.

## Button

**Visit website** → `https://marisstella.app/?ref=linkedin`

## First post (optional)

> We're relaunching Maris Stella Labs as the company behind an experiment:
> an open-source lab where AI agents do the building.
>
> So far, that's 1,300+ free tools for small businesses and 1,000+ open
> research projects, all MIT licensed, built in public, with every change
> tested before it ships.
>
> The site moved this week to its own home: https://marisstella.app/?ref=linkedin
>
> If you run a small business and there's a calculation or a piece of
> paperwork you dread, tell me. That's exactly the kind of thing we build.

## Founder profile (your personal page)

- **Experience entry:** Founder, Maris Stella Labs. Link the company page so
  its logo shows. Description: "Founded an open-source lab where AI agents
  build free tools for small businesses and publish open research. I set
  direction, guardrails and priorities; agents build, test and ship."
- **Headline:** `Founder, Maris Stella Labs: open-source tools and research built by AI agents`

## Notes

- LinkedIn's terms allow one page per real organisation, run by a real
  person. Don't create extra pages or automate posting (`goals.md`, "No terms
  of service are ever broken").
- Logo: 300×300 px, cover image: 1128×191 px. The repository has no logo
  file yet. Don't use another company's marks.
- Links carry `?ref=linkedin` so visits from LinkedIn can be told apart
  (`channels.yaml`, `hub-linkedin-drafts`).
