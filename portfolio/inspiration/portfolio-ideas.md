# Portfolio idea inventory

Niched-down, $0-marginal-cost tools inspired by companies on lists a human
already pasted or on **public marketing pages we are allowed to open**.
This is **not** a second screening pipeline and it does not rescore
`portfolio/pipeline/`. A row graduates only by shipping
`ventures/<slug>/` or a `product_lines` entry.

Company **names** are facts. We do not copy directory write-ups, logos,
application answers, or help-center prose. Rates in any shipped tool stay
user-editable, sourced from a public fee article the user can check.

Checked 2026-08-25.

## What we opened, and what we did not

| Source | Opened | Did not |
|---|---|---|
| YC | User-pasted company names from the query. [robots.txt](https://www.ycombinator.com/robots.txt) and [Terms of Use](https://www.ycombinator.com/legal) | `/companies`, `/companies?*`, library query URLs, application answers, videos |
| Techstars | [robots.txt](https://www.techstars.com/robots.txt) (`Allow: /`), [Terms of Use](https://www.techstars.com/terms-of-use) (revised 2026-07-16), public unicorn-registry **names** on [the portfolio page](https://www.techstars.com/portfolio) | Full searchable portfolio, “Search Portfolio”, company blurbs, user/company mining (ToS §5B) |
| South Park Commons | [robots.txt](https://www.southparkcommons.com/robots.txt); featured names on [the homepage](https://www.southparkcommons.com/) | `/members`, newsletters, demo-day paths, `/companies` JS dump |
| Seedcamp | [robots.txt](https://seedcamp.com/robots.txt) (empty `Disallow`); featured names on [Our Companies](https://seedcamp.com/our-companies/). No public site ToS found (privacy policy only) | Republishing the 550-row directory |
| a16z | [robots.txt](https://a16z.com/robots.txt) (empty `Disallow`); [portfolio page](https://a16z.com/portfolio/) (tickers in HTML) | Speedrun company directory, investment-list dump |
| Sequoia / Benchmark / Founders Fund / Accel / others named in the brief | Not fetched (Sequoia `robots.txt` timed out; no need to walk every VC site) | Any VC company database |
| Job boards / Upwork | Nothing | Login, scrape, or message posters |

Also out regardless of robots.txt: cloning a marketplace or payments rail;
advice-of-record; using another company's trademarks as if we were them.

## Already shipped here — do not rebuild

| Tool | Covers this shape |
|---|---|
| `faire-wholesale-calculator` | Faire first-order / reorder / Direct / own invoice |
| `ebay-fee-calculator` | eBay seller fees |
| `etsy-profit-calculator` | Etsy seller fees |
| `shopify-fee-calculator` | Shopify plan + payments |
| `amazon-fba-calculator` | FBA vs FBM |
| `where-to-sell-calculator` | Same item across eBay / Etsy / Amazon / own store / direct |
| `3pl-quote-normalizer` | 3PL / landed-cost quotes (ShipBob / EasyPost / Flexport *shape*) |
| `quote-margin-check` | Quote margin |
| `freelance-retainer-calculator` | Retainer capacity |
| `janitorial-bid-calculator` | Janitorial bid |
| `no-show-fee-calculator` | Appointment no-show fee |
| `retainage-cashflow-calculator` | Construction retainage |

## How to read a row

- **Niche-down** — ship a browser worksheet. Public fee *shape*, editable rates, disclaimer.
- **Channel** — add to `where-to-sell-calculator` rather than a new venture.
- **Skip** — liability, capital, ToS of *that* company, or already screened.

---

## From the pasted Y Combinator names

Inspiration only. Not a reprint of YC’s directory.

### Marketplace and seller take-home — niche-down

| Inspiration | Tool a stranger could finish in a browser |
|---|---|
| Faire (W17) | **Shipped.** First-order vs reorder vs Direct vs own invoice |
| Whatnot (W20) | Livestream seller: hammer price → take-home after Whatnot % + payment + shipping; starting price for a floor |
| GOAT Group (W11) | Authenticated resale: ask vs payout after auth + seller fee (sneakers or watches — pick one) |
| Instacart (S12) | Grocery **retailer**: shelf price vs Instacart markup + commission on one SKU |
| DoorDash (S13) | Restaurant **merchant**: ticket vs Dasher-delivery commission + processing vs in-house delivery |
| Meesho (S16) | India reseller: catalogue price vs Meesho commission + GST inputs the user types |
| Rappi (W16) | Same as DoorDash for one LATAM city; user-typed rates |
| Zepto (W21) | Dark-store unit economics for **one SKU** (purchase, last-mile, spoilage) — not a 10-minute grocery app |
| Goldbelly (W13) | Restaurant: wholesale + pack + Goldbelly cut vs nationwide shipping they already run |
| Cratejoy (S13) | Subscription-box: COGS + pick/pack + platform % vs monthly price |
| Scentbird (S15) | Fragrance sub: vial COGS + ship vs subscription price (one plan) |
| Honeylove (S18) / Markhor (S15) | DTC apparel: landed + ads the user types + return rate vs wholesale |
| Shoptiques (W12) | Boutique: local shelf vs marketplace commission on one dress |
| AptDeco (W14) | Used furniture: pickup + refurb + marketplace % vs asking price |
| Lollipuff (W13) / Flip (W15) | Authenticated fashion/sneaker resale fees (same family as GOAT) |
| Fivestars (W11) / Podium (W16) | One shop: loyalty or reviews software $ / month vs extra tickets needed to break even |
| Branch8 (S15) | Cross-list fee: same SKU on two marketplaces after each channel’s cut |
| The Ticket Fairy (S15) / Shoobs (W14) | Promoter: face value → net after platform + payment + venue (one event) |
| BackerKit (S12) | Crowdfunding: pledge → net after platform + fulfillment + rewards COGS |

### Host, travel, local services — niche-down

| Inspiration | Tool |
|---|---|
| Airbnb (W09) + Guesty (W14) | Host payout: nightly rate − Airbnb % − channel-manager % − cleaning − supplies. Not tax. |
| Weave (W14) | Dental/vet office: card processing + membership plan vs fee-for-service on one day |
| Odeko (S19) | Cafe: invoice line vs theoretical cost (qty × last price) — exception list, not AP |
| Yardbook (W16) | Lawn: one property bid after labor hours + dump fees + software % |
| Tovala (W16) | Meal kit + appliance: food COGS + ship vs subscription (one week) |
| Lugg (S15) | Move: quote vs labor hours + truck + marketplace cut |
| MagicBus (W16) | Vanpool: seat price vs parking + fuel split (one route) |
| AirHelp (W14) | **Skip as a product** (claims filing). Worksheet only: delay hours × published compensation table the user pastes |

### Logistics and physical goods — niche-down or already covered

| Inspiration | Tool |
|---|---|
| ShipBob (S14) / EasyPost (S13) / Flexport (W14) / Nowports (W19) / Zentail (S12) / GrubMarket (W15) | Landed cost / 3PL — **already** `3pl-quote-normalizer`. Add a channel, do not clone |
| EquipmentShare (W15) | Rent vs buy **one** machine class (skid steer or boom lift) |
| Assembly (S15) | China-to-door: EXW + freight + duty the user types vs DDP quote |
| PickTrace (S15) | Farm labor **hours × rate × crew** for one harvest day — payroll software is skip |
| Estimote (S13) | Skip hardware. Worksheet: beacon/sensor count × replace cycle for one store |

### Payments and remittance — niche-down (public schedules only)

| Inspiration | Tool |
|---|---|
| Stripe (S09) / WePay (S09) | **Skip competing.** Shopify/eBay calculators already cover “card + platform” |
| GoCardless (S11) | One invoice: Direct Debit % vs card % (user-typed) |
| Paystack (W16) / Xendit (S15) / Razorpay (W15) | One African/SEA charge: local processor % vs international card |
| Sendwave (W12) / Wave (W12) | Corridor remittance: send amount → receive after published fee the user types. Not FX advice |
| Truebill (W16) | **Skip** (PII / bank login). Manual subscription list totaling is a spreadsheet, not a product |
| Brex (W17) / Gusto (W12) / Rippling (W17) / Deel (W19) / Zenefits (W13) / Human Interest (S15) | **Skip** payroll, cards, 401(k) advice |

### Creator, tutor, gig take-home — niche-down

| Inspiration | Tool |
|---|---|
| Twitch (W07) | Streamer: subs + bits + ads the user types → take-home after split |
| Outschool (W16) | Teacher: list price × seats − Outschool % − refunds |
| Cambly (W14) | Tutor: minutes × rate − platform cut |
| Instawork (S15) / Clipboard (W17) | Shift: hourly × hours − platform % − commute the user types |
| Codecademy (S11) | Learner: bootcamp cash price vs months of subscription (comparison, not a school) |
| GiveCampus (S15) | School: gift amount → net after platform % (one campaign) |
| Mux (W16) / Bitmovin (S15) | Encoding: minutes × published rate the user types (one VOD) |

### Construction and property — niche-down

| Inspiration | Tool |
|---|---|
| PlanGrid (W12) / BuildZoom (W13) | One remodel: 3 contractor bids normalized (labor vs allowance vs exclusions) |
| EquipmentShare (W15) | Rent vs buy — see above |
| Snapdocs (W14) | **Skip** (mortgage closing / advice-adjacent) |
| BuildScience (W15) | One building: energy-bill $ vs listed retrofit cost. Not an audit stamp |
| Retainage | **Already** `retainage-cashflow-calculator` |

### Skip from the YC paste (do not build)

| Why | Examples from the paste |
|---|---|
| Compete with a funded core | Stripe, Rippling, Deel, Gusto, Scale AI, Benchling, Ironclad, Amplitude, Mixpanel, Segment, Zapier, Webflow, GitLab, Dropbox, Fivetran, Optimizely, PagerDuty, Algolia, Heroku, Lattice, Lever, Checkr |
| Marketplace / two-sided liquidity | Faire-the-app, Whatnot-the-app, GOAT-the-app, DoorDash-the-app, Instacart-the-app |
| Advice-of-record or regulated filing | Insurance carriers (Florin, Qlo, Mount, Hedge, Casey, Panta…), payroll, KYC/AML, medical diagnosis, drug discovery, legal OS, tax engine |
| Defense / hardware / energy plants | Oklo, Helion, Cruise, Embark, Rigetti, Zipline-class drones, 2026 robotics and interceptors |
| 2026 agent runtimes | OpenTag, Conifer, Dock, OneCLI, Amulet, machine0, InsForge, OpenWork, and the rest of the S26/F26 “agent OS” cluster |
| GEO / AI-visibility | Profound-class “how you show up in ChatGPT” — already screened out |
| Token-margin / inference billing | Conifer, Understudy, Touchmark, Baseten-class — screened as `token-margin-analytics` |
| Crypto / trading | Coinbase, SFOX, TradingView-class, prediction-market terminals |

---

## From Techstars (unicorn-registry names only)

Opened the public [portfolio page](https://www.techstars.com/portfolio). Names below are facts from that registry. No blurbs copied. ToS forbids mining the searchable directory and reproducing Site Content.

| Name | Niche-down tool | Call |
|---|---|---|
| ClassPass | Studio: ClassPass visit payout vs walk-in after rent + instructor | **Build** — local appointment money |
| GlossGenius | Salon/spa: booth rent + card % + software $ vs tickets needed this week | **Build** — pairs with `no-show-fee-calculator` |
| Preply | Tutor take-home after platform % (same family as Outschool / Cambly) | **Build** |
| Remitly | Corridor remittance fee (same family as Sendwave) | **Build** if we pick remittance |
| DigitalOcean | One small app: DO droplet $ vs a single AWS/GCP SKU the user types | **Build** — search “DigitalOcean vs AWS calculator” |
| Twilio / SendGrid | One campaign: SMS segments vs email volume at user-typed rates | **Build** |
| Veho | One ZIP: last-mile quote vs USPS/UPS the user pastes | Channel on `3pl-quote-normalizer` |
| DOOR | One building: amenity software $ / door vs fee you can charge | Maybe |
| Sendbird | Chat MAU × published rate — thin | Skip unless someone searches it |
| Alloy, Chainalysis, Outreach, SalesLoft, Self, TradingView, JumpCloud, DataRobot, Degreed, Newsela | Core product or advice/credit/trading/KYC | **Skip** |
| OpenLoop, Ginger, Owlet, PillPack | Telehealth / pharmacy / medical device | **Skip** |
| Uber, Zipline, Twelve, Scopely | Marketplace, drones, climate hardware, games | **Skip** |

---

## From South Park Commons (homepage featured names)

From [southparkcommons.com](https://www.southparkcommons.com/) “Our Companies” and member stories. Did not open `/members` or the JS companies index.

| Name | Niche-down tool | Call |
|---|---|---|
| Pilot | Founder: hours × DIY bookkeeping rate vs Pilot-class monthly $ the user types | **Build** — comparison, not a bookkeeping firm |
| Clerk | Monthly active users × Clerk vs Auth0 vs “roll your own” hours | **Build** |
| Render | One web service: Render $ vs Railway / Fly / DO the user types | Same family as DigitalOcean |
| Orb | Usage-billing — compete with a funded core | **Skip** |
| Baseten | Inference $ / 1M tokens — screened as token-margin | **Skip** |
| Unit21, Transcend, Doppel, Material Security | Fraud / privacy / security product | **Skip** |
| Profound | GEO / AI visibility — screened out | **Skip** |
| Gamma, Replit, Luma, Goodfire, Imbue | AI wrapper / model lab | **Skip** |
| Comun | Neobank | **Skip** |
| Anthropic | Model lab | **Skip** |
| Muon Space | Hardware / space | **Skip** |
| Atlys (press, not homepage) | Visa **checklist** (docs + fees the user types). Not a filing product. Same family as YC “Veeza AI” | Maybe |

---

## From Seedcamp (featured names only)

From the public [Our Companies](https://seedcamp.com/our-companies/) hero cards. We did **not** copy the 550-row table into this repo.

| Name | Niche-down tool | Call |
|---|---|---|
| Grover | One gadget: 12-month rent vs buy + resale the user types | **Build** — rent-vs-buy family with EquipmentShare |
| Vinterior | Vintage furniture seller: hammer/list vs platform % + delivery | **Build** — same family as AptDeco |
| Gaia | Cash-pay fertility: clinic quote vs at-home test $ the user types. Not medical advice | Maybe (disclaimer-heavy) |
| Pleo / Revolut | Expense card / neobank | **Skip** |
| Sorare | Crypto fantasy sport | **Skip** |

2026/2025 *shapes* on that page that are skip as products (legal, medical, KYC, debt collection, offensive security, chip design, pharma factories) and one that is a worksheet if we ever want it: **transportation-spend compare** (normalize 3 freight invoices) — belongs on `3pl-quote-normalizer`, not a new venture.

---

## From well-known VC names (not fetched)

The brief named Sequoia, Benchmark, a16z, Founders Fund, Accel, Lightspeed, Index, Greylock, KP, Thrive, GC, Bessemer, Khosla, Menlo, NEA, IVP, Coatue, ICONIQ, Battery. We opened a16z’s public portfolio page (tickers). We did not fetch the others.

Public facts only — the cores are **skip compete**. The worksheets their *customers* still run:

| Public company | Worksheet |
|---|---|
| Airbnb (a16z ticker ABNB; also YC) | Host payout — already listed |
| Instacart (CART) | Retailer SKU — already listed |
| Roblox (RBLX) | Creator: Robux → USD after platform split the user types |
| Lyft (LYFT) | Driver: hours × offers − fuel − platform. Not tax |
| Figma (FIG) | Seat $ × designers vs one Adobe seat — thin |
| Coinbase (COIN) | **Skip** trading |
| Okta / Slack (WORK) / PagerDuty | **Skip** compete |
| Stripe, NVIDIA, SpaceX, Palantir, Anduril, OpenAI | **Skip** (payments, chips, defense, models) |

500 Global / Antler / Alchemist / EF / Plug and Play: same rule — do not scrape their directories. If a later session needs a name, use a company the user pastes.

---

## Ranked next to ship

Prefer a product-line on an existing calculator when the buyer is the same.

| Priority | Idea | Home | Why this and not a clone |
|---|---|---|---|
| 1 | Whatnot livestream seller take-home | `where-to-sell-calculator` channel **or** small standalone | Same seller as eBay/Etsy; fee shape is live-show specific |
| 2 | ClassPass studio + GlossGenius salon weekly take-home | New `appointment-takehome-calculator` or extend `no-show-fee-calculator` | Local cash, searchable, $0 variable |
| 3 | Tutor take-home (Preply / Outschool / Cambly) | New or one page with a platform dropdown | Teachers already spreadsheet the cut |
| 4 | Grover + EquipmentShare rent vs buy | New `rent-vs-buy-calculator` (gadget **or** one machine — pick one) | Two portfolios, one arithmetic |
| 5 | Remitly / Sendwave corridor fee | Small standalone | Only with **user-typed published fees**, no FX advice |
| 6 | Goldbelly restaurant ship-vs-marketplace | Standalone | Makers with money; distinct from Faire |
| 7 | Cratejoy subscription-box unit econ | Standalone | Distinct buyer |
| 8 | Airbnb + Guesty host payout | Standalone | Distinct from Faire; not tax |
| 9 | GOAT / StockX authenticated resale | `where-to-sell-calculator` channel | Same family as Whatnot |
| 10 | GoCardless vs card on one invoice | `shopify-fee-calculator` adjacent or tiny page | Payments comparison, not a rail |
| 11 | DigitalOcean / Render / Clerk monthly compare | Tiny page | Search demand; user-typed list prices |
| 12 | Twilio SMS vs email campaign | Tiny page | User-typed rates |
| 13 | DoorDash / Instacart **merchant** ticket | Standalone | Not a Dasher/shopper app |
| 14 | Twitch / Roblox creator take-home | Tiny page | User-typed split |
| 15 | Vinterior / AptDeco resale fees | Channel on `where-to-sell-calculator` | Same as GOAT family |

Do not grow this list instead of shipping row 1–4.

## Job boards and Upwork

Useful only as *problem discovery* from a listing a human pasted. Typical paid gigs that map to worksheets we can give away: “normalize these 3PL quotes,” “what do I keep after Faire/Whatnot,” “salon booth vs commission,” “YouTube/Twitch take-home.” Do not log in, scrape, or email posters.
