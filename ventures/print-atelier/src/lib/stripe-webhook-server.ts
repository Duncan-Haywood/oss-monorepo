import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  webhookSecret: string,
  maxAgeSeconds = 0,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const entries = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = entries.find((part) => part.startsWith("t="));
  const signaturePart = entries.find((part) => part.startsWith("v1="));

  if (!timestampPart || !signaturePart) {
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    return false;
  }

  if (maxAgeSeconds > 0 && Math.abs(nowSeconds - timestampNum) > maxAgeSeconds) {
    return false;
  }

  const expectedSignature = signaturePart.slice(3);
  const signedPayload = `${timestamp}.${payload}`;

  const computed = createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}
