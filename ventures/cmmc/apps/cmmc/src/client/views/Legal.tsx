// Public legal documents (/legal/:key), readable before signing up, the links to them, and the
// notice that asks a signed-in user to accept the current version before continuing.
// Same flow as apps/jobshop-quote/src/client/routes/legal.tsx; this SPA has no router, so the
// document pages are plain links that App.tsx picks up from the path.
import {
  isLegalDocKey,
  LEGAL_DOC_KEYS,
  LEGAL_DOC_TITLES,
  type LegalDocDto,
  type LegalStatusDto,
} from "@shared/legal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Markdown } from "../components/markdown";
import { api } from "../lib/api";
import type { Me } from "../lib/types";
import { btnCls, Card, Disclaimer, ErrorText } from "../ui";

/** The document key when the page's path is /legal/:key (or /legal/:key/), else null. */
export function legalKeyFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/legal\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1] ?? "") : null;
}

export function LegalPage({ docKey }: { docKey: string }) {
  const known = isLegalDocKey(docKey);
  const doc = useQuery({
    queryKey: ["legal", docKey],
    queryFn: () => api<LegalDocDto>(`/api/legal/${encodeURIComponent(docKey)}`),
    enabled: known,
  });
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <a href="/" className="text-lg font-semibold text-brand-700">
        CMMC Workspace
      </a>
      <nav aria-label="Legal documents" className="flex flex-wrap gap-3 text-sm">
        {LEGAL_DOC_KEYS.map((k) => (
          <a
            key={k}
            href={`/legal/${k}`}
            aria-current={k === docKey ? "page" : undefined}
            className={k === docKey ? "font-semibold text-stone-900" : "text-brand-600 underline"}
          >
            {LEGAL_DOC_TITLES[k]}
          </a>
        ))}
      </nav>
      <Card>
        {!known ? (
          <p>That document does not exist.</p>
        ) : (
          <>
            {doc.isLoading && <p className="text-sm text-stone-600">Loading…</p>}
            <ErrorText error={doc.error} />
            {doc.data && <Markdown source={doc.data.markdown} />}
          </>
        )}
      </Card>
      <Disclaimer />
    </main>
  );
}

/** "Terms of Service, Privacy Policy, Refund Policy and Acceptable Use Policy", each a link. */
export function LegalLinks({ className = "text-brand-600 underline" }: { className?: string }) {
  return (
    <>
      {LEGAL_DOC_KEYS.map((k, i) => (
        <span key={k}>
          {i > 0 && (i === LEGAL_DOC_KEYS.length - 1 ? " and " : ", ")}
          <a href={`/legal/${k}`} className={className} target="_blank" rel="noopener">
            {LEGAL_DOC_TITLES[k]}
          </a>
        </span>
      ))}
    </>
  );
}

/** Footer line with the four documents, for the signed-in shell and the sign-in page. */
export function LegalFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-stone-500">
      <LegalLinks className="hover:underline" />
    </footer>
  );
}

/**
 * Shown instead of the workspace to a signed-in user who has not accepted the current version (a
 * new account, or anyone after the documents change). The legal pages themselves stay reachable.
 */
export function AcceptLegal({ legal }: { legal: LegalStatusDto }) {
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () =>
      api<LegalStatusDto>("/api/me/legal/accept", {
        method: "POST",
        json: { version: legal.version },
      }),
    onSuccess: (status) => {
      qc.setQueryData<Me | null>(["me"], (me) => (me ? { ...me, legal: status } : me));
      return qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <div className="mx-auto mt-8 max-w-lg">
      <Card title="Before you continue">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-700">
            Please read our <LegalLinks /> (version {legal.version}). In short: this workspace helps
            you prepare your own self-assessment and is not a certification, a C3PAO assessment or a
            government approval; you and your affirming official decide what goes into SPRS; AI
            drafts stay drafts until one of your people accepts them; do not upload CUI; and we
            never sell your data or use it to train AI models.
          </p>
          <ErrorText error={accept.error} />
          <button
            type="button"
            className={btnCls}
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          >
            I agree
          </button>
        </div>
      </Card>
    </div>
  );
}
