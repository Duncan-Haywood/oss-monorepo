// Paddle webhook receiver. Runs in the `payments` account behind a Lambda function URL
// (Paddle cannot sign AWS requests, so the URL is public; the Paddle signature is the gate).
// It reads the endpoint secret from Secrets Manager in its own account, verifies, and forwards
// a normalised message to the entitlement queue in the `apps` account. It never touches the DB.
import { verifyPaddle, toEntitlementMessage } from "./paddle.mjs";

const MAX_BODY = 256 * 1024;

export function makeWebhookHandler({ getSecret, sendMessage, now = () => Math.floor(Date.now() / 1000) }) {
  return async (event) => {
    const method = event.requestContext?.http?.method;
    if (method !== "POST") return { statusCode: 405, body: "" };
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    if (raw.length > MAX_BODY) return { statusCode: 413, body: "" };
    const header = event.headers?.["paddle-signature"];
    const v = verifyPaddle({ header, body: raw, secret: await getSecret(), nowSec: now() });
    if (!v.ok) { console.warn("paddle webhook rejected:", v.reason); return { statusCode: 401, body: "" }; }
    let msg;
    try { msg = toEntitlementMessage(JSON.parse(raw)); } catch { return { statusCode: 400, body: "" }; }
    await sendMessage(msg);                          // throws -> 5xx -> Paddle retries
    return { statusCode: 200, body: "" };
  };
}

// Lambda entry: wires real AWS clients. Env: PADDLE_SECRET_NAME, QUEUE_URL.
let cached;
export async function handler(event) {
  if (!cached) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const { SQSClient, SendMessageCommand } = await import("@aws-sdk/client-sqs");
    const sm = new SecretsManagerClient({}), sqs = new SQSClient({});
    let secret, fetchedAt = 0;
    cached = makeWebhookHandler({
      async getSecret() {               // re-read every 5 minutes so a rotation lands without a deploy
        if (!secret || Date.now() - fetchedAt > 300_000) {
          const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.PADDLE_SECRET_NAME }));
          secret = r.SecretString; fetchedAt = Date.now();
        }
        return secret;
      },
      async sendMessage(msg) {
        await sqs.send(new SendMessageCommand({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(msg) }));
      },
    });
  }
  return cached(event);
}
