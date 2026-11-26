// Error alert for API failures: friendly per-code message, and an upgrade prompt for 402.
import { Alert } from "@client/components/ui";
import { Link, useParams } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { type ErrorMessages, friendlyError, isPaymentRequired } from "./api-errors";

export function UpgradePrompt({ message, orgId }: { message: string; orgId?: string }) {
  const params = useParams({ strict: false }) as { orgId?: string };
  const id = orgId ?? params.orgId ?? "";
  return (
    <Alert tone="warning" title="Upgrade to keep going">
      <p>{message}</p>
      {id && (
        <Link
          to="/orgs/$orgId/settings/billing"
          params={{ orgId: id }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-warning-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-warning-700"
        >
          <Sparkles className="h-4 w-4" aria-hidden /> See plans &amp; upgrade
        </Link>
      )}
    </Alert>
  );
}

export function ApiErrorAlert({
  error,
  title = "Something went wrong",
  messages,
  orgId,
  className,
}: {
  error: unknown;
  title?: string;
  messages?: ErrorMessages;
  orgId?: string;
  className?: string;
}) {
  if (!error) return null;
  const message = friendlyError(error, messages);
  if (isPaymentRequired(error)) {
    return (
      <div className={className}>
        <UpgradePrompt message={message} orgId={orgId} />
      </div>
    );
  }
  return (
    <Alert tone="danger" title={title} className={className}>
      {message}
    </Alert>
  );
}
