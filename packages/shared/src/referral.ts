// Montants de départ — voir memory-match-spec.md §4, à ajuster.

/** Versé immédiatement au filleul à l'inscription, s'il vient d'un lien de parrainage. */
export const REFERRAL_SIGNUP_BONUS = 20;

/**
 * Versé au parrain quand le filleul valide sa première VRAIE victoire
 * (anti-fraude : pas juste à l'ouverture de l'app, voir spec §4).
 */
export const REFERRAL_REFERRER_BONUS = 50;

export function buildReferralStartParam(referralCode: string): string {
  return `ref_${referralCode}`;
}

export function parseReferralCodeFromStartParam(startParam: string | undefined): string | null {
  if (!startParam?.startsWith("ref_")) return null;
  return startParam.slice(4);
}
