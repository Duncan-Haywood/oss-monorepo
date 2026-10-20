/**
 * "Free tools for <who you are>" pages: one per trade or kind of business.
 *
 * Why these exist beside the category pages. A category is filed by the job a
 * tool does ("Trade & contractor bids", 187 tools); a searcher names
 * themselves ("free tools for roofers", "calculators for Etsy sellers",
 * "how to price a dog grooming business"). The trades category page cannot
 * rank for "roofers" without being a roofing page, and it is not: a roofer
 * landing on it reads past 180 other trades. An audience page is about one
 * kind of person, lists only the tools that serve them, and is the page a
 * search for that person can land on.
 *
 * Membership is a keyword test on the slug, like `CATEGORY_RULES`, and for the
 * same reason: a tool lands on `main` most days and a hand-kept list would go
 * stale within a week. Unlike a category, a tool may serve several audiences
 * (a gutter-cleaning bid is a roofer's and a cleaner's), so every audience is
 * tested independently rather than first-match-wins.
 *
 * The patterns anchor on slug word boundaries (`(^|-)`) wherever a bare word
 * would match inside another one: "pet-" is inside "carpet-", "tutor" inside
 * "statutory", "venue" inside "revenue", "ranch" inside "branch". The tests in
 * `audiences.test.mjs` pin those cases.
 *
 * Guard against thin pages: an audience with fewer than `MIN_AUDIENCE_TOOLS`
 * matching tools is not published at all. A page listing two tools under a
 * heading promising "free tools for X" is the doorway page search engines
 * penalise, and it would be a poor answer to the person who searched.
 *
 * Copy rules: `who` finishes the sentence "free tools for …" mid-sentence
 * (so it keeps proper nouns' capitals and nothing else); the title is the phrase a person types; the intro says what the
 * tools do for this person without claiming anything a particular tool does
 * not do; `starting` speaks to someone deciding whether to start this kind of
 * business, because "how much should I charge" is the first question they
 * search and the tools here answer it.
 */

/** Below this many tools an audience page is not published. */
export const MIN_AUDIENCE_TOOLS = 4;

/** Audience page ids live under the category prefix as `for-<id>`. */
export const AUDIENCE_ID_PREFIX = 'for-';

export const AUDIENCES = [
  {
    id: 'roofers',
    who: 'roofers',
    name: 'Roofers',
    title: 'Free tools for roofing, gutter and siding contractors',
    description:
      'Free roofing bid calculators: asphalt, metal and flat roofs, gutters, gutter guards, siding and skylights. Price the job, print the proposal, keep the margin.',
    intro:
      'Bid calculators for the work a roofing company sells: tear-offs and re-roofs, metal and flat roofs, gutters and guards, siding, soffit and skylights. Each one prices materials, crew time and overhead the way the trade does, then prints a proposal the homeowner can sign.',
    starting:
      'Starting a roofing or gutter business? Run a few sample jobs through these before you quote a real one: the gap between what you planned to charge and what the job has to sell for is the first thing they show.',
    match: /roof|shingle|gutter|(^|-)siding|skylight|soffit|ice-dam|chimney/,
    exclude: /waterproof/,
  },
  {
    id: 'hvac',
    who: 'HVAC contractors',
    name: 'HVAC contractors',
    title: 'Free HVAC bid and pricing calculators',
    description:
      'Free HVAC pricing tools: furnace, boiler and mini-split bids, maintenance agreements, repair price tiers, duct cleaning and heat pump vs furnace comparisons.',
    intro:
      'Pricing tools for heating and cooling work: replacement bids for furnaces, boilers and mini-splits, maintenance agreement pricing, flat-rate repair tiers, and the comparisons homeowners ask about before they buy.',
    starting:
      'Going out on your own as an HVAC tech? The maintenance-agreement and repair-tier calculators show what a service call has to cost to pay for the truck, the insurance and the hours you do not bill.',
    match: /hvac|furnace|mini-split|heat-pump|boiler|(^|-)duct-|dryer-vent|attic-insulation|spray-foam/,
  },
  {
    id: 'plumbers',
    who: 'plumbers',
    name: 'Plumbers',
    title: 'Free plumbing bid and flat-rate pricing calculators',
    description:
      'Free plumbing pricing tools: flat-rate pricing, water heaters, sewer lines, hydro-jetting, sump and well pumps, septic pumping and french drains.',
    intro:
      'Bid and flat-rate calculators for plumbing, sewer and drain work. Each prices parts, labour and the overhead a service van carries, so a quote covers the whole job rather than just the materials.',
    starting:
      'Starting a plumbing or drain business? The flat-rate calculator turns your own costs into a price book, which is the hardest part of leaving a shop that set prices for you.',
    match: /plumb|water-heater|sewer|(^|-)drain|septic|well-pump|sump-pump|water-softener|repipe|water-well/,
  },
  {
    id: 'electricians',
    who: 'electricians',
    name: 'Electricians',
    title: 'Free electrical bid calculators for electricians',
    description:
      'Free bid calculators for electricians: panel upgrades, EV chargers, standby generators, solar PV, landscape lighting and security camera installs.',
    intro:
      'Bid calculators for the electrical jobs homeowners and small businesses ask for most: service and panel upgrades, EV charger circuits, standby generators, solar arrays, low-voltage camera systems and outdoor lighting.',
    starting:
      'Starting an electrical contracting business? Price a panel upgrade and an EV charger here with your own labour rate; those two jobs are most of a new shop\'s residential calls.',
    match: /electric|ev-charger|standby-generator|(^|-)lighting|solar-pv|security-camera|holiday-light/,
    exclude: /fleet/,
  },
  {
    id: 'painters',
    who: 'painters',
    name: 'Painters',
    title: 'Free painting bid calculators for painting contractors',
    description:
      'Free painting estimate calculators: interior and exterior painting, cabinet refinishing, deck staining, epoxy floors, drywall and popcorn ceilings.',
    intro:
      'Estimate calculators for painting and finish work. They take the measurements you already collect, apply coverage and production rates, and add the prep, materials and overhead a per-square-foot guess leaves out.',
    starting:
      'Starting a painting business? Most new painters underprice prep and travel. Run a sample room and a sample exterior here and compare the result with the price you had in mind.',
    match: /paint|(^|-)stain|cabinet-refinish|epoxy|popcorn-ceiling|(^|-)drywall|stucco|wallpaper/,
    exclude: /paintless/,
  },
  {
    id: 'cleaning-businesses',
    who: 'cleaning businesses',
    name: 'Cleaning businesses',
    title: 'Free pricing calculators for cleaning businesses',
    description:
      'Free quote calculators for house cleaning, janitorial contracts, carpet, window and duct cleaning, pressure washing, junk removal and Airbnb turnovers.',
    intro:
      'Quote calculators for residential and commercial cleaning: recurring house cleans, janitorial contracts, carpet, windows, pressure washing, hood and duct cleaning, junk removal and hoarding clean-outs.',
    starting:
      'Starting a cleaning business is cheap; pricing it is the hard part. These turn square footage, frequency and travel into a per-visit price that still pays you after supplies and drive time.',
    match: /clean|maid|janitor|pressure-wash|power-wash|junk-removal|move-out|biohazard|hoarding/,
    exclude: /carpet-install|dry-cleaner/,
  },
  {
    id: 'landscapers',
    who: 'landscapers',
    name: 'Landscapers',
    title: 'Free landscaping and lawn care bid calculators',
    description:
      'Free bid calculators for landscapers: lawn care, aeration, sod, irrigation, pavers, retaining walls, fences, tree work, snow removal and landscape lighting.',
    intro:
      'Bid calculators for lawn care and landscape contractors, from weekly mowing routes to hardscape installs and winter snow contracts. Each prices materials, crew hours and equipment, then prints a proposal.',
    starting:
      'Starting a lawn care or landscaping business? Price a mowing route and one hardscape job here: the first shows whether the route pays for the mower, the second what an install has to earn.',
    match: /lawn|landscap|(^|-)sod-|mulch|(^|-)tree-service|irrigation|hardscap|paver|(^|-)snow-|turf|(^|-)fence|retaining-wall|hydroseed|pergola/,
  },
  {
    id: 'pool-hot-tub',
    who: 'pool and hot tub pros',
    name: 'Pool & hot tub pros',
    title: 'Free pool service and pool route pricing calculators',
    description:
      'Free pricing tools for pool service companies: weekly route pricing, openings and closings, plaster and vinyl liner replacement, and hot tub installs.',
    intro:
      'Pricing tools for pool and spa businesses: what a weekly service stop has to cost, seasonal openings and closings, resurfacing and liner jobs, and hot tub installs.',
    starting:
      'Starting a pool route? The route calculators show how many stops a day it takes to cover chemicals, fuel and your own pay, before you buy a route or knock on doors.',
    match: /(^|-)pool-|hot-tub|vinyl-liner/,
    exclude: /tip-pool|swim-lesson/,
  },
  {
    id: 'auto-detailing-repair',
    who: 'auto detailers and repair shops',
    name: 'Auto detailing & repair',
    title: 'Free pricing tools for auto detailers and repair shops',
    description:
      'Free pricing calculators for mobile detailing, window tint, vehicle wraps, auto glass, dent repair, towing and a repair shop\'s effective labour rate.',
    intro:
      'Pricing tools for businesses that work on vehicles: detailing packages, tint and wraps, glass, dent repair, towing rates, and the labour rate a shop actually earns after comebacks and unbilled hours.',
    starting:
      'Starting a mobile detailing or tint business? Price your packages here with your own supplies and drive time before you post a price list.',
    match: /detailing|window-tint|vehicle-wrap|auto-glass|paintless|tow-truck|auto-repair|(^|-)car-wash/,
  },
  {
    id: 'etsy-sellers',
    who: 'Etsy sellers',
    name: 'Etsy sellers',
    title: 'Free Etsy fee, profit and ads calculators',
    description:
      'Free Etsy seller tools: fee and profit calculator, Etsy Ads ROI, monthly statement profit, a listing CSV check and statement-to-bookkeeping export.',
    intro:
      'Tools for Etsy shops: what an order really nets after listing, transaction, payment and ads fees; whether Etsy Ads pay for themselves; and your monthly statement turned into a profit figure and bookkeeping entries.',
    starting:
      'Thinking of opening an Etsy shop? Put one product through the profit calculator with your real material cost and shipping first; many items that sell well do not survive the fees.',
    match: /etsy/,
  },
  {
    id: 'ebay-sellers',
    who: 'eBay sellers',
    name: 'eBay sellers',
    title: 'Free eBay fee and profit calculators',
    description:
      'Free eBay seller tools: fee calculator, Promoted Listings ROI, transaction report analysis, File Exchange check and payouts to bookkeeping entries.',
    intro:
      'Tools for eBay sellers: final value fees, promoted listing spend against the sales it brought, your transaction report turned into a profit picture, and payouts exported to your books.',
    starting:
      'Starting to resell on eBay? Run a few items through the fee calculator with what you paid for them; the sale price that breaks even is usually higher than it looks.',
    match: /ebay/,
  },
  {
    id: 'amazon-sellers',
    who: 'Amazon sellers and KDP authors',
    name: 'Amazon sellers & KDP authors',
    title: 'Free Amazon FBA and KDP seller calculators',
    description:
      'Free Amazon seller tools: FBA fee and profit calculator, PPC search terms, aged inventory fees, reimbursement claims, KDP royalties and settlements.',
    intro:
      'Tools for Amazon sellers and self-published authors: FBA fees and profit per unit, PPC search terms worth keeping, aged-inventory surcharges, reimbursement claims, and KDP royalty reports turned into numbers you can act on.',
    starting:
      'Researching a first FBA product or a first book? The FBA and KDP royalty calculators show what each sale leaves you before you order stock or set a price.',
    match: /amazon|(^|-)fba-|(^|-)kdp-/,
  },
  {
    id: 'shopify-stores',
    who: 'Shopify stores',
    name: 'Shopify stores',
    title: 'Free Shopify fee, payout and CSV tools',
    description:
      'Free tools for Shopify stores: fee calculator, payout profit, discount leakage, inventory reorder planning and product, customer and inventory CSV checks.',
    intro:
      'Tools for Shopify store owners: payment and app fees, what each payout really was in profit, discounts that leaked margin, when to reorder, and import CSVs checked before Shopify rejects them.',
    starting:
      'Setting up a Shopify store? The CSV checks catch the import errors that stall a launch, and the fee calculator shows which plan your volume actually justifies.',
    match: /shopify/,
  },
  {
    id: 'resellers',
    who: 'resellers',
    name: 'Resellers',
    title: 'Free reseller fee calculators: Poshmark, Mercari, Depop',
    description:
      'Free fee calculators for resellers on Poshmark, Mercari, Depop, Grailed, Whatnot, StockX and Reverb, plus a where-to-sell comparison and thrift picker.',
    intro:
      'Fee and payout calculators for the resale apps, side by side: what an item nets on each platform, which one to list it on, and which thrift or pallet finds are worth buying for resale at all.',
    starting:
      'Starting a reselling side hustle? The where-to-sell comparison and the thrift buy picker are built for the first question: is this item worth buying to flip.',
    match: /poshmark|mercari|depop|whatnot|stockx|resell|thrift|grailed|where-to-sell|discogs|reverb|liquidation-pallet|storage-auction/,
  },
  {
    id: 'landlords',
    who: 'landlords and hosts',
    name: 'Landlords & hosts',
    title: 'Free tools for landlords and short-term rental hosts',
    description:
      'Free landlord tools: rent increases, renewals, security deposit returns, rent rolls, DSCR, cap rate, Schedule E, and Airbnb pricing, cleaning fees and payouts.',
    intro:
      'Tools for people who rent out property, long-term or short-term: setting and raising rent, deposit deadlines and returns, rent roll delinquency, lender DSCR, Schedule E categories, and nightly rates, cleaning fees and payouts for Airbnb-style hosts.',
    starting:
      'Buying a first rental or listing a spare room? The house-hack, DSCR and short-term rental calculators show what the property has to earn before you sign.',
    match: /landlord|(^|-)rental-(property|dscr|ledger|rent)|tenant|(^|-)rent-(increase|roll|a-room)|renewal-rent|security-deposit|airbnb|vrbo|(^|-)str-|midterm-rental|house-hack|cap-rate|section-24|commercial-lease|schedule-e/,
  },
  {
    id: 'freelancers',
    who: 'freelancers',
    name: 'Freelancers',
    title: 'Free tools for freelancers and the self-employed',
    description:
      'Free freelancer tools: rate and retainer calculators, proposals, contracts, invoices, late payers, tax set-aside, self-employment tax and SEP-IRAs.',
    intro:
      'Tools for working for yourself: setting a rate and raising it, retainers versus hourly, proposals, contracts and invoices, chasing late payers, and the tax you need to set aside from every payment.',
    starting:
      'Going freelance? Start with the rate calculator and the tax set-aside calculator for your country: together they say what you have to bill to replace a salary.',
    match: /freelanc|self-employ|sole-trader|sole-prop|quarterly-estimated|sep-ira|solo-401k|invoice-(maker|aging|factoring|payment-terms)|late-invoice|proposal-maker|tax-set-aside|1099-k-/,
  },
  {
    id: 'photographers',
    who: 'photographers and videographers',
    name: 'Photographers & videographers',
    title: 'Free pricing and profit tools for photographers',
    description:
      'Free tools for photographers and videographers: wedding and real estate shoot profit, commercial licensing fees, photo booth quotes and batch editing.',
    intro:
      'Pricing tools for photo and video work: what a wedding or a real estate shoot actually pays after editing hours and gear, how to price a commercial licence, and photo booth event quotes.',
    starting:
      'Starting a photography business? Price one wedding or one listing shoot here with your own editing time; it is the number that decides whether your package prices work.',
    match: /photograph|(^|-)photo-|videograph/,
    exclude: /real-estate-agent/,
  },
  {
    id: 'wedding-event-pros',
    who: 'wedding and event pros',
    name: 'Wedding & event pros',
    title: 'Free pricing tools for wedding and event businesses',
    description:
      'Free tools for event businesses: DJ gigs, florists, officiants, venues, mobile bars, photo booths, bounce house and tent rentals, and seating charts.',
    intro:
      'Pricing and planning tools for people who work weddings and events: per-gig profit for DJs and officiants, florist proposals, venue date pricing, rental inventory payback, mobile bar and photo booth quotes, and the seating chart and timeline the couple asks for.',
    starting:
      'Starting an event rental, DJ or florist business? The payback and per-gig calculators show how many bookings the equipment or the season needs before it pays for itself.',
    match: /wedding|(^|-)event-|(^|-)dj-|florist|(^|-)venue|party-rental|bounce-house|tent-rental|officiant/,
    exclude: /fundraising/,
  },
  {
    id: 'restaurants-bars',
    who: 'restaurants, cafes and bars',
    name: 'Restaurants, cafes & bars',
    title: 'Free restaurant, cafe and bar pricing calculators',
    description:
      'Free tools for restaurants, cafes, bars and breweries: recipe costing, menu engineering, pour cost, tip pools, labour, delivery fees and catering.',
    intro:
      'Pricing tools for food and drink businesses: plate and recipe cost, which menu items earn their place, pour cost, tip pool splits that stay compliant, labour by daypart, delivery app commissions, catering quotes and brewery batch margins.',
    starting:
      'Opening a cafe, food business or bar? Cost your menu with the recipe costing and pour cost calculators before you print it; a price set by a competitor\'s menu is set on their costs, not yours.',
    match: /restaurant|menu-engineering|pour-cost|(^|-)bar-|cocktail|recipe-costing|catering|bakery|(^|-)cafe|coffee-(cart|roaster)|brew|tip-pool|ghost-kitchen|food-truck|mobile-bartender/,
    exclude: /axe-throwing/,
  },
  {
    id: 'pet-businesses',
    who: 'pet businesses',
    name: 'Pet businesses',
    title: 'Free pricing tools for dog groomers, walkers and pet sitters',
    description:
      'Free tools for pet businesses: dog grooming prices and profit, dog walking routes, boarding and daycare pricing, pet sitting fees and vet pricing.',
    intro:
      'Pricing tools for pet care businesses: groomers, walkers, sitters, boarding and daycare, pet waste removal, self-serve dog washes and veterinary practices.',
    starting:
      'Starting a dog walking or grooming business? The route and per-groom calculators show how many dogs a day it takes to earn what you need, before you set your prices.',
    match: /(^|-)(pet|dog|vet|horse)-|groom|kennel|veterinar/,
  },
  {
    id: 'creators',
    who: 'creators',
    name: 'Creators',
    title: 'Free tools for YouTubers, podcasters and newsletter writers',
    description:
      'Free creator tools: YouTube RPM, sponsorship and brand deal rates, UGC rates, media kits, and Patreon, Substack, Twitch and Gumroad payouts.',
    intro:
      'Tools for people who earn from an audience: what to charge a sponsor on YouTube, a podcast or a newsletter, UGC and brand deal rates, a media kit, and payouts from Patreon, Twitch, Gumroad and Ko-fi turned into numbers you can book.',
    starting:
      'Starting to take sponsors? The sponsorship rate calculators turn your real views or downloads into a price you can defend, instead of a number you were offered.',
    match: /youtube|podcast|patreon|substack|twitch|newsletter|creator|influencer|(^|-)ugc-|media-kit|brand-deal|ko-fi|gumroad/,
  },
  {
    id: 'childcare',
    who: 'childcare providers',
    name: 'Childcare providers',
    title: 'Free tools for daycares and childcare providers',
    description:
      'Free tools for childcare businesses: tuition pricing, break-even for a centre, enrollment mix by age group, and nanny tax for families employing a carer.',
    intro:
      'Tools for running childcare: setting tuition, the enrolment a centre needs to break even, the age-group mix that the staffing ratios allow, and nanny payroll tax for families.',
    starting:
      'Opening a home daycare or a centre? The break-even and enrolment mix calculators show how many children, of which ages, it takes to cover staff and rent.',
    match: /childcare|(^|-)daycare|nanny|babysit|preschool/,
    exclude: /(^|-)(dog|pet)-|tax-free-childcare/,
  },
  {
    id: 'tutors-teachers',
    who: 'tutors and teachers',
    name: 'Tutors & teachers',
    title: 'Free pricing tools for tutors and music teachers',
    description:
      'Free tools for tutors and instructors: package pricing, effective hourly rate, weekly schedules, music studio profit, driving lessons and courses.',
    intro:
      'Pricing tools for people who teach: tutoring packages and the hourly rate they really work out to, a weekly schedule that fits, music studio and driving instructor pricing, and the fees and revenue of an online course.',
    starting:
      'Starting to tutor or teach lessons privately? The effective hourly rate calculator includes the prep and travel a per-hour price hides.',
    match: /(^|-)tutor|lesson|music-teacher|teachers-pay|course-(platform|launch)|driving-instructor/,
  },
  {
    id: 'truckers',
    who: 'truckers and owner-operators',
    name: 'Truckers & owner-operators',
    title: 'Free calculators for owner-operators and freight brokers',
    description:
      'Free trucking tools: owner-operator cost per mile, load chaining, per diem, IFTA fuel tax, detention pay, LTL freight class and broker load margin.',
    intro:
      'Tools for owner-operators, small fleets and brokers: cost per mile and the rate a load has to pay, chaining loads, per diem and IFTA, detention pay, freight class, car hauler loads and broker margin.',
    starting:
      'Getting your own authority? The cost-per-mile calculator is the number every load decision depends on; work it out before you book the first one.',
    match: /owner-operator|(^|-)truck|ltl-|hotshot|ifta|freight-broker|car-hauler|tow-truck/,
    exclude: /food-truck/,
  },
  {
    id: 'farms',
    who: 'farms and homesteads',
    name: 'Farms & homesteads',
    title: 'Free farm, ranch and homestead profit calculators',
    description:
      'Free tools for small farms: crop mix, CSA share pricing, farmers market booths, cattle margins, hay prices, custom farm rates and cottage food pricing.',
    intro:
      'Tools for small farms, ranches and homesteads: what to grow, what a CSA share or a market booth has to charge, cattle and flock margins, hay and custom work rates, and cottage food pricing.',
    starting:
      'Starting a market garden, CSA or homestead business? The CSA and farmers market calculators show the price a share or a stall day needs to cover what you put in.',
    match: /(^|-)farm|(^|-)ranch|cattle|(^|-)hay-|(^|-)crop-|cottage-food|(^|-)csa-|orchard|(^|-)egg|goat|honey|livestock|oyster-farm|(^|-)u-pick|christmas-tree/,
  },
  {
    id: 'health-practices',
    who: 'therapists and clinics',
    name: 'Therapists & clinics',
    title: 'Free tools for private practices, therapists and clinics',
    description:
      'Free tools for private practices: payer mix, the therapy 8-minute rule, good faith estimates, ABA authorizations, dental PPO write-offs and more.',
    intro:
      'Tools for small health practices: billing rules such as the 8-minute rule, good faith estimates, payer mix, authorisation tracking, dental associate pay and PPO write-offs, and the economics of a massage or chiropractic practice.',
    starting:
      'Opening a private practice? The payer mix calculator shows what accepting each insurer does to your average visit before you sign their contract.',
    match: /therap|counsel|(^|-)aba-|dental|chiropr|massage|private-practice|good-faith-estimate|medical-billing|superbill/,
    exclude: /veterinar/,
  },
  {
    id: 'salons-beauty',
    who: 'salons and beauty pros',
    name: 'Salons & beauty pros',
    title: 'Free pricing tools for salons, barbers and beauty pros',
    description:
      'Free tools for salons and beauty pros: booth rent vs commission, barber chair profit, lash and esthetician pricing, nail booth rent and tattoo pricing.',
    intro:
      'Pricing tools for salons and independent beauty professionals: whether to rent a booth or work on commission, what a chair earns, studio and service pricing for lash, esthetics and nails, bridal packages and tattoo pieces.',
    starting:
      'Going independent as a stylist, barber or lash artist? The booth rent vs commission calculator answers the first decision: at what weekly takings renting your own chair pays.',
    match: /salon|barber|booth-rent|stylist|(^|-)(lash|hair|nail)-|esthetic|tattoo/,
  },
];

export function audiencePageId(audience) {
  return `${AUDIENCE_ID_PREFIX}${audience.id}`;
}

/** Does this audience's rule claim the slug? */
export function audienceMatches(audience, slug) {
  return audience.match.test(slug) && !(audience.exclude && audience.exclude.test(slug));
}

/**
 * The audiences worth a page, each with the surfaces it lists, in `AUDIENCES`
 * order. Audiences below `MIN_AUDIENCE_TOOLS` are dropped rather than
 * published thin.
 */
export function audienceGroups(surfaces, { min = MIN_AUDIENCE_TOOLS } = {}) {
  return AUDIENCES.map((audience) => ({
    audience,
    items: surfaces.filter((s) => audienceMatches(audience, s.slug)),
  })).filter(({ items }) => items.length >= min);
}

/** The published audiences a slug belongs to, for linking from a tool page. */
export function audiencesFor(slug, groups) {
  return groups.filter(({ items }) => items.some((s) => s.slug === slug)).map(({ audience }) => audience);
}
