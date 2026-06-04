import { DocsPageHeader } from "@/components/DocsLayout";
import { Prose } from "@/components/Prose";
import { BusinessPlanContent } from "@/content/business-plan";

export const metadata = {
  title: "Business plan · ShootFlow Docs",
};

export default function BusinessPlanPage() {
  return (
    <>
      <DocsPageHeader
        title="Business plan"
        description="Positioning, monetization hypotheses, and GTM motion."
      />
      <Prose>
        <BusinessPlanContent />
      </Prose>
    </>
  );
}
