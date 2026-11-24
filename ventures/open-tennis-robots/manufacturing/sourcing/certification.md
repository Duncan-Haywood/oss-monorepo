# Certification gap list (read 2026-11-24)

Stated conservatively. Not legal or compliance advice: a test lab and a
lawyer in each market decide what applies. Costs are the ranges the cited
pages publish, read from search summaries on 2026-11-24 (the pages could not
be opened from this container); most are vendor marketing figures, and a
real quote can sit outside them. Nothing has been tested or filed.

The collector, as designed, contains an ESP32-WROOM-32E module (Wi-Fi and
Bluetooth; FCC ID 2AC7Z-ESP32WROOM32E, [fccid.io](https://fccid.io/2AC7Z-ESP32WROOM32E)),
a Raspberry Pi 5 (Wi-Fi and Bluetooth on board), a 24 V 10 Ah LiFePO4 pack
(about 256 Wh), two drive gearmotors, and a hard-wired e-stop. It drives on
its own near people.

| # | Gap | Applies when | What is required (source) | Published cost | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **FCC Part 15 Subpart B** (unintentional emissions of the whole robot) | Selling in the US, any form with electronics | Authorisation by SDoC or certification before marketing ([47 CFR 15.101](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15/subpart-B/section-15.101)); host compliance is the integrator's job ([FCC KDB 996369 slides](https://fcc.gov/sites/default/files/32-KDB-996369-Modules-TCB_Oct_2023.pdf)) | About $800 to $2,000 testing, $1,500 to $5,000 with documentation; $2,500 to $5,500 for a host with a module ([compliancetesting.com](https://compliancetesting.com/fcc-certification-faqs/fcc-certification-cost/), [ComplianceGate](https://compliancegate.com/fcc-sdoc)) | Not started |
| 2 | **FCC Part 15 Subpart C** (the radios) | Same | Covered by each module's grant only if its integration instructions are followed (antenna, placement, labelling "Contains FCC ID"); otherwise a new grant or permissive change ([Ezurio white paper](https://www.ezurio.com/resources/white-papers/fcc-guidance-on-transmitter-modules)). The Pi 5's own radio status must be checked the same way | No separate figure found | Not started. Disabling the Pi's radio does not remove the ESP32's |
| 3 | **UN 38.3 test summary** for the battery | Shipping any lithium pack | Test summary required and available on request ([49 CFR 173.185](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-E/section-173.185), [PHMSA brochure](https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/2024-09/Lithium-Battery-Test-Summary-2024.pdf)) | About $500 ([Lithium Ion Products](https://intercom.help/lithium-ion/en/articles/1750688-learn-about-our-lithium-ion-pack-certifications)) to $5,000 to $7,000 over 4 to 6 weeks ([Epec](https://blog.epectec.com/why-dot-un-38.3-is-required-for-lithium-batteries)) | Buy a pack whose maker supplies one. The sourced Bioenno pack has **no published statement found**: ask before choosing it |
| 4 | **Lithium shipping class** | Shipping the assembled robot | About 256 Wh is above 100 Wh, so it ships as Class 9 dangerous goods with packaging and marking rules (173.185); carriers and FBA add their own reviews ([Amazon](https://sellercentral.amazon.com/gp/help/external/200383420)) | Carrier surcharges not looked up | Not started |
| 5 | **Electrical and robot safety evaluation** | Any assembled robot sold to clubs | No single mandated US standard was confirmed for this product. Candidates a lab would weigh: UL 3300 (safety of service robots for consumer and commercial use, indoor and outdoor; supplements the end-product standard such as UL 62368-1 or UL 60335-1; [UL](https://www.ul.com/news/ul-3300-outline-investigation-helps-advance-safety-consumer-service-and-education-robots), [ANSI](https://webstore.ansi.org/standards/ul/ansiul33002024)); IEC/UL 62368-1 for the electronics ([Element](https://www.element.com/connected-technologies/electrical-safety-testing-and-certification/iec-62368-1-testing)); IEC 62133-2 for the cells | **No published price found** for any of these | Not started. Retailers and insurers are likely to ask for a report |
| 6 | **CE: Radio Equipment Directive** (EU) | Selling in the EU | No modular route under RED; the host needs radio, EMC and safety assessment ([TÜV SÜD](https://tuvsud.com/en/knowledge-hub/articles/wireless-module-integration-understanding-global-regulatory-requirements)). Machinery rules may also apply to a self-driving machine: not assessed | $300 to $4,000 lab testing ([Radiocrafts](https://radiocrafts.com/?p=16171)); about $1,200 for the RED part of a Wi-Fi device ([ComplianceGate](https://compliancegate.com/electronic-product-lab-testing-european-union)) | Not started |
| 7 | **UKCA: Radio Equipment Regulations 2017** (Great Britain) | Selling in GB | An Approved Body only if designated standards are not fully applied ([GOV.UK](https://www.gov.uk/government/publications/radio-equipment-regulations-2017/radio-equipment-regulations-2017-great-britain)) | GBP 1,500 to 4,000 radio testing (vendor, [Euverify](https://euverify.com/resource/ukca-testing-and-certification/)) | Not started |
| 8 | **Manual, warnings, labels** | Every market | FCC labelling, the module's "Contains FCC ID" line, battery markings, the safety text in `../../hardware/safety.md` in the buyer's language | Writing only | Draft exists (`safety.md`) |
| 9 | **Battery disposal and take-back** (EU Batteries Regulation, US state rules) | EU, some US states | Not assessed in this pass | Not looked up | Not started |

## Insurance

Product liability, published averages (mixed small businesses; a lithium
robot will be rated on a quote):

- about $42 a month, cited from Insureon by [Insurance.com](https://www.insurance.com/small-business/product-liability-insurance-guide/);
- The Hartford: customers average $68 a month, $824 a year for $1M of
  general liability that includes product liability ([The Hartford](https://www.thehartford.com/general-liability-insurance/product-liability-insurance/cost));
- about $1,200 a year for manufacturing, retail and wholesale businesses under
  $1M revenue (AdvisorSmith via [NerdWallet](https://www.nerdwallet.com/business/insurance/learn/what-is-product-liability-insurance)).

## Smallest first market

US only, assembled, sold direct to clubs: gaps 1, 2, 3, 4, 8, and a safety
evaluation (5) before volume. On the cited ranges, FCC alone is
$1,500 to $5,500 and the battery summary comes from the pack maker. A kit
without the battery (`../../sell/README.md`, "Kit or assembled?") reduces
items 3 and 4 for the seller, but a lab should confirm what remains.
