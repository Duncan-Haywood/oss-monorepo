import { DocsShell } from "@/components/DocsShell";
import { SecurityGuide } from "@/content/SecurityGuide";

export const metadata = {
  title: "Security & domain",
};

export default function SecurityPage() {
  return (
    <DocsShell
      title="Security & custom domain"
      description="How to keep this docs deployment private on Vercel."
      breadcrumb={[{ label: "Security" }]}
    >
      <SecurityGuide />
    </DocsShell>
  );
}
