// Client minimal de l'API officielle Brawl Stars (via le proxy RoyaleAPI).
// La clé n'est lue que depuis la variable d'environnement et n'est jamais affichée.

export const API_BASE = process.env.BS_API_BASE || 'https://bsproxy.royaleapi.dev/v1';

export class ApiError extends Error {
  constructor(message, { fatal = false, retriable = false } = {}) {
    super(message);
    this.fatal = fatal;         // arrête toute la synchro (clé ou IP refusée)
    this.retriable = retriable; // on peut réessayer
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function bsGet(path, { attempts = 3, timeoutMs = 15000 } = {}) {
  const key = process.env.BRAWL_STARS_API_KEY;
  if (!key) throw new ApiError('BRAWL_STARS_API_KEY manquante', { fatal: true });
  let last;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE + path, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      const body = (await res.text()).slice(0, 200);
      if (res.status === 401 || res.status === 403) {
        throw new ApiError(
          `HTTP ${res.status} : clé invalide ou IP non autorisée (vérifie que l'IP du proxy est bien sur la clé). ${body}`,
          { fatal: true }
        );
      }
      if (res.status === 404) throw new ApiError(`HTTP 404 : introuvable (${path}) ${body}`);
      if (res.status === 429 || res.status >= 500) {
        throw new ApiError(`HTTP ${res.status} temporaire ${body}`, { retriable: true });
      }
      throw new ApiError(`HTTP ${res.status} ${body}`);
    } catch (e) {
      last = e instanceof ApiError ? e : new ApiError(`Réseau/timeout : ${e.message}`, { retriable: true });
      if (!last.retriable || i === attempts) break;
      await sleep(2000 * i * i); // 2 s, 8 s, ...
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

export const encTag = (tag) => encodeURIComponent(tag); // '#ABC' -> '%23ABC'
