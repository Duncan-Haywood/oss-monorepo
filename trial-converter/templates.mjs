// Plain-text trial emails. {{placeholders}} are filled by renderEmail; unknown
// ones are left visible so a typo is noticed. Wording is deliberately factual
// about price and date: that is what the customer needs and what most
// consumer-protection rules about trial-to-paid conversions ask for.

const FOOT = "\n\n{{company}}\n{{address}}";

const T = {
  "ending-card": {
    subject: "Your {{company}} trial ends {{end_date}}",
    text: "Hi {{name}},\n\nYour free trial of {{company}} ends on {{end_date}}. After that, your card on file will be charged {{amount}} per {{interval}} unless you cancel first.\n\nManage or cancel your subscription any time:\n{{manage_url}}",
  },
  "addcard-first": {
    subject: "Keep using {{company}} after {{end_date}}",
    text: "Hi {{name}},\n\nYour free trial of {{company}} ends on {{end_date}}, and there's no payment method on your account yet. To carry on without interruption, add a card ({{amount}} per {{interval}}, charged only after the trial):\n{{manage_url}}\n\nIf {{company}} isn't for you, you don't need to do anything.",
  },
  "addcard-reminder": {
    subject: "Your {{company}} trial ends in 2 days",
    text: "Hi {{name}},\n\nA reminder: your trial ends on {{end_date}} and you haven't added a payment method. Add one to keep your account and your data ({{amount}} per {{interval}}):\n{{manage_url}}",
  },
  "addcard-final": {
    subject: "Last call: your {{company}} trial ends today",
    text: "Hi {{name}},\n\nYour trial ends today, {{end_date}}. Without a payment method your subscription will not continue. Add a card now to keep going ({{amount}} per {{interval}}):\n{{manage_url}}",
  },
  tips: {
    subject: "Getting the most from your {{company}} trial",
    text: "Hi {{name}},\n\nYou're about halfway through your {{company}} trial, which ends on {{end_date}}.{{tips_line}}\n\nReply to this email if anything is unclear; we read every one.",
  },
  extended: {
    subject: "We've extended your {{company}} trial",
    text: "Hi {{name}},\n\nWe've added {{extra_days}} more days to your {{company}} trial. It now ends on {{end_date}}. Add a card whenever you're ready ({{amount}} per {{interval}}):\n{{manage_url}}",
  },
};

export const TEMPLATE_NAMES = Object.keys(T);

export function templateFor(name) {
  const base = String(name).replace(/-x\d+$/, "");
  return T[base] || T["addcard-reminder"];
}

export function renderEmail(name, vars) {
  const t = templateFor(name);
  const v = { tips_line: "", ...vars };
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (v[k] === undefined || v[k] === null || v[k] === "" ? (k === "tips_line" ? "" : m) : String(v[k])));
  return { subject: fill(t.subject), text: fill(t.text + FOOT) };
}
