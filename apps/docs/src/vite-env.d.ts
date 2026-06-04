/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCS_PASSCODE?: string;
  readonly VITE_DOCS_AUTH_DISABLED?: string;
  readonly VITE_DOCS_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
