export function isValidFaucetPayEmail(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false; // RFC 5321 max length
  
  // Regex simple pour email
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Supprimer les caractères de contrôle
  // eslint-disable-next-line no-control-regex
  const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;
  if (CONTROL_CHARS_REGEX.test(trimmed)) return false;
  
  return EMAIL_REGEX.test(trimmed);
}