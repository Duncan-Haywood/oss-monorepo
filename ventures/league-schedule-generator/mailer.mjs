// A small SMTP client for the league server's reminders, on the deployer's own mail account.
// Off unless SMTP_HOST is set; nothing here talks to any service the project runs. Zero dependencies.
//   SMTP_HOST=smtp.example.org SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... SMTP_FROM=league@example.org
// Port 465 (or SMTP_SECURE=1) opens TLS straight away; any other port upgrades with STARTTLS when the
// server offers it. A password is never sent over a connection that is not encrypted, except to a
// server on this machine (localhost), where a local relay is the usual setup.
import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";
import { EMAIL } from "./availability.mjs";

/** env -> { host, port, secure, user, pass, from } or null when reminders are off; { error } when half set. */
export function smtpConfig(env = process.env) {
  if (!env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT || 587);
  if (!/^[A-Za-z0-9.-]+$/.test(env.SMTP_HOST) || !Number.isInteger(port) || port < 1 || port > 65535) return { error: "SMTP_HOST or SMTP_PORT is not valid" };
  const from = env.SMTP_FROM || env.SMTP_USER || "";
  if (!EMAIL.test(from)) return { error: "set SMTP_FROM to the address reminders come from" };
  return { host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === "1" || port === 465, user: env.SMTP_USER || "", pass: env.SMTP_PASS || "", from };
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
const header = (s) => String(s).replace(/[\r\n]+/g, " ");
/** RFC 2047 for a subject with non-ASCII characters. */
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

/** The message as sent in DATA: headers, a base64 UTF-8 text body, CRLF line ends, dot-stuffing not needed for base64. */
export function buildMessage({ from, to, subject, text, date = new Date(), id = randomBytes(12).toString("hex") }) {
  const domain = from.split("@")[1];
  const body = Buffer.from(String(text).replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
  return [
    `From: ${header(from)}`, `To: ${to.map(header).join(", ")}`, `Subject: ${encodeWord(header(subject))}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`, `Message-ID: <${id}@${domain}>`, "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "Auto-Submitted: auto-generated", "", body,
  ].join("\r\n");
}

/**
 * Send one message. Resolves { ok: true, accepted: [...] } once the server takes it for at least one
 * recipient, else rejects with the server's reply. `connect` is for tests.
 */
export function sendMail(cfg, msg, { timeoutMs = 20000, connect } = {}) {
  const to = msg.to.filter((a) => EMAIL.test(a));
  if (!to.length) return Promise.reject(new Error("no valid recipient"));
  return new Promise((resolve, reject) => {
    let sock = connect ? connect(cfg) : cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
    let buf = "", waiting = null, done = false, encrypted = cfg.secure;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch {} err ? reject(err) : resolve(val); };
    const timer = setTimeout(() => finish(new Error("SMTP timed out")), timeoutMs);
    const onData = (d) => {
      buf += d.toString("latin1");
      // A reply is complete at a line "NNN text" (a space, not a dash, after the code).
      const m = buf.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n/);
      if (!m || !waiting) return;
      const end = buf.indexOf("\r\n", m.index + (m.index ? 2 : 0)) + 2;
      const reply = buf.slice(0, end); buf = buf.slice(end);
      const w = waiting; waiting = null; w({ code: Number(m[1]), text: reply });
    };
    const attach = (s) => { s.on("data", onData); s.on("error", (e) => finish(e)); };
    attach(sock);
    const read = () => new Promise((r) => { waiting = r; onData(Buffer.alloc(0)); });
    const cmd = async (line, ok) => { if (line !== null) sock.write(line + "\r\n"); const r = await read(); if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.trim().slice(0, 200)}`); return r; };
    (async () => {
      await cmd(null, [220]);
      const me = cfg.from.split("@")[1];
      let ehlo = await cmd(`EHLO ${me}`, [250]);
      if (!encrypted && /STARTTLS/i.test(ehlo.text)) {
        await cmd("STARTTLS", [220]);
        sock.removeAllListeners("data");
        sock = tls.connect({ socket: sock, servername: cfg.host });
        attach(sock);
        await new Promise((r, j) => { sock.once("secureConnect", r); sock.once("error", j); });
        encrypted = true;
        ehlo = await cmd(`EHLO ${me}`, [250]);
      }
      if (cfg.user) {
        if (!encrypted && !LOCAL.has(cfg.host)) throw new Error("the SMTP server offers no encryption; refusing to send the password");
        await cmd(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString("base64")}`, [235]);
      }
      await cmd(`MAIL FROM:<${cfg.from}>`, [250]);
      const accepted = [];
      for (const a of to) { sock.write(`RCPT TO:<${a}>\r\n`); const r = await read(); if (r.code === 250 || r.code === 251) accepted.push(a); }
      if (!accepted.length) throw new Error("the SMTP server refused every recipient");
      await cmd("DATA", [354]);
      const data = buildMessage({ ...msg, from: cfg.from, to: accepted }).replace(/\r\n\./g, "\r\n..");
      await cmd(data + "\r\n.", [250]);
      // The message is accepted at this point; QUIT is a courtesy, so a slow or silent goodbye is not an error.
      await Promise.race([cmd("QUIT", [221]).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      finish(null, { ok: true, accepted });
    })().catch((e) => finish(e));
  });
}
