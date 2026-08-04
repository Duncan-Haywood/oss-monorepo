/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_PASSCODE?: string;
  readonly VITE_DOCS_GATE_ENABLED?: string;
  readonly VITE_DOCS_REQUIRE_AUTH?: string;
  readonly VITE_DOCS_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
