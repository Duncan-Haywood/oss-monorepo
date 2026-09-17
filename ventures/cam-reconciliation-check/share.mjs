// Shareable CAM reconciliation link.
//
// This tool exists for the conversation *after* the arithmetic: a tenant who
// thinks a statement is wrong, a property manager explaining why it is not.
// The page could already hand the sender a worksheet -- a .txt summary and a
// JSON review record -- but both are attachments, and an attachment is where
// the other side stops. They cannot change the rentable area to the figure in
// their own exhibit and watch the variance move; they can only read a number
// somebody else produced and take it or leave it.
//
// A link fixes exactly that. The recipient lands on the same eight inputs,
// already filled, and can push back on any one of them. That is the whole
// point of a reconciliation dispute, and it is also how this tool reaches a
// second user without any acquisition spend: the landlord who receives a
// tenant's link is now holding the calculator.
//
// The payload rides in the URL *fragment*, which browsers never send to a
// server, so the promise the rest of this venture makes -- no lease or expense
// data leaves the browser -- survives the feature. Anyone holding the link can
// read the figures, which is the same exposure as forwarding the worksheet.
//
// The transform is pure: no DOM, no storage, no network.

/**
 * The five figures `parseInputs` requires. Same ids `index.html` declares.
 *
 * All five are mandatory to the calculation, so any one of them going missing
 * in transit leaves the recipient's page on *its own* default for that field
 * rather than the sender's -- a $120,000 expense pool where the sender had
 * $312,000, with nothing visibly wrong. `decodeInputs` therefore treats them
 * as a group: see the comment there.
 */
export const STATEMENT_FIELD_IDS = Object.freeze([
  'annualExpenses',
  'rentableArea',
  'tenantArea',
  'billedAmount',
  'credits',
]);

/**
 * The optional occupancy gross-up trio.
 *
 * These are the fields where a partial link is genuinely dangerous rather than
 * merely incomplete, and the reason is asymmetric: `calc.mjs` reads a blank
 * gross-up field as a *default*, not as absent. Blank `variablePercent` means
 * 0% variable, and blank occupancies mean 100%. So a link carrying a 40%
 * variable share and 80% actual occupancy, whose `targetOccupancyPercent=95`
 * was lost to a truncating messaging app, does not fall back to "no gross-up"
 * -- it grosses the variable pool to a *100%* target, which is a larger
 * adjustment than the sender's lease allows and a larger variance than the
 * sender saw.
 *
 * They are therefore encoded and decoded atomically: if the sender touched any
 * of the three, all three ride explicitly (blanks written as their effective
 * defaults), and a payload missing or corrupting any one of them drops the
 * whole group back to no gross-up. Understating the adjustment when a link
 * arrives damaged is recoverable -- the recipient's own lease tells them the
 * clause exists. Overstating it silently is not.
 */
export const GROSS_UP_FIELD_IDS = Object.freeze([
  'variablePercent',
  'actualOccupancyPercent',
  'targetOccupancyPercent',
]);

/**
 * What each gross-up field means when the sender left it blank. Mirrors the
 * `blankToDefault` fallbacks in `calc.mjs`; they are the values that make the
 * clause a complete no-op.
 */
export const GROSS_UP_DEFAULTS = Object.freeze({
  variablePercent: 0,
  actualOccupancyPercent: 100,
  targetOccupancyPercent: 100,
});

export const FIELD_IDS = Object.freeze([...STATEMENT_FIELD_IDS, ...GROSS_UP_FIELD_IDS]);

// The usage checkbox is deliberately absent. Whether anonymous local counts
// are kept is the recipient's own choice about their own browser, and handing
// someone a link should not switch it either way on their behalf.

/** A statement figure: finite and not negative. Blank means "not entered". */
function statementNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * A percentage the calculation will accept.
 *
 * `variablePercent` is a share of the expense pool, so 0 is meaningful. The
 * two occupancy figures are divisors, so 0 is not -- `parseInputs` rejects it
 * and `reconcile` would divide by zero. The bounds here are the same ones
 * `parseInputs` enforces, so a link can never open the page on figures its own
 * validator would refuse.
 */
function percent(value, { allowZero }) {
  const result = statementNumber(value);
  if (result === null) return null;
  if (result > 100) return null;
  if (!allowZero && result <= 0) return null;
  return result;
}

function readGrossUp(inputs) {
  return {
    variablePercent: percent(inputs?.variablePercent, { allowZero: true }),
    actualOccupancyPercent: percent(inputs?.actualOccupancyPercent, { allowZero: false }),
    targetOccupancyPercent: percent(inputs?.targetOccupancyPercent, { allowZero: false }),
  };
}

/**
 * Does this input set describe a gross-up the sender actually engaged with?
 *
 * True as soon as any one of the three fields holds a usable value, not only
 * when the clause changes the answer. A sender who entered 40% variable and
 * left occupancy alone has still made a statement about the lease, and the
 * recipient should see it rather than an empty box.
 */
export function hasGrossUp(inputs) {
  const values = readGrossUp(inputs);
  return GROSS_UP_FIELD_IDS.some((id) => values[id] !== null);
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * Blank and unusable statement figures are omitted rather than sent as empty
 * strings, so the recipient keeps their own default for anything the sender
 * never filled in. The gross-up trio is all-or-nothing, with blanks written as
 * the effective defaults documented on `GROSS_UP_DEFAULTS` -- that is what
 * makes a damaged link detectable on the way back in.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of STATEMENT_FIELD_IDS) {
    const value = statementNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  if (hasGrossUp(inputs)) {
    const values = readGrossUp(inputs);
    for (const id of GROSS_UP_FIELD_IDS) {
      params.set(id, String(values[id] ?? GROSS_UP_DEFAULTS[id]));
    }
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Nothing here throws. A link truncated by a messaging app, hand-edited, or
 * carrying a key this page does not know should open the calculator on
 * whatever survived, not on an error page -- the recipient can always retype
 * the one field that did not make it, and cannot recover from a blank screen.
 *
 * The two grouping rules are the substance:
 *
 *  - a statement figure that arrives unusable is dropped on its own, because
 *    each is independently visible on the page and an obviously-empty
 *    "Tenant area" box asks the recipient a question; and
 *  - the gross-up trio is dropped entirely unless all three arrive valid,
 *    because a partial trio is invisible and biases the variance upward. See
 *    `GROSS_UP_FIELD_IDS`.
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of STATEMENT_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = statementNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }

  if (!GROSS_UP_FIELD_IDS.some((id) => params.has(id))) return inputs;
  const values = readGrossUp(Object.fromEntries(GROSS_UP_FIELD_IDS.map((id) => [id, params.get(id)])));
  if (GROSS_UP_FIELD_IDS.some((id) => values[id] === null)) return inputs;
  for (const id of GROSS_UP_FIELD_IDS) inputs[id] = values[id];
  return inputs;
}

/**
 * Build the shareable URL for a page location and an input set.
 *
 * Any existing query string is preserved and the fragment replaced, so a link
 * copied from a page that was itself opened from a link does not accumulate
 * payloads.
 */
export function shareUrl(location, inputs) {
  const origin = location?.origin ?? '';
  const pathname = location?.pathname ?? '';
  const search = location?.search ?? '';
  return `${origin}${pathname}${search}#${encodeInputs(inputs)}`;
}
