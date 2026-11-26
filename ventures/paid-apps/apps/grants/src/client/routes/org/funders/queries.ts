// Query keys + hooks for the funder relationship tracker (["orgs", orgId, "funders", ...]).
import { api, orgApi } from "@client/lib/api";
import type {
  CreateFunderRelationInput,
  FunderContactDto,
  FunderContactInput,
  FunderContactPatch,
  FunderDetailResponse,
  FunderInteractionDto,
  FunderInteractionInput,
  FunderListResponse,
  FunderRelationDto,
  UpdateFunderRelationInput,
} from "@shared/api/funders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const funderKeys = {
  all: (orgId: string) => ["orgs", orgId, "funders"] as const,
  list: (orgId: string) => ["orgs", orgId, "funders", "list"] as const,
  detail: (orgId: string, id: string) => ["orgs", orgId, "funders", "detail", id] as const,
};

const enc = encodeURIComponent;

export const useFunders = (orgId: string) =>
  useQuery({
    queryKey: funderKeys.list(orgId),
    queryFn: () => api<FunderListResponse>(orgApi(orgId, "/funders")),
    enabled: !!orgId,
  });

export const useFunder = (orgId: string, id: string) =>
  useQuery({
    queryKey: funderKeys.detail(orgId, id),
    queryFn: () => api<FunderDetailResponse>(orgApi(orgId, `/funders/${enc(id)}`)),
    enabled: !!orgId && !!id,
  });

function useInvalidate(orgId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: funderKeys.all(orgId) });
}

export function useCreateFunder(orgId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (body: CreateFunderRelationInput) =>
      api<FunderRelationDto>(orgApi(orgId, "/funders"), { method: "POST", body: { ...body } }),
    onSuccess: invalidate,
  });
}

export function useUpdateFunder(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (body: UpdateFunderRelationInput) =>
      api<FunderRelationDto>(orgApi(orgId, `/funders/${enc(id)}`), {
        method: "PATCH",
        body: { ...body },
      }),
    onSuccess: invalidate,
  });
}

export function useSaveContact(orgId: string, relationId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: ({ id, ...body }: FunderContactInput & { id?: string }) =>
      id
        ? api<FunderContactDto>(orgApi(orgId, `/funders/${enc(relationId)}/contacts/${enc(id)}`), {
            method: "PATCH",
            body: { ...(body as FunderContactPatch) },
          })
        : api<FunderContactDto>(orgApi(orgId, `/funders/${enc(relationId)}/contacts`), {
            method: "POST",
            body: { ...body },
          }),
    onSuccess: invalidate,
  });
}

export function useDeleteContact(orgId: string, relationId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(orgApi(orgId, `/funders/${enc(relationId)}/contacts/${enc(id)}`), {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}

export function useLogInteraction(orgId: string, relationId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (body: FunderInteractionInput) =>
      api<FunderInteractionDto>(orgApi(orgId, `/funders/${enc(relationId)}/interactions`), {
        method: "POST",
        body: { ...body },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteInteraction(orgId: string, relationId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(orgApi(orgId, `/funders/${enc(relationId)}/interactions/${enc(id)}`), {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}
