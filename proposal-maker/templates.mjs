// Starter templates by trade. Each is a partial proposal: scope, phases, pricing
// shape and assumptions are filled in with placeholder rates the user edits.
// Nothing here is legal advice; clause wording lives in calc.mjs.
import { normalizeProposal } from "./calc.mjs";

export const TEMPLATES = [
  {
    id: "web-design",
    label: "Website design and build",
    p: {
      title: "Website design and build",
      summary: "Design and build a [N]-page marketing website that is fast, mobile-friendly and easy for your team to edit.",
      problem: "The current site is out of date, hard to update and does not turn visitors into enquiries.",
      goals: "More qualified enquiries\nA site your team can edit without a developer\nPages that load in under 3 seconds on mobile",
      deliverables: [
        { name: "Design", included: "Homepage and one inner-page design\nMobile layouts\nTwo rounds of revisions", excluded: "Logo or brand design\nPhotography\nCopywriting" },
        { name: "Build", included: "Responsive build of agreed pages\nContact form\nBasic on-page SEO (titles, descriptions)", excluded: "E-commerce\nMembership areas\nThird-party integrations beyond the contact form" },
        { name: "Launch", included: "Deployment to your host\nTraining session (1 hour)", excluded: "Hosting and domain fees\nOngoing maintenance" },
      ],
      phases: [{ name: "Discovery and content", days: "7" }, { name: "Design", days: "14" }, { name: "Build", days: "14" }, { name: "Launch", days: "7" }],
      model: "tiers",
      options: [
        { name: "Starter", lines: [{ desc: "Up to 5 pages", qty: 1, rate: "3000" }] },
        { name: "Standard", lines: [{ desc: "Up to 10 pages with CMS", qty: 1, rate: "6000" }] },
        { name: "Plus", lines: [{ desc: "Up to 15 pages, CMS and blog", qty: 1, rate: "9500" }] },
      ],
      depositType: "percent", depositValue: "40",
      milestones: [{ label: "Design approved", percent: "30", when: "On design sign-off" }],
      assumptions: "Client supplies final text and images before the build phase.\nOne point of contact gives consolidated feedback.",
    },
  },
  {
    id: "consulting",
    label: "Consulting engagement (hourly with cap)",
    p: {
      title: "Advisory engagement",
      summary: "Hands-on advice and a written recommendation on [topic].",
      problem: "The team needs an outside view and a clear plan before committing budget.",
      goals: "A prioritised recommendation\nAn implementation outline with owners and dates",
      deliverables: [
        { name: "Assessment", included: "Stakeholder interviews (up to 5)\nReview of existing documents", excluded: "Implementation work\nLegal or tax review" },
        { name: "Recommendation report", included: "Written report (10 to 15 pages)\nOne readout call", excluded: "Training" },
      ],
      phases: [{ name: "Interviews and review", days: "10" }, { name: "Report and readout", days: "10" }],
      model: "hourly",
      hourly: { rate: "150", hours: "40", capHours: "48" },
      depositType: "percent", depositValue: "25",
      milestones: [],
      assumptions: "Client provides access to people and documents within 3 business days of request.\nTime beyond the cap needs written approval.",
    },
  },
  {
    id: "marketing-retainer",
    label: "Marketing retainer (monthly)",
    p: {
      title: "Monthly marketing retainer",
      summary: "Ongoing content, email and reporting for [business].",
      problem: "Marketing is ad hoc, so results are inconsistent and hard to measure.",
      goals: "A steady publishing rhythm\nMonthly reporting tied to leads",
      deliverables: [
        { name: "Content", included: "4 blog posts a month\n1 email newsletter a month", excluded: "Paid ad spend\nVideo production" },
        { name: "Reporting", included: "Monthly summary of traffic and leads\n30-minute review call", excluded: "Custom dashboards" },
      ],
      phases: [{ name: "Onboarding", days: "14" }],
      model: "retainer",
      retainer: { monthly: "2500", months: "3", hours: "20", overageRate: "125" },
      depositType: "none", depositValue: "",
      milestones: [],
      assumptions: "Billed monthly in advance.\nUnused hours do not roll over.\nEither party may end the retainer with 30 days notice after the first term.",
    },
  },
  {
    id: "photo-shoot",
    label: "Photography shoot (fixed price)",
    p: {
      title: "Photography session",
      summary: "A [duration] shoot at [location] with edited, web-ready images delivered in an online gallery.",
      problem: "You need a consistent set of professional images for your website and social channels.",
      goals: "A usable library of finished images\nDelivery within two weeks of the shoot",
      deliverables: [
        { name: "Shoot", included: "Up to 3 hours on location\nPlanning call beforehand", excluded: "Travel beyond 30 miles\nHair, makeup or styling" },
        { name: "Editing and delivery", included: "30 edited images\nOnline gallery for 90 days", excluded: "Printing\nExtra retouching beyond colour and exposure" },
      ],
      phases: [{ name: "Planning", days: "7" }, { name: "Shoot", days: "1" }, { name: "Editing and delivery", days: "14" }],
      model: "fixed",
      options: [{ name: "", lines: [{ desc: "Photography session", qty: 1, rate: "1200" }] }],
      depositType: "percent", depositValue: "50",
      milestones: [],
      assumptions: "Weather-dependent shoots can be rescheduled once without charge.",
    },
  },
];

export function templateIds() { return TEMPLATES.map((t) => t.id); }

// Merge a template over a base proposal (the user's blank, with their profile
// defaults). Identity fields and the user's own payment profile are kept unless
// the template sets them. Unknown id returns the base unchanged.
export function applyTemplate(base, id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return normalizeProposal(base);
  const keep = { id: base.id, number: base.number, issued: base.issued, validDays: base.validDays, validUntil: base.validUntil,
    fromName: base.fromName, fromEmail: base.fromEmail, fromAddr: base.fromAddr, currency: base.currency, taxRate: base.taxRate, terms: base.terms };
  return normalizeProposal({ ...base, ...JSON.parse(JSON.stringify(t.p)), ...keep });
}
