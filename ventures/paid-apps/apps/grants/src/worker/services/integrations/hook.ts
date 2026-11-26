// The notify() hook, kept in its own small file so services/notifications imports only the
// delivery path (not the Slack command / ingestion code).
import type { NotificationKind } from "@shared/notifications";
import type { AppContext } from "../../context";
import { sendIntegrationEvent } from "./deliver";
import { eventFromNotification } from "./events";

/**
 * Forwards the chat-worthy notification kinds to the org's Slack / Teams destinations. Only the
 * title and link are used (never `body`). Never throws.
 */
export async function forwardNotificationToIntegrations(
  ctx: AppContext,
  input: {
    orgId: string;
    kind: NotificationKind;
    title: string;
    link?: string | null;
    dedupeKey?: string;
  },
): Promise<void> {
  const event = eventFromNotification(input);
  if (event) await sendIntegrationEvent(ctx, input.orgId, event);
}
