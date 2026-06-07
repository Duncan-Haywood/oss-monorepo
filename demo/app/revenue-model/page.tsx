import fs from "fs";
import path from "path";
import { MarkdownDoc } from "@/components/MarkdownDoc";

export default async function RevenueModelPage() {
  const filePath = path.join(process.cwd(), "..", "docs", "REVENUE-MODEL.md");
  const content = fs.readFileSync(filePath, "utf8");

  return <MarkdownDoc content={content} />;
}
