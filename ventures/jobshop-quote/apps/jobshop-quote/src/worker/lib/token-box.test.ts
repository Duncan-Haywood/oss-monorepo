import { describe, expect, it } from "vitest";
import { openJson, sealJson, sha256Hex, TokenBoxError } from "./token-box";

const KEY = "k".repeat(40);

describe("token box", () => {
  it("round-trips, with a fresh IV each time and no plaintext in the output", async () => {
    const tokens = { accessToken: "secret-access", refreshToken: "secret-refresh" };
    const a = await sealJson(KEY, "qbo-tokens-v1", "org_a", tokens);
    const b = await sealJson(KEY, "qbo-tokens-v1", "org_a", tokens);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret");
    expect(await openJson(KEY, "qbo-tokens-v1", "org_a", a)).toEqual(tokens);
  });

  it("refuses another org, another purpose, another key and a tampered value", async () => {
    const sealed = await sealJson(KEY, "qbo-tokens-v1", "org_a", { x: 1 });
    await expect(openJson(KEY, "qbo-tokens-v1", "org_b", sealed)).rejects.toThrow(TokenBoxError);
    await expect(openJson(KEY, "other", "org_a", sealed)).rejects.toThrow(TokenBoxError);
    await expect(openJson("j".repeat(40), "qbo-tokens-v1", "org_a", sealed)).rejects.toThrow(
      TokenBoxError,
    );
    const [v, iv, ct] = sealed.split(".");
    const flipped = `${v}.${iv}.${ct?.startsWith("A") ? `B${ct.slice(1)}` : `A${ct?.slice(1)}`}`;
    await expect(openJson(KEY, "qbo-tokens-v1", "org_a", flipped)).rejects.toThrow(TokenBoxError);
    await expect(openJson(KEY, "qbo-tokens-v1", "org_a", "plain")).rejects.toThrow(TokenBoxError);
  });

  it("refuses a short key", async () => {
    await expect(sealJson("short", "p", "o", {})).rejects.toThrow(/32 characters/);
  });

  it("hashes with SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
