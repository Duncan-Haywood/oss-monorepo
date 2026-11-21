# Suites for small businesses, nonprofits and parishes

**The main theme since 2026-11-21.** The owner, that day:

> "I want to move a lot of the dev work towards for-profit tools for small and
> medium businesses ... full working businesses, solving the most common
> problems for small and medium businesses, all sorts of domains. ... The SaaS
> products, basically at cost plus, like full suites of tools for all of the
> most common problems that small and medium businesses have. Also for
> nonprofits like parishes, especially Catholic charities ... very thorough,
> very high-quality tools ... I want to move like probably 60 to 70% of the
> effort there as a broad theme. ... Hyper niche tools, very specialized for
> very specific businesses ... solving all of them basically in order of most
> value delivered. Ideally, connecting to revenue generating activities,
> either for charities, for grants and donations and whatnot, or for
> businesses, things that generate revenue, generally speaking, and then
> secondarily for cost reducing things, because those are the things that
> tend to pay best."

This file is the programme: what to build, in what order, how it is priced and
how we learn what businesses actually need. The queue of suites, with each
one's next milestone, is [`suites.yaml`](suites.yaml). The `smb` routing track
carries about 60% of runs (`prompts/routing.json`); its sub-prompt is
`prompts/smb/prompt-0.md`.

## The ordering rule

1. **Revenue first.** Work that brings money in for the customer: more leads
   answered, more quotes won, invoices paid sooner, lapsed customers or donors
   brought back, grants found and won, recurring gifts kept.
2. **Then cost.** Hours saved on the books, payroll prep, scheduling,
   compliance, and money not overpaid to vendors, banks, carriers.
3. **Then everything else** (record-keeping, reporting) only where it is the
   thing standing between the customer and 1 or 2, or where a rule or funder
   requires it.

Within a tier, rank by (how many customers have it) × (money moved per
customer) ÷ (build effort), and prefer a suite we can deepen over a new one.
The ranking below is a first cut by reasoning about how an ordinary firm runs.
It is **not yet checked against survey data**: the first research slice in
`suites.yaml` replaces it with numbers fetched from public sources (see
"Learning what they need").

## The common problems, as suites

A suite is one product a business can run end to end, made of modules each
useful alone. Horizontal suites serve any small firm; vertical editions
package them with the words, rules and workflows of one trade. Hyper-niche
editions are the point (the owner: "very specialized for very specific
businesses"): a plumbing shop and a dental practice both send invoices, but
win work and lose money in different places.

### Businesses: revenue

| Suite | Modules | Why it pays |
|---|---|---|
| **Lead to booked job** | web and phone lead capture, speed-to-lead follow-up, missed-call text-back drafts, online booking, quote builder with good/better/best options, quote follow-up sequence, win/loss reasons | Unanswered leads and unfollowed quotes are revenue already paid for in marketing. |
| **Get paid** | invoices, deposits, payment reminders, AR ageing and a collections ladder, card/ACH fee comparison, e-invoice preflight | Days sales outstanding is cash the owner already earned. Builds on `einvoice-preflight` and the invoice ventures. |
| **Repeat and referral** | customer list hygiene, reactivation campaigns, maintenance plans and memberships, review requests to real customers only, referral tracking | Selling again to a past customer costs far less than finding a new one. |
| **Found locally** | site builder, Google Business Profile checklist, local SEO pages, citations audit | Builds on `local-site-studio` and the polish track's site work. |
| **Sales agent** | the SDR agent in `ventures/sales-agent/`, drafting only | Already a flagship; becomes this suite's outbound engine. |

### Businesses: cost

| Suite | Modules | Why it pays |
|---|---|---|
| **Books and tax** | bookkeeping, bank reconciliation, sales tax, 1099s, payroll prep, year-end packet | `ai-bookkeeper` is the engine; the 1099 and sales-tax ventures are modules. |
| **People and hours** | shift rosters, time-off, overtime and labour-law checks, onboarding checklists | `shift-roster-builder` is the engine. |
| **Spend** | vendor bill audit (3PL, telecom, card processing, insurance renewals), subscription cleanup, inventory reorder points | Money found in bills is pure margin. |
| **Compliance calendar** | licences, permits, filings, insurance certificates, safety training due dates | A missed renewal is a fine or a lost job. |

### Nonprofits: revenue (grants and donations)

| Suite | Modules | Why it pays |
|---|---|---|
| **Donor CRM and retention** | donor records, giving history, retention and lapsed-donor reports, thank-you and acknowledgment letters with the receipt language the IRS requires, recurring-gift upkeep, year-end statements | Keeping a donor is cheaper than finding one. Builds on `donor-retention-analyzer` and `donor-acknowledgment-letter-generator`. |
| **Grants** | funder prospect lists from public 990 data, deadline pipeline, proposal workspace with reusable boilerplate, budget and indirect-cost builder, post-award reporting tracker | Builds on `grant-deadline-tracker`, `grant-reporting-tracker`, `grant-indirect-cost-calculator`. |
| **Campaigns and events** | annual appeal, capital campaign gift tables, event P&L, peer-to-peer pages that link to the org's own processor | `fundraising-event-net-calculator` is a start. |

### Parishes and Catholic charities

| Suite | Modules | Why it pays |
|---|---|---|
| **Parish office** (`ventures/parish-office/`) | Mass intentions (landed), two-counter Sunday collection sheet, offertory and stewardship reports, sacramental registers, faith-formation registration and fees, volunteer and minister schedules, safe-environment training expiry tracking, diocesan assessment worksheet, bulletin and calendar | Offertory and stewardship are the parish's revenue; the rest is the secretary's week. Roadmap: [`ventures/parish-office/ROADMAP.md`](../../ventures/parish-office/ROADMAP.md). |
| **Charities agency** (new) | client intake and eligibility, case notes, service and visit logs, food-pantry inventory and distribution counts, funder report builder (outputs by programme, unduplicated clients), volunteer hours as in-kind | Agencies live on grants and contracts that pay on reported outputs; reporting is their revenue step. Client data is sensitive: local-first, nothing uploaded, by design. |
| **Community websites** (`ventures/monastery-site/`) | sites for religious communities with giving, vocations and events | Already in progress. |

## Build bar

The general bar still holds (`AGENTS.md`, `PRODUCT_PLAYBOOK.md`, "Depth over
calculators"): a suite is a product a person would estimate at hundreds of
hours, built one working module per run. What changes is the **destination**:

- **A working business, not a demo.** Each suite aims at a state where a firm
  could run that part of its operation on it: import from the spreadsheet or
  tool they use now, export back out, work offline, and survive a year of real
  data.
- **One data model per suite.** Modules share records (a customer, a donor, a
  job) instead of each tool asking for its own CSV.
- **Compose before writing.** There are about 1,400 ventures; many are a
  module of one of these suites already (on 2026-11-21, by folder name: 28
  invoice or collections tools, 27 booking or scheduling, 24 sales, leads or
  email, 16 books, payroll or tax, 12 for nonprofits and religious
  communities). `python3 portfolio/pipeline/duplicate_check.py "<niche>"`
  before starting anything new.
- **Revenue-touching features are measured.** Where a module claims it brings
  money in (reminders shorten payment time, reactivation brings customers
  back), the claim waits for a measurement, and the page says so until then.
- **Disclaimer and usage tracking** on every user-facing page, as always.

## Pricing: cost plus

The owner asks for SaaS at cost plus. The default that fits the existing
guardrails (`prompts/goals.md`, "Payments" and "For profit, without blocking
work"):

- **The code stays MIT and self-deployable.** Anyone can run a suite free on
  their own accounts. That remains the zero-liability path.
- **A hosted plan is the paid product**, sold through the owner's merchant of
  record at the measured cost of serving one customer plus a stated margin.
  Each suite keeps a `COSTS.md` with the per-customer bill (compute, storage,
  email or SMS sends, support time) from the provider's published prices,
  fetched in the run that writes it, and the price that results.
- **It ships dark.** Until the owner sets a checkout link, the paid path
  renders the free path and nothing waits on it.
- **Hosting other people's customer data is an owner decision.** Running the
  hosted plan makes the owner the operator and data processor for those firms,
  with the obligations that brings (privacy policy, data-processing terms,
  breach duties; HIPAA for anything clinical). That decision is the
  owner's (asked in the 2026-11-21 session that set this theme); until it is
  made, suites are built so they
  *can* be hosted (multi-tenant data model, per-tenant cost meter) without
  anyone hosting them. Never store real client, donor or patient data in this
  repository or a session.

## Learning what they need

Two routes, used together.

**Desk research (agents, every run).** Most of the problem map is knowable:
how an average firm in a trade wins work, gets paid and spends its week.
Sources to fetch and cite, not quote from memory: the US Census Bureau's
Annual Business Survey and County Business Patterns (how many firms of each
kind, by size), the SBA Office of Advocacy small-business profiles, the NFIB
"Small Business Problems and Priorities" survey, the Federal Reserve's Small
Business Credit Survey, IRS Form 990 data for nonprofits (revenue mix,
programme spend), and trade-association benchmarks where public. A suite's
`RESEARCH.md` records what was fetched and what it changed in the ranking.

**Talking to real businesses (the owner sends; agents prepare).** Outreach to
find real problems is welcome where the law allows it, and every message
leaves through a person, never unattended (`goals.md`, owner-only actions).
What agents do: build the target list from public sources, write the one-to-one
message and the call script, and record the answers in the suite's
`DISCOVERY.md`. The rules each draft follows, to be confirmed against the
official text in the run that writes the script:

- **Email (US):** CAN-SPAM (15 U.S.C. 7701 ff.; 16 CFR Part 316) allows
  commercial email to businesses without prior consent but requires a
  truthful sender and subject, a postal address, a working opt-out honoured
  within ten business days, and no harvested addresses. Canada's CASL and the
  EU/UK rules (GDPR, PECR) are stricter: no cold email there without a
  consent basis checked for that country.
- **Calls (US):** the TCPA (47 U.S.C. 227; 47 CFR 64.1200) restricts
  autodialled and prerecorded calls and texts, especially to mobile numbers,
  and state rules add their own. A person dialling a business's published
  landline by hand is the conservative default; no robocalls, no autodialled
  texts, and honour every do-not-call request.
- **Always:** say who we are and why, no fake familiarity or invented
  referrals, no claims a file cannot back, and a free useful thing in the
  message (an audit of their own site, a working tool) rather than a pitch.
- **Website requests are already discovery.** The free custom dev shop
  (`portfolio/requests/`) is how businesses tell us their problem unprompted;
  a request from an SMB or nonprofit is the top of this track's queue.

## What does not change

The hard limits in `prompts/goals.md` hold: never fabricate (no invented
customers, case studies, testimonials or revenue figures), honest marketing,
public-repository rules, MIT licensing, payments through the owner's merchant
of record only, owner-only actions stay with the owner, and no tool that could
plausibly harm its user. Tax, legal and employment modules carry the
disclaimer and quote rules from official text fetched in the run.
