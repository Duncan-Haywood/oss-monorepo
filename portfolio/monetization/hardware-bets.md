# Hardware bets, ranked (2026-11-24)

Which hardware companies the portfolio should consider building, chosen by
market evidence, not by how much open design already sits in this repository
(owner, 2026-11-24: open hardware becomes long-term **outsourced** hardware
companies; invest by promise and value, not sunk cost; SMB customers
preferred; construction a favourite). The software bets and the scoring method
are in [`bets.md`](https://github.com/Duncan-Haywood/oss-monorepo/pull/18675) (PR #18675, not yet merged); this file uses the same method plus one more
column, because hardware carries a certification and safety burden that
software does not.

**How this was made.** Three web-research passes on 2026-11-24 covered 20
candidates: the repo's open designs (`ventures/open-tennis-robots`,
`open-floor-robots`, `open-robot-mower`, `open-house-plans`, the
`research/buildbot-*`, `osrobot-*`, `marine-*` and `heavy-hydraulics`
programmes) and hardware ideas not in the repository aimed at construction
sites and small manufacturers. **Every market figure has its URL; all were
accessed 2026-11-24 and, unless marked otherwise, were read from search-result
text, not from the opened page** (the proxy refused several hosts, including
`census.gov`). Re-check a figure on its page before pricing against it or
quoting it publicly. Everything marked *estimate* (all BOM, margin, cash and
time figures) is the researchers' judgment, not a measurement. Nobody was
contacted and nothing was bought. Change the order with evidence in a PR.

Scores (1–5, higher is better): WTP = willingness to pay, Size = reachable SMB
buyers, Dist = distribution without a sales team or dealer network, Margin,
Time = time and cash to first dollar, Cert = certification and safety burden
(5 = light: FCC Part 15 on a pre-certified module; 1 = machine-safety
standards, aviation or marine rules).

## The ranking

| # | Hardware company | Customer | WTP | Size | Dist | Margin | Time | Cert | Total /30 | In repo? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Concrete maturity sensors + pour app** | concrete subs, small GCs | 4 | 3 | 3 | 5 | 4 | 5 | **24** | no |
| 2 | **Retrofit machine monitoring for job shops** | CNC and fab shops under 100 staff | 4 | 3 | 3 | 5 | 4 | 4 | **23** | no |
| 3 | Solar LTE jobsite camera at $99–199/mo | remodelers, small GCs | 4 | 4 | 3 | 3 | 4 | 3 | 21 | no |
| 4 | Leak and temperature/humidity kit for buildings under construction | GCs, builders' risk insurers | 3 | 3 | 3 | 4 | 4 | 4 | 21 | no |
| 5 | Wireless vibration sensors for small plants | plant maintenance | 3 | 4 | 2 | 4 | 3 | 5 | 21 | no |
| 6 | Brand-agnostic tool tracking | trades, GCs | 2 | 5 | 3 | 2 | 4 | 4 | 20 | no |
| 7 | 2D indicate-only grade kit for mini excavators | excavation, site-prep, landscapers | 4 | 4 | 2 | 4 | 2 | 3 | 19 | near `heavy-hydraulics` |
| 8 | Tennis ball machine + pickup rover | clubs, coaches | 3 | 2 | 3 | 3 | 3 | 4 | 18 | `open-tennis-robots` |
| 9 | Compressed-air leak / energy submetering | small plants | 3 | 4 | 2 | 3 | 3 | 2 | 17 | no |
| 10 | Vision inspection kit | repetitive-part plants | 3 | 3 | 2 | 3 | 2 | 4 | 17 | no |
| 11 | Commercial RTK robot mower | landscapers, sports fields, solar O&M | 4 | 4 | 2 | 3 | 1 | 2 | 16 | `open-robot-mower` |
| 12 | Commercial floor-cleaning robot | janitorial contractors, offices | 3 | 4 | 2 | 2 | 1 | 2 | 14 | `open-floor-robots` |
| 13 | Excavator autonomy / remote retrofit | earthworks contractors | 4 | 3 | 1 | 3 | 1 | 1 | 13 | `heavy-hydraulics` (research) |
| 14 | Layout robot | large GCs, drywall/MEP subs | 4 | 2 | 1 | 2 | 1 | 2 | 12 | no |
| 15 | Cobot machine-tending cell | job shops | 4 | 3 | 2 | 1 | 1 | 1 | 12 | no |
| 16 | Small survey USV / docking assist | survey firms, marinas | 2 | 1 | 2 | 3 | 2 | 2 | 12 | `marine-*` (research) |
| 17 | Weeding robot / spray drone | specialty growers, spray services | 3 | 3 | 2 | 2 | 1 | 1 | 12 | `osrobot-field`, `osrobot-uav` (research) |
| — | Framing/sheathing robots | framers, panel shops | — | — | — | — | — | — | not scored | `buildbot-*` (research) |
| — | House plans | — | — | — | — | — | — | — | not hardware | `open-house-plans` |

**Recommendation: the top 2 are #1 concrete maturity sensors and #2 retrofit
machine monitoring.** Both are small, battery- or clamp-powered radios (FCC
Part 15 on a pre-certified module, nothing that moves), cheap to build
(*estimate*: BOM $5–80 a unit) against prices buyers already pay ($35–300 a
sensor; $50–150 a machine a month), and both are mostly **software
businesses with a sensor attached**, which is what an agent-run company can
actually do well. Each lands on the same customers as a software bet already
ranked in [`bets.md`](https://github.com/Duncan-Haywood/oss-monorepo/pull/18675) (PR #18675, not yet merged): concrete subs are trade subs for the pay-app
contractor suite (#1 there); job shops are the buyers of RFQ-to-quote (#2) and
the CMMC workspace (#4). So a sensor is a second product to the same
account, not a new market to find.

Why the repo's own designs rank low: robots that move under their own power
near people (mowers, floor scrubbers, excavators, cobots, drones, boats) carry
machine-safety standards, field service and capital needs, and each market has
funded leaders selling at scale or a graveyard of funded failures. That is the
opposite of an outsourced, agent-run company's strengths. They stay as open
designs and research; none should get product effort on these numbers.

## Cross-cutting facts

- **US construction:** 814,557 establishments with paid employees in 2023 (NAICS 23),
  521,315 of them specialty trades (NAICS 238), from a third party quoting
  Census CBP: <https://naicscodes.org/subsector/238-specialty-trade-contractors/>.
  CBP 2023 release: <https://www.census.gov/newsroom/press-releases/2025/2023-county-business-patterns.html> (2025-06-26).
- **US manufacturing:** 284,452 establishments in 2023, 194,583 (68.4%) with
  fewer than 20 employees, from a third-party CBP summary:
  <https://manufacturingleadgeneration.com/manufacturing-establishment-size-statistics/>.
  Machine shops (NAICS 332710): 17,156 establishments, 223,313 employees (CBP 2023, third party):
  <https://vantainsights.com/industry/332710-machine-shops>.
- **Certification costs:** FCC certification with a pre-certified radio module
  $4,900–10,000; a Bluetooth unlicensed transmitter $7,900–12,000:
  <https://compliancetesting.com/fcc-certification-faqs/fcc-certification-cost/>;
  another estimate $3k–8k: <https://predictabledesigns.com/certification-costs-what-it-really-takes/>.
  Cellular (PTCRB) $20k–50k over 4–8 weeks, much less on a pre-certified
  module: <https://www.emnify.com/blog/ptcrb>. Bluetooth SIG qualification is
  a separate fee.
- **EU:** the Machinery Regulation 2023/1230 applies from 20 Jan 2027 and
  explicitly covers autonomous mobile machinery and its cybersecurity:
  <https://osha.europa.eu/en/legislation/directive/regulation-20231230eu-machinery>.
  It weighs on every moving robot below.

## The evidence

### 1. Concrete maturity sensors + pour app (top pick)

- **Who buys:** poured-concrete subs (NAICS 238110: about 23,350 establishments,
  272,692 employees, CBP 2023 via <https://vantainsights.com/industry/238110-poured-concrete-foundation-structure-contractors>;
  FirstResearch says about 20,000 and $53B revenue, updated Dec 2025:
  <https://firstresearch.com/Industry-Research/Poured-Concrete-Foundation-and-Structure-Contractors.html>),
  GCs, ready-mix producers, testing labs. The job: know when a slab or wall
  has the strength to strip forms, post-tension or load, instead of waiting
  for break tests.
- **What they pay today:**
  - DeWalt Signal sensor (DCE091, Converge ConcreteDNA): $99 sale, $162.15 list:
    <https://toolup.com/products/dewalt-dce091-concrete-signal-sensor-w-connector>.
  - Converge UK averages £99 per measurement point: <https://www.converge.io/concretedna-subscriptiona>.
  - Giatec SmartRock Long-Range 10-pack $3,079.80 (about $308 a sensor) at a reseller:
    <https://certifiedmtp.com/giatec-smartrock-long-range-wireless-concrete-monitor-sensors-1ft>.
  - COMMAND Center sensors "start at $35", free app; reader module $248.98:
    <https://forconstructionpros.com/video/11575143/video-command-center-concrete-temperature-and-maturity-meters>,
    <https://certifiedmtp.com/command-center-sensor-reader-module>.
  - Maturix: SaaS per transmitting device, 4G data about $15/month:
    <https://actech.com.au/?p=556514> (undated).
- **Market moves:** Hilti's concrete-sensor line moved to Concrete Sensors, Inc.
  on 2026-03-31, Hilti support ending October 2026:
  <https://www.hilti.ca/content/resources/faqs/local/support-concretesensors>,
  which leaves Hilti users looking. Converge raised $22.64M on 2025-05-21
  (about $41M total) and Giatec took a Sika corporate round on 2025-06-04
  (CB Insights): <https://www.cbinsights.com/compare/concrete-sensors-vs-converge>,
  <https://www.cbinsights.com/company/giatec-scientific/financials>.
  Market size: about $0.3B globally in 2025 per a low-quality aggregator
  (<https://marketintelo.com/report/concrete-maturity-sensors-market>); treat it as a hint only.
- **Distribution:** White Cap carries Converge (<https://www.converge.io/white-cap>);
  DeWalt retail; test-equipment resellers. For us: search ("concrete maturity
  method calculator", "when can I strip forms"), a free ASTM C1074 maturity
  calculator as the lead magnet, and an online store.
- **What we'd sell:** a potted, embed-and-forget BLE temperature sensor sold
  in packs (a consumable: every pour uses new ones) plus a phone app and web
  dashboard: per-mix maturity curve calibration, strength estimates,
  form-strip and cold-weather alerts, a pour log that exports to the
  inspector. *Estimate:* packs at $39–59 a sensor and a $49–99/month
  company plan.
- **Margin (*estimate*):** a thermistor, BLE SoC and coin cell in a potted
  shell cost about $5–12, so gross margin above 80% on sensors.
- **Certification:** FCC Part 15 (BLE). Battery powered and embedded in
  concrete, so no UL exposure. The real burden is technical credibility: the
  strength estimate depends on a per-mix calibration under ASTM C1074, and the
  app must say plainly that it estimates and that the engineer of record
  decides.
- **Cash and time to first dollar (*estimate*):** $25k–40k (FCC and BT SIG,
  potting tooling, a first run of about 1,000 sensors from a contract
  manufacturer); 4–6 months from an owner go-ahead.
- **Risks:** incumbents backed by Sika and DeWalt; the per-mix calibration
  work; reading range through concrete (why some sell long-range and wired
  versions).
- **First paper-only step:** a spec and BOM priced from distributor list
  pages, a radio-range and battery-life budget, the ASTM C1074 calibration
  procedure the app would follow, and a free maturity calculator built in
  software (it needs no hardware and doubles as the lead magnet).

### 2. Retrofit machine monitoring for job shops (top pick)

- **Who buys:** owners and ops managers of CNC job shops (17,156 machine shops;
  *estimate*: 80–90% under 100 staff, average 13 employees) wanting
  utilisation and OEE without touching the controller.
- **What they pay today:**
  - MachineMetrics: 10 machines plus edge device $12,750 for 12 months on AWS
    Marketplace (about $106 a machine a month):
    <https://aws.amazon.com/marketplace/pp/prodview-nnc6qc5mcufmy>.
  - Guidewheel: entry tier from $15,000/yr (<https://www.guidewheel.com/pricing>);
    an older listing says $59 a sensor a month (<https://zoftwarehub.com/en-ae/products/guidewheel/pricing>, 2024-12-06).
  - Amper: $75–100 a machine a month (2021 reviews): <https://www.softwareadvice.com/iot/amper-profile>.
  - Scytec DataXchange: $50 a machine a month: <https://www.getapp.com/emerging-technology-software/a/shop-floor-automations/>.
  - Guidewheel's own benchmark: $240–1,200 a machine a year, $1,200–6,000/yr
    for a five-machine shop: <https://www.guidewheel.com/blog/machine-monitoring-software-cost>.
- **Market moves:** ECI Software Solutions bought Amper on 2025-12-09:
  <https://www.businesswire.com/news/home/20251209288116/en/ECI-Software-Solutions-Acquires-Amper-Technologies-Increasing-AI-Driven-Operational-Efficiency-for-Manufacturers>.
  Guidewheel raised a $31M Series B on 2024-08-13:
  <https://businesswire.com/news/home/20240813639025/en>. MachineMetrics
  revenue about $14.7M with 51 staff (Latka, unaudited): <https://getlatka.com/companies/machinemetrics>.
- **Distribution:** mostly demo-led direct sales today; AWS and SAP
  marketplaces. For us: search ("machine monitoring for small shops"),
  Practical Machinist and r/Machinists (inside their rules), and the RFQ-quote
  product's own customers.
- **What we'd sell:** software first: MTConnect is an open, royalty-free
  standard that newer Haas controls expose (<https://docs.machinemetrics.com/docs/machine-connectivity/haas-connectivity-guide>,
  and an MIT-licensed adapter exists: <https://github.com/TrakHound/MTConnect.NET-Haas>),
  so networked machines need no hardware at all. For older and non-networked
  machines, a clip-on current-transformer node (CT, ESP32-class radio,
  enclosure). *Estimate:* $49–79 a machine a month, self-serve, and the
  sensor sold at cost or bundled. Utilisation data then feeds the RFQ-quote
  product's machine rates.
- **Margin (*estimate*):** split-core CTs retail from about $15
  (<https://www.sparkfun.com/products/11005>); a node costs about $40–80, so 80%+
  gross margin after year one.
- **Certification:** FCC Part 15 on a pre-certified module. A CT clamped inside
  a machine's electrical cabinet is panel work: the shop's own electrician fits
  it, and a CT inside a panelboard would need a UL 2808 listing
  (<https://iaeimagazine.org/columns/ul-question-corner/ul-question-corner-installing-power-monitoring-equipment-in-panelboards/>).
  *Estimate:* design for clamping on the machine's supply cable outside any
  panel, and state the electrician requirement plainly.
- **Cash and time to first dollar (*estimate*):** under $5k for the
  software-only MTConnect path (no hardware), 2–3 months; $15k–30k and 4–6
  months for the CT node.
- **Risks:** free MTConnect shrinks the CT-only wedge on new machines (which
  is why the product is software first); funded rivals; older shops' mixed
  controls.
- **First paper-only step:** a node spec and BOM from distributor list pages,
  the MTConnect agent design, and a written install guide that keeps the
  sensor out of panels.

### 3. Solar LTE jobsite camera

- **Prices today:** TrueLook from $99/month to $599/month (<https://www.truelook.com/pricing>);
  OxBlue $200–900/month, bought hardware $2k–20k (<https://www.oxblue.com/blog/construction-camera-price>);
  Sensera about $278/month on a 15-month project (<https://www.senserasystems.com/October-2021/>, Oct 2021);
  surveillance trailers $1k–3.5k/month rent (<https://www.truelook.com/blog/mobile-surveillance-trailer-cost-guide>).
- **Read:** proven WTP and the cheapest hardware (*estimate*: $300–800 a kit,
  using an already carrier-certified LTE camera), but crowded, churns per
  project, and the value is in the software. Third because it shares the
  contractor-suite customer and can be resold hardware rather than our own.

### 4. Leak and temperature/humidity kit for buildings under construction

- **Pull:** builders' risk insurers cut water-damage deductibles by 50%+ or
  premiums by 25–30% when sensors and shutoffs are used, sometimes paying for
  the hardware: <https://www.enr.com/articles/63217-insurers-offer-discounts-for-using-site-monitoring-tech-to-reduce-risk>.
  WINT raised a $15M Series B (<https://www.pmmag.com/articles/104033-wint-announces-a-15m-funding-round-for-water-sustainability-and-to-end-water-waste-and-damage-in-the-built-environment>);
  Invixium bought Triax (Spot-r) in July 2024 (<https://www.securitysales.com/news/invixium-triax-technologies-biometric-solutions/160274/>).
- **Read:** cheap hardware (*estimate*: node BOM under $15) and a clear ROI,
  but the buyer is the GC or owner on larger jobs and the insurer channel
  needs partnerships (outside the no-contact limit for now).

### 5. Wireless vibration sensors for small plants

- **Prices:** Tractian about $35 a sensor a month (third party):
  <https://zoftwarehub.com/products/tractian/pricing>; ifm Sentinel $75/month for
  one point, $20/point at 8+: <https://ifm.com/au/en/au/actions/sentinel-simple-condition-monitoring>;
  Banner QM30VT2 $320 hardware only: <https://www.digikey.com/en/products/detail/banner-engineering-corporation/QM30VT2/10652478>.
- **Read:** lightest certification, but Tractian ($130M Series D at $1.4B,
  per its blog dated 2026-10-22: <https://tractian.com/en/blog/tractian-raises-series-d-to-scale-physical-ai>)
  and Augury ($75M at about $1B, 2025-02-19: <https://www.businesswire.com/news/home/20250219700559/en/Augury-Announces-$75-Million-of-Funding-and-Maintains-$1B-Valuation-as-it-Accelerates-Leadership-in-Industrial-AI-Solutions>)
  hold it, and Amazon Monitron ($50 a sensor a year) closed to new customers on
  2024-10-31: <https://aws.amazon.com/monitron/pricing/>. A later add-on to #2.

### 6. Brand-agnostic tool tracking

- Milwaukee ONE-KEY tags $29.97 each, no subscription:
  <https://www.zoro.com/milwaukee-one-key-bluetooth-tracking-tag-10-pk-48-21-2310/i/G903678365>;
  DeWalt Tool Connect tag about $20.64 each in a 25-pack:
  <https://zoro.com/dewalt-tool-connecttm-tag-25-pack-dce041-25/i/G2043041>;
  Momentum Toolie $8 an asset a month: <https://momentumiot.com/gps-devices/light-equipment-tools/>.
  Deere agreed to buy Tenna (CB Insights, 2025-12-22): <https://www.cbinsights.com/company/tenna/financials>.
- **Read:** tool brands give tags away with no fee, so a hardware entrant has
  no pricing power. A tracking feature in the contractor suite that reads
  those tags, not a hardware company.

### 7. 2D indicate-only grade kit for mini excavators

- **Buyers:** 235,496 US excavation contractors (IBISWorld 2025):
  <https://img3.ibisworld.com/united-states/number-of-businesses/excavation-contractors/206>.
- **Prices:** Topcon 2D X42/X62 about $17k/$20k list (older article):
  <https://www.gim-international.com/content/news/new-2-d-excavator-grade-control-systems>;
  2D systems $10k–20k, 3D up to about $70k on a compact track loader:
  <https://compactequip.com/attachments/lets-learn-to-upfit-that-compact-track-loader-with-a-2d-machine-control-grading-system/>;
  Unicontrol sells "up to 50% less" through dealers:
  <https://www.theconstructionindex.co.uk/news/view/unicontrol-launches-2d-machine-control-alternative?amp=1>.
- **Read:** large gap between a low BOM (*estimate*: under $1.5k) and $5k–20k
  prices, but sale and calibration go through dealers and installers. An
  indicate-only kit (no hydraulic control) keeps the burden to EMC, IP and
  FCC; automatic control brings ISO 17757-class work
  (<https://www.iso.org/standard/76126.html>). Worth a second look once a
  sensor company exists; the closest repo link is `research/heavy-hydraulics`.

### 8. Tennis ball machine + pickup rover (`ventures/open-tennis-robots`)

- **Prices:** Lobster Elite Three $1,799 (<https://www.tennis-warehouse.com/Lobster_Elite_Three_Portable_Ball_Machine_w__Remote/descpageLOBSTER-ELITE3R.html>);
  Slinger launcher $649 (<https://slingerbag.com/pages/tennis>); Tennibot
  Partner Lite $1,495 (Aug 2026: <https://roboticsandautomationnews.com/2026/08/27/tennibot-launches-1495-partner-lite-ai-ball-machine-for-tennis-padel-and-pickleball/104516/>)
  and Rover collector $2,995 or $95/month (<https://www.tennis.com/news/articles/the-partner-ball-machine-uses-robotics-to-revolutionize-tennis-training-rover>).
- **Buyers:** 16,000+ PTR and 14,000+ USPTA teaching pros (2024):
  <https://ptrtennis.org/ptr-and-uspta-unite-to-support-ustas-vision-for-tennis-expansion/>;
  courts 187,000 per the USTA's 2026 flyer (<https://www.usta.com/content/dam/usta/2026-pdfs/tennis-advocacy-flyer.pdf>;
  its 2024 flyer said 252,000, so the counts conflict).
- **Read:** light certification and online channels, but a mostly consumer
  market with one-off sales; Slinger's parent Connexa reported a $71.1M FY2023
  net loss and Nasdaq delisting notices (<https://sgbonline.com/connexa-applies-for-120-reverse-stock-split/>).
  The clubs-and-coaches slice is small. Keep as an open design.

### 9. Compressed-air leak detection / energy submetering

- Emporia Vue 3 three-phase with 16 circuits $209.99:
  <https://shop.emporiaenergy.com/products/emporia-vue-3-3-phase-energy-monitor>;
  UE Systems Ultraprobe 3000 from $3,495: <https://www.uesystems.com/product/ultraprobe-3000-leak-detector/>;
  Fluke ii915 acoustic imager $21,249: <https://www.testequipmentdepot.com/fluke-ii915-industrial-acoustic-imager-2-to-100-khz-393-ft-detection-range.html>;
  leaks waste 20–30% of compressor output (DOE-era sourcebook): <https://nrel.gov/docs/fy01osti/28008.pdf>.
- **Read:** submetering hardware is commoditised and in-panel CTs need UL 2808
  and a licensed electrician; a mid-price leak tool has room but is a one-off
  sale.

### 10. Vision inspection kit

- Cognex In-Sight 2800 about $4,500 (affiliate review site):
  <https://robotomated.com/explore/manufacturing/cognex-insight-2800>; Zebra
  Iris GTX2000 $4,146.69: <https://www.barcodesinc.com/zebra/part-gtx2000.htm>;
  Landing AI now Free or Enterprise: <https://docs.landing.ai/landinglens/plans>.
- **Read:** each new part needs its own application engineering, and job shops
  run high mix. Poor fit.

### 11. Commercial RTK robot mower (`ventures/open-robot-mower`)

- **Prices:** Husqvarna CEORA launched at €24,900–28,900 (2022:
  <https://www.husqvarnagroup.com/en/news/husqvarna-ceoratm-kickstarts-new-era-commercial-turf-care>),
  UK dealer now £14,999–18,999 (<https://shop.balmersgm.com/collections/professional-use-robotic-mowers/products/husqvarna-automower%C2%AE-580l-epos%C2%AE-copy>);
  Kress RTKn KR233E £5,649 (<https://www.radmoretucker.co.uk/?p=691907>);
  prosumer Segway Navimow X315 $1,999 (<https://frontdeskreview.com/product/robot-lawn-mowers/segway-navimow-x3-x315/>);
  Scythe about $30/acre pay-as-you-mow, $42M Series B (Jan 2023:
  <https://techcrunch.com/2023/01/24/scythe-raises-42-million-for-its-electric-robotic-mower/>).
- **Buyers:** 556,238 US landscaping businesses (IBISWorld 2026 edition; an
  earlier one said 692,777): <https://www.ibisworld.com/united-states/number-of-businesses/landscaping-services/1497/>.
  Adoption still early (<https://www.lawnandlandscape.com/article/autonomous-mowing-lawn-landscape-technology-conference-2024>).
- **Read:** a real mid-tier price gap, but a spinning blade near people means
  IEC 60335-2-107 (child-foot probe, blade-stop timing:
  <https://webstore.iec.ch/publication/29806>), dealer service, warranty and
  inventory capital, against Husqvarna, Segway and Mammotion at scale. Not for
  an agent-run company now.

### 12. Commercial floor-cleaning robot (`ventures/open-floor-robots`)

- Pudu CC1 $22,000 or $917/month (<https://www.robotlab.com/store/cleaning-robot-cc1/>);
  Gausium Phantas $29,600 or $829/month (<https://www.robotlab.com/store/phantas-1-3/>);
  Tennant T380AMR $90,324 on a 2024 university contract
  (<https://www.bussvc.wisc.edu/purch/contract/5687_vendors/5687_San-A-Care_pricing.pdf>).
  Pudu has shipped 120,000 units and raised about $150M at $1.5B in April 2026
  (<https://autonews.gasgoo.com/articles/news/seeds-pudu-robotics-closes-nearly-1-billion-yuan-funding-round-valuation-exceeds-10-billion-yuan-2047305274711334912>).
- **Read:** Chinese makers at scale set the price; an entrant fights on price
  with field service it does not have. No.

### 13. Excavator autonomy / remote retrofit (`research/heavy-hydraulics`)

- Built Robotics charged $3,000 a machine a month plus hourly fees (2022) and
  narrowed to solar piling (<https://techcrunch.com/2022/04/07/built-robotics-raises-another-64m-to-make-construction-equipment-autonomous/>);
  Bedrock Robotics raised a $600M Series C at $4.1B in Oct 2026
  (<https://techcrunch.com/2026/10/26/this-startups-self-driving-excavators-help-dig-up-600m-in-new-funding/>);
  Pronto bought SafeAI (<https://techcrunch.com/2025/07/15/av-startup-pronto-ai-acquires-off-road-autonomous-vehicle-rival-safeai>).
- **Read:** a capital race between near-$1B companies under ISO 17757. The
  research stays research; the sellable piece is #7.

### 14. Layout robot

- Dusty Robotics raised $68.7M ($45M Series B, 2022: <https://www.therobotreport.com/dusty-robotics-raises-45m-series-b-round/>),
  leases reported at $2.5k–5k a month (<https://www.fixedlabs.ai/tools/dusty-robotics>);
  HP SitePrint charges per square foot (<https://hp.com/us-en/printers/site-print/layout-robot/faq.html>).
- **Read:** needs a laser tracker (*estimate*: $15k–60k BOM) and field
  service; buyers are large GCs. No.

### 15. Cobot machine-tending cell

- UR5e about $30k–45k arm, roughly double installed (<https://standardbots.com/articles/universal-robot-price>);
  Vention cells $58,017.80 to $102,701.04 (<https://vention.io/designs/fanuc-machine-tending-collaborative-robot-cell-part-presenter-275672>,
  <https://vention.io/designs/276379>); Vention raised $110M on 2026-01-27
  (<https://www.therobotreport.com/vention-raises-110m-to-accelerate-physical-ai-deployments-in-manufacturing/>);
  Rapid Robotics' $25,000/yr RaaS ended with an asset sale to RobCo in Sept 2025
  (<https://www.cbinsights.com/company/rapid-robotics>).
- **Read:** arm makers take the margin and every cell needs a risk assessment.
  Software or accessories only.

### 16. Small survey USV / docking assist (`research/marine-*`)

- Seafloor HyDrone rents from $2,400/month (<https://www.kwipped.com/rentals/product/seafloor-hydrone-rcv-hydrographic-survey-equipment/26613>);
  most survey USVs are quote-only; about 2,770 US marina businesses (IBISWorld 2026:
  <https://www.ibisworld.com/united-states/number-of-businesses/marinas/1654>).
  US USVs are treated as power-driven vessels under COLREGs with no
  USV-specific civil rule (<https://www.usni.org/magazines/proceedings/2024/february/collision-regulations-need-be-updated-usvs>).
- **Read:** niche buyers; docking assist is locked into engine-maker systems.
  No.

### 17. Weeding robot / spray drone (`research/osrobot-*`)

- FCC added foreign-made UAS to the Covered List on 22 Dec 2025
  (<https://www.calt.iastate.edu/post/foreign-made-uas-stay-fcc-covered-list-dji-and-autel-challenges-proceed>);
  1,710 FAA Part 137 drone spray operators by Sept 2025 (<https://www.fb.org/intel/markets/drones-taking-off-in-ag>);
  spray-drone unit sales fell about 59% (<https://dronexl.co/2026/10/21/spray-drone-sales-fell-59-percent-asdc-fcc-part-137-carve-out/>).
  FarmWise wound down after raising about $65M (<https://agfundernews.com/salad-giant-taylor-farms-acquires-beleaguered-ai-powered-weeding-startup-farmwise>);
  Naïo went through French receivership (<https://www.freshplaza.com/europe/article/9784595/naio-technologies-targets-sales-of-eur11-million-by-2030/>).
- **Read:** the DJI restrictions open a real gap, but aviation certification
  (Part 137, 44807 exemptions) and capital make it the heaviest burden here.
  No.

### Not scored

- **`research/buildbot-*` (robots nailing sheathing, carrying panels):**
  research on whether a stock humanoid or gantry can frame to code. No buyer
  pays for this today that the passes could price; it stays a research
  programme. If it ever leaves simulation, the first buyers would be offsite
  panel shops, not jobsites.
- **`ventures/open-house-plans`:** software, not hardware; it belongs in
  `bets.md` if anywhere.

## What the owner would decide (not asked yet)

Nothing here needs the owner until a hardware company is chosen. Building
either top pick needs, in order: a go-ahead; a company or entity to sell
under; money for FCC testing and a first production run (*estimate*:
$25k–40k for #1, under $5k for #2's software-first path); and a contract
manufacturer account. Agents cannot open accounts, buy or contact
manufacturers (Hard limits). The paper steps in #1 and #2 need none of this.
