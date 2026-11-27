// The company's product lines, in one place: who each is for, the jobs that
// customer most often struggles with, what the product is, and whether it is
// live. The home page, /products/ and /industries/ (products.mjs) read this,
// and the industry pages siblings add at `industries/<slug>/` should too.
//
// Why (owner, 2026-11-24): the home page and marketing pages move to "a
// for profit marketing style for portfolio of software and hardware products
// targeted to lots of specific smbs and the specific most common problems they
// have". Order and evidence: portfolio/monetization/bets.md.
//
// Honesty rules this file is held to (prompts/goals.md, hard limits; checked
// by business.test.mjs):
//   * `status: 'live'` only for a product a visitor can open and use today.
//     On 2026-11-24 that was Grant Autopilot alone (served at /grants/ by the
//     site Worker); on 2026-11-27 PayApps and Seller Books joined it, each open
//     on its Free plan at its own subdomain (payapps-deploy run 45949861746,
//     seller-books-deploy run 45973427499; their paid plans are not on sale).
//     Everything else is 'early-access' (software being built,
//     the free tools beside it are live) or 'long-term' (hardware designs;
//     nothing has been physically built).
//   * Problems are the customer's jobs in plain words. No percentages, no
//     customer counts, no testimonials, no prices that no checkout backs.
//
// Shape of a line (keep it this simple; siblings import it):
//   id        stable kebab-case id, also the anchor on /products/ (#<id>)
//   name      the product's name as a visitor reads it
//   customer  who it is for, plural, plain words
//   problems  3 or 4 jobs that customer most often struggles with
//   product   one sentence: what the product does for them
//   status    'live' | 'early-access' | 'long-term'
//   href      link to the product when live, else null: site-relative, or an
//             absolute https:// URL for an app on its own subdomain
//   industry  an INDUSTRIES slug, or null (hardware lines)
//   kind      'software' | 'hardware'
//   tools     slugs of free tools on this site that do part of the job today
//             (a page that renders them drops any the build did not publish)

/** Where early-access requests go: the agent-managed inbox (platform/edge/inbox.mjs). */
export const CONTACT_EMAIL = 'hello@marisstella.app';

export const STATUS = Object.freeze({
  live: Object.freeze({ label: 'Live', note: 'Open it and use it today.' }),
  'early-access': Object.freeze({ label: 'In development · early access', note: 'Being built now. The free tools beside it work today.' }),
  'long-term': Object.freeze({ label: 'Long-term · open design', note: 'An open design. Nothing has been physically built yet.' }),
});

/**
 * The industries, in the order pages list them. Each gets a page at
 * `industries/<slug>/`. products.mjs writes a plain one from this file; a
 * richer page a later build step writes to the same path replaces it.
 *
 * Owner, 2026-11-25: "we want to expand the industries we address for sure i
 * think. most types of smbs ... on the website and in general". So the list
 * covers most kinds of small business, in two groups:
 *   * the first five have a product line in development (PRODUCT_LINES) and
 *     are listed in bets.md's order;
 *   * the rest have no paid product yet. Their entry carries `problems` (the
 *     jobs we are starting from, in plain words) and `tools` (free tools on
 *     this site that do part of those jobs today), and their page asks the
 *     visitor which job to build first. Promote one by adding a line whose
 *     `industry` is its slug; the page then shows the product.
 * Honesty: an industry without a line never says a product exists, and its
 * problems are the jobs we are looking at, never "what customers tell us".
 */
const industry = (o) => Object.freeze({ ...o, problems: Object.freeze([...(o.problems ?? [])]), tools: Object.freeze([...(o.tools ?? [])]) });

export const INDUSTRIES = Object.freeze([
  industry({ slug: 'construction', name: 'Construction', who: 'Subcontractors, small general contractors, remodelers and roofers' }),
  industry({ slug: 'manufacturing', name: 'Manufacturing', who: 'CNC machine shops, fabricators and small defense suppliers' }),
  industry({ slug: 'online-sellers', name: 'Online sellers', who: 'Resellers and small shops on eBay, Poshmark, Mercari, Whatnot and Depop' }),
  industry({ slug: 'eu-e-invoicing', name: 'EU e-invoicing', who: 'Small businesses in Germany and France, and their accountants' }),
  industry({ slug: 'nonprofits', name: 'Nonprofits', who: 'Small nonprofits without a full-time grant writer' }),
  industry({
    slug: 'restaurants',
    name: 'Restaurants and food',
    who: 'Restaurants, cafes, food trucks, bakeries and caterers',
    problems: [
      'Knowing what each dish really costs as ingredient prices move',
      'Scheduling labor to match the rush without overstaffing the slow hours',
      'Seeing what the delivery apps take once every fee is counted',
      'Splitting tips fairly and within the rules',
    ],
    tools: ['recipe-costing-calculator', 'menu-engineering-calculator', 'restaurant-labor-cost-daypart-analyzer', 'restaurant-delivery-commission-analyzer', 'tip-pool-compliance-calculator'],
  }),
  industry({
    slug: 'home-services',
    name: 'Home services',
    who: 'Cleaning, lawn care, pest control, pool service and handyman businesses',
    problems: [
      'Quoting a job quickly and still making money on it',
      'Routing crews so less of the day is spent driving',
      'Turning one-off jobs into recurring service plans',
    ],
    tools: ['house-cleaning-quote-calculator', 'lawn-care-bid-calculator', 'pest-control-bid-calculator', 'pool-service-route-calculator', 'crew-dispatch-optimizer'],
  }),
  industry({
    slug: 'beauty',
    name: 'Beauty and personal care',
    who: 'Salons, barbershops, nail techs, lash and esthetics studios and tattoo artists',
    problems: [
      'Choosing between booth rent and commission, as an owner or a stylist',
      'Pricing services so each chair or room pays its way',
      'Filling empty appointment slots',
    ],
    tools: ['booth-rent-vs-commission', 'barbershop-chair-profit-calculator', 'nail-tech-booth-rent-calculator', 'lash-studio-profit-calculator', 'tattoo-piece-profit-calculator'],
  }),
  industry({
    slug: 'health-practices',
    name: 'Health practices',
    who: 'Independent dental, therapy, chiropractic and veterinary practices',
    problems: [
      'Seeing what each insurance plan actually pays after write-offs',
      'Billing time-based treatment codes correctly',
      'Pricing wellness and membership plans',
    ],
    tools: ['dental-ppo-writeoff-calculator', 'private-practice-payer-mix-calculator', 'therapy-8-minute-rule-calculator', 'veterinary-wellness-plan-pricing-calculator'],
  }),
  industry({
    slug: 'fitness',
    name: 'Fitness studios',
    who: 'Gyms, yoga and pilates studios, climbing gyms and personal trainers',
    problems: [
      'Pricing memberships and class packs',
      'Building a class timetable that fills',
      'Knowing which classes and trainers pay for themselves',
    ],
    tools: ['fitness-studio-membership-calculator', 'yoga-pilates-studio-class-profit-calculator', 'studio-class-slot-optimizer', 'personal-trainer-package-pricing-calculator'],
  }),
  industry({
    slug: 'retail',
    name: 'Retail shops',
    who: 'Independent shops, boutiques and consignment stores',
    problems: [
      'Reordering stock before it runs out, without overbuying',
      'Marking down slow stock at the right time',
      'Pricing for both wholesale and retail',
    ],
    tools: ['shopify-inventory-reorder-planner', 'clearance-markdown-planner', 'consignment-markdown-planner', 'wholesale-vs-retail-pricing-calculator'],
  }),
  industry({
    slug: 'auto',
    name: 'Auto services',
    who: 'Auto repair shops, tire shops, detailers and car washes',
    problems: [
      'Knowing the labor rate the shop really earns, not the posted one',
      'Keeping the margin on each ticket',
      'Selling memberships and service menus that customers keep',
    ],
    tools: ['auto-repair-effective-labor-rate', 'tire-shop-ticket-margin-calculator', 'car-wash-membership-calculator', 'mobile-detailing-bid-calculator'],
  }),
  industry({
    slug: 'professional-services',
    name: 'Professional services',
    who: 'Accountants, bookkeepers, law firms, insurance agencies and consultants',
    problems: [
      'Billing for the hours actually worked, and collecting it',
      'Pricing each client so the work pays',
      'Reconciling commissions and fees against what was earned',
    ],
    tools: ['law-firm-realization-rate-calculator', 'bookkeeping-client-fee-calculator', 'insurance-commission-reconciler', 'ai-bookkeeper'],
  }),
  industry({
    slug: 'property',
    name: 'Landlords and property',
    who: 'Small landlords, property managers and short-term rental hosts',
    problems: [
      'Keeping track of who has paid rent and who is late',
      'Raising rent with the right notice',
      'Seeing what a rental really earns once every cost is in',
    ],
    tools: ['rent-roll-delinquency-analyzer', 'rent-increase-notice-checker', 'property-management-profit-calculator', 'airbnb-earnings-report-analyzer'],
  }),
  industry({
    slug: 'trucking',
    name: 'Trucking and delivery',
    who: 'Owner-operators, small fleets, couriers and freight brokers',
    problems: [
      'Knowing your cost per mile before you take a load',
      'Filing fuel tax every quarter',
      'Getting paid for detention and other extra charges',
    ],
    tools: ['owner-operator-cpm-calculator', 'ifta-quarterly-fuel-tax-calculator', 'truck-detention-pay-calculator', 'freight-accessorial-auditor', 'freight-broker-load-margin-calculator'],
  }),
  industry({
    slug: 'farms',
    name: 'Farms and growers',
    who: 'Family farms, ranches and growers who sell direct',
    problems: [
      'Choosing what to plant, and whether to store or sell the crop',
      'Pricing custom work and farmers market sales',
      'Knowing which enterprise on the farm makes money',
    ],
    tools: ['farm-crop-mix-optimizer', 'grain-store-or-sell-calculator', 'custom-farm-rate-calculator', 'farmers-market-booth-calculator'],
  }),
  industry({
    slug: 'childcare-education',
    name: 'Childcare and education',
    who: 'Childcare centers, tutors, music teachers and driving schools',
    problems: [
      'Setting tuition that covers staff and rent',
      'Filling every place in every age group or class',
      'Scheduling lessons around everyone’s week',
    ],
    tools: ['childcare-tuition-calculator', 'childcare-enrollment-mix-optimizer', 'tutor-package-pricing-calculator', 'tutor-weekly-schedule-optimizer'],
  }),
  industry({
    slug: 'events',
    name: 'Weddings and events',
    who: 'Venues, photographers, florists, caterers and rental companies',
    problems: [
      'Pricing each date and package so peak season pays for the rest',
      'Writing proposals quickly enough to win the booking',
      'Planning the day so every vendor knows the timeline',
    ],
    tools: ['wedding-venue-date-pricing-optimizer', 'wedding-photographer-profit-calculator', 'wedding-florist-proposal-calculator', 'catering-quote-calculator', 'wedding-day-timeline-builder'],
  }),
  industry({
    slug: 'freelancers',
    name: 'Freelancers and solo businesses',
    who: 'Freelancers, consultants, creators and one-person businesses',
    problems: [
      'Setting a rate, and raising it',
      'Putting aside enough for quarterly taxes',
      'Writing contracts and proposals that protect you',
    ],
    tools: ['freelance-rate-increase-calculator', 'us-freelancer-tax-set-aside-calculator', 'quarterly-estimated-tax-calendar', 'freelance-contract-maker', 'freelance-proposal-maker'],
  }),
]);

/** Industries with at least one product line in development or live. */
export function industriesWithProducts(lines = PRODUCT_LINES) {
  return INDUSTRIES.filter((i) => lines.some((l) => l.industry === i.slug));
}

/** Industries with free tools today and no paid product yet. */
export function industriesWithoutProducts(lines = PRODUCT_LINES) {
  return INDUSTRIES.filter((i) => !lines.some((l) => l.industry === i.slug));
}

/** A mailto link asking which job to build first for an industry with no product yet. */
export function buildFirstHref(ind) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Build first for ${ind.name}`)}`;
}

const line = (o) => Object.freeze({ ...o, problems: Object.freeze([...o.problems]), tools: Object.freeze([...(o.tools ?? [])]) });

export const PRODUCT_LINES = Object.freeze([
  line({
    id: 'contractor-billing',
    name: 'Contractor billing',
    customer: 'Specialty subcontractors and small general contractors',
    problems: [
      'Getting the monthly pay application (AIA-style G702/G703) right before the general contractor’s cutoff',
      'Keeping track of the retainage that is owed back to you',
      'Collecting lien waivers, and not missing a lien deadline',
      'Getting approved change orders onto the next bill',
    ],
    product: 'PayApps: pay applications, retainage and change orders in one place, free on one job with no card. Lien waivers, QuickBooks and job costing come with larger plans, which are not on sale yet.',
    status: 'live',
    href: 'https://payapps.marisstella.app/?signup&from=products',
    industry: 'construction',
    kind: 'software',
    tools: ['pay-application-generator', 'retainage-cashflow-calculator', 'lien-waiver-checker', 'mechanics-lien-deadline-calculator'],
  }),
  line({
    id: 'jobshop-quoting',
    name: 'Job shop quoting',
    customer: 'CNC machine shops and fabricators',
    problems: [
      'Turning an RFQ’s drawings and emails into a priced quote takes hours',
      'Quoting the same way every time, from your own shop rates',
      'Fitting new work around the jobs already on the floor',
    ],
    product: 'RFQ in, priced quote out, using your shop’s own rates and setup times.',
    status: 'early-access',
    href: null,
    industry: 'manufacturing',
    kind: 'software',
    tools: ['cnc-machining-quote-calculator', 'job-shop-scheduler'],
  }),
  line({
    id: 'einvoice-fix',
    name: 'E-invoice fix-and-explain',
    customer: 'Small businesses in Germany and France, and their accountants',
    problems: [
      'Knowing whether an invoice meets XRechnung, ZUGFeRD or Factur-X before the e-invoicing deadlines',
      'Understanding what a validator’s error message actually means',
      'Fixing a rejected invoice without breaking something else',
      'Checking every client’s invoices at once, for accountants',
    ],
    product: 'Each failed rule explained in plain language, with a corrected file and a per-client view for accountants.',
    status: 'early-access',
    href: null,
    industry: 'eu-e-invoicing',
    kind: 'software',
    tools: ['einvoice-preflight'],
  }),
  line({
    id: 'seller-books',
    name: 'Reseller profit and books',
    customer: 'Resellers on eBay, Poshmark, Mercari, Whatnot and Depop',
    problems: [
      'Knowing your real profit after every platform’s fees',
      'Keeping track of what each item cost you, and your mileage',
      'Combining several platforms’ payout reports into one set of books',
      'Getting a Schedule C-ready profit and loss at tax time',
    ],
    product: 'Seller Books: each platform\'s reports in, fees and cost of goods split out, a Schedule C worksheet out. Free on one platform with no card; plans for more platforms are not on sale yet.',
    status: 'live',
    href: 'https://seller-books.marisstella.app/signup?from=products',
    industry: 'online-sellers',
    kind: 'software',
    tools: ['reseller-books', 'ebay-fee-calculator', 'poshmark-fee-calculator', 'ebay-payout-to-journal'],
  }),
  line({
    id: 'residential-takeoff',
    name: 'Takeoff and material lists',
    customer: 'Remodelers, roofers and framers',
    problems: [
      'Counting materials off a PDF plan set by hand',
      'Turning a plan into a framing, roofing or siding list before you can price the job',
      'Pricing a job fast enough to win it',
    ],
    product: 'A framing, roofing or siding material list from a plan set, feeding the price straight into a bid.',
    status: 'early-access',
    href: null,
    industry: 'construction',
    kind: 'software',
    tools: ['wall-framing-takeoff', 'pdf-plan-takeoff', 'roofing-bid-calculator', 'siding-bid-calculator'],
  }),
  line({
    id: 'grant-autopilot',
    name: 'Grant Autopilot',
    customer: 'Small nonprofits',
    problems: [
      'Finding grants you actually qualify for',
      'Writing applications without a full-time grant writer',
      'Keeping track of deadlines and the reports funders ask for',
    ],
    product: 'A hosted grants app for small nonprofits. It is live: open it to see what it does today.',
    status: 'live',
    href: 'grants/',
    industry: 'nonprofits',
    kind: 'software',
    tools: ['grant-deadline-tracker', 'grant-reporting-tracker', 'grant-indirect-cost-calculator'],
  }),
  line({
    id: 'robot-mower',
    name: 'Open Robot Mower',
    customer: 'Landscaping and grounds-care businesses',
    problems: [
      'Crew hours spent mowing the same large lawns every week',
      'Boundary wires that have to be buried and repaired',
    ],
    product: 'An open design for a wire-free robot mower: CAD, firmware and parts list. A manufactured product is a long-term plan.',
    status: 'long-term',
    href: null,
    industry: null,
    kind: 'hardware',
    tools: ['open-robot-mower'],
  }),
  line({
    id: 'floor-robots',
    name: 'Open Floor Robots',
    customer: 'Cleaning businesses and small facilities',
    problems: [
      'Crew hours spent on routine vacuuming and mopping',
      'Robots that cannot be repaired when a part fails',
    ],
    product: 'An open design for a robot vacuum, mop and combo on one chassis. A manufactured product is a long-term plan.',
    status: 'long-term',
    href: null,
    industry: null,
    kind: 'hardware',
    tools: ['open-floor-robots'],
  }),
  line({
    id: 'tennis-robots',
    name: 'Open Tennis Robots',
    customer: 'Tennis coaches and clubs',
    problems: [
      'Lesson time lost feeding and picking up balls',
      'Solo practice without a partner to hit back',
    ],
    product: 'An open design for a ball machine with a moving catch net and a ball-collecting rover. A manufactured product is a long-term plan.',
    status: 'long-term',
    href: null,
    industry: null,
    kind: 'hardware',
    tools: ['open-tennis-robots'],
  }),
]);

/** Software lines first, live before early access, otherwise in file order (bets.md's ranking). */
export function softwareLines(lines = PRODUCT_LINES) {
  const rank = { live: 0, 'early-access': 1, 'long-term': 2 };
  return lines.filter((l) => l.kind === 'software').map((l, i) => ({ l, i }))
    .sort((a, b) => rank[a.l.status] - rank[b.l.status] || a.i - b.i).map(({ l }) => l);
}

export function hardwareLines(lines = PRODUCT_LINES) {
  return lines.filter((l) => l.kind === 'hardware');
}

/** The lines for one industry slug. */
export function linesForIndustry(slug, lines = PRODUCT_LINES) {
  return lines.filter((l) => l.industry === slug);
}

/** A mailto link asking for early access to a line. */
export function earlyAccessHref(lineOrName) {
  const name = typeof lineOrName === 'string' ? lineOrName : lineOrName.name;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Early access: ${name}`)}`;
}
