// The whole rate card as one Excel workbook: one worksheet per sheet the import reads (shop settings,
// machines, materials, cut speeds, removal rates, drill feeds, finishing), each holding exactly the
// rows of that sheet's CSV export. So a shop downloads one file, edits it in Excel, and imports any
// tab back: the import page picks the tab's kind from its name (sheetKindFor). The CSV exports stay
// the source of each tab's layout, so the round trip the CSV tests prove holds tab by tab.
import type { RateCardDto } from "./api";
import { exportCutSpeedCsv } from "./cut-speed-import";
import { exportMaterialRateCsv, type MaterialRateKind } from "./material-rate-import";
import { exportRateCsv, type RateImportKind } from "./rate-card-import";
import { exportSettingsCsv } from "./settings-import";
import { parseCsv } from "./sheet/csv";
import { type WriteSheet, writeXlsx } from "./sheet/xlsx-write";

/** What a sheet holds: one rate kind, a table by machine and material, or the shop settings. */
export type RateCardSheetKind = RateImportKind | "cut-speeds" | MaterialRateKind | "settings";

/** Tab names in the workbook, in tab order (the import page's order). */
export const WORKBOOK_TABS: { kind: RateCardSheetKind; tab: string }[] = [
  { kind: "settings", tab: "Shop settings" },
  { kind: "machines", tab: "Machines" },
  { kind: "materials", tab: "Materials" },
  { kind: "cut-speeds", tab: "Cut speeds" },
  { kind: "removal-rates", tab: "Removal rates" },
  { kind: "drill-feeds", tab: "Drill feeds" },
  { kind: "finishing-ops", tab: "Finishing" },
];

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const BY_TAB = new Map<string, RateCardSheetKind>([
  ...WORKBOOK_TABS.map((t) => [key(t.tab), t.kind] as const),
  // The names a shop is likely to give the same tab by hand.
  ["settings", "settings"],
  ["machines and work centers", "machines"],
  ["work centers", "machines"],
  ["cut chart", "cut-speeds"],
  ["finishing ops", "finishing-ops"],
  ["finishing and outside services", "finishing-ops"],
  ["outside services", "finishing-ops"],
]);

/** The kind a worksheet holds, from its tab name; null when the name says nothing we know. */
export function sheetKindFor(tabName: string): RateCardSheetKind | null {
  return BY_TAB.get(key(tabName)) ?? null;
}

/** Columns of names and words, never numbers, so "1.50" in a description stays "1.50". */
const TEXT_HEADER =
  /^(machine|material|kind|finish|setting|pricing basis|stock description|outside service|active)$/i;

/** One tab's grid: the CSV export of that kind, parsed back into cells. */
export function workbookGrid(card: RateCardDto, kind: RateCardSheetKind): string[][] {
  const csv =
    kind === "settings"
      ? exportSettingsCsv(card.settings)
      : kind === "cut-speeds"
        ? exportCutSpeedCsv(card)
        : kind === "removal-rates" || kind === "drill-feeds"
          ? exportMaterialRateCsv(kind, card)
          : exportRateCsv(
              kind,
              kind === "machines"
                ? card.machines
                : kind === "materials"
                  ? card.materials
                  : card.finishingOps,
            );
  return parseCsv(csv).filter((r) => r.length > 0);
}

/** Every tab of the workbook, as cells (exported for tests and for a preview). */
export function rateCardWorkbookSheets(card: RateCardDto): WriteSheet[] {
  return WORKBOOK_TABS.map(({ kind, tab }) => {
    const grid = workbookGrid(card, kind);
    const header = grid[0] ?? [];
    return {
      name: tab,
      grid,
      headerRow: 1,
      textColumns: header.flatMap((h, i) => (i === 0 || TEXT_HEADER.test(h.trim()) ? [i] : [])),
    };
  });
}

/** The whole rate card as .xlsx bytes. */
export function rateCardWorkbook(card: RateCardDto): Promise<Uint8Array> {
  return writeXlsx(rateCardWorkbookSheets(card));
}
