import { Badge } from "@client/components/ui";
import type { DocumentStatus, FactStatus, ProjectStatus } from "@shared/enums";
import { Loader2 } from "lucide-react";
import {
  DOCUMENT_STATUS_INFO,
  FACT_STATUS_INFO,
  isDocumentBusy,
  PROJECT_STATUS_INFO,
} from "./labels";

export function DocumentStatusBadge({ status }: { status: string }) {
  const info = DOCUMENT_STATUS_INFO[status as DocumentStatus] ?? {
    label: status,
    tone: "neutral" as const,
  };
  return (
    <Badge tone={info.tone} className="gap-1">
      {isDocumentBusy(status) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {info.label}
    </Badge>
  );
}

export function FactStatusBadge({ status }: { status: string }) {
  const info = FACT_STATUS_INFO[status as FactStatus] ?? {
    label: status,
    tone: "neutral" as const,
  };
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const info = PROJECT_STATUS_INFO[status as ProjectStatus] ?? {
    label: status,
    tone: "neutral" as const,
  };
  return <Badge tone={info.tone}>{info.label}</Badge>;
}
