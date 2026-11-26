// Public page: frequently asked questions, grouped. Answers shared with the landing page and /pricing
// come from components/marketing/faq.tsx; prices come from PLANS.
import {
  CostAnswer,
  type FaqEntry,
  FaqList,
  RefundAnswer,
  TrainingAnswer,
} from "@client/components/marketing/faq";
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import { OnThisPage, PageHero } from "@client/components/marketing/page";
import { marketingPlans } from "@client/components/marketing/plan-copy";
import { Container } from "@client/components/marketing/section";
import { inlineLinkClass, PolicyLink, SiteLink } from "@client/components/marketing/site-link";
import { CONTACT_EMAIL, MARKETING_PATHS } from "@client/components/marketing/site-map";
import { PLAN_LIST, type Plan } from "@shared/billing/plans";

const seatList = (plans: readonly Plan[]) =>
  marketingPlans(plans)
    .map((p) => `${p.name} up to ${p.seats}`)
    .join(", ");

interface FaqGroup {
  id: string;
  title: string;
  items: FaqEntry[];
}

function groups(plans: readonly Plan[]): FaqGroup[] {
  return [
    {
      id: "accuracy-and-control",
      title: "Accuracy and control",
      items: [
        {
          q: "Will it make things up?",
          a: (
            <>
              <p>
                It's built not to. Drafts can only use facts from your fact base, which comes from
                your own documents and interviews, and every factual sentence cites the facts it
                relies on. A separate checker then compares each claim with those facts and their
                quotes, including every number, date and dollar amount, and flags anything that
                isn't supported.
              </p>
              <p className="mt-3">
                When a funder asks something your records don't answer, the draft leaves a gap and
                asks your team instead of guessing. No software is perfect, which is why the checks
                are built in and why a person approves each application.
              </p>
            </>
          ),
        },
        {
          q: "Do we lose control?",
          a: (
            <>
              <p>
                No. By default nothing is sent without your approval. Each application is routed to
                the right amount of review: large requests and ones you're likely to win get a full,
                section-by-section review, and most get a clear summary you can approve with one
                click. You can edit or regenerate any section, ask for changes, or decide not to
                apply.
              </p>
              <p className="mt-3">
                Autopilot submission is optional and off until an owner or admin turns it on and
                sets its limits, such as a maximum amount and a monthly cap. Even then it only
                covers small, low-risk requests that pass every check, and it can be turned off at
                any time. Your organization is always the applicant.
              </p>
            </>
          ),
        },
        {
          q: "Can it submit to Grants.gov?",
          a: (
            <>
              <p>
                Not yet. Direct submission to Grants.gov isn't supported. For federal grants we
                prepare the complete package and a step-by-step guide for Grants.gov Workspace. Your
                Authorized Organization Representative submits it, then adds the Grants.gov tracking
                number so we can keep track of the follow-ups.
              </p>
              <p className="mt-3">
                Where a funder accepts applications by email, we can send the approved application
                for you. For other online portals, we prepare the package and the steps in the same
                way as for Grants.gov.
              </p>
            </>
          ),
        },
      ],
    },
    {
      id: "your-data",
      title: "Your data",
      items: [
        { q: "Do you train AI on our data?", a: <TrainingAnswer /> },
        {
          q: "Who can see our documents?",
          a: (
            <p>
              Only members of your organization, according to the roles your owners and admins
              assign. Your data is never shared with other organizations. Our staff look at it only
              when you ask us for support, or when needed for security or the law. See{" "}
              <SiteLink to={MARKETING_PATHS.trust} className={inlineLinkClass}>
                Security &amp; privacy
              </SiteLink>{" "}
              and the <PolicyLink doc="data-use">Data Use Policy</PolicyLink>.
            </p>
          ),
        },
        {
          q: "Can we take our data with us, or delete it?",
          a: (
            <p>
              Yes. Owners and admins can download a complete export at any time. Deleting your
              organization permanently removes its files, search entries and records, not just hides
              them.
            </p>
          ),
        },
      ],
    },
    {
      id: "getting-started",
      title: "Getting started",
      items: [
        {
          q: "What if we're not registered on SAM.gov?",
          a: (
            <>
              <p>
                You can still use Grant Autopilot. Foundation, corporate and community funders
                usually don't ask for a SAM.gov registration, and the watchlist, imports and
                foundation prospecting all work without one.
              </p>
              <p className="mt-3">
                Federal grants do require an active SAM.gov registration (which gives you a Unique
                Entity ID) and a Grants.gov account. Registration is free but can take a few weeks,
                and it must be renewed every year. When a grant's eligibility depends on it and we
                don't know your status, the eligibility check asks you rather than assuming. We
                can't register on your behalf.
              </p>
            </>
          ),
        },
        {
          q: "Can multiple staff use it?",
          a: (
            <>
              <p>
                Yes. Invite colleagues by email and give each one a role: owners and admins manage
                settings, members and billing; editors upload documents, edit facts and draft
                applications; reviewers review and approve applications; viewers can see everything
                but change nothing.
              </p>
              {seatList(plans) && (
                <p className="mt-3">
                  Each plan includes a number of team members: {seatList(plans)}.
                </p>
              )}
            </>
          ),
        },
        {
          q: "What do we need to get started?",
          a: (
            <p>
              Whatever you already have: a mission statement, an annual report, a budget, a past
              application or two. If you don't have much in writing, a guided interview, typed or
              spoken, builds your fact base from your answers.
            </p>
          ),
        },
      ],
    },
    {
      id: "cost",
      title: "Cost",
      items: [
        { q: "What does it cost?", a: <CostAnswer plans={plans} pricing="page" /> },
        { q: "Refunds?", a: <RefundAnswer /> },
        {
          q: "Is there a free plan?",
          a: (
            <p>
              No. There's no permanent free plan, because every organization's AI and storage use
              costs us money. Instead, there's a money-back guarantee, and partners and events
              sometimes give out promo codes you can enter at checkout.
            </p>
          ),
        },
      ],
    },
  ];
}

export function FaqPage({ plans = PLAN_LIST }: { plans?: readonly Plan[] } = {}) {
  useDocumentMeta({
    title: "Frequently asked questions",
    description:
      "Straight answers about Grant Autopilot: accuracy, control over what's sent, AI training, SAM.gov, team access, cost, refunds and Grants.gov.",
    canonicalPath: MARKETING_PATHS.faq,
  });
  const faqGroups = groups(plans);

  return (
    <>
      <PageHero eyebrow="Questions" title="Frequently asked questions">
        <p>
          Plain answers to what small teams ask us most. If yours isn't here, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={inlineLinkClass}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PageHero>

      <OnThisPage items={faqGroups.map((g) => ({ href: `#${g.id}` as const, label: g.title }))} />

      <div className="bg-white">
        <Container className="space-y-14 py-14 lg:py-20">
          {faqGroups.map((g) => (
            <section
              key={g.id}
              id={g.id}
              aria-labelledby={`${g.id}-heading`}
              className="grid scroll-mt-20 gap-6 lg:grid-cols-[1fr_2fr] lg:gap-16"
            >
              <h2
                id={`${g.id}-heading`}
                className="text-2xl font-semibold tracking-tight text-neutral-900"
              >
                {g.title}
              </h2>
              <FaqList items={g.items} />
            </section>
          ))}
        </Container>
      </div>

      <MarketingFooter />
    </>
  );
}
