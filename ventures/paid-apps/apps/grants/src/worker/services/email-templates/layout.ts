// Email layout: turns a template's structured content into a plain-text body and an inline-styled,
// table-based HTML body (600px max width; Gmail, Outlook and Apple Mail safe). Templates never write
// HTML: every value they pass is escaped here, so an org name like `<script>` stays inert text.
// No tracking pixels, no external images, no remote CSS.
import { cleanSubject, escapeHtml, normalizeAppUrl, safeHref, seg } from "./format";

export const PRODUCT_NAME = "Grant Autopilot";
export const OPERATOR_NAME = "Mary Stella Labs, LLC";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export type ListItem = string | { text: string; url?: string | null; detail?: string | null };

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "button"; label: string; url: string; showUrl?: boolean }
  | { type: "link"; label: string; url: string }
  | { type: "list"; items: ListItem[]; ordered?: boolean }
  | { type: "details"; rows: { label: string; value: string | null | undefined }[] }
  | { type: "quote"; text: string }
  | { type: "callout"; text: string; tone?: "warning" | "info" }
  | { type: "note"; text: string };

export interface EmailContent {
  subject: string;
  /** Inbox preview line (hidden in the body). */
  preheader?: string | null;
  heading?: string | null;
  greeting?: string | null;
  /** Falsy entries are skipped, so templates can write `cond && block`. */
  blocks: (Block | null | false | undefined)[];
  signoff?: string[];
  /** Small print after the sign-off (e.g. a submission reference). */
  trailer?: string | null;
  /** Header bar text. Defaults to the product name; funder mail shows the applicant instead. */
  brandName?: string | null;
  footer: {
    /** Why the recipient got this email. */
    reason: string;
    manageNotificationsUrl?: string | null;
    /** One-click unsubscribe page for this recipient (marketing and team-notification mail). */
    unsubscribeUrl?: string | null;
    /** Sender's physical postal address (CAN-SPAM; required on marketing mail). */
    postalAddress?: string | null;
    /** Funder-facing mail: "Sent on behalf of <applicant> with Grant Autopilot". */
    sentOnBehalfOf?: string | null;
  };
}

/** Link builders handed to templates so every link is built from the configured app URL. */
export interface TemplateContext {
  appUrl: string;
  url(path: string): string;
  orgUrl(orgId: string, path?: string): string;
  /** Where the team's notification recipients are managed (Autopilot & review settings). */
  notificationsUrl(orgId: string): string;
  privacyUrl: string;
}

export function createTemplateContext(appUrl: string): TemplateContext {
  const base = normalizeAppUrl(appUrl);
  const url = (path: string) => `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const orgUrl = (orgId: string, path = "") => url(`/orgs/${seg(orgId)}${path}`);
  return {
    appUrl: base,
    url,
    orgUrl,
    notificationsUrl: (orgId) => orgUrl(orgId, "/settings/autopilot"),
    privacyUrl: url("/legal/privacy"),
  };
}

// ---- Plain text ------------------------------------------------------------------------------

const listItemText = (item: ListItem, marker: string): string => {
  if (typeof item === "string") return `${marker} ${item}`;
  const head = `${marker} ${item.text}${item.detail ? ` · ${item.detail}` : ""}`;
  return item.url ? `${head}\n   ${item.url}` : head;
};

function blockText(b: Block): string {
  switch (b.type) {
    case "paragraph":
    case "note":
      return b.text;
    case "heading":
      return `${b.text}\n${"-".repeat(Math.min(b.text.length, 60))}`;
    case "button":
    case "link":
      return `${b.label}: ${b.url}`;
    case "list":
      return b.items.map((it, i) => listItemText(it, b.ordered ? `${i + 1}.` : "-")).join("\n");
    case "details":
      return b.rows
        .filter((r) => r.value)
        .map((r) => `${r.label}: ${r.value}`)
        .join("\n");
    case "quote":
      return b.text
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n");
    case "callout":
      return `${b.tone === "warning" ? "Important: " : "Note: "}${b.text}`;
  }
}

function renderText(c: EmailContent, t: TemplateContext): string {
  const blocks = c.blocks.filter((b): b is Block => !!b);
  const parts: string[] = [];
  if (c.heading) parts.push(c.heading);
  if (c.greeting) parts.push(c.greeting);
  for (const b of blocks) {
    const s = blockText(b);
    if (s) parts.push(s);
  }
  if (c.signoff?.length) parts.push(c.signoff.join("\n"));
  if (c.trailer) parts.push(c.trailer);
  const footer = [
    c.footer.sentOnBehalfOf
      ? `Sent on behalf of ${c.footer.sentOnBehalfOf} with ${PRODUCT_NAME} · Operated by ${OPERATOR_NAME}`
      : `${PRODUCT_NAME} · Operated by ${OPERATOR_NAME}`,
    c.footer.reason,
    `Privacy policy: ${t.privacyUrl}`,
    ...(c.footer.manageNotificationsUrl
      ? [`Manage notifications: ${c.footer.manageNotificationsUrl}`]
      : []),
    ...(c.footer.unsubscribeUrl ? [`Unsubscribe: ${c.footer.unsubscribeUrl}`] : []),
    ...(c.footer.postalAddress ? [c.footer.postalAddress] : []),
  ];
  parts.push(`--\n${footer.join("\n")}`);
  return `${parts.join("\n\n")}\n`;
}

// ---- HTML ------------------------------------------------------------------------------------

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  text: "#0f172a",
  muted: "#475569",
  brand: "#1d4ed8",
  border: "#e2e8f0",
  page: "#f1f5f9",
  card: "#ffffff",
  quoteBg: "#f8fafc",
  quoteBorder: "#cbd5e1",
};
const TONES = {
  warning: { bg: "#fef3c7", border: "#b45309", text: "#78350f" },
  info: { bg: "#eff6ff", border: "#1d4ed8", text: "#1e3a8a" },
};

/** Escape, then keep the author's line breaks. */
const multiline = (s: string) => escapeHtml(s).replace(/\r?\n/g, "<br>");

const textStyle = (size = 16, line = 24, color = C.text) =>
  `font-family:${FONT};font-size:${size}px;line-height:${line}px;color:${color};`;

function anchor(label: string, url: string, style = ""): string {
  const href = safeHref(url);
  if (!href) return escapeHtml(label);
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:${C.brand};text-decoration:underline;${style}">${escapeHtml(label)}</a>`;
}

function listItemHtml(item: ListItem): string {
  if (typeof item === "string") return multiline(item);
  const main = item.url ? anchor(item.text, item.url) : escapeHtml(item.text);
  const detail = item.detail
    ? ` <span style="color:${C.muted};">· ${escapeHtml(item.detail)}</span>`
    : "";
  return `${main}${detail}`;
}

function blockHtml(b: Block): string {
  switch (b.type) {
    case "paragraph":
      return `<p style="margin:0 0 16px;${textStyle()}">${multiline(b.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;${textStyle(13, 20, C.muted)}">${multiline(b.text)}</p>`;
    case "heading":
      return `<h2 style="margin:24px 0 8px;${textStyle(17, 24)}font-weight:bold;">${escapeHtml(b.text)}</h2>`;
    case "link":
      return `<p style="margin:0 0 16px;${textStyle(15, 22)}">${anchor(b.label, b.url)}</p>`;
    case "button": {
      const href = safeHref(b.url);
      if (!href) {
        return `<p style="margin:0 0 16px;${textStyle()}">${escapeHtml(b.label)}: ${escapeHtml(b.url)}</p>`;
      }
      const h = escapeHtml(href);
      const button =
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:separate;"><tr>` +
        `<td align="center" bgcolor="${C.brand}" style="border-radius:6px;background-color:${C.brand};mso-padding-alt:12px 22px;">` +
        `<a href="${h}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(b.label)}</a>` +
        "</td></tr></table>";
      const fallback = b.showUrl
        ? `<p style="margin:0 0 16px;${textStyle(13, 20, C.muted)}">If the button doesn't work, copy and paste this link into your browser:<br><a href="${h}" target="_blank" rel="noopener noreferrer" style="color:${C.brand};text-decoration:underline;word-break:break-all;">${escapeHtml(href)}</a></p>`
        : "";
      return button + fallback;
    }
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      const items = b.items
        .map((it) => `<li style="margin:0 0 8px;${textStyle()}">${listItemHtml(it)}</li>`)
        .join("");
      return `<${tag} style="margin:0 0 16px;padding:0 0 0 24px;${textStyle()}">${items}</${tag}>`;
    }
    case "details": {
      const rows = b.rows
        .filter((r) => r.value)
        .map(
          (r) =>
            `<tr><th scope="row" align="left" valign="top" style="padding:8px 12px 8px 0;width:38%;border-bottom:1px solid ${C.border};${textStyle(14, 20, C.muted)}font-weight:bold;">${escapeHtml(r.label)}</th>` +
            `<td valign="top" style="padding:8px 0;border-bottom:1px solid ${C.border};${textStyle(14, 20)}">${multiline(r.value ?? "")}</td></tr>`,
        )
        .join("");
      return rows
        ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border-collapse:collapse;">${rows}</table>`
        : "";
    }
    case "quote":
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;"><tr>` +
        `<td bgcolor="${C.quoteBg}" style="padding:12px 16px;background-color:${C.quoteBg};border-left:4px solid ${C.quoteBorder};${textStyle(15, 22, "#334155")}">${multiline(b.text)}</td>` +
        "</tr></table>"
      );
    case "callout": {
      const tone = TONES[b.tone ?? "info"];
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;"><tr>` +
        `<td bgcolor="${tone.bg}" style="padding:12px 16px;background-color:${tone.bg};border-left:4px solid ${tone.border};${textStyle(15, 22, tone.text)}">${multiline(b.text)}</td>` +
        "</tr></table>"
      );
    }
  }
}

function renderHtml(c: EmailContent, t: TemplateContext, subject: string): string {
  const blocks = c.blocks.filter((b): b is Block => !!b);
  const brand = c.brandName || PRODUCT_NAME;
  const body = [
    c.heading
      ? `<h1 style="margin:0 0 16px;${textStyle(22, 30)}font-weight:bold;">${escapeHtml(c.heading)}</h1>`
      : "",
    c.greeting ? `<p style="margin:0 0 16px;${textStyle()}">${escapeHtml(c.greeting)}</p>` : "",
    ...blocks.map(blockHtml),
    c.signoff?.length
      ? `<p style="margin:16px 0 16px;${textStyle()}">${c.signoff.map(escapeHtml).join("<br>")}</p>`
      : "",
    c.trailer ? blockHtml({ type: "note", text: c.trailer }) : "",
  ].join("");
  const productLine = c.footer.sentOnBehalfOf
    ? `Sent on behalf of ${escapeHtml(c.footer.sentOnBehalfOf)} with <strong>${PRODUCT_NAME}</strong> · Operated by ${OPERATOR_NAME}`
    : `<strong>${PRODUCT_NAME}</strong> · Operated by ${OPERATOR_NAME}`;
  const links = [
    anchor("Privacy policy", t.privacyUrl, `color:${C.muted};`),
    c.footer.manageNotificationsUrl
      ? anchor("Manage notifications", c.footer.manageNotificationsUrl, `color:${C.muted};`)
      : "",
    c.footer.unsubscribeUrl
      ? anchor("Unsubscribe", c.footer.unsubscribeUrl, `color:${C.muted};`)
      : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");
  const footer =
    `<p style="margin:0 0 8px;${textStyle(12, 18, C.muted)}">${productLine}</p>` +
    `<p style="margin:0 0 8px;${textStyle(12, 18, C.muted)}">${escapeHtml(c.footer.reason)}</p>` +
    `<p style="margin:0;${textStyle(12, 18, C.muted)}">${links}</p>` +
    (c.footer.postalAddress
      ? `<p style="margin:8px 0 0;${textStyle(12, 18, C.muted)}">${escapeHtml(c.footer.postalAddress)}</p>`
      : "");
  const preheader = c.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page};">${escapeHtml(c.preheader)}</div>`
    : "";

  return [
    "<!DOCTYPE html>",
    '<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(subject)}</title>`,
    "<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->",
    "</head>",
    `<body style="margin:0;padding:0;width:100%;background-color:${C.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">`,
    preheader,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">`,
    `<tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:8px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `<tr><td style="padding:20px 32px;border-bottom:1px solid ${C.border};${textStyle(16, 24, C.brand)}font-weight:bold;">${escapeHtml(brand)}</td></tr>`,
    `<tr><td style="padding:28px 32px 16px;" role="article" aria-roledescription="email" aria-label="${escapeHtml(subject)}">${body}</td></tr>`,
    "</table>",
    "</td></tr>",
    `<tr><td style="padding:20px 32px 8px;">${footer}</td></tr>`,
    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function renderContent(content: EmailContent, t: TemplateContext): RenderedEmail {
  const subject = cleanSubject(content.subject);
  return { subject, text: renderText(content, t), html: renderHtml(content, t, subject) };
}
