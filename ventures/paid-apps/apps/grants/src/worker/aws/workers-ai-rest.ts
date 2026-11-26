// The `AI` binding on AWS: the same Workers AI models over Cloudflare's REST API (docs/AWS.md).
//
// Embeddings (bge-m3), document conversion (toMarkdown) and Whisper have no drop-in AWS
// equivalent that keeps stored vectors comparable: switching the embedding model means
// re-embedding every org's chunks. So during and after the cutover grants keeps calling the same
// models from Lambda, through NAT, with a Workers-AI-only API token (Secrets Manager). Moving to
// Bedrock is a separate, measured change (re-embed + eval), not part of the platform move.
// Only the two methods ports/workers-ai.ts calls exist here.

export interface WorkersAiRestConfig {
  accountId: string;
  apiToken: string;
  fetch?: typeof fetch;
}

export class WorkersAiRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkersAiRestError";
  }
}

interface CfEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: { message?: string }[];
}

export class WorkersAiRest {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly cfg: WorkersAiRestConfig) {
    if (!/^[a-f0-9]{32}$/.test(cfg.accountId)) throw new Error("invalid Cloudflare account id");
    this.base = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai`;
    this.doFetch = cfg.fetch ?? fetch;
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.doFetch(`${this.base}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        Authorization: `Bearer ${this.cfg.apiToken}`,
      },
    });
    const body = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
    if (!res.ok || body.success === false || body.result === undefined) {
      const msg =
        body.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join("; ") || `HTTP ${res.status}`;
      throw new WorkersAiRestError(`Workers AI: ${msg}`, res.status);
    }
    return body.result;
  }

  run(model: string, inputs: unknown): Promise<unknown> {
    if (!/^@cf\/[a-z0-9._/-]+$/i.test(model)) throw new Error("invalid Workers AI model id");
    return this.call(`/run/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });
  }

  async toMarkdown(file: { name: string; blob: Blob }): Promise<unknown> {
    const form = new FormData();
    form.append("files", file.blob, file.name);
    const result = await this.call<unknown>("/tomarkdown", { method: "POST", body: form });
    return Array.isArray(result) ? result[0] : result;
  }
}

/** The REST client typed as the AI binding ports/workers-ai.ts expects. */
export function createWorkersAiRest(cfg: WorkersAiRestConfig): Ai {
  return new WorkersAiRest(cfg) as unknown as Ai;
}
