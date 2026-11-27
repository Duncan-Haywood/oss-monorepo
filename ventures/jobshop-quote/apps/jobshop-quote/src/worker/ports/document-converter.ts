// Converts uploaded files (PDF, DOCX, HTML, TXT, images...) to markdown text.
export interface DocumentConverter {
  toMarkdown(file: {
    name: string;
    mimeType: string;
    bytes: ArrayBuffer;
  }): Promise<{ markdown: string }>;
}
