// Public API of the integrations module (Slack / Microsoft Teams). See docs/INTEGRATIONS.md.
//   await sendIntegrationEvent(ctx, orgId, weeklyDigestEvent(digest));   // titles, counts, links only
export {
  decryptSecret,
  encryptSecret,
  SLACK_MAX_SKEW_SECONDS,
  signSlackRequest,
  verifySlackSignature,
} from "./crypto";
export {
  classifyStatus,
  deliverIntegration,
  integrationOutbox,
  MAX_DELIVERY_ATTEMPTS,
  sendIntegrationEvent,
  setIntegrationTransport,
} from "./deliver";
export {
  createDestination,
  createDestinationSchema,
  deleteDestination,
  listDestinations,
  testDestination,
  updateDestination,
  updateDestinationSchema,
} from "./destinations";
export {
  deadlineReminderEvent,
  eventFromNotification,
  type IntegrationEvent,
  weeklyDigestEvent,
} from "./events";
export { renderSlackMessage, renderTeamsMessage } from "./format";
export { forwardNotificationToIntegrations } from "./hook";
export { runIntegrationJob, slackUpdateFollowup } from "./jobs";
export { enqueueIntegrationJob, type IntegrationJobMessage } from "./queue";
export {
  createLinkCode,
  disconnectSlackWorkspace,
  getMySlackLink,
  handleSlackCommand,
  listSlackWorkspaces,
  unlinkMySlack,
} from "./slack-command";
export {
  validateSlackWebhookUrl,
  validateTeamsWebhookUrl,
  validateWebhookUrl,
  WebhookUrlError,
} from "./urls";
