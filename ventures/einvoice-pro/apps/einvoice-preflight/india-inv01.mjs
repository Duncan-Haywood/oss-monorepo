// India e-invoice payload (IRP schema INV-01, version 1.1) pre-check: the
// mandatory blocks, GSTINs, PIN codes, dates, the IGST versus CGST+SGST split
// by place of supply, line arithmetic and the ValDtls totals. Field names and
// rules are from memory of the public schema and secondary guides, not read from
// the IRP specification or its JSON schema (einvoice1.gst.gov.in unread).
import { checkGstin, checkDocumentNumber, DOC_TYPES } from "./india.mjs";

const SUPPLY_TYPES = ["B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"];
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 14, 18, 28, 40];
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 1.01; // IRP tolerates rounding up to 1 rupee

function dmy(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? d : null;
}

// Returns { ok, problems: [{ path, message }] }.
export function checkInv01(input) {
  const problems = [];
  const bad = (path, message) => problems.push({ path, message });
  let doc = input;
  if (typeof input === "string") {
    try { doc = JSON.parse(input); } catch { return { ok: false, problems: [{ path: "", message: "Not valid JSON." }] }; }
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, problems: [{ path: "", message: "Expected one JSON object." }] };

  if (doc.Version !== "1.1") bad("Version", `Version should be "1.1"; this has ${JSON.stringify(doc.Version)}.`);
  const tran = doc.TranDtls || {};
  if (tran.TaxSch !== "GST") bad("TranDtls.TaxSch", 'TaxSch should be "GST".');
  if (!SUPPLY_TYPES.includes(tran.SupTyp)) bad("TranDtls.SupTyp", `SupTyp should be one of ${SUPPLY_TYPES.join(", ")}.`);

  const dd = doc.DocDtls || {};
  if (!DOC_TYPES.includes(dd.Typ)) bad("DocDtls.Typ", `Typ should be one of ${DOC_TYPES.join(", ")}.`);
  for (const p of checkDocumentNumber(dd.No).problems) bad("DocDtls.No", p);
  const date = dmy(dd.Dt);
  if (!date) bad("DocDtls.Dt", "Date should be DD/MM/YYYY and a real day.");
  else if (date.getTime() > Date.now() + 864e5) bad("DocDtls.Dt", "The document date is in the future; the IRP refuses it.");

  const party = (key, label) => {
    const p = doc[key];
    if (!p) return bad(key, `${label} block is missing.`);
    const g = checkGstin(p.Gstin);
    for (const m of g.problems) bad(`${key}.Gstin`, m);
    if (!p.LglNm) bad(`${key}.LglNm`, "Legal name is missing.");
    if (!p.Addr1) bad(`${key}.Addr1`, "Address line 1 is missing.");
    if (!p.Loc) bad(`${key}.Loc`, "Location is missing.");
    if (!/^[1-9][0-9]{5}$/.test(String(p.Pin ?? ""))) bad(`${key}.Pin`, "PIN should be six digits and not start with 0.");
    if (!/^(0[1-9]|[1-3][0-9]|9[79])$/.test(String(p.Stcd ?? ""))) bad(`${key}.Stcd`, "State code should be a two-digit GST state code.");
    else if (g.gstin && g.gstin.length === 15 && /^[0-9]{2}/.test(g.gstin) && g.gstin.slice(0, 2) !== String(p.Stcd) && tran.SupTyp === "B2B" && key === "SellerDtls") {
      bad(`${key}.Stcd`, `State code ${p.Stcd} differs from the GSTIN's first two digits (${g.gstin.slice(0, 2)}).`);
    }
    return p;
  };
  const seller = party("SellerDtls", "Seller");
  const buyer = party("BuyerDtls", "Buyer");
  if (buyer && !buyer.Pos) bad("BuyerDtls.Pos", "Place of supply (Pos) is missing.");

  const items = Array.isArray(doc.ItemList) ? doc.ItemList : [];
  if (!items.length) bad("ItemList", "At least one line item is required.");
  if (items.length > 1000) bad("ItemList", "The IRP accepts up to 1,000 lines.");
  const intra = seller && buyer && buyer.Pos && String(seller.Stcd) === String(buyer.Pos);
  const sum = { ass: 0, cgst: 0, sgst: 0, igst: 0, tot: 0 };
  items.forEach((it, i) => {
    const at = (f) => `ItemList[${i}].${f}`;
    if (!/^[0-9]{4,8}$/.test(String(it.HsnCd ?? ""))) bad(at("HsnCd"), "HSN/SAC code should be 4 to 8 digits.");
    if (!["Y", "N"].includes(it.IsServc)) bad(at("IsServc"), 'IsServc should be "Y" or "N".');
    if (!GST_RATES.includes(Number(it.GstRt))) bad(at("GstRt"), `GST rate ${it.GstRt} is not a slab I know (${GST_RATES.join(", ")}).`);
    const gross = Number(it.Qty) * Number(it.UnitPrice);
    if (!(Number(it.Qty) >= 0) || !(Number(it.UnitPrice) >= 0)) bad(at("UnitPrice"), "Qty and UnitPrice should be numbers of at least 0.");
    else if (!near(it.TotAmt, gross)) bad(at("TotAmt"), `TotAmt ${it.TotAmt} is not Qty x UnitPrice (${gross.toFixed(2)}).`);
    const ass = Number(it.TotAmt) - Number(it.Discount || 0);
    if (!near(it.AssAmt, ass)) bad(at("AssAmt"), `AssAmt ${it.AssAmt} should be TotAmt minus Discount (${ass.toFixed(2)}).`);
    const tax = (Number(it.AssAmt) * Number(it.GstRt)) / 100;
    const [c, s, g] = [it.CgstAmt, it.SgstAmt, it.IgstAmt].map((x) => Number(x || 0));
    if (intra && g) bad(at("IgstAmt"), "Seller state equals place of supply, so tax is CGST plus SGST, not IGST.");
    if (seller && buyer && buyer.Pos && !intra && (c || s)) bad(at("CgstAmt"), "Seller state differs from place of supply, so tax is IGST, not CGST/SGST.");
    if (!near(c + s + g, tax)) bad(at("GstRt"), `Tax ${(c + s + g).toFixed(2)} is not ${it.GstRt}% of AssAmt (${tax.toFixed(2)}).`);
    const total = ass + c + s + g + Number(it.OthChrg || 0);
    if (!near(it.TotItemVal, total)) bad(at("TotItemVal"), `TotItemVal ${it.TotItemVal} should be ${total.toFixed(2)}.`);
    sum.ass += Number(it.AssAmt); sum.cgst += c; sum.sgst += s; sum.igst += g; sum.tot += Number(it.TotItemVal);
  });

  const v = doc.ValDtls;
  if (!v) bad("ValDtls", "Value details block is missing.");
  else {
    for (const [k, got, want] of [["AssVal", v.AssVal, sum.ass], ["CgstVal", v.CgstVal || 0, sum.cgst], ["SgstVal", v.SgstVal || 0, sum.sgst], ["IgstVal", v.IgstVal || 0, sum.igst]]) {
      if (!near(got, want)) bad(`ValDtls.${k}`, `${k} ${got} is not the sum of the lines (${want.toFixed(2)}).`);
    }
    const want = sum.tot - Number(v.Disc || 0) + Number(v.OthChrg || 0) + Number(v.RndOffAmt || 0);
    if (!near(v.TotInvVal, want)) bad("ValDtls.TotInvVal", `TotInvVal ${v.TotInvVal} should be ${want.toFixed(2)} (lines, less header discount, plus other charges and rounding).`);
  }
  return { ok: problems.length === 0, problems };
}
