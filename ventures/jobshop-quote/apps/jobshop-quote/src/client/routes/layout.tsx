// Signed-in shell: top navigation for one shop.

import type { ShopSettingsDto } from "@shared/api";
import { isoShopDay } from "@shared/time-zone";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Fragment } from "react";
import { Button } from "../components/ui";
import { api, orgApi, queryClient, setMoneyCurrency } from "../lib/api";
import { LegalFooter, LegalGate } from "./legal";
import { useMe } from "./public";

export const useOrgId = () => (useParams({ strict: false }) as { orgId: string }).orgId;

export interface OrgInfo {
  org: { id: string; name: string };
  role: "owner" | "admin" | "estimator" | "viewer";
  settings: ShopSettingsDto;
}

export const useOrg = (orgId: string) =>
  useQuery({ queryKey: ["org", orgId], queryFn: () => api<OrgInfo>(orgApi(orgId)) });

/**
 * Prints an ISO instant as the shop's day (shop_settings.time_zone; UTC until the org loads or when
 * unset), so a quote sent at 7 pm in Chicago reads as that day on every page, as on its PDF.
 */
export function useShopDay(orgId: string): (iso: string | null | undefined) => string {
  const zone = useOrg(orgId).data?.settings.timeZone ?? null;
  return (iso) => isoShopDay(iso, zone);
}

export const canEstimate = (role?: string) =>
  role === "owner" || role === "admin" || role === "estimator";
export const canAdmin = (role?: string) => role === "owner" || role === "admin";

export function OrgLayout() {
  const orgId = useOrgId();
  const me = useMe();
  const org = useOrg(orgId);
  const navigate = useNavigate();
  // Set before the pages below render, so every amount prints in the shop's currency.
  const currency = org.data?.settings.currency ?? null;
  setMoneyCurrency(currency);
  if (me.isLoading) return null;
  if (!me.data) return <Navigate to="/sign-in" />;
  const nav = [
    ["/app/$orgId", "Quote log"],
    ["/app/$orgId/win-loss", "Win/loss"],
    ["/app/$orgId/rfqs", "RFQs"],
    ["/app/$orgId/rate-card", "Rate card"],
    ["/app/$orgId/routings", "Routings"],
    ["/app/$orgId/team", "Team"],
    ["/app/$orgId/billing", "Billing"],
  ] as const;
  const signOut = async () => {
    await api("/api/auth/sign-out", { method: "POST", body: {} });
    queryClient.clear();
    await navigate({ to: "/sign-in" });
  };
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-2">
          <span className="font-semibold text-stone-900">{org.data?.org.name ?? "…"}</span>
          <nav className="flex flex-wrap gap-1">
            {nav.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                params={{ orgId }}
                activeOptions={{ exact: to === "/app/$orgId" }}
                className="rounded px-2 py-1 text-sm text-stone-700 hover:bg-stone-100"
                activeProps={{ className: "bg-sky-50 font-medium text-sky-900" }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm text-stone-600">
            <span>{me.data.user.email}</span>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* A user who has not accepted the current documents sees the notice instead of the shop. */}
        <LegalGate>
          {/* Remounted when the currency changes (or loads), so no page keeps the old symbol. */}
          <Fragment key={currency ?? "default"}>
            <Outlet />
          </Fragment>
        </LegalGate>
      </main>
      <LegalFooter />
    </div>
  );
}
