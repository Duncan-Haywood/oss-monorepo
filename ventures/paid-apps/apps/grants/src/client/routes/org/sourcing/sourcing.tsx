// Grant sourcing: where opportunities come from — the org's funder watchlist, foundation prospects
// from 990-PF data, and a plain-language explainer of the discovery channels.
import { useOrgId } from "@client/components/grants/queries";
import { KbLink } from "@client/components/knowledge/link";
import { HowWeFindGrants, type SourcingTab } from "@client/components/sourcing/how-we-find";
import { ProspectsPanel } from "@client/components/sourcing/prospects";
import { WatchlistPanel } from "@client/components/sourcing/watchlist";
import { buttonClass, PageHeader, Tab, TabList, TabPanel, Tabs } from "@client/components/ui";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import * as React from "react";

const TABS: readonly SourcingTab[] = ["watchlist", "prospects", "how"];
const isTab = (v: unknown): v is SourcingTab =>
  typeof v === "string" && (TABS as readonly string[]).includes(v);

/** The selected tab, mirrored to `?tab=` so it survives reloads and can be linked to. */
function useTabParam(): [SourcingTab, (t: SourcingTab) => void] {
  const search = useSearch({ strict: false }) as { tab?: unknown };
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<SourcingTab>(isTab(search.tab) ? search.tab : "watchlist");
  React.useEffect(() => {
    if (isTab(search.tab)) setTab(search.tab);
  }, [search.tab]);
  const select = React.useCallback(
    (t: SourcingTab) => {
      setTab(t);
      void navigate({
        from: "/orgs/$orgId/sourcing",
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, tab: t }),
        replace: true,
      });
    },
    [navigate],
  );
  return [tab, select];
}

export function SourcingPage() {
  const orgId = useOrgId();
  const [tab, setTab] = useTabParam();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Grant sourcing"
        description="Where your grant opportunities come from: official listings, the funder pages you watch, and foundations worth getting to know."
        actions={
          <KbLink
            href={`/orgs/${encodeURIComponent(orgId)}/opportunities`}
            className={buttonClass({ variant: "secondary" })}
          >
            <Sparkles aria-hidden />
            View opportunities
          </KbLink>
        }
      />
      <Tabs value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
        <TabList aria-label="Grant sourcing sections">
          <Tab value="watchlist">Watchlist</Tab>
          <Tab value="prospects">Foundation prospects</Tab>
          <Tab value="how">How we find grants</Tab>
        </TabList>
        <TabPanel value="watchlist">
          <WatchlistPanel orgId={orgId} />
        </TabPanel>
        <TabPanel value="prospects">
          <ProspectsPanel orgId={orgId} />
        </TabPanel>
        <TabPanel value="how">
          <HowWeFindGrants orgId={orgId} onShowTab={setTab} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
