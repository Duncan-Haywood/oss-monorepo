// OWNER: shell agent — authenticated app shell (sidebar nav, org switcher, user menu, auth guard).
import { routerPath } from "@client/lib/base-path";
import { Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  BookOpenText,
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  FileStack,
  FolderKanban,
  Handshake,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  MessagesSquare,
  Plus,
  Radar,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn";
import { type Me, type Membership, signOut, useMe } from "../../lib/session";
import { DemoBanner } from "../demo/demo-banner";
import { useInboxCount } from "../grants/inbox/queries";
import { GuideProgressPill } from "../guide/getting-started";
import { NotificationBell } from "../notifications/notification-bell";
import {
  Avatar,
  Button,
  ErrorMessage,
  Menu,
  Skeleton,
  Toaster,
  toast,
  useFocusTrap,
  useScrollLock,
} from "../ui";
import { Logo } from "./brand";
import { NotFound } from "./not-found";

type NavItem = {
  label: string;
  /** path under /orgs/$orgId */
  path: string;
  icon: LucideIcon;
  /** match only the exact path (dashboard) */
  exact?: boolean;
  /** treat any path starting with this prefix as active */
  matchPrefix?: string;
  /** Show the count of opportunities waiting for triage. */
  inboxBadge?: boolean;
};

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Grants",
    items: [
      { label: "Home", path: "", icon: LayoutDashboard, exact: true },
      { label: "Find grants", path: "/opportunities", icon: Sparkles },
      { label: "Triage inbox", path: "/opportunities/inbox", icon: Inbox, inboxBadge: true },
      { label: "Funders & watchlist", path: "/sourcing", icon: Radar },
      { label: "Funder relationships", path: "/funders", icon: Handshake },
      { label: "Drafts & applications", path: "/applications", icon: FileStack },
      { label: "Needs your review", path: "/reviews", icon: ClipboardCheck },
      { label: "Sent & follow-ups", path: "/submissions", icon: Send },
      { label: "Awards & reports", path: "/awards", icon: Award },
    ],
  },
  {
    heading: "Your information",
    items: [
      { label: "Your documents", path: "/knowledge/documents", icon: BookOpenText },
      { label: "What we know", path: "/knowledge/facts", icon: ListChecks },
      { label: "Search documents", path: "/knowledge/search", icon: Search },
      { label: "Interviews & updates", path: "/interviews", icon: MessagesSquare },
      { label: "Projects to fund", path: "/projects", icon: FolderKanban },
    ],
  },
  {
    heading: "Organization",
    items: [
      { label: "Settings", path: "/settings/general", icon: Settings, matchPrefix: "/settings" },
      { label: "Help", path: "/help", icon: LifeBuoy },
    ],
  },
];

type Crumb = { label: string; to?: string };

/** Breadcrumb trail for the top bar, derived from the nav: org › section › page (› detail). */
export function crumbsFor(pathname: string, base: string, orgName: string): Crumb[] {
  const p = pathname.replace(/\/+$/, "");
  const root: Crumb = { label: orgName, to: base };
  const home = NAV.flatMap((g) => g.items).find((i) => i.exact);
  if (p === base) return [root, { label: home?.label ?? "Home" }];
  let best: { group: string; item: NavItem; target: string } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.exact) continue;
      const target = `${base}${item.matchPrefix ?? item.path}`;
      if (
        (p === target || p.startsWith(`${target}/`)) &&
        target.length > (best?.target.length ?? 0)
      )
        best = { group: group.heading, item, target };
    }
  }
  if (!best) return [root];
  const rest = p.slice(best.target.length).split("/").filter(Boolean);
  const page: Crumb = { label: best.item.label, to: `${base}${best.item.path}` };
  if (!rest.length) return [root, { label: best.group }, { label: best.item.label }];
  if (best.item.matchPrefix) {
    const sub = (rest[0] ?? "").replace(/-/g, " ");
    return [root, page, { label: sub.charAt(0).toUpperCase() + sub.slice(1) }];
  }
  return [root, page, { label: "Details" }];
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are positional; labels can repeat
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
              )}
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-strong">
                  {c.label}
                </span>
              ) : c.to ? (
                <Link
                  to={c.to}
                  className="max-w-[16rem] truncate text-muted transition-colors hover:text-strong"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-subtle">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function OrgLayout() {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const me = useMe();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signedOut = me.isSuccess && me.data === null;
  const noOrgs = me.isSuccess && me.data !== null && me.data.memberships.length === 0;

  React.useEffect(() => {
    if (signedOut) {
      const next = `${routerPath(window.location.pathname)}${window.location.search}`;
      void navigate({ href: `/login?next=${encodeURIComponent(next)}`, replace: true });
    } else if (noOrgs) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [signedOut, noOrgs, navigate]);

  if (me.isPending || signedOut || noOrgs) return <ShellSkeleton />;
  if (me.isError) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorMessage error={me.error} title="We couldn't load your account" />
        <Button className="mt-4" variant="secondary" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const data = me.data as Me;
  const membership = data.memberships.find((m) => m.orgId === orgId);
  if (!membership) {
    const first = data.memberships[0] as Membership;
    return (
      <div className="min-h-full bg-subtle">
        <NotFound
          title="Organization not found"
          description="This organization doesn't exist, or you're not a member of it. Ask an admin to invite you."
          backTo={`/orgs/${first.orgId}`}
          backLabel={`Go to ${first.orgName}`}
        />
      </div>
    );
  }
  return <Shell me={data} membership={membership} pathname={pathname} />;
}

function Shell({ me, membership, pathname }: { me: Me; membership: Membership; pathname: string }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // Close the mobile drawer whenever the route changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on pathname change only
  React.useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="flex min-h-full">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium text-brand-800 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <SidebarContent me={me} membership={membership} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <MobileDrawer onClose={() => setDrawerOpen(false)}>
          <SidebarContent me={me} membership={membership} pathname={pathname} inDrawer />
        </MobileDrawer>
      )}

      {/* `relative overflow-x-clip`: content that is too wide (or an absolutely positioned sr-only
          label) is clipped here instead of widening the page, which on phones zooms the whole layout
          out and pushes fixed overlays (dialogs, toasts) off-screen. `clip` keeps the header sticky. */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-x-clip">
        <DemoBanner me={me} />
        <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-line bg-surface/90 backdrop-blur lg:flex">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-10">
            <Breadcrumbs
              crumbs={crumbsFor(pathname, `/orgs/${membership.orgId}`, membership.orgName)}
            />
          </div>
        </header>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon aria-hidden />
          </Button>
          <Logo />
          <span className="ml-auto max-w-[40%] truncate text-sm text-subtle">
            {membership.orgName}
          </span>
          <GuideProgressPill orgId={membership.orgId} />
          {/* The sidebar bell (always mounted, CSS-hidden below lg) polls; this one shares its cache. */}
          <NotificationBell orgId={membership.orgId} poll={false} />
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:pt-7 lg:pb-12"
        >
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function MobileDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useScrollLock(true);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        aria-hidden
        className="absolute inset-0 animate-fade-in bg-neutral-950/45"
        onMouseDown={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="relative flex h-full w-72 max-w-[85vw] animate-slide-in-left flex-col bg-surface shadow-overlay"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-2 top-3 rounded-md p-2 text-subtle hover:bg-muted"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

function SidebarContent({
  me,
  membership,
  pathname,
  inDrawer = false,
}: {
  me: Me;
  membership: Membership;
  pathname: string;
  /** The mobile drawer: the top bar already has the bell (and the drawer's close button sits here). */
  inDrawer?: boolean;
}) {
  const base = `/orgs/${membership.orgId}`;
  const inboxCount = useInboxCount(membership.orgId);
  const isActive = (item: NavItem) => {
    const p = pathname.replace(/\/+$/, "");
    if (item.path === "/opportunities" && p.startsWith(`${base}/opportunities/inbox`)) return false;
    const target = `${base}${item.matchPrefix ?? item.path}`;
    if (item.exact) return p === target;
    return p === target || p.startsWith(`${target}/`);
  };
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to={base} aria-label="Dashboard">
          <Logo />
        </Link>
        {!inDrawer && (
          <div className="-mr-2 ml-auto flex items-center gap-1">
            <GuideProgressPill orgId={membership.orgId} />
            <NotificationBell orgId={membership.orgId} />
          </div>
        )}
      </div>
      <div className="px-3">
        <OrgSwitcher me={me} current={membership} />
      </div>
      <nav aria-label="Main" className="mt-5 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.heading}>
            <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-subtle">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      to={`${base}${item.path}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-50 font-semibold text-brand-800 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-brand-600"
                          : "text-muted hover:bg-muted hover:text-strong",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5 shrink-0",
                          active ? "text-brand-600" : "text-neutral-400 group-hover:text-muted",
                        )}
                        aria-hidden
                      />
                      {item.label}
                      {item.inboxBadge && !!inboxCount && (
                        <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white tabular-nums">
                          {inboxCount > 99 ? "99+" : inboxCount}
                          <span className="sr-only"> to triage</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-line bg-subtle/60 p-3">
        <UserMenu me={me} role={membership.role} />
      </div>
    </>
  );
}

function OrgSwitcher({ me, current }: { me: Me; current: Membership }) {
  const navigate = useNavigate();
  return (
    <Menu
      align="start"
      label="Switch organization"
      className="w-60"
      header={<p className="text-xs font-medium text-subtle">Your organizations</p>}
      items={[
        ...me.memberships.map((m) => ({
          label: m.orgName,
          icon: m.orgId === current.orgId ? <Check /> : <Building2 />,
          selected: m.orgId === current.orgId,
          onSelect: () => void navigate({ to: `/orgs/${encodeURIComponent(m.orgId)}` }),
        })),
        "separator" as const,
        {
          label: "Create organization",
          icon: <Plus />,
          onSelect: () => void navigate({ to: "/onboarding" }),
        },
      ]}
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-2.5 py-2 text-left shadow-xs transition-colors hover:border-line-strong hover:bg-subtle"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-100 text-sm font-semibold text-accent-800 ring-1 ring-inset ring-accent-200">
            {current.orgName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-strong">
              {current.orgName}
            </span>
            <span className="block text-xs capitalize text-subtle">{current.role}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="sr-only">Switch organization</span>
        </button>
      }
    />
  );
}

function UserMenu({ me, role }: { me: Me; role: string }) {
  const navigate = useNavigate();
  const name = me.user.name || me.user.email;
  return (
    <Menu
      align="start"
      side="top"
      label="Account"
      className="w-60"
      header={
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-strong">{name}</p>
          <p className="truncate text-xs text-subtle">{me.user.email}</p>
        </div>
      }
      items={[
        ...(me.isPlatformAdmin
          ? [
              {
                label: "Platform admin",
                icon: <ShieldCheck />,
                onSelect: () => void navigate({ to: "/admin" }),
              },
              "separator" as const,
            ]
          : []),
        {
          label: "Sign out",
          icon: <LogOut />,
          onSelect: async () => {
            try {
              await signOut();
            } catch {
              toast.error("Sign-out failed", "Please try again.");
              return;
            }
            void navigate({ to: "/login", replace: true });
          },
        },
      ]}
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
        >
          <Avatar name={name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-strong">{name}</span>
            <span className="block truncate text-xs capitalize text-subtle">{role}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="sr-only">Account menu</span>
        </button>
      }
    />
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-full" role="status" aria-label="Loading your workspace">
      <div className="hidden w-64 shrink-0 space-y-4 border-r border-line bg-surface p-5 lg:block">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  );
}

export { Link };
