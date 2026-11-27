// Public legal documents (/legal/:key), readable before signing up, the links to them, and the
// notice that asks a signed-in user to accept the current version before continuing.
// Same flow as apps/payapps/src/client/pages/legal.tsx.
import {
  isLegalDocKey,
  LEGAL_DOC_KEYS,
  LEGAL_DOC_TITLES,
  type LegalDocDto,
  type LegalStatusDto,
} from "@shared/legal";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Markdown } from "../components/markdown";
import { Button, Card, ErrorText } from "../components/ui";
import { api, queryClient } from "../lib/api";
import { type Me, useMe } from "./public";

export function LegalPage() {
  const { key } = useParams({ strict: false }) as { key: string };
  const doc = useQuery({
    queryKey: ["legal", key],
    queryFn: () => api<LegalDocDto>(`/api/legal/${encodeURIComponent(key)}`),
    enabled: isLegalDocKey(key),
  });
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link to="/" className="text-lg font-semibold text-stone-900">
        Job Shop Quote
      </Link>
      <nav aria-label="Legal documents" className="flex flex-wrap gap-3 text-sm">
        {LEGAL_DOC_KEYS.map((k) => (
          <Link
            key={k}
            to="/legal/$key"
            params={{ key: k }}
            className={k === key ? "font-semibold text-stone-900" : "text-sky-800 underline"}
          >
            {LEGAL_DOC_TITLES[k]}
          </Link>
        ))}
      </nav>
      <Card>
        {!isLegalDocKey(key) ? (
          <p>That document does not exist.</p>
        ) : (
          <>
            {doc.isLoading && <p>Loading…</p>}
            <ErrorText error={doc.error} />
            {doc.data && <Markdown source={doc.data.markdown} />}
          </>
        )}
      </Card>
    </main>
  );
}

/** "Terms of Service, Privacy Policy, Refund Policy and Acceptable Use Policy", each a link. */
export function LegalLinks({ className = "text-sky-800 underline" }: { className?: string }) {
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

/** Footer line with the four documents, for the signed-in shell and the account pages. */
export function LegalFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-center text-xs text-stone-500">
      <LegalLinks className="hover:underline" />
    </footer>
  );
}

/**
 * Shown instead of the page to a signed-in user who has not accepted the current version (a new
 * account, or anyone after the documents change). The legal pages themselves stay reachable.
 */
export function AcceptLegal({ legal }: { legal: LegalStatusDto }) {
  const accept = useMutation({
    mutationFn: () =>
      api<LegalStatusDto>("/api/me/legal/accept", {
        method: "POST",
        body: { version: legal.version },
      }),
    onSuccess: (status) => {
      queryClient.setQueryData<Me | null>(["me"], (me) => (me ? { ...me, legal: status } : me));
      return queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <div className="mx-auto mt-8 max-w-lg">
      <Card title="Before you continue">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-700">
            Please read our <LegalLinks /> (version {legal.version}). In short: every price comes
            from your own rate card and you check each quote before it goes out, the AI's reading of
            an RFQ is a suggestion your estimator confirms, don't upload ITAR, EAR or CUI data, and
            we never sell your data or use it to train AI models.
          </p>
          <ErrorText error={accept.error} />
          <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
            I agree
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Renders children once the signed-in user has accepted the current documents. */
export function LegalGate({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data && !me.data.legal.acceptedAt) return <AcceptLegal legal={me.data.legal} />;
  return <>{children}</>;
}
