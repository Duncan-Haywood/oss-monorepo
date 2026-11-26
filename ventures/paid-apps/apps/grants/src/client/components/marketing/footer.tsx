// Marketing footer: closing call to action plus a site map, shared by the landing page and every
// marketing page. It sits inside <main>, above the PublicLayout footer, so it is not a second
// contentinfo landmark.
import { Logo } from "@client/components/layout/brand";
import { buttonClass } from "@client/components/ui";
import { LEGAL_DOC_KEYS, LEGAL_DOC_TITLES, LEGAL_ENTITY } from "@shared/legal";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GUARANTEE_DAYS } from "./plan-copy";
import { Container } from "./section";
import { SiteLink } from "./site-link";
import { FOOTER_COMPANY_NAV, FOOTER_PRODUCT_NAV, type NavItem } from "./site-map";

const headingClass = "text-sm font-semibold text-white";
const linkClass = "text-brand-100 hover:text-white hover:underline";

function SiteNav({ label, items }: { label: string; items: readonly NavItem[] }) {
  return (
    <nav aria-label={label}>
      <p className={headingClass}>{label}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.to}>
            <SiteLink to={item.to} className={linkClass}>
              {item.label}
            </SiteLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-brand-900 text-white">
      <Container className="py-16 lg:py-20">
        <div className="flex flex-col items-start gap-8 border-b border-white/10 pb-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2
              id="closing-heading"
              className="text-balance text-3xl font-semibold tracking-tight text-white"
            >
              Spend less time on paperwork and more on your mission.
            </h2>
            <p className="mt-3 text-lg text-brand-100">
              Set up your organization with the documents you already have. By default nothing is
              sent until you approve it, and you're covered by a {GUARANTEE_DAYS}-day money-back
              guarantee.
            </p>
          </div>
          <Link
            to="/signup"
            className={buttonClass({
              size: "lg",
              variant: "secondary",
              className: "border-transparent",
            })}
          >
            Create your account
            <ArrowRight aria-hidden />
          </Link>
        </div>

        <div className="grid gap-10 pt-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs space-y-3">
            <Logo inverted />
            <p className="text-sm leading-relaxed text-brand-100">
              Grant applications for small nonprofits, drafted only from your own records and
              approved by your own people.
            </p>
          </div>
          <SiteNav label="Product" items={FOOTER_PRODUCT_NAV} />
          <nav aria-label="Company">
            <p className={headingClass}>Company</p>
            <ul className="mt-3 space-y-2 text-sm">
              {FOOTER_COMPANY_NAV.map((item) => (
                <li key={item.to}>
                  <SiteLink to={item.to} className={linkClass}>
                    {item.label}
                  </SiteLink>
                </li>
              ))}
              <li>
                <Link to="/signup" className={linkClass}>
                  Create an account
                </Link>
              </li>
              <li>
                <Link to="/login" className={linkClass}>
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Policies">
            <p className={headingClass}>Policies</p>
            <ul className="mt-3 space-y-2 text-sm">
              {LEGAL_DOC_KEYS.map((doc) => (
                <li key={doc}>
                  <Link to="/legal/$doc" params={{ doc }} className={linkClass}>
                    {LEGAL_DOC_TITLES[doc]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-12 text-xs text-brand-200">
          Grant Autopilot is operated by {LEGAL_ENTITY.name}, {LEGAL_ENTITY.jurisdiction}, USA.
        </p>
      </Container>
    </footer>
  );
}
