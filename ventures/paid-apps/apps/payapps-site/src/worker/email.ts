// Outgoing email. Production: Cloudflare Email Service through the `send_email` binding `EMAIL`
// (transactional only, like apps/grants' ports/cloudflare-email.ts). Local dev and tests: "log" mode
// records the message without sending (and prints links only in development).

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(msg: OutgoingEmail): Promise<void>;
}

/** The part of the `send_email` binding used here (structural, so tests can pass a fake). */
export interface EmailSendBinding {
  send(builder: EmailMessageBuilder): Promise<{ messageId: string }>;
}

const HEADER_UNSAFE = /[\r\n]/;

/** "PayPencil <no-reply@example.org>" or a bare address → the binding's `from`. */
export function parseFrom(from: string): string | EmailAddress {
  const m = /^\s*"?([^"<>]*?)"?\s*<([^<>\s]+)>\s*$/.exec(from);
  const email = (m?.[2] ?? from).trim();
  if (!isEmailAddress(email)) throw new Error("EMAIL_FROM is not a valid sender address");
  const name = (m?.[1] ?? "").trim();
  return name ? { email, name } : email;
}

/** Conservative single-address check (no display names, no header injection). */
export function isEmailAddress(value: string): boolean {
  return (
    value.length <= 254 &&
    !HEADER_UNSAFE.test(value) &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
      value,
    )
  );
}

export class CloudflareEmailSender implements EmailSender {
  constructor(
    private binding: EmailSendBinding,
    private from: string,
  ) {}

  async send(msg: OutgoingEmail): Promise<void> {
    if (!isEmailAddress(msg.to)) throw new Error("Email send failed: bad recipient");
    await this.binding.send({
      from: parseFrom(this.from),
      to: msg.to,
      subject: msg.subject.replace(/[\r\n]+/g, " "),
      text: msg.text,
      html: msg.html,
    });
  }
}

/** Records messages instead of sending them. */
export class LogEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];
  constructor(private printLinks = false) {}

  async send(msg: OutgoingEmail): Promise<void> {
    this.sent.push(msg);
    // Never log the address; links only in local development, where they are the point.
    console.log(
      JSON.stringify({ event: "email.logged", subject: msg.subject }),
      this.printLinks ? `\n${msg.text}` : "",
    );
  }
}

export function senderFromEnv(env: {
  EMAIL?: EmailSendBinding;
  EMAIL_FROM: string;
  EMAIL_MODE?: string;
  APP_ENV: string;
}): EmailSender {
  if (env.EMAIL_MODE === "cloudflare") {
    if (!env.EMAIL) throw new Error("EMAIL_MODE=cloudflare needs the EMAIL send_email binding");
    return new CloudflareEmailSender(env.EMAIL, env.EMAIL_FROM);
  }
  return new LogEmailSender(env.APP_ENV === "development");
}
