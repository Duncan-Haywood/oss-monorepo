// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_TOKEN_HEADER, type TurnstileHandle, useTurnstile } from "./turnstile";

let handle: TurnstileHandle | null = null;
function Probe({ siteKey }: { siteKey: string | null }) {
  handle = useTurnstile("login", { siteKey });
  return <form>{handle.widget}</form>;
}

type RenderOpts = { callback?: (t: string) => void; action?: string; sitekey: string };

function fakeTurnstile() {
  const rendered: RenderOpts[] = [];
  const api = {
    render: vi.fn((_el: HTMLElement, opts: RenderOpts) => {
      rendered.push(opts);
      return `w${rendered.length}`;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return { api, rendered };
}

afterEach(() => {
  cleanup();
  window.turnstile = undefined;
  handle = null;
});

describe("useTurnstile", () => {
  it("does nothing without a site key: no script, no widget, no extra request options", async () => {
    const { container } = render(<Probe siteKey={null} />);
    expect(handle?.enabled).toBe(false);
    expect(container.querySelector("[data-turnstile]")).toBeNull();
    expect(document.querySelector("script[src*='challenges.cloudflare.com']")).toBeNull();
    expect(await handle?.authOptions()).toEqual({});
  });

  it("loads api.js from Cloudflare when a site key is set", () => {
    // Capture the <script> instead of letting happy-dom try to fetch it.
    const append = vi.spyOn(document.head, "appendChild").mockImplementation((n) => n);
    render(<Probe siteKey="1x00000000000000000000AA" />);
    const script = append.mock.calls[0]?.[0] as HTMLScriptElement | undefined;
    expect(script?.src).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
    append.mockRestore();
  });

  it("renders the widget and sends its token in the x-turnstile-token header", async () => {
    const { api, rendered } = fakeTurnstile();
    const { container, unmount } = render(<Probe siteKey="1x00000000000000000000AA" />);
    await act(async () => {});
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(rendered[0]).toMatchObject({ sitekey: "1x00000000000000000000AA", action: "login" });
    expect(container.querySelector("[data-turnstile='login']")).not.toBeNull();

    // A submit before the token arrives waits for it.
    const pending = handle?.authOptions();
    act(() => rendered[0]?.callback?.("XXXX.DUMMY.TOKEN.XXXX"));
    expect(await pending).toEqual({
      fetchOptions: { headers: { [TURNSTILE_TOKEN_HEADER]: "XXXX.DUMMY.TOKEN.XXXX" } },
    });

    // Tokens are single-use: reset() asks the widget for a new one.
    handle?.reset();
    expect(api.reset).toHaveBeenCalledWith("w1");
    unmount();
    expect(api.remove).toHaveBeenCalledWith("w1");
  });
});
