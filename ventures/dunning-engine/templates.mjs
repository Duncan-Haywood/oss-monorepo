// Plain-text dunning emails. Neutral on purpose: no mention of "stolen",
// "fraud" or other issuer reasons, because the customer may be the victim and
// the decline reason is the bank's, not ours. {{placeholders}} are filled by
// renderEmail; unknown placeholders are left visible so a typo is noticed.

const FOOT = "\n\n{{company}}\n{{address}}";

const BODY = {
  first: {
    subject: "Your payment for {{company}} didn't go through",
    text: "Hi {{name}},\n\nWe couldn't collect {{amount}} for your {{company}} subscription.\n\nUpdate your payment method here and we'll try again right away:\n{{update_url}}\n\nIf you've already sorted this out, you can ignore this email.",
  },
  reminder: {
    subject: "Reminder: please update your payment method",
    text: "Hi {{name}},\n\nYour {{amount}} payment for {{company}} is still unpaid. To keep your access without interruption, please update your payment method:\n{{update_url}}",
  },
  final: {
    subject: "Final notice: {{company}} access ends {{deadline}}",
    text: "Hi {{name}},\n\nThis is the last reminder about your unpaid {{amount}}. Unless the payment is updated by {{deadline}}, your subscription will be ended.\n\nUpdate your payment method:\n{{update_url}}",
  },
};

const AUTH = {
  first: {
    subject: "Your bank needs you to confirm a payment to {{company}}",
    text: "Hi {{name}},\n\nYour bank asked you to confirm the {{amount}} payment for {{company}}. We can't do this for you; it takes a minute on your side:\n{{update_url}}",
  },
};

const EXPIRING = {
  subject: "Your card ending {{last4}} {{expiry_phrase}}",
  text: "Hi {{name}},\n\nThe {{brand}} card ending {{last4}} that pays for your {{company}} subscription {{expiry_phrase}}. To avoid a failed payment at your next renewal, please add a new card:\n{{update_url}}\n\nIf you've already done this, you can ignore this email.",
};

export function templateFor(name) {
  if (name === "expiring") return EXPIRING;
  const [cls, stage] = name.split("-");
  if (cls === "auth") return stage === "first" ? AUTH.first : { ...BODY[stage], text: BODY[stage].text.replace("update your payment method", "confirm the payment with your bank") };
  return BODY[stage] || BODY.reminder;
}

export function renderEmail(name, vars) {
  const t = templateFor(name);
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] === undefined || vars[k] === null || vars[k] === "" ? m : String(vars[k])));
  return { subject: fill(t.subject), text: fill(t.text + FOOT) };
}
