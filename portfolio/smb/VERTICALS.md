# What regional small businesses struggle with, trade by trade

A reading of [`verticals.yaml`](verticals.yaml) for the cost-plus offer in
[`OFFER.md`](OFFER.md). The YAML holds 18 regional verticals with 114 pain
points, 73 compliance rules and 72 incumbent products. Each has a URL, and the
8 rows nobody could source are listed under `unsourced`.
`python3 portfolio/smb/cost_plus.py --check` keeps it that way.

## How sure this is

Three web-research passes made it on 2026-11-24. **No page was opened.** Every
quote, figure and price was read from search-result summaries of the linked
page, because this session's network could not fetch the sites themselves.
Many sources are vendors (tagged `[vendor]`), competitors (`[competitor]`) or
secondhand (`[secondhand]`, `[snippet]`), and several prices conflict
(`[conflict]`). No owner forum thread (Reddit, ContractorTalk and the like)
came back from search, so the owner's own voice reaches us only through trade
press polls and surveys. Treat this as a map for choosing where to look
harder. Before any figure goes on a page, open the source and check it.

## Five things nearly every vertical shares

1. **Labour is the top pain, and software can't fix it.** It ranks first or
   second in 14 of 18 verticals (not in PT/chiro, fitness, property managers or craft beverage). A few readings:
   - 48% of pest operators, PCT's 2025 poll;
   - 63% of commercial cleaners;
   - 96% of restaurants citing labour, National Restaurant Association;
   - the technician shortage as the top concern for 55% of auto shops;
   - hygienists for dentists and technicians for vets.

   A suite can't hire anyone. It can stop wasting the staff a shop already
   has. So the first modules aim at the pain ranked just below it.
2. **Costs rise faster than prices.** Materials, chemicals, food, insurance,
   aluminium. This shows up everywhere. It makes owners price-sensitive about
   software, and that is the opening for a cost-plus price.
3. **The front desk is overloaded:** missed calls, after-hours calls,
   insurance checks, subsidy and food-programme claims, and getting
   authorisation for a repair. This is the most software-solvable pain on the
   list, and it looks alike across trades.
4. **Every vertical keeps records a rule requires.** These are logs, not
   judgement calls:
   - refrigerant leak-repair records under the AIM Act (equipment with
     15 lb or more, from 1 January 2026);
   - state pesticide-use records;
   - DEA controlled-substance inventories;
   - CACFP meal counts and attendance;
   - TTB operations reports;
   - three-way trust reconciliations;
   - the FTC Funeral Rule price list;
   - FMCSA household-goods estimates;
   - auto repair estimate and authorisation laws;
   - cosmetology disinfection logs.

   One records engine (fields, reminders, a printable or filed report) can
   serve all of them. That engine is also why a shop keeps paying: the
   record must be kept whatever else it buys.
5. **The firms are tiny.** IBISWorld averages run from 1.3 employees for pool
   service to 6 for plumbing. The National Restaurant Association counts 7 in
   10 restaurants as single-unit. That favours tools an owner sets up alone,
   on a phone, in an afternoon.

## One core, many suites

The modules repeat across trades, so the build is one core with a trade layer
on top:

| Core module | Verticals that asked for it first or second | Free tools already here to start from |
|---|---|---|
| Call capture, online booking, missed-call text-back | HVAC, vet, salons, property managers (after-hours), funeral homes, movers | `missed-call-textback` |
| Estimate → authorisation → invoice → payment and dunning | HVAC, auto repair, movers, landscaping, fitness, childcare tuition | `estimate-maker`, `invoice-maker`, `late-invoice-collections-kit`, `quote-follow-up-timing` |
| Compliance records engine | all 18 | per trade, below |
| Recurring routes and proof of service (photos, readings, GPS) | pest, pool, lawn, cleaning | `pool-service-route-calculator`, `crew-dispatch-optimizer` |
| Staff schedule, time clock, no-show alerts | cleaning, restaurants, salons, childcare ratios | `shift-roster-builder` |
| Books | all | `ai-bookkeeper` |

That shape is what makes cost-plus pay. The core's build and upkeep are
shared by every shop in every vertical. Each new trade adds only its own
records, forms and vocabulary.

## Which verticals first

Ranked on `OFFER.md`'s rules, in this order: a recurring pain with evidence;
a record the business must keep; an incumbent price that cost-plus can beat,
or an incumbent that is quote-only for small shops; reachable shops; and free
tools here to reuse. This is a judgement on the evidence above, not a
measurement.

**Wave 1** (modelled in [`cost_basis.yaml`](cost_basis.yaml)):

| Vertical | First module | The record that keeps them | Incumbent price read | Front door here |
|---|---|---|---|---|
| HVAC, plumbing, electrical | Call capture and booking | AIM Act leak repair (40 CFR 84), Section 608 disposal | Housecall Pro $59–$329/mo; ServiceTitan quote-only | `hvac-maintenance-contract-calculator`, `hvac-repair-tier-price-calculator` |
| Pest control | Chemical-use log in each state's format | State use records (e.g. 4 Tex. Admin. Code 7.144), 40 CFR 171 | GorillaDesk $49–$299/mo; PestPac, FieldRoutes, Briostack quote-only | `pest-control-bid-calculator` |
| Craft breweries, wineries, distilleries | Inventory ledger that drafts the TTB reports | TTB F 5130.9 / 5130.26, 5120.17, excise returns | BrewERP $29–$149/mo; Ekos quote-only | `brewery-excise-tax-calculator`, `craft-brewery-batch-margin-calculator` |
| Property managers, 20–500 doors | Maintenance triage with owner approval limits | Monthly three-way trust reconciliation; deposit deadlines | DoorLoop $2.50/unit with a $199/mo minimum; AppFolio about a 50-unit minimum | `rental-ledger`, `security-deposit-return-calculator`, `tenant-security-deposit-deadline-checker` |

The property-manager row has the clearest cost-plus story. The incumbents'
minimums price out exactly the small regional manager this offer is for.

**Wave 2:**
- **Auto repair:** state written-estimate and authorisation laws. Tekmetric
  starts at $179–$199/mo. Front door: `auto-repair-effective-labor-rate`.
- **Childcare centres and home daycares:** CACFP records, ratios and
  subsidy billing. The incumbents are mostly quote-only. Children's records
  need careful hosting.
- **Funeral homes:** the FTC General Price List and death-certificate
  tracking. Passare is quote-only. Front door: `funeral-price-list-checker`.
- **Local movers:** FMCSA household-goods estimates. SmartMoving is about
  $399/mo. Front door: `moving-bid-calculator`.
- **Roofing:** an insurance-claim and supplement workspace. AccuLynx and
  JobNimbus are quote-only.

**Wave 3, harder or more crowded:**
- **Dental and PT/chiro:** patient health data needs HIPAA hosting and a BAA
  with every vendor, so they wait on an owner account.
- **Vets:** a PIMS replacement is a large build, though ezyVet lists
  $260.50 per user.
- **Restaurants:** Toast and Square dominate the POS.
- **Salons, fitness and cleaning:** incumbents already sell at $19–$99/mo.
- **Landscaping:** Jobber is cheap and general.

Here the offer is a single module that fills a gap, such as dental
insurance-desk work, deposits and no-show protection for salons, or
compliant cancellation for gyms. A whole suite is not the offer there.

## What the cost basis says (placeholders, not measurements)

`python3 portfolio/smb/cost_plus.py` on the committed basis, with every
labour and volume figure marked `assumption`. The arithmetic matters, not the
dollars:

- **Support time decides the price, not compute.** Half an hour of support a
  month is about 90% of a trade shop's variable cost under these
  placeholders. Model tokens and hosting come to $3–6 a shop. So the margin
  lever is self-serve onboarding and support that answers itself, not a
  cheaper model.
- **At the planned shop counts (40–50 a vertical), the four wave-1 suites
  come to a few thousand dollars of profit a month together.** Reaching $10k
  takes 124–200 shops a vertical at the planned price. If the price is cut
  every time shops join, profit per shop falls with it. So the price is held
  at the planned count, and later savings go into the shared core and the
  next vertical. `OFFER.md` says the same.
- Each wave-1 price at plan, about $100–$185 a month, sits inside the
  incumbents' published ranges, not far below them. "Close to cost" beats the
  quote-only and minimum-spend vendors clearly. Against the cheap published
  tiers it wins on trade-specific records, not on price.

## Gaps to close before selling

- Open each cited page and confirm it. Fetches failed in this session, so
  every row is unconfirmed.
- Current Census County Business Patterns counts by NAICS code and county
  (api.census.gov was not reachable). Regional selling needs county-level
  counts.
- Owner voice: forum threads and interviews. None was found by search.
- Prices for MaidCentral, Orchestrated Beer, Tribute, Caterease, PartsTech
  and Brightwheel for centres.
- Trucking hours-of-service/ELD, IFTA and Clearinghouse rules. The research
  budget ran out before these.
- The `unsourced` rows in `verticals.yaml`.
