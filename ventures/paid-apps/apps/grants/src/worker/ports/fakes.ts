// Deterministic fakes for every external port. Used when FAKE_EXTERNALS=true (tests + offline demo).
import type { BillingProvider, BillingWebhookEvent, CheckoutRequest } from "./billing-provider";
import type { DocumentConverter } from "./document-converter";
import type { EmailMessage, EmailSender } from "./email";
import type { Embedder } from "./embedder";
import type { Transcriber } from "./transcriber";
import type { VectorMatch, VectorRecord, VectorStore } from "./vector-store";
import type { FetchResult, WebFetcher } from "./web-fetcher";

/** Bag-of-words hashing embedder: similar texts get similar vectors. Deterministic. */
export class FakeEmbedder implements Embedder {
  readonly dimensions = 256;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(this.dimensions).fill(0);
      for (const word of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        let h = 2166136261;
        for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
        const idx = Math.abs(h) % this.dimensions;
        v[idx] = (v[idx] ?? 0) + 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}

/** In-memory vector store (per isolate). Good enough for tests and single-instance demos. */
export class InMemoryVectorStore implements VectorStore {
  private spaces = new Map<string, Map<string, VectorRecord>>();
  async upsert(ns: string, records: VectorRecord[]) {
    const space = this.spaces.get(ns) ?? new Map();
    for (const r of records) space.set(r.id, r);
    this.spaces.set(ns, space);
  }
  async query(
    ns: string,
    vector: number[],
    opts: { topK: number; filter?: Record<string, string> },
  ) {
    const space = this.spaces.get(ns) ?? new Map<string, VectorRecord>();
    const out: VectorMatch[] = [];
    for (const r of space.values()) {
      if (opts.filter && Object.entries(opts.filter).some(([k, v]) => r.metadata[k] !== v))
        continue;
      let dot = 0;
      for (let i = 0; i < vector.length; i++) dot += (vector[i] ?? 0) * (r.values[i] ?? 0);
      out.push({ id: r.id, score: dot, metadata: r.metadata });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, opts.topK);
  }
  async deleteByIds(ns: string, ids: string[]) {
    const space = this.spaces.get(ns);
    for (const id of ids) space?.delete(id);
  }
}

/** Handles text-like formats only; tests upload .txt/.md/.html fixtures. */
export class FakeDocumentConverter implements DocumentConverter {
  async toMarkdown(file: { name: string; mimeType: string; bytes: ArrayBuffer }) {
    const text = new TextDecoder().decode(file.bytes);
    const markdown = file.mimeType.includes("html") ? text.replace(/<[^>]+>/g, " ") : text;
    return { markdown };
  }
}

export class FakeTranscriber implements Transcriber {
  async transcribe(audio: ArrayBuffer) {
    return { text: `[fake transcript of ${audio.byteLength} bytes of audio]` };
  }
}

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    return { id: `fake-email-${this.sent.length}` };
  }
}

/** Serves fixtures registered by URL; anything else is 404. robots.txt allows everything. */
export class FakeWebFetcher implements WebFetcher {
  constructor(private fixtures: Record<string, FetchResult | unknown> = {}) {}
  set(url: string, value: FetchResult | unknown) {
    this.fixtures[url] = value;
  }
  async fetchPage(url: string): Promise<FetchResult | null> {
    const f = this.fixtures[url] as FetchResult | undefined;
    return f ?? { url, status: 404, contentType: "text/plain", body: "not found" };
  }
  async fetchJson<T>(url: string): Promise<T> {
    if (!(url in this.fixtures)) throw new Error(`FakeWebFetcher: no JSON fixture for ${url}`);
    return this.fixtures[url] as T;
  }
}

export class FakeBillingProvider implements BillingProvider {
  readonly name = "fake";
  async createCheckout(req: CheckoutRequest) {
    return {
      url: `${req.successUrl}${req.successUrl.includes("?") ? "&" : "?"}fake_checkout=${req.planKey}`,
    };
  }
  async createPortalSession(_id: string, returnUrl: string) {
    return { url: returnUrl };
  }
  async parseWebhook(request: Request): Promise<BillingWebhookEvent> {
    return (await request.json()) as BillingWebhookEvent;
  }
}
