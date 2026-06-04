import { DocsPageHeader } from "@/components/DocsLayout";
import { Prose } from "@/components/Prose";
import { ProductStrategyContent } from "@/content/product-strategy";

export const metadata = {
  title: "Product strategy · ShootFlow Docs",
};

export default function ProductStrategyPage() {
  return (
    <>
      <DocsPageHeader
        title="Product strategy"
        description="Audience, wedge, differentiation, and workflow value for the ShootFlow core."
      />
      <Prose>
        <ProductStrategyContent />
      </Prose>
    </>
  );
}
