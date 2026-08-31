/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_PASSCODE?: string;
  readonly VITE_PILOT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
