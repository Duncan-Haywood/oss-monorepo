# Requests for startups as a direction

*A direction note and candidate list, not a rule. The owner picked the areas
on 2026-11-03 after a session read the investors' published lists. The
mapping to this repository and the first steps are that session's notes.*

## The owner's view

The owner asked for "direction to consider these":

> Robots Made in America. Wall Street for the Physical Buildout. Vertical
> Foundation Models. AI for City Hall for construction permits. Data Center
> Supply Chain. 3D generative AI, vibe-creation platforms, AI-native
> education, agent harnesses, Daybreak: an AI wealth advisor and manager.
> XYZ: autonomy for manufacturing. RTP: an AI operating system for
> solopreneurs and small businesses - takes care of everything except your
> product so you can focus on where you add value. Hannah Grey: tools for
> running orgs of agents. I think that's one where we have special focus
> maybe. tooling for running this repo more efficiently. high throughput
> agent dev shop tooling.

## Sources (read 2026-11-03)

- **Y Combinator, Winter 2027** (https://www.ycombinator.com/rfs, 11
  requests): Startups in a World of Abundant Space Access; The $15-an-Hour
  Expert; Robots Made in America; LLMs That Write Well; Plaid for Government
  Benefits; Wall Street for the Physical Buildout; Vertical Foundation
  Models; AI for City Hall; Data Center Supply Chain; AI for the Air-Gapped
  Economy; Own Your Intelligence. The page shows no publication date.
- **a16z Speedrun** (SR006, via VC Cafe, 2026-02-03): vibe-creation
  platforms, AI companions, AI-native education, multiplayer AI, AI
  personalised to one person.
- **Conviction** (2026 outlook, via VC Cafe): agent harnesses, economically
  useful evals, 3D generative AI, energy-efficient AI.
- **Next Play's Spring 2026 roundup** (2026-03-15, partners' own picks, not
  firm lists): Daybreak (AI wealth advisory), XYZ (autonomy for
  manufacturing), RTP (an AI operating system for solopreneurs and SMBs),
  Hannah Grey (orchestration, agent management, payments and trust for
  "emergent organizations"), and others.
- **Pear VC** (https://pear.vc/request-for-startups/, 2026-03-07, 11
  requests): plan mode for every knowledge worker; financial-grade agent
  infrastructure; verified consumer health marketplaces; ambient AI for
  vertical workflows; foundational datasets for biological intelligence;
  coordinated action in healthcare; IRL trust networks; intent-native
  commerce; people search for agents; agents that manage business expenses;
  paying for validated outcomes. A newer August 2026 Pear list exists
  (https://pear.vc/request-for-startups-august-2026/) and was not read.
- **Engage** (https://engage.vc/rfs/, undated, six areas for its corporate
  partners): smarter buildings; circular economy; personalisation; distributed
  workforces; AI for knowledge workers; supply chain resiliency.

The roundups are secondhand. Check a firm's own page before quoting it in
anything user-facing.

## How to read this

These are investors' theses, not proof of demand. The bars that apply to
everything else here still apply: a named first visitor, zero per-user cost
to us, the disclaimer, and no legal exposure (`PRODUCT_PLAYBOOK.md`,
`prompts/goals.md` "Guardrails"). Several areas (lending, wealth advice,
permits) are regulated. Here they mean free tools that inform a person, not
a lender, an adviser or a filing service.

Most of the owner's picks sit inside directions that already exist:
industrial, energy and construction (2026-10-31), open heavy equipment
(2026-10-24) and depth over calculators (2026-10-29). This note adds the
investors' framing and one new emphasis: **tooling for running orgs of
agents**, starting with this repository.

## Special focus: tooling for a high-throughput agent dev shop

Hannah Grey's "tools for running orgs of agents" and Conviction's "agent
harness" describe what this repository already is. It runs as an agent dev
shop: 4,641 run records in `prompts/runs/` since 2026-10-01 (220 on
2026-10-30 alone), about 140 to 290 blog posts a day, and 81 Python checks
in `platform/ci/` written to stop failures that recurred across sessions.
The pain points are documented, not guessed:

| Problem the repo already hit | Existing script | Product angle |
|---|---|---|
| Overlapping scheduled sessions open duplicate PRs | `portfolio/ledger/supersede_check.py`, `.github/prompts/duplicate-work.md` | Detect duplicate agent work before the PR is opened, across any repo |
| Pushed branches nobody opens a PR for | `platform/ci/unlanded_work.py`, `adopt_stranded.py` | A "stranded work" report for any repo agents push to |
| Red CI that is really runner starvation | `platform/ci/ci_starvation.py` | Classify a failed Actions run as real or starved |
| Agents editing their own instructions or CI | `platform/ci/control_plane_guard.py`, `.github/CODEOWNERS` | A control-plane guard kit for agent repos |
| Template glut (121 `*-bid-calculator` ventures) | `portfolio/pipeline/duplicate_check.py`, `post_similarity.py` | Near-duplicate output detection for agent fleets |
| Knowing what each session did and cost | `prompts/runs/*.json`, `prompts/promptctl.py` | A run-record schema and dashboard for agent fleets |

Existing ventures nearby: `agent-workroom` (a 3D office for agents),
`agent-instructions-drift-check`, `agent-permission-config-check`,
`claude-code-subagent-check` and the `actions-*-check` family.

**First step:** pick the two scripts with the clearest outside use
(`ci_starvation.py` and `unlanded_work.py` look strongest), make them run
against any repository with no monorepo imports, and ship them as one
installable CLI with a README and a page. Measure it on this repo first
(how many runs it would have saved) and say so in the post. Speed gains for
this repo count as a result even if nobody else installs it.

## The other picks, mapped

| Area (source) | What exists here | A first step worth a session |
|---|---|---|
| Robots Made in America (YC) | `open-floor-robots`, `open-robot-mower`, `open-tennis-robots`; research track 25 (`heavy`) | A bill-of-materials country-of-origin checker for a robot design against the domestic-content thresholds YC cites (65%, rising to 75% in 2029), once the rule text is read from the FCC itself |
| Wall Street for the Physical Buildout (YC) | `equipment-lease-vs-buy-calculator`, `equipment-lease-buyout-calculator` | Open underwriting models for robots and GPU clusters (utilisation, residual value, downtime) as research, not a lender |
| Vertical Foundation Models (YC) | `research/` (chip-search `accel-*` programmes, `changepoint-detector`) | A small time-series or construction-domain model evaluated against a general model on public data, as a research programme |
| AI for City Hall: construction permits (YC) | `wall-framing-takeoff` (top flagship), `construction-evidence-log` | A residential permit-package preflight for one city: does this submission have every sheet and form the city's published checklist asks for. Pick a city whose checklist is public |
| Data Center Supply Chain (YC) | none | Lead-time and substitution tracker for transformers and switchgear built from public filings and manufacturer notices, sources cited per row |
| 3D generative AI (Conviction) | `agent-workroom` (CSS 3D), `3d-print-price-calculator` | Text or photo to printable part, run on a local model |
| Vibe-creation platforms (Speedrun) | the catalogue itself | A page where a person describes a small tool and gets a static, MIT-licensed page back, run on their own key |
| AI-native education (Speedrun) | `ai-engineering-academy` | Deepen it: exercises graded against real code, local-model option |
| Agent harnesses (Conviction) | `sales-agent`, `support-agent`, `platform/agents/` | Folds into the special focus above |
| AI wealth advisor and manager (Daybreak) | retirement and tax calculators (`backdoor-roth-pro-rata-calculator`, `401k-*`, `solo-401k-*`) | One household model that ties the calculators together. Education, never advice or account access |
| Autonomy for manufacturing (XYZ) | `cnc-machining-quote-calculator`, heavy-equipment research | Open job-shop scheduling and quoting from a part file |
| AI OS for solopreneurs and SMBs (RTP) | `ai-bookkeeper`, `sales-agent`, `support-agent`, `einvoice-preflight`, `shift-roster-builder` | Join the flagships into one "everything except your product" workspace: books, invoicing, support inbox, scheduling, on the user's own keys |

Before building, run `python3 portfolio/pipeline/duplicate_check.py
"<niche>"` and name where the first real user would come from.
