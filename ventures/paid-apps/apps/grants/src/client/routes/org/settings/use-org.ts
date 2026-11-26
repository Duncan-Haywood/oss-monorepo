// Org detail (profile + settings + my role) shared by every settings page.
import { api, orgApi } from "@client/lib/api";
import type { OrgProfileDto, OrgSettingsDto } from "@shared/api/types";
import type { MemberRole } from "@shared/enums";
import { ROLE_RANK } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

export interface OrgDetail {
  org: { id: string; name: string; slug: string };
  role: MemberRole;
  profile: OrgProfileDto;
  settings: OrgSettingsDto;
}

export const orgKey = (orgId: string) => ["org", orgId] as const;

export function useOrgId(): string {
  const params = useParams({ strict: false }) as { orgId?: string };
  return params.orgId ?? "";
}

export function useOrg(orgId: string) {
  return useQuery({
    queryKey: orgKey(orgId),
    queryFn: () => api<OrgDetail>(orgApi(orgId)),
    enabled: Boolean(orgId),
  });
}

export const hasRole = (role: MemberRole | undefined, min: MemberRole) =>
  role != null && ROLE_RANK[role] >= ROLE_RANK[min];

/** Editable settings fields (everything except ids/timestamps/policy acceptance). */
export type SettingsPatch = Partial<
  Omit<
    OrgSettingsDto,
    | "orgId"
    | "createdAt"
    | "updatedAt"
    | "dataPolicyVersion"
    | "dataPolicyAcceptedAt"
    | "dataPolicyAcceptedBy"
  >
>;

export function useUpdateSettings(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      api<OrgSettingsDto | undefined>(orgApi(orgId, "/settings"), {
        method: "PATCH",
        body: patch as Record<string, unknown>,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKey(orgId) }),
  });
}
