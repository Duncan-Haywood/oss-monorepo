import { DocsPageHeader } from "@/components/DocsLayout";
import { Prose } from "@/components/Prose";
import { WorkflowAuthorityContent } from "@/content/workflow-authority";

export const metadata = {
  title: "Workflow authority · ShootFlow Docs",
};

export default function WorkflowAuthorityPage() {
  return (
    <>
      <DocsPageHeader
        title="Workflow authority"
        description="Observe-only handoffs and how native shells must bind controls."
      />
      <Prose>
        <WorkflowAuthorityContent />
      </Prose>
    </>
  );
}
