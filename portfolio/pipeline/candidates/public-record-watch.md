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
| Ethical robustness | 9 | Measured 2026-08-21, 9 → 6 → 9. The subscriber record now prints the held-out detection rate, names the direction, discloses that our incentive runs toward missing you, and never renders "no alert" as health — see the amendment below. Read the 9 as a disclosure score, not a verdict on the product: the detector still misses two thirds of what it is sold to find. Redistributing public information to people entitled to it, with provenance — but held-out recall is 0.35, the subscriber sees the same silence whether a source is quiet or the watch missed it, and nuisance alarms cost the operator churn while a miss costs nothing. See [`portfolio/research/error-rate-disclosure/`](../../research/error-rate-disclosure/) |

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

## Amendment, 2026-08-21: the silence detector is built, and it refutes its own spec

**No score changed.** Probe, tests and full numbers:
[`portfolio/pipeline/probes/source-silence-detector/`](../probes/source-silence-detector/README.md).

The bullet above ends by asking for "a per-source expected-cadence threshold
derived from its own history". That is now built and backtested offline against
the same 180-day window, and **the rule as specified catches none of it**: 0 of
the 2 mirrors that actually went silent, at every one of twelve parameter
settings. The reason is structural rather than a tuning miss — the threshold is
not inaccurate for those two sources, it is undefined, because each shows a
single gap in the window and an estimator fitted to observed gaps has nothing to
fit. Stated generally: *the registers that most need a silence alarm are the ones
that publish too rarely to calibrate one.*

Three consequences for anyone picking this candidate up:

- **"Alert on pipeline silence" is not a checkbox on the build.** It needs a
  stated fallback for sources that cannot be calibrated, and the fallback is what
  does the actual detecting. A pooled threshold recovers both sources at 11 days'
  latency for 10 nuisance alarm-days per 180 days across 9 sources; a fixed
  30-day rule also recovers both but cannot beat 30 days' latency by
  construction.
- **Calibrate on full history, not on the observation window.** A monitor that
  starts learning on the day it is switched on is least reliable when it is
  newest, and a worst-gap-anchored threshold under-estimates until the source's
  worst gap has actually happened — so a new slow source is noisy for its first
  cycle.
- **This changes nothing about the floor.** Distribution is still 4 and still
  what decides. Knowing the monitor works is not knowing anyone will buy it.

## Amendment, 2026-08-21: the subscriber record is built, and the disclosure gap closes

**`ethical_robustness` 6 → 9. Composite 6.625 → 7.0.**

[`error-rate-disclosure/`](../../research/error-rate-disclosure/) scored this
candidate 9 → 6 earlier the same day, on a finding that was not about the
detector's accuracy but about there being **nowhere for the accuracy to go**:
the probe rendered an operator table and no customer artifact at all. Its
`MISSED` column told whoever was tuning the detector that a register's dormancy
had been missed, and nothing carried that — or the committed held-out recall of
0.35 — to the person paying to be told.

`probes/source-silence-detector/subscriber_record.py` is that missing surface.
What it does that the operator table could not:

- **Prints the measured rates at the top of every record.** Detection rate
  **6 of 17 (0.35)**, median latency **110 days**, each with its corpus, its
  derivation, and its limits — including that 9 of the 17 episodes come from a
  single register.
- **Refuses to render an absence of alerts as health.** A test enumerates every
  state string and fails on "active", "healthy", "OK", "clear", "fine". The
  record says `no alert`, and says what that is worth.
- **Carries the caveat that follows from a 0.35 recall**, in the record rather
  than in a footnote: *"NO ALERT FROM US IS NOT EVIDENCE THAT A REGISTER IS
  ACTIVE... treat an alert from us as a prompt to look, and the absence of one
  as no information at all."* This is the only mitigation available for an error
  the customer structurally cannot observe.
- **Discloses the conflict.** *"A false alarm costs us a subscriber, and a miss
  costs us nothing and is invisible to you — so our commercial incentive runs
  toward tuning this watch to stay quiet."*
- **Names the per-source detectability the earlier mitigation asked for.**
  `FDA/openfda` calibrates to a 2060-day threshold — the p99 anchor *is* the
  maximum below 100 gaps — so it is listed under "sources this watch does not
  usefully cover" rather than sitting in the table reading `no alert` beside a
  last change months old.

**What this does not change.** The rubric measures disclosure and nothing else.
Held out, this detector still finds 6 of 17 dormancy episodes at a median 110
days, and pushing recall to 14 of 17 still costs ~43 nuisance alarm-days per
source-year. The 9 says a subscriber is now told that, not that the product is
good. The verdict stays **probe**, the floor stays `distribution` at 4, and the
reason this candidate is hard — fifty reachable buyers in one vertical — is
untouched.

## Amendment, 2026-08-24: step 2 of the first experiment, software half

**No score changed.** Probe and committed sample:
[`probes/source-silence-detector/change_alert.py`](../probes/source-silence-detector/change_alert.py),
[`sample-change-alert-2026-08-24.md`](../probes/source-silence-detector/sample-change-alert-2026-08-24.md).

Step 2 above — *"write the alert as it would be sent, with the source
link, and show it to ten staffing or credentialing people"* — has a
software half and a human half. The software half is built. The human
half is still the thing that decides, and it is still unrun.

What the alert does:

- Quotes one historical catalog addition, **CVE-2021-44228**, added to
  the CISA Known Exploited Vulnerabilities catalog on **2021-12-10**.
  The row is the live catalog's 2026.08.21 entry (the feed answered
  `200` this session); the committed fixture is a one-entry slice so
  CI stays offline.
- Puts the source document URL on every alert. A second link appears
  only when the register itself published one in `notes`. An NVD URL
  is never constructed from the CVE id.
- Leaves a missing catalog field as `unknown — register did not
  publish`. It will not invent whether the subscriber is affected,
  what they should do, or a score of anyone the record names.
- Labels `requiredAction` and `dueDate` as US-federal catalog text,
  not instructions to the subscriber.
- Refuses the words that would turn a quote into a warranty. Tests
  pin that `compliant` / `compliance` / `you are affected` do not
  appear.
- Discloses that change-detection accuracy is **not measured**. The
  6-of-17 (0.35) figure belongs to the silence detector, a different
  surface. Quoting it here would describe the wrong product.
- Names the error that would pay us: over-notifying, or dressing
  catalog text up as a finding about the subscriber.

What it does not do, and must not be read as doing:

- **It is not the licensing vertical.** Step 1 already established
  that licensing boards have no git mirror from here and their
  portals are egress-denied. This sample uses the software-security
  feed that *is* reachable, the same one the step-1 amendment said
  buyers already get free. The format is what step 2 asked for. The
  vertical is the one that can actually be quoted offline.
- **It does not show the alert to ten people.** Outreach is the
  human half of step 2, and step 3 (three pre-pays) still stands.
  Distribution remains 4 and remains the floor.
- **It does not move a score.** A product artifact is not a
  measurement of the dimension that decides this candidate.

Verdict stays **probe**. Do not re-initiate this slice. Do not open
a second change-alert pull request. The next specified work on this
candidate is the owner-gated buyer test, not another renderer.
