# Accelerator portfolios as inspiration — not as a scrape

Working notes for turning *publicly known* accelerator companies into
super-niche, $0-marginal-cost tools. This is **not** a candidate pipeline
and it does not rescore `portfolio/pipeline/`. Screening there is done.
A niche graduates by shipping `ventures/<slug>/` or a `product_lines` entry.

The full idea inventory (YC paste + Techstars unicorn names + SPC homepage
+ Seedcamp featured + well-known VC cores) is
[`portfolio-ideas.md`](portfolio-ideas.md). This file keeps the legal line
and the short ship/skip table.

## Legal line (read before copying a URL into a crawler)

Checked 2026-08-25 against published robots.txt and terms. We did **not**
fetch filtered company directories.

| Source | robots.txt | Terms / practice we follow |
|---|---|---|
| [ycombinator.com](https://www.ycombinator.com/robots.txt) | `Disallow: /companies?*` (and several `/library?*` query forms). `/` is otherwise allowed. | [Terms of Use](https://www.ycombinator.com/legal): no scraping, data mining, or commercial reuse of Site Content; no copying the directory, trademarks, or company write-ups. A user-pasted list may be read as *their* notes. Do not republish YC's directory. Do not hit `/companies?batch=…`. |
| [techstars.com](https://www.techstars.com/robots.txt) | `Allow: /` | [Terms](https://www.techstars.com/terms-of-use) (2026-07-16) forbid reproducing Site Content and “record, process, or mine information about other companies and/or users.” We opened the public unicorn-registry **names** only. No searchable-portfolio dump, no blurbs. |
| [southparkcommons.com](https://www.southparkcommons.com/robots.txt) | `Allow: /` except member, newsletter, and some demo paths | Homepage featured names only. No `/members`, no JS companies index. |
| [seedcamp.com](https://seedcamp.com/robots.txt) | `Allow: /` (Yoast empty Disallow) | Featured hero names only. Do not republish the 550-row directory. No public site ToS found (privacy policy only). |
| [a16z.com](https://a16z.com/robots.txt) | Empty `Disallow` | Public [portfolio](https://a16z.com/portfolio/) tickers only. No Speedrun directory dump. |
| Sequoia and the other named VCs | Sequoia `robots.txt` timed out 2026-08-25 | Not fetched. Use well-known public company names only. |

Also out, regardless of robots.txt:

- Cloning a marketplace, payments rail, payroll product, or insured marketplace (two-sided liquidity, licenses, ToS of *that* company).
- Advice-of-record (legal, tax, medical, trading, “you are compliant”).
- Scraping personal data, job boards, or Upwork for leads (GDPR / ToS).
- Using another company's trademarks, logos, or help-center prose as if we were them. Citing a public help URL as the *source of a fee shape*, with user-editable rates, is the pattern the existing marketplace calculators already use.

Job boards and Upwork are useful as *problem discovery* (“people pay to have X done”) only from listings a human already pasted or from memory. Do not log in, scrape, or message posters.

## Compete directly vs niche down vs skip

**Do not compete directly** with funded cores: Stripe, Rippling, Deel, Gusto,
Scale AI, Benchling, Ironclad, Amplitude, Zapier, Webflow, Faire-the-marketplace,
Whatnot-the-app, GOAT-the-app, Guesty-the-PMS. Those need distribution we do
not have and would invite a trademark / ToS fight if we impersonated them.

**Niche down to a $0 tool** when the public product has a *fee shape or
worksheet* a specialist still does in a spreadsheet:

| Public idea (inspiration only) | Niche tool | Status |
|---|---|---|
| Faire (YC W17) — wholesale marketplace | Brand first-order vs reorder vs Direct; retailer landed cost | **Shipped** `ventures/faire-wholesale-calculator` |
| Whatnot (YC W20) — livestream selling | Seller fee + starting-price for a live show | Next if Faire gets return use; or a channel on `where-to-sell-calculator` |
| GOAT (YC W11) / StockX | Authenticated resale fee comparison (sneakers, watches) | Next; not a GOAT clone |
| Guesty (YC W14) / Airbnb hosts | Host payout after channel-manager % and cleaning — not tax | Distinct buyer from Faire |
| Goldbelly (YC W13) | Restaurant shipping commission vs packing cost | Smaller SERP, still a maker with money |
| Cratejoy (YC S13) | Subscription-box unit economics | Distinct from Faire |
| ShipBob / EasyPost / Flexport | 3PL / landed-cost worksheets | Already partly `3pl-quote-normalizer` |
| EquipmentShare (YC W15) | Rent-vs-buy for one machine class | Fits trade-calculator pattern |
| The Ticket Fairy / Shoobs | Promoter fee stack on one event | Keep off payment collection |
| Odeko / Plate IQ | Cafe invoice line-check, not AP automation | Evidence/worksheet only |

**Skip** (liability, capital, or already screened): AI legal/medical/tax,
trading/crypto signals, payroll and global employment, insurance carriers,
defense/hardware, two-sided marketplaces, cold email, scraped leads,
token-margin analytics, generic “AI for X” wrappers of 2026 YC agent
infrastructure.

2026 YC batches are dense with agent runtimes, insurance, and robotics. Those
are compete-directly or skip. The copyable move is almost never “build the
startup”; it is “the spreadsheet their customer still opens.”

## What we will not do with these notes

- Open a second screening pipeline or rescore `candidates.yaml`.
- Fetch accelerator company directories, application answers, or videos.
- Ship anything that needs a Faire / Whatnot / GOAT account, API, or listing.
- Claim affiliation.

If a later session picks a row, graduate it as a product. The inventory in
`portfolio-ideas.md` is already the list; do not open a third notes file.
