import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownDoc({ content }: { content: string }) {
  return (
    <div className="prose prose-indigo max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
