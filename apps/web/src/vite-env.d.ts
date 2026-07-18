/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_TELEGRAM_APP_SHORTNAME?: string;
  readonly VITE_ADSGRAM_ENERGY_BLOCK_ID?: string;
  readonly VITE_ADSGRAM_BONUS_BLOCK_ID?: string;
  readonly VITE_ADSGRAM_INTERSTITIAL_BLOCK_ID?: string;
  readonly VITE_ADSGRAM_TASK_BLOCK_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
