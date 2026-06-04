import fs from "node:fs/promises";
import path from "node:path";

const REPO_DOCS = path.resolve(process.cwd(), "../docs");

export async function readRepoMarkdown(relativePath: string): Promise<string> {
  const full = path.join(REPO_DOCS, relativePath);
  return fs.readFile(full, "utf8");
}
