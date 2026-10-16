// The catalogue behind index.html. One row per self-hosted product in this
// repository. `replaces` names the paid products people compare it with, as a
// searcher would; it is a comparison, not a claim of feature parity.
export const GROUPS = [
  {
    id: "support",
    title: "Customers and support",
    items: [
      { slug: "support-desk", name: "Support Desk", replaces: "Help Scout, Zendesk (shared inbox)", does: "Email and contact-form tickets in one inbox, threaded by ticket number, with spam guesses that show their reasons and an overdue list for first replies." },
      { slug: "help-keeper", name: "Help Keeper", replaces: "Help Scout Docs, Document360, Intercom Articles", does: "Markdown help center with typo-tolerant ranked search, helpful votes and a report of searches that found nothing." },
      { slug: "feedback-board", name: "Feedback Board", replaces: "Canny, Nolt", does: "Voting, duplicate detection as people type, a public roadmap and a ship-notification email." },
      { slug: "status-keeper", name: "Status Keeper", replaces: "Statuspage, Better Stack status pages", does: "HTTP and heartbeat checks, a public status page with 90-day uptime bars, incidents, maintenance windows and webhook alerts." },
      { slug: "changelog-keeper", name: "Changelog Keeper", replaces: "Headway, Beamer", does: "Release notes in safe Markdown, a public changelog, Atom and JSON feeds and an embeddable What's new bell." },
      { slug: "testimonial-keeper", name: "Testimonial Keeper", replaces: "Testimonial.to, Senja", does: "A link customers use to write a testimonial with explicit publish consent, and an embeddable wall that shows only what you approved." },
    ],
  },
  {
    id: "growth",
    title: "Growth and marketing",
    items: [
      { slug: "visit-keeper", name: "Visit Keeper", replaces: "Plausible, Fathom, Google Analytics", does: "Cookie-free web analytics from a script under 1 KB: daily-rotating anonymous hashes, sources, UTM campaigns, goals with revenue." },
      { slug: "link-keeper", name: "Link Keeper", replaces: "Bitly, Short.io", does: "Short links on your own domain with UTM tagging, app-store routing, expiry and click stats without cookies or stored IPs." },
      { slug: "waitlist-keeper", name: "Waitlist Keeper", replaces: "Prefinery, Viral Loops", does: "Launch waitlist with email confirmation, a referral ladder, anti-gaming guards, reward tiers and batch invites." },
      { slug: "drip-keeper", name: "Drip Keeper", replaces: "Customer.io, Loops", does: "Event-triggered onboarding, trial and win-back email with goal events, send windows and one-click unsubscribe." },
      { slug: "referral-keeper", name: "Referral Keeper", replaces: "FirstPromoter, Rewardful", does: "Referral and affiliate program on your own Stripe webhook: recurring commissions, clawbacks, hold periods and a payout CSV." },
      { slug: "form-inbox", name: "Form Inbox", replaces: "Formspree, Basin", does: "Point any HTML form at it for an inbox, visible spam scoring, CSV export and email or Slack notifications." },
      { slug: "slot-keeper", name: "Slot Keeper", replaces: "Calendly, Cal.com", does: "Booking pages that respect your calendar's busy time, show slots in the visitor's zone and send invitations and reminders." },
      { slug: "pql-radar", name: "PQL Radar", replaces: "product-qualified-lead scoring add-ons", does: "Ranks new signups by first-week usage with a reason each, trained on your own conversions and validated out of time." },
    ],
  },
  {
    id: "engineering",
    title: "Product and engineering",
    items: [
      { slug: "error-keeper", name: "Error Keeper", replaces: "Sentry, Rollbar", does: "Crash grouping across deploys, alerts on new issues, regressions and spikes, from a 1 KB browser snippet or a Node client." },
      { slug: "flag-keeper", name: "Flag Keeper", replaces: "LaunchDarkly, Flagsmith", does: "Sticky percentage rollouts, targeting rules, segments, a kill switch, an audit log and a local-evaluation SDK." },
      { slug: "webhook-relay", name: "Webhook Relay", replaces: "Hookdeck, Svix ingest", does: "Verifies signatures from a dozen providers, saves each event before answering 200, retries with backoff and replays any event." },
    ],
  },
  {
    id: "billing",
    title: "Revenue and billing on Stripe",
    items: [
      { slug: "mrr-pulse", name: "MRR Pulse", replaces: "Baremetrics, ChartMogul", does: "MRR, ARR, expansion, contraction and churn, net revenue retention and quick ratio from a read-only Stripe key." },
      { slug: "dunning-engine", name: "Dunning Engine", replaces: "failed-payment recovery add-ons", does: "Classifies each decline code, retries only where a retry can work and emails a never-expiring update-card link." },
      { slug: "cancel-flow", name: "Cancel Flow", replaces: "Churnkey, ProsperStack", does: "Asks why the customer is leaving, offers the save that fits the reason and reports save rate by reason." },
      { slug: "trial-converter", name: "Trial Converter", replaces: "trial-nudge add-ons", does: "Heads-up emails before a card is charged, escalating add-a-card emails for card-less trials and an optional extension." },
      { slug: "churn-radar", name: "Churn Radar", replaces: "churn-prediction add-ons", does: "A ranked at-risk account list with a reason each, trained on your own history and validated out of time." },
      { slug: "meter-keeper", name: "Meter Keeper", replaces: "Orb, Metronome", does: "Idempotent usage events, tiered pricing, invoice previews and a retrying feed into Stripe Billing Meters." },
      { slug: "license-keeper", name: "License Keeper", replaces: "Keygen, license-key add-ons", does: "Ed25519-signed license keys your app verifies offline, machine limits, renewals and revocation on refund." },
      { slug: "rev-rec", name: "Rev Rec", replaces: "revenue recognition add-ons", does: "Spreads paid invoice lines over their service period into a deferred-revenue schedule and month-end journal entries." },
    ],
  },
  {
    id: "sales",
    title: "Sales and contracts",
    items: [
      { slug: "deal-keeper", name: "Deal Keeper", replaces: "pipeline forecasting add-ons", does: "Win rates learned from your own closed deals, a forecast with a 10th to 90th percentile band and a stale-deal hygiene list." },
      { slug: "sign-keeper", name: "Sign Keeper", replaces: "DocuSign, PandaDoc (simple cases)", does: "Typed-name e-signature requests with a certificate holding the text's SHA-256 and a hash-chained audit trail." },
    ],
  },
];

export const ALL = GROUPS.flatMap((g) => g.items);
