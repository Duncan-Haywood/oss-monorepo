import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownDocumentProps = {
  source: string;
};

export function MarkdownDocument({ source }: MarkdownDocumentProps) {
  return (
    <article className="md-doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </article>
  );
}
