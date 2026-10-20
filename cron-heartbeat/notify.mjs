// Alert channels, chosen by environment variables. A channel with no variables set is
// off. All are plain HTTPS calls from your own server to a service you own an account on.
//   ALERT_WEBHOOK_URL                      Slack / Discord / Mattermost-style JSON
//   ALERT_NTFY_URL                         an ntfy.sh topic (or your own ntfy server)
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  a Telegram bot you created with @BotFather
//   RESEND_API_KEY + ALERT_EMAIL_TO + ALERT_EMAIL_FROM   email through your Resend account

export function channelsFrom(env) {
  const out = [];
  if (env.ALERT_WEBHOOK_URL) out.push("webhook");
  if (env.ALERT_NTFY_URL) out.push("ntfy");
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push("telegram");
  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO && env.ALERT_EMAIL_FROM) out.push("email");
  return out;
}

async function post(name, url, init, fetchImpl) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
}

/** Returns notify(msg): sends to every configured channel; one failing does not skip the rest. */
export function createNotifier(env, fetchImpl = fetch, log = console.log) {
  const json = { "content-type": "application/json" };
  const senders = {
    webhook: (m) => post("webhook", env.ALERT_WEBHOOK_URL, { method: "POST", headers: json, body: JSON.stringify({ text: m.text, content: m.text }) }, fetchImpl),
    ntfy: (m) => post("ntfy", env.ALERT_NTFY_URL, { method: "POST", body: m.text, headers: { Title: `cron-heartbeat: ${m.slug}`, Priority: m.state === "recovered" ? "default" : "high" } }, fetchImpl),
    telegram: (m) => post("telegram", `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: json, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: m.text }) }, fetchImpl),
    email: (m) => post("email", "https://api.resend.com/emails", { method: "POST", headers: { ...json, authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.ALERT_EMAIL_FROM, to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean), subject: `[cron-heartbeat] ${m.slug} ${m.state}`, text: m.text }) }, fetchImpl),
  };
  const active = channelsFrom(env);
  return async function notify(msg) {
    log(msg.text);
    const results = await Promise.allSettled(active.map((c) => senders[c](msg)));
    const failed = results.map((r, i) => (r.status === "rejected" ? `${active[i]}: ${r.reason.message}` : null)).filter(Boolean);
    // Throw only when every channel failed, so the monitor retries instead of going silent.
    if (active.length && failed.length === active.length) throw new Error(failed.join("; "));
    if (failed.length) log(`some alert channels failed: ${failed.join("; ")}`);
  };
}
