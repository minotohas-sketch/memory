/**
 * Rate limiter à fenêtre fixe basé sur KV. Approximatif et non-atomique par
 * nature (KV n'a pas d'incrément atomique natif, contrairement à un Durable
 * Object) — deux requêtes concurrentes au même moment peuvent toutes les deux
 * lire le même compteur avant d'écrire, donc la limite peut être dépassée de
 * quelques requêtes dans le pire cas. Largement suffisant comme dissuasion
 * pour les volumes de ce projet ; pas conçu pour résister à un attaquant
 * déterminé avec beaucoup de requêtes parallèles (un Durable Object serait
 * la vraie réponse à ce niveau-là, mais c'est disproportionné ici).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `ratelimit:${identifier}:${bucket}`;

  const current = await kv.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;

  if (count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(key, String(count + 1), { expirationTtl: windowSeconds + 5 });
  return { allowed: true, remaining: maxRequests - count - 1 };
}
