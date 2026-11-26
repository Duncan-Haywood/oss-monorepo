// Owner mail through Cloudflare Email Service (the `send_email` binding EMAIL + EMAIL_FROM), the same
// port the product apps use (apps/payapps src/worker/ports/email.ts). Without both, nothing is sent.

export interface EmailSendBinding {
  send(message: {
    from: string | { email: string; name: string };
    to: string[];
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

const SAFE_ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

export function parseFromAddress(from: string): string | { email: string; name: string } {
  const m = /^\s*"?([^"<>]*?)"?\s*<([^<>\s]+)>\s*$/.exec(from);
  const email = (m?.[2] ?? from).trim();
  if (!SAFE_ADDRESS.test(email)) throw new Error("EMAIL_FROM is not a valid sender address");
  const name = (m?.[1] ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);
  return name ? { email, name } : email;
}

export interface OwnerMailer {
  send(to: string[], subject: string, text: string): Promise<void>;
}

/** The mailer, or null when no sender is configured (= notifications stay off). */
export function ownerMailer(env: {
  EMAIL?: EmailSendBinding;
  EMAIL_FROM?: string;
}): OwnerMailer | null {
  const from = env.EMAIL_FROM?.trim();
  const binding = env.EMAIL;
  if (!binding || !from) return null;
  return {
    async send(to, subject, text) {
      const recipients = to.filter((a) => SAFE_ADDRESS.test(a));
      if (!recipients.length) throw new Error("no valid recipients");
      await binding.send({
        from: parseFromAddress(from),
        to: recipients.slice(0, 50),
        subject: subject.replace(/[\r\n]+/g, " ").slice(0, 900),
        text,
      });
    },
  };
}
