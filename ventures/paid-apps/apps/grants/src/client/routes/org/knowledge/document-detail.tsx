// OWNER: knowledge UI agent — document metadata, status, extracted facts, chunk preview, actions.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { DocumentStatusBadge } from "@client/components/knowledge/badges";
import { FactList } from "@client/components/knowledge/fact-list";
import {
  documentKindLabel,
  formatBytes,
  PAST_OUTCOME_LABELS,
} from "@client/components/knowledge/labels";
import {
  type DocumentDetail,
  kbKeys,
  useDocument,
  useInvalidateKnowledge,
  useOrgId,
} from "@client/components/knowledge/queries";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  PageHeader,
  Spinner,
  toast,
} from "@client/components/ui";
import { api, formatCents, formatDate, orgApi } from "@client/lib/api";
import type { PastOutcome } from "@shared/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Download, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export function DocumentDetailPage() {
  const orgId = useOrgId();
  const { documentId = "" } = useParams({ strict: false }) as { documentId?: string };
  const doc = useDocument(orgId, documentId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const invalidate = useInvalidateKnowledge();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reprocess = useMutation({
    mutationFn: () =>
      api<unknown>(orgApi(orgId, `/documents/${encodeURIComponent(documentId)}/reprocess`), {
        method: "POST",
      }),
    onSuccess: () => {
      qc.setQueryData<DocumentDetail>(kbKeys.document(orgId, documentId), (d) =>
        d ? { ...d, status: "processing", error: null } : d,
      );
      toast.info("Reprocessing started", "Facts will be re-extracted from this document.");
      void invalidate(orgId);
    },
  });
  const del = useMutation({
    mutationFn: () =>
      api<void>(orgApi(orgId, `/documents/${encodeURIComponent(documentId)}`), {
        method: "DELETE",
      }),
    onSuccess: async () => {
      toast.success("Document deleted");
      setConfirmDelete(false);
      qc.removeQueries({ queryKey: kbKeys.document(orgId, documentId) });
      await invalidate(orgId);
      void navigate({ to: "/orgs/$orgId/knowledge/documents", params: { orgId } });
    },
  });

  const titles = useMemo(
    () => new Map(doc.data ? [[doc.data.id, doc.data.title]] : []),
    [doc.data],
  );

  const back = (
    <Link
      to="/orgs/$orgId/knowledge/documents"
      params={{ orgId }}
      className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All documents
    </Link>
  );

  if (doc.isPending)
    return (
      <div>
        {back}
        <Spinner label="Loading document" />
      </div>
    );
  if (doc.isError)
    return (
      <div>
        {back}
        <ApiErrorAlert
          error={doc.error}
          title="Couldn't load this document"
          messages={{ not_found: "This document doesn't exist or was deleted." }}
        />
      </div>
    );

  const d = doc.data;
  const busy = d.status === "uploaded" || d.status === "processing";
  const proposed = d.facts.filter((f) => f.status === "proposed").length;

  return (
    <div className="space-y-6">
      <div>
        {back}
        <PageHeader
          title={d.title}
          description={documentKindLabel(d.kind)}
          actions={
            <>
              <a
                href={orgApi(orgId, `/documents/${encodeURIComponent(d.id)}/download`)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
              >
                <Download className="h-4 w-4" aria-hidden /> Download
              </a>
              <Button
                variant="secondary"
                onClick={() => reprocess.mutate()}
                loading={reprocess.isPending}
                disabled={busy}
              >
                {!reprocess.isPending && <RefreshCw className="h-4 w-4" aria-hidden />} Reprocess
              </Button>
              <Button
                variant="danger"
                loading={del.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                {!del.isPending && <Trash2 className="h-4 w-4" aria-hidden />} Delete
              </Button>
            </>
          }
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        loading={del.isPending}
        tone="danger"
        title="Delete document?"
        description={`“${d.title}” and its ${d.factCount} extracted facts will be removed. This can't be undone.`}
        confirmLabel="Delete"
      />
      <ApiErrorAlert error={reprocess.error} title="Couldn't reprocess this document" />
      <ApiErrorAlert error={del.error} title="Couldn't delete this document" />
      {d.status === "failed" && (
        <Alert tone="danger" title="We couldn't read this document">
          {d.error ?? "Unknown error."} Try reprocessing, or upload a different format (PDF or Word
          work best).
        </Alert>
      )}
      {busy && (
        <Alert tone="info" title="Reading this document…">
          We're extracting text and proposing facts. This page updates automatically.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Meta label="Status">
              <DocumentStatusBadge status={d.status} />
            </Meta>
            <Meta label="Kind">{documentKindLabel(d.kind)}</Meta>
            <Meta label="Uploaded">{formatDate(d.createdAt)}</Meta>
            <Meta label="File">
              {d.mimeType} · {formatBytes(d.sizeBytes)}
            </Meta>
            <Meta label="Chunks">{d.chunkCount}</Meta>
            <Meta label="Facts extracted">{d.factCount}</Meta>
            {d.processedAt && <Meta label="Processed">{formatDate(d.processedAt)}</Meta>}
            {d.sourceUrl && (
              <Meta label="Source URL">
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-brand-700 hover:underline"
                >
                  {d.sourceUrl}
                </a>
              </Meta>
            )}
            {d.kind === "past_application" && (
              <>
                <Meta label="Outcome">
                  {d.pastOutcome ? PAST_OUTCOME_LABELS[d.pastOutcome as PastOutcome] : "—"}
                </Meta>
                <Meta label="Funder">{d.pastFunder ?? "—"}</Meta>
                <Meta label="Amount">{formatCents(d.pastAmountCents)}</Meta>
                <Meta label="Year">{d.pastYear ?? "—"}</Meta>
              </>
            )}
          </dl>
          {d.notes && <p className="mt-4 text-sm text-neutral-600">{d.notes}</p>}
        </CardBody>
      </Card>

      <section aria-labelledby="doc-facts-heading" className="space-y-3">
        <div>
          <h2 id="doc-facts-heading" className="text-lg font-semibold text-neutral-900">
            Facts from this document
          </h2>
          <p className="text-sm text-neutral-500">
            {proposed > 0
              ? `${proposed} need your review. Confirm the ones that are accurate; reject anything wrong.`
              : "Drafts can only state facts you've confirmed or that are flagged for review."}
          </p>
        </div>
        <FactList
          orgId={orgId}
          facts={d.facts}
          documentTitles={titles}
          emptyTitle={busy ? "Facts will appear here shortly" : "No facts extracted"}
          emptyDescription={
            busy
              ? undefined
              : "We didn't find checkable statements in this document. You can add facts manually in the fact base."
          }
        />
      </section>

      <section aria-labelledby="doc-chunks-heading" className="space-y-3">
        <h2 id="doc-chunks-heading" className="text-lg font-semibold text-neutral-900">
          Text preview{" "}
          <span className="text-sm font-normal text-neutral-500">({d.chunks.length} chunks)</span>
        </h2>
        {d.chunks.length === 0 ? (
          <p className="text-sm text-neutral-500">No text extracted yet.</p>
        ) : (
          <div className="space-y-2">
            {[...d.chunks]
              .sort((a, b) => a.ordinal - b.ordinal)
              .map((c) => (
                <details key={c.id} className="group rounded-md border border-neutral-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-800">
                    <ChevronDown
                      className="h-4 w-4 -rotate-90 text-neutral-400 transition-transform group-open:rotate-0"
                      aria-hidden
                    />
                    <span className="text-neutral-500">#{c.ordinal + 1}</span>
                    <span className="truncate">{c.heading || c.text.slice(0, 90)}</span>
                  </summary>
                  <p className="whitespace-pre-wrap border-t border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                    {c.text}
                  </p>
                </details>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-neutral-800">{children}</dd>
    </div>
  );
}
