// FAQ built on native <details>/<summary> (keyboard and screen-reader friendly, works without JS).
// Prices come from PLANS; refund and data answers summarize docs/legal/*.md. The answers shared with
// the /faq and /pricing pages are exported so the copy stays in one place.
import { cn } from "@client/lib/cn";
import { PLAN_LIST, type Plan } from "@shared/billing/plans";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { MoreLink } from "./page";
import { draftsPerMonthLabel, GUARANTEE_DAYS, marketingPlans, monthlyPrice } from "./plan-copy";
import { Container, SectionHeading } from "./section";
import { inlineLinkClass, PolicyLink, SiteLink } from "./site-link";
import { MARKETING_PATHS } from "./site-map";

export interface FaqEntry {
  q: string;
  a: React.ReactNode;
}

/** Disclosure list of questions. Answers are closed until clicked. */
export function FaqList({ items, className }: { items: readonly FaqEntry[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-neutral-200 border-y border-neutral-200", className)}>
      {items.map(({ q, a }) => (
        <details key={q} className="group">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-left font-medium text-neutral-900 hover:text-brand-800",
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <span>{q}</span>
            <ChevronDown
              className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400 group-open:rotate-180 motion-safe:transition-transform"
              aria-hidden
            />
          </summary>
          <div className="pb-6 pr-9 text-sm leading-relaxed text-neutral-600">{a}</div>
        </details>
      ))}
    </div>
  );
}

/** Prices per plan. `pricing` says whether "pricing" links to the landing anchor or the page. */
export function CostAnswer({
  plans = PLAN_LIST,
  pricing = "anchor",
}: {
  plans?: readonly Plan[];
  pricing?: "anchor" | "page";
}) {
  const forSale = marketingPlans(plans);
  return (
    <>
      <p>
        Our prices are set close to what it costs us to run the service, so small organizations can
        afford it.
      </p>
      {forSale.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {forSale.map((p) => (
            <li key={p.key}>
              <strong className="font-semibold text-neutral-800">{p.name}</strong>:{" "}
              {monthlyPrice(p)} a month for {draftsPerMonthLabel(p.includedApplicationDrafts)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3">
        Yearly billing costs a little less. If you have a promo or partner code, you can enter it at
        checkout. See{" "}
        {pricing === "page" ? (
          <SiteLink to={MARKETING_PATHS.pricing} className={inlineLinkClass}>
            pricing
          </SiteLink>
        ) : (
          <a href="#pricing" className={inlineLinkClass}>
            pricing
          </a>
        )}{" "}
        for what each plan includes.
      </p>
    </>
  );
}

export function RefundAnswer() {
  return (
    <p>
      Yes. Ask for a full refund within {GUARANTEE_DAYS} days of your first payment, no questions
      asked. You can cancel any time after that and keep access until the end of the period you paid
      for. Because prices are close to our costs, later renewals generally aren't refundable, except
      for billing errors, extended outages or where the law requires. See the{" "}
      <PolicyLink doc="refunds">Refund Policy</PolicyLink>.
    </p>
  );
}

export function TrainingAnswer() {
  return (
    <p>
      No. Your documents, interviews and drafts are never used to train AI models, ours or anyone
      else's. We use Anthropic's commercial API, under which your inputs and outputs are not used
      for model training. We also never sell your data or use it for advertising.
    </p>
  );
}

export function GrantsGovAnswer() {
  return (
    <>
      <p>
        Only for federal grants. Applying for those requires an active SAM.gov registration (which
        gives you a Unique Entity ID) and a Grants.gov account with the Authorized Organization
        Representative role. Registration is free, but it can take a few weeks, so it's worth
        starting early.
      </p>
      <p className="mt-3">
        Those credentials belong to your organization, so Grant Autopilot doesn't submit to
        Grants.gov for you. We prepare the complete package and a step-by-step guide for Grants.gov
        Workspace. Your representative submits it, then adds the Grants.gov tracking number so we
        can keep track of the follow-ups. Most foundation grants don't need any of this.
      </p>
    </>
  );
}

function faqs(plans: readonly Plan[]): FaqEntry[] {
  return [
    {
      q: "How do you make sure drafts are accurate?",
      a: (
        <>
          <p>
            Drafts can only use facts from your fact base, and every factual sentence cites its
            source. Facts your team hasn't confirmed yet are flagged. A separate checker then
            compares each claim with those sources, including every number, date and dollar amount,
            and flags anything that isn't supported.
          </p>
          <p className="mt-3">
            No software is perfect, which is why the checks are built in and why a person on your
            team approves each application before it goes out.
          </p>
        </>
      ),
    },
    {
      q: "Will anything be sent without our approval?",
      a: (
        <p>
          Not unless you choose that. By default, you approve every application before it's sent.
          Autopilot is optional and off until an owner or admin turns it on and sets its limits.
          Even then, it only applies to small, low-risk requests that pass every check.
        </p>
      ),
    },
    {
      q: "What happens to our documents and data?",
      a: (
        <p>
          They're used only to build your fact base, match you with grants and prepare your own
          applications. They're visible only to members of your organization and are never shared
          with other organizations. Our staff look at your data only when you ask us for support, or
          when needed for security or the law. You can export everything or permanently delete your
          organization at any time. Read the <PolicyLink doc="data-use">Data Use Policy</PolicyLink>{" "}
          for details.
        </p>
      ),
    },
    { q: "Is our data used to train AI?", a: <TrainingAnswer /> },
    { q: "How much does it cost?", a: <CostAnswer plans={plans} /> },
    { q: "Do we need to be registered with Grants.gov?", a: <GrantsGovAnswer /> },
    { q: "What if it isn't right for us? Can we get a refund?", a: <RefundAnswer /> },
  ];
}

export function Faq({ plans = PLAN_LIST }: { plans?: readonly Plan[] }) {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20 bg-white">
      <Container className="grid gap-10 py-16 lg:grid-cols-[1fr_2fr] lg:gap-16 lg:py-24">
        <SectionHeading id="faq-heading" eyebrow="Questions" title="Frequently asked questions">
          <p>
            Something else on your mind? <PolicyLink doc="terms">Our policies</PolicyLink> are
            written in plain language too.
          </p>
          <p className="mt-4">
            <MoreLink to={MARKETING_PATHS.faq}>All questions</MoreLink>
          </p>
        </SectionHeading>
        <FaqList items={faqs(plans)} />
      </Container>
    </section>
  );
}
