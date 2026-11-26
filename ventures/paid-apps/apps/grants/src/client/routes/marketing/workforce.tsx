// Public page: landing variant for workforce and trades training programs. Funder types are described
// generally (no invented statistics); the fact-base mock is a clearly labeled fictional program.
import { FactBaseMock } from "@client/components/marketing/fact-mock";
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import {
  CheckList,
  FeatureCard,
  GetStartedActions,
  PageHero,
  PageSection,
} from "@client/components/marketing/page";
import { MARKETING_PATHS } from "@client/components/marketing/site-map";
import { Briefcase, Building2, Landmark, Scale } from "lucide-react";

export function WorkforcePage() {
  useDocumentMeta({
    title: "For workforce and trades training programs",
    description:
      "Grant Autopilot helps workforce, pre-apprenticeship and trades training programs find grants and draft applications that report enrollment, credentials and job placements exactly as your records show them.",
    canonicalPath: MARKETING_PATHS.workforce,
  });

  return (
    <>
      <PageHero
        eyebrow="For workforce and trades programs"
        title="Grant applications for workforce and trades training programs"
        actions={
          <GetStartedActions
            secondary={{ to: MARKETING_PATHS.howItWorks, label: "See how it works" }}
          />
        }
        aside={
          <FactBaseMock
            title="Fact base · Outcomes"
            caption="Example outcome facts for a fictional trades program. The numbers are made up for illustration; the last one is waiting for someone to confirm it."
            facts={[
              {
                statement: "Enrolled 36 participants in the 2025 pre-apprenticeship cohort.",
                category: "metric",
                status: "confirmed",
                quote: "36 participants enrolled in the 2025 pre-apprenticeship cohort.",
                source: "2025 program report, page 2",
                from: "document",
              },
              {
                statement: "29 participants earned an OSHA 10 card in 2025.",
                category: "outcome",
                status: "confirmed",
                quote: "Credentials earned in 2025: OSHA 10 card, 29 participants.",
                source: "Credential tracking spreadsheet",
                from: "document",
              },
              {
                statement: "21 graduates were working in construction within 90 days of finishing.",
                category: "outcome",
                status: "proposed",
                quote: "21 of our grads were on a crew within 90 days of finishing.",
                source: "Interview answer, spoken",
                from: "interview",
              },
            ]}
          />
        }
      >
        <p>
          Pre-apprenticeship, job training and trades programs are asked for specific numbers: who
          enrolled, who finished, who earned a credential and who got hired. Grant Autopilot keeps
          those numbers exactly as your records show them, and helps a small team apply more often.
        </p>
      </PageHero>

      <PageSection
        id="funders"
        eyebrow="Where the money is"
        title="Who funds workforce training"
        intro={
          <p>
            Workforce programs often piece together funding from several kinds of funders. Grant
            Autopilot looks for each of them in a different way.
          </p>
        }
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={Landmark} title="Federal agencies">
            <p>
              Agencies such as the U.S. Department of Labor post competitive workforce and training
              grants on Grants.gov. We check those listings every day.
            </p>
          </FeatureCard>
          <FeatureCard icon={Building2} title="State and local workforce agencies">
            <p>
              State workforce agencies, local workforce boards and economic development offices fund
              training on their own schedules. Add their funding pages to your watchlist and we'll
              check them for new postings.
            </p>
          </FeatureCard>
          <FeatureCard icon={Scale} title="Community and private foundations">
            <p>
              Many foundations fund job training and career pathways. Foundation prospecting looks
              through public 990-PF filings for foundations whose past grants resemble your program.
            </p>
          </FeatureCard>
          <FeatureCard icon={Briefcase} title="Employers and industry groups">
            <p>
              Corporate foundations, employers and industry associations sometimes fund training for
              the skills they hire for. When you find an opportunity, paste its link or upload the
              request for proposals.
            </p>
          </FeatureCard>
        </ul>
        <p className="mt-6 max-w-3xl text-sm text-neutral-600">
          Every opportunity gets an eligibility check, with plain questions where eligibility
          depends on something we don't know. Always confirm the details with the funder.
        </p>
      </PageSection>

      <PageSection
        id="outcomes"
        tone="muted"
        eyebrow="Your results"
        title="Your outcomes, kept straight"
        intro={
          <p>
            Your fact base holds the results you already track, each as a short fact with its date
            and the exact words it came from: your program reports, spreadsheets, past funder
            reports or a quick interview.
          </p>
        }
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">What it captures</h3>
            <CheckList
              className="mt-4"
              items={[
                "Enrollment and completion, by cohort and year.",
                "Credentials and certifications participants earned, such as safety cards, industry credentials or a commercial driver's license.",
                "Job placements: how many, in what kinds of jobs, how soon, and starting wages if you track them.",
                "Retention at follow-up, if you collect it.",
                "Employer and training partners, and their letters of support.",
              ]}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">How it keeps them accurate</h3>
            <CheckList
              className="mt-4"
              items={[
                "When a draft uses a number, the checker makes sure that number appears in the cited fact. A draft can't round 82% up to 85%.",
                "Facts keep the date they apply to, and a figure that may be out of date is flagged.",
                "If a funder asks for something you don't track, the draft asks your team rather than estimating.",
                "Details about individual participants can be marked restricted, so they're never sent to the AI when drafting.",
              ]}
            />
          </div>
        </div>
      </PageSection>

      <PageSection
        id="start"
        eyebrow="Get started"
        title="Start with the reports you already have"
        intro={
          <p>
            Upload last year's program report or a past application, or answer a short interview by
            typing or speaking. By default nothing is sent until your team approves it.
          </p>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <GetStartedActions secondary={{ to: MARKETING_PATHS.pricing, label: "See pricing" }} />
        </div>
      </PageSection>

      <MarketingFooter />
    </>
  );
}
