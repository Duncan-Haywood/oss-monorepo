# Candidate screen — August 2026

New software business candidates for the portfolio, screened for one operator
with AI agents doing the work: no employees, low capital, low liability.

Six candidates advanced and are now evaluated in the platform
(`src/data/ideas.ts`). The rest are recorded below with the reason they were
cut, because a screen that only records its winners cannot be audited later.

## Method

**Hard filters.** A candidate was cut outright if it failed any of these:

1. **Runnable by one person plus agents.** No inventory, no field ops, no
   staffed support tier, no headcount required to serve the tenth customer.
2. **Low capital.** Under roughly $5k to first revenue. No GPU fleet, no
   licensing deposits, no regulated capital requirements.
3. **Bounded liability.** No product where a defect causes physical harm,
   professional-liability exposure without a licensed human downstream, or
   losses uncapped by contract.
4. **Ethically clean by construction.** Nothing whose core mechanism is
   deception, undisclosed automation, circumventing a platform's terms,
   scraping personal data, or laundering someone else's copyrighted work.
5. **Not already in the portfolio.** Materially distinct from the eight
   existing ideas and the eleven ventures in `ventures/`.

**Then scored** on the platform's existing six dimensions, plus a new
liability rating (`low` / `medium` / `high`) recorded per idea and rendered in
the new **Liability & Risk Screen** report.

A note on the liability rating: it measures exposure *after* the listed
controls, and the controls are product-design choices, not disclaimers.
"Opens a pull request instead of merging" is a control. "Not liable per
section 9" is not.

## Advanced — six candidates

### 1. Answer Engine Visibility for Local Services (`local-answer-visibility`)

Weekly tracking of whether AI assistants name a local service business, plus
the fix list. The market signal is unambiguous — the US GEO market is
projected around $365M for 2026 growing ~43% CAGR — but every tool in it
(Profound, Conductor, Ahrefs Brand Radar, SE Visible) is built and priced for
brand marketing teams. Nobody serves the six-van HVAC company at $49/mo.

**Why it advanced:** highest time-to-revenue score in the cohort, and the
`local-site-studio` venture already sells to exactly this buyer, so
distribution is not a cold start.

**Honest weakness:** defensibility scores 3/10. The software is trivially
cloned and the upmarket tools can price down whenever they choose. This is a
channel play with a short window, not a durable product, and it is ranked #4
for $100k and #11 for $1M for that reason.

### 2. Accessibility Evidence Agent (`accessibility-evidence-agent`)

Continuous WCAG 2.2 AA scanning, code-level remediation PRs, and a dated
evidence pack for procurement. European Accessibility Act enforcement is
ramping through 2026 (first French suits filed November 2025), and enterprise
buyers now request conformance documentation at vendor selection and renewal.

**Why it advanced:** the demand is procurement-triggered, which means it
arrives with a deadline and a budget. The evidence trail compounds — two
years of timestamped remediation history cannot be backfilled by a competitor.

**Liability is the whole design.** Automated scanners catch only ~30–40% of
WCAG failures. Overlay widgets keep losing in court. So: no overlay is ever
shipped, every report states its coverage limit on its face, conformance
reports are generated as drafts the customer signs themselves, and manual
audit work is referred to partners rather than claimed. Remove any one of
those and this becomes a `high` and gets cut.

### 3. MCP Supply-Chain Watch (`mcp-supply-chain-watch`)

Continuous monitoring of the MCP servers an org's agents already trust:
tool-description diffing, permission-surface tracking, CI policy gate. The
registry counted ~9,650 servers as of May 2026, with ~41% of surveyed software
organizations reporting MCP servers in limited or broad production, and manual
vetting demonstrably does not scale to that.

**Why it advanced:** the longitudinal corpus is a real moat — nobody can
retroactively observe eighteen months of manifest behavior — and margin is
near 90%.

**Honest weakness:** time-to-revenue scores 5/10. Security buyers are slow,
and enterprise security procurement is precisely what a zero-employee model
handles worst. Ranked #10 for $100k. The OSS-scanner-first funnel is what
makes it viable at all.

### 4. Token Margin Analytics (`token-margin-analytics`)

Cost attribution for AI products: margin per customer, per feature, per plan.
98% of organizations now prioritize AI cost management (up from 63% in 2025),
but cloud FinOps tools are built around reserved capacity and eval-first
observability platforms are built around output quality. Neither answers
"which customer is unprofitable."

**Why it advanced:** the buyer already knows they have the problem, the SDK
install is ten minutes, and the hero artifact (a margin-per-customer chart) is
something founders share.

**Honest weakness:** defensibility 5/10. Langfuse or Braintrust adding an
adequate free cost view is a live threat, not a hypothetical.

### 5. Local Bid Radar (`local-bid-radar`)

State, county, municipal, and special-district solicitations matched to one
small contractor. Incumbent government-intelligence tooling runs a five-figure
median annual cost and is packaged for mid-market contractors; the low-cost
entrants that exist (Fed-Spend at $39–49/mo, BidSparq at $249/mo) skew
federal. State and local is fragmented across hundreds of portals with no
common format — a grind, which is what agents are good at.

**Why it advanced:** coverage of tedious local portals compounds into a real
moat, and matching quality improves per customer.

**Honest weakness:** distribution scores 4/10 — the lowest single score in the
cohort. This buyer is not online-native and does not self-serve. Ranked #13
for $100k for that reason alone; the product is fine, the reach is not.

### 6. Docs Drift Agent (`docs-drift-agent`)

Watches code and schema diffs, opens the docs PR the release should have
included. Audits of B2B SaaS help centers find ~40% of articles carry at least
one factually outdated element, and across documentation reports of the last
two years maintenance has overtaken creation as the larger problem.

**Why it advanced:** cleanest liability profile in the cohort (PRs only, never
publishes), self-serve marketplace distribution, and semantic invalidation is
genuinely not rule-expressible, so the AI is doing real work.

**Honest weakness:** defensibility 4/10. Mintlify, ReadMe, or GitHub can each
absorb this as a feature. Ranked #11 for $100k and #13 for $1M.

## Cut — and why

**Cut on overlap with what already exists:**

| Candidate | Reason |
|---|---|
| AI-generated code security scanning | Duplicates `ai-pr-review-bot`. The right move is a feature there, not a venture. |
| EU AI Act transparency documentation | Duplicates `compliance-doc-generator`. Same buyer, same drafting mechanics, same medium liability — a new framework in an existing product. |
| Generic brand GEO tracking | Duplicates the local variant against far stronger incumbents. Only the underserved local tier is worth entering. |
| AI voice booking for other verticals | Duplicates `vertical-ai-receptionist`. |
| Local business website generation | Duplicates the `local-site-studio` venture. |
| Photo/print workflow products | Duplicates `photo-editing`, `print-atelier`, `real-estate-agent-photo-app`, `photos-import-tools`. |

**Cut on liability or ethics:**

| Candidate | Reason |
|---|---|
| Accessibility overlay widget | The mechanism itself is the problem: overlays paper over failures rather than fixing them, and they keep losing in court. Fails filter 4 regardless of demand. |
| Consumer-facing legal, medical, or tax advice | Professional liability with no licensed human downstream. `contract-review-api` is already the portfolio's `high` rating and only survives by selling to platforms that keep a lawyer in the loop. |
| Resume screening / candidate ranking | Disparate-impact exposure under employment law, and an ethical objection independent of the legal one: automated rejection at scale with no accountable reviewer. |
| Voice cloning / synthetic personas for outreach | Deception is the product. Fails filter 4. |
| Scraped-contact lead generation | GDPR and CAN-SPAM exposure, and it depends on collecting personal data nobody consented to share. |
| Sales-tax nexus determination | Customers act on the output and get assessed penalties when it is wrong. Needs a licensed party. |
| Insurance claim automation | Regulated, licensed, and adversarial. Wrong domain for an unstaffed operator. |
| Content farms / programmatic SEO at volume | Works commercially, degrades the commons, and is one algorithm update from zero. Cut on ethics first, durability second. |

**Cut on business model, not risk:**

| Candidate | Reason |
|---|---|
| Agentic-commerce feed readiness | Shopify has abstracted UCP/ACP for its merchants since March 2026 and enabled it by default. The remaining non-Shopify segment is custom and B2B — sales-heavy, low volume. **Watchlist:** revisit if a second platform fragments the standard. |
| LLM eval platform | Four well-funded incumbents with a $29/mo floor. No wedge that survives contact. |
| Managed RAG for a vertical | Duplicates `rag-as-a-service` and inherits its processor-level data duties. |
| AI SDR / outbound automation | Deliverability rules and platform terms make the whole category a treadmill, and volume outbound is a customer-experience negative externality. |
| Docs localization | Real problem, but the buyer is the same as Docs Drift Agent and the ACV is lower. Fold in later as a tier rather than run separately. |

## Effect on the existing rankings

Adding six ideas required re-ranking. The rule applied: sort by verdict tier
first, then by average score, preserving the existing relative order of the
original eight as the tiebreak within each tier. Consequences:

- `$100k`: the new cohort inserts at #4 (local answer visibility, the only new
  `strong`) and #9–#13. Existing ideas shift by at most one place, except
  `contract-review-api`, which as the only `stretch` verdict now sits at #14.
- `$1M`: the ranking previously started at #2 with no #1. Re-ranking fills it.
  `ai-qa-for-ecommerce` takes #1 on merit and the rest of the `viable` tier
  each move up one place. The two new `viable` entries insert at #6 and #7,
  which pushes the three `stretch`-tier ideas down one (`compliance-doc-generator`
  7→8, `rag-as-a-service` 8→9, `contract-review-api` 9→10).

All eight original ideas were also backfilled with liability ratings so the
new screen covers the whole portfolio rather than only the new cohort. Two
ratings are worth flagging: `contract-review-api` is the portfolio's only
`high`, and `vertical-ai-receptionist` is `medium` largely on call-recording
consent and AI-disclosure rules that vary by state.

## Recommendation

**Validate `local-answer-visibility` first**, and validate it cheaply. It is
the only new candidate that is `strong` for $100k, it reuses an existing
channel rather than building one, and its weakness (defensibility) is a reason
to move fast rather than a reason to skip it.

The experiment is deliberately manual: run the prompt panel by hand for 20
local businesses in one metro and one vertical, send each owner their actual
result, and count replies. Under 3 replies out of 20 and the idea is dead for
under $200 of model spend. That is the entire capital exposure of finding out.

Second priority is `token-margin-analytics`, which is the strongest new
candidate on the $1M path (#6) and can run as a background build while the
first experiment resolves.

Do not start `mcp-supply-chain-watch` or `accessibility-evidence-agent` yet.
Both are viable, both take 16–20 months to $100k, and neither should begin
before something cheaper has either worked or failed.

## Sources

- [US GEO market size and tool landscape](https://www.semrush.com/blog/best-generative-engine-optimization-tools/) · [Profound tool comparison](https://www.tryprofound.com/blog/best-generative-engine-optimization-tools) · [GEO statistics](https://www.omnibound.ai/blog/generative-engine-optimization-statistics)
- [European Accessibility Act 2026 enforcement](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/) · [Automated scanner coverage limits and overlay litigation](https://internet-pros.com/blog/digital-accessibility-wcag-european-accessibility-act-2026/)
- [MCP registry counts and enterprise adoption](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol) · [MCP server vetting at scale](https://www.mintmcp.com/blog/mcp-server-security-vetting) · [MCP 2026 roadmap](https://toloka.ai/blog/the-future-of-mcp-enterprise-adoption/)
- [AI cost management prioritization](https://www.finout.io/blog/ai-cost-visibility-in-2026-strategies-tools-and-best-practices) · [Token FinOps attribution gap](https://www.innobu.com/en/articles/ai-token-costs-finops-2026.html) · [LLM observability platform pricing](https://www.marktechpost.com/2026/08/09/top-llm-observability-and-evaluation-platforms-in-2026-langfuse-langsmith-braintrust-arize-and-more-compared/)
- [GovSpend pricing and SMB alternatives](https://fed-spend.com/blog/govspend-pricing-2026-cost-alternatives) · [Government contracting tool landscape](https://www.oryoniq.com/blog/top-tools-find-government-bids-rfps-2026)
- [Documentation drift and maintenance burden](https://www.happysupport.ai/en/blog/state-of-documentation-2026) · [Stopping documentation drift](https://www.mintlify.com/library/how-to-stop-documentation-drift)
- [Agentic commerce protocol state and Shopify default enablement](https://www.digitalapplied.com/blog/agentic-commerce-readiness-checklist-2026-ecommerce-guide) · [AI-generated code vulnerability rates](https://www.paperclipped.de/en/blog/ai-generated-code-security-vulnerabilities/)

Figures cited above are vendor and analyst estimates gathered in August 2026,
not independently verified. They are strong enough to rank candidates against
each other and not strong enough to build a revenue model on.
