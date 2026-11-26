// OWNER: shell agent — marketing landing page. Honest copy only: no testimonials, logos or invented stats.
// Sections live in src/client/components/marketing/**; pricing renders from PLANS.
import { Faq } from "@client/components/marketing/faq";
import { MarketingFooter } from "@client/components/marketing/footer";
import { Hero } from "@client/components/marketing/hero";
import { HowItWorks } from "@client/components/marketing/how-it-works";
import { PricingSection } from "@client/components/marketing/pricing";
import { Privacy } from "@client/components/marketing/privacy";
import { Problem } from "@client/components/marketing/problem";
import { Trust } from "@client/components/marketing/trust";
import * as React from "react";

/** Keep in sync with <title> in index.html. */
const LANDING_TITLE = "Grant Autopilot · Grant applications for small nonprofits";

export function LandingPage() {
  React.useEffect(() => {
    document.title = LANDING_TITLE;
    return () => {
      document.title = "Grant Autopilot";
    };
  }, []);

  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <Trust />
      <Privacy />
      <PricingSection />
      <Faq />
      <MarketingFooter />
    </>
  );
}
