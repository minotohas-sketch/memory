// ==========================================
// AdsGram SDK Types
// Reward / Interstitial / Task
// ==========================================

export interface AdsgramShowResult {
  done?: boolean;
  description?: string;
  state?: string;
  error?: boolean;
}

export interface AdsgramController {
  show(): Promise<AdsgramShowResult>;
  destroy(): void;
  addEventListener(
    event: string,
    cb: (event?: CustomEvent | Event | unknown) => void
  ): void;
  removeEventListener(
    event: string,
    cb: (event?: CustomEvent | Event | unknown) => void
  ): void;
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

// ==========================================
// React JSX support for <adsgram-task>
// ==========================================

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "adsgram-task": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        ref?: React.Ref<HTMLElement>;

        "data-block-id"?: string;

        "data-debug"?: boolean | string;

        "data-debug-console"?: boolean | string;

        className?: string;
      };
    }
  }
}

export {};
