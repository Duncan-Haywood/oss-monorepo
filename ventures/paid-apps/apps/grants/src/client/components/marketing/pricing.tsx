// Pricing table rendered from PLANS (src/shared/billing/plans.ts). No invented discounts, badges or
// "most popular" labels: every number here comes from the plan data.
import { buttonClass } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { PLAN_LIST, type Plan } from "@shared/billing/plans";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, HeartHandshake } from "lucide-react";
import { MoreLink } from "./page";
import {
  applicationsPerYearLabel,
  draftsPerMonthLabel,
  GUARANTEE_DAYS,
  marketingPlans,
  monthlyPrice,
  seatsLabel,
  yearlyPriceLabel,
} from "./plan-copy";
import { Container, SectionHeading } from "./section";
import { MARKETING_PATHS } from "./site-map";

function PlanCard({ plan }: { plan: Plan }) {
  const yearly = yearlyPriceLabel(plan);
  const headingId = `plan-${plan.key}-name`;
  return (
    <li className="flex">
      <article
        aria-labelledby={headingId}
        className="flex w-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-card sm:p-8"
      >
        <h3 id={headingId} className="text-lg font-semibold text-neutral-900">
          {plan.name}
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          {applicationsPerYearLabel(plan.includedApplicationDrafts)}
        </p>
        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight text-neutral-900">
            {monthlyPrice(plan)}
          </span>
          <span className="text-sm text-neutral-500">a month</span>
        </p>
        {yearly && <p className="mt-1 text-sm text-neutral-500">{yearly}</p>}
        <p className="mt-6 rounded-lg bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900 ring-1 ring-inset ring-brand-100">
          {draftsPerMonthLabel(plan.includedApplicationDrafts)}
        </p>
        <ul className="mt-6 space-y-2.5 text-sm text-neutral-700">
          <li className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            {seatsLabel(plan.seats)}
          </li>
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-8">
          <Link to="/signup" className={buttonClass({ variant: "outline", className: "w-full" })}>
            Choose {plan.name}
          </Link>
        </div>
      </article>
    </li>
  );
}

/** One card per purchasable plan, cheapest first (or a holding note when nothing is for sale). */
export function PlanGrid({
  plans = PLAN_LIST,
  className,
}: {
  plans?: readonly Plan[];
  className?: string;
}) {
  const forSale = marketingPlans(plans);
  return forSale.length > 0 ? (
    <ul className={cn("mx-auto grid max-w-5xl gap-6 md:grid-cols-3", className)}>
      {forSale.map((p) => (
        <PlanCard key={p.key} plan={p} />
      ))}
    </ul>
  ) : (
    <p className={cn("text-center text-neutral-600", className)}>
      Plans are being updated. Create an account and we'll show current pricing before you pay
      anything.
    </p>
  );
}

export function GuaranteeCallout({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-5xl flex-col gap-5 rounded-2xl border border-brand-100 bg-brand-50/70 p-6 sm:flex-row sm:items-center sm:p-8",
        className,
      )}
    >
      <HeartHandshake className="h-8 w-8 shrink-0 text-brand-700" aria-hidden />
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-neutral-900">
          {GUARANTEE_DAYS}-day money-back guarantee
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-neutral-700">
          There's no free trial. Instead, if Grant Autopilot isn't right for your organization, ask
          for a full refund within {GUARANTEE_DAYS} days of your first payment. No questions asked.
        </p>
      </div>
      <Link
        to="/legal/$doc"
        params={{ doc: "refunds" }}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-800 hover:underline"
      >
        Refund Policy <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

export function PricingNotes({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        "mx-auto flex max-w-5xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-neutral-500",
        className,
      )}
    >
      <li>No setup fees</li>
      <li>Cancel any time</li>
      <li>Promo and partner codes accepted at checkout</li>
      <li>Prices in US dollars; sales tax may apply</li>
    </ul>
  );
}

export function PricingSection({ plans = PLAN_LIST }: { plans?: readonly Plan[] }) {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20">
      <Container className="py-16 lg:py-24">
        <SectionHeading
          id="pricing-heading"
          eyebrow="Pricing"
          title="Priced close to what it costs us"
          align="center"
        >
          <p>
            We set each price from what it actually costs to run the AI and keep your data safe,
            plus a modest margin to keep the service going. Plans differ mainly in how many
            applications you can draft each month. Editing, regenerating or re-checking a draft
            never counts twice.
          </p>
        </SectionHeading>
        <PlanGrid plans={plans} className="mt-12" />
        <GuaranteeCallout className="mt-10" />
        <PricingNotes className="mt-6" />
        <p className="mt-8 text-center">
          <MoreLink to={MARKETING_PATHS.pricing}>Compare plans and read pricing questions</MoreLink>
        </p>
      </Container>
    </section>
  );
}
