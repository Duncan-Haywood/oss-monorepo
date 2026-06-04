import { DocsPageHeader } from "@/components/DocsLayout";
import { Prose } from "@/components/Prose";
import { TermsContent } from "@/content/terms";

export const metadata = {
  title: "Terms draft · ShootFlow Docs",
};

export default function TermsPage() {
  return (
    <>
      <DocsPageHeader
        title="Terms and conditions (draft)"
        description="Internal working draft summary—not published legal advice."
      />
      <Prose>
        <TermsContent />
      </Prose>
    </>
  );
}
