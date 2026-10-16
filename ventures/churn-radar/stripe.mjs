// Stripe webhook signature check (no SDK). Only the signature code is needed: churn-radar never calls the Stripe API.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = String(header).split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const want = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

export function signPayload(rawBody, secret, tSec) {
  return `t=${tSec},v1=${createHmac("sha256", secret).update(`${tSec}.${rawBody}`).digest("hex")}`;
}
