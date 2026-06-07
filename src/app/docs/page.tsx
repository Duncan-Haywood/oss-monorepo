import fs from "fs";
import path from "path";
import Link from "next/link";

export default function DocsIndex() {
  const docsDir = path.join(process.cwd(), "docs");
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith(".md"));

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Business Plan & Documentation</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {files.map((file) => {
          const slug = file.replace(".md", "").toLowerCase();
          const title = file.replace(".md", "").replace(/-/g, " ");
          return (
            <Link key={slug} href={`/docs/${slug}`} className="block bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-gray-300 transition-colors">
              <h2 className="text-xl font-bold text-gray-900 capitalize">{title}</h2>
              <p className="text-gray-500 mt-2">Read the {title.toLowerCase()} document.</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
