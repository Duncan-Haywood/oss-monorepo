"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, KeyRound, ShieldAlert } from "lucide-react";
import type {
  PartnerCredential,
  PartnerCredentialVault as CredentialVault,
} from "@/lib/partner-credentials";
import { fetchOperatorJson, type OperatorFetchResult } from "@/lib/operator-client";
import OperatorAccessNotice from "@/components/OperatorAccessNotice";
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

/**
 * `/partner-setup` is a page, and this venture has no login, so this component
 * renders for anonymous visitors.
 *
 * It used to build the vault from `getPartnerCredentialEnvFromProcess()`. That
 * reads the real `process.env` during the server render — a `"use client"`
 * directive marks the hydration boundary, not the boundary of where the code
 * runs — so the credential state, including `maskedValue`, was serialised into
 * the HTML delivered to whoever asked for the URL. `maskSecretValue` keeps the
 * `sk_live_`/`sk_test_` prefix and the last four characters of the key, which
 * is the exact material `withoutMaskedValues` exists to keep out of responses:
 * "the mask never leaves the process".
 *
 * So the environment is read in one place only — the operator-guarded route —
 * and this component asks it, like every other operator panel here. An
 * anonymous visitor gets `OperatorAccessNotice`, not a mask and not a
 * confident-looking set of zeros.
 */
export default function PartnerCredentialVault() {
  const [result, setResult] = useState<OperatorFetchResult<{ vault: CredentialVault }> | null>(
    null,
  );

  useEffect(() => {
    fetchOperatorJson<{ vault: CredentialVault }>("/api/credentials/vercel-pull").then(setResult);
  }, []);

  const vault = result?.state === "ok" ? result.data.vault : null;

  const fulfillment = vault?.credentials.filter((item) => item.category === "fulfillment") ?? [];
  const ads = vault?.credentials.filter((item) => item.category === "ads") ?? [];
  const payments = vault?.credentials.filter((item) => item.category === "payments") ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-900 to-indigo-950 p-6 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <KeyRound className="h-6 w-6 text-indigo-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">
              Partner credential vault
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              {vault ? vault.label : "Partner credential vault"}
            </h2>
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
            <p className="text-3xl font-bold">{vault ? vault.overallScore : "—"}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Fulfillment</p>
            <p className="text-lg font-semibold">
              {vault ? (vault.fulfillmentReady ? "Ready" : "Setup") : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Ad platforms</p>
            <p className="text-lg font-semibold">
              {vault ? (vault.adsReady ? "Ready" : "Partial") : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-xs text-stone-400">Stripe Connect</p>
            <p className="text-lg font-semibold">
              {vault ? (vault.paymentsReady ? "Ready" : "Missing") : "—"}
            </p>
          </div>
        </div>

        <OperatorAccessNotice result={result} />
      </section>

      {vault && vault.blockers.length > 0 && (
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

      {vault && (
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
      )}

      {/*
        A "Convex Database Persistence Sync — Live Schema & Record Health" panel
        stood here: a green "6/6 Tables Synced" pill and six table cards naming a
        table and an index count. Every one of those was a hardcoded JSX literal.
        There was no data source, no state, no fetch — the pill said "6/6 Synced"
        for the same reason the heading said "Live", because it was typed.

        It was also false. This venture has no Convex client, no `convex`
        dependency and no `convex/` directory; the six "tables" are process-local
        arrays. And `/partner-setup` is unauthenticated (see the note on this
        component and `api/credentials/vercel-pull/route.ts`), so an anonymous
        visitor to atelier.marisstella.dev was shown a specific, confident claim
        that a production database was live and in sync.

        Removed rather than wired to `src/lib/convex-sync-status.ts` through a
        guarded route, which is the pattern the rest of this component follows:

          * There is nothing to measure. The panel's subject is a Convex
            deployment that does not exist in this venture, so the honest answer
            is a static fact about the repository, not a runtime status. A panel
            that can only ever render one value is not a status panel.
          * The honest module is not honest in both directions. It derives
            "synced"/"healthy" from `CONVEX_URL` being set, with no client and
            nothing that writes to Convex, so wiring it in would not end the
            fabrication — it would make it switchable by an environment variable
            and put the green pill back. The index counts (5/3/4/4/4/4) are
            hardcoded there too, and are measurements of nothing.
          * It would force `CONVEX_URL` into the Deployment and the out-of-band
            Secret, asking an operator to provision a credential for a service
            that does not exist, whose only effect is to turn this panel green.

        If Convex is ever wired for real, this panel comes back through
        `fetchOperatorJson` + `OperatorAccessNotice` like every other operator
        surface here — never as a server render on this page, which would put
        infrastructure state in HTML served to anonymous callers.
      */}

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
