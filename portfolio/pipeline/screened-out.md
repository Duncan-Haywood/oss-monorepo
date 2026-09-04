# Screened out

Candidates that were considered and did not get a write-up, with the reason.
Kept for the same reason the ledger records months where nothing happened: the
expensive mistake is re-deriving a rejection every six months.

Screened 2026-08-18 unless dated otherwise.

## Rejected on the ethics or liability gate

These fail before economics are considered. A gate failure is not a score to be
outweighed.

| Candidate | Reason |
|---|---|
| Accessibility overlay widgets | Repeatedly unsuccessful in court, distrusted by the users they claim to serve, and sold on a compliance promise they do not deliver. The higher-margin version of a candidate we are pursuing honestly — see [eaa-remediation-pipeline](candidates/eaa-remediation-pipeline.md) |
| AI legal / medical / tax advice products | Advice-of-record with no professional to hold the liability. The whole category is out under the portfolio's standing constraints |
| Scraped lead databases and enrichment | Personal data assembled without a lawful basis is GDPR exposure with no legal team. Also the input to the cold-outreach products below |
| AI SDR and cold-email-at-volume | Deliverability collapse aside, the ethics do not survive the "does this get better for recipients as it scales" test. It gets worse |
| Interview and assessment circumvention tools | The customer's gain is someone else's loss by construction |
| Trading signals, crypto yield, and anything advisory about money | Securities regulation, plus the failure mode is a customer's savings |
| Automated dispute and chargeback filing at volume | Filing-of-record on someone's behalf, with fraud exposure if the volume is wrong |

## Rejected on economics or fit

| Candidate | Reason |
|---|---|
| Moober (cattle transport matching) | Fails low-capital (transport coordination requires insurance, infrastructure, regional licensing) and no-employees constraints (needs logistics coordinators and dispatch). High liability and animal-welfare exposure. Low AI leverage — primarily a marketplace/logistics problem with matching and routing that does not require model work. Physical logistics marketplaces in regulated transportation are capital-intensive without a defensible edge |
| GEO / AI-visibility monitoring | At least eight funded platforms by mid-2026 with mid-market pricing already compressed toward €89/month. Entering at the bottom of a compressing market with no channel |
| Agent observability platform | Same category logic as [agent-permission-harness](candidates/agent-permission-harness.md) but worse — competing directly with funded incumbents on their core product rather than at an edge |
| Generic "AI chatbot for X" agency | No moat, churn tracks the customer's enthusiasm rather than any delivered value, and it is a services business wearing a product costume |
| Micro-SaaS acquisition and agent-operated turnaround | Fails the low-capital constraint outright, and inherits undisclosed obligations — data-protection liabilities, customer contracts, tax positions — from a seller with an incentive not to mention them |
| AI PR review, AI receptionist for trades, SOC 2 / ISO / HIPAA doc generation, API uptime monitoring, LinkedIn ghostwriting, RAG-as-a-service, e-commerce QA, contract review API | Already evaluated in `ventures/ai-first-markets/src/data/ideas.ts`. Duplicates, not candidates |
| Local business websites, print-on-demand art marketplace, small-format retail analytics, listing photography, pairwise survey engine, photo ingest tooling, Amazon FBA vs FBM fee calculator | Already a venture in `ventures/`. See that directory. A *product line* of one of those (e.g. [mls-photo-spec-preflight](candidates/mls-photo-spec-preflight.md) on listing photography) is not this row — it is the README rule "fits an existing venture → product line first" |
| MLS photo spec preflight as a new `ventures/` directory | Same buyer and delivery folder as `real-estate-agent-photo-app`. Kept as a product line of that venture, not a ninth company |

## From the parallel screening runs (#18, #20, #27, #30, #34)

Added 2026-08-18 during consolidation. These were proposed by the other five
scheduled runs that screened the same brief the same day. Restatements of a
candidate already written up here are listed once, with the surviving
write-up named; the rest carry their own reason.

| Candidate | Reason |
|---|---|
| `a11y-regression-gate`, `accessibility-remediation-bot`, `accessibility-evidence-agent`, `accessibility-regression-guard`, `a11y-conformance-ci` | Same business as [eaa-remediation-pipeline](candidates/eaa-remediation-pipeline.md), found independently by all six runs. Kept as the CI-gate variant inside that write-up rather than as separate candidates |
| `public-bid-radar`, `public-bid-matchmaker`, `local-bid-radar`, `public-record-signal-feed` | Same business as [tender-radar](candidates/tender-radar.md) and [public-record-watch](candidates/public-record-watch.md) |
| `mcp-gateway-service`, `agent-ready-api-gateway`, `api-to-mcp-gateway`, `agent-ready-commerce` | Same business as [agent-permission-harness](candidates/agent-permission-harness.md), which is parked. Wrapping an existing API as MCP is a weekend of work the customer's own engineers can do, and the commerce variant additionally depends on agent-initiated purchasing volume that does not exist yet at a scale that pays |
| `cra-sbom-autopilot` | Same business as [cra-evidence-desk](candidates/cra-evidence-desk.md). The "autopilot" framing is worse — it implies the tool carries the obligation, which is the positioning error that write-up exists to avoid |
| `regulation-diff-feed`, `regulatory-deadline-feed` | Same business as [public-record-watch](candidates/public-record-watch.md). Note the broad "all regulation" version is a harder product than it looks: the diff is cheap, deciding which diffs matter to a given customer is the entire job, and getting that wrong on a deadline is the advice-of-record failure mode |
| `mcp-supply-chain-scanner` | Kept, as [mcp-supply-chain-watch](candidates/mcp-supply-chain-watch.md). Narrowed from scanning arbitrary servers to monitoring servers the customer has already connected — unrequested scanning of third-party infrastructure is not ours to do |
| `dependency-upgrade-agent`, `upgrade-migration-agent` | Renovate and Dependabot are free, entrenched, and already the default. The paid slice is major-version framework migrations, which is consulting with a variable-cost human in the loop — it fails the no-employees and gross-margin constraints together |
| `docs-debt-service`, `docs-drift-agent` | Real problem, weak willingness to pay: stale documentation has no deadline, no fine, and no visible failure, so it loses every budget cycle to something that does. Also the natural home for it is inside the code host, not a third-party subscription |
| `llm-feature-assurance` | Evaluation and regression testing for LLM features is contested by several funded platforms with free tiers. Entering on their core product with no channel |
| `token-margin-analytics` | Thin wedge on top of observability platforms that already report token spend, and the customer segment that cares most is the one most likely to build it in an afternoon |
| `coi-compliance-tracker` | Genuine pain and a real market, but the buyers are construction and property management — segments that need a salesforce, not a channel — and incumbents are funded. The liability shape is also worse than it first appears: tracking a certificate that lapses puts us in the causal chain of an uninsured loss |
| `repo-localization-agent` | Translation quality is commoditised and the workflow is already bundled into localisation platforms and CI actions. No wedge |
| `local-answer-visibility` | The GEO / AI-visibility category, already rejected above on a compressing market |
| `brand-watch-intelligence` | Trademark conflict monitoring reads as trademark advice the moment a customer acts on it, and the value is in the opinion rather than the alert. Advice-of-record |
| `multi-location-listing-guard` | Yext and BrightLocal own this, sold through agencies. Distribution is the whole business and we do not have it |
| `chatbot-disclosure-monitor` | Correctly scoped and genuinely low-liability, but too small to be a business on its own — this is a feature of a compliance monitoring product, not a subscription anyone renews. Worth revisiting as an add-on if [public-record-watch](candidates/public-record-watch.md) finds a buyer |
| `einvoice-preflight` (broad version) | Retained as a write-up with a conditional narrow verdict; see [einvoice-preflight](candidates/einvoice-preflight.md) |

## Candidate added 2026-08-24

| Candidate | Why it is not already screened out |
|---|---|
| Shopify app-permission drift record | Not the existing storefront QA idea: it records customer-authorized Shopify admin app scopes, webhook topics, and authorization state rather than exercising checkout or visual behaviour. It is not Shopify accessibility evidence, which scans rendered theme output, and it is not vendor-change evidence, which watches public third-party pages. The proposed Shopify App Store channel is real but the narrower permission-audit search demand and platform observability remain unmeasured, so it is retained as a probe rather than treated as validated. |

## Notes for the next pass

The **vendor-change evidence monitor** is intentionally retained as a separate
candidate rather than screened out as public-record watch or documentation
drift. It watches customer-selected commercial vendor pages and preserves
source-linked before/after evidence; it does not monitor public registers, infer
legal consequences, or watch a customer's own documentation. Its low
defensibility and distribution scores are explicit, and both have named probe
mitigations in [the write-up](candidates/vendor-change-evidence.md).

- **Deadline-driven compliance is the strongest available wedge for this
  portfolio, and also the most dangerous.** It supplies urgency and a price
  anchor without paid acquisition, and it puts you one positioning error away
  from an advice-of-record liability. Every compliance candidate here was
  narrowed to evidence-and-drafting for that reason, and the ones that could not
  be narrowed were rejected.
- **The recurring floor is distribution, not capability.** Four of seven evaluated
  candidates scored 4 or 5 there. Building is not the constraint; being in front
  of a buyer who already has the problem is. That is why the top-ranked candidate
  is the one that reuses an existing venture's channel.
- **A contractor-in-the-loop step is not a failure of automation** when the step
  is one that cannot be automated honestly. It is what keeps a candidate on the
  right side of the ethics gate — the alternative is claiming the automated
  result covers what it does not.

- **DNS configuration evidence monitor** is retained separately from vendor-change evidence and uptime monitoring. It observes customer-authorized DNS answers and delegation, never writes records, sends mail, or claims security, deliverability, or compliance.

`repository-branch-hygiene` is intentionally retained as a separate candidate,
not screened out as the internal branch-cleanup automation proposed in PR #829.
The internal workflow is a repository-specific unattended deletion mechanism;
this candidate is a customer-facing, multi-repository read-only inventory and
recovery product whose first output is an approval queue. It must still prove a
buyer and a distribution channel before graduation.

It graduated on 2026-08-24 as `ventures/repository-branch-hygiene` with a local
scanner vertical slice. Graduation is not demand validation: the read-only pilot
and willingness-to-pay experiment remain outstanding.
