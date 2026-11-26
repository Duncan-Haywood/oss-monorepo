// Reads and mutations for the "Attachments & letters" panel (attachments checklist + letters of
// support). Keys live under the application detail so invalidating the application refreshes them.
import { api, orgApi } from "@client/lib/api";
import type {
  AttachmentChecklistDto,
  AttachmentItemDto,
  AttachmentPatchInput,
  SupportLetterCreateInput,
  SupportLetterDto,
  SupportLetterPatchInput,
} from "@shared/api/attachments";
import type { DocumentKind } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const enc = encodeURIComponent;

export const attachmentKeys = {
  checklist: (orgId: string, appId: string) =>
    ["orgs", orgId, "applications", "detail", appId, "attachments"] as const,
  letters: (orgId: string, appId: string) =>
    ["orgs", orgId, "applications", "detail", appId, "support-letters"] as const,
  documents: (orgId: string) => ["orgs", orgId, "documents", "attachable"] as const,
};

export interface PickableDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  status: string;
}

export function useAttachmentChecklist(orgId: string, appId: string) {
  return useQuery({
    queryKey: attachmentKeys.checklist(orgId, appId),
    queryFn: () =>
      api<AttachmentChecklistDto>(orgApi(orgId, `/applications/${enc(appId)}/attachments`)),
  });
}

export function useSupportLetters(orgId: string, appId: string) {
  return useQuery({
    queryKey: attachmentKeys.letters(orgId, appId),
    queryFn: () =>
      api<{ items: SupportLetterDto[] }>(
        orgApi(orgId, `/applications/${enc(appId)}/support-letters`),
      ),
  });
}

export function useOrgDocuments(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: attachmentKeys.documents(orgId),
    queryFn: () => api<{ items: PickableDocument[] }>(orgApi(orgId, "/documents")),
    enabled,
  });
}

function useInvalidate(orgId: string, appId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: attachmentKeys.checklist(orgId, appId) }),
      qc.invalidateQueries({ queryKey: attachmentKeys.letters(orgId, appId) }),
      // Blocker flags may have been resolved.
      qc.invalidateQueries({
        queryKey: ["orgs", orgId, "applications", "detail", appId],
        exact: true,
      }),
    ]);
}

export function usePatchAttachment(orgId: string, appId: string) {
  const invalidate = useInvalidate(orgId, appId);
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: AttachmentPatchInput }) =>
      api<AttachmentItemDto>(
        orgApi(orgId, `/applications/${enc(appId)}/attachments/${enc(itemId)}`),
        { method: "PATCH", body: patch as unknown as Record<string, unknown> },
      ),
    onSuccess: invalidate,
  });
}

/** Guess a document kind for a fresh upload from the requirement name. */
export function kindForRequirement(name: string): DocumentKind {
  if (/letters? of (support|commitment)|support letter/i.test(name)) return "letter_of_support";
  if (/audit|financial|990|balance sheet/i.test(name)) return "financial_statement";
  if (/budget/i.test(name)) return "budget";
  if (/by-?laws|articles of incorporation|charter/i.test(name)) return "charter_bylaws";
  if (/annual report/i.test(name)) return "annual_report";
  if (/polic(y|ies)/i.test(name)) return "policy";
  return "other";
}

/** Upload through the normal documents route, then record it on the checklist item. */
export function useUploadAttachment(orgId: string, appId: string) {
  const invalidate = useInvalidate(orgId, appId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, file }: { item: AttachmentItemDto; file: File }) => {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kindForRequirement(item.requirementName));
      form.set("title", item.requirementName);
      form.set("consent", "true");
      const doc = await api<{ id: string }>(orgApi(orgId, "/documents"), {
        method: "POST",
        body: form,
      });
      return api<AttachmentItemDto>(
        orgApi(orgId, `/applications/${enc(appId)}/attachments/${enc(item.id)}`),
        { method: "PATCH", body: { action: "uploaded", documentId: doc.id } },
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orgs", orgId, "documents"] });
      await invalidate();
    },
  });
}

export function useSuggestAttachments(orgId: string, appId: string) {
  const invalidate = useInvalidate(orgId, appId);
  return useMutation({
    mutationFn: () =>
      api<AttachmentChecklistDto>(
        orgApi(orgId, `/applications/${enc(appId)}/attachments/suggest`),
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
}

export function useCreateLetter(orgId: string, appId: string) {
  const invalidate = useInvalidate(orgId, appId);
  return useMutation({
    mutationFn: (input: SupportLetterCreateInput) =>
      api<SupportLetterDto>(orgApi(orgId, `/applications/${enc(appId)}/support-letters`), {
        method: "POST",
        body: input as unknown as Record<string, unknown>,
      }),
    onSuccess: invalidate,
  });
}

export function useSendLetter(orgId: string, appId: string) {
  const invalidate = useInvalidate(orgId, appId);
  return useMutation({
    mutationFn: (letterId: string) =>
      api<SupportLetterDto>(
        orgApi(orgId, `/applications/${enc(appId)}/support-letters/${enc(letterId)}/send`),
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
}

export function usePatchLetter(orgId: string, appId: string) {
  const invalidate = useInvalidate(orgId, appId);
  return useMutation({
    mutationFn: ({ letterId, patch }: { letterId: string; patch: SupportLetterPatchInput }) =>
      api<SupportLetterDto>(
        orgApi(orgId, `/applications/${enc(appId)}/support-letters/${enc(letterId)}`),
        { method: "PATCH", body: patch as unknown as Record<string, unknown> },
      ),
    onSuccess: invalidate,
  });
}
