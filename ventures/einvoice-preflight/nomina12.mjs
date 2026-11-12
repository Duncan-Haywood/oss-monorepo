// Offline checks for the Nómina 1.2 complement (Complemento de recibo de pago de nómina,
// namespace http://www.sat.gob.mx/nomina12) inside a CFDI 4.0 of type N, the payroll
// receipt a Mexican employer stamps for every pay to an employee or assimilated earner.
// Called by cfdi.mjs. Rule ids MX-050..MX-057 are this tool's own, not SAT's NOMxxx
// codes (the error matrix was not read).
//
// Source: SAT's "Guía de llenado del comprobante del recibo de pago de nómina y su
// complemento" (GuiaNomina11102019.pdf, omawww.sat.gob.mx, read 2026-11-12), written for
// CFDI 3.3 with complement 1.2. The complement is the same under CFDI 4.0; where the
// guide names a 3.3 value (UsoCFDI P01) the 4.0 catalogue's value is used instead (CN01,
// "Nómina", the only use c_UsoCFDI gives for payroll), and said so in the finding.
//
// Layers:
//   1. the type N shell (MX-050): MXN without TipoCambio, FormaPago 99, MetodoPago PUE,
//      the single "Pago de nómina" concept (84111505, 1, ACT) whose ValorUnitario and
//      Importe are TotalPercepciones + TotalOtrosPagos and whose Descuento is
//      TotalDeducciones, no tax nodes, a person as receiver, UsoCFDI CN01, a
//      substitution (04) as the only relation, and the complement present exactly when
//      the type is N;
//   2. nomina12.xsd and catNomina.xsd, read by build-cfdi-schema.mjs into
//      cfdi-xsd-data.mjs and checked by cfdi.mjs's checkNode (MX-002..MX-006);
//   3. the sums: the Nomina totals against Percepciones, Deducciones and OtrosPagos
//      (MX-051), TotalSueldos / TotalSeparacionIndemnizacion / TotalJubilacionPensionRetiro
//      / TotalGravado / TotalExento against the lines by TipoPercepcion (MX-052),
//      TotalImpuestosRetenidos and TotalOtrasDeducciones by TipoDeduccion (MX-053), and
//      the other payments with their subsidy and annual-balance nodes (MX-054);
//   4. dates and periods (MX-055), the employment data (MX-056: the RegistroPatronal
//      group, contract and regime, CURP and CLABE check digits, bank, subcontracting
//      shares, mixed public funds), and disability days against the 014 income or the
//      006 deduction (MX-057).
// Amounts are compared exactly in cents (t_ImporteMXN carries at most two decimals).
// An offline observation, not SAT's or a PAC's acceptance, and not payroll or tax advice.

import { dec, show } from "./pagos20.mjs";

export const NOMINA12_NS = "http://www.sat.gob.mx/nomina12";

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

const childNs = (n, name, ns) => n?.children.find((c) => c.name === name && c.ns === ns);
const kidsNs = (n, name, ns) => (n ? n.children.filter((c) => c.name === name && c.ns === ns) : []);
const N = (n, name) => childNs(n, name, NOMINA12_NS);
const NK = (n, name) => kidsNs(n, name, NOMINA12_NS);

// Percepción codes outside TotalSueldos (guide, "TotalSueldos").
const SEPARACION = new Set(["022", "023", "025"]);
const JUBILACION = new Set(["039", "044"]);
// Contract types for which the guide asks for a RegistroPatronal and regime 02/03/04.
const LABOUR = new Set(["01", "02", "03", "04", "05", "06", "07", "08"]);
const amt = (s) => dec(s);
const sum = (list) => list.reduce((s, v) => s + (v ?? 0n), 0n);
const money = (v) => show(v, 2);

// ---------- check digits ----------

const CURP_CHARS = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
/** The CURP check digit (values 0-9, A-N, Ñ, O-Z; weights 18..2 over the first 17
 * characters; 10 minus the sum mod 10), as python-stdnum's mx.curp computes it. It
 * reproduces the guide's CABL840215MDFSRS01 and SAT's generic foreign man's CURP
 * XEXX010101HNEXXXA4. SAT's generic foreign woman's CURP XEXX010101MNEXXXA8 does not fit
 * it, and cannot fit any rule of this shape (H and M differ by 5 at weight 8, which moves
 * no digit), so the two generic CURPs are accepted as written. RENAPO's text was not read. */
export const GENERIC_CURPS = new Set(["XEXX010101HNEXXXA4", "XEXX010101MNEXXXA8"]);
export function curpDigit(curp) {
  const s = String(curp).toUpperCase();
  if (s.length !== 18) return null;
  let t = 0;
  for (let i = 0; i < 17; i++) {
    const v = CURP_CHARS.indexOf(s[i]);
    if (v < 0) return null;
    t += v * (18 - i);
  }
  return String((10 - (t % 10)) % 10);
}

/** The CLABE (18-digit interbank account) control digit: weights 3, 7, 1 repeating,
 * each product mod 10, then 10 minus the sum mod 10. Pinned to three published example
 * CLABEs (032180000118359719, 002010077777777771, 014027000005555558); Banxico's own
 * text was not read. The guide's own sample account (002215911558451272) fails it. */
export function clabeDigit(clabe) {
  const s = String(clabe);
  if (!/^\d{18}$/.test(s)) return null;
  const w = [3, 7, 1];
  let t = 0;
  for (let i = 0; i < 17; i++) t += (Number(s[i]) * w[i % 3]) % 10;
  return String((10 - (t % 10)) % 10);
}

// ---------- dates ----------

const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null);

/** Whether an Antigüedad (P<n>W or P<y>Y<m>M<d>D) fits between two dates, counted
 * inclusively (a worker who started on the first day of the period has one day). */
export function seniorityFits(antig, start, end) {
  const s = day(start), e = day(end);
  if (s === null || e === null || !antig) return true;
  const elapsedDays = (e - s) / 864e5 + 1;
  const w = /^P(\d+)W$/.exec(antig);
  if (w) return Number(w[1]) * 7 <= elapsedDays;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(\d+)D$/.exec(antig);
  if (!m) return true;
  const d0 = new Date(s);
  // Add the years and months on the calendar, then the days.
  const t = Date.UTC(d0.getUTCFullYear() + Number(m[1] || 0), d0.getUTCMonth() + Number(m[2] || 0), d0.getUTCDate()) + Number(m[3]) * 864e5;
  return t <= e + 864e5;
}

// ---------- the checker ----------

/**
 * Check the Nómina 1.2 side of a CFDI. `root` is the parsed cfdi:Comprobante; `ctx` gives
 * cfdi.mjs's helpers: {findings, skipped, checkNode, ELEMENTS, CFDI_NS, personType}.
 */
export function checkNomina(root, ctx) {
  const { findings, skipped, checkNode, ELEMENTS, CFDI_NS, personType } = ctx;
  const C = (n, name) => childNs(n, name, CFDI_NS);
  const a = root.attrs;
  const complemento = C(root, "Complemento");
  const all = (complemento?.children || []).filter((c) => c.name === "Nomina");
  const nominas = all.filter((c) => c.ns === NOMINA12_NS);
  const isN = a.TipoDeComprobante === "N";
  const meta = {};

  // ---- 1. the type N shell ----
  if (!isN) {
    if (all.length) findings.push(finding("MX-050", `A Nómina complement sits in a type ${a.TipoDeComprobante || "(missing)"} CFDI; payroll is reported only in a type N (nómina) CFDI.`,
      "Issue the payroll receipt as its own CFDI with TipoDeComprobante=\"N\".", "/Comprobante/Complemento/Nomina"));
    return meta;
  }
  if (all.some((n) => n.ns !== NOMINA12_NS)) {
    findings.push(finding("MX-050", "The Nómina complement is not version 1.2 (namespace http://www.sat.gob.mx/nomina12).", "Reissue the receipt with the Nómina 1.2 complement.", "/Comprobante/Complemento/Nomina"));
  }
  if (!nominas.length) {
    if (!all.length) findings.push(finding("MX-050", "A type N CFDI needs the Nómina 1.2 complement; this one has none.", "Add nomina12:Nomina inside Complemento.", "/Comprobante/Complemento"));
    return meta;
  }
  meta.payrolls = nominas.length;
  const shell = (msg, fix, path) => findings.push(finding("MX-050", msg, fix, path));
  if (a.TipoCambio !== undefined) shell("A payroll CFDI carries no TipoCambio (it is always in MXN).", "Remove TipoCambio.", "/Comprobante/@TipoCambio");
  if (a.FormaPago !== undefined && a.FormaPago !== "99") shell(`A payroll CFDI has FormaPago 99 (por definir), not ${a.FormaPago}.`, "Set FormaPago=\"99\".", "/Comprobante/@FormaPago");
  if (a.MetodoPago !== undefined && a.MetodoPago !== "PUE") shell(`A payroll CFDI has MetodoPago PUE (paid in one go), not ${a.MetodoPago}.`, "Set MetodoPago=\"PUE\".", "/Comprobante/@MetodoPago");
  if (a.CondicionesDePago !== undefined) shell("A payroll CFDI carries no CondicionesDePago.", "Remove CondicionesDePago.", "/Comprobante/@CondicionesDePago");
  if (C(root, "Impuestos")) shell("A payroll CFDI carries no tax summary (Impuestos); the ISR withheld goes in the complement as deduction 002.", "Remove Comprobante/Impuestos and record the ISR as a Deduccion with TipoDeduccion 002.", "/Comprobante/Impuestos");
  const rel = C(root, "CfdiRelacionados");
  if (rel && rel.attrs.TipoRelacion && rel.attrs.TipoRelacion !== "04") shell(`A payroll CFDI relates only to the payroll CFDI it replaces (TipoRelacion 04), not ${rel.attrs.TipoRelacion}.`, "Use TipoRelacion=\"04\" and the UUID of the receipt being replaced.", "/Comprobante/CfdiRelacionados/@TipoRelacion");

  const rec = C(root, "Receptor")?.attrs || {};
  if (personType(rec.Rfc) === "moral") shell("The receiver of a payroll CFDI is a person (13-character RFC); a company cannot be an employee.", "Use the employee's own RFC.", "/Comprobante/Receptor/@Rfc");
  for (const k of ["ResidenciaFiscal", "NumRegIdTrib"]) {
    if (rec[k] !== undefined) shell(`The receiver of a payroll CFDI carries no ${k}.`, `Remove ${k}.`, `/Comprobante/Receptor/@${k}`);
  }
  if (rec.UsoCFDI && rec.UsoCFDI !== "CN01") shell(`A payroll CFDI 4.0 has UsoCFDI CN01 (nómina), not ${rec.UsoCFDI}. (SAT's guide for 3.3 said P01, which the 4.0 catalogue has retired.)`, "Set UsoCFDI=\"CN01\".", "/Comprobante/Receptor/@UsoCFDI");

  const conceptos = (C(root, "Conceptos")?.children || []).filter((c) => c.name === "Concepto");
  if (conceptos.length !== 1) shell(`A payroll CFDI has exactly one Concepto; this one has ${conceptos.length}.`, "Keep a single Concepto: ClaveProdServ 84111505, Cantidad 1, ClaveUnidad ACT, Descripcion \"Pago de nómina\".", "/Comprobante/Conceptos");
  const concepto = conceptos[0];
  if (concepto) {
    const ca = concepto.attrs;
    const want = { ClaveProdServ: "84111505", ClaveUnidad: "ACT", Descripcion: "Pago de nómina" };
    for (const [k, v] of Object.entries(want)) {
      if (ca[k] !== undefined && ca[k] !== v) shell(`The Concepto of a payroll CFDI has ${k} "${v}", not "${ca[k]}".`, `Set ${k}="${v}".`, `/Comprobante/Conceptos/Concepto/@${k}`);
    }
    if (ca.Cantidad !== undefined && dec(ca.Cantidad) !== dec("1")) shell(`The Concepto of a payroll CFDI has Cantidad 1, not ${ca.Cantidad}.`, "Set Cantidad=\"1\".", "/Comprobante/Conceptos/Concepto/@Cantidad");
    for (const k of ["NoIdentificacion", "Unidad"]) {
      if (ca[k] !== undefined) shell(`The Concepto of a payroll CFDI must not carry ${k}.`, `Remove ${k}.`, `/Comprobante/Conceptos/Concepto/@${k}`);
    }
    if (concepto.children.some((k) => k.name && k.ns === CFDI_NS)) shell("The Concepto of a payroll CFDI carries child elements (taxes, customs, property or parts); it has none.", "Remove them; the payroll detail is in the complement.", "/Comprobante/Conceptos/Concepto");
  }

  // ---- 2. the schema ----
  nominas.forEach((nom, i) => {
    const path = nominas.length > 1 ? `Comprobante/Complemento/Nomina[${i + 1}]` : "Comprobante/Complemento/Nomina";
    checkNode(nom, path, findings, ELEMENTS.Nomina, { ns: NOMINA12_NS, xsd: "nomina12.xsd", strip: "Comprobante/Complemento/" });
  });

  // ---- 3 and 4, per complement ----
  let valor = 0n, deducciones = 0n, readable = true;
  nominas.forEach((nom, i) => {
    const r = checkOne(nom, i, nominas.length, root, ctx);
    if (r.valor === null || r.deducciones === null) readable = false;
    else { valor += r.valor; deducciones += r.deducciones; }
  });

  // The Concepto against the complement totals (summed when one CFDI carries two
  // complements, a separation pay beside the last ordinary pay).
  if (concepto && readable) {
    const ca = concepto.attrs;
    for (const k of ["ValorUnitario", "Importe"]) {
      const v = dec(ca[k]);
      if (v !== null && v !== valor) shell(`The Concepto ${k} ${ca[k]} is not TotalPercepciones + TotalOtrosPagos from the complement (${money(valor)}).`,
        `Set ${k} to TotalPercepciones plus TotalOtrosPagos.`, `/Comprobante/Conceptos/Concepto/@${k}`);
    }
    const d = ca.Descuento === undefined ? null : dec(ca.Descuento);
    if (deducciones > 0n && ca.Descuento === undefined) shell(`The complement has deductions (TotalDeducciones ${money(deducciones)}) but the Concepto carries no Descuento.`, "Set the Concepto Descuento to TotalDeducciones (and the header Descuento with it).", "/Comprobante/Conceptos/Concepto/@Descuento");
    else if (d !== null && d !== deducciones) shell(`The Concepto Descuento ${ca.Descuento} is not the complement's TotalDeducciones (${money(deducciones)}).`, "Set Descuento to TotalDeducciones.", "/Comprobante/Conceptos/Concepto/@Descuento");
  } else if (concepto && !readable) {
    skipped.push("MX-050 (Concepto amounts): a complement total is not a number, so the Concepto is not compared with the complement.");
  }
  return meta;

  function checkOne(nom, i, count, root, ctx) {
    const base = count > 1 ? `/Comprobante/Complemento/Nomina[${i + 1}]` : "/Comprobante/Complemento/Nomina";
    const who = count > 1 ? `Nómina ${i + 1}: ` : "";
    const na = nom.attrs;
    const push = (rule, msg, fix, path) => findings.push(finding(rule, who + msg, fix, path));
    const out = { valor: null, deducciones: null };

    // ---------- percepciones ----------
    const perc = N(nom, "Percepciones");
    const percList = NK(perc, "Percepcion");
    const pa = perc?.attrs || {};
    let percOk = true;
    const g = [], e = [];
    const byGroup = { sueldos: [], separacion: [], jubilacion: [] };
    const codes = new Set();
    percList.forEach((p, j) => {
      const pp = `${base}/Percepciones/Percepcion[${j + 1}]`;
      const t = p.attrs.TipoPercepcion;
      codes.add(t);
      const gv = amt(p.attrs.ImporteGravado), ev = amt(p.attrs.ImporteExento);
      if (gv === null || ev === null) { percOk = false; return; }
      g.push(gv); e.push(ev);
      if (gv + ev <= 0n) push("MX-052", `Percepcion ${j + 1} (${t}) has ImporteGravado and ImporteExento both 0; a perception pays something.`, "Remove the line, or enter its taxed or exempt amount.", pp);
      (SEPARACION.has(t) ? byGroup.separacion : JUBILACION.has(t) ? byGroup.jubilacion : byGroup.sueldos).push(gv + ev);
      if (t === "019" && !NK(p, "HorasExtra").length) push("MX-052", `Percepcion ${j + 1} is overtime (019) but carries no HorasExtra.`, "Add HorasExtra with Dias, TipoHoras, HorasExtra and ImportePagado.", `${pp}/HorasExtra`);
      if (t === "045" && !N(p, "AccionesOTitulos")) push("MX-052", `Percepcion ${j + 1} is income in shares (045) but carries no AccionesOTitulos.`, "Add AccionesOTitulos with ValorMercado and PrecioAlOtorgarse.", `${pp}/AccionesOTitulos`);
    });
    if (perc && percOk) {
      const totals = [
        ["TotalSueldos", byGroup.sueldos, "every perception other than 022, 023, 025, 039 and 044"],
        ["TotalSeparacionIndemnizacion", byGroup.separacion, "the 022, 023 and 025 perceptions (seniority premium, separation, indemnity)"],
        ["TotalJubilacionPensionRetiro", byGroup.jubilacion, "the 039 and 044 perceptions (retirement and pensions)"],
      ];
      for (const [k, list, what] of totals) {
        const want = sum(list);
        if (pa[k] === undefined) {
          if (list.length) push("MX-052", `Percepciones has no ${k}, but ${what} add up to ${money(want)}.`, `Add ${k}="${money(want)}".`, `${base}/Percepciones/@${k}`);
          continue;
        }
        const w = amt(pa[k]);
        if (w !== null && w !== want) push("MX-052", `Percepciones ${k} ${pa[k]} is not ImporteGravado + ImporteExento of ${what} (${money(want)}).`, `Set ${k}="${money(want)}".`, `${base}/Percepciones/@${k}`);
      }
      for (const [k, list, what] of [["TotalGravado", g, "ImporteGravado"], ["TotalExento", e, "ImporteExento"]]) {
        const w = amt(pa[k]);
        if (w !== null && w !== sum(list)) push("MX-052", `Percepciones ${k} ${pa[k]} is not the sum of every ${what} (${money(sum(list))}).`, `Set ${k}="${money(sum(list))}".`, `${base}/Percepciones/@${k}`);
      }
      if (byGroup.separacion.length && !N(perc, "SeparacionIndemnizacion")) push("MX-052", "A separation or indemnity perception (022, 023 or 025) is paid but Percepciones has no SeparacionIndemnizacion.", "Add SeparacionIndemnizacion with TotalPagado, NumAñosServicio, UltimoSueldoMensOrd, IngresoAcumulable and IngresoNoAcumulable.", `${base}/Percepciones/SeparacionIndemnizacion`);
      const jub = N(perc, "JubilacionPensionRetiro");
      if (byGroup.jubilacion.length && !jub) push("MX-052", "A retirement or pension perception (039 or 044) is paid but Percepciones has no JubilacionPensionRetiro.", "Add JubilacionPensionRetiro.", `${base}/Percepciones/JubilacionPensionRetiro`);
      if (codes.has("039") && codes.has("044")) push("MX-052", "Percepciones mixes 039 (retirement in one payment) and 044 (in instalments); the guide says the two exclude each other.", "Keep the one that applies.", `${base}/Percepciones`);
      else if (jub && codes.has("039")) {
        const ja = jub.attrs;
        if (ja.TotalUnaExhibicion === undefined) push("MX-052", "Retirement paid in one payment (039) needs TotalUnaExhibicion.", "Add TotalUnaExhibicion.", `${base}/Percepciones/JubilacionPensionRetiro/@TotalUnaExhibicion`);
        for (const k of ["TotalParcialidad", "MontoDiario"]) if (ja[k] !== undefined) push("MX-052", `Retirement paid in one payment (039) carries no ${k}.`, `Remove ${k}.`, `${base}/Percepciones/JubilacionPensionRetiro/@${k}`);
      } else if (jub && codes.has("044")) {
        const ja = jub.attrs;
        if (ja.TotalUnaExhibicion !== undefined) push("MX-052", "Retirement paid in instalments (044) carries no TotalUnaExhibicion.", "Remove TotalUnaExhibicion.", `${base}/Percepciones/JubilacionPensionRetiro/@TotalUnaExhibicion`);
        for (const k of ["TotalParcialidad", "MontoDiario"]) if (ja[k] === undefined) push("MX-052", `Retirement paid in instalments (044) needs ${k}.`, `Add ${k}.`, `${base}/Percepciones/JubilacionPensionRetiro/@${k}`);
      }
    } else if (perc) skipped.push(`MX-052${count > 1 ? ` (nómina ${i + 1})` : ""}: an ImporteGravado or ImporteExento is not a number, so the Percepciones totals are not compared.`);

    // ---------- deducciones ----------
    const ded = N(nom, "Deducciones");
    const dedList = NK(ded, "Deduccion");
    const da = ded?.attrs || {};
    let dedOk = true;
    const isr = [], otras = [];
    dedList.forEach((d, j) => {
      const v = amt(d.attrs.Importe);
      if (v === null) { dedOk = false; return; }
      if (v <= 0n) push("MX-053", `Deduccion ${j + 1} (${d.attrs.TipoDeduccion}) has Importe 0; a deduction must be greater than 0.`, "Remove the line or enter the amount deducted.", `${base}/Deducciones/Deduccion[${j + 1}]/@Importe`);
      (d.attrs.TipoDeduccion === "002" ? isr : otras).push(v);
    });
    if (ded && dedOk) {
      if (!isr.length && da.TotalImpuestosRetenidos !== undefined) push("MX-053", "Deducciones carries TotalImpuestosRetenidos but no deduction is ISR (002).", "Remove TotalImpuestosRetenidos, or add the ISR withheld as a Deduccion with TipoDeduccion 002.", `${base}/Deducciones/@TotalImpuestosRetenidos`);
      if (isr.length && da.TotalImpuestosRetenidos === undefined) push("MX-053", `ISR is withheld (deduction 002, ${money(sum(isr))}) but Deducciones has no TotalImpuestosRetenidos.`, `Add TotalImpuestosRetenidos="${money(sum(isr))}".`, `${base}/Deducciones/@TotalImpuestosRetenidos`);
      if (isr.length && amt(da.TotalImpuestosRetenidos) !== null && amt(da.TotalImpuestosRetenidos) !== sum(isr)) push("MX-053", `TotalImpuestosRetenidos ${da.TotalImpuestosRetenidos} is not the sum of the ISR deductions (002: ${money(sum(isr))}).`, `Set TotalImpuestosRetenidos="${money(sum(isr))}".`, `${base}/Deducciones/@TotalImpuestosRetenidos`);
      if (otras.length && da.TotalOtrasDeducciones === undefined) push("MX-053", `Deducciones other than ISR add up to ${money(sum(otras))} but TotalOtrasDeducciones is missing, so TotalDeducciones cannot add up.`, `Add TotalOtrasDeducciones="${money(sum(otras))}".`, `${base}/Deducciones/@TotalOtrasDeducciones`);
      if (amt(da.TotalOtrasDeducciones) !== null && amt(da.TotalOtrasDeducciones) !== sum(otras)) push("MX-053", `TotalOtrasDeducciones ${da.TotalOtrasDeducciones} is not the sum of the deductions other than ISR (${money(sum(otras))}).`, `Set TotalOtrasDeducciones="${money(sum(otras))}".`, `${base}/Deducciones/@TotalOtrasDeducciones`);
    } else if (ded) skipped.push(`MX-053${count > 1 ? ` (nómina ${i + 1})` : ""}: a Deduccion Importe is not a number, so the Deducciones totals are not compared.`);

    // ---------- otros pagos ----------
    const otros = N(nom, "OtrosPagos");
    const otroList = NK(otros, "OtroPago");
    let otrosOk = true;
    const otrosVals = [];
    otroList.forEach((o, j) => {
      const op = `${base}/OtrosPagos/OtroPago[${j + 1}]`;
      const t = o.attrs.TipoOtroPago;
      const v = amt(o.attrs.Importe);
      if (v === null) { otrosOk = false; return; }
      otrosVals.push(v);
      if (v <= 0n) push("MX-054", `OtroPago ${j + 1} (${t}) has Importe 0; it must be greater than 0 (for employment subsidy owed but not paid in cash, the guide's Apéndice 5 enters 0.01).`, "Enter the amount paid, or 0.01 for a subsidy not paid in cash.", `${op}/@Importe`);
      if (t === "002") {
        const s = N(o, "SubsidioAlEmpleo");
        if (!s) push("MX-054", `OtroPago ${j + 1} is employment subsidy (002) but carries no SubsidioAlEmpleo.`, "Add SubsidioAlEmpleo with SubsidioCausado, the subsidy owed under the table in Anexo 8 of the RMF.", `${op}/SubsidioAlEmpleo`);
        else if (amt(s.attrs.SubsidioCausado) !== null && amt(s.attrs.SubsidioCausado) < v) push("MX-054", `OtroPago ${j + 1}: SubsidioCausado ${s.attrs.SubsidioCausado} is less than the subsidy paid (${o.attrs.Importe}); more cannot be paid than was owed.`, "Check both amounts; an overpaid subsidy is corrected with deduction 071.", `${op}/SubsidioAlEmpleo/@SubsidioCausado`);
      }
      if (t === "004") {
        const c = N(o, "CompensacionSaldosAFavor");
        if (!c) push("MX-054", `OtroPago ${j + 1} applies an annual tax refund balance (004) but carries no CompensacionSaldosAFavor.`, "Add CompensacionSaldosAFavor with SaldoAFavor, Año and RemanenteSalFav.", `${op}/CompensacionSaldosAFavor`);
        else {
          const ca = c.attrs;
          if (amt(ca.SaldoAFavor) !== null && amt(ca.RemanenteSalFav) !== null && amt(ca.SaldoAFavor) < amt(ca.RemanenteSalFav)) push("MX-054", `OtroPago ${j + 1}: SaldoAFavor ${ca.SaldoAFavor} is less than RemanenteSalFav ${ca.RemanenteSalFav}; the remainder cannot exceed the balance.`, "Check both amounts.", `${op}/CompensacionSaldosAFavor/@RemanenteSalFav`);
          const fy = /^\d{4}/.test(na.FechaPago || "") ? Number(na.FechaPago.slice(0, 4)) : null;
          const december = /^\d{4}-12/.test(na.FechaPago || "") || /^\d{4}-12/.test(na.FechaFinalPago || "");
          if (fy && /^\d{4}$/.test(ca.Año || "") && !(Number(ca.Año) === fy - 1 || (Number(ca.Año) === fy && december))) {
            push("MX-054", `OtroPago ${j + 1}: Año ${ca.Año} is neither the year before the payment (${fy - 1}) nor, for a December pay, the payment's own year.`, `Set Año to the year the balance was worked out (${fy - 1}, or ${fy} on a December pay).`, `${op}/CompensacionSaldosAFavor/@Año`);
          }
        }
      }
    });
    if (otros && !otrosOk) skipped.push(`MX-054${count > 1 ? ` (nómina ${i + 1})` : ""}: an OtroPago Importe is not a number, so TotalOtrosPagos is not compared.`);

    // ---------- the Nomina totals (MX-051) ----------
    const tp = amt(na.TotalPercepciones), td = amt(na.TotalDeducciones), to = amt(na.TotalOtrosPagos);
    if (na.TotalPercepciones === undefined && na.TotalOtrosPagos === undefined) push("MX-051", "Nomina has neither TotalPercepciones nor TotalOtrosPagos; a payroll receipt pays one or both.", "Add the perceptions or the other payments, with their totals.", `${base}/@TotalPercepciones`);
    const pairs = [
      // Compared with the lines themselves, so a wrong subtotal (TotalSueldos, TotalOtrasDeducciones)
      // is MX-052/MX-053's finding alone and not repeated here.
      ["TotalPercepciones", perc, "Percepciones", () => sum(g) + sum(e), "every perception's ImporteGravado + ImporteExento (TotalSueldos + TotalSeparacionIndemnizacion + TotalJubilacionPensionRetiro)", !percOk],
      ["TotalDeducciones", ded, "Deducciones", () => sum(isr) + sum(otras), "every deduction's Importe (TotalOtrasDeducciones + TotalImpuestosRetenidos)", !dedOk],
      ["TotalOtrosPagos", otros, "OtrosPagos", () => sum(otrosVals), "the OtroPago amounts", !otrosOk],
    ];
    for (const [k, node, nodeName, want, what, bad] of pairs) {
      if (!node) {
        if (na[k] !== undefined) push("MX-051", `Nomina carries ${k} but has no ${nodeName}.`, `Remove ${k}, or add the ${nodeName} it totals.`, `${base}/@${k}`);
        continue;
      }
      if (na[k] === undefined) { push("MX-051", `Nomina has ${nodeName} but no ${k}.`, bad ? `Add ${k}.` : `Add ${k}="${money(want())}".`, `${base}/@${k}`); continue; }
      const w = amt(na[k]);
      if (w === null || bad) continue;
      if (w !== want()) push("MX-051", `${k} ${na[k]} is not ${what} (${money(want())}).`, `Set ${k}="${money(want())}".`, `${base}/@${k}`);
    }
    const anyBad = [na.TotalPercepciones, na.TotalDeducciones, na.TotalOtrosPagos].some((v) => v !== undefined && amt(v) === null);
    if (!anyBad) {
      out.valor = (tp ?? 0n) + (to ?? 0n);
      out.deducciones = td ?? 0n;
    }

    // ---------- dates and periods (MX-055) ----------
    const fi = day(na.FechaInicialPago), ff = day(na.FechaFinalPago);
    if (fi !== null && ff !== null && fi > ff) push("MX-055", `FechaInicialPago ${na.FechaInicialPago} is after FechaFinalPago ${na.FechaFinalPago}.`, "Swap or correct the period dates.", `${base}/@FechaInicialPago`);
    const rcp = N(nom, "Receptor");
    const ra = rcp?.attrs || {};
    if (na.TipoNomina === "O" && ra.PeriodicidadPago === "99") push("MX-055", "An ordinary payroll (TipoNomina O) has a real PeriodicidadPago, not 99 (otra periodicidad).", "Use the pay frequency (04 quincenal, 02 semanal, ...), or TipoNomina E for an extraordinary pay.", `${base}/Receptor/@PeriodicidadPago`);
    if (na.TipoNomina === "E" && ra.PeriodicidadPago && ra.PeriodicidadPago !== "99") push("MX-055", `An extraordinary payroll (TipoNomina E) has PeriodicidadPago 99, not ${ra.PeriodicidadPago}.`, "Set PeriodicidadPago=\"99\", or TipoNomina O for the ordinary pay.", `${base}/Receptor/@PeriodicidadPago`);
    const fr = day(ra.FechaInicioRelLaboral);
    if (fr !== null && ff !== null && fr > ff) push("MX-055", `FechaInicioRelLaboral ${ra.FechaInicioRelLaboral} is after the end of the pay period (${na.FechaFinalPago}).`, "Check the employment start date.", `${base}/Receptor/@FechaInicioRelLaboral`);
    else if (fr !== null && ff !== null && ra["Antigüedad"] && !seniorityFits(ra["Antigüedad"], ra.FechaInicioRelLaboral, na.FechaFinalPago)) {
      push("MX-055", `Antigüedad ${ra["Antigüedad"]} is longer than the time from FechaInicioRelLaboral ${ra.FechaInicioRelLaboral} to FechaFinalPago ${na.FechaFinalPago}.`, "Count the weeks, or the calendar years, months and days, from the start date to the end of the period.", `${base}/Receptor/@Antigüedad`);
    }

    // ---------- employment data (MX-056) ----------
    const em = N(nom, "Emisor");
    const ea = em?.attrs || {};
    if (LABOUR.has(ra.TipoContrato) && ea.RegistroPatronal === undefined) push("MX-056", `TipoContrato ${ra.TipoContrato} is an employment contract, so the employer's RegistroPatronal (social security registration) is required.`, "Add nomina12:Emisor RegistroPatronal.", `${base}/Emisor/@RegistroPatronal`);
    const group = ["NumSeguridadSocial", "FechaInicioRelLaboral", "Antigüedad", "RiesgoPuesto", "SalarioDiarioIntegrado"];
    if (ea.RegistroPatronal !== undefined) {
      const miss = group.filter((k) => ra[k] === undefined);
      if (miss.length) push("MX-056", `With a RegistroPatronal, the receptor needs ${miss.join(", ")}.`, `Add ${miss.join(", ")} to nomina12:Receptor.`, `${base}/Receptor`);
    } else if (em || !LABOUR.has(ra.TipoContrato)) {
      const extra = group.filter((k) => ra[k] !== undefined);
      if (extra.length) push("MX-056", `Without a RegistroPatronal, the receptor carries no ${extra.join(", ")}.`, `Add the employer's RegistroPatronal, or remove ${extra.join(", ")}.`, `${base}/Receptor`);
    }
    if (LABOUR.has(ra.TipoContrato) && ra.TipoRegimen && !["02", "03", "04"].includes(ra.TipoRegimen)) push("MX-056", `TipoContrato ${ra.TipoContrato} (an employment contract) goes with TipoRegimen 02, 03 or 04 (sueldos, jubilados, pensionados), not ${ra.TipoRegimen}.`, "Fix the regime or the contract type.", `${base}/Receptor/@TipoRegimen`);
    if (/^(09|1\d|99)$/.test(ra.TipoContrato || "") && ["02", "03", "04"].includes(ra.TipoRegimen)) push("MX-056", `TipoContrato ${ra.TipoContrato} (no employment contract) goes with a TipoRegimen from 05 to 99, not ${ra.TipoRegimen}.`, "Fix the regime or the contract type.", `${base}/Receptor/@TipoRegimen`);
    const erfc = root.children.find((c) => c.name === "Emisor" && c.ns === CFDI_NS)?.attrs.Rfc;
    if (ea.Curp !== undefined && personType(erfc) === "moral") push("MX-056", "The employer is a company (12-character RFC) and a company has no CURP.", "Remove nomina12:Emisor Curp.", `${base}/Emisor/@Curp`);
    for (const [node, label, p] of [[ra, "employee", "Receptor"], [ea, "employer", "Emisor"]]) {
      const c = node.Curp;
      if (!c || GENERIC_CURPS.has(c) || !/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[0-9A-Z]\d$/.test(c)) continue;
      if (curpDigit(c) !== c[17]) push("MX-056", `The ${label}'s CURP check digit does not match the rest of the CURP; a character is probably mistyped.`, "Copy the CURP from RENAPO's record (gob.mx/curp).", `${base}/${p}/@Curp`);
    }
    const cuenta = ra.CuentaBancaria;
    if (cuenta && /^\d+$/.test(cuenta)) {
      if (cuenta.length === 18) {
        if (ra.Banco !== undefined) push("MX-056", "CuentaBancaria is an 18-digit CLABE, so Banco must be left out (the CLABE names the bank).", "Remove Banco.", `${base}/Receptor/@Banco`);
        if (clabeDigit(cuenta) !== cuenta[17]) push("MX-056", "CuentaBancaria is an 18-digit CLABE whose control digit does not match; a digit is probably mistyped.", "Copy the CLABE from the employee's bank statement.", `${base}/Receptor/@CuentaBancaria`);
      } else if ([10, 11, 16].includes(cuenta.length) && ra.Banco === undefined) {
        const kind = { 10: "a mobile number", 11: "an account number", 16: "a card number" }[cuenta.length];
        push("MX-056", `CuentaBancaria has ${cuenta.length} digits (${kind}), so Banco is required.`, "Add Banco from c_Banco.", `${base}/Receptor/@Banco`);
      }
    }
    const subs = NK(rcp, "SubContratacion");
    if (subs.length) {
      const pct = subs.map((s) => dec(s.attrs.PorcentajeTiempo));
      if (pct.every((v) => v !== null) && sum(pct) !== dec("100")) push("MX-056", `The SubContratacion shares of time add up to ${show(sum(pct), 3)}%, not 100%.`, "Give each company the share of time worked there so they add up to 100.", `${base}/Receptor/SubContratacion`);
    }
    const sncf = N(em, "EntidadSNCF");
    if (sncf) {
      const sa = sncf.attrs;
      if (sa.OrigenRecurso === "IM" && sa.MontoRecursoPropio === undefined) push("MX-056", "OrigenRecurso IM (mixed funds) needs MontoRecursoPropio, the amount paid from the entity's own funds.", "Add MontoRecursoPropio.", `${base}/Emisor/EntidadSNCF/@MontoRecursoPropio`);
      if (sa.OrigenRecurso && sa.OrigenRecurso !== "IM" && sa.MontoRecursoPropio !== undefined) push("MX-056", `MontoRecursoPropio is only for mixed funds (IM), not ${sa.OrigenRecurso}.`, "Remove MontoRecursoPropio.", `${base}/Emisor/EntidadSNCF/@MontoRecursoPropio`);
      const m = amt(sa.MontoRecursoPropio);
      if (sa.OrigenRecurso === "IM" && m !== null && !anyBad && m >= (tp ?? 0n) + (to ?? 0n)) push("MX-056", `MontoRecursoPropio ${sa.MontoRecursoPropio} must be less than TotalPercepciones + TotalOtrosPagos (${money((tp ?? 0n) + (to ?? 0n))}); otherwise the funds are not mixed.`, "Check the amount, or use OrigenRecurso IP.", `${base}/Emisor/EntidadSNCF/@MontoRecursoPropio`);
    }

    // ---------- disability (MX-057) ----------
    const inc = NK(N(nom, "Incapacidades"), "Incapacidad");
    const incSum = sum(inc.map((x) => amt(x.attrs.ImporteMonetario)));
    const incBad = inc.some((x) => x.attrs.ImporteMonetario !== undefined && amt(x.attrs.ImporteMonetario) === null);
    const p014 = percList.filter((p) => p.attrs.TipoPercepcion === "014");
    const d006 = dedList.filter((d) => d.attrs.TipoDeduccion === "006");
    if ((p014.length || d006.length) && !inc.length) push("MX-057", `${p014.length ? "A disability subsidy (perception 014)" : "A disability deduction (006)"} is recorded but the complement has no Incapacidades.`, "Add Incapacidades with each Incapacidad's days, type and ImporteMonetario.", `${base}/Incapacidades`);
    else if (inc.length && !incBad && p014.length && d006.length) {
      skipped.push(`MX-057${count > 1 ? ` (nómina ${i + 1})` : ""}: the complement has both a disability subsidy (014) and a disability deduction (006), and the guide does not say how the Incapacidad amounts divide between them.`);
    } else if (inc.length && !incBad && p014.length) {
      const want = sum(p014.map((p) => (amt(p.attrs.ImporteGravado) ?? 0n) + (amt(p.attrs.ImporteExento) ?? 0n)));
      if (incSum !== want) push("MX-057", `The Incapacidad ImporteMonetario amounts add up to ${money(incSum)}, but the disability subsidy (014) pays ${money(want)}.`, "Make the ImporteMonetario values add up to the 014 perception's ImporteGravado + ImporteExento.", `${base}/Incapacidades`);
    } else if (inc.length && !incBad && d006.length) {
      const want = sum(d006.map((d) => amt(d.attrs.Importe) ?? 0n));
      if (incSum !== want) push("MX-057", `The Incapacidad ImporteMonetario amounts add up to ${money(incSum)}, but the disability deduction (006) is ${money(want)}.`, "Make the ImporteMonetario values add up to the 006 deduction's Importe.", `${base}/Incapacidades`);
    }
    return out;
  }
}
