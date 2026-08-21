# Candidate: Agent permission harness

**One line.** A regression test suite for AI agents: replay prompt-injection and
tool-permission attacks against a customer's agent or MCP server on every deploy,
and fail the build when a tool fires that should not have.

**Verdict: park; revisit 2027-Q1.** The best technical fit in this pipeline and
the worst timing. The buyers who need it most are the ones currently building
it in-house, and the ones who will buy it are not yet feeling the pain.

Scored 2026-08-18. Rescored 2026-08-21 after the internal build.
Composite 6.875 · floor 4 (time to revenue, distribution).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 8 | Was 9, "attack generation, mutation, and verdicting are model work end to end". Lowered 2026-08-21: the internal harness this candidate prescribes was built and contains no model call at all — see the amendment below |
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

## Amendment, 2026-08-21: the internal build was done, and it moved the product's shape

The last line of "What would unpark it" said the harness was worth building
internally for the portfolio's own agents. That was taken literally rather than
as a gesture, and the build is
[`probes/agent-permission-harness/`](../probes/agent-permission-harness/) — 960
lines, seven rules, 61 tests, run over all 31 workflow files in this repository.

Three things came out of it, in descending order of how much they change the
argument above.

**1. The product's framing is aimed at the smaller half of the surface.** This
candidate sells attack replay: point the harness at the running agent and see
what fires. But an agent's instruction set is not its `prompt:` input — it is
the transitive closure of what that prompt *directs it to read*. This
portfolio's agent prompt is 52 fixed lines whose main content is reading orders:
read `CLAUDE.md`, read every `ventures/*/VENTURE.yaml`, read each venture's
`AGENTS.md` and "heed them". Resolved, that is **21 repository files**, every one
of them `REPO_WRITE` — one merged pull request from saying something else — and
the agent reads all of them holding `contents: write`, `pull-requests: write`
and two secrets. Replay tests 1 of those 21, and it is the one an attacker has
least reason to write to. The closure is enumerable from the prompt text in
about 60 lines of regex and glob, and it is invisible to replay by construction:
replay measures a response to inputs you already thought to send.

**2. Nothing found on this surface needed anything to run.** 13 findings across
3 of 31 workflow files, all decided from the artifact. The canonical GitHub
Actions script-injection class found **zero** — the fleet workflow passes its one
dispatch input through `env:` and regex-validates it, which is correct. So the
finding that mattered could not be the famous one.

**3. `ai_leverage` falls 9 → 8, and nothing else moves.** The 9 was "model work
end to end"; the build that shipped has no model in it. That is not a refutation
of the 9 for the dynamic half — whether a reachable input actually causes a
wrong tool call is genuinely undecidable statically, and it is what a buyer's
security review gates on. It is a measurement that the deterministic half came
first, cost little, and exhausted this surface. The verdict stays **park**:
nothing here touches time-to-revenue or distribution, which is what park rests
on.

Two things are argued and deliberately *not* scored, because this pipeline has
been burned by treating an argument as a measurement:

- **Defensibility (5, unchanged).** Published open-source Actions scanners
  already cover three of the seven rules, and the whole probe is standard
  library plus PyYAML. R7 appears not to be in them — but confirming that is a
  substitute-supply measurement and the egress is denied here.
- **The named mitigation (unchanged, but flagged).** It says the internal build
  makes an *attack corpus* compound. One iteration produced a **rule set**, and
  rule sets are the commoditized half. One iteration cannot refute a mitigation;
  it can put a question on the 2027-Q1 revisit, which it now does.

The liability note below survives the build intact and gains a first
application: this probe reports reachability, not safety, and "nothing found" is
not "secure" — the dynamic half is untested by construction. The rule "never
certify" binds the internal tool before it binds any product.

## Sources

- [DEV — AI agent audit trails: what compliance actually requires in 2026](https://dev.to/waxell/your-ai-agents-and-the-audit-trail-what-compliance-actually-needs-33i5)
- [Travers Smith — EU agrees to delay key AI Act compliance deadlines](https://www.traverssmith.com/knowledge/knowledge-container/eu-agrees-to-delay-key-ai-act-compliance-deadlines/)
