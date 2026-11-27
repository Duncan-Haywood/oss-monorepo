import type { MeDto, PlanDto } from "@shared/api/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { ApiError, api } from "../lib/api";
import { launchNotice } from "../lib/launch-notice";
import { browserStore, clearSignupSource, pendingSignupSource } from "../lib/signup-source";
import { AcceptLegal, LegalLinks } from "../pages/legal";

export const meQuery = {
  queryKey: ["me"],
  queryFn: async () => {
    try {
      return await api<MeDto>("/api/me");
    } catch {
      return null;
    }
  },
};

// Public, no session needed; the same list the Billing page and the marketing site read.
export const plansQuery = {
  queryKey: ["billing-plans"],
  queryFn: () => api<{ items: PlanDto[]; checkoutAvailable?: boolean }>("/api/billing/plans"),
  staleTime: 5 * 60_000,
};

export function Layout() {
  const me = useQuery(meQuery);
  const plans = useQuery(plansQuery);
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A signed-in user who has not accepted the current documents sees the notice instead of the app;
  // the documents themselves stay readable, and an email's unsubscribe link always works.
  const mustAccept =
    me.data &&
    !me.data.legal.acceptedAt &&
    !pathname.startsWith("/legal/") &&
    pathname !== "/unsubscribe";
  // The "Start free" link's page (lib/signup-source.ts), posted once the visitor is signed in.
  const signedInId = me.data?.user.id;
  useEffect(() => {
    if (!signedInId) return;
    const store = browserStore();
    const source = pendingSignupSource(store);
    if (!source) return;
    api("/api/me/signup-source", { method: "POST", body: { source } }).then(
      () => clearSignupSource(store),
      // A 400 (not a page name) is final; a network, auth, rate-limit or server error retries on
      // the next load, until the entry ages out of the window.
      (e) => e instanceof ApiError && e.status === 400 && clearSignupSource(store),
    );
  }, [signedInId]);
  const signOut = async () => {
    await api("/api/auth/sign-out", { method: "POST", body: {} });
    await qc.invalidateQueries();
  };
  return (
    <div className="min-h-screen">
      <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
        {launchNotice(plans.data)}
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="shrink-0 text-lg font-bold">
            PayApps
          </Link>
          {me.data && (
            <div className="flex min-w-0 items-center gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-600">{me.data.user.email}</span>
              <button
                type="button"
                className="btn-secondary shrink-0 whitespace-nowrap"
                onClick={signOut}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {mustAccept && me.data ? <AcceptLegal legal={me.data.legal} /> : <Outlet />}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-500">
        <LegalLinks className="hover:underline" />
      </footer>
    </div>
  );
}
