import { DocsShell } from "@/components/DocsShell";
import { HomeOverview } from "@/content/HomeOverview";

export default function HomePage() {
  return (
    <DocsShell
      title="ShootFlow documentation"
      description="Private docs site — TSX shell with markdown guides and HTML reports built from repo docs/."
    >
      <HomeOverview />
    </DocsShell>
  );
}
