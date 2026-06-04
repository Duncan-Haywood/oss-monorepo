import styles from "./HtmlDocument.module.css";

type HtmlDocumentProps = {
  title: string;
  css: string;
  html: string;
  sourceFile: string;
};

export function HtmlDocument({ title, css, html, sourceFile }: HtmlDocumentProps) {
  return (
    <article className={styles.wrapper}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>HTML report (built from source)</p>
        <h1>{title}</h1>
        <p className={styles.source}>
          Source: <code>{sourceFile}</code>
        </p>
      </header>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <div
        className={styles.htmlBody}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
