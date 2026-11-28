// Posts the "Start free" link's page (lib/signup-source.ts) once the visitor is signed in. Called by
// the signed-in pages (onboarding and the shop layout), which already read /api/me.
import { useEffect } from "react";
import { ApiError, api } from "./api";
import { browserStore, clearSignupSource, pendingSignupSource } from "./signup-source";

export function usePostSignupSource(signedInId: string | undefined): void {
  useEffect(() => {
    if (!signedInId) return;
    const store = browserStore();
    const source = pendingSignupSource(store);
    if (!source) return;
    api("/api/me/signup-source", { method: "POST", body: { source } }).then(
      () => clearSignupSource(store),
      // A 400 (not a page name) is final; a network, auth, rate-limit or server error retries on
      // the next load, until the entry ages out of the window.
      (e) => e instanceof ApiError && e.status === 400 && clearSignupSource(store),
    );
  }, [signedInId]);
}
