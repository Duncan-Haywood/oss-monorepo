// Sales Agent M4b: a minimal SMTP submission client and the message builder. Used only by agent.mjs's `send`, which runs
// only on a draft a person approved, only when SMTP_HOST is set, and never twice for one draft. No dependencies.
// Supports implicit TLS (465), STARTTLS (587) and plain (tests only), AUTH XOAUTH2 (when `getToken` is given), PLAIN, then LOGIN. Not built: DKIM
// (your mail provider signs on submission), attachments, HTML, delivery status notifications.
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import { servername } from "./imap.mjs";

const addr = (s) => (String(s).match(/[^\s<>",;]+@[^\s<>",;]+/) || [""])[0];
const noCtl = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);

/**
 * Build a plain-text message. `unsubscribe` is the sender's own address for "mailto:" opt-out requests (default: from).
 * Header values lose CR/LF so a prospect's subject cannot inject headers. Lines are CRLF, body dot-stuffing is done at send.
 */
export function buildMessage({ from, to, subject, body, inReplyTo, references, unsubscribe, date = new Date(), domain }) {
  const f = addr(from), t = addr(to);
  if (!f || !t) throw new Error("from and to must be email addresses");
  const u = addr(unsubscribe || f);
  const id = `<${randomUUID()}@${domain || f.split("@")[1]}>`;
  const h = [
    `From: ${noCtl(from)}`, `To: ${t}`, `Subject: ${encWord(noCtl(subject))}`, `Date: ${date.toUTCString().replace("GMT", "+0000")}`, `Message-ID: ${id}`,
    ...(inReplyTo ? [`In-Reply-To: ${noCtl(inReplyTo)}`, `References: ${noCtl(references ? references + " " + inReplyTo : inReplyTo)}`] : []),
    `List-Unsubscribe: <mailto:${u}?subject=unsubscribe>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64",
  ];
  const b64 = Buffer.from(String(body).replace(/\r?\n/g, "\r\n")).toString("base64").replace(/.{1,76}/g, "$&\r\n");
  return { id, from: f, to: t, raw: h.join("\r\n") + "\r\n\r\n" + b64 };
}

/** Send one message. Resolves with the server's final reply line; rejects with the server's words (password redacted). */
export async function sendMail({ host, port = 587, secure = false, starttls = true, user, pass, getToken, timeoutMs = 20000, ca }, msg) {
  const tlsOpts = { servername: servername(host), ca };
  let sock = secure ? tls.connect({ host, port, ...tlsOpts }) : net.connect({ host, port });
  let buf = "", waiter = null;
  const failer = {};
  const feed = (d) => { buf += d; pump(); };
  const pump = () => {
    if (!waiter) return;
    const lines = buf.split("\r\n");
    const done = lines.findIndex((l) => /^\d{3} /.test(l));
    if (done < 0) return;
    const text = lines.slice(0, done + 1); buf = lines.slice(done + 1).join("\r\n");
    const w = waiter; waiter = null; w(text);
  };
  const attach = () => { sock.setEncoding("utf8"); sock.on("data", feed); };
  attach();
  const timer = setTimeout(() => sock.destroy(new Error("SMTP timeout")), timeoutMs);
  const fail = new Promise((_, rej) => { failer.reject = rej; sock.on("error", rej); });
  const read = () => Promise.race([new Promise((r) => { waiter = r; pump(); }), fail]);
  const expect = async (ok, label) => { const r = await read(); const last = r[r.length - 1]; if (!ok.some((c) => last.startsWith(c))) throw new Error(`SMTP ${label}: ${last}`.replace(pass || "\0", "***")); return r; };
  const say = (l) => sock.write(l + "\r\n");
  try {
    await expect(["220"], "greeting");
    say("EHLO sales-agent.local"); let caps = (await expect(["250"], "EHLO")).join(" ");
    if (!secure && starttls && /STARTTLS/i.test(caps)) {
      say("STARTTLS"); await expect(["220"], "STARTTLS");
      sock.removeAllListeners("data"); sock = tls.connect({ socket: sock, ...tlsOpts }); attach(); sock.on("error", (e) => failer.reject(e));
      say("EHLO sales-agent.local"); caps = (await expect(["250"], "EHLO")).join(" ");
    } else if (!secure && user && !/^(127\.|localhost$)/.test(host)) throw new Error("refusing to send a password without TLS (server offers no STARTTLS)");
    if (user && getToken) {
      say("AUTH XOAUTH2 " + Buffer.from(`user=${user}\x01auth=Bearer ${await getToken()}\x01\x01`).toString("base64"));
      const r = await read(); const last = r[r.length - 1];
      if (last.startsWith("334")) { say(""); await read(); throw new Error("SMTP AUTH: XOAUTH2 refused"); }
      if (!last.startsWith("235")) throw new Error(`SMTP AUTH: ${last}`);
    } else if (user) {
      if (/AUTH[^\r\n]*PLAIN/i.test(caps)) { say("AUTH PLAIN " + Buffer.from(`\0${user}\0${pass}`).toString("base64")); await expect(["235"], "AUTH"); }
      else { say("AUTH LOGIN"); await expect(["334"], "AUTH"); say(Buffer.from(user).toString("base64")); await expect(["334"], "AUTH"); say(Buffer.from(pass).toString("base64")); await expect(["235"], "AUTH"); }
    }
    say(`MAIL FROM:<${msg.from}>`); await expect(["250"], "MAIL FROM");
    say(`RCPT TO:<${msg.to}>`); await expect(["250", "251"], "RCPT TO");
    say("DATA"); await expect(["354"], "DATA");
    sock.write(msg.raw.replace(/^\./gm, "..") + "\r\n.\r\n");
    const r = await expect(["250"], "DATA end");
    say("QUIT"); sock.end();
    return r[r.length - 1];
  } finally { clearTimeout(timer); sock.destroy(); }
}
