// Public page: how to reach us. A mailto link only (no form backend). The address is CONTACT_EMAIL in
// components/marketing/site-map.ts.
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import { CheckList, PageHero, PageSection } from "@client/components/marketing/page";
import { inlineLinkClass, PolicyLink, SiteLink } from "@client/components/marketing/site-link";
import { CONTACT_EMAIL, MARKETING_PATHS } from "@client/components/marketing/site-map";
import { buttonClass } from "@client/components/ui";
import { LEGAL_ENTITY } from "@shared/legal";
import { Mail } from "lucide-react";

export function ContactPage() {
  useDocumentMeta({
    title: "Contact us",
    description:
      "Email the Grant Autopilot team with questions about fit, support, billing, refunds or privacy.",
    canonicalPath: MARKETING_PATHS.contact,
  });

  return (
    <>
      <PageHero eyebrow="Contact" title="Contact us">
        <p>
          We're a small team and glad to hear from you, whether you're wondering if Grant Autopilot
          fits your organization or you need help with your account.
        </p>
      </PageHero>

      <PageSection id="email" title="Email us">
        <div className="flex max-w-3xl flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-medium text-neutral-500">Write to</p>
            <p className="mt-1 break-all text-xl font-semibold text-neutral-900">{CONTACT_EMAIL}</p>
          </div>
          <a href={`mailto:${CONTACT_EMAIL}`} className={buttonClass({ size: "lg" })}>
            <Mail aria-hidden />
            Send an email
          </a>
        </div>

        <div className="mt-10 grid max-w-5xl gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">To help us help you</h3>
            <CheckList
              className="mt-4 text-sm leading-relaxed"
              items={[
                "If you already have an account, tell us your organization's name and the email you sign in with.",
                "For a refund, say which organization the subscription is for.",
                "Please don't email us documents or personal details about the people you serve. If we need to look at something in your account, we'll ask.",
              ]}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              You might find it faster here
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <SiteLink to={MARKETING_PATHS.faq} className={inlineLinkClass}>
                  Frequently asked questions
                </SiteLink>
              </li>
              <li>
                <SiteLink to={MARKETING_PATHS.pricing} className={inlineLinkClass}>
                  Pricing, refunds and promo codes
                </SiteLink>
              </li>
              <li>
                <SiteLink to={MARKETING_PATHS.trust} className={inlineLinkClass}>
                  Security and privacy
                </SiteLink>
              </li>
              <li>
                Exports and deletion are in your organization's privacy settings. See the{" "}
                <PolicyLink doc="data-use">Data Use Policy</PolicyLink>.
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 text-sm text-neutral-500">
          {LEGAL_ENTITY.name}, {LEGAL_ENTITY.jurisdiction}, USA
        </p>
      </PageSection>

      <MarketingFooter />
    </>
  );
}
