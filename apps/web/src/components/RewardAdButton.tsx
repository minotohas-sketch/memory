import type { RewardAdStatus } from "../lib/useRewardAd";

interface Props {
  label: string;
  icon: string;
  status: RewardAdStatus;
  onClick: () => void;
  disabled?: boolean;
  cooldownSeconds?: number;
}

const STATUS_LABEL: Partial<Record<RewardAdStatus, string>> = {
  watching: "Lecture…",
  confirming: "Validation…",
  done: "Reçu ! 🎉",
  unavailable: "Indisponible",
  error: "Réessaie",
};

export function formatCooldown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
}

export function RewardAdButton({
  label,
  icon,
  status,
  onClick,
  disabled,
  cooldownSeconds = 0,
}: Props) {
  const busy = status === "watching" || status === "confirming";
  const cooldownActive = cooldownSeconds > 0;

  const buttonLabel = cooldownActive
    ? formatCooldown(cooldownSeconds)
    : STATUS_LABEL[status] ?? label;

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy || cooldownActive}
      className="flex-1 flex flex-col items-center gap-1 rounded-xl bg-surface border border-surface-2 px-3 py-3 transition-all hover:border-gold/50 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span className="text-xl">{icon}</span>

      <span className="text-xs font-semibold text-cream text-center">
        {buttonLabel}
      </span>
    </button>
  );
}
