// Email providers. Zero dependencies: each one is a single fetch call.
// MAIL_PROVIDER picks one (default "resend"); the key env var differs per provider.
// Postmark, SendGrid and Mailgun are here because many merchants already have an
// account with one of them and a verified sending domain.

const parseFrom = (from) => {
  const m = String(from || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: String(from || "").trim() };
};

export const PROVIDERS = {
  resend: {
    keyEnv: "RESEND_API_KEY",
    request: (msg, env) => ({
      url: "https://api.resend.com/emails",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
    }),
  },
  postmark: {
    keyEnv: "POSTMARK_SERVER_TOKEN",
    request: (msg, env) => ({
      url: "https://api.postmarkapp.com/email",
      headers: { "x-postmark-server-token": env.POSTMARK_SERVER_TOKEN, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ From: env.MAIL_FROM, To: msg.to, Subject: msg.subject, TextBody: msg.text, MessageStream: env.POSTMARK_STREAM || "outbound" }),
    }),
  },
  sendgrid: {
    keyEnv: "SENDGRID_API_KEY",
    request: (msg, env) => {
      const from = parseFrom(env.MAIL_FROM);
      return {
        url: "https://api.sendgrid.com/v3/mail/send",
        headers: { authorization: `Bearer ${env.SENDGRID_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: msg.to }] }],
          from: from.name ? { email: from.email, name: from.name } : { email: from.email },
          subject: msg.subject, content: [{ type: "text/plain", value: msg.text }],
        }),
      };
    },
  },
  mailgun: {
    keyEnv: "MAILGUN_API_KEY",
    extraEnv: ["MAILGUN_DOMAIN"],
    request: (msg, env) => {
      const host = env.MAILGUN_REGION === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
      return {
        url: `https://${host}/v3/${encodeURIComponent(env.MAILGUN_DOMAIN)}/messages`,
        headers: { authorization: `Basic ${Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ from: env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text }).toString(),
      };
    },
  },
};

export const providerName = (env) => String(env.MAIL_PROVIDER || "resend").toLowerCase();

// Names of env vars that are required but unset, or an unknown-provider message.
export function mailProblems(env) {
  const name = providerName(env);
  const p = PROVIDERS[name];
  if (!p) return [`MAIL_PROVIDER=${name} is not one of ${Object.keys(PROVIDERS).join(", ")}`];
  return [p.keyEnv, ...(p.extraEnv || []), "MAIL_FROM"].filter((k) => !env[k]);
}

export function createMailer(env, fetchFn = fetch) {
  const name = providerName(env);
  const p = PROVIDERS[name];
  if (!p) throw new Error(`unknown MAIL_PROVIDER ${name}`);
  return async (msg) => {
    const { url, headers, body } = p.request(msg, env);
    const res = await fetchFn(url, { method: "POST", headers, body });
    if (!res.ok) throw new Error(`${name} ${res.status}`);
  };
}
