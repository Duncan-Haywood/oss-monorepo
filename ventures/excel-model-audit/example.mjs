// The worked example on the page: a made-up 12-month plan with seven
// faults planted, each of a kind model reviewers report most. Built as a
// real .xlsx so the same reader that audits a user's file reads it, and
// the page can offer it for download.
import { buildXlsx } from "./xlsxwrite.mjs";

const COLS = "BCDEFGHIJKLM".split("");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function exampleSpec() {
  const inputs = {
    A1: "Inputs", A3: "Starting customers", B3: 400, A4: "Monthly growth", B4: 0.04, A5: "Price per customer", B5: 49,
    A6: "Cost per customer", B6: "18", A7: "Fixed costs per month", B7: 9500, A8: "Interest rate on cash (annual)", B8: 0.03,
  };
  const p = { A1: "12-month plan", A3: "Month", A4: "Customers", A5: "Revenue", A6: "Variable cost", A7: "Fixed cost", A8: "Gross profit", A9: "Interest", A10: "Profit", A12: "Cash", A14: "Revenue per fixed cost", N3: "Year" };
  COLS.forEach((c, i) => {
    const prev = i ? COLS[i - 1] : null;
    p[`${c}3`] = MONTHS[i];
    p[`${c}4`] = i ? `=${prev}4*(1+Inputs!$B$4)` : "=Inputs!B3";
    p[`${c}5`] = `=${c}4*Inputs!$B$5`;
    p[`${c}6`] = `=${c}4*Inputs!$B$6`;
    p[`${c}7`] = "=Inputs!$B$7";
    p[`${c}8`] = `=${c}5-${c}6-${c}7`;
    p[`${c}9`] = i ? `=${prev}12*Inputs!$B$8/12` : 0;
    p[`${c}10`] = `=${c}8+${c}9`;
    p[`${c}12`] = i ? `=${prev}12+${c}10` : `=50000+${c}10`;
    p[`${c}14`] = { f: `${c}5/${c}7`, v: 2 };
  });
  // Faults: a mistyped reference (Jul revenue uses Jun's customers), a
  // typed-over formula (Sep variable cost), a growth rate typed into one
  // formula, a SUM that stops a row short, a circular interest line, a
  // #DIV/0! from a blank fixed cost, and a cost typed as text on Inputs.
  p.H5 = "=G4*Inputs!$B$5";
  p.J6 = 8200;
  p.L4 = "=K4*(1+0.04)";
  p.N5 = "=SUM(B5:L5)";
  p.N10 = "=SUM(B10:M10)";
  p.E9 = "=E12*Inputs!$B$8/12";
  p.M7 = "=Inputs!$B$9";
  p.M14 = { f: "M5/M7", e: "#DIV/0!" };
  return { sheets: [{ name: "Inputs", cells: inputs }, { name: "Plan", cells: p }] };
}

export function exampleWorkbook() { return buildXlsx(exampleSpec()); }
