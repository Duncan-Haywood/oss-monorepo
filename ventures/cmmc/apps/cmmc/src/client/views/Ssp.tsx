import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnGhostCls, Card, ErrorText } from "../ui";

export function SspView({ orgId, info }: { orgId: string; info: OrgInfo }) {
  const level = info.profile.targetLevel === 1 ? 1 : 2;
  const ssp = useQuery({
    queryKey: ["ssp", orgId, level],
    queryFn: () => api<{ markdown: string }>(`/api/orgs/${orgId}/ssp?level=${level}`),
  });
  return (
    <Card
      title="System Security Plan"
      actions={
        <a className={btnGhostCls} href={`/api/orgs/${orgId}/ssp/download?level=${level}`}>
          Download Markdown
        </a>
      }
    >
      <p className="mb-3 text-sm text-stone-600">
        Generated from your system profile (Settings) and the accepted implementation statements.
        Unreviewed AI drafts are left out.
      </p>
      <ErrorText error={ssp.error} />
      <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-3 text-xs leading-relaxed text-stone-800">
        {ssp.data?.markdown ?? "Loading…"}
      </pre>
    </Card>
  );
}
