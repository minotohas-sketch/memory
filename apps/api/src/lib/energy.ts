// Système d'énergie à régénération passive. Les calculs de lecture (/api/me)
// et de dépense (/api/game/start) partagent cette même logique pour rester
// cohérents entre eux.

export const MAX_ENERGY = 5;
export const ENERGY_REGEN_MINUTES = 30;

export interface EnergyState {
  energy: number;
  energyUpdatedAt: number; // ms epoch
}

/**
 * Calcule l'énergie régénérée depuis energyUpdatedAt. Contrairement à un simple
 * "reset du chrono à chaque lecture", la progression partielle vers le prochain
 * point est préservée (on n'avance l'horodatage que du nombre de minutes
 * réellement "consommées" par les ticks appliqués), sauf une fois au max où
 * le chrono n'a plus de sens tant qu'on ne dépense pas.
 */
export function applyRegen(state: EnergyState, now: number): EnergyState {
  if (state.energy >= MAX_ENERGY) {
    return { energy: MAX_ENERGY, energyUpdatedAt: state.energyUpdatedAt };
  }
  const minutesPassed = Math.floor((now - state.energyUpdatedAt) / 60_000);
  const ticks = Math.floor(minutesPassed / ENERGY_REGEN_MINUTES);
  if (ticks <= 0) {
    return state;
  }
  const newEnergy = Math.min(MAX_ENERGY, state.energy + ticks);
  if (newEnergy >= MAX_ENERGY) {
    return { energy: MAX_ENERGY, energyUpdatedAt: now };
  }
  const consumedMs = ticks * ENERGY_REGEN_MINUTES * 60_000;
  return { energy: newEnergy, energyUpdatedAt: state.energyUpdatedAt + consumedMs };
}

/** Retourne null si l'énergie disponible (après régén) est insuffisante. */
export function spendEnergy(state: EnergyState, now: number, amount = 1): EnergyState | null {
  const regenerated = applyRegen(state, now);
  if (regenerated.energy < amount) return null;
  return { energy: regenerated.energy - amount, energyUpdatedAt: regenerated.energyUpdatedAt };
}
