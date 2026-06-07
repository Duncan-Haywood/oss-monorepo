import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export async function generateStaticParams() {
  const docsDir = path.join(process.cwd(), "docs");
  const files = fs.readdirSync(docsDir);
  
  return files
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      slug: file.replace(".md", "").toLowerCase(),
    }));
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const docsDir = path.join(process.cwd(), "docs");
  const files = fs.readdirSync(docsDir);
  
  const file = files.find(
    (f) => f.toLowerCase() === `${params.slug}.md`
  );

  if (!file) {
    return <div>Doc not found</div>;
  }

  const content = fs.readFileSync(path.join(docsDir, file), "utf8");

  return (
    <div className="prose prose-blue max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
