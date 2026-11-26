// Public page /demo: an interactive, client-only product demo with an IMAGINED charity, so visitors can
// try the product without signing up. Static fixture data (components/demo/data.ts), no API calls.
// The real app stays fully personalized to the customer's own organization; nothing here carries over.
import { DEMO_ORG } from "@client/components/demo/data";
import { DemoNotice } from "@client/components/demo/demo-bits";
import { DEMO_DESCRIPTION, DEMO_PATH, DEMO_TITLE } from "@client/components/demo/demo-meta";
import { DemoTour } from "@client/components/demo/demo-tour";
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import { PageHero } from "@client/components/marketing/page";
import { Container } from "@client/components/marketing/section";
import { buttonClass } from "@client/components/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Hammer, MapPin } from "lucide-react";

export function DemoPage() {
  useDocumentMeta({
    title: DEMO_TITLE,
    description: DEMO_DESCRIPTION,
    canonicalPath: DEMO_PATH,
  });

  return (
    <>
      <PageHero
        eyebrow="Interactive demo"
        title="Try Grant Autopilot with an imagined charity"
        actions={
          <>
            <a href="#demo-tour" className={buttonClass({ size: "lg" })}>
              Start the walkthrough
              <ArrowRight aria-hidden />
            </a>
            <Link to="/signup" className={buttonClass({ size: "lg", variant: "secondary" })}>
              Start with your own organization
            </Link>
          </>
        }
        aside={
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-card">
            <DemoNotice />
            <p className="mt-4 text-lg font-semibold text-neutral-900">{DEMO_ORG.name}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-neutral-600">
              <li className="flex items-center gap-2">
                <Hammer className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                {DEMO_ORG.kind}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                {DEMO_ORG.place}
              </li>
            </ul>
            <p className="mt-4 text-sm text-neutral-500">
              The organization, places, people, funders and numbers are all made up for this demo.
            </p>
          </div>
        }
      >
        <p>
          Follow {DEMO_ORG.shortName}, a made-up rural trades-training nonprofit, through six
          screens: from three short documents to cited facts, ranked grants, a checked draft and a
          submitted package.
        </p>
        <p className="text-base">
          No sign-up, and nothing you do here is saved or sent: it all runs in your browser.
        </p>
      </PageHero>

      <section id="demo-tour" aria-label="Walkthrough" className="scroll-mt-16 bg-neutral-50/60">
        <Container className="py-10 sm:py-14">
          <DemoTour />
        </Container>
      </section>

      <MarketingFooter />
    </>
  );
}
