import { describe, expect, it, vi } from "vitest";
import { reportGate } from "./reportAccess";

const V = "https://api.example.com/validate";
const yes = (valid: boolean) => vi.fn(async () => ({ json: async () => ({ valid }) }) as unknown as Response);

describe("reportGate", () => {
  it("is 404 and never calls the network while no checkout link is set", async () => {
    const f = yes(true);
    const g = await reportGate("ABCD-1234-EFGH", { checkoutUrl: "", validateUrl: V, fetch: f as never });
    expect(g).toMatchObject({ ok: false, status: 404 });
    expect(f).not.toHaveBeenCalled();
  });
  it("is 402 with no key", async () => {
    expect(await reportGate(null, { checkoutUrl: "https://buy.example.com/x", validateUrl: V })).toMatchObject({ status: 402 });
  });
  it("is 403 for a rejected key and for a malformed one", async () => {
    const o = { checkoutUrl: "https://buy.example.com/x", validateUrl: V };
    expect(await reportGate("ABCD-1234-EFGH", { ...o, fetch: yes(false) as never })).toMatchObject({ status: 403 });
    expect(await reportGate("no", o)).toMatchObject({ status: 403 });
  });
  it("opens only for a key the provider says is valid", async () => {
    const g = await reportGate("ABCD-1234-EFGH", { checkoutUrl: "https://buy.example.com/x", validateUrl: V, fetch: yes(true) as never });
    expect(g).toEqual({ ok: true });
  });
  it("is 403 when the provider cannot be reached", async () => {
    const f = vi.fn(async () => { throw new Error("offline"); });
    const g = await reportGate("ABCD-1234-EFGH", { checkoutUrl: "https://buy.example.com/x", validateUrl: V, fetch: f as never });
    expect(g).toMatchObject({ ok: false, status: 403 });
  });
});
