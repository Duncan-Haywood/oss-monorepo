// Public page: mission and who's behind Grant Autopilot. Brief on purpose: no invented bios, and no
// client names (the pilot partner is described, not named, until they say otherwise).
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import {
  FeatureCard,
  GetStartedActions,
  PageHero,
  PageSection,
} from "@client/components/marketing/page";
import { MARKETING_PATHS } from "@client/components/marketing/site-map";
import { LEGAL_ENTITY } from "@shared/legal";
import { Eye, HandCoins, Handshake, ShieldCheck } from "lucide-react";

export function AboutPage() {
  useDocumentMeta({
    title: "About us",
    description:
      "Grant Autopilot is built by Mary Stella Labs, LLC in New Mexico to help small nonprofits, tribal and community organizations apply for grants without misrepresenting themselves.",
    canonicalPath: MARKETING_PATHS.about,
  });

  return (
    <>
      <PageHero eyebrow="About us" title="Grant writing help for teams without a grant writer">
        <p>
          Small organizations do some of the most important work in their communities, often with a
          few staff and no one whose whole job is grants. Many manage only a handful of applications
          a year, not because their work isn't worth funding, but because there aren't enough hours.
        </p>
        <p>
          Grant Autopilot exists to give those teams more hours back, without ever putting words in
          their mouths.
        </p>
      </PageHero>

      <PageSection
        id="mission"
        eyebrow="Our mission"
        title="More applications, every one of them true"
        intro={
          <p>
            We want small nonprofits, tribal and community organizations and training programs to
            apply for every grant they're a good fit for, with applications that say only what their
            own records support.
          </p>
        }
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={ShieldCheck} title="Accuracy before volume">
            <p>
              A grant application is a promise to a funder. We'd rather leave a question for you
              than write a sentence your records can't back up.
            </p>
          </FeatureCard>
          <FeatureCard icon={Eye} title="Your data stays yours">
            <p>
              Your documents are used only for your own applications, never shared with other
              organizations and never used to train AI.
            </p>
          </FeatureCard>
          <FeatureCard icon={HandCoins} title="Priced for small budgets">
            <p>We charge roughly what it costs us to run, plus a margin to keep the lights on.</p>
          </FeatureCard>
          <FeatureCard icon={Handshake} title="Honest about limits">
            <p>
              We say what the product can't do yet, we don't promise funding, and we don't name the
              organizations we work with unless they've asked us to.
            </p>
          </FeatureCard>
        </ul>
      </PageSection>

      <PageSection id="who" tone="muted" eyebrow="Who we are" title="Who's behind Grant Autopilot">
        <div className="max-w-3xl space-y-4 text-lg leading-relaxed text-neutral-700">
          <p>
            Grant Autopilot is built and operated by {LEGAL_ENTITY.name}, a small company based in{" "}
            {LEGAL_ENTITY.jurisdiction}.
          </p>
          <p>
            We're developing it with a pilot partner, a nonprofit in New Mexico, and their team's
            feedback shapes what we build. Their data gets the same protections as everyone else's,
            and we won't name them, or any organization we work with, without their permission.
          </p>
        </div>
      </PageSection>

      <PageSection
        id="next"
        eyebrow="Get in touch"
        title="Talk to us, or try it yourself"
        intro={
          <p>
            Questions about whether Grant Autopilot fits your organization are welcome. So is
            feedback.
          </p>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <GetStartedActions secondary={{ to: MARKETING_PATHS.contact, label: "Contact us" }} />
        </div>
      </PageSection>

      <MarketingFooter />
    </>
  );
}
