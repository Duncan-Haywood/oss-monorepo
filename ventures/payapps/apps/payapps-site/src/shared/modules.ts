// One landing page per built module of the app, each aimed at the search a buyer makes for that job
// ("lien waiver software", "certified payroll software"), rendered by src/site/pages.ts (modulePage)
// from the matching FEATURES entry, so a module page can never say more than the features page does.
//
// Copy rules are the site's (README.md, "Honesty rules"): no customers, results, ratings or
// competitor claims; the plan line is the app's own gate (apps/payapps/src/shared/plans.ts:
// lienWaivers, quickbooks and jobCosting are Crew and up; everything else is on every plan);
// guides are the free pay-app-guides pages that already exist on marisstella.app.
//
// Data only: no imports from src/site, so pages.ts and seo.ts can both read it without a cycle.
import type { PublicPage } from "./site";

/** Origin of the free guides the catalogue serves (ventures/pay-app-guides, certified-payroll-calculator). */
export const GUIDES_ORIGIN = "https://marisstella.app";

export interface GuideLink {
  label: string;
  /** Path on GUIDES_ORIGIN. */
  path: `/${string}`;
}

export interface ModulePage {
  /** The FEATURES entry this page renders (src/site/pages.ts). */
  featureId: string;
  page: PublicPage;
  h1: string;
  /** One or two sentences: who it is for and the job it does. No claims the bullets don't carry. */
  intro: string;
  /** Which plans include it, in the app's own terms. */
  plan: string;
  guides: readonly GuideLink[];
}

const EVERY_PLAN = "Every plan, including Free on one job.";
const CREW_UP = "Crew plan and up.";

const module = (
  featureId: string,
  slug: string,
  label: string,
  title: string,
  description: string,
  rest: Omit<ModulePage, "featureId" | "page">,
): ModulePage => ({
  featureId,
  page: {
    path: `/${slug}`,
    file: `${slug}.html`,
    title,
    description,
    indexable: true,
    label,
    changefreq: "monthly",
    priority: 0.7,
  },
  ...rest,
});

export const MODULE_PAGES: readonly ModulePage[] = [
  module(
    "monthly-pay-app",
    "pay-application-software",
    "Pay application software",
    "Pay application software for subcontractors · PayApps",
    "Hosted pay application software for subcontractors: the summary page and continuation sheet from your schedule of values, as PDF and CSV, every month.",
    {
      h1: "Pay application software for subcontractors",
      intro:
        "Build each month's pay application from the job's schedule of values: enter work this period and stored materials per line, and the summary page and continuation sheet follow, with retainage, change orders and previous certificates carried for you.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "How to fill out a pay application",
          path: "/pay-app-guides/how-to-fill-out-a-pay-application.html",
        },
        { label: "Pay application checker", path: "/pay-app-guides/pay-application-checker.html" },
        {
          label: "Pay application software compared",
          path: "/pay-app-guides/pay-application-software-compared.html",
        },
      ],
    },
  ),
  module(
    "schedule-of-values",
    "schedule-of-values-software",
    "Schedule of values",
    "Schedule of values software: import your SOV · PayApps",
    "Import a subcontract's schedule of values from .xlsx, CSV or a PDF bid breakdown, checked against its own total and the contract sum, then bill from it monthly.",
    {
      h1: "Your schedule of values, imported and billed from",
      intro:
        "Start each job from the SOV you already have: a spreadsheet, a PDF printed from Excel or an estimating program, or rows pasted from Google Sheets. It is read in your browser and checked before a single pay app goes out.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "Free schedule of values template (Excel)",
          path: "/pay-app-guides/schedule-of-values-template.html",
        },
        {
          label: "Front-loading a schedule of values",
          path: "/pay-app-guides/front-loading-schedule-of-values.html",
        },
        {
          label: "Change orders on the schedule of values",
          path: "/pay-app-guides/change-orders-schedule-of-values.html",
        },
      ],
    },
  ),
  module(
    "retainage",
    "retainage-tracking",
    "Retainage tracking",
    "Retainage tracking software for subcontractors · PayApps",
    "Track retainage held on every job and pay app, release it by share or dollar amount, and see finished jobs still holding retainage so you bill it.",
    {
      h1: "Retainage tracking, held and released",
      intro:
        "Set each job's retainage rate from your subcontract, separately for work and stored materials. Every pay app applies it, the cash report totals what is held across jobs and since when, and a finished job still holding retainage is flagged.",
      plan: EVERY_PLAN,
      guides: [
        { label: "Retainage explained", path: "/pay-app-guides/retainage-explained.html" },
        {
          label: "How to bill a retainage release",
          path: "/pay-app-guides/retainage-release.html",
        },
        { label: "Retainage in QuickBooks", path: "/pay-app-guides/retainage-in-quickbooks.html" },
        { label: "Free retainage tracker", path: "/pay-app-guides/retainage-tracker.html" },
      ],
    },
  ),
  module(
    "change-orders",
    "change-order-tracking",
    "Change orders",
    "Change order tracking for subcontractors · PayApps",
    "A change order log per job: approved change orders add to or deduct from schedule-of-values lines and flow into the next pay application in the right period.",
    {
      h1: "Change orders that land on the next pay app",
      intro:
        "Log each change order on the job; once approved it adds to or deducts from existing lines, or opens new ones, and is counted in the period it was approved so your summary page matches the GC's.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "Free change order form template",
          path: "/pay-app-guides/change-order-template.html",
        },
        { label: "Change order log", path: "/pay-app-guides/change-order-log.html" },
        { label: "T&M tickets", path: "/pay-app-guides/tm-tickets.html" },
      ],
    },
  ),
  module(
    "lien-waivers",
    "lien-waiver-software",
    "Lien waiver software",
    "Lien waiver software for subcontractors · PayApps",
    "Lien waivers tracked per pay app, statutory forms in the states whose text we checked, the unconditional waiver you owe once paid, and lien deadlines per job.",
    {
      h1: "Lien waivers tracked on every pay app",
      intro:
        "Each payment's waiver (conditional or unconditional, progress or final) is prefilled from the job and the amount, printed on the state's statutory form where we have checked the text, and marked sent. When the money arrives, you are reminded of the unconditional waiver you now owe.",
      plan: `${CREW_UP} The lien deadline and the public-job bond dates on each job are on every plan.`,
      guides: [
        {
          label: "Lien waiver forms by state",
          path: "/pay-app-guides/lien-waiver-forms-by-state.html",
        },
        {
          label: "Conditional vs unconditional lien waivers",
          path: "/pay-app-guides/conditional-vs-unconditional-lien-waivers.html",
        },
        { label: "Free lien waiver log", path: "/pay-app-guides/lien-waiver-log.html" },
        {
          label: "Miller Act payment bond claims",
          path: "/pay-app-guides/miller-act-payment-bond-claims.html",
        },
      ],
    },
  ),
  module(
    "cash",
    "construction-receivables",
    "Receivables and cash",
    "Construction receivables and cash report for subs · PayApps",
    "Every pay application sent, what is paid and owed, due dates from each subcontract's pay terms, aging and retainage held, across all jobs on one page.",
    {
      h1: "What you're owed, across every job",
      intro:
        "One report of every application you have sent: billed, paid, still owed and retainage held, with due dates from each subcontract's pay terms and the most overdue application named, so you know who to call this week.",
      plan: EVERY_PLAN,
      guides: [
        { label: "Pay app cash forecast", path: "/pay-app-guides/pay-app-cash-forecast.html" },
        { label: "Prompt payment laws by state", path: "/pay-app-guides/prompt-payment-laws.html" },
        { label: "When the GC pays short", path: "/pay-app-guides/paid-short.html" },
        { label: "Pay-if-paid clauses", path: "/pay-app-guides/pay-if-paid-clauses.html" },
      ],
    },
  ),
  module(
    "quickbooks",
    "quickbooks-retainage-invoicing",
    "QuickBooks Online",
    "QuickBooks Online pay app invoices with retainage · PayApps",
    "Send each pay application to QuickBooks Online as an invoice with retainage on its own line, and apply the payments you record, so receivables match billing.",
    {
      h1: "Pay applications into QuickBooks Online, retainage included",
      intro:
        "QuickBooks Online can bill a job in progress, but its invoices have no retainage field. PayApps sends each pay app as an invoice to the GC with the retainage on its own line to a retainage receivable account, then applies the payments you record, so QuickBooks' aging matches what you billed.",
      plan: CREW_UP,
      guides: [
        { label: "Retainage in QuickBooks", path: "/pay-app-guides/retainage-in-quickbooks.html" },
        { label: "Progress billing", path: "/pay-app-guides/progress-billing.html" },
      ],
    },
  ),
  module(
    "job-cost",
    "job-costing-wip-schedule",
    "Job cost and WIP",
    "Job costing and WIP schedule for subcontractors · PayApps",
    "Cost budgets per schedule-of-values line, costs from QuickBooks or typed in, commitments, and a WIP schedule of over and under billing across your jobs.",
    {
      h1: "Job cost and a WIP schedule, from the numbers you bill",
      intro:
        "Give each schedule-of-values line a budget from your bid, bring in costs from QuickBooks Online or type them, and see cost percent beside billed percent on every line. Across jobs, the WIP schedule shows earned revenue, over and under billing and projected profit.",
      plan: CREW_UP,
      guides: [
        {
          label: "Overbilling and underbilling",
          path: "/pay-app-guides/overbilling-underbilling.html",
        },
        {
          label: "Front-loading a schedule of values",
          path: "/pay-app-guides/front-loading-schedule-of-values.html",
        },
      ],
    },
  ),
  module(
    "certified-payroll",
    "certified-payroll-software",
    "Certified payroll",
    "Certified payroll software for subcontractors (WH-347) · PayApps",
    "Weekly Davis-Bacon certified payroll in the WH-347 columns, checked first, plus California, New York and Washington upload files, built in your browser.",
    {
      h1: "Certified payroll for Davis-Bacon jobs",
      intro:
        "Type the week's crew once, with hours by day, rates, fringe credit and deductions, and download the weekly certified payroll in the columns of DOL's optional Form WH-347, with the statement of compliance in the form's own words, ready to sign.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "Free certified payroll calculator (WH-347)",
          path: "/certified-payroll-calculator/",
        },
        {
          label: "California eCPR XML upload",
          path: "/certified-payroll-calculator/california-ecpr-xml-upload.html",
        },
        {
          label: "New York certified payroll bulk upload",
          path: "/certified-payroll-calculator/new-york-certified-payroll-bulk-upload.html",
        },
      ],
    },
  ),
  module(
    "gc-portals",
    "gc-portal-billing",
    "GC portal billing",
    "Procore, Textura and GCPay billing for subcontractors · PayApps",
    "Fill your GC's Procore, Oracle Textura, GCPay or Trimble Pay templates from the pay app you already built, instead of typing the same numbers twice.",
    {
      h1: "Your GC's portal, filled from the pay app",
      intro:
        "When the GC bills through a portal, the templates it asks for are filled from the same job: Procore's subcontractor SOV and invoice amounts, Oracle Textura's billing uploads, GCPay's SOV upload and Trimble Pay's SOV template. You still submit into the portal yourself.",
      plan: EVERY_PLAN,
      guides: [
        { label: "Billing through a GC's portal", path: "/pay-app-guides/gc-portal-billing.html" },
        {
          label: "Pay application software compared",
          path: "/pay-app-guides/pay-application-software-compared.html",
        },
      ],
    },
  ),
  module(
    "submittals",
    "submittal-log-software",
    "Submittal log",
    "Submittal log software for subcontractors · PayApps",
    "A submittal log per job that works back the last day to send each submittal from lead time and review days, with transmittals and the returned stamp read.",
    {
      h1: "A submittal log that warns before a lead time bites",
      intro:
        "Log what you send the GC, start from their register or your spec sections, and see the last day to send each submittal worked back from the needed-on-site date, the lead time and the review days you type.",
      plan: EVERY_PLAN,
      guides: [{ label: "How to write an RFI", path: "/pay-app-guides/how-to-write-an-rfi.html" }],
    },
  ),
  module(
    "daily-reports",
    "daily-report-app",
    "Daily reports",
    "Construction daily report app for subcontractors · PayApps",
    "Daily reports per job: weather, crew and man-hours, work done, delays and hours lost, deliveries, inspections and photos, as a PDF per day or date range.",
    {
      h1: "Daily reports from the job site",
      intro:
        "One report per job and day, with the crew and man-hours, the work done, delays and the hours they cost, deliveries, inspections and photos, kept with the job and printed as a PDF for a day or a date range.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "Free construction daily report template",
          path: "/pay-app-guides/daily-report-template.html",
        },
      ],
    },
  ),
  module(
    "tm-tickets",
    "tm-ticket-app",
    "T&M tickets",
    "T&M ticket app: signed on site, billed as a change order · PayApps",
    "Time and material tickets per job, signed by the GC's representative on the device, priced from the job's rate sheet and billed together as one change order.",
    {
      h1: "T&M tickets signed on site, billed as a change order",
      intro:
        "Write each time-and-material ticket on the job with its labor, material and equipment, get the GC's representative to sign it on the device or on paper, and turn the signed, priced tickets into one change order for their total.",
      plan: EVERY_PLAN,
      guides: [{ label: "T&M tickets", path: "/pay-app-guides/tm-tickets.html" }],
    },
  ),
  module(
    "punch-list",
    "punch-list-app",
    "Punch list",
    "Punch list app for subcontractors · PayApps",
    "Track the GC's punch list per job: items pasted from an email, marked fixed, accepted or not ours, with a back-check request and a PDF for the GC's initials.",
    {
      h1: "A punch list that ends in a back-check",
      intro:
        "Paste the punch items the GC sent, one per line, mark each fixed, accepted or not ours with the reason, and send one email asking for a back-check of everything fixed. Open items show on the job next to the retainage they hold up.",
      plan: EVERY_PLAN,
      guides: [
        { label: "Punch list", path: "/pay-app-guides/punch-list.html" },
        {
          label: "How to bill a retainage release",
          path: "/pay-app-guides/retainage-release.html",
        },
      ],
    },
  ),
  module(
    "rfis",
    "rfi-log-software",
    "RFI log",
    "RFI log software for subcontractors · PayApps",
    "Log each RFI you send the GC with its due date, print it as a PDF, chase it by email draft, and flag answers that change price or time with no change order.",
    {
      h1: "RFIs, and the extra work they lead to",
      intro:
        "Number and log each request for information you send the GC, print it as a PDF with a response box, and record the answer. An answered RFI that changes the price or the time with no change order linked is flagged, so the extra work gets billed.",
      plan: EVERY_PLAN,
      guides: [{ label: "How to write an RFI", path: "/pay-app-guides/how-to-write-an-rfi.html" }],
    },
  ),
  module(
    "estimates",
    "subcontractor-estimating-software",
    "Estimates",
    "Estimating software for subcontractors · PayApps",
    "Price bids from cost lines with markup by category and alternates, send a proposal PDF, and start the won job with its bid items as the schedule of values.",
    {
      h1: "Estimates and proposals that become the job",
      intro:
        "Price a bid from labor, material, equipment and subcontract lines rolled into bid items, with markup per category and alternates, and send a proposal PDF. When the bid is won, its items become the job's schedule of values.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "Free schedule of values template (Excel)",
          path: "/pay-app-guides/schedule-of-values-template.html",
        },
      ],
    },
  ),
  module(
    "job-schedule",
    "subcontractor-scheduling-software",
    "Job schedule and lookahead",
    "Scheduling software for subcontractors: 3-week lookahead · PayApps",
    "Your activities per job with crews, dates and what each waits for, a three-week lookahead PDF for the GC's meeting, and every crew across every job.",
    {
      h1: "Your schedule on each job, and the three-week lookahead",
      intro:
        "List the activities you plan on each job with the crew, the start and finish and the activity each waits for. Move them together when the GC's schedule slips, and print the three-week lookahead for the coordination meeting.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "Free construction daily report template",
          path: "/pay-app-guides/daily-report-template.html",
        },
      ],
    },
  ),
  module(
    "timesheets",
    "crew-timesheet-app",
    "Crew timesheets",
    "Crew timesheet app for subcontractors, posted to job cost · PayApps",
    "Hours by worker, job and schedule-of-values line, overtime past 40 in the workweek, a payroll CSV, and the week posted to each job's labor cost.",
    {
      h1: "Crew timesheets that land on job cost",
      intro:
        "Enter each worker's hours by day against a job and a schedule-of-values line, export the week for your payroll service, and post it to the jobs' labor costs so an over-running line shows while it can still be fixed.",
      plan: "Hours on every plan, including Free on one job. Posting them to job costs is Crew plan and up.",
      guides: [
        {
          label: "WH-347 certified payroll report",
          path: "/certified-payroll-calculator/wh347-report.html",
        },
        {
          label: "Overbilling and underbilling",
          path: "/pay-app-guides/overbilling-underbilling.html",
        },
      ],
    },
  ),
  module(
    "closeout",
    "construction-closeout-documents",
    "Close-out documents",
    "Construction close-out document tracking for subcontractors · PayApps",
    "A close-out checklist per job (warranty, O&M manuals, as-builts, final waiver), what still holds your retainage, and one close-out binder PDF.",
    {
      h1: "Close-out documents, and what still holds your retainage",
      intro:
        "Track each close-out document your subcontract asks for from sent to accepted, see in words what still stands between the job and its retainage, and send the GC one binder PDF and a release-request email.",
      plan: EVERY_PLAN,
      guides: [
        {
          label: "How to get retainage released",
          path: "/pay-app-guides/retainage-release.html",
        },
        { label: "Punch list", path: "/pay-app-guides/punch-list.html" },
      ],
    },
  ),
  module(
    "lower-tier-waivers",
    "lower-tier-lien-waiver-tracking",
    "Lower-tier waivers",
    "Lower-tier lien waiver tracking for subcontractors · PayApps",
    "Track the lien waivers your suppliers and sub-subs owe on each pay app: who to ask from your POs, asked and received dates, and the signed copies.",
    {
      h1: "Lower-tier waivers from your suppliers and sub-subs",
      intro:
        "Each pay application keeps the list of suppliers and sub-subcontractors who owe you a waiver, what for and through when, and whether you have asked and when it came in, so the application goes out with every waiver the GC asked for.",
      plan: "Crew plan and up, with lien waivers.",
      guides: [
        { label: "Lien waiver log", path: "/pay-app-guides/lien-waiver-log.html" },
        {
          label: "Conditional vs unconditional lien waivers",
          path: "/pay-app-guides/conditional-vs-unconditional-lien-waivers.html",
        },
        { label: "Joint checks", path: "/pay-app-guides/joint-checks.html" },
      ],
    },
  ),
];

export const MODULE_PAGE_LIST: readonly PublicPage[] = MODULE_PAGES.map((m) => m.page);
