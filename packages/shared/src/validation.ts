// Format TRC20 (Tron) : préfixe "T" + 33 caractères base58 (34 au total).
// Validation de FORME uniquement — la vérification "est-ce vraiment lié à un
// compte FaucetPay" reste faite par leur API checkAddress (apps/api/src/lib/faucetpay.ts),
// ceci ne sert qu'à rejeter les entrées absurdes avant même cet appel réseau.
const TRC20_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;

export function isValidTrc20Address(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  if (CONTROL_CHARS_REGEX.test(trimmed)) return false;
  return TRC20_ADDRESS_REGEX.test(trimmed);
}
