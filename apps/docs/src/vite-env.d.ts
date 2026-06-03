/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_PASSCODE?: string;
  readonly VITE_DOCS_REQUIRE_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
