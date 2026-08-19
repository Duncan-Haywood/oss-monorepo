# Candidate: Agent permission harness

**One line.** A regression test suite for AI agents: replay prompt-injection and
tool-permission attacks against a customer's agent or MCP server on every deploy,
and fail the build when a tool fires that should not have.

**Verdict: park; revisit 2027-Q1.** The best technical fit in this pipeline and
the worst timing. The buyers who need it most are the ones currently building
it in-house, and the ones who will buy it are not yet feeling the pain.

Scored 2026-08-18. Composite 7.0 · floor 4 (time to revenue, distribution).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 9 | Attack generation, mutation, and verdicting are model work end to end |
| Autonomous ops | 8 | Runs as CI; the corpus is maintained by agents |
| Time to revenue | 4 | Sold to engineering teams with a security review in front of the purchase |
| Gross margin | 9 | Inference and compute |
| Defensibility | 5 | The attack corpus and the per-customer regression history compound; the harness does not |
| Distribution | 4 | Developer channels are reachable but slow, and free tooling sets the anchor at zero |
| Liability containment | 8 | A test tool makes no safety claim, provided it never certifies |
| Ethical robustness | 9 | Defensive by construction; strictly customer's-own-systems testing |

## Why it looks strong

The gap is documented: reporting in 2026 put agent security incidents at 88
percent of surveyed enterprises in the prior twelve months, while only 21
percent had runtime visibility into agent behaviour and a third had no audit
trail at all. Regulated buyers are starting to gate procurement on it.

And the technical fit is unusually clean. This is a product an agent portfolio
can build and operate better than most teams: the corpus of injection patterns
is exactly the sort of thing that improves by being ground over continuously,
and every customer's failures make the corpus better without exposing their data.

## Why it is parked anyway

Three things, and the first is decisive:

- **The purchase is gated on a security review, and the product asks to be
  pointed at the customer's agent.** That is the slowest possible sale for a
  vendor with no company behind it and no SOC 2. Time-to-revenue at 4 is not
  pessimism; it is the shape of the buyer.
- **The category is being absorbed.** Agent observability and evaluation
  platforms are funded and shipping, and "attack replay in CI" is a feature
  those products can add. Entering below them without a channel means competing
  on a roadmap someone else controls.
- **The pain is early.** Teams that have had an incident build something
  internal; teams that have not do not buy. The window where that flips — when
  it becomes a procurement checkbox rather than an engineering preference — is
  plausibly 2027, when EU AI Act obligations for Annex III high-risk systems
  apply from 2 December 2027 and evidence of agent controls starts being asked
  for by buyers rather than by regulators.

## What would unpark it

Any one of these, checked at the 2027-Q1 revisit:

- A customer of another venture in this portfolio asks for it — distribution
  solved, sale de-risked.
- A named compliance regime starts requiring agent-level testing evidence
  specifically, converting a preference into a line item.
- The portfolio's own agent infrastructure produces a corpus worth selling
  access to, making this a by-product rather than a build.

Until one of those is true, the harness is worth building **internally** for the
portfolio's own agents — the cost is small, the corpus starts compounding, and
it becomes a product later without a wasted start.

## Liability note

The only genuine trap: never certify. "Passed our suite" must not read as
"secure". A test product that implies a safety guarantee inherits the incident it
failed to catch. Contracts should require the customer to warrant they own or
are authorised to test the target system, since the product actively attacks a
running service.

## Sources

- [DEV — AI agent audit trails: what compliance actually requires in 2026](https://dev.to/waxell/your-ai-agents-and-the-audit-trail-what-compliance-actually-needs-33i5)
- [Travers Smith — EU agrees to delay key AI Act compliance deadlines](https://www.traverssmith.com/knowledge/knowledge-container/eu-agrees-to-delay-key-ai-act-compliance-deadlines/)
