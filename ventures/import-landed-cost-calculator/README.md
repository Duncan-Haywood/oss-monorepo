# Import Landed Cost Calculator

The free import landed cost calculator shows what an import shipment actually
costs once it clears customs — item cost, freight, duty, any supplemental or
Section 301 tariff, the Merchandise Processing Fee, the Harbor Maintenance
Fee, and your customs broker's fee, all in one breakdown. Use it when you are
pricing a SKU before you order it, or checking a shipment's numbers against
your broker's entry summary after it lands.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/import-landed-cost-calculator/

**Not a customs broker, freight forwarder, or licensed customs classification
service.** It does not determine your HTS code, your duty rate, or your
compliance obligations — you must verify those with a licensed customs broker
or CBP. This tool only performs the arithmetic once you supply the rates and
fees.

Open `index.html` in a browser. The calculation is local and works without an
account, network request, or API key. It is arithmetic, not a duty schedule:
type the rates from your own HTS classification and current CBP guidance, and
verify them with your broker before you rely on the result.

After using this, you can now see total landed cost, cost per unit, and the
effective tariff burden as a percent of your invoice price before you commit
to an order — which used to mean pricing off the item cost alone and finding
out the real number when the shipment cleared customs.

## Why this matters more since 2025

The $800 "de minimis" duty-free exemption that used to let many small
shipments clear US customs with zero duty has been narrowed or eliminated for
a growing set of countries and shipment types since 2025, most visibly for
goods from China and Hong Kong. Sellers who priced off the old duty-free
assumption are now seeing duty, supplemental tariffs, and processing fees on
shipments that used to cost nothing extra at the border. See
[does the de minimis exemption still apply?](does-the-de-minimis-exemption-still-apply.html)
for a worked example of what changed.

## What it computes

- **Duty and supplemental/Section 301 tariff**, both applied to the customs
  value (item cost + freight to the US port/border, the usual basis for most
  import styles — valuation rules vary by terms of sale, and a broker should
  confirm the correct basis for your specific shipment).
- **Merchandise Processing Fee** — 0.3464% of customs value on a formal
  entry, with a $32.71 floor and a $634.62 ceiling per entry; a flat ~$2.62
  on an informal entry. These are the currently published CBP fee schedule
  figures — confirm current numbers at cbp.gov before relying on them.
- **Harbor Maintenance Fee** — 0.125% of customs value, charged only on
  ocean shipments (toggle the checkbox).
- **Customs broker / entry fee** — a flat fee you type in from your own
  broker's quote.
- **Total landed cost, cost per unit, and effective tariff burden** as a
  percent of item cost — the single number sellers care about most: how much
  you're really paying on top of the invoice price.

- **Several products on one entry.** A second section prices a mixed
  shipment line by line: each product has its own duty and tariff rates,
  freight and insurance are split by item cost, and the MPF (with its floor
  and ceiling), HMF and broker fee are charged once per entry and then split
  by customs value, so each product gets its own landed cost per unit.

None of the duty or tariff *rates* are stored or assumed. They are fields you
fill in from your own HTS lookup (hts.usitc.gov) or your broker's guidance,
so the result stays a checkable calculation rather than a claim about any
product's actual current rate.

## Save and share your numbers

- **Restored on return.** Your inputs are saved in your browser and reappear
  the next time you open the page. **Reset to example** clears them back to
  the worked example.
- **Shareable link.** **Copy shareable link** writes your current inputs into
  the page URL and copies it. A link's values always take precedence over
  whatever a browser had saved.

The link and the saved copy contain only the numbers you typed. They never
include anything else, and nothing is uploaded.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not customs, legal, tax, or financial
advice, and it does not replace a licensed customs broker or a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your item costs, rates, and quantities are
never uploaded. There are no accounts, cookies, tracking pixels, or analytics
vendor. Two things are stored locally, on your device only: the numbers you
enter (clear them with **Reset to example**) and, unless you opt out, an
anonymous counter that records only an event name and the day. The counter
never records your inputs. Turn it off with the checkbox in the footer, or
your browser's Do Not Track / Global Privacy Control setting.

## Opportunity

Small e-commerce sellers, Amazon/Etsy/Shopify merchants, and dropshippers who
import directly from overseas suppliers (commonly China) in shipments roughly
$1k–$50k search for "landed cost calculator", "customs duty calculator",
"china tariff calculator", and "de minimis calculator" because pricing a SKU
off the item cost alone and then getting hit at customs with duty, Section
301 tariffs, and fees they did not budget for is one of the most common
complaints in r/FulfillmentByAmazon, r/dropship, r/AmazonSeller, r/ecommerce,
and r/Alibaba. Screened with `duplicate_check.py` against the existing
portfolio (top similarity score 0.17, well under the 0.45 near-duplicate
threshold) — nothing else here covers customs, duty, or tariff arithmetic.
Enterprise landed-cost platforms (Flexport, Zonos) target larger shippers
with account managers; the independent seller shipping $1k–$50k at a time
uses a spreadsheet or guesses.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.
