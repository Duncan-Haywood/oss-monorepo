// Turns a finished bid into the document the contractor actually hands the
// customer: a one-page proposal they can print or "Save as PDF" from the
// browser.
//
// Why this exists
// ---------------
// Every bid calculator in this portfolio already ends at a number and a
// plain-text blurb to paste somewhere. That is where the tool stops and the
// contractor's evening starts: retyping the scope into Word, remembering the
// deposit split, guessing how long the price should stand. The proposal is the
// thing that wins or loses the job, and it was the one artifact none of these
// tools produced.
//
// Deliberately NOT a contract
// ---------------------------
// This renders the contractor's own words and numbers into a tidy layout. It
// invents no legal terms, warranties, lien language, or cancellation rights —
// every clause on the page is text the user typed or left blank. A "proposal"
// that shipped boilerplate terms drafted by a calculator would be exactly the
// legal exposure `PRODUCT_PLAYBOOK.md` §5b tells us to avoid, and it would be
// wrong in most jurisdictions anyway.
//
// Privacy
// -------
// `loadCompany` / `saveCompany` persist the *contractor's own* business block
// (their name, phone, licence) so they type it once. The customer's name and
// address are never persisted: that is a third party's personal data sitting on
// someone else's device, and re-typing it per job is cheap. Nothing here
// touches the network.
//
// This file is generic on purpose — no trade, no venture, no storage key baked
// in — so it can be copied verbatim into any calculator in `ventures/`. See the
// venture README for the wiring steps.

/** Fields of the contractor's own business block, in display order. */
export const COMPANY_FIELDS = Object.freeze([
  'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
]);

/** Fields describing the customer and the job. Never persisted. */
export const CLIENT_FIELDS = Object.freeze([
  'clientName', 'clientAddress',
]);

/** Commercial terms the contractor controls. */
export const TERM_FIELDS = Object.freeze([
  'depositPercent', 'validDays', 'paymentTerms', 'proposalNotes', 'proposalExclusions',
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value) {
  return String(value ?? '').trim();
}

function number(value, name, { min = 0, max = Infinity } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Split a textarea into trimmed, non-empty lines. Blank lines are how people
 * space out a scope list; they should not become empty bullets.
 */
export function lines(value) {
  return text(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * `YYYY-MM-DD` plus a whole number of days, in UTC.
 *
 * Local-time date arithmetic silently shifts by a day across a DST boundary,
 * which on a quote-expiry date is a real dispute with a customer.
 */
export function addDays(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(isoDate));
  if (!match) throw new Error('Issue date must be YYYY-MM-DD');
  const [, year, month, day] = match;
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(stamp)) throw new Error('Issue date must be a real date');
  return new Date(stamp + number(days, 'Valid days') * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** `2026-08-26` → `26 August 2026`. Unambiguous to both US and non-US readers. */
export function formatDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(isoDate));
  if (!match) return text(isoDate);
  const [, year, month, day] = match;
  const monthName = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${Number(day)} ${monthName} ${year}`;
}

/**
 * A short, stable reference the contractor and the customer can both quote on
 * the phone. Derived from the issue date and the customer name so that
 * re-printing the same proposal gives the same number, and two proposals
 * written the same day for different customers do not collide.
 */
export function referenceFor(issuedOn, clientName) {
  const compact = text(issuedOn).replaceAll('-', '');
  let hash = 0;
  for (const character of text(clientName).toUpperCase()) {
    hash = (hash * 31 + character.codePointAt(0)) % 1_048_576;
  }
  return `Q-${compact}-${hash.toString(36).toUpperCase().padStart(4, '0').slice(-4)}`;
}

/**
 * Assemble and validate a proposal.
 *
 * Throws on the things that would embarrass the contractor in front of a
 * customer — no business name, no customer name, a zero price, a deposit over
 * 100% — rather than rendering a document with a hole in it.
 */
export function buildProposal(input = {}) {
  const companyName = text(input.companyName);
  if (!companyName) throw new Error('Add your business name before printing a proposal');
  const clientName = text(input.clientName);
  if (!clientName) throw new Error('Add the customer name before printing a proposal');

  const price = number(input.price, 'Price', { min: 0 });
  if (price <= 0) throw new Error('Price a job before printing a proposal');

  const depositPercent = number(input.depositPercent ?? 0, 'Deposit', { min: 0, max: 100 });
  const validDays = number(input.validDays ?? 0, 'Valid days', { min: 0, max: 3650 });
  const issuedOn = text(input.issuedOn) || new Date().toISOString().slice(0, 10);

  // Rounded to cents here, not at display time, and the balance taken as the
  // remainder. The customer adds the two lines up: if the deposit rounds up and
  // the balance rounds down independently, the printed figures miss the printed
  // total by a cent, and the contractor has to explain it on the phone.
  const depositAmount = Math.round(price * depositPercent) / 100;

  return {
    reference: referenceFor(issuedOn, clientName),
    issuedOn,
    validDays,
    validUntil: validDays === 0 ? null : addDays(issuedOn, validDays),
    company: {
      name: companyName,
      phone: text(input.companyPhone),
      email: text(input.companyEmail),
      license: text(input.companyLicense),
      address: text(input.companyAddress),
    },
    client: {
      name: clientName,
      address: text(input.clientAddress),
    },
    job: {
      title: text(input.jobTitle) || 'Proposed work',
      scope: lines(input.scope),
      exclusions: lines(input.proposalExclusions),
      notes: text(input.proposalNotes),
    },
    pricing: {
      price,
      depositPercent,
      depositAmount,
      balanceAmount: price - depositAmount,
      paymentTerms: text(input.paymentTerms),
    },
  };
}

function block(title, body) {
  return body ? `<div class="pr-block"><h3>${escapeHtml(title)}</h3>${body}</div>` : '';
}

function list(items) {
  return items.length === 0
    ? ''
    : `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function paragraphs(value) {
  return value ? `<p>${escapeHtml(value).replaceAll('\n', '<br>')}</p>` : '';
}

/**
 * Render the proposal as the HTML that goes inside the page's print container.
 *
 * Returns a fragment, not a whole document: the page owns the print stylesheet,
 * so the same markup is what the contractor previews on screen and what comes
 * out of the printer. A separate print-only document is how the two drift.
 *
 * @param {ReturnType<typeof buildProposal>} proposal
 * @param {object} [options]
 * @param {string} [options.disclaimer] Sentence to print in the footer. The
 *   caller supplies it so each trade can name its own regulator and scope.
 */
export function renderProposalHtml(proposal, { disclaimer = '' } = {}) {
  const { company, client, job, pricing } = proposal;

  const contact = [company.phone, company.email, company.address]
    .filter(Boolean)
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join('');

  const validity = proposal.validUntil
    ? `<p class="pr-validity">This price is held until <strong>${escapeHtml(formatDate(proposal.validUntil))}</strong> (${proposal.validDays} days from issue).</p>`
    : '';

  const depositRow = pricing.depositPercent > 0
    ? `<tr><td>Deposit due on acceptance (${pricing.depositPercent}%)</td><td>${money(pricing.depositAmount)}</td></tr>
       <tr><td>Balance due on completion</td><td>${money(pricing.balanceAmount)}</td></tr>`
    : '';

  return `
    <article class="pr-doc">
      <header class="pr-head">
        <div>
          <h2>${escapeHtml(company.name)}</h2>
          <div class="pr-contact">${contact}</div>
          ${company.license ? `<p class="pr-license">Licence ${escapeHtml(company.license)}</p>` : ''}
        </div>
        <div class="pr-meta">
          <p class="pr-kicker">Proposal</p>
          <p><strong>${escapeHtml(proposal.reference)}</strong></p>
          <p>${escapeHtml(formatDate(proposal.issuedOn))}</p>
        </div>
      </header>

      <div class="pr-parties">
        <div class="pr-block"><h3>Prepared for</h3>
          <p><strong>${escapeHtml(client.name)}</strong></p>
          ${paragraphs(client.address)}
        </div>
        <div class="pr-block"><h3>Work</h3>
          <p><strong>${escapeHtml(job.title)}</strong></p>
        </div>
      </div>

      ${block('Scope of work', list(job.scope))}
      ${block('Not included', list(job.exclusions))}
      ${block('Notes', paragraphs(job.notes))}

      <table class="pr-price">
        <tbody>
          <tr class="pr-total"><td>Total price</td><td>${money(pricing.price)}</td></tr>
          ${depositRow}
        </tbody>
      </table>
      ${validity}
      ${block('Payment terms', paragraphs(pricing.paymentTerms))}

      <div class="pr-sign">
        <div><span class="pr-rule"></span><p>Customer signature</p></div>
        <div><span class="pr-rule"></span><p>Date</p></div>
      </div>

      ${disclaimer ? `<p class="pr-disclaimer">${escapeHtml(disclaimer)}</p>` : ''}
    </article>
  `;
}

/**
 * Read the saved business block. A corrupt or absent entry is an empty block,
 * never an exception: a broken localStorage value must not stop someone
 * pricing a job.
 */
export function loadCompany(storage, key) {
  try {
    const saved = JSON.parse(storage?.getItem(key) || '{}');
    return Object.fromEntries(
      COMPANY_FIELDS.map((field) => [field, text(saved?.[field])]),
    );
  } catch {
    return Object.fromEntries(COMPANY_FIELDS.map((field) => [field, '']));
  }
}

/**
 * Persist the business block only. `CLIENT_FIELDS` are excluded by
 * construction, not by the caller remembering to strip them.
 */
export function saveCompany(storage, key, values = {}) {
  const payload = Object.fromEntries(
    COMPANY_FIELDS.map((field) => [field, text(values[field])]),
  );
  try {
    storage?.setItem(key, JSON.stringify(payload));
  } catch {
    // A full or disabled localStorage is not worth an error in front of the
    // customer; the proposal still prints, it just will not be pre-filled next
    // time.
  }
  return payload;
}

export function forgetCompany(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Same reasoning as saveCompany.
  }
}
