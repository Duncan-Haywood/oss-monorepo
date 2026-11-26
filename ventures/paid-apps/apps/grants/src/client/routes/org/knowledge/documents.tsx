// OWNER: knowledge UI agent — upload panel, paste-text dialog, documents table (polls while processing).
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { friendlyError } from "@client/components/grants/api-errors";
import { GuideNextStep } from "@client/components/guide/getting-started";
import { DocumentStatusBadge } from "@client/components/knowledge/badges";
import { DOCUMENT_KIND_INFO, documentKindLabel } from "@client/components/knowledge/labels";
import { PasteTextDialog } from "@client/components/knowledge/paste-text-dialog";
import {
  useDocuments,
  useInvalidateKnowledge,
  useOrgId,
} from "@client/components/knowledge/queries";
import { UploadForm } from "@client/components/knowledge/upload-form";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  toast,
} from "@client/components/ui";
import { api, formatCents, formatDate, orgApi } from "@client/lib/api";
import type { DocumentDto } from "@shared/api/types";
import { DOCUMENT_KINDS } from "@shared/enums";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardPaste, Search, Trash2 } from "lucide-react";
import { useState } from "react";

export function DocumentsPage() {
  const orgId = useOrgId();
  const invalidate = useInvalidateKnowledge();
  const [kind, setKind] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentDto | null>(null);
  const docs = useDocuments(orgId, kind);

  const del = useMutation({
    mutationFn: (id: string) =>
      api<void>(orgApi(orgId, `/documents/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Document deleted");
      setToDelete(null);
      return invalidate(orgId);
    },
    onError: (e) => toast.error("Could not delete document", friendlyError(e)),
  });

  const items = docs.data?.items ?? [];
  const processing = items.filter((d) => d.status === "uploaded" || d.status === "processing");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Everything Autopilot knows about you starts here. We read your documents and propose facts for you to confirm."
        actions={
          <>
            <Link
              to="/orgs/$orgId/knowledge/search"
              params={{ orgId }}
              className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <Search className="h-4 w-4" aria-hidden /> Search
            </Link>
            <Button variant="secondary" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="h-4 w-4" aria-hidden /> Paste text
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Upload documents</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            Annual reports, program descriptions, budgets, past applications, award letters — the
            more you share, the less we have to ask.
          </p>
        </CardHeader>
        <CardBody>
          <UploadForm
            onUpload={(body) =>
              api<DocumentDto>(orgApi(orgId, "/documents"), { method: "POST", body })
            }
            onComplete={() => invalidate(orgId)}
          />
        </CardBody>
      </Card>

      <section aria-labelledby="doc-list-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="doc-list-heading" className="text-lg font-semibold text-neutral-900">
            Your documents
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="doc-kind-filter" className="whitespace-nowrap">
              Kind
            </Label>
            <Select
              id="doc-kind-filter"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-56"
            >
              <option value="">All kinds</option>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KIND_INFO[k].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {processing.length > 0 && (
          <Alert tone="info">
            Reading {processing.length} {processing.length === 1 ? "document" : "documents"}… this
            page updates automatically.
          </Alert>
        )}

        {docs.isPending ? (
          <Spinner label="Loading documents" />
        ) : docs.isError ? (
          <ApiErrorAlert error={docs.error} title="Couldn't load documents" />
        ) : items.length === 0 ? (
          <EmptyState
            title={kind ? "No documents of this kind" : "No documents yet"}
            description={
              kind
                ? "Try another filter, or upload one above."
                : "Upload your mission statement, an annual report or a past application to get started."
            }
            action={kind ? undefined : <GuideNextStep orgId={orgId} except="documents" />}
          />
        ) : (
          <Table>
            <thead className="bg-neutral-50">
              <tr>
                <Th>Title</Th>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th className="text-right">Chunks</Th>
                <Th className="text-right">Facts</Th>
                <Th>Uploaded</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Link
                      to="/orgs/$orgId/knowledge/documents/$documentId"
                      params={{ orgId, documentId: d.id }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {d.title}
                    </Link>
                    {d.kind === "past_application" && d.pastOutcome && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-neutral-500">
                        <Badge
                          tone={
                            d.pastOutcome === "awarded"
                              ? "success"
                              : d.pastOutcome === "declined"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {d.pastOutcome}
                        </Badge>
                        {[
                          d.pastFunder,
                          d.pastYear,
                          d.pastAmountCents != null ? formatCents(d.pastAmountCents) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {d.status === "failed" && d.error && (
                      <p className="mt-1 text-xs text-danger-600">{d.error}</p>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{documentKindLabel(d.kind)}</Td>
                  <Td>
                    <DocumentStatusBadge status={d.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{d.chunkCount}</Td>
                  <Td className="text-right tabular-nums">{d.factCount}</Td>
                  <Td className="whitespace-nowrap">{formatDate(d.createdAt)}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setToDelete(d)}
                      loading={del.isPending && del.variables === d.id}
                      aria-label={`Delete ${d.title}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) del.mutate(toDelete.id);
        }}
        loading={del.isPending}
        tone="danger"
        title="Delete document?"
        description={
          toDelete
            ? `“${toDelete.title}” and its ${toDelete.factCount} extracted facts will be removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
      />

      <PasteTextDialog
        orgId={orgId}
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onCreated={() => invalidate(orgId)}
      />
    </div>
  );
}
