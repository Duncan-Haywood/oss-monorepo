// Public page: the four steps in depth, with an illustrated walkthrough of the review screen. Copy
// mirrors docs/ARCHITECTURE.md (fact base, cited drafting, verification, routing, submission).
import { FactBaseMock } from "@client/components/marketing/fact-mock";
import { MarketingFooter } from "@client/components/marketing/footer";
import { HOW_IT_WORKS_STEPS } from "@client/components/marketing/how-it-works";
import { useDocumentMeta } from "@client/components/marketing/meta";
import {
  CheckList,
  FeatureCard,
  GetStartedActions,
  OnThisPage,
  PageHero,
  PageSection,
} from "@client/components/marketing/page";
import { ReviewWalkthrough } from "@client/components/marketing/review-mock";
import { IconTile } from "@client/components/marketing/section";
import { MARKETING_PATHS } from "@client/components/marketing/site-map";
import { REVIEW_TIERS } from "@client/components/marketing/trust";
import { cn } from "@client/lib/cn";
import {
  Archive,
  CalendarClock,
  Eye,
  FileUp,
  Hand,
  Landmark,
  Mail,
  PackageCheck,
  Scale,
} from "lucide-react";
import type * as React from "react";

const [buildStep, findStep, reviewStep, submitStep] = HOW_IT_WORKS_STEPS;

function StepTitle({ n, title }: { n: number; title: string | undefined }) {
  return (
    <>
      <span className="sr-only">Step {n}: </span>
      {title}
    </>
  );
}

function TwoColumn({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div>{children}</div>
      {aside}
    </div>
  );
}

export function HowItWorksPage() {
  useDocumentMeta({
    title: "How it works",
    description:
      "How Grant Autopilot builds a fact base from your own documents, finds grants that fit, drafts applications where every fact is cited, and waits for your approval before anything is sent.",
    canonicalPath: MARKETING_PATHS.howItWorks,
  });

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From your own records to a finished application"
        actions={
          <GetStartedActions secondary={{ to: MARKETING_PATHS.pricing, label: "See pricing" }} />
        }
      >
        <p>
          Grant Autopilot does the searching, drafting and tracking that a grant writer would. It
          only says what your own documents and interviews support, it shows you where every fact
          came from, and your team decides what gets sent.
        </p>
      </PageHero>

      <OnThisPage
        items={[
          { href: "#build-fact-base", label: "1. Build your fact base" },
          { href: "#find-grants", label: "2. Find grants" },
          { href: "#review-draft", label: "3. Review a cited draft" },
          { href: "#submit", label: "4. Submit and follow up" },
        ]}
      />

      <PageSection
        id="build-fact-base"
        eyebrow="Step 1"
        title={<StepTitle n={1} title={buildStep?.title} />}
        intro={
          <p>
            Everything Grant Autopilot says about your organization comes from your fact base:
            short, specific facts taken from your own materials, each with the words it came from.
          </p>
        }
      >
        <TwoColumn
          aside={
            <FactBaseMock
              title="Fact base"
              caption="Example facts for a fictional food pantry. Each keeps the words it came from, and the last one is waiting for someone to confirm it."
              facts={[
                {
                  statement: "Served 1,240 households across two counties in 2025.",
                  category: "metric",
                  status: "confirmed",
                  quote:
                    "In 2025 the pantry provided groceries to 1,240 households across two counties.",
                  source: "2025 Annual Report, page 4",
                  from: "document",
                },
                {
                  statement: "Volunteers contributed 6,112 hours in 2025.",
                  category: "capacity",
                  status: "confirmed",
                  quote: "Total volunteer hours for the year: 6,112.",
                  source: "Volunteer log summary",
                  from: "document",
                },
                {
                  statement: "The walk-in cooler holds up to 900 pounds of fresh produce.",
                  category: "capacity",
                  status: "proposed",
                  quote: "Our walk-in cooler can hold up to 900 pounds of produce at a time.",
                  source: "Interview answer, spoken",
                  from: "interview",
                },
              ]}
            />
          }
        >
          <CheckList
            items={[
              <>
                <strong className="font-semibold text-neutral-900">
                  Upload what you already have.
                </strong>{" "}
                Annual reports, budgets, financial statements, program descriptions, past
                applications (funded or not) and letters of support. PDFs, Word files, spreadsheets,
                text and images all work.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">Or talk it through.</strong> A
                guided interview asks about your mission, programs, the people you serve and your
                results. Type your answers or speak them and we'll transcribe them. You can also
                upload notes or a transcript from a conversation.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">
                  Every fact keeps its source.
                </strong>{" "}
                Each one records the exact quote and the document or interview it came from, so
                anyone can check it.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">
                  Your team confirms what's true.
                </strong>{" "}
                Facts start as suggestions. Someone on your team confirms, corrects or rejects each
                one, and rejected facts are never used.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">
                  Sensitive details stay out.
                </strong>{" "}
                Mark facts about individual clients or participants as restricted, and they're never
                sent to the AI when writing applications.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">See what's missing.</strong> A
                coverage view shows which topics funders commonly ask about are thin or missing, so
                you know what to add next.
              </>,
            ]}
          />
        </TwoColumn>
      </PageSection>

      <PageSection
        id="find-grants"
        tone="muted"
        eyebrow="Step 2"
        title={<StepTitle n={2} title={findStep?.title} />}
        intro={
          <p>
            We look for opportunities in four places, then check each one against your fact base so
            the most promising ones rise to the top.
          </p>
        }
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={Landmark} title="Federal grant listings">
            <p>
              Every day we check the official Grants.gov listings for new and forecasted federal
              opportunities, straight from the agencies that post them.
            </p>
          </FeatureCard>
          <FeatureCard icon={Eye} title="Your funder watchlist">
            <p>
              Add the funding pages of foundations, state agencies and community funders you care
              about. We re-check them on a schedule and let you know when something new is posted.
            </p>
          </FeatureCard>
          <FeatureCard icon={FileUp} title="Imports by link or RFP">
            <p>
              Found an opportunity yourself? Paste its link or upload the request for proposals. We
              read the requirements from it, and imported grants stay private to your organization.
            </p>
          </FeatureCard>
          <FeatureCard icon={Scale} title="Foundation prospecting">
            <p>
              We look through private foundations' public 990-PF tax filings for funders whose past
              grants resemble your work. These are leads to research and build relationships with,
              not open calls for proposals.
            </p>
          </FeatureCard>
        </ul>
        <div className="mt-10 max-w-3xl">
          <h3 className="text-lg font-semibold text-neutral-900">How we rank what we find</h3>
          <CheckList
            className="mt-4"
            items={[
              "Each opportunity gets an eligibility check, a fit score and an estimate of how likely an award is, with the reasons spelled out.",
              "Every reason cites the facts it relies on, so you can check our thinking.",
              "When eligibility depends on something we don't know, such as an active SAM.gov registration, you get a plain question instead of a guess.",
              "We only list what a funder has actually published. We don't guess deadlines, amounts or eligibility rules.",
            ]}
          />
        </div>
      </PageSection>

      <PageSection
        id="review-draft"
        eyebrow="Step 3"
        title={<StepTitle n={3} title={reviewStep?.title} />}
        intro={
          <p>
            When you decide to apply, Grant Autopilot reads the funder's questions and drafts each
            section from your facts. Then a separate check reads every claim before a person ever
            sees it.
          </p>
        }
      >
        <CheckList
          className="max-w-3xl"
          items={[
            "The drafter works only from your fact base, plus your own past applications for tone and style.",
            "Every factual sentence lists the facts it relies on.",
            "A separate checker, run as its own step, compares each claim with the cited facts and their quotes, and makes sure every number, date, dollar amount and percentage actually appears there.",
            "Sentences that only set the scene can't contain numbers, names or outcomes, so nothing slips through as “just framing”.",
            "Anything unsupported becomes a flag for a person. Questions your records can't answer become gaps, and gaps become interview questions for your team.",
            "You can edit or regenerate any section, or ask for changes. Each change is saved as a new version and checked again.",
          ]}
        />

        <div id="review-walkthrough" className="mt-14 scroll-mt-20">
          <h3 className="text-xl font-semibold tracking-tight text-neutral-900">
            A look at the review screen
          </h3>
          <p className="mt-2 max-w-2xl text-neutral-600">
            This is what a reviewer sees once the checker has run. It's a picture, not a live
            screen, put together from the same parts the app uses.
          </p>
          <div className="mt-8">
            <ReviewWalkthrough headingLevel="h4" />
          </div>
        </div>

        <div className="mt-16">
          <h3 className="text-xl font-semibold tracking-tight text-neutral-900">
            How much review each application gets
          </h3>
          <p className="mt-2 max-w-2xl text-neutral-600">
            Each application is routed by its value and how likely it is to be funded, using limits
            your organization sets. Bigger and more promising requests get more of your attention.
          </p>
          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            {REVIEW_TIERS.map(({ icon: Icon, name, when, body, emphasis }) => (
              <li
                key={name}
                className={cn(
                  "flex flex-col rounded-2xl border p-6",
                  emphasis
                    ? "border-brand-200 bg-brand-50/60"
                    : "border-neutral-200 bg-white shadow-card",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-brand-700" aria-hidden />
                  <h4 className="font-semibold text-neutral-900">{name}</h4>
                </div>
                <p className="mt-3 text-sm font-medium text-brand-800">{when}</p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-accent-50 p-6 ring-1 ring-inset ring-accent-200 sm:flex-row sm:items-center">
            <IconTile tone="accent" className="h-12 w-12 [&_svg]:h-6 [&_svg]:w-6">
              <Hand />
            </IconTile>
            <p className="text-neutral-800">
              <strong className="font-semibold text-neutral-900">
                Nothing is sent without your approval.
              </strong>{" "}
              That's the default for every organization. Autopilot stays off until an owner or admin
              turns it on and sets its limits, and it can be turned off again at any time.
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection
        id="submit"
        tone="muted"
        eyebrow="Step 4"
        title={<StepTitle n={4} title={submitStep?.title} />}
        intro={
          <p>
            Once a reviewer approves, Grant Autopilot sends or packages the application, keeps an
            exact record of it and keeps track of what comes next.
          </p>
        }
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={Mail} title="Sent by email">
            <p>Where a funder accepts applications by email, we send the approved application.</p>
          </FeatureCard>
          <FeatureCard icon={PackageCheck} title="Packaged for portals and Grants.gov">
            <p>
              For online portals and Grants.gov, we prepare the complete package and a step-by-step
              guide. Your authorized representative submits it, then marks it done and adds any
              tracking number. Direct submission to Grants.gov isn't supported yet.
            </p>
          </FeatureCard>
          <FeatureCard icon={Archive} title="An exact record">
            <p>
              We keep the exact package that was approved and submitted, with a digital fingerprint
              that shows it hasn't changed since.
            </p>
          </FeatureCard>
          <FeatureCard icon={CalendarClock} title="Follow-ups tracked">
            <p>
              Deadline reminders, status checks, report due dates and thank-you notes are tracked,
              and you can record whether each application was funded.
            </p>
          </FeatureCard>
        </ul>
      </PageSection>

      <PageSection
        id="limits"
        eyebrow="Honest limits"
        title="What Grant Autopilot won't do"
        intro={<p>It's a tool for your team, not a replacement for your judgment.</p>}
      >
        <CheckList
          className="max-w-3xl"
          items={[
            "It won't invent facts, numbers or stories to fill a gap. It asks you instead.",
            "It won't send anything without a person's approval, unless your organization turns on autopilot for small requests and sets its limits.",
            "It can't submit directly to Grants.gov yet. It prepares the package for your authorized representative.",
            "It can't promise funding. Funders make their own decisions, and your organization remains the applicant.",
          ]}
        />
      </PageSection>

      <MarketingFooter />
    </>
  );
}
