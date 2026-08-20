# Candidate: Public-record watch

**One line.** A monitoring product built entirely on public registers — one
vertical at a time — that tells a professional when something in their world
changed, with the source document attached.

**Verdict: cheap probe.** The operating profile is the best in this pipeline
(no human in the loop, no customer data, no advice), and the distribution is the
worst. Two weeks against one vertical decides it.

Scored 2026-08-18. Composite 7.0 · floor 4 (distribution).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 6 | Honest score: mostly pipelines and diffing. Models classify, summarise, and explain relevance — real, but not the bulk |
| Autonomous ops | 9 | Fetch, diff, classify, notify. Nothing queues for a person |
| Time to revenue | 6 | Fast to build, slow to find the buyer who feels the pain weekly |
| Gross margin | 9 | Storage, scheduling, and modest inference |
| Defensibility | 5 | The pipeline is copyable; the history archive is not, and it compounds |
| Distribution | 4 | No warm channel. Needs a newsletter, a niche community, or a partner |
| Liability containment | 8 | Public data, attributed, with the source document linked |
| Ethical robustness | 9 | Redistributing public information to people entitled to it, with provenance |

## The shape

Pick a register that is public, changes on a schedule, and where a change costs
a specific professional money if missed. Poll it, diff it, and send the person
who cares the change with a link to the primary document. Charge €30–€150/month.

The product is not the summary. It is *knowing sooner*, *not missing*, and being
able to show the original record — which is why the primary-source link is
mandatory in every alert and why the archive is the asset. After a year of
polling, the history is something a new entrant cannot fetch.

Candidate registers, ranked by whether the miss is expensive:

1. **Professional licensing and disciplinary actions** — staffing agencies and
   healthcare recruiters carry real consequences for placing someone whose
   licence lapsed or was restricted. State and national boards publish this.
2. **Regulatory device and safety notices** — recalls, safety communications,
   and clearance changes matter urgently to distributors and consultants who
   currently learn about them from a colleague.
3. **Local permitting and zoning decisions** — high value to specialty
   contractors and small developers, but fragmented across municipalities, which
   is both the barrier and the moat.

## Liability and ethics

The safest profile in this pipeline, provided three rules hold:

- **Public registers only.** No scraping behind logins, no assembled personal
  profiles, no purchased data. A monitoring product over public records is
  ordinary; the same product over aggregated personal data is a GDPR problem
  with no legal team behind it.
- **Attribute every alert to its source document.** This converts the product
  from "our claim about a person" to "the register says this, here it is". That
  distinction is the entire liability position, particularly for anything
  touching a named individual's licence or discipline.
- **Never score or rank people.** Report the record change. Deciding what it
  means about someone is the customer's call and the customer's risk.

Also: honour the register's terms and rate limits. A business whose supply
depends on scraping aggressively is one blocklist away from having no product.

## Where it can fail

- **Distribution is the whole problem.** The buyer exists but has no gathering
  place we currently reach. If the probe cannot find fifty of them in a week,
  the vertical is wrong — try the next one rather than the next feature.
- **"I already get an email for that."** Many registers offer crude
  notifications. The product must beat free on filtering and speed, not exist
  alongside it.
- **Source instability.** Registers change format without notice. Budget for
  breakage as an ongoing cost and alert on pipeline silence, not just on
  findings — a monitor that quietly stopped is worse than no monitor.

## First experiment

Two weeks, under €150. Pick licensing-and-disciplinary as the first vertical:

1. Poll one state board for a month of history; measure how often anything
   actually changes. If the answer is "rarely", the pain is not weekly and the
   subscription will churn.
2. Write the alert as it would be sent, with the source link, and show it to ten
   staffing or credentialing people found through their own trade forums.
3. Ask three to pre-pay €50/month for a single-state feed.

Kill it if none pre-pay, and record the vertical in
[screened-out.md](../screened-out.md) with what the register's change rate
actually was — that number is reusable for the next vertical.

## Amendment, 2026-08-20: step 1 of the first experiment has been run

**No score changed.** Measurement, tooling and full reasoning:
[`portfolio/research/register-change-rate/`](../../research/register-change-rate/).

Step 1 above — *"poll one state board for a month of history; measure how often
anything actually changes"* — was answered retrospectively instead of forward,
by reading the commit history of registers that publish a git mirror. Nine
mirrors, 180 days, no credential and no spend.

- **The change-rate kill criterion passes**, for registers that have a mirror.
  Six of nine changed in at least half the window's weeks; the official
  software-security registers changed on 85–180 of 180 days with a worst gap of
  six. "The pain is not weekly" is not how this candidate dies.
- **Cheap-to-monitor and expensive-to-miss are anti-correlated.** None of the
  three verticals ranked above by cost-of-a-miss has a usable git mirror.
  Licensing and permitting have none found; the FDA's repository carries the
  agency's *tooling* (two commits in 180 days, last 73 days before the window
  closed) while the recall data itself is served from an API this environment
  cannot reach. What does mirror is the software-security feeds this write-up
  never names, whose buyers already get them free.
- **The moat sentence is refuted wherever the build is cheap.** "After a year of
  polling, the history is something a new entrant cannot fetch" does not hold
  for a mirrored register: this pass fetched the CISA KEV catalog's entire
  history — 388 commits — in one command, having polled nothing. It still holds
  for the unmirrored verticals this candidate actually proposes, which is why
  `defensibility: 5` is left alone. The constraint it creates for a later pass:
  **a vertical chosen because it is cheap to prototype from here has no archive
  moat, and whoever picks one has to drop that rationale in the same breath.**
- **"Alert on pipeline silence" is sharper than budgeted for.** Both control
  mirrors went quiet (149 and 73 days) without announcing it. A mirror-fed
  product monitors its maintainer, not the register, so it needs a per-source
  expected-cadence threshold derived from that source's own history and an alert
  when the current gap exceeds it.
- **The €150/two-week budget for step 1 is wrong for any mirrored source.** It
  is one command against real history, and the same technique retires the
  question for any candidate whose premise is "X changes often enough to watch".

Distribution — the floor at 4 — is untouched by all of this and remains the
thing that decides. This pass measured the product premise, not the buyer.
