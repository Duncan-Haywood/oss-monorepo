// FakeLlm handlers for the RFQ module: a deterministic, rule-based extractor so tests and the offline
// demo work without an API key. It reads simple "Label: value" lines, like many RFQ emails do.
import type { LlmExtraction } from "@shared/extraction";
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";

type Field = { value: string | null; quote: string | null };
const none: Field = { value: null, quote: null };

function findLine(lines: string[], re: RegExp): Field {
  for (const line of lines) {
    const m = re.exec(line);
    if (m?.[1]) return { value: m[1].trim(), quote: line.trim() };
  }
  return none;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function dueDate(lines: string[]): Field {
  for (const line of lines) {
    if (!/\b(due|need(ed)? by|deliver(y)?|ship by)\b/i.test(line)) continue;
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(line);
    if (iso) return { value: iso[0], quote: line.trim() };
    const us = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(line);
    if (us) {
      const v = `${us[3]}-${us[1]?.padStart(2, "0")}-${us[2]?.padStart(2, "0")}`;
      return { value: v, quote: line.trim() };
    }
    const named =
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2}),? (\d{4})/i.exec(
        line,
      );
    if (named) {
      const month = MONTHS[(named[1] ?? "").toLowerCase()] ?? 1;
      const v = `${named[3]}-${String(month).padStart(2, "0")}-${named[2]?.padStart(2, "0")}`;
      return { value: v, quote: line.trim() };
    }
  }
  return none;
}

/** Splits the RFQ into per-part blocks at lines that start a part ("Part:", "P/N", "Part number"). */
function partBlocks(lines: string[]): string[][] {
  const starts = lines
    .map((l, i) =>
      /^\s*(?:\d+[.)]\s*)?(part\s*(?:number|no\.?|#)?|p\/n)\s*[:#]/i.test(l) ? i : -1,
    )
    .filter((i) => i >= 0);
  if (starts.length === 0) return [lines];
  return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length));
}

export function fakeExtract(req: LlmRequestBase): LlmExtraction {
  const text = req.context ?? "";
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text);
  const emailLine = lines.find((l) => email && l.includes(email[0]));
  const shared = {
    material: findLine(lines, /^\s*material\s*[:-]\s*(.+)$/i),
    finish: findLine(lines, /^\s*(?:finish|coating)\s*[:-]\s*(.+)$/i),
    tolerances: findLine(lines, /^\s*tolerances?\s*[:-]\s*(.+)$/i),
    dueDate: dueDate(lines),
  };
  const parts = partBlocks(lines).map((block) => {
    const pn = findLine(
      block,
      /^\s*(?:\d+[.)]\s*)?(?:part\s*(?:number|no\.?|#)?|p\/n)\s*[:#]\s*([A-Za-z0-9][\w\-./]*)/i,
    );
    const qtyLine = block.find((l) => /\b(qty|quantity|quantities|pcs|pieces)\b/i.test(l));
    const values = qtyLine
      ? [...qtyLine.replace(/\b(rev|revision)\s*\w+/gi, "").matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)]
          .map((m) => Number(m[0].replace(/,/g, "")))
          .filter((n) => n >= 1 && n <= 1_000_000)
          .slice(0, 8)
      : [];
    const pick = (re: RegExp, fallback: Field) => {
      const f = findLine(block, re);
      return f.value ? f : fallback;
    };
    return {
      partNumber: pn,
      revision: findLine(block, /\brev(?:ision)?\.?\s*[:#]?\s*([A-Z0-9]{1,3})\b/i),
      description: findLine(block, /^\s*(?:description|desc)\s*[:-]\s*(.+)$/i),
      material: pick(/^\s*material\s*[:-]\s*(.+)$/i, shared.material),
      quantities: { values, quote: qtyLine?.trim() ?? null },
      tolerances: pick(/^\s*tolerances?\s*[:-]\s*(.+)$/i, shared.tolerances),
      finish: pick(/^\s*(?:finish|coating)\s*[:-]\s*(.+)$/i, shared.finish),
      dueDate: (() => {
        const d = dueDate(block);
        return d.value ? d : shared.dueDate;
      })(),
    };
  });
  const missingInfo: string[] = [];
  parts.forEach((p, i) => {
    const label = p.partNumber.value ?? `part ${i + 1}`;
    if (!p.material.value) missingInfo.push(`Material for ${label}`);
    if (p.quantities.values.length === 0) missingInfo.push(`Quantity for ${label}`);
  });
  return {
    customer: {
      company: findLine(lines, /^\s*(?:company|customer)\s*[:-]\s*(.+)$/i),
      contactName: findLine(lines, /^\s*(?:contact|from|name)\s*[:-]\s*([^<@\n]+?)\s*(?:<.*)?$/i),
      email: email && emailLine ? { value: email[0], quote: emailLine.trim() } : none,
    },
    parts,
    missingInfo,
  };
}

export const rfqFakeHandlers: Record<string, FakeHandler> = {
  "rfq.extract": fakeExtract,
};
