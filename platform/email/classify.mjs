// Rule-based triage that runs on every message as it arrives: a category for
// sorting, and the reasons (if any) a person must see it instead of an
// automatic answer. Software for the routine, agents for judgment
// (`prompts/goals.md`): an agent can re-label a message afterwards
// (`POST /api/messages/:id/classify`) and add flags, but a flag these rules
// set can only be cleared by the owner (service.mjs, `resolveFlag`).
//
// The patterns err towards flagging. A false flag costs the owner one email;
// a missed one can mean an agent answering a lawyer.

export const CATEGORIES = Object.freeze(['support', 'billing', 'lead', 'vendor_notice', 'spam', 'other']);

const FLAG_RULES = Object.freeze({
  legal: /\b(lawyers?|attorneys?|solicitors?|lawsuit|legal action|litigation|sue (you|your)|cease and desist|subpoena|court order|summons|dmca|takedown notice|infring\w*|trademark|copyright claim|regulator|ombudsman|small claims)\b/i,
  refund: /\b(refunds?|refunded|money back|reimburse\w*|cancel and refund|charged twice|double[- ]charged|overcharged)\b/i,
  chargeback: /\b(chargebacks?|disputed? (the |a |this )?(charge|payment|transaction)|payment dispute|friendly fraud)\b/i,
  security: /\b(vulnerabilit\w+|security (issue|flaw|hole|bug|report|incident)|exploit\w*|xss|csrf|sql injection|rce|cve-\d{4}-\d+|data breach|breached|hacked|compromised|leaked|exposed (keys?|credentials|data)|responsible disclosure|bug bounty|account takeover)\b/i,
  human_request: /\b((speak|talk|chat) (to|with) (a |an |the )?(real |actual )?(human|person|someone|manager|owner|founder)|real (human|person)|human (being|please|support)|not a (bot|robot|machine)|are you (a )?(bot|ai|robot)|escalate|complaint)\b/i,
  data_request: /\b(delete (my|all my|our) (data|account|information|details|personal)|erase my|right to (be forgotten|erasure|access)|data (access|subject|deletion) request|subject access request|dsar|gdpr request|ccpa|cpra|opt[- ]out of (sale|sharing)|what data do you (have|hold))\b/i,
});

const VENDOR_DOMAINS = /(^|\.)(paddle\.com|paddle\.net|apple\.com|itunes\.com|google\.com|play\.google\.com|stripe\.com|cloudflare\.com|github\.com|amazonaws\.com|aws\.amazon\.com|hetzner\.com|resend\.com|lemonsqueezy\.com)$/i;

const SPAM_WORDS = /\b(seo services|backlinks?|guest post|link insertion|rank (your|you) (site|website)|crypto(currency)? (investment|opportunity)|bitcoin opportunity|forex|casino|viagra|cialis|loan offer|dear (sir|madam|sir\/madam)|beneficiary|inheritance|lottery|you have won|wire transfer urgently|web design services|app development services at)\b/i;
const LEAD_WORDS = /\b(pricing|price|quote|demo|trial|interested in|sign up|purchase|buy|subscribe|enterprise|partnership|partner with|integrat\w+ with|how much|per seat|per user|onboard\w*)\b/i;
const BILLING_WORDS = /\b(invoice|receipt|payment|charged?|subscription|billing|plan|vat|tax id|payout|renewal|card (was )?declined|upgrade|downgrade)\b/i;

function domainOf(addr = '') {
  return String(addr).split('@')[1]?.toLowerCase() || '';
}

/** Did SPF, DKIM and DMARC all fail by the receiving server's own account? */
export function authFailed(authResults = '') {
  const a = String(authResults).toLowerCase();
  return /dmarc=fail/.test(a) || (/spf=(fail|softfail)/.test(a) && !/dkim=pass/.test(a));
}

/**
 * Classify a parsed message (mime.mjs `parseMessage`) arriving at `inbox`
 * (an entry of inboxes.json). Returns `{ category, flags, why }`:
 * `flags` lists the owner-flag reasons that matched and are enabled in
 * `flagReasons` (inboxes.yaml `flag_to_owner`), plus `inbox` when the inbox
 * flags everything.
 */
export function classify(msg, inbox = {}, flagReasons = Object.keys(FLAG_RULES)) {
  const text = `${msg.subject || ''}\n${(msg.text || '').slice(0, 20000)}`;
  const why = [];
  const flags = [];
  for (const reason of flagReasons) {
    const re = FLAG_RULES[reason];
    const m = re && re.exec(text);
    if (m) { flags.push(reason); why.push(`${reason}: "${m[0].slice(0, 60)}"`); }
  }
  if (inbox.flag_all) { flags.push('inbox'); why.push(`inbox: ${inbox.local}@ flags every message`); }

  let category;
  const fromDomain = domainOf(msg.from);
  if (inbox.local === 'dmarc') category = 'vendor_notice';
  else if (SPAM_WORDS.test(text) || (authFailed(msg.authResults) && !VENDOR_DOMAINS.test(fromDomain))) category = 'spam';
  else if (VENDOR_DOMAINS.test(fromDomain) || msg.automated) category = 'vendor_notice';
  else if (BILLING_WORDS.test(text) && (inbox.owner === 'billing' || flags.includes('refund') || flags.includes('chargeback'))) category = 'billing';
  else if (inbox.owner === 'sales' || (LEAD_WORDS.test(text) && !/\b(error|bug|broken|doesn'?t work|not working|crash|help)\b/i.test(text))) category = 'lead';
  else if (BILLING_WORDS.test(text)) category = 'billing';
  else if (['portfolio', 'distribution', 'platform', 'legal', 'security'].includes(inbox.owner) && inbox.local !== 'support') category = 'other';
  else category = 'support';
  why.push(`category: ${category}`);
  return { category, flags: [...new Set(flags)], why };
}

export const FLAG_REASONS = Object.freeze(Object.keys(FLAG_RULES));
