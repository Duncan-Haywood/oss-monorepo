// Public page: plans from PLANS (never the operator-granted comp plan), what a "draft" is, why prices
// are cost-based, refunds (docs/legal/refunds.md), promo codes and pricing questions.
import { CostAnswer, type FaqEntry, FaqList, RefundAnswer } from "@client/components/marketing/faq";
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import {
  CheckList,
  FeatureCard,
  OnThisPage,
  PageHero,
  PageSection,
} from "@client/components/marketing/page";
import { GUARANTEE_DAYS } from "@client/components/marketing/plan-copy";
import { commonFeatures, PlanComparisonTable } from "@client/components/marketing/plan-table";
import { GuaranteeCallout, PlanGrid, PricingNotes } from "@client/components/marketing/pricing";
import { inlineLinkClass, PolicyLink, SiteLink } from "@client/components/marketing/site-link";
import { MARKETING_PATHS } from "@client/components/marketing/site-map";
import { ANNUAL_DISCOUNT, PLAN_LIST, type Plan } from "@shared/billing/plans";
import { Cpu, CreditCard, Server, ShieldCheck, Tag } from "lucide-react";

const yearlySavingPercent = Math.round(ANNUAL_DISCOUNT * 100);

function pricingFaqs(plans: readonly Plan[]): FaqEntry[] {
  return [
    {
      q: "Is there a free plan or a free trial?",
      a: (
        <p>
          No. Running the AI and storing your documents costs us money for every organization, so
          there's no permanent free plan. Instead, every first subscription comes with a{" "}
          {GUARANTEE_DAYS}-day money-back guarantee, and partners and events sometimes hand out
          promo codes.
        </p>
      ),
    },
    { q: "What does each plan cost?", a: <CostAnswer plans={plans} pricing="page" /> },
    {
      q: "What if we need more drafts in a month?",
      a: (
        <p>
          You can move to a larger plan at any time from the billing page, and back down later.
          Changes take effect as shown at checkout, generally from the next billing period.
        </p>
      ),
    },
    {
      q: "Do edits and re-checks use up drafts?",
      a: (
        <p>
          No. An application counts once in the month you start drafting it. Editing sections,
          regenerating them, answering questions and re-checking never count again.
        </p>
      ),
    },
    {
      q: "Who handles the payment?",
      a: (
        <p>
          Payments go through a merchant of record, a payment company that acts as the seller for
          your purchase. It handles checkout, invoices and sales tax. We never see or store your
          full card number.
        </p>
      ),
    },
    { q: "Can we get our money back?", a: <RefundAnswer /> },
    {
      q: "How do we cancel?",
      a: (
        <p>
          Cancel any time from the billing page. Future renewals stop and you keep access until the
          end of the period you've paid for. You can export all of your data before you go.
        </p>
      ),
    },
  ];
}

export function PricingPage({ plans = PLAN_LIST }: { plans?: readonly Plan[] } = {}) {
  useDocumentMeta({
    title: "Pricing",
    description:
      "Grant Autopilot plans are priced close to what they cost us to run, with a 30-day money-back guarantee. See what each plan includes and what counts as an application draft.",
    canonicalPath: MARKETING_PATHS.pricing,
  });
  const shared = commonFeatures(plans);

  return (
    <>
      <PageHero eyebrow="Pricing" title="Priced close to what it costs us to run">
        <p>
          We charge roughly what it costs us to run, plus a margin to keep the lights on. Plans
          differ mainly in how many applications you can draft each month.
        </p>
      </PageHero>

      <OnThisPage
        items={[
          { href: "#plans", label: "Plans" },
          { href: "#drafts", label: "What a draft is" },
          { href: "#why", label: "Why it costs what it does" },
          { href: "#refunds", label: "Refunds and promo codes" },
          { href: "#pricing-questions", label: "Questions" },
        ]}
      />

      <section id="plans" aria-labelledby="plans-heading" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <h2
            id="plans-heading"
            className="text-balance text-3xl font-semibold tracking-tight text-neutral-900"
          >
            Plans
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-neutral-600">
            Every plan includes the same safeguards. Paying yearly costs about {yearlySavingPercent}
            % less, mostly because the payment fee is charged once a year instead of every month.
          </p>
          <PlanGrid plans={plans} className="mt-10" />
          <PricingNotes className="mt-6" />

          <div className="mt-14 space-y-6">
            <h3 className="text-xl font-semibold tracking-tight text-neutral-900">Compare plans</h3>
            {shared.length > 0 && (
              <div>
                <p className="font-medium text-neutral-800">Every plan includes:</p>
                <CheckList className="mt-3 sm:columns-2 sm:gap-8" items={shared} />
              </div>
            )}
            <PlanComparisonTable plans={plans} />
          </div>
        </div>
      </section>

      <PageSection
        id="drafts"
        tone="muted"
        eyebrow="What you pay for"
        title="What counts as a draft"
        intro={
          <p>
            Plans are measured in application drafts, because drafting and checking an application
            is the part that takes the most work, for us and for the AI.
          </p>
        }
      >
        <CheckList
          className="max-w-3xl"
          items={[
            "A draft is one application to one funder: we read the funder's questions, write every section from your facts, summarize it for reviewers and check every claim.",
            "Each application counts once in the month you start it. Editing, regenerating sections, answering the questions it raises and re-checking never count again.",
            "Your allowance resets every month, including on yearly plans.",
            "Finding and scoring grants, building your fact base and interviews aren't counted as drafts. Each plan includes a fair-use amount of them.",
          ]}
        />
      </PageSection>

      <PageSection
        id="why"
        eyebrow="Cost-based pricing"
        title="Why it costs what it does"
        intro={
          <p>
            We aren't trying to profit from charities. We only want each plan to pay for itself, so
            the service is still here next year.
          </p>
        }
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={Cpu} title="The AI that drafts and checks">
            <p>
              Drafting each section and then checking every claim uses Claude, a commercial AI model
              that we pay for by the amount of text it reads and writes.
            </p>
          </FeatureCard>
          <FeatureCard icon={Server} title="Hosting and storage">
            <p>
              Your documents, search index and records are stored securely and kept separate for
              each organization.
            </p>
          </FeatureCard>
          <FeatureCard icon={CreditCard} title="Payment and sales tax">
            <p>
              The payment company charges a fee on every payment and handles invoicing and sales tax
              for us.
            </p>
          </FeatureCard>
          <FeatureCard icon={ShieldCheck} title="A small reserve">
            <p>
              A little is set aside to cover refunds under the money-back guarantee, since the AI
              work and payment fees have already been paid for.
            </p>
          </FeatureCard>
        </ul>
        <p className="mt-8 max-w-3xl text-neutral-600">
          Each plan's draft allowance is worked out from these costs, and an automated check stops
          us from releasing a plan whose price drifts too far above, or below, what it costs to run.
          If we ever change a price, we'll tell you in advance.
        </p>
      </PageSection>

      <PageSection
        id="refunds"
        tone="muted"
        eyebrow="No risk to try"
        title="Refunds and promo codes"
      >
        <GuaranteeCallout className="mx-0" />
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">How refunds work</h3>
            <CheckList
              className="mt-4 text-sm leading-relaxed"
              items={[
                `Ask within ${GUARANTEE_DAYS} days of your first subscription payment, from the billing page or by contacting us. Tell us which organization it's for.`,
                "The refund goes back to the original payment method, including any sales tax, and usually appears within 5 to 10 business days.",
                "After that, you can cancel any time and keep access until the end of the period you paid for. Later renewals generally aren't refundable, except for billing errors, extended outages or where the law requires.",
              ]}
            />
            <p className="mt-4 text-sm">
              <PolicyLink doc="refunds">Read the full Refund Policy</PolicyLink>
            </p>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
              <Tag className="h-5 w-5 text-brand-700" aria-hidden />
              Promo codes
            </h3>
            <CheckList
              className="mt-4 text-sm leading-relaxed"
              items={[
                "If a partner, coalition or event gave you a code, enter it at checkout.",
                "Each code comes with its own terms, such as how long the discount lasts, and some expire.",
                "A refund covers what you actually paid after the discount.",
              ]}
            />
            <p className="mt-4 text-sm text-neutral-600">
              Working with a group of nonprofits and want a code for them?{" "}
              <SiteLink to={MARKETING_PATHS.contact} className={inlineLinkClass}>
                Get in touch
              </SiteLink>
              .
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection id="pricing-questions" eyebrow="Questions" title="Pricing questions">
        <FaqList items={pricingFaqs(plans)} className="max-w-3xl" />
        <p className="mt-8 text-sm text-neutral-600">
          More questions?{" "}
          <SiteLink to={MARKETING_PATHS.faq} className={inlineLinkClass}>
            See all questions
          </SiteLink>
          .
        </p>
      </PageSection>

      <MarketingFooter />
    </>
  );
}
