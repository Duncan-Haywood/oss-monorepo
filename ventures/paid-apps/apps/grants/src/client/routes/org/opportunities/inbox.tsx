// OWNER: grants UI agent — /orgs/$orgId/opportunities/inbox: triage new matches (shortlist /
// dismiss) before autopilot drafts them. With requireMatchApproval on, only shortlisted matches
// are auto-drafted.

import { TriageInbox } from "@client/components/grants/inbox/triage-inbox";
import { useOrgId } from "@client/components/grants/queries";
import { buttonClass, PageHeader } from "@client/components/ui";
import { useCurrentOrg } from "@client/lib/session";
import { Link } from "@tanstack/react-router";

export function OpportunityInboxPage() {
  const orgId = useOrgId();
  const { can } = useCurrentOrg();
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Opportunities"
        title="Triage inbox"
        description="New matches, highest expected value first. Shortlist the grants worth applying for and dismiss the rest — your reasons help rank future grants."
        actions={
          <Link
            to="/orgs/$orgId/opportunities"
            params={{ orgId }}
            className={buttonClass({ variant: "secondary" })}
          >
            All opportunities
          </Link>
        }
      />
      <TriageInbox orgId={orgId} canEdit={can("editor")} />
    </div>
  );
}
