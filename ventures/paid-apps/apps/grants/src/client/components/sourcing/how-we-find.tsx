// "How we find grants": the discovery channels behind the opportunities catalog, in plain words.
import { KbLink } from "@client/components/knowledge/link";
import {
  Button,
  buttonClass,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@client/components/ui";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Eye, FileUp, Landmark, Scale, ShieldCheck, Sparkles } from "lucide-react";
import * as React from "react";
import { POLITE_CHECKING_NOTE } from "./watchlist";

export type SourcingTab = "watchlist" | "prospects" | "how";

const opportunitiesHref = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}/opportunities`;

function Channel({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-card">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-semibold text-neutral-900">{title}</h3>
        <div className="space-y-2 text-sm leading-relaxed text-neutral-600">{children}</div>
        {action && <div className="pt-1">{action}</div>}
      </div>
    </li>
  );
}

export function HowWeFindGrants({
  orgId,
  onShowTab,
}: {
  orgId: string;
  /** Switch to another tab of the sourcing page. */
  onShowTab?: (tab: SourcingTab) => void;
}) {
  const headingId = React.useId();
  return (
    <div className="space-y-6">
      <section aria-labelledby={headingId} className="space-y-3">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight text-neutral-900">
          Where opportunities come from
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          <Channel icon={Landmark} title="Official grant APIs">
            <p>
              Every day we pull new and forecasted federal opportunities from the official{" "}
              <a
                href="https://www.grants.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 hover:underline"
              >
                Grants.gov
                <span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              and{" "}
              <a
                href="https://simpler.grants.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 hover:underline"
              >
                Simpler.Grants.gov
                <span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              APIs: the listings agencies publish, straight from the source.
            </p>
          </Channel>

          <Channel
            icon={Eye}
            title="Your funder watchlist"
            action={
              onShowTab && (
                <Button size="sm" variant="secondary" onClick={() => onShowTab("watchlist")}>
                  Manage your watchlist
                </Button>
              )
            }
          >
            <p>
              Foundation, state and community funder pages you add. We re-check each page on a
              schedule and tell you when it posts something new.
            </p>
            <p>{POLITE_CHECKING_NOTE}</p>
          </Channel>

          <Channel
            icon={FileUp}
            title="Imports by link or RFP"
            action={
              <KbLink
                href={opportunitiesHref(orgId)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                Import from Opportunities
              </KbLink>
            }
          >
            <p>
              Found a grant yourself? Paste its link or upload the RFP from the Opportunities page.
              We read the requirements from it, and imported grants stay private to your
              organization.
            </p>
          </Channel>

          <Channel
            icon={Scale}
            title="Foundation prospecting"
            action={
              onShowTab && (
                <Button size="sm" variant="secondary" onClick={() => onShowTab("prospects")}>
                  See foundation prospects
                </Button>
              )
            }
          >
            <p>
              We look through private foundations' 990-PF filings (via ProPublica Nonprofit
              Explorer) for funders whose past grants resemble your work. These are leads to
              research and build relationships with, not open calls for proposals.
            </p>
          </Channel>
        </ul>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Then we match them to you</CardTitle>
            <CardDescription>
              Every opportunity is checked against your fact base and ranked by expected value.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 text-sm leading-relaxed text-neutral-600">
          <ul className="space-y-2">
            <li className="flex gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                We estimate eligibility, fit and likelihood of award, and every reason cites the
                facts it relies on, so you can check our work.
              </span>
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                We only list opportunities a funder has actually posted. We don't guess deadlines,
                amounts or eligibility that the funder hasn't published.
              </span>
            </li>
          </ul>
          <KbLink href={opportunitiesHref(orgId)} className={buttonClass({ size: "sm" })}>
            Go to opportunities
            <ArrowRight aria-hidden />
          </KbLink>
        </CardBody>
      </Card>
    </div>
  );
}
