// Chargeback evidence rules, deadline arithmetic, and draft assembly.
//
// Why this is a module
// --------------------
// All of this used to live inline in `index.html`, which meant the only thing a
// test could do was match the page source with a regular expression. Those
// assertions pass on markup that never runs and fail on a rename that changes
// nothing, so they proved the file's spelling rather than the tool's answer.
// The logic a seller depends on — which records their dispute reason actually
// needs, and how many days are left — is here so it can be exercised directly.
//
// The rules below describe evidence categories that card networks and
// processors commonly ask for by reason code. They are a starting checklist,
// not a determination: processors differ, reason codes are re-mapped, and the
// bank decides. Nothing here predicts an outcome, and the wording in the draft
// keeps it that way.

export const EVIDENCE_LABELS = {
  order: 'Order confirmation or invoice',
  payment: 'Payment authorization record',
  address: 'Billing and shipping address match',
  fulfillment: 'Fulfillment or packing record',
  tracking: 'Carrier tracking showing delivery',
  contact: 'Customer support correspondence',
  refund: 'Refund or cancellation record',
  terms: 'Terms accepted at checkout',
  listing: 'Product description or listing as shown at purchase',
  photos: 'Photos or condition record of the item shipped',
  avs: 'AVS and CVV verification result',
  device: 'Device, IP, or account login record',
  history: 'Prior undisputed orders from the same customer',
};

export const EVIDENCE_KEYS = Object.keys(EVIDENCE_LABELS);

/**
 * Per-reason evidence rules.
 *
 * `required` is the set a response is usually built around; a packet missing
 * one of these has a hole a reviewer will notice. `recommended` strengthens the
 * same response but its absence is not by itself a gap — separating the two
 * matters because a flat list trains sellers to ignore all of it.
 */
export const DISPUTE_REASONS = {
  'Merchandise not received': {
    required: ['order', 'payment', 'fulfillment', 'tracking'],
    recommended: ['contact', 'terms', 'address'],
    focus:
      'The question is whether the goods or services reached the buyer. Delivery evidence tied to this specific order carries the response.',
  },
  'Credit not processed': {
    required: ['order', 'payment', 'refund', 'contact'],
    recommended: ['terms'],
    focus:
      'The question is whether a promised refund or cancellation was actually issued, or whether the policy the buyer agreed to did not entitle them to one.',
  },
  'Merchandise not as described': {
    required: ['order', 'listing', 'contact', 'terms'],
    recommended: ['fulfillment', 'photos', 'tracking', 'refund'],
    focus:
      'The question is what the buyer was shown before paying. The listing as it stood at purchase, and what was said afterwards, carry the response.',
  },
  'Fraudulent transaction': {
    required: ['payment', 'avs', 'address', 'tracking'],
    recommended: ['device', 'history', 'contact', 'terms'],
    focus:
      'The question is whether the cardholder authorized the purchase. Verification results and delivery to the verified address carry the response.',
  },
  'Duplicate transaction': {
    required: ['order', 'payment'],
    recommended: ['contact', 'history'],
    focus:
      'The question is whether the cardholder was legitimately charged twice for two separate purchases, not once for one. Order and payment records tying each charge to its own distinct order carry the response.',
  },
  'Subscription canceled': {
    required: ['terms', 'contact', 'payment'],
    recommended: ['refund', 'history'],
    focus:
      'The question is whether the recurring charge was still authorized when it posted, and whether the buyer canceled through the agreed process. The subscription terms accepted at signup and any cancellation contact carry the response.',
  },
  'Incorrect amount': {
    required: ['order', 'payment', 'terms'],
    recommended: ['contact'],
    focus:
      'The question is whether the amount charged matches what the buyer agreed to pay. The order total as originally agreed and the terms accepted at checkout carry the response.',
  },
};

export const REASONS = Object.keys(DISPUTE_REASONS);

const FALLBACK_RULE = {
  required: ['order', 'payment'],
  recommended: ['contact', 'terms'],
  focus:
    `This reason is not one of the ${REASONS.length} the checklist knows. Confirm the records your processor asks for on this reason code.`,
};

export function rulesFor(reason) {
  return DISPUTE_REASONS[reason] ?? FALLBACK_RULE;
}

export function labelFor(key) {
  return EVIDENCE_LABELS[key] ?? key;
}

/**
 * Compare the records a seller says they hold against the rule for their reason.
 * Unknown keys in `checked` are ignored rather than counted, so a stale saved
 * draft from an older version of the page cannot inflate the total.
 */
export function evidenceReview(reason, checked = []) {
  const rule = rulesFor(reason);
  const held = new Set(checked.filter((key) => key in EVIDENCE_LABELS));
  const missingRequired = rule.required.filter((key) => !held.has(key));
  const missingRecommended = rule.recommended.filter((key) => !held.has(key));
  return {
    reason,
    focus: rule.focus,
    required: rule.required,
    recommended: rule.recommended,
    held: [...held],
    missingRequired,
    missingRecommended,
    complete: missingRequired.length === 0,
  };
}

/**
 * Whole days from `today` to `deadline`, both read as calendar dates in the
 * viewer's own timezone. Deadlines are published as dates, not instants, so
 * comparing them as instants would move the answer by a day either side of UTC.
 */
export function daysUntil(deadline, today = new Date()) {
  if (!deadline) return null;
  const target = Date.parse(`${deadline}T00:00:00`);
  if (Number.isNaN(target)) return null;
  const start = new Date(today).setHours(0, 0, 0, 0);
  return Math.round((target - start) / 86400000);
}

export function deadlineStatus(deadline, today = new Date()) {
  const days = daysUntil(deadline, today);
  if (days === null) {
    return {
      state: 'unknown',
      days: null,
      note: 'No processor deadline entered. Check the merchant account before treating this packet as ready.',
    };
  }
  if (days < 0) {
    return {
      state: 'past',
      days,
      note: 'The entered deadline is in the past. Contact the processor immediately and verify whether submission is still possible.',
    };
  }
  if (days === 0) {
    return {
      state: 'today',
      days,
      note: "The entered deadline is today. Prioritize review and confirm the processor's local cutoff time.",
    };
  }
  if (days <= 3) {
    return {
      state: 'urgent',
      days,
      note: `The entered deadline is ${days} day${days === 1 ? '' : 's'} away. Gather anything still missing today and confirm the processor's local cutoff time.`,
    };
  }
  return {
    state: 'ahead',
    days,
    note: `The entered deadline is ${days} days away. Confirm the processor's local cutoff time.`,
  };
}

/** Order IDs become filenames, so strip anything a filesystem or shell reads. */
export function safeFileStem(value, fallback = 'draft') {
  return (
    String(value ?? '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  );
}

/**
 * The text a seller submits.
 *
 * Deliberately does not mention gaps. The on-screen review and the working
 * notes list what is still missing because the seller needs to know; putting
 * that list in the submitted response would hand the issuer an inventory of
 * everything the seller could not produce.
 */
export function buildDraft({ order, reason, amount, deadline, facts, checked = [] }) {
  const attached = checked.filter((key) => key in EVIDENCE_LABELS);
  const lines = attached.length
    ? attached.map((key) => `- ${labelFor(key)}`).join('\n')
    : '- [list each attached record]';
  return [
    'Chargeback response draft',
    '',
    `Order: ${order}`,
    `Dispute reason: ${reason}`,
    `Order amount: ${amount}`,
    `Processor deadline entered: ${deadline || '[confirm in processor account]'}`,
    '',
    'Factual timeline',
    facts,
    '',
    'Evidence attached',
    lines,
    '',
    "I have reviewed the attached records for accuracy and submit them for consideration under the processor's dispute process. Please contact me through the merchant account if more information is required.",
    '',
    'Review before submitting: confirm the deadline, redact unnecessary personal data, and attach the original records rather than relying on this draft.',
  ].join('\n');
}

/**
 * Assemble everything the page shows and exports from raw field values.
 * Placeholders stand in for blank fields so the draft reads as a template with
 * obvious holes rather than as a finished letter with silent ones.
 */
export function buildPacket(input, today = new Date()) {
  const order = String(input.order ?? '').trim() || '[order ID]';
  const reason = input.reason ?? REASONS[0];
  const amount = String(input.amount ?? '').trim() || '[amount]';
  const deadline = input.deadline ?? '';
  const facts = String(input.facts ?? '').trim() || '[add the factual timeline]';
  const checked = (input.checked ?? []).filter((key) => key in EVIDENCE_LABELS);

  const review = evidenceReview(reason, checked);
  const deadlineInfo = deadlineStatus(deadline, today);
  const draft = buildDraft({ order, reason, amount, deadline, facts, checked });

  return {
    orderId: order,
    disputeReason: reason,
    orderDate: input.date ?? '',
    amount,
    processorDeadline: deadline,
    evidence: checked,
    facts,
    focus: review.focus,
    requiredEvidence: review.required.map(labelFor),
    recommendedEvidence: review.recommended.map(labelFor),
    missingEvidence: review.missingRequired.map(labelFor),
    missingRecommended: review.missingRecommended.map(labelFor),
    complete: review.complete,
    deadlineState: deadlineInfo.state,
    deadlineDays: deadlineInfo.days,
    deadlineNote: deadlineInfo.note,
    draft,
  };
}

/**
 * The downloadable working file. The submitted draft and the seller's own notes
 * are separated by an explicit heading because the two have opposite audiences
 * and the file used to run them together.
 */
export function buildWorkingNotes(packet) {
  const gaps = packet.missingEvidence.length
    ? `Still to gather (required for this reason): ${packet.missingEvidence.join(', ')}.`
    : 'Every record this checklist treats as core for this reason is marked as held.';
  const extra = packet.missingRecommended.length
    ? `Would strengthen the response: ${packet.missingRecommended.join(', ')}.`
    : 'No further strengthening records are suggested for this reason.';
  return [
    'Chargeback evidence packet',
    '',
    '=== RESPONSE DRAFT — this is the part you submit ===',
    '',
    packet.draft,
    '',
    '=== WORKING NOTES — for you, do not submit ===',
    '',
    `Dispute reason: ${packet.disputeReason}`,
    `What the issuer is deciding: ${packet.focus}`,
    gaps,
    extra,
    packet.deadlineNote,
    '',
    "Review reminder: This packet is a draft assembled from seller-provided facts. Verify every record and submit it through the processor's process. It is not legal, financial, or payment-dispute advice and it does not predict a bank's decision.",
  ].join('\n');
}
