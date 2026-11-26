// OWNER: applications UI agent — one application: cited draft, flags, review, submission.

import { ActivityTimeline } from "@client/components/application/activity-timeline";
import {
  ApplicationDetailSkeleton,
  ApplicationView,
  BackToApplications,
} from "@client/components/application/application-view";
import { BudgetEditor } from "@client/components/application/budget-editor";
import { EDITABLE_STATUSES } from "@client/components/application/model";
import { QualityPanel } from "@client/components/application/quality-panel";
import { useApplication } from "@client/components/application/queries";
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { useOrgId } from "@client/components/grants/queries";
import { EmptyState, Tab, TabList, TabPanel, Tabs } from "@client/components/ui";
import { ApiError } from "@client/lib/api";
import { useCurrentOrg } from "@client/lib/session";
import { useParams } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

export function ApplicationDetailPage() {
  const orgId = useOrgId();
  const { can } = useCurrentOrg();
  const { applicationId = "" } = useParams({ strict: false }) as { applicationId?: string };
  const q = useApplication(orgId, applicationId);

  if (q.isPending) return <ApplicationDetailSkeleton />;
  if (q.error) {
    return (
      <div className="space-y-4">
        <BackToApplications orgId={orgId} />
        {q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState
            icon={<FileQuestion />}
            title="Application not found"
            description="It may have been deleted, or it belongs to another organization."
          />
        ) : (
          <ApiErrorAlert error={q.error} title="Couldn't load this application" />
        )}
      </div>
    );
  }
  return (
    <Tabs defaultValue="application">
      <TabList aria-label="Application views" className="mb-6">
        <Tab value="application">Application</Tab>
        <Tab value="activity">Activity</Tab>
      </TabList>
      <TabPanel value="application" className="space-y-6">
        <ApplicationView app={q.data} orgId={orgId} />
        <BudgetEditor orgId={orgId} applicationId={q.data.id} canEdit={can("editor")} />
        <QualityPanel
          orgId={orgId}
          applicationId={q.data.id}
          currentVersionId={q.data.currentVersionId}
          canEdit={can("editor") && EDITABLE_STATUSES.includes(q.data.status)}
        />
      </TabPanel>
      <TabPanel value="activity">
        <ActivityTimeline orgId={orgId} applicationId={applicationId} />
      </TabPanel>
    </Tabs>
  );
}
