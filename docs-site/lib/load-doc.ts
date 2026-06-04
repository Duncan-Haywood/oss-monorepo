import fs from "node:fs/promises";
import path from "node:path";
import type { DocEntry } from "@/lib/manifest";

export type DocPayload = DocEntry & {
  html: string;
};

export async function loadDocPayload(slug: string): Promise<DocPayload | null> {
  const file = path.join(process.cwd(), "generated", "html", `${slug}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as DocPayload;
  } catch {
    return null;
  }
}
