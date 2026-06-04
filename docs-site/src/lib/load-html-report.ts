import fs from "node:fs/promises";
import path from "node:path";
import type { GeneratedHtmlReport } from "@/lib/types";

const GENERATED = path.resolve(process.cwd(), "src/generated");

export async function loadHtmlReport(
  slug: string,
): Promise<GeneratedHtmlReport | null> {
  try {
    const raw = await fs.readFile(
      path.join(GENERATED, `${slug}.json`),
      "utf8",
    );
    return JSON.parse(raw) as GeneratedHtmlReport;
  } catch {
    return null;
  }
}
