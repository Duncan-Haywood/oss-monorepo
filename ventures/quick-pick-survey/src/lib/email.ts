const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const from = process.env.PASSWORD_RESET_FROM ?? "Quick Pick <noreply@marisstella.dev>";
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your Quick Pick password",
      text: `Use this link to reset your Quick Pick password. It expires in one hour:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use the button below to reset your Quick Pick password. This link expires in one hour.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f59e0b;color:#171717;font-weight:700;text-decoration:none">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}
