// OWNER: integrations — POST /api/integrations/slack/command (the `/grants` slash command).
// Unauthenticated and outside the Origin check / session: trust comes only from Slack's request
// signature (SLACK_SIGNING_SECRET, 5-minute replay window), verified over the raw body before
// anything is parsed. Slack sends application/x-www-form-urlencoded, so request-limits needs a
// non-JSON body rule for this path (see docs/INTEGRATIONS.md, "Integration pass").
import { Hono } from "hono";
import { handleSlackCommand, MAX_COMMAND_BODY_BYTES } from "../services/integrations/slack-command";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.post("/slack/command", async (c) => {
  const ctx = c.var.ctx;
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (declared > MAX_COMMAND_BODY_BYTES) {
    return c.json({ response_type: "ephemeral", text: "That message is too long." }, 413);
  }
  // Raw bytes as UTF-8 (Slack signs the exact body; .text() on a form body warns in workerd).
  const rawBody = new TextDecoder().decode(await c.req.arrayBuffer());
  const result = await handleSlackCommand(ctx, {
    rawBody,
    timestamp: c.req.header("X-Slack-Request-Timestamp"),
    signature: c.req.header("X-Slack-Signature"),
    requestId: c.var.requestId,
  });
  ctx.logger.info("integrations.slack_command", { status: result.status });
  return c.json(result.body, result.status);
});

export default routes;
