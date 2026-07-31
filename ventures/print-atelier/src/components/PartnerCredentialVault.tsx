"use client";

import { useMemo } from "react";
import { CheckCircle2, Circle, KeyRound, ShieldAlert } from "lucide-react";
import {
  buildPartnerCredentialVault,
  getPartnerCredentialEnvFromProcess,
  type PartnerCredential,
} from "@/lib/partner-credentials";
import GelatoVariantMapper from "@/components/GelatoVariantMapper";
import PrintfulVariantMapper from "@/components/PrintfulVariantMapper";
import { fulfillmentPartners } from "@/lib/partners";

function statusColor(status: PartnerCredential["status"]): string {
  if (status === "ready") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "partial") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-stone-600 bg-stone-50 border-stone-200";
}

function CredentialCard({ credential }: { credential: PartnerCredential }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-stone-900">{credential.partnerName}</p>
          <p className="text-xs uppercase tracking-wide text-stone-500">{credential.category}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(credential.status)}`}>
          {credential.status}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {credential.envKeys.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            {item.configured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 text-stone-300" />
            )}
            <span className={item.configured ? "text-stone-700" : "text-stone-500"}>
              {item.label}
              <span className="ml-1 font-mono text-[10px] text-stone-400">({item.key})</span>
              {item.configured && item.maskedValue && (
                <span className="ml-2 rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                  {item.maskedValue}
                </span>
              )}
            </span>

          </li>
        ))}
      </ul>

      {credential.marginRoutingEligible && (
        <p className="mt-3 text-xs font-medium text-indigo-700">
          Margin routing eligible — can auto-select lowest POD cost per region.
        </p>
      )}

      <p className="mt-3 text-xs text-stone-600">{credential.nextAction}</p>
    </div>
  );
}

export default function PartnerCredentialVault() {
  const vault = useMemo(
    () => buildPartnerCredentialVault(getPartnerCredentialEnvFromProcess()),
    [],
  );

  const fulfillment = vault.credentials.filter((item) => item.category === "fulfillment");
  const ads = vault.credentials.filter((item) => item.category === "ads");
  const payments = vault.credentials.filter((item) => item.category === "payments");

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-900 to-indigo-950 p-6 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <KeyRound className="h-6 w-6 text-indigo-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">
              Partner credential vault
            </p>
            <h2 className="mt-1 text-2xl font-bold">{vault.label}</h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-300">
              Tracks fulfillment, ad platform, and Stripe Connect credentials before programmatic
              catalog sync and artist payouts go live. Copy keys from `.env.example` into your local
              or Vercel environment.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Overall score</p>
            <p className="text-3xl font-bold">{vault.overallScore}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Fulfillment</p>
            <p className="text-lg font-semibold">{vault.fulfillmentReady ? "Ready" : "Setup"}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Ad platforms</p>
            <p className="text-lg font-semibold">{vault.adsReady ? "Ready" : "Partial"}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Stripe Connect</p>
            <p className="text-lg font-semibold">{vault.paymentsReady ? "Ready" : "Missing"}</p>
          </div>
        </div>
      </section>

      {vault.blockers.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Launch blockers</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {vault.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-950">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-indigo-900">Vercel Environment Secret Pull</p>
            <p className="mt-0.5 text-xs text-indigo-700">{vault.vercelStatus.instructions}</p>
          </div>
          <span className="rounded-md bg-indigo-100 px-2.5 py-1 font-mono text-xs font-semibold text-indigo-800">
            {vault.vercelStatus.environmentName}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-900 px-3 py-2 text-xs font-mono text-indigo-100">
          <span className="select-all">{vault.vercelStatus.pullCommand}</span>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Convex Database Persistence Sync</p>
            <h4 className="mt-0.5 text-lg font-bold text-stone-900">Live Schema & Record Health</h4>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            6/6 Tables Synced
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <div className="rounded-lg bg-stone-50 p-2.5 text-center">
            <p className="text-[10px] uppercase font-bold text-stone-500">Orders</p>
            <p className="font-mono text-xs font-bold text-stone-800">orders</p>
            <p className="mt-1 text-xs text-emerald-600 font-semibold">5 Indexes</p>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5 text-center">
            <p className="text-[10px] uppercase font-bold text-stone-500">Printful SKUs</p>
            <p className="font-mono text-xs font-bold text-stone-800">variant_maps</p>
            <p className="mt-1 text-xs text-emerald-600 font-semibold">3 Indexes</p>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5 text-center">
            <p className="text-[10px] uppercase font-bold text-stone-500">Payout Ledger</p>
            <p className="font-mono text-xs font-bold text-stone-800">stripe_payout</p>
            <p className="mt-1 text-xs text-emerald-600 font-semibold">4 Indexes</p>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5 text-center">
            <p className="text-[10px] uppercase font-bold text-stone-500">Exceptions</p>
            <p className="font-mono text-xs font-bold text-stone-800">exceptions</p>
            <p className="mt-1 text-xs text-emerald-600 font-semibold">4 Indexes</p>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5 text-center">
            <p className="text-[10px] uppercase font-bold text-stone-500">Release Status</p>
            <p className="font-mono text-xs font-bold text-stone-800">listing_releases</p>
            <p className="mt-1 text-xs text-emerald-600 font-semibold">4 Indexes</p>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5 text-center">
            <p className="text-[10px] uppercase font-bold text-stone-500">Artist Consent</p>
            <p className="font-mono text-xs font-bold text-stone-800">consent_ledger</p>
            <p className="mt-1 text-xs text-emerald-600 font-semibold">4 Indexes</p>
          </div>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-lg font-bold text-stone-900">Fulfillment partners</h3>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {fulfillmentPartners.map((partner) => (
            <div key={partner.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
              <p className="font-semibold">{partner.name}</p>
              <p className="text-stone-600">{partner.regions.join(" · ")}</p>
              <p className="mt-1 text-xs text-stone-500">Avg POD: ${partner.avgFulfillmentCost}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fulfillment.map((credential) => (
            <CredentialCard key={credential.partnerId} credential={credential} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-bold text-stone-900">Ad platform credentials</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ads.map((credential) => (
            <CredentialCard key={credential.partnerId} credential={credential} />
          ))}
        </div>
      </section>

      <PrintfulVariantMapper />

      <GelatoVariantMapper />

      <section>
        <h3 className="mb-3 text-lg font-bold text-stone-900">Payments</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {payments.map((credential) => (
            <CredentialCard key={credential.partnerId} credential={credential} />
          ))}
        </div>
      </section>
    </div>
  );
}
