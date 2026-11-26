// Public API of the ingestion module (documents → text → chunks → embeddings).
// Other modules import from here, e.g. imports (website pages) and interview (transcripts):
//   const { documentId } = await createDocumentFromText(ctx, orgId, { title, kind: "website_page", text, sourceUrl });
export {
  type ChunkOptions,
  chunkMarkdown,
  DEFAULT_CHUNK_OPTIONS,
  estimateTokens,
  type MarkdownChunk,
} from "./chunk";
export {
  type CreateDocumentInput,
  type CreateTextDocumentInput,
  createDocument,
  createDocumentFromText,
  type DocumentRow,
  deleteDocument,
  documentPrefix,
  getDocument,
  getDocumentDetail,
  getDocumentText,
  listDocuments,
  reprocessDocument,
} from "./documents";
export { MAX_TEXT_CHARS, MAX_UPLOAD_BYTES, resolveMimeType } from "./files";
