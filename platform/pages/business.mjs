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
//     On 2026-11-24 that is Grant Autopilot alone (served at /grants/ by the
//     site Worker). Everything else is 'early-access' (software being built,
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
//   href      site-relative link to the product when live, else null
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
 */
export const INDUSTRIES = Object.freeze([
  Object.freeze({ slug: 'construction', name: 'Construction', who: 'Subcontractors, small general contractors, remodelers and roofers' }),
  Object.freeze({ slug: 'manufacturing', name: 'Manufacturing', who: 'CNC machine shops, fabricators and small defense suppliers' }),
  Object.freeze({ slug: 'online-sellers', name: 'Online sellers', who: 'Resellers and small shops on eBay, Poshmark, Mercari, Whatnot and Depop' }),
  Object.freeze({ slug: 'eu-e-invoicing', name: 'EU e-invoicing', who: 'Small businesses in Germany and France, and their accountants' }),
  Object.freeze({ slug: 'nonprofits', name: 'Nonprofits', who: 'Small nonprofits without a full-time grant writer' }),
]);

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
    product: 'Pay applications, retainage, lien waivers and change orders in one place, growing into a suite for running the whole job.',
    status: 'early-access',
    href: null,
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
    product: 'Payout reports from each platform in, fees split out, a Schedule C-ready profit and loss out.',
    status: 'early-access',
    href: null,
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
