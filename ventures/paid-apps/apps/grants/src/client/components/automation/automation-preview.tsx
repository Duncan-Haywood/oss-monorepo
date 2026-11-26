// "How would these be routed?" — example grants and where each would go at the chosen settings.
// Saved settings: GET /settings/automation-preview (authoritative). Unsaved changes, or an older
// server without that endpoint: the client approximation in routing-preview.ts.

import { Badge, Table, Td, Th } from "@client/components/ui";
import { api, formatCents, orgApi } from "@client/lib/api";
import { TIER_TONE } from "@client/routes/org/settings/autopilot-explainer";
import {
  type AutomationPreviewExample,
  type AutomationPreviewResponse,
  clientAutomationPreview,
  type RoutingPolicy,
  TIER_LABELS,
} from "@client/routes/org/settings/routing-preview";
import { useQuery } from "@tanstack/react-query";

export const automationPreviewKey = (orgId: string) =>
  ["org", orgId, "settings", "automation-preview"] as const;

export function useAutomationPreview(orgId: string) {
  return useQuery({
    queryKey: automationPreviewKey(orgId),
    queryFn: () => api<AutomationPreviewResponse>(orgApi(orgId, "/settings/automation-preview")),
    enabled: Boolean(orgId),
    retry: false,
    staleTime: 30_000,
  });
}

export type PreviewSource = "server" | "unsaved" | "estimate";

/** Which examples to show: the server's for saved settings, else the client estimate. */
export function pickPreview(
  server: AutomationPreviewResponse | undefined,
  policy: RoutingPolicy,
  dirty: boolean,
): { source: PreviewSource; examples: AutomationPreviewExample[] } {
  if (!dirty && server && Array.isArray(server.examples) && server.examples.length > 0) {
    return { source: "server", examples: server.examples };
  }
  return {
    source: dirty ? "unsaved" : "estimate",
    examples: clientAutomationPreview(policy).examples,
  };
}

const SOURCE_NOTE: Record<PreviewSource, string> = {
  server: "Worked out by our servers from your saved settings, using made-up example grants.",
  unsaved:
    "Estimated from the settings above, which aren't saved yet. Save to see the exact result. Examples are made up and assume every statement is verified.",
  estimate:
    "Approximate preview using made-up examples that assume every statement is verified and no auto-submissions have happened yet this month.",
};

export function AutomationPreview({
  orgId,
  policy,
  dirty,
}: {
  orgId: string;
  policy: RoutingPolicy;
  dirty: boolean;
}) {
  const preview = useAutomationPreview(orgId);
  const { source, examples } = pickPreview(preview.data, policy, dirty);
  return <AutomationPreviewTable examples={examples} source={source} />;
}

export function AutomationPreviewTable({
  examples,
  source,
}: {
  examples: AutomationPreviewExample[];
  source: PreviewSource;
}) {
  return (
    <div className="space-y-2" data-preview-source={source}>
      <Table>
        <caption className="sr-only">
          How example grants would be routed with these settings
        </caption>
        <thead className="bg-neutral-50">
          <tr>
            <Th>Example grant</Th>
            <Th>Ask</Th>
            <Th>Fit</Th>
            <Th>Chance</Th>
            <Th>Routed to</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {examples.map((g) => (
            <tr key={g.label}>
              <Td>
                <p className="font-medium text-neutral-900">{g.label}</p>
                <p className="text-xs text-neutral-500">
                  {g.firstToFunder ? "First time applying to this funder" : "You've applied before"}
                </p>
              </Td>
              <Td className="whitespace-nowrap">{formatCents(g.amountCents)}</Td>
              <Td>{g.fitScore}</Td>
              <Td>{Math.round(g.likelihood * 100)}%</Td>
              <Td className="min-w-56">
                <Badge tone={TIER_TONE[g.tier] ?? "neutral"}>{TIER_LABELS[g.tier] ?? g.tier}</Badge>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-neutral-500">
                  {g.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-xs text-neutral-500">{SOURCE_NOTE[source]}</p>
    </div>
  );
}
