// Public legal documents (/legal/:key), readable before signing up, and the notice that asks a
// signed-in user to accept the current version before continuing.
import type { MeDto } from "@shared/api/types";
import {
  isLegalDocKey,
  LEGAL_DOC_KEYS,
  LEGAL_DOC_TITLES,
  type LegalDocDto,
  type LegalStatusDto,
} from "@shared/legal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ErrorText } from "../components/error";
import { Markdown } from "../components/markdown";
import { api } from "../lib/api";

export function LegalPage() {
  const { key } = useParams({ from: "/legal/$key" });
  const doc = useQuery({
    queryKey: ["legal", key],
    queryFn: () => api<LegalDocDto>(`/api/legal/${encodeURIComponent(key)}`),
    enabled: isLegalDocKey(key),
  });
  if (!isLegalDocKey(key)) return <p>That document does not exist.</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Legal documents" className="flex flex-wrap gap-3 text-sm">
        {LEGAL_DOC_KEYS.map((k) => (
          <Link
            key={k}
            to="/legal/$key"
            params={{ key: k }}
            className={k === key ? "font-semibold" : "text-slate-600 underline"}
          >
            {LEGAL_DOC_TITLES[k]}
          </Link>
        ))}
      </nav>
      <article className="card">
        {doc.isLoading && <p>Loading…</p>}
        <ErrorText error={doc.error} />
        {doc.data && <Markdown source={doc.data.markdown} />}
      </article>
    </div>
  );
}

/** Links to the four documents, e.g. "Terms of Service, Privacy Policy, ...". */
export function LegalLinks({ className = "underline" }: { className?: string }) {
  return (
    <>
      {LEGAL_DOC_KEYS.map((k, i) => (
        <span key={k}>
          {i > 0 && (i === LEGAL_DOC_KEYS.length - 1 ? " and " : ", ")}
          <Link to="/legal/$key" params={{ key: k }} className={className} target="_blank">
            {LEGAL_DOC_TITLES[k]}
          </Link>
        </span>
      ))}
    </>
  );
}

/**
 * Shown instead of the app to a signed-in user who has not accepted the current version (a new
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
      qc.setQueryData<MeDto | null>(["me"], (me) => (me ? { ...me, legal: status } : me));
      return qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <div className="card mx-auto max-w-lg space-y-3">
      <h1 className="text-xl font-semibold">Before you continue</h1>
      <p className="text-sm text-slate-700">
        Please read our <LegalLinks /> (version {legal.version}). In short: you check every figure
        before you send it, our forms are not AIA documents, lien waiver forms are not legal advice,
        and we never sell your data.
      </p>
      <ErrorText error={accept.error} />
      <button
        type="button"
        className="btn"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
      >
        I agree
      </button>
    </div>
  );
}
