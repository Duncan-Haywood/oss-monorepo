// The self-host agent against a real Dovecot (IMAP) and a real Postfix (SMTP submission), not the in-repo fakes.
// Start the servers first with ./setup.sh (a throwaway container or VM), then: node self-host/real-servers/real-servers.mjs
// Every step prints PASS or FAIL with what the server said; the exit code is the number of failures.
// The people and the domain example.test are invented. Nothing leaves 127.0.0.1.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Imap, parseMessage } from "../imap.mjs";
import { buildMessage, sendMail } from "../smtp.mjs";
import { createAgent } from "../agent.mjs";

const DIR = process.env.DIR || "/tmp/sa-real-mail";
const PASS = process.env.PASS || "correct-horse-battery";
const ME = "me@example.test", PAT = "pat@example.test", LEE = "lee@example.test";
const CA_FILE = join(DIR, "ca.pem"), ca = readFileSync(CA_FILE);
const H = "localhost";
let fails = 0;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const doveadm = (...a) => execFileSync("doveadm", ["-c", join(DIR, "dovecot.conf"), ...a], { encoding: "utf8" });
const count = (user) => Number((doveadm("mailbox", "status", "-u", user, "messages", "INBOX").match(/messages=(\d+)/) || [])[1] || 0);
async function waitFor(user, n, ms = 10000) { const t = Date.now(); while (Date.now() - t < ms) { if (count(user) >= n) return true; await sleep(200); } return false; }
const attempt = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: String(e.message || e) }; } };

// 1. SMTP submission, STARTTLS on 587-style port, trusted through the private CA.
const outbound = buildMessage({ from: ME, to: PAT, subject: "Route planning for your crews", body: "Hi Pat,\n\nWould a 15-minute look at route planning help your crews this month?\n\nMe", unsubscribe: ME });
let r = await attempt(() => sendMail({ host: H, port: 10587, user: ME, pass: PASS, ca }, outbound));
check("SMTP STARTTLS (10587): Postfix accepts AUTH after STARTTLS and queues the message", r.ok && /^250 /.test(r.value), r.ok ? r.value : r.error);
check("SMTP: delivered to Pat's Dovecot mailbox through LMTP", await waitFor(PAT, 1));

// 2. Implicit TLS (465-style).
r = await attempt(() => sendMail({ host: H, port: 10465, secure: true, user: ME, pass: PASS, ca }, buildMessage({ from: ME, to: LEE, subject: "Route planning", body: "Hi Lee,\n\nA short note about route planning.\n\nMe" })));
check("SMTP implicit TLS (10465): accepted", r.ok && /^250 /.test(r.value), r.ok ? r.value : r.error);

// 3. Untrusted certificate: refused before AUTH, so the password never reaches the server.
const logBefore = readFileSync(join(DIR, "postfix.log"), "utf8").length;
r = await attempt(() => sendMail({ host: H, port: 10587, user: ME, pass: PASS }, outbound));
check("SMTP STARTTLS without the CA: refused on the certificate", !r.ok && /self.signed|unable to verify|certificate/i.test(r.error), r.error || "sent anyway");
await sleep(300);
const logAfter = readFileSync(join(DIR, "postfix.log"), "utf8").slice(logBefore);
check("  ... and Postfix logged no SASL login attempt for it", !/sasl_method|authentication failed/i.test(logAfter), (logAfter.match(/.*(sasl|SSL|TLS).*/gi) || []).slice(-1)[0]?.slice(0, 160) || "");

// 4. Wrong password: Postfix's real error, password not echoed.
r = await attempt(() => sendMail({ host: H, port: 10587, user: ME, pass: "wrong-" + PASS, ca }, outbound));
check("SMTP wrong password: Postfix's 535 comes back as the error", !r.ok && /535/.test(r.error), r.error);
check("  ... and the error does not contain the password", !r.ok && !r.error.includes("wrong-" + PASS));

// 5. Pat reads the message over IMAPS: headers survived a real MTA.
const c = new Imap({ host: H, port: 10993, secure: true, ca });
r = await attempt(async () => { await c.connect(); await c.login(PAT, PASS); await c.examine(); const uids = await c.search("ALL"); return parseMessage(await c.fetchRaw(uids[0])); });
const got = r.value;
check("IMAPS (10993): Dovecot login, EXAMINE, UID SEARCH, BODY.PEEK fetch", r.ok, r.error || `subject "${got?.headers.subject}"`);
const rawPat = r.ok ? await c.fetchRaw((await c.search("ALL"))[0]) : "";
check("  List-Unsubscribe header arrived intact", /^List-Unsubscribe: <mailto:me@example\.test\?subject=unsubscribe>/mi.test(rawPat));
check("  Message-ID the agent set is the one delivered", rawPat.includes(outbound.id));
check("  Postfix stamped a TLS Received line (the hop was encrypted)", /Received: from .*\r?\n(?:\s.*\r?\n)*\s.*(ESMTPSA|TLS)/i.test(rawPat), (rawPat.match(/\(using TLS[^)]*\)/) || [""])[0]);
await c.logout();
const flags = doveadm("fetch", "-u", PAT, "flags", "mailbox", "INBOX", "ALL");
check("  read-only: the message is still unread (no \\Seen) after the agent's fetch", !/\\Seen/.test(flags), flags.trim().replace(/\s+/g, " "));

// 6. Plain IMAP port: the agent has no STARTTLS for IMAP, so IMAP_SECURE=false on a non-local host would be plaintext.
// Dovecot refuses LOGIN in plaintext from anywhere but localhost; here we just record that the agent's plain mode
// talks to 10143 only because 127.0.0.1 counts as secure to Dovecot.
const p = new Imap({ host: "127.0.0.1", port: 10143, secure: false });
r = await attempt(async () => { await p.connect(); await p.login(PAT, PASS); return "ok"; });
check("IMAP plain (10143) from 127.0.0.1: Dovecot allows it (loopback counts as secure)", r.ok, r.error || "");
await p.logout();

// 7. The whole agent: Pat and Lee reply, the agent polls Me's mailbox, triages, a person approves, the agent sends.
const patReply = buildMessage({ from: `Pat Rivera <${PAT}>`, to: ME, subject: "Re: Route planning for your crews", body: "This sounds interesting. Could you send over a few times next week for a quick call?\n\nPat", inReplyTo: outbound.id });
const leeReply = buildMessage({ from: LEE, to: ME, subject: "Re: Route planning", body: "Please remove me from your list. Stop emailing me.\n\nLee" });
// A message to an address that does not exist: Postfix accepts it, LMTP refuses it, and Postfix's own DSN lands in Me's INBOX.
r = await attempt(() => sendMail({ host: H, port: 10587, user: ME, pass: PASS, ca }, buildMessage({ from: ME, to: "nobody@example.test", subject: "Route planning", body: "Hi,\n\nA short note.\n\nMe" })));
check("message to nobody@example.test accepted for delivery (it will bounce)", r.ok, r.error || "");
for (const [u, m] of [[PAT, patReply], [LEE, leeReply]]) {
  r = await attempt(() => sendMail({ host: H, port: 10587, user: u, pass: PASS, ca }, m));
  check(`${u} replies through Postfix`, r.ok, r.error || "");
}
check("both replies and Postfix's bounce delivered to Me's INBOX", await waitFor(ME, 3), `${count(ME)} messages`);
const env = { ADMIN_TOKEN: "t".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-real-")), IMAP_HOST: H, IMAP_PORT: "10993", IMAP_USER: ME, IMAP_PASS: PASS, TLS_CA_FILE: CA_FILE,
  SMTP_HOST: H, SMTP_PORT: "10587", SMTP_USER: ME, SMTP_PASS: PASS, SENT_BOX: "auto" };
const agent = createAgent(env);
const n = await agent.poll();
check("agent poll over IMAPS read both replies and the bounce", n === 3, `ingested ${n}${agent.state.lastError ? ", error: " + agent.state.lastError : ""}`);
check("agent found Dovecot's \\Sent folder", agent.state.sentBox?.name === "Sent", agent.state.sentError || agent.state.sentBox?.name || "none");
const pat = agent.state.items.find((x) => x.from.includes(PAT)), lee = agent.state.items.find((x) => x.from.includes(LEE));
check("Lee's opt-out: triaged as unsubscribe and suppressed, no draft", lee?.triage.category === "unsubscribe" && !lee.draft && agent.state.suppression.some((s) => s.email === LEE), lee?.triage.category);
const dsn = agent.state.items.find((x) => x.triage.category === "bounce");
const gone = agent.state.prospects.find((x) => x.email === "nobody@example.test");
check("Postfix's real DSN: read as a permanent bounce, and the failed address (not MAILER-DAEMON) is stopped", dsn && gone && /bounce/i.test(JSON.stringify(gone)) && !agent.state.prospects.some((x) => /mailer-daemon/i.test(x.email)), dsn ? `item from ${dsn.from}; prospect ${JSON.stringify(gone)}` : agent.state.items.map((x) => x.from + ":" + x.triage.category).join(", "));
check("Pat's reply: interested, draft waiting for approval", pat?.triage.category === "interested" && pat.decision === "pending", pat?.triage.category);
check("Pat's item id is the real Message-ID, so a send threads", pat?.id === patReply.id, pat?.id);
const body = pat.draft.body.replace(/\[[^\]]+\]/g, "Tuesday 10:00 or Wednesday 14:00");
check("person approves the draft", agent.decide(pat.id, "approved", body)?.decision === "approved");
const before = count(PAT);
const sent = await agent.send(pat.id);
check("agent sends the approved draft through Postfix", !!sent?.sentAt, sent?.error || "");
check("  delivered to Pat", await waitFor(PAT, before + 1));
const again = await agent.send(pat.id);
check("  a second click does not send twice", /already sent/.test(again?.error || ""), again?.error);
const c2 = new Imap({ host: H, port: 10993, secure: true, ca });
await c2.connect(); await c2.login(PAT, PASS); await c2.examine();
const last = await c2.fetchRaw((await c2.search("ALL")).at(-1)); await c2.logout();
check("  Pat's copy threads (In-Reply-To = Pat's Message-ID)", last.includes(`In-Reply-To: ${patReply.id}`), (last.match(/^In-Reply-To:.*$/mi) || ["none"])[0]);
check("  Pat's copy carries List-Unsubscribe", /^List-Unsubscribe:/mi.test(last));
// A blocked address stays blocked against a real server too.
const blocked = agent.decide(lee?.id, "approved");
check("nothing to approve on Lee's opt-out", blocked === null);
// Today's queue: Postfix does not file a submission in Sent (Gmail and Microsoft 365 do), so the agent's own sends
// must count. Pat's next email step in the cadence has the subject the agent just replied under; it must not be due again.
const tasks = `date,channel,step,prospect,company,email,subject\n${new Date().toISOString().slice(0, 10)},email,Email 2,Pat Rivera,Acme,${PAT},Route planning for your crews\n`;
await agent.poll();
const d = agent.daily({ tasks });
check("Dovecot's Sent folder holds none of the agent's sends (so the agent's own record is what counts)", !agent.state.sent.some((s) => s.to.includes(PAT)), `${agent.state.sent.length} in Sent`);
check("Today's queue: Pat's step is already sent, not due again (Pat wrote from \"Pat Rivera <...>\")", d.summary?.due === 0 && d.summary?.alreadySent === 1, JSON.stringify({ due: d.summary?.due, alreadySent: d.summary?.alreadySent, error: d.error }));

console.log(`\n${results.length - fails} of ${results.length} passed`);
process.exit(fails);
