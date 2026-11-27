# Paid bets, ranked (2026-11-24)

Which paid products get effort, chosen by promise and value, not by how much
code already exists (owner, 2026-11-24: "we don't invest dev effort in sunken
ships. invest in things that have most promise and most value"). Customers are
small and medium businesses (SMBs), business tools are the first path to $10k
MRR, and construction is the owner's favourite vertical (`prompts/goals.md`,
"Where effort goes").

**How this was made.** Five web-research passes on 2026-11-24 covered 20
candidates. Every factual figure below has its source. Many prices come from
aggregators (Capterra, G2, GetApp, Toolradar) that disagree with each other and
with vendors, so **re-check a price on the vendor's page before pricing
against it.** Scores (1–5) and time-to-first-dollar figures are the
researchers' judgment, not measurements. Change the order with evidence in a
PR.

Scores: WTP = willingness to pay, Size = reachable buyers, Dist = distribution
without a sales team, Margin, Time = time to first dollar.

## The ranking

| # | Bet | Customer | WTP | Size | Dist | Margin | Time | Total | Where it is built |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Pay-app billing → contractor suite** | specialty subcontractors, small GCs | 4 | 5 | 4 | 5 | 4 | 22 | `ventures/payapps/apps/payapps` (moved from private-monorepo 2026-11-27) |
| 2 | **AI RFQ-to-quote for job shops** | CNC and fabrication shops | 5 | 3 | 3 | 4 | 4 | 19 | `ventures/jobshop-quote/apps/jobshop-quote` (moved 2026-11-27, PR #19594) |
| 3 | **E-invoice fix-and-explain** | DE/FR SMEs, their accountants, small invoicing vendors | 3 | 5 | 4 | 5 | 4 | 21 | `einvoice-preflight` imported to private |
| 4 | **CMMC L1/L2 + ISO 9001 workspace** | small defense/aerospace shops | 4 | 5 | 3 | 4 | 3 | 19 | new `private-monorepo/apps/cmmc` |
| 5 | **Reseller profit and Schedule C books** | multi-platform resellers | 4 | 4 | 5 | 4 | 4 | 21 | `ventures/seller-books/apps/seller-books` (moved 2026-11-27, PR #19618) |
| 6 | **Residential takeoff (roof, siding, framing lists from PDFs)** | remodelers, roofers, framers | 4 | 4 | 3 | 3 | 4 | 18 | `private-monorepo/apps/wall-framing-takeoff` |
| 7 | **Grant Autopilot** (live) | small nonprofits | 4 | 3 | 3 | 3 | 3 | 16 | `private-monorepo/apps/grants` |

Why this order rather than by total: #1, #2 and #4 are SMBs at $99–$300+ a
month in the owner's favourite verticals (construction, manufacturing), and #2
and #4 sell to the same machine shops. #3 has hard legal deadlines. #5 scores
well but the wedge price is $10–20 a month, so it needs many more customers per
dollar. #6 feeds the contractor suite later. #7 is already live, so finishing
its paid path is cheap.

**Not now** (no new effort; see the evidence below): freelancer tax and
books (14), small landlords and STR books (16), permit timeline prediction
(14), IFC/IDS model checking (14), P6/XER checking as a standalone bet (16,
low ceiling), DOT driver-file compliance (17, low prices), Peppol access-point
add-on (14, window closing), websites-as-a-service (18, distribution 2),
AI photo culling (16), multicam audio sync (15), AI-code quality analytics
(16, slow buyers), LLM qualitative coding (20, but academic and UX buyers, not
SMBs; revisit as a research-derived product).

## The evidence

Each bet's **Growth path** is a plan, not evidence: the topics a run opens
with `python3 platform/ci/roadmap_claim.py <app> --slug` when the ROADMAP's Next list has nothing
free. `roadmap_claim.py --bets` lists them with the claims already on each.

### 1. Pay-app billing for subcontractors, the wedge into a contractor suite

- **Job:** trade subs (electrical, mechanical, drywall, concrete) prepare
  monthly AIA G702/G703 pay applications, track retainage, chase lien waivers
  and change orders, and sync to QuickBooks, which has
  [no native retainage](https://getholdings.com/resources/guides/best-invoicing-software-contractors).
- **Prices:** PayAppHub [$39.99/$79.99/$129.99/mo](https://toolradar.com/tools/payapphub);
  Trimble Pay (Flashtract) [sub plan $99/mo](https://www.g2.com/products/flashtract/pricing);
  SubLien [from $199/mo](https://www.saasworthy.com/product/sublien/pricing);
  Siteline quote only, priced by pay-app volume ([Siteline](https://www.siteline.com/compare/procore)).
  Suites: JobTread [$199/mo + $20/user](https://jobtread.com/blog/jobtread-vs-buildertrend-construction-management-software-comparison),
  Contractor Foreman [$49–$332/mo](https://www.capterra.com/p/166113/Contractor-Foreman/pricing/),
  Knowify [from $99/mo](https://www.capterra.com/p/135791/Knowify/pricing/),
  Buildertrend about 2,485 Capterra reviews at 4.5 ([Capterra](https://www.capterra.com/p/70092/Buildertrend/)).
- **WTP:** Siteline raised [$18.4M](https://www.businesswire.com/news/home/20220224005099/en/Siteline-Raises-$18.4M-to-Reimagine-Construction-Finance).
- **Size:** NAHB: [1.9M+ specialty-trade independent contractors, 79% of
  specialty-trade establishments](https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/);
  Census County Business Patterns 2022: [510,803 specialty trade contractor
  employer establishments, NAICS 238](https://www2.census.gov/programs-surveys/cbp/datasets/2022/cbp22us.zip),
  461,711 of them under 20 employees (electrical, plumbing and HVAC, 2382,
  199,350; building finishing, 2383, 127,033; foundation, structure and
  exterior, 2381, 104,432); plus 251,634 building contractors (236). Read
  2026-11-27 with `python3 portfolio/smb/cbp_counts.py 238 2381 2382 2383 236`;
  `--by-state` ranks states (CA 52,631, FL 44,445, TX 34,243).
- **Distribution:** QuickBooks App Store; search ("AIA billing software",
  "G702 template"); free G702/G703 templates as the front door; trade
  associations.
- **Second wedge:** CoConstruct is being folded into Buildertrend, with
  [no new CoConstruct projects after 31 Mar 2027](https://coconstruct.com/migration).
- **Certified payroll, a paid add-on subs already buy:** standalone tools
  charge $49–$175/mo (PaidReady [$49/mo](https://www.getapp.com/all-software/a/paidready/),
  Certified Payroll WH-347 [$79/mo](https://www.saasworthy.com/product/certified-payroll-wh-347/pricing),
  Points North for ADP [$175/mo + $7.50/report](https://apps.adp.com/en-us/apps/253943/points-north-certified-payroll-reporting-for-run-powered-by-adp/configure));
  Miter (construction payroll) raised a [$40M Series B, Sep 2026](https://www.constructiondive.com/press-release/20260930-miter-the-ai-platform-for-construction-raises-40-million-for-the-built-w/).
  Davis-Bacon covers [$217B a year and 1.2M workers](https://www.federalregister.gov/documents/2023/08/23/2023-17221/updating-the-davis-bacon-and-related-acts-regulations),
  and NY (from 1 Jan 2026), NJ (Aug 2024), WA, IL and CA now want the
  payroll filed in a state system. Read 2026-11-27; detail and the state
  ranking in `docs/reports/2026-11-27-state-certified-payroll-filing-systems.md`.
- **Wedge:** pay apps + retainage + lien waivers + change orders at about
  $99–249/mo (estimate), growing into job costing, RFIs and estimating.
- **Growth path:** job costing, RFIs, estimating, subcontractor compliance
  documents, GC portal exports.
- **Risks:** Procore and Trimble hold the GC side and its portals; formats vary
  by GC; QuickBooks sync is needed from day one.

### 2. AI RFQ-to-quote for CNC and fabrication job shops

- **Job:** turn an RFQ (drawings, CAD, email) into a priced quote, often hours
  of an owner's or estimator's time.
- **Why now:** Forgepoint [$9.8M seed, self-reported seven-figure ARR in six
  months](https://thenextweb.com/news/forgepoint-9-8m-seed-ai-quoting-manufacturers-frank);
  CloudNC [$20M with a Quote Agent](https://thenextweb.com/news/cloudnc-20m-cam-assist-quote-agent);
  Uptool [$6M seed](https://pulse2.com/uptool-6-million-seed-funding-closed-for-helping-u-s-shops-quote-10x-faster/amp/).
- **Prices:** QuotedPart [$199/mo per shop](https://toolradar.com/tools/quotedpart);
  JobBOSS² [about $3,000/yr](https://softwareconnect.com/manufacturing-estimating-quoting);
  ProShop [$650–715/mo](https://www.g2.com/products/proshop/pricing);
  Paperless Parts raised [$30M Series B](https://www.businesswire.com/news/home/20210913005163/en/Paperless-Parts-Announces-30M-Series-B-Funding-Led-by-OpenView-Partners).
- **Size:** Census County Business Patterns 2022: [17,433 machine shop
  employer establishments, NAICS 332710](https://www2.census.gov/programs-surveys/cbp/datasets/2022/cbp22us.zip),
  14,619 under 20 employees (a third-party page said
  [20,138](https://www.naics.com/naics-code-description/?code=332710), year not
  stated). Fabricators add 3,430 structural (332312) and 4,605 sheet metal
  (332322) shops. Read 2026-11-27 with
  `python3 portfolio/smb/cbp_counts.py 332710 332312 332322`; top states CA
  2,257, TX 1,326, OH 1,141, MI 926, PA 925.
- **Distribution:** search ("machine shop quoting software"), Practical
  Machinist, r/Machinists, ERP integrations.
- **Wedge:** email or drawing in, priced quote out, learning each shop's rates,
  at about $199/mo. Ship narrow and soon: funded rivals are arriving.
- **Growth path:** quote follow-up and win rates, won quote to job traveler,
  QuickBooks invoicing, material price lists.
- **Launch:** the launch review OPERATOR.md asks for is done (2026-11-27,
  private-monorepo#482, `apps/jobshop-quote/docs/LAUNCH-REVIEW.md`): paid
  plans keep 42–53% at their full AI ceiling, the legal pages match the code,
  and the global AI cap is $30 a day for launch. An agent may now run
  `jobshop-quote-deploy` and open sign-ups (Actions runners permitting);
  checkout stays dark until Paddle verification. Bet #4 has its review (below) and #5 its own
  (`ventures/seller-books/apps/seller-books/docs/LAUNCH-REVIEW.md`); #3 has none yet.

### 3. E-invoice fix-and-explain

- **Deadlines:** Germany: issuing required for prior-year turnover above €800k
  from 1 Jan 2027, everyone from 1 Jan 2028 ([KPMG](https://kpmg.com/de/en/home/insights/2025/05/e-invoice-in-germany.html));
  France: SMEs and micro-businesses must issue from 1 Sep 2027, 7M+ businesses
  in scope ([economie.gouv.fr](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises));
  Poland KSeF phases through 1 Jan 2027 ([EY](https://www.ey.com/en_gl/technical/tax-alerts/poland-signs-into-law-mandatory-national-e-invoicing-system), 2025 source).
  Belgium is mostly connected already, [about 9 in 10 by Aug 2026](https://www.vrt.be/vrtnws/en/2026/08/03/9-out-of-10-businesses-connect-to-peppol-invoice-network/).
- **Readiness:** only [26% of German companies feel fully prepared](https://softco.com/blog/germany-e-invoicing-mandate-2026-update/).
- **Prices:** validation alone is free or cheap: Verax-Check [€15–49/mo](https://www.capterra.com/p/10043428/Verax-Check/),
  ecosio free validator with fixes "only for our customers" ([ecosio](https://ecosio.com/en/peppol-e-invoice-xml-document-validator/)).
- **Wedge:** not another validator. Each failed rule explained in plain
  German, French or Dutch, with a safely corrected file; a per-client plan for
  accountants at about €19–49/mo (estimate) and a metered API for small
  invoicing vendors.
- **Growth path:** accountant client dashboard, metered validation API,
  PDF to ZUGFeRD conversion, Polish KSeF.
- **Risks:** accounting software building it in; liability if a passed invoice
  is wrong (say exactly what was checked).

### 4. CMMC Level 1/2 + ISO 9001/AS9100 workspace

- **Why now:** CMMC Phase 1 [took effect 10 Nov 2025](https://meritalk.com/articles/dod-begins-rollout-of-cmmc-on-nov-10-heres-what-you-need-to-know/);
  Phase 2 [suspended 13 Jul 2026](https://smallgovcon.com/statutes-and-regulations/breakingdepartment-of-war-suspends-introduction-of-phase-two-of-cmmc/)
  but [L1/L2 self-assessments remain required](https://www.wiley.law/alert-DOD-Pauses-CMMC-2-0-Implementation-A-Big-Deal-with-Little-Immediate-Impact).
- **Size:** DoD estimates [337,968 affected contractors, 229,818 small](https://www.venable.com/insights/publications/2025/09/the-cybersecurity-maturity-model-certification-is).
- **Prices:** FutureFeed [$99/$399/mo](https://futurefeed.co/pricing); PreVeil Pass
  [$450/mo for 3 users](https://www.preveil.com/preveil-pass/); consultants charge
  [$3k–25k for the SSP and POA&M](https://secureframe.com/hub/cmmc/certification-cost).
- **Wedge:** SSP + POA&M + SPRS score for the 110 NIST SP 800-171 controls,
  for the same machine shops as #2.
- **Growth path:** evidence per control, policy templates, ISO 9001 document
  control, AS9100 additions, supplier flow-down.
- **Risks:** policy swings; never claim certification (not a C3PAO); customers
  expect strong handling of their documents.
- **Launch:** the launch review OPERATOR.md asks for is done (2026-11-27,
  `ventures/cmmc/apps/cmmc/docs/LAUNCH-REVIEW.md`): paid plans keep 59–69% at
  a re-derived worst case (20k tokens in per draft, Opus prices), the legal
  pages now cover ISO 9001 and computed dates and match the code, and a
  service-wide AI cap of $1.50 a day keeps the free plan inside the venture's
  $50 budget. The deploy waits only on porting `cmmc-deploy` here
  (`ventures/cmmc/DEPLOY.md`); checkout stays dark until Paddle verification.

### 5. Reseller profit and Schedule C books

- **Prices:** A2X [$29/mo per channel](https://www.g2.com/products/a2x/pricing), 318 G2 reviews at 4.9
  ([G2](https://www.g2.com/products/a2x)); Seller Ledger [$10/$20/$50/mo](https://apps.shopify.com/seller-ledger);
  Link My Books [about $21–136/mo](https://www.capterra.com/p/184768/Link-My-Books/pricing/).
- **Size:** Etsy 5.6M active sellers, Depop 3.2M at end of 2025 ([Etsy Q4 2025](https://investors.etsy.com/_assets/_fea57334fe81a735b34cf3bf4bdcb553/etsy/db/938/10062/earnings_release/Exhibit+99.1+12.31.2025.pdf));
  r/Flipping about [500K members](https://thehiveindex.com/communities/r-flipping/).
- **Wedge:** payout CSVs from eBay, Poshmark, Mercari, Whatnot and Depop in;
  fees split out, cost of goods and mileage tracked, a Schedule C-ready P&L out.
  No bank feed needed, so no Plaid minimum.
- **Growth path:** inventory and cost of goods, mileage log, quarterly
  estimated tax, more sales platforms.
- **Do not market on 1099-K fear:** the federal threshold is back at
  [$20,000 and 200 transactions](https://irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000)
  (some states are lower).

### 6. Residential takeoff

- **Prices:** Togal.AI [$249.99–299.99/mo](https://togal.ai/en-au/pricing-licenses);
  Handoff [from $149/mo](https://www.capterra.com/p/10026318/Handoff/pricing/);
  Buildxact [about $199/mo](https://www.softwareadvice.com/ca/construction/buildxact-profile/);
  roof reports [about $13–38 each](https://www.capterra.com/p/174071/RoofSnap/).
- **Size:** [128,187 residential remodeler establishments (2022)](https://eyeonhousing.org/2025/07/residential-remodelers-outnumber-single-family-builders-in-the-u-s/).
- **Wedge:** a roofing/siding or framing material list from a PDF plan set.
  Crowded and well funded; becomes the estimating module of #1.
- **Growth path:** waste factors, supplier price lists, siding lists,
  hand-off to estimating in #1.

### 7. Grant Autopilot

- Live at `marisstella.app/grants`. Instrumentl [$299–999/mo, 4,500+ customers, $55M raised](https://www.summitpartners.com/news/instrumentl-raises-55m-from-summit-partners-to-accelerate-their-ai-grant-fundraising-platform);
  reviewers call it "pricey, especially for small nonprofits"
  ([Capterra](https://www.capterra.com/p/233384/Instrumentl/reviews/)). Low end crowded
  ($29–89 AI writers). Finish the paid path; no large new build.
- **Growth path:** checkout and plan limits, deadline reminders, report
  drafting.

### Evidence for "not now" (short)

- **Freelancers:** QuickBooks Solopreneur [$0–20](https://nerdwallet.com/business/software/learn/quickbooks-pricing),
  needs Plaid, search owned by incumbents.
- **Landlords:** Stessa and Baselane free tiers anchor price ([Landlord Studio](https://www.landlordstudio.com/blog/baselane-vs-stessa)).
- **Permit prediction:** money flows to done-for-you services (PermitFlow [$91M raised](https://www.cbinsights.com/company/permitflow/financials)), not prediction.
- **IFC/IDS:** free ifctester and €15–69 add-ins ([Autodesk Marketplace](https://marketplace.autodesk.com/apps/586f7e37-09c5-4f1e-bfbd-41c79d63c409)).
- **P6 checker:** about 2k companies use P6 ([Landbase](https://data.landbase.com/technology/oracle-primavera-p6/));
  Steelray [$990/user/yr](https://steelray.com/AnalyzerP6/AnalyzerForP6.php). Fine as a module of #1, not a bet.
- **Websites-as-a-service:** B12 [$199–399/mo](https://support.b12.io/en/b12-website-subscription-plans-and-pricing),
  but buyers rarely search for it; it is a sales motion.
- **Photo culling:** Aftershoot [nearly 250,000 photographers](https://www.slrlounge.com/aftershoot-new-campaign-2026/), prices falling to about $10/mo.
- **Multicam sync:** free in DaVinci Resolve; PluralEyes [ended support 2024](https://support.maxon.net/hc/en-us/articles/7389361453340).
- **Qualitative coding:** strong (Dovetail [$63M raised](https://techcrunch.com/?p=2259520)), but not SMB buyers.

- **Screened 2026-11-27, not ranked:** *Practice management for small
  architecture and engineering firms* (time, billing, project budgets): real
  WTP (Monograph [about $25–55/user/mo](https://www.cloudwards.net/monograph-review/),
  Capterra [from $60/user/mo](https://www.capterra.com/p/178124/Monograph/reviews/Capterra___3424150/);
  BQE Core quote-only), but crowded (Monograph, BQE, Deltek Ajera) and no
  wedge we hold that rivals lack; Census counts could not be read from the
  session. *Safety programs for small contractors* (toolbox talks,
  inspections): SafetyCulture has a free tier and paid plans around
  [$24/user/mo](https://safetyculture.com/apps/construction-safety-software),
  so prices are anchored low; better as a module of #1 (daily reports
  already exist) than a bet.

## Hardware (long term, not a ranked bet)

Open hardware becomes outsourced hardware companies over a long horizon
(`prompts/goals.md`, "Where effort goes"). Nothing has been physically built
yet. First step is paper-only: a sourced BOM, unit cost at 10/100/1,000 and a
certification gap list for the lowest-risk design. Every purchase is the
owner's.
