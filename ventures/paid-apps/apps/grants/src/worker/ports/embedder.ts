export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
