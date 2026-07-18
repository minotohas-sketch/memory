// Typage minimal du SDK Adsgram (Reward/Interstitial) et déclaration JSX pour
// le web component <adsgram-task>. Voir memory-match-spec.md §5 pour le détail
// vérifié de l'intégration (formats de blockId, Reward URL S2S, etc.)

export interface AdsgramShowResult {
  done?: boolean;
  description?: string;
  state?: string;
  error?: boolean;
}

export interface AdsgramController {
  show(): Promise<AdsgramShowResult>;
  destroy(): void;
  addEventListener(event: string, cb: (e?: unknown) => void): void;
  removeEventListener(event: string, cb: (e?: unknown) => void): void;
}

export interface AdsgramInitParams {
  blockId: string;
  debug?: boolean;
  debugBannerType?: "FullscreenMedia" | "RewardedVideo";
}

declare global {
  interface Window {
    Adsgram?: {
      init(params: AdsgramInitParams): AdsgramController;
    };
  }
}

// React 19 déclare IntrinsicElements sous `declare module "react" { namespace JSX }`,
// pas dans un namespace JSX global — vérifié directement dans les types installés
// (node_modules/@types/react), la doc étant ambiguë à ce sujet selon les versions.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "adsgram-task": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};
