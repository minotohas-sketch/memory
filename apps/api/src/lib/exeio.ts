/**
 * Client exe.io — API confirmée par l'utilisateur directement depuis son
 * dashboard (leur doc n'est pas publique/indexée). Un seul endpoint : créer
 * un lien raccourci. Pas de format JSON typé officiel documenté au-delà de
 * {status, shortenedUrl} / {status, message} — on reste défensif sur la
 * lecture de la réponse.
 */

const EXEIO_API_BASE = "https://exe.io/api";

export interface ExeioResult {
  ok: boolean;
  shortUrl?: string;
  errorMessage?: string;
}

interface ExeioRawResponse {
  status?: string;
  shortenedUrl?: string;
  message?: string;
}

export async function createExeioShortLink(apiToken: string, destinationUrl: string): Promise<ExeioResult> {
  const params = new URLSearchParams({
    api: apiToken,
    url: destinationUrl,
    format: "text",
  });

  const res = await fetch(`${EXEIO_API_BASE}?${params.toString()}`);
  const text = (await res.text()).trim();

  // format=text renvoie directement le lien en clair (rien du tout en cas
  // d'erreur, d'après leur doc) — plus simple et plus robuste à parser qu'un
  // JSON dont la forme exacte des erreurs n'est pas garantie.
  if (text.startsWith("http")) {
    return { ok: true, shortUrl: text };
  }

  // Repli JSON au cas où leur réponse texte échoue silencieusement mais
  // renvoie quand même un corps exploitable.
  try {
    const data = JSON.parse(text) as ExeioRawResponse;
    if (data.status === "success" && data.shortenedUrl) {
      return { ok: true, shortUrl: data.shortenedUrl };
    }
    return { ok: false, errorMessage: data.message ?? "unknown_error" };
  } catch {
    return { ok: false, errorMessage: text || "empty_response" };
  }
}
