/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_DEV_API_PROXY: string;
  readonly VITE_API_BASE: string;
  readonly VITE_API_URL: string;
  /** Prefijo público SPA. Ej: `/almahue-erp/`. Default `/` (dev). */
  readonly VITE_BASE_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
