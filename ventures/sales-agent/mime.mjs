// A small MIME reader with no Node built-ins, shared by the self-host server (self-host/imap.mjs re-exports it) and the
// browser page, which reads .eml and .mbox files with it (mailfile.mjs). Moved out of imap.mjs on 2026-11-11; the output
// is the same as before on every fixture (mailfile.test.mjs runs a differential check against the old Buffer code).

// Bytes from a string, the way Node's Buffer.from(s, enc) makes them.
const utf8Bytes = (s) => new TextEncoder().encode(s);
const latin1Bytes = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = (() => { const t = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; t[45] = 62; t[95] = 63; return t; })(); // '-' and '_' too, as Buffer does
/** Lenient base64 like Buffer.from(s, "base64"): skips characters outside the alphabet, stops at "=", ignores a dangling 6 bits. */
export function base64Bytes(s) {
  const out = new Uint8Array(Math.floor(s.length * 3 / 4) + 3);
  let n = 0, acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 61) break;
    const v = c < 128 ? B64_INDEX[c] : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[n++] = (acc >> bits) & 255; }
  }
  return out.subarray(0, n);
}
const decode = (bytes, charset) => { try { return new TextDecoder(charset).decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); } };

const unfold = (h) => h.replace(/\r?\n[ \t]+/g, " ");
function decodeWords(s) {
  return s.replace(/=\?([\w-]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, enc, txt) => {
    try { const buf = enc.toLowerCase() === "b" ? base64Bytes(txt) : latin1Bytes(txt.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))); return new TextDecoder(/utf-?8/i.test(cs) ? "utf-8" : cs.toLowerCase()).decode(buf); } catch { return txt; }
  }).replace(/(\S)\s+(?=\S)/g, "$1 ").trim();
}
function decodeBody(body, enc, charset) {
  let buf;
  const e = String(enc || "").toLowerCase();
  if (e === "base64") buf = base64Bytes(body.replace(/\s+/g, ""));
  else if (e === "quoted-printable") buf = latin1Bytes(body.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))));
  else buf = utf8Bytes(body);
  return decode(buf, /utf-?8|^$/i.test(charset || "") ? "utf-8" : charset.toLowerCase());
}
/** Header block to { lowercased name: first value }, folded lines joined. */
export const headerMap = (block) => { const h = {}; for (const l of unfold(block).split(/\r?\n/)) { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m && !(m[1].toLowerCase() in h)) h[m[1].toLowerCase()] = m[2]; } return h; };
const param = (v, k) => (String(v || "").match(new RegExp(`${k}="?([^";]+)"?`, "i")) || [])[1] || "";
const htmlToText = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
export const splitHead = (s) => { const m = s.match(/\r?\n\r?\n/); return m ? [s.slice(0, m.index), s.slice(m.index + m[0].length)] : [s, ""]; };

/** Parse a raw RFC 822 message into { headers, text, dsn }. Prefers text/plain, falls back to stripped text/html. */
export function parseMessage(raw) {
  let dsn = null;
  const walk = (src) => {
    const [hb, body] = splitHead(src), h = headerMap(hb), ct = h["content-type"] || "text/plain";
    // RFC 3464 delivery status: Final-Recipient names the address that failed, Status 5.x.x is permanent, 4.x.x temporary.
    if (/^message\/delivery-status/i.test(ct) && !dsn) {
      const g = (k) => (body.match(new RegExp(`^${k}:\\s*(.+)$`, "im")) || [])[1]?.trim() || "";
      const status = (g("Status").match(/^([245])\.\d+\.\d+/) || [])[1];
      dsn = { recipient: (g("Final-Recipient").replace(/^rfc822;\s*/i, "").match(/[\w.+'-]+@[\w.-]+/) || [""])[0].toLowerCase(), action: g("Action").toLowerCase(), permanent: status === "5" && g("Action").toLowerCase() !== "delayed", temporary: status === "4" || g("Action").toLowerCase() === "delayed" };
      // A DSN may report several recipients, one blank-line group each; every one that failed permanently must be stopped, not only the first.
      dsn.failed = [...new Set(body.split(/\r?\n\r?\n/).filter((grp) => /^Action:\s*failed/im.test(grp) && /^Status:\s*5\./im.test(grp)).map((grp) => ((grp.match(/^Final-Recipient:\s*(?:rfc822;)?\s*(.+)$/im) || [])[1] || "").match(/[\w.+'-]+@[\w.-]+/)?.[0].toLowerCase()).filter(Boolean))];
      return { h, kind: "other", text: "" };
    }
    if (/^multipart\//i.test(ct)) {
      const b = param(ct, "boundary");
      const parts = b ? body.split(new RegExp(`\\r?\\n?--${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*\\r?\\n?`)).slice(1) : [];
      const found = parts.map(walk).filter((p) => p.text);
      return { h, text: (found.find((p) => p.kind === "plain") || found[0] || { text: "" }).text, kind: found.find((p) => p.kind === "plain") ? "plain" : "html" };
    }
    if (/^(text\/html)/i.test(ct)) return { h, kind: "html", text: htmlToText(decodeBody(body, h["content-transfer-encoding"], param(ct, "charset"))) };
    if (/^text\//i.test(ct)) return { h, kind: "plain", text: decodeBody(body, h["content-transfer-encoding"], param(ct, "charset")).trim() };
    return { h, kind: "other", text: "" };
  };
  const top = walk(raw), h = top.h;
  return { headers: { from: decodeWords(h.from || ""), subject: decodeWords(h.subject || ""), date: h.date || "", messageId: (h["message-id"] || "").trim(), autoSubmitted: h["auto-submitted"] || "", precedence: h.precedence || "", xAutoreply: h["x-autoreply"] || h["x-autorespond"] || "", contentType: h["content-type"] || "", inReplyTo: h["in-reply-to"] || "" }, text: top.text, dsn };
}

/** Turn a parsed message into the `From:` block the engine's parseReplies reads (and keep the quoted history out). */
export const toReplyBlock = (m) => {
  const hd = m.headers, signal = m.dsn?.permanent ? "dsn-permanent" : m.dsn?.temporary ? "dsn-temporary" : /^(auto-replied|auto-generated|auto-notified)/i.test(hd.autoSubmitted) || /^auto[_-]?reply\b/i.test(hd.precedence) || hd.xAutoreply ? "auto-reply" : "";
  const one = (rcpt) => `From: ${hd.from}\nSubject: ${hd.subject}\nDate: ${hd.date}${signal ? `\nX-Signal: ${signal}` : ""}${rcpt ? `\nX-Failed-Recipient: ${rcpt}` : ""}\n\n${m.text || (m.dsn ? "Delivery status notification" : "")}`;
  // One block per permanently failed recipient, so each address is marked bounced.
  return m.dsn?.failed?.length > 1 ? m.dsn.failed.map(one).join("\n") : one(m.dsn?.recipient);
};

// The line the engine's parseReplies splits pasted replies on (engine.mjs): a body holding one would split in two.
const SEPARATOR = /\r?\n\s*-{3,}\s*\r?\n/;
/**
 * The reply blocks for one message, each read on its own: one per permanently failed recipient of a delivery failure,
 * and each cut at its first "---" line, which is what parseReplies(block)[0] keeps. Before 2026-11-11 the self-host
 * server took parseReplies(toReplyBlock(m))[0], so a bounce naming two failed addresses stopped only the first.
 */
export const replyBlocks = (m) => (m.dsn?.failed?.length > 1 ? m.dsn.failed : [null])
  .map((rcpt) => toReplyBlock(rcpt ? { ...m, dsn: { ...m.dsn, recipient: rcpt, failed: [rcpt] } } : m).split(SEPARATOR)[0]);
