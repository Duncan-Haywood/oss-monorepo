// The one email this site sends: the double opt-in confirmation (transactional).
import { PRODUCT_NAME } from "@shared/site";
import { esc } from "@site/html";

export function confirmEmail(links: { confirmUrl: string; removeUrl: string }) {
  const subject = `Confirm your ${PRODUCT_NAME} early-access sign-up`;
  const text = `Someone (hopefully you) asked to join ${PRODUCT_NAME} early access with this address.

Confirm your sign-up (link works for 7 days):
${links.confirmUrl}

Not you, or changed your mind? Ignore this email and the sign-up is deleted after 30 days (or when its newest link expires, if later), or delete it now:
${links.removeUrl}

${PRODUCT_NAME} is a pay-application tool for subcontractors, in development. We will only email you about early access.
`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f1c19">
<p>Someone (hopefully you) asked to join ${esc(PRODUCT_NAME)} early access with this address.</p>
<p><a href="${esc(links.confirmUrl)}" style="display:inline-block;background:#1d3a5c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Confirm my sign-up</a></p>
<p>The link works for 7 days.</p>
<p>Not you, or changed your mind? Ignore this email and the sign-up is deleted after 30 days (or when its newest link expires, if later), or <a href="${esc(links.removeUrl)}">delete it now</a>.</p>
<p style="color:#57514a;font-size:14px">${esc(PRODUCT_NAME)} is a pay-application tool for subcontractors, in development. We will only email you about early access.</p>
</body></html>`;
  return { subject, text, html };
}
