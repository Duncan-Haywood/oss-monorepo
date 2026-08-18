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
| GEO / AI-visibility monitoring | At least eight funded platforms by mid-2026 with mid-market pricing already compressed toward €89/month. Entering at the bottom of a compressing market with no channel |
| Agent observability platform | Same category logic as [agent-permission-harness](candidates/agent-permission-harness.md) but worse — competing directly with funded incumbents on their core product rather than at an edge |
| Generic "AI chatbot for X" agency | No moat, churn tracks the customer's enthusiasm rather than any delivered value, and it is a services business wearing a product costume |
| Micro-SaaS acquisition and agent-operated turnaround | Fails the low-capital constraint outright, and inherits undisclosed obligations — data-protection liabilities, customer contracts, tax positions — from a seller with an incentive not to mention them |
| AI PR review, AI receptionist for trades, SOC 2 / ISO / HIPAA doc generation, API uptime monitoring, LinkedIn ghostwriting, RAG-as-a-service, e-commerce QA, contract review API | Already evaluated in `ventures/ai-first-markets/src/data/ideas.ts`. Duplicates, not candidates |
| Local business websites, print-on-demand art marketplace, small-format retail analytics, listing photography, pairwise survey engine, photo ingest tooling | Already a venture in `ventures/`. See that directory |

## Notes for the next pass

- **Deadline-driven compliance is the strongest available wedge for this
  portfolio, and also the most dangerous.** It supplies urgency and a price
  anchor without paid acquisition, and it puts you one positioning error away
  from an advice-of-record liability. Every compliance candidate here was
  narrowed to evidence-and-drafting for that reason, and the ones that could not
  be narrowed were rejected.
- **The recurring floor is distribution, not capability.** Four of six evaluated
  candidates scored 4 or 5 there. Building is not the constraint; being in front
  of a buyer who already has the problem is. That is why the top-ranked candidate
  is the one that reuses an existing venture's channel.
- **A contractor-in-the-loop step is not a failure of automation** when the step
  is one that cannot be automated honestly. It is what keeps a candidate on the
  right side of the ethics gate — the alternative is claiming the automated
  result covers what it does not.
