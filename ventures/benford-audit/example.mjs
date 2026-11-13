// A synthetic expense ledger for the "load an example" button and the tests.
// It is made up, not anyone's real data: 2,400 amounts drawn from a
// log-uniform distribution (which follows Benford's law exactly in the
// limit) across 40 vendors, plus three planted problems so every test has
// something to find:
//   1. one vendor whose 60 invoices sit between 4,500 and 4,999 (under a
//      5,000 approval limit),
//   2. 25 copies of the same 1,250.00 reimbursement,
//   3. an employee whose 80 claims are invented by hand (first digits
//      mostly 5 to 8, round-ish cents).

/** Small deterministic PRNG (mulberry32), so the example is the same every load. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function exampleRows(seed = 20261113) {
  const r = rng(seed);
  const rows = [];
  const vendors = Array.from({ length: 40 }, (_, i) => `Vendor ${String(i + 1).padStart(2, '0')}`);
  const day = (k) => {
    const d = new Date(Date.UTC(2025, 0, 1) + Math.floor(k) * 86400000);
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < 2400; i++) {
    // log-uniform between 10 and 100,000: four full decades.
    const amount = Math.round(10 ** (1 + 4 * r()) * 100) / 100;
    rows.push([day(r() * 365), vendors[Math.floor(r() * vendors.length)], amount.toFixed(2), 'invoice']);
  }
  for (let i = 0; i < 60; i++) {
    const amount = Math.round((4500 + r() * 499) * 100) / 100;
    rows.push([day(r() * 365), 'Northgate Supplies', amount.toFixed(2), 'invoice']);
  }
  for (let i = 0; i < 25; i++) rows.push([day(r() * 365), 'Travel reimbursements', '1250.00', 'reimbursement']);
  for (let i = 0; i < 80; i++) {
    const lead = 5 + Math.floor(r() * 4);
    const amount = lead * 10 ** (1 + Math.floor(r() * 2)) + Math.floor(r() * 9) * 10 ** Math.floor(r() * 2) + [0, 0.5, 0.25, 0][Math.floor(r() * 4)];
    rows.push([day(r() * 365), 'Employee J. Doe', amount.toFixed(2), 'expense claim']);
  }
  // Shuffle so the plants are not in one block.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return [['date', 'vendor', 'amount', 'type'], ...rows];
}

export function exampleCsv(seed) {
  return exampleRows(seed).map((r) => r.join(',')).join('\n') + '\n';
}
