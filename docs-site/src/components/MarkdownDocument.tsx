import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MarkdownDocument.module.css";

type MarkdownDocumentProps = {
  title: string;
  source: string;
  sourceFile: string;
};

export function MarkdownDocument({ title, source, sourceFile }: MarkdownDocumentProps) {
  return (
    <article className={styles.wrapper}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Internal document (built from markdown)</p>
        <h1>{title}</h1>
        <p className={styles.source}>
          Source: <code>{sourceFile}</code>
        </p>
      </header>
      <div className={styles.prose}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
      </div>
    </article>
  );
}
