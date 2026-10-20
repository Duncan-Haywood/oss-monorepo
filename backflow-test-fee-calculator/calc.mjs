/**
 * Backflow-preventer annual test job quote, as deterministic functions with
 * no dependencies.
 *
 * The buyer: a licensed backflow-prevention device tester (often a plumber
 * or an independent tester certified through a state or ASSE program) who
 * tests RPZ, double-check, and PVB assemblies for commercial properties,
 * multi-unit residential, and irrigation systems -- required annually (or on
 * whatever cycle the local water utility sets) almost everywhere in the
 * United States. The recurring quoting problem this fixes: a single
 * property visit is rarely one device. A strip mall might have six devices
 * on six different fire lines and domestic services; an apartment complex
 * might have a dozen across its irrigation meters. Pricing that job by hand
 * -- first device at full price, every additional device on the same trip
 * at a reduced rate because the travel and setup cost is shared, a per-device
 * report-filing fee because most water utilities require a separate test
 * report submitted for *each* device, and a retest fee for whichever devices
 * fail -- is exactly the kind of five-line arithmetic that is easy to get
 * wrong under a truck bed clipboard and easy to get right with a tool.
 *
 * This is not the test itself and does not know a specific water utility's
 * required report form, its filing deadline, or its device-type
 * requirements -- those vary by state and by utility, and the calculator
 * says so on every result. It applies the tester's own fee schedule to the
 * job in front of them; it does not set that fee schedule and does not
 * determine whether a device passed or failed.
 *
 *   computeJobQuote(inputs)          -- full per-device breakdown and totals
 *                                        for one property visit.
 *   formatQuoteBreakdown(result)     -- the same breakdown as plain text, for
 *                                        pasting into an invoice or an email.
 */

export const SEVERITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low', INFO: 'info' };

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(n) {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * @param {{
 *   devices: Array<{label?: string, deviceType?: string, testFee: number, failed?: boolean}>,
 *   additionalDeviceDiscountPercent?: number,
 *   travelFee?: number,
 *   reportFilingFeePerDevice?: number,
 *   retestFee?: number,
 * }} input
 * @returns {{
 *   lineItems: Array<{label: string, deviceType: string, testFee: number, discountedFee: number, filingFee: number, retestFee: number, lineTotal: number, failed: boolean}>,
 *   deviceCount: number,
 *   failedCount: number,
 *   subtotalTesting: number,
 *   discountSaved: number,
 *   subtotalFiling: number,
 *   subtotalRetest: number,
 *   travelFee: number,
 *   grandTotal: number,
 *   averagePerDevice: number,
 *   findings: Array<{id: string, severity: string, title: string, detail: string}>,
 * }}
 */
export function computeJobQuote({
  devices,
  additionalDeviceDiscountPercent = 0,
  travelFee = 0,
  reportFilingFeePerDevice = 0,
  retestFee = 0,
} = {}) {
  const discountPercent = nonNegativeNumber(additionalDeviceDiscountPercent, 0);
  const trip = nonNegativeNumber(travelFee, 0);
  const filingFeeEach = nonNegativeNumber(reportFilingFeePerDevice, 0);
  const retestFeeEach = nonNegativeNumber(retestFee, 0);

  const list = Array.isArray(devices) ? devices : [];
  const normalized = list
    .map((d, i) => ({
      label: typeof d?.label === 'string' && d.label.trim() ? d.label.trim() : `Device ${i + 1}`,
      deviceType: typeof d?.deviceType === 'string' && d.deviceType.trim() ? d.deviceType.trim() : 'other',
      testFee: positiveNumber(Number(d?.testFee)),
      failed: Boolean(d?.failed),
    }))
    .filter((d) => d.testFee > 0);

  const lineItems = normalized.map((d, i) => {
    // The multi-device discount only applies to devices *after* the first on
    // the same property visit -- the first device carries the full cost of
    // the trip, and every device beyond it shares travel and setup time that
    // is already paid for.
    const discountedFee = i === 0 ? d.testFee : round2(d.testFee * (1 - discountPercent / 100));
    const deviceRetestFee = d.failed ? retestFeeEach : 0;
    const lineTotal = round2(discountedFee + filingFeeEach + deviceRetestFee);
    return { ...d, discountedFee, filingFee: filingFeeEach, retestFee: deviceRetestFee, lineTotal };
  });

  const deviceCount = lineItems.length;
  const failedCount = lineItems.filter((d) => d.failed).length;
  const subtotalTesting = round2(lineItems.reduce((sum, d) => sum + d.discountedFee, 0));
  const fullPriceTesting = round2(lineItems.reduce((sum, d) => sum + d.testFee, 0));
  const discountSaved = round2(Math.max(0, fullPriceTesting - subtotalTesting));
  const subtotalFiling = round2(lineItems.reduce((sum, d) => sum + d.filingFee, 0));
  const subtotalRetest = round2(lineItems.reduce((sum, d) => sum + d.retestFee, 0));
  const grandTotal = round2(subtotalTesting + subtotalFiling + subtotalRetest + trip);
  const averagePerDevice = deviceCount > 0 ? round2(grandTotal / deviceCount) : 0;

  const findings = [];

  if (deviceCount === 0) {
    findings.push({
      id: 'no-devices',
      severity: SEVERITY.INFO,
      title: 'Add at least one device',
      detail: 'Add a row for each backflow assembly being tested on this property visit, with that device’s test fee.',
    });
    return {
      lineItems, deviceCount, failedCount, subtotalTesting, discountSaved, subtotalFiling,
      subtotalRetest, travelFee: trip, grandTotal, averagePerDevice, findings,
    };
  }

  if (deviceCount === 1 && discountPercent > 0) {
    findings.push({
      id: 'single-device-no-discount',
      severity: SEVERITY.INFO,
      title: 'Only one device on this visit -- the multi-device discount did not apply',
      detail: 'The additional-device discount only reduces the fee for devices past the first on the same property visit, since it reflects shared travel and setup time. Add more devices if this property has them.',
    });
  }

  if (deviceCount > 1 && discountPercent > 0) {
    findings.push({
      id: 'discount-applied',
      severity: SEVERITY.INFO,
      title: `${discountPercent}% additional-device discount saved ${money(discountSaved)} across ${deviceCount - 1} device(s)`,
      detail: 'Applied to every device after the first on this visit, since travel and setup time is already covered by the first device’s full fee.',
    });
  }

  if (failedCount > 0) {
    findings.push({
      id: 'failed-devices',
      severity: SEVERITY.MEDIUM,
      title: `${failedCount} of ${deviceCount} device(s) failed and are billed a retest fee`,
      detail: 'This assumes the retest happens on the same visit, at the retest fee entered, with no added travel charge. If a failed device needs a separate return trip, add a travel fee for that trip separately.',
    });
  }

  if (filingFeeEach > 0) {
    findings.push({
      id: 'filing-fee-applies-per-device',
      severity: SEVERITY.INFO,
      title: `Report filing fee applied to all ${deviceCount} device(s), including any that failed`,
      detail: 'Most water utilities require a separate test report submitted for every device, whether it passed or failed, so the filing fee is not discounted by the multi-device rate.',
    });
  }

  findings.push(jurisdictionNote());

  return {
    lineItems, deviceCount, failedCount, subtotalTesting, discountSaved, subtotalFiling,
    subtotalRetest, travelFee: trip, grandTotal, averagePerDevice, findings,
  };
}

function jurisdictionNote() {
  return {
    id: 'jurisdiction-note',
    severity: SEVERITY.MEDIUM,
    title: 'Local water utility rules vary -- confirm before filing',
    detail: 'This calculator only totals the fee schedule you entered against the devices on this job. It does not know your water utility’s required report form, filing deadline, device-type requirements, or testing frequency, and it does not determine whether a device passed or failed. Confirm those against your utility’s cross-connection control program before invoicing or filing.',
  };
}

/**
 * The disclaimer that travels with a copied breakdown -- the same reasoning
 * `overtime-pay-calculator`'s BREAKDOWN_DISCLAIMER and
 * `security-deposit-return-calculator`'s STATEMENT_DISCLAIMER apply: the
 * text leaves this page and its reader may never see the footer.
 */
export const BREAKDOWN_DISCLAIMER =
  'Arithmetic only: this breakdown applies the fee schedule you entered to the ' +
  'devices you listed. It is not a determination that any device passed or ' +
  'failed, and it does not know your water utility’s required report form, ' +
  'filing deadline, or device requirements -- confirm those before invoicing or filing.';

/**
 * Renders a job-quote result as the plain-text breakdown a tester can paste
 * into an invoice, a work order, or an email to the property manager --
 * mirroring formatWeightedBreakdown in overtime-pay-calculator.
 *
 * @param {ReturnType<typeof computeJobQuote>} result
 * @returns {string}
 */
export function formatQuoteBreakdown(result) {
  const {
    lineItems = [], deviceCount = 0, failedCount = 0, subtotalTesting = 0, discountSaved = 0,
    subtotalFiling = 0, subtotalRetest = 0, travelFee = 0, grandTotal = 0, averagePerDevice = 0,
  } = result ?? {};

  const lines = ['BACKFLOW TEST JOB QUOTE -- PER-DEVICE BREAKDOWN', ''];
  lines.push(`Devices tested: ${deviceCount}${failedCount > 0 ? ` (${failedCount} failed, retest billed)` : ''}`);
  lines.push('');
  lineItems.forEach((item, i) => {
    const parts = [`${money(item.discountedFee)} test`];
    if (item.filingFee > 0) parts.push(`${money(item.filingFee)} filing`);
    if (item.retestFee > 0) parts.push(`${money(item.retestFee)} retest`);
    lines.push(`  ${i + 1}. ${item.label} (${item.deviceType})${item.failed ? ' [FAILED]' : ''} - ${parts.join(' + ')} = ${money(item.lineTotal)}`);
  });
  lines.push('');
  lines.push(`Testing subtotal: ${money(subtotalTesting)}${discountSaved > 0 ? ` (multi-device discount saved ${money(discountSaved)})` : ''}`);
  if (subtotalFiling > 0) lines.push(`Report filing subtotal: ${money(subtotalFiling)}`);
  if (subtotalRetest > 0) lines.push(`Retest subtotal: ${money(subtotalRetest)}`);
  if (travelFee > 0) lines.push(`Travel fee: ${money(travelFee)}`);
  lines.push('', `Total: ${money(grandTotal)}`, `Average per device: ${money(averagePerDevice)}`);
  lines.push('', '--', BREAKDOWN_DISCLAIMER);

  return lines.join('\n');
}
