// Email subscribers when a post they follow moves. Dry run by default: logs, sends nothing.
import { unsubToken } from "./store.mjs";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function resendSender({ apiKey, from, fetchImpl = fetch }) {
  return async (msg) => {
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }),
    });
    if (!r.ok) throw new Error(`resend ${r.status}`);
  };
}

export function statusMessage({ post, to, title, baseUrl, secret }) {
  const unsub = `${baseUrl}/unsubscribe?e=${encodeURIComponent(to)}&t=${unsubToken(secret, to)}`;
  const verb = { planned: "is now planned", "in-progress": "is being built", shipped: "has shipped", declined: "will not be built for now" }[post.status] || `moved to ${post.status}`;
  const link = `${baseUrl}/post/${post.id}`;
  return {
    to,
    subject: `${title}: "${post.title}" ${verb}`,
    text: `"${post.title}" ${verb}.\n\n${link}\n\nYou get this because you voted or asked to follow it. Stop all updates: ${unsub}\n`,
    html: `<p>“${esc(post.title)}” ${verb}.</p><p><a href="${esc(link)}">See it on the board</a></p><p style="color:#666;font-size:12px">You get this because you voted or asked to follow it. <a href="${esc(unsub)}">Unsubscribe</a></p>`,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export async function notifyStatus({ post, recipients, title, baseUrl, secret, send, dryRun }) {
  const log = [];
  for (const to of recipients) {
    const msg = statusMessage({ post, to, title, baseUrl, secret });
    if (dryRun || !send) { log.push(`[dry-run] would email ${to}: ${msg.subject}`); continue; }
    try { await send(msg); log.push(`emailed ${to}: ${msg.subject}`); } catch (e) { log.push(`FAILED ${to}: ${e.message}`); }
  }
  return log;
}
