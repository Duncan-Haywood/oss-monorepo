// Twilio plumbing for the self-host server: webhook signature check and the Messages API call.
// Uses the deployer's own account; nothing here runs unless the server is started with their keys.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Twilio signs the full URL followed by each POST parameter (sorted by name) as name+value, HMAC-SHA1, base64. */
export function twilioSignature(authToken, url, params) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data).digest("base64");
}
export function validSignature(authToken, url, params, header) {
  if (!authToken || !header) return false;
  const a = Buffer.from(twilioSignature(authToken, url, params)), b = Buffer.from(String(header));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function twiml(message) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${esc(message)}</Message>` : ""}</Response>`;
}

/** Send one text. `fetchImpl` is injectable so tests never touch the network. */
export async function sendSms({ accountSid, authToken, from, to, body }, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return {}; }
}
