// Settings sub-navigation (tabs) + page shell shared by every settings page.
import { Alert, ErrorMessage, PageHeader, Spinner } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  CircleUser,
  CreditCard,
  Gauge,
  Plug,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { type OrgDetail, useOrg, useOrgId } from "./use-org";

const TABS = [
  { label: "Organization", path: "general", to: "/orgs/$orgId/settings/general", icon: Building2 },
  { label: "Members", path: "members", to: "/orgs/$orgId/settings/members", icon: Users },
  {
    label: "Autopilot & review",
    path: "autopilot",
    to: "/orgs/$orgId/settings/autopilot",
    icon: Gauge,
  },
  {
    label: "Approvals",
    path: "approvals",
    to: "/orgs/$orgId/settings/approvals",
    icon: UserRoundCheck,
  },
  {
    label: "Calendar",
    path: "calendar",
    to: "/orgs/$orgId/settings/calendar",
    icon: CalendarDays,
  },
  {
    label: "Privacy & data",
    path: "privacy",
    to: "/orgs/$orgId/settings/privacy",
    icon: ShieldCheck,
  },
  {
    label: "Integrations",
    path: "integrations",
    to: "/orgs/$orgId/settings/integrations",
    icon: Plug,
  },

  {
    label: "Plan & billing",
    path: "billing",
    to: "/orgs/$orgId/settings/billing",
    icon: CreditCard,
  },
  { label: "Account", path: "account", to: "/orgs/$orgId/settings/account", icon: CircleUser },
] as const;

export type SettingsTab = (typeof TABS)[number]["path"];

export function SettingsNav({ orgId, active }: { orgId: string; active: SettingsTab }) {
  const navRef = useRef<HTMLElement>(null);
  // One scrollable row on small screens: bring the active tab into view.
  useEffect(() => {
    const current = navRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav ref={navRef} aria-label="Settings sections" className="mb-6 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-neutral-200">
        {TABS.map(({ label, path, to, icon: Icon }) => {
          const isActive = active === path;
          return (
            <li key={path} className="-mb-px shrink-0">
              <Link
                to={to}
                params={{ orgId }}
                aria-current={isActive ? "page" : undefined}
                data-tab={path}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Standard settings page frame: title, tabs, then loading/error handling around the org
 * detail. `children` receives the loaded org.
 */
export function SettingsPage({
  tab,
  title,
  description,
  actions,
  children,
}: {
  tab: SettingsTab;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: (ctx: { orgId: string; org: OrgDetail }) => ReactNode;
}) {
  const orgId = useOrgId();
  const org = useOrg(orgId);
  // Keep the active tab correct even if a route is reused.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (TABS.find((t) => pathname.endsWith(`/settings/${t.path}`))?.path ??
    tab) as SettingsTab;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={title} description={description} actions={actions} />
      <SettingsNav orgId={orgId} active={active} />
      {org.isPending ? (
        <Spinner label="Loading settings" />
      ) : org.isError ? (
        <ErrorMessage error={org.error} />
      ) : (
        children({ orgId, org: org.data })
      )}
    </div>
  );
}

export function ReadOnlyNotice({ minRole = "an admin" }: { minRole?: string }) {
  return (
    <Alert tone="info" title="View only">
      You can see these settings, but only {minRole} of your organization can change them.
    </Alert>
  );
}

/** Small "Saved" confirmation shown next to save buttons. */
export function SavedHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <output className="text-sm text-success-700" aria-live="polite">
      Saved
    </output>
  );
}
