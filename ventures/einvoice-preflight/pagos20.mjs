// Offline checks for the Pagos 2.0 complement (Complemento para recepción de pagos,
// namespace http://www.sat.gob.mx/Pagos20) inside a CFDI 4.0 of type P. Called by
// cfdi.mjs. Rule ids MX-040..MX-049 are this tool's own, not SAT's CRP2xxxx codes (the
// error matrix was not read; sat.gob.mx did not answer from the build host).
//
// Four layers:
//   1. the type P shell: XXX currency, the single "Pago" concept (84111506, ACT, 0),
//      UsoCFDI CP01, and a Pagos complement present exactly when the type is P;
//   2. Pagos20.xsd itself (element order, required attributes, catalogue codes), read by
//      build-cfdi-schema.mjs into cfdi-xsd-data.mjs and checked by cfdi.mjs's checkNode;
//   3. each payment and related document: currency and exchange rate, EquivalenciaDR,
//      previous balance - paid = remaining balance, the DR taxes, and Monto covering
//      what the documents say was paid;
//   4. the sums: ImpuestosP against the DR taxes converted to the payment currency, and
//      Totales against the payments converted to pesos.
// The sums follow CfdiUtils' SumasPagos20 calculator (MIT, eclipxe13/CfdiUtils): exact
// decimals at scale 24, DR amounts divided by EquivalenciaDR, ImpuestosP rounded half
// away from zero to 6 decimals, Totales to 2. Where issuers legitimately differ
// (rounded or truncated payment taxes, fewer decimals written) every reading CfdiUtils
// supports is accepted, so a finding means no supported reading reproduces the number.
// An offline observation, not SAT's or a PAC's acceptance, and not tax advice.

export const PAGOS20_NS = "http://www.sat.gob.mx/Pagos20";

const lineTaxCount = (docs) => docs.reduce((n, d) => n + PK(P(P(d, "ImpuestosDR"), "TrasladosDR"), "TrasladoDR").length + PK(P(P(d, "ImpuestosDR"), "RetencionesDR"), "RetencionDR").length, 0);

// ---------- exact decimals (BigInt at scale 24, like CfdiUtils' bcmath Decimal) ----------

const SCALE = 24;
const ONE = 10n ** BigInt(SCALE);

/** A decimal string to a scaled BigInt, or null. */
export function dec(s) {
  if (s === undefined || s === null) return null;
  const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(String(s));
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const frac = (m[3] || "").slice(0, SCALE).padEnd(SCALE, "0");
  const v = BigInt(m[2] || "0") * ONE + BigInt(frac || "0");
  return m[1] === "-" ? -v : v;
}
const mul = (a, b) => (a * b) / ONE; // truncates toward zero, as bcmul at scale 24
const div = (a, b) => (b === 0n ? null : (a * ONE) / b); // truncates, as bcdiv
const abs = (a) => (a < 0n ? -a : a);
/** Round half away from zero to d decimals. */
export function roundD(a, d) {
  const q = 10n ** BigInt(SCALE - d);
  const r = (abs(a) + q / 2n) / q * q;
  return a < 0n ? -r : r;
}
/** Truncate toward zero to d decimals. */
export function truncD(a, d) {
  const q = 10n ** BigInt(SCALE - d);
  return (a / q) * q;
}
/** A scaled BigInt as a plain decimal string with d decimals. */
export function show(a, d = 2) {
  const t = truncD(roundD(a, d), d);
  const neg = t < 0n;
  const s = abs(t).toString().padStart(SCALE + 1, "0");
  const int = s.slice(0, s.length - SCALE), frac = s.slice(s.length - SCALE, s.length - SCALE + d);
  return (neg ? "-" : "") + int + (d ? "." + frac : "");
}
const decimalsOf = (s) => {
  const i = String(s).indexOf(".");
  return i < 0 ? 0 : String(s).trim().length - i - 1;
};

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

const childNs = (n, name, ns) => n?.children.find((c) => c.name === name && c.ns === ns);
const kidsNs = (n, name, ns) => (n ? n.children.filter((c) => c.name === name && c.ns === ns) : []);
const P = (n, name) => childNs(n, name, PAGOS20_NS);
const PK = (n, name) => kidsNs(n, name, PAGOS20_NS);

// The rows Totales summarises: [attribute, kind, Impuesto, TipoFactor, TasaOCuota, field].
const TOTALES = [
  ["TotalRetencionesIVA", "R", "002", "", "", "importe"],
  ["TotalRetencionesISR", "R", "001", "", "", "importe"],
  ["TotalRetencionesIEPS", "R", "003", "", "", "importe"],
  ["TotalTrasladosBaseIVA16", "T", "002", "Tasa", "0.160000", "base"],
  ["TotalTrasladosImpuestoIVA16", "T", "002", "Tasa", "0.160000", "importe"],
  ["TotalTrasladosBaseIVA8", "T", "002", "Tasa", "0.080000", "base"],
  ["TotalTrasladosImpuestoIVA8", "T", "002", "Tasa", "0.080000", "importe"],
  ["TotalTrasladosBaseIVA0", "T", "002", "Tasa", "0.000000", "base"],
  ["TotalTrasladosImpuestoIVA0", "T", "002", "Tasa", "0.000000", "importe"],
  ["TotalTrasladosBaseIVAExento", "T", "002", "Exento", "", "base"],
];

// A tax group key. TasaOCuota is compared as a number, so 0.16 and 0.160000 match.
function key(kind, impuesto, factor, tasa) {
  if (kind === "R") return `R|${impuesto}`;
  const t = tasa === undefined || tasa === "" ? "" : show(dec(tasa) ?? 0n, 6);
  return `T|${impuesto}|${factor}|${t}`;
}
const label = (k) => {
  const [kind, imp, factor, tasa] = k.split("|");
  const name = { "001": "ISR", "002": "IVA", "003": "IEPS" }[imp] || imp;
  return kind === "R" ? `${name} withheld` : `${name} ${factor}${tasa ? " " + tasa : ""}`;
};

/**
 * Check the Pagos 2.0 side of a CFDI. `root` is the parsed cfdi:Comprobante, `ctx` gives
 * cfdi.mjs's helpers: {findings, skipped, checkNode, ELEMENTS, currencyDecimals, taxBounds}.
 */
export function checkPagos(root, ctx) {
  const { findings, skipped, checkNode, ELEMENTS, currencyDecimals, taxBounds, CFDI_NS } = ctx;
  const C = (n, name) => childNs(n, name, CFDI_NS);
  const a = root.attrs;
  const complemento = C(root, "Complemento");
  const pagosNodes = (complemento?.children || []).filter((c) => c.name === "Pagos");
  const pagos20 = pagosNodes.filter((c) => c.ns === PAGOS20_NS);
  const isP = a.TipoDeComprobante === "P";
  const meta = {};

  // ---- 1. the type P shell ----
  if (!isP && pagosNodes.length) {
    findings.push(finding("MX-040", `A Pagos complement sits in a type ${a.TipoDeComprobante || "(missing)"} CFDI; payments are reported only in a type P (pago) CFDI.`,
      "Issue the payment as its own CFDI with TipoDeComprobante=\"P\".", "/Comprobante/Complemento/Pagos"));
    return meta;
  }
  if (!isP) return meta;
  if (pagosNodes.some((n) => n.ns !== PAGOS20_NS)) {
    findings.push(finding("MX-040", "The Pagos complement is not version 2.0 (namespace http://www.sat.gob.mx/Pagos20); a CFDI 4.0 carries Pagos 2.0 only.",
      "Reissue the payment with the Pagos 2.0 complement.", "/Comprobante/Complemento/Pagos"));
  }
  if (!pagos20.length) {
    if (!pagosNodes.length) findings.push(finding("MX-040", "A type P CFDI needs the Pagos 2.0 complement; this one has none.", "Add pago20:Pagos inside Complemento.", "/Comprobante/Complemento"));
    return meta;
  }
  if (pagos20.length > 1) findings.push(finding("MX-040", "The CFDI carries more than one Pagos complement; one holds every payment.", "Merge the payments into one pago20:Pagos.", "/Comprobante/Complemento/Pagos"));
  if (a.Moneda && a.Moneda !== "XXX") findings.push(finding("MX-040", `A type P CFDI has Moneda XXX; this one has ${a.Moneda}. The payment's currency goes in MonedaP.`, "Set Moneda=\"XXX\" and drop TipoCambio.", "/Comprobante/@Moneda"));
  const conceptos = (C(root, "Conceptos")?.children || []).filter((c) => c.name === "Concepto");
  if (conceptos.length !== 1) {
    findings.push(finding("MX-040", `A type P CFDI has exactly one Concepto; this one has ${conceptos.length}.`, "Keep a single Concepto: ClaveProdServ 84111506, Cantidad 1, ClaveUnidad ACT, Descripcion Pago, ValorUnitario 0, Importe 0, ObjetoImp 01.", "/Comprobante/Conceptos"));
  }
  const want = { ClaveProdServ: "84111506", ClaveUnidad: "ACT", Descripcion: "Pago", ObjetoImp: "01" };
  const wantZero = { Cantidad: 1, ValorUnitario: 0, Importe: 0 };
  conceptos.slice(0, 1).forEach((c) => {
    for (const [k, v] of Object.entries(want)) {
      if (c.attrs[k] !== undefined && c.attrs[k] !== v) findings.push(finding("MX-040", `The Concepto of a type P CFDI has ${k} "${v}", not "${c.attrs[k]}".`, `Set ${k}="${v}".`, `/Comprobante/Conceptos/Concepto/@${k}`));
    }
    for (const [k, v] of Object.entries(wantZero)) {
      if (c.attrs[k] !== undefined && dec(c.attrs[k]) !== BigInt(v) * ONE) findings.push(finding("MX-040", `The Concepto of a type P CFDI has ${k} ${v}, not ${c.attrs[k]}.`, `Set ${k}="${v}".`, `/Comprobante/Conceptos/Concepto/@${k}`));
    }
    for (const k of ["NoIdentificacion", "Unidad", "Descuento"]) {
      if (c.attrs[k] !== undefined) findings.push(finding("MX-040", `The Concepto of a type P CFDI must not carry ${k}.`, `Remove ${k}.`, `/Comprobante/Conceptos/Concepto/@${k}`));
    }
    if (c.children.some((k) => k.name && k.ns === CFDI_NS)) findings.push(finding("MX-040", "The Concepto of a type P CFDI carries child elements (taxes, customs or property data); it has none.", "Remove them; the payment's taxes go in the Pagos complement.", "/Comprobante/Conceptos/Concepto"));
  });
  const uso = C(root, "Receptor")?.attrs.UsoCFDI;
  if (uso && uso !== "CP01") findings.push(finding("MX-040", `A type P CFDI has UsoCFDI CP01 (pagos), not ${uso}.`, "Set UsoCFDI=\"CP01\".", "/Comprobante/Receptor/@UsoCFDI"));

  const pagosNode = pagos20[0];
  const base = "/Comprobante/Complemento/Pagos";

  // ---- 2. the schema ----
  checkNode(pagosNode, "Comprobante/Complemento/Pagos", findings, ELEMENTS.Pagos, { ns: PAGOS20_NS, xsd: "Pagos20.xsd", strip: "Comprobante/Complemento/" });

  // ---- 3 and 4. payments ----
  const pagoList = PK(pagosNode, "Pago");
  meta.payments = pagoList.length;
  meta.documents = 0;
  let montoTotal = 0n, montoOk = true;
  // A payment whose taxes cannot be converted to pesos (no usable TipoCambioP) or summed
  // (a tax amount or rate that is not a number) would leave the Totales tax sums partial:
  // they are skipped rather than compared, so a correct Totales is never blamed.
  const noRate = [], unreadableTax = [];
  // Tax attributes the schema check rejects as numbers; summing them as 0 would blame the
  // correct values beside them.
  const badNums = (ta, names) => names.filter((n) => ta[n] !== undefined && dec(ta[n]) === null);
  // Totales candidates: from the written ImpuestosP and from our own recomputation.
  const totWritten = new Map(), totComputed = new Map();
  const addTot = (m, k, field, v) => {
    const g = m.get(k) || { base: 0n, importe: 0n };
    g[field] += v;
    m.set(k, g);
  };

  pagoList.forEach((pago, i) => {
    const pp = `${base}/Pago[${i + 1}]`;
    const pa = pago.attrs;
    const monedaP = pa.MonedaP;
    const dP = currencyDecimals(monedaP);
    // currency, rate, form, amount
    if (monedaP === "XXX") findings.push(finding("MX-042", `Payment ${i + 1}: MonedaP is XXX; a payment is made in a real currency.`, "Set MonedaP to the currency the money moved in (MXN, USD, ...).", `${pp}/@MonedaP`));
    let tc = dec(pa.TipoCambioP);
    if (monedaP === "MXN" && pa.TipoCambioP !== undefined && tc !== ONE) findings.push(finding("MX-042", `Payment ${i + 1}: MonedaP is MXN but TipoCambioP is ${pa.TipoCambioP}, not 1.`, "Set TipoCambioP=\"1\" for a payment in pesos.", `${pp}/@TipoCambioP`));
    if (monedaP && monedaP !== "MXN" && monedaP !== "XXX" && pa.TipoCambioP === undefined) findings.push(finding("MX-042", `Payment ${i + 1}: MonedaP is ${monedaP} but TipoCambioP (pesos per unit on the payment date) is missing.`, "Add TipoCambioP.", `${pp}/@TipoCambioP`));
    if (monedaP === "MXN" && pa.TipoCambioP === undefined) tc = ONE;
    if (pa.FormaDePagoP === "99") findings.push(finding("MX-042", `Payment ${i + 1}: FormaDePagoP is 99 (por definir); a payment records how it was actually paid.`, "Set the real form, for example 03 (transfer) or 01 (cash).", `${pp}/@FormaDePagoP`));
    const monto = dec(pa.Monto);
    if (monto !== null && monto <= 0n) findings.push(finding("MX-042", `Payment ${i + 1}: Monto must be greater than 0.`, "Set Monto to the amount received.", `${pp}/@Monto`));
    if (pa.Monto !== undefined && decimalsOf(pa.Monto) > dP) findings.push(finding("MX-042", `Payment ${i + 1}: Monto has ${decimalsOf(pa.Monto)} decimals; ${monedaP} allows ${dP}.`, `Round Monto to ${dP} decimals.`, `${pp}/@Monto`));
    if (monto !== null && tc !== null) montoTotal += mul(monto, tc);
    else montoOk = false;

    // related documents
    let paidInP = 0n, sumOk = true;
    const badTax = new Set(); // unreadable tax attributes in this payment
    const drGroups = new Map(); // key -> {base, importe} in MonedaP, unrounded
    const docs = PK(pago, "DoctoRelacionado");
    meta.documents += docs.length;
    docs.forEach((d, j) => {
      const dp = `${pp}/DoctoRelacionado[${j + 1}]`;
      const da = d.attrs;
      const dDR = currencyDecimals(da.MonedaDR);
      let eq = dec(da.EquivalenciaDR);
      if (da.MonedaDR && monedaP && da.MonedaDR === monedaP) {
        if (da.EquivalenciaDR !== undefined && eq !== ONE) findings.push(finding("MX-044", `Payment ${i + 1}, document ${j + 1}: MonedaDR and MonedaP are both ${monedaP}, so EquivalenciaDR is 1, not ${da.EquivalenciaDR}.`, "Set EquivalenciaDR=\"1\".", `${dp}/@EquivalenciaDR`));
        if (da.EquivalenciaDR === undefined) eq = ONE;
      } else if (da.MonedaDR && monedaP && da.EquivalenciaDR === undefined) {
        findings.push(finding("MX-044", `Payment ${i + 1}, document ${j + 1}: the invoice is in ${da.MonedaDR} and the payment in ${monedaP}, so EquivalenciaDR (units of ${da.MonedaDR} per unit of ${monedaP}) is required.`, "Add EquivalenciaDR.", `${dp}/@EquivalenciaDR`));
      }
      if (da.MonedaDR === "XXX") findings.push(finding("MX-044", `Payment ${i + 1}, document ${j + 1}: MonedaDR is XXX; give the paid invoice's own currency.`, "Set MonedaDR to the invoice's Moneda.", `${dp}/@MonedaDR`));
      // balances
      const ant = dec(da.ImpSaldoAnt), paid = dec(da.ImpPagado), rest = dec(da.ImpSaldoInsoluto);
      if (ant !== null && ant <= 0n) findings.push(finding("MX-045", `Payment ${i + 1}, document ${j + 1}: ImpSaldoAnt (balance before this payment) must be greater than 0.`, "Use the invoice's outstanding balance before this payment.", `${dp}/@ImpSaldoAnt`));
      if (paid !== null && paid <= 0n) findings.push(finding("MX-045", `Payment ${i + 1}, document ${j + 1}: ImpPagado must be greater than 0.`, "Set the amount of this payment applied to the invoice.", `${dp}/@ImpPagado`));
      if (rest !== null && rest < 0n) findings.push(finding("MX-045", `Payment ${i + 1}, document ${j + 1}: ImpSaldoInsoluto is negative; more was paid than was owed.`, "Apply at most the outstanding balance; any excess is an advance (anticipo).", `${dp}/@ImpSaldoInsoluto`));
      if (ant !== null && paid !== null && rest !== null && ant - paid !== rest) {
        findings.push(finding("MX-045", `Payment ${i + 1}, document ${j + 1}: ImpSaldoAnt ${da.ImpSaldoAnt} - ImpPagado ${da.ImpPagado} is ${show(ant - paid, dDR)}, but ImpSaldoInsoluto says ${da.ImpSaldoInsoluto}.`, "Set ImpSaldoInsoluto to the previous balance minus the amount paid, exactly.", `${dp}/@ImpSaldoInsoluto`));
      }
      for (const k of ["ImpSaldoAnt", "ImpPagado", "ImpSaldoInsoluto"]) {
        if (da[k] !== undefined && da.MonedaDR && decimalsOf(da[k]) > dDR) findings.push(finding("MX-045", `Payment ${i + 1}, document ${j + 1}: ${k} has ${decimalsOf(da[k])} decimals; ${da.MonedaDR} allows ${dDR}.`, `Round ${k} to ${dDR} decimals.`, `${dp}/@${k}`));
      }
      if (paid !== null && eq !== null && eq > 0n) paidInP += div(paid, eq);
      else sumOk = false;
      // taxes
      const imps = P(d, "ImpuestosDR");
      if (da.ObjetoImpDR === "02" && !imps) findings.push(finding("MX-046", `Payment ${i + 1}, document ${j + 1}: ObjetoImpDR is 02 (subject to tax) but the document has no ImpuestosDR.`, "Add the paid share of the invoice's taxes in ImpuestosDR, or use the ObjetoImpDR the invoice has.", `${dp}/ImpuestosDR`));
      if (da.ObjetoImpDR === "01" && imps) findings.push(finding("MX-046", `Payment ${i + 1}, document ${j + 1}: ObjetoImpDR is 01 (not subject to tax) but ImpuestosDR is present.`, "Remove ImpuestosDR, or set ObjetoImpDR=\"02\".", `${dp}/ImpuestosDR`));
      const lines = [
        ...PK(P(imps, "TrasladosDR"), "TrasladoDR").map((t, k) => ["T", t, `${dp}/ImpuestosDR/TrasladosDR/TrasladoDR[${k + 1}]`]),
        ...PK(P(imps, "RetencionesDR"), "RetencionDR").map((t, k) => ["R", t, `${dp}/ImpuestosDR/RetencionesDR/RetencionDR[${k + 1}]`]),
      ];
      for (const [kind, t, tp] of lines) {
        const ta = t.attrs;
        const what = kind === "T" ? "TrasladoDR" : "RetencionDR";
        const who = `Payment ${i + 1}, document ${j + 1}`;
        if (kind === "R" && ta.TipoFactorDR === "Exento") findings.push(finding("MX-047", `${who}: a RetencionDR cannot be Exento.`, "Use Tasa or Cuota, or drop the withholding.", `${tp}/@TipoFactorDR`));
        if (kind === "T" && ta.TipoFactorDR === "Exento" && (ta.TasaOCuotaDR !== undefined || ta.ImporteDR !== undefined)) findings.push(finding("MX-047", `${who}: an exempt TrasladoDR carries TasaOCuotaDR or ImporteDR.`, "Remove TasaOCuotaDR and ImporteDR from an Exento tax line.", tp));
        if (kind === "T" && ta.TipoFactorDR && ta.TipoFactorDR !== "Exento" && (ta.TasaOCuotaDR === undefined || ta.ImporteDR === undefined)) findings.push(finding("MX-047", `${who}: a ${ta.TipoFactorDR} TrasladoDR needs both TasaOCuotaDR and ImporteDR.`, "Add the rate and the tax amount.", tp));
        if (dec(ta.BaseDR) !== null && dec(ta.BaseDR) <= 0n) findings.push(finding("MX-047", `${who}: the ${what} BaseDR must be greater than 0.`, "Set BaseDR to the taxed share of the amount paid.", `${tp}/@BaseDR`));
        if (ta.TipoFactorDR === "Tasa" && ta.BaseDR !== undefined && ta.TasaOCuotaDR !== undefined && ta.ImporteDR !== undefined && dec(ta.BaseDR) !== null && dec(ta.TasaOCuotaDR) !== null && dec(ta.ImporteDR) !== null) {
          const [lo, hi] = taxBounds(ta.BaseDR, ta.TasaOCuotaDR, decimalsOf(ta.ImporteDR));
          const v = Number(ta.ImporteDR);
          if (v < lo - 1e-9 || v > hi + 1e-9) findings.push(finding("MX-047", `${who}: ${what} ImporteDR ${ta.ImporteDR} is outside BaseDR x TasaOCuotaDR (${lo} to ${hi} with rounding).`, "Recompute ImporteDR as BaseDR x TasaOCuotaDR.", `${tp}/@ImporteDR`));
        }
        for (const n of badNums(ta, ["BaseDR", "TasaOCuotaDR", "ImporteDR"])) badTax.add(n);
        if (eq === null || eq <= 0n) continue; // sumOk is false: the payment's taxes are not compared
        const k = key(kind, ta.ImpuestoDR, ta.TipoFactorDR, ta.TasaOCuotaDR);
        const g = drGroups.get(k) || { base: 0n, importe: 0n };
        if (kind === "T") g.base += div(dec(ta.BaseDR) ?? 0n, eq);
        g.importe += div(dec(ta.ImporteDR) ?? 0n, eq);
        drGroups.set(k, g);
      }
    });

    // MX-043: Monto covers the documents' ImpPagado converted to MonedaP (truncated).
    if (sumOk && monto !== null && docs.length) {
      const min = truncD(paidInP, dP);
      if (monto < min) findings.push(finding("MX-043", `Payment ${i + 1}: Monto ${pa.Monto} is less than the documents' ImpPagado converted to ${monedaP} (${show(min, dP)}).`,
        "Monto is the money received; it must cover every ImpPagado / EquivalenciaDR. Check the amounts paid and each EquivalenciaDR.", `${pp}/@Monto`));
    }

    // MX-048: ImpuestosP against the DR taxes.
    const impP = P(pago, "ImpuestosP");
    const pRows = [
      ...PK(P(impP, "TrasladosP"), "TrasladoP").map((t, k) => ["T", t, `${pp}/ImpuestosP/TrasladosP/TrasladoP[${k + 1}]`]),
      ...PK(P(impP, "RetencionesP"), "RetencionP").map((t, k) => ["R", t, `${pp}/ImpuestosP/RetencionesP/RetencionP[${k + 1}]`]),
    ];
    if (lineTaxCount(docs) && !impP) findings.push(finding("MX-048", `Payment ${i + 1}: the related documents carry taxes but the payment has no ImpuestosP.`, "Add ImpuestosP with the documents' taxes grouped by tax, factor and rate, converted to MonedaP.", `${pp}/ImpuestosP`));
    const seen = new Set();
    if (!sumOk && pRows.length) {
      skipped.push(`MX-048 (payment ${i + 1}): a related document has no usable EquivalenciaDR, so its taxes cannot be converted to ${monedaP || "the payment currency"} and ImpuestosP is not compared.`);
    }
    for (const [, t] of pRows) for (const n of badNums(t.attrs, ["BaseP", "TasaOCuotaP", "ImporteP"])) badTax.add(n);
    const taxOk = sumOk && !badTax.size;
    if (badTax.size) {
      unreadableTax.push(i + 1);
      skipped.push(`MX-048 (payment ${i + 1}): ${[...badTax].join(", ")} is not a number, so ImpuestosP is not compared with the related documents' taxes.`);
    }
    for (const [kind, t, tp] of pRows) {
      const ta = t.attrs;
      const k = key(kind, ta.ImpuestoP, ta.TipoFactorP, ta.TasaOCuotaP);
      const fields = kind === "T" ? [["BaseP", "base"], ["ImporteP", "importe"]] : [["ImporteP", "importe"]];
      // Totales candidates, in pesos, from what the file writes.
      if (tc !== null) {
        for (const [attr, f] of fields) {
          const w = dec(ta[attr]);
          if (w !== null) addTot(totWritten, k, f, mul(w, tc));
        }
      }
      if (!taxOk) continue;
      if (seen.has(k)) findings.push(finding("MX-048", `Payment ${i + 1}: ImpuestosP repeats the group ${label(k)}.`, "Merge the repeated rows into one per tax, factor and rate.", tp));
      seen.add(k);
      const g = drGroups.get(k);
      if (!g) {
        findings.push(finding("MX-048", `Payment ${i + 1}: ImpuestosP has ${label(k)}, which no related document carries.`, "Remove it, or add the tax to the documents it applies to.", tp));
        continue;
      }
      for (const [attr, f] of fields) {
        if (ta[attr] === undefined) continue;
        const w = dec(ta[attr]);
        if (w === null) continue;
        const d = Math.max(2, Math.min(6, decimalsOf(ta[attr])));
        const ok = [roundD(g[f], d), truncD(g[f], d)].some((x) => x === w);
        if (!ok) findings.push(finding("MX-048", `Payment ${i + 1}: ${label(k)} ${attr} ${ta[attr]} is not the related documents' ${f === "base" ? "BaseDR" : "ImporteDR"} / EquivalenciaDR summed (${show(roundD(g[f], d), d)}).`,
          `Set ${attr} to the sum over the documents of ${f === "base" ? "BaseDR" : "ImporteDR"} divided by each EquivalenciaDR, rounded to 6 decimals.`, `${tp}/@${attr}`));
      }
    }
    for (const k of drGroups.keys()) {
      if (taxOk && impP && !seen.has(k)) findings.push(finding("MX-048", `Payment ${i + 1}: the related documents carry ${label(k)}, which ImpuestosP leaves out.`, "Add a row for it to ImpuestosP.", `${pp}/ImpuestosP`));
    }
    if (tc === null && (pRows.length || drGroups.size)) noRate.push(i + 1);
    if (tc !== null && taxOk) {
      for (const [k, g] of drGroups) {
        addTot(totComputed, k, "base", mul(roundD(g.base, 6), tc));
        addTot(totComputed, k, "importe", mul(roundD(g.importe, 6), tc));
      }
    }
  });

  // ---- MX-049: Totales ----
  const totales = P(pagosNode, "Totales");
  if (totales) {
    const ta = totales.attrs;
    if (montoOk && ta.MontoTotalPagos !== undefined && dec(ta.MontoTotalPagos) !== null) {
      const w = dec(ta.MontoTotalPagos);
      if (w !== roundD(montoTotal, 2)) findings.push(finding("MX-049", `MontoTotalPagos ${ta.MontoTotalPagos} is not the payments' Monto x TipoCambioP summed (${show(montoTotal, 2)}).`,
        "Set MontoTotalPagos to the sum of every Pago's Monto times its TipoCambioP, rounded to 2 decimals (pesos).", `${base}/Totales/@MontoTotalPagos`));
    }
    if (noRate.length) {
      skipped.push(`MX-049: payment ${noRate.join(", ")} has taxes but no usable TipoCambioP, so the Totales tax sums cannot be converted to pesos and are not compared.`);
    }
    if (unreadableTax.length) {
      skipped.push(`MX-049: payment ${unreadableTax.join(", ")} has a tax amount or rate that is not a number, so the Totales tax sums are not compared.`);
    }
    for (const [attr, kind, imp, factor, tasa, f] of TOTALES) {
      if (noRate.length || unreadableTax.length) break;
      const k = key(kind, imp, factor, tasa);
      const cands = [totWritten.get(k), totComputed.get(k)].filter(Boolean).map((g) => g[f]);
      const present = ta[attr] !== undefined;
      if (!cands.length) {
        if (present) findings.push(finding("MX-049", `Totales carries ${attr} but no payment has ${label(k)}.`, `Remove ${attr}.`, `${base}/Totales/@${attr}`));
        continue;
      }
      if (!present) {
        findings.push(finding("MX-049", `The payments carry ${label(k)} but Totales has no ${attr} (${show(cands[0], 2)}).`, `Add ${attr}.`, `${base}/Totales/@${attr}`));
        continue;
      }
      const w = dec(ta[attr]);
      if (w === null) continue;
      if (!cands.some((c) => roundD(c, 2) === w || truncD(c, 2) === w)) {
        findings.push(finding("MX-049", `Totales ${attr} ${ta[attr]} is not the payments' ${label(k)} ${f === "base" ? "base" : "amount"} converted to pesos (${show(cands[0], 2)}).`,
          `Set ${attr} to the sum over the payments of the ImpuestosP ${f === "base" ? "BaseP" : "ImporteP"} times TipoCambioP, rounded to 2 decimals.`, `${base}/Totales/@${attr}`));
      }
    }
  }
  return meta;
}
