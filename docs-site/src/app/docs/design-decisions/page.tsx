import { DocsPageHeader } from "@/components/DocsLayout";
import { Prose } from "@/components/Prose";
import { DesignDecisionsContent } from "@/content/design-decisions";

export const metadata = {
  title: "Design decisions · ShootFlow Docs",
};

export default function DesignDecisionsPage() {
  return (
    <>
      <DocsPageHeader
        title="Design decisions"
        description="Safety invariants, module boundaries, and production contracts."
      />
      <Prose>
        <DesignDecisionsContent />
      </Prose>
    </>
  );
}
