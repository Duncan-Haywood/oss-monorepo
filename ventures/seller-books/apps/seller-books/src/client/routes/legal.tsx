// Public legal documents (/legal/:key), readable before signing up, the links to them, and the
// notice that asks a signed-in user to accept the current version before continuing.
// Same flow as apps/jobshop-quote/src/client/routes/legal.tsx, in this app's styles.
import {
  isLegalDocKey,
  LEGAL_DOC_KEYS,
  LEGAL_DOC_TITLES,
  type LegalDocDto,
  type LegalStatusDto,
} from "@shared/legal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Markdown } from "../components/markdown";
import { api } from "../lib/api";
import { ErrorText, type Me, useMe } from "./public";

export function LegalPage() {
  const { key } = useParams({ strict: false }) as { key: string };
  const doc = useQuery({
    queryKey: ["legal", key],
    queryFn: () => api<LegalDocDto>(`/api/legal/${encodeURIComponent(key)}`),
    enabled: isLegalDocKey(key),
  });
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link to="/" className="text-lg font-semibold text-brand-700">
        Seller Books
      </Link>
      <nav aria-label="Legal documents" className="flex flex-wrap gap-3 text-sm">
        {LEGAL_DOC_KEYS.map((k) => (
          <Link
            key={k}
            to="/legal/$key"
            params={{ key: k }}
            className={k === key ? "font-semibold text-stone-900" : "text-brand-700 underline"}
          >
            {LEGAL_DOC_TITLES[k]}
          </Link>
        ))}
      </nav>
      <div className="card">
        {!isLegalDocKey(key) ? (
          <p>That document does not exist.</p>
        ) : (
          <>
            {doc.isLoading && <p>Loading…</p>}
            <ErrorText error={doc.error} />
            {doc.data && <Markdown source={doc.data.markdown} />}
          </>
        )}
      </div>
    </main>
  );
}

/** "Terms of Service, Privacy Policy, Refund Policy and Acceptable Use Policy", each a link. */
export function LegalLinks({ className = "text-brand-700 underline" }: { className?: string }) {
  return (
    <>
      {LEGAL_DOC_KEYS.map((k, i) => (
        <span key={k}>
          {i > 0 && (i === LEGAL_DOC_KEYS.length - 1 ? " and " : ", ")}
          <Link
            to="/legal/$key"
            params={{ key: k }}
            className={className}
            target="_blank"
            rel="noopener"
          >
            {LEGAL_DOC_TITLES[k]}
          </Link>
        </span>
      ))}
    </>
  );
}

/** Footer line with the four documents, for the signed-in shell and the sign-in pages. */
export function LegalFooter() {
  return (
    <footer className="px-4 pt-4 pb-8 text-center text-xs text-stone-500">
      <LegalLinks className="hover:underline" />
    </footer>
  );
}

/**
 * Shown instead of the page to a signed-in user who has not accepted the current version (a new
 * account, or anyone after the documents change). The legal pages themselves stay reachable.
 */
export function AcceptLegal({ legal }: { legal: LegalStatusDto }) {
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () =>
      api<LegalStatusDto>("/api/me/legal/accept", {
        method: "POST",
        body: { version: legal.version },
      }),
    onSuccess: (status) => {
      qc.setQueryData<Me | null>(["me"], (me) => (me ? { ...me, legal: status } : me));
      return qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <div className="mx-auto mt-8 max-w-lg px-4">
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">Before you continue</h1>
        <p className="text-sm text-stone-700">
          Please read our <LegalLinks /> (version {legal.version}). In short: every fee comes from
          the reports you import and every cost from what you enter, so check the totals against
          your marketplace statements; the Schedule C worksheet helps you or your tax preparer and
          is not a tax return or tax advice; and we never sell your data or use it to train AI
          models.
        </p>
        <button
          className="btn"
          type="button"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          I agree
        </button>
        <ErrorText error={accept.error} />
      </div>
    </div>
  );
}

/** Renders children once the signed-in user has accepted the current documents. */
export function LegalGate({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data && !me.data.legal.acceptedAt) return <AcceptLegal legal={me.data.legal} />;
  return <>{children}</>;
}
